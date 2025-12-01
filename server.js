import express from 'express';
import { NodeSSH } from 'node-ssh';
import axios from 'axios';
import https from 'https';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

let LAST_SENSORS = null;
const sleep = (ms) => new Promise(res => setTimeout(res, ms));
let FAN_CONTROL_LOCK = false;
let FAN_LAST_AT = 0;
const FAN_WRITE_COOLDOWN_MS = Number(process.env.FAN_WRITE_COOLDOWN_MS || 60000);
const FAN_MIN_DELTA_PERCENT = Number(process.env.FAN_MIN_DELTA_PERCENT || 10);
const FAN_CMD_SLEEP_MS = Number(process.env.FAN_CMD_SLEEP_MS || 500);

const DATA_DIR = path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.jsonl');
const HISTORY_ARCHIVE = path.join(DATA_DIR, 'history.archive.gz');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const APP_LOG_FILE = path.join(DATA_DIR, 'app.log');

const compactHistoryIfNeeded = () => {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(HISTORY_FILE)) return;
    const stat = fs.statSync(HISTORY_FILE);
    if (stat.size < 10 * 1024 * 1024) return;
    const content = fs.readFileSync(HISTORY_FILE, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const now = Date.now();
    const older = [];
    const recent = [];
    for (const line of lines) {
      try {
        const j = JSON.parse(line);
        const ts = Date.parse(j.ts);
        if (!isNaN(ts) && (now - ts) > (30 * 24 * 60 * 60 * 1000)) older.push(line);
        else recent.push(line);
      } catch { recent.push(line); }
    }
    if (older.length > 0) {
      const block = older.join('\n') + '\n';
      const gz = zlib.gzipSync(Buffer.from(block, 'utf-8'));
      fs.appendFileSync(HISTORY_ARCHIVE, gz);
      fs.writeFileSync(HISTORY_FILE, recent.join('\n') + (recent.length ? '\n' : ''));
    }
  } catch {}
};

const readJsonSafe = (file) => {
  try {
    if (!fs.existsSync(file)) return null;
    const content = fs.readFileSync(file, 'utf-8');
    return JSON.parse(content);
  } catch { return null; }
};

const writeJsonSafe = (file, obj) => {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(obj, null, 2));
    return true;
  } catch { return false; }
};

const getPersistedConfig = () => {
  const cfg = readJsonSafe(CONFIG_FILE);
  if (!cfg) return null;
  const host = String(cfg.host || '').trim();
  const username = String(cfg.username || '').trim();
  const password = String(cfg.password || '').trim();
  if (!host || !username || !password) return null;
  return { host, username, password };
};

const getFanModePersisted = () => {
  try {
    const cfg = readJsonSafe(CONFIG_FILE) || {};
    const m = String(cfg.fanMode || '').toLowerCase();
    if (m === 'manual' || m === 'auto') return m;
    return 'auto';
  } catch { return 'auto'; }
};

const setFanModePersisted = (mode) => {
  try {
    const cfg = readJsonSafe(CONFIG_FILE) || {};
    cfg.fanMode = String(mode).toLowerCase() === 'manual' ? 'manual' : 'auto';
    writeJsonSafe(CONFIG_FILE, cfg);
  } catch {}
};

// --- Default Fans on Startup/Restart ---
const getIloConfigFromEnv = () => {
  const persisted = getPersistedConfig();
  if (persisted) return persisted;
  return {
    host: (process.env.ILO_HOST || '192.168.15.103').trim(),
    username: (process.env.ILO_USERNAME || process.env.ILO_USER || 'fan').trim(),
    password: (process.env.ILO_PASSWORD || process.env.ILO_PASS || '20134679').trim()
  };
};

const setDefaultFans = async (percent = 15) => {
  if (FAN_CONTROL_LOCK) return;
  const now = Date.now();
  if (now - FAN_LAST_AT < 1500) return;
  FAN_CONTROL_LOCK = true;
  FAN_LAST_AT = now;
  const config = getIloConfigFromEnv();
  const ssh = new NodeSSH();
  try {
    await ssh.connect({ host: config.host, username: config.username, password: config.password, readyTimeout: 12000, algorithms: { kex: ['diffie-hellman-group14-sha1','diffie-hellman-group1-sha1'], cipher: ['aes128-cbc','3des-cbc','aes256-cbc'], serverHostKey: ['ssh-rsa','ssh-dss'] } });
    const pwmValue = Math.ceil((percent / 100) * 255);
    const commands = [];
    let fanCount = 6;
    try {
      const s = await readSensorsUnified(config);
      const cnt = Math.max(1, Math.min(8, Object.keys((s&&s.fans)||{}).length || 0));
      if (cnt > 0) fanCount = cnt;
    } catch {}
    const idxSet = new Set();
    for (let j = 0; j < fanCount; j++) idxSet.add(j);
    for (let j = 1; j <= fanCount; j++) idxSet.add(j);
    for (const j of Array.from(idxSet)) { commands.push(`fan p ${j} min ${pwmValue}`); commands.push(`fan p ${j} max ${pwmValue}`); }
    for (const cmd of commands) { try { await ssh.execCommand(cmd); } catch {} await sleep(150); }
    ssh.dispose();
    console.log(`[Startup] Fans default set to ${percent}%`);
  } catch (e) {
    console.log('[Startup] Failed to set default fans:', e?.message);
  } finally {
    FAN_CONTROL_LOCK = false;
  }
};

// --- Configuration Helper ---
const getIloConfig = (req) => {
  const headers = req ? req.headers : {};
  const fromHeaders = {
    host: String(headers['x-ilo-host'] || '').trim(),
    username: String(headers['x-ilo-username'] || '').trim(),
    password: String(headers['x-ilo-password'] || '').trim()
  };
  if (fromHeaders.host && fromHeaders.username && fromHeaders.password) return fromHeaders;
  const persisted = getPersistedConfig();
  if (persisted) return persisted;
  return {
    host: (process.env.ILO_HOST || '192.168.15.103').trim(),
    username: (process.env.ILO_USERNAME || process.env.ILO_USER || 'fan').trim(),
    password: (process.env.ILO_PASSWORD || process.env.ILO_PASS || '20134679').trim()
  };
};


// --- SSH Helper for Sensors ---
const getSensorsViaSSH = async (config) => {
  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: config.host,
      username: config.username,
      password: config.password,
      readyTimeout: 8000,
      algorithms: {
        kex: ['diffie-hellman-group14-sha1', 'diffie-hellman-group1-sha1'],
        cipher: ['aes128-cbc', '3des-cbc', 'aes256-cbc'],
        serverHostKey: ['ssh-rsa', 'ssh-dss']
      }
    });

    // "show /system1/sensor" is the standard CLP command that returns the table
    const output = await ssh.execCommand('show /system1/sensor');
    ssh.dispose();

    const result = {
      fans: {},
      temps: { cpu1: 0, cpu2: 0, ambient: 0 }
    };

    // Parse Output - Robust Pipe Splitter
    // Expected Format:
    // 01-Inlet Ambient | 24 | degrees C | ...
    // 02-CPU 1         | 40 | degrees C | ...
    // 10-Fan 1         | 34 | %         | ...
    const lines = output.stdout.split('\n');
    
    lines.forEach(line => {
      // Skip empty lines or headers
      if (!line.includes('|')) return;

      const parts = line.split('|').map(s => s.trim());
      if (parts.length < 2) return;

      const rawName = parts[0]; // e.g. "02-CPU 1" or "Fan 1"
      const rawValue = parts[1]; // e.g. "40" or "57.000"

      // Parse Value
      const value = parseFloat(rawValue);
      if (isNaN(value)) return;

      // Parse Name (Normalize)
      const name = rawName.toLowerCase();

      // Logic for Fans
      if (name.includes('fan')) {
        // Clean up name: "10-Fan 1" -> "Fan 1"
        // Remove numeric prefix if present
        let cleanName = rawName;
        if (rawName.match(/^\d+-/)) {
            cleanName = rawName.split('-').slice(1).join('-').trim();
        }
        result.fans[cleanName] = value;
      }
      // Logic for Temperatures
      else if (name.includes('cpu')) {
        if (name.includes('cpu 1') || name.includes('cpu1')) result.temps.cpu1 = value;
        if (name.includes('cpu 2') || name.includes('cpu2')) result.temps.cpu2 = value;
      }
      else if (name.includes('ambient') || name.includes('inlet')) {
        result.temps.ambient = value;
      }
    });

    console.log(`[SSH] Read Success: ${Object.keys(result.fans).length} fans, CPU1: ${result.temps.cpu1}°C`);
    return result;

  } catch (error) {
    console.error('[SSH Read Error]', error.message);
    throw error;
  }
};

// --- Redfish Helper for Thermal ---
const getThermalViaRedfish = async (config) => {
  const agent = new https.Agent({ rejectUnauthorized: false });
  const url = `https://${config.host}/redfish/v1/chassis/1/Thermal/`;
  try {
    const resp = await axios.get(url, {
      auth: { username: config.username, password: config.password },
      httpsAgent: agent,
      timeout: 3000
    });
      const j = resp.data || {};
      const tempsArr = Array.isArray(j.Temperatures) ? j.Temperatures : [];
      const fansArr = Array.isArray(j.Fans) ? j.Fans : [];

      const result = { fans: {}, temps: { cpu1: 0, cpu2: 0, ambient: 0 }, other: {} };
      tempsArr.forEach(t => {
        const name = String(t?.Name || '').toLowerCase();
        const val = Number(t?.ReadingCelsius || 0);
        if (!val) return;
        if (name.includes('cpu 1') || name.includes('cpu1') || name.includes('package 1')) result.temps.cpu1 = val;
        else if (name.includes('cpu 2') || name.includes('cpu2') || name.includes('package 2')) result.temps.cpu2 = val;
        else if (name.includes('inlet')) { result.temps.ambient = val; result.other.inlet = val; }
        else if (name.includes('ambient')) result.temps.ambient = val;
        // additional sensors mapping
        else if (name.includes('chipset')) result.other.chipset = val;
        else if (name.includes('battery')) result.other.batteryZone = val;
        else if (name.includes('entrada')) result.other.inlet = val;
        else if (name.includes('memory') || name.includes('dimm')) result.other.memory = val;
        else if (name.includes('vr p2') || name.includes('vrm 2') || name.includes('vrm p2') || name.includes('cpu vr 2')) result.other.vr_p2 = val;
        else if (name.includes('vr p1') || name.includes('vrm 1') || name.includes('vrm p1') || name.includes('cpu vr 1')) result.other.vr_p1 = val;
        else if (name.includes('power supply 2') || name.includes('psu 2') || name.includes('p/s 2') || name.includes('ps 2')) result.other.ps2 = val;
        else if (name.includes('system board') || name.includes('motherboard')) result.other.systemBoard = val;
        else if (name.includes('exhaust')) result.other.sysExhaust = val;
        else if (name.includes('hd controller') || name.includes('hdd controller')) result.other.hdController = val;
      });
      console.log('Additional sensors:', result.other);

      const fanObjs = fansArr.map((f, idxRF) => {
        const units = String(f?.ReadingUnits || '').toLowerCase();
        const reading = Number((f?.CurrentReading ?? f?.Reading) || 0);
        const oem = f?.Oem || f?.OEM || {};
        const maxRange = Number(f?.ReadingRangeMax || 0);
        const name = `Fan ${idxRF + 1}`;
        return { name, units, reading, oem, maxRange };
      });
      console.log('Fans raw count:', fanObjs.length, 'names:', fanObjs.map(f=>f.name));
      const possibleMaxes = fanObjs.map(x => {
        const hpe = x.oem?.Hpe || x.oem?.HPE || {};
        return Number(hpe?.MaximumRPM || hpe?.MaxRPM || hpe?.ReadingRangeMax || 0);
      }).filter(m => m > 0);
      let globalMaxRpm = Math.max(...possibleMaxes, 0);
      if (!globalMaxRpm) {
        globalMaxRpm = Math.max(...fanObjs.map(x => (x.units.includes('rpm') ? x.reading : 0)), 0) || 2000;
      }
      fanObjs.forEach(obj => {
        const hpe = obj.oem?.Hpe || obj.oem?.HPE || {};
        const percentRaw = hpe?.DutyCycle ?? hpe?.DutyPercent ?? hpe?.Value ?? hpe?.Percent;
        let percent = Number(percentRaw || 0);
        if (!percent && obj.units.includes('percent')) percent = obj.reading;
        if (!percent && obj.reading > 0 && obj.reading <= 100) percent = obj.reading;
        if (!percent && (obj.units.includes('rpm') || obj.reading > 100)) {
          const maxRpm = Number(hpe?.MaximumRPM || hpe?.MaxRPM || obj.maxRange || globalMaxRpm || 2000);
          percent = Math.round((obj.reading / maxRpm) * 100);
          if (percent < 0) percent = 0;
        }
        result.fans[obj.name] = Math.max(0, Math.min(100, percent || 0));
      });
      console.log('Fans mapped keys:', Object.keys(result.fans));
      if (!result.fans || Object.keys(result.fans).length === 0) {
        if (LAST_SENSORS && LAST_SENSORS.fans) {
          result.fans = { ...LAST_SENSORS.fans };
        }
      }

    return result;
  } catch (error) {
    throw new Error(error?.message || 'Redfish read failed');
  }
};

// --- Redfish Helper for System Info ---
const getSystemInfoViaRedfish = async (config) => {
  const agent = new https.Agent({ rejectUnauthorized: false });
  const url = `https://${config.host}/redfish/v1/Systems/1`;
  try {
    const resp = await axios.get(url, {
      auth: { username: config.username, password: config.password },
      httpsAgent: agent,
      timeout: 3000
    });
    const d = resp.data || {};
    let cpuModel = d?.ProcessorSummary?.Model || '';
    if (!cpuModel && Array.isArray(d?.Processors)) cpuModel = d.Processors[0]?.Model || d.Processors[0]?.ProcessorType || '';
    let memGiB = d?.MemorySummary?.TotalSystemMemoryGiB || 0;
    if (!memGiB && Array.isArray(d?.Memory)) memGiB = d.Memory.reduce((acc,m)=>acc+Number(m?.CapacityMiB||0),0)/1024;
    if (!memGiB && Number(d?.MemoryMB)>0) memGiB = Number(d.MemoryMB)/1024;
    return { cpuModel: String(cpuModel||'').trim(), memoryGiB: Number(memGiB||0) };
  } catch (e) {
    try {
      const ssh = new NodeSSH();
      await ssh.connect({ host: config.host, username: config.username, password: config.password, readyTimeout: 8000, algorithms: { kex: ['diffie-hellman-group14-sha1','diffie-hellman-group1-sha1'], cipher: ['aes128-cbc','3des-cbc','aes256-cbc'], serverHostKey: ['ssh-rsa','ssh-dss'] } });
      const out = await ssh.execCommand('show /system1');
      ssh.dispose();
      const lines = String(out.stdout||'').split('\n');
      let cpuModel = '';
      let memGiB = 0;
      for (const ln of lines) {
        const l = ln.toLowerCase();
        if (!cpuModel && (l.includes('processor') || l.includes('cpu')) && ln.includes(':')) cpuModel = ln.split(':').slice(1).join(':').trim();
        if (!memGiB && (l.includes('memory installed') || l.includes('installed memory'))) {
          const m = ln.match(/([0-9]+\.?[0-9]*)\s*gb/i) || ln.match(/([0-9]+)\s*mb/i);
          if (m) memGiB = m[2] ? Number(m[1])/1024 : Number(m[1]);
        }
      }
      return { cpuModel: cpuModel.trim(), memoryGiB: Number(memGiB||0) };
    } catch {
      return { cpuModel: '', memoryGiB: 0 };
    }
  }
};

// --- API ENDPOINTS ---

const readSensorsUnified = async (config) => {
  try {
    const rf = await getThermalViaRedfish(config);
    const allZero = Object.values(rf.fans || {}).length > 0 && Object.values(rf.fans || {}).every(v => Number(v) === 0);
    if (allZero) {
      try {
        const ssh = await getSensorsViaSSH(config);
        if (ssh && ssh.fans && Object.keys(ssh.fans).length > 0) {
          rf.fans = ssh.fans;
        }
      } catch {}
    }
    LAST_SENSORS = rf;
    return rf;
  } catch (e) {
    try {
      const ssh = await getSensorsViaSSH(config);
      const merged = { fans: ssh.fans || {}, temps: ssh.temps || { cpu1: 0, cpu2: 0, ambient: 0 }, other: {} };
      LAST_SENSORS = merged;
      return merged;
    } catch (e2) {
      if (LAST_SENSORS) return LAST_SENSORS;
      return { fans: {}, temps: { cpu1: 0, cpu2: 0, ambient: 0 }, other: {} };
    }
  }
};

// 1. Get All Sensor Data (Fans + Temp)
// Unified endpoint is faster and prevents double SSH connections
app.get('/api/sensors', async (req, res) => {
    try {
        const config = getIloConfig(req);
        const data = await readSensorsUnified(config);
        try {
          const dir = DATA_DIR;
          const file = HISTORY_FILE;
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          const entry = {
            ts: new Date().toISOString(),
            cpu1: Number(data.temps?.cpu1 || 0),
            cpu2: Number(data.temps?.cpu2 || 0),
            ambient: Number(data.temps?.ambient || 0),
            chipset: Number(data.other?.chipset || 0),
            batteryZone: Number(data.other?.batteryZone || 0),
            inlet: Number(data.other?.inlet || 0),
            memory: Number(data.other?.memory || 0),
            vr_p2: Number(data.other?.vr_p2 || 0),
            vr_p1: Number(data.other?.vr_p1 || 0),
            ps2: Number(data.other?.ps2 || 0),
            systemBoard: Number(data.other?.systemBoard || 0),
            sysExhaust: Number(data.other?.sysExhaust || 0),
            hdController: Number(data.other?.hdController || 0)
          };
          fs.appendFileSync(file, JSON.stringify(entry) + '\n');
          compactHistoryIfNeeded();
        } catch (e) {}
        res.json(data);
    } catch (error) {
        res.json(LAST_SENSORS || { fans: {}, temps: { cpu1: 0, cpu2: 0, ambient: 0 }, other: {} });
    }
});

// Backward compatibility aliases
app.get('/api/fans', async (req, res) => {
    try {
        const config = getIloConfig(req);
        const data = await readSensorsUnified(config);
        res.json(data.fans);
    } catch (error) {
        res.json((LAST_SENSORS && LAST_SENSORS.fans) || {});
    }
});

app.get('/api/fan/mode', (req, res) => {
  try {
    const mode = getFanModePersisted();
    return res.json({ mode });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read mode' });
  }
});

app.post('/api/fan/manual', (req, res) => {
  try {
    setFanModePersisted('manual');
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to set manual mode' });
  }
});

app.post('/api/fan/mode', (req, res) => {
  try {
    const mode = String((req.body||{}).mode || '').toLowerCase();
    if (mode !== 'auto' && mode !== 'manual') return res.status(400).json({ error: 'invalid mode' });
    setFanModePersisted(mode);
    return res.json({ success: true, mode });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to set mode' });
  }
});

app.get('/api/temperature', async (req, res) => {
    try {
        const config = getIloConfig(req);
        const data = await readSensorsUnified(config);
        res.json(data.temps);
    } catch (error) {
        res.json((LAST_SENSORS && LAST_SENSORS.temps) || { cpu1: 0, cpu2: 0, ambient: 0 });
    }
});

// Historical data query
app.get('/api/history', async (req, res) => {
  try {
    const period = String(req.query.period || '1h');
    const now = Date.now();
    const ranges = {
      '1h': 60*60*1000,
      '24h': 24*60*60*1000,
      '7d': 7*24*60*60*1000,
      '1m': 30*24*60*60*1000,
      '1y': 365*24*60*60*1000,
      '5y': 5*365*24*60*60*1000,
    };
    const range = ranges[period] || ranges['1h'];
    const file = HISTORY_FILE;
    const result = [];
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const j = JSON.parse(line);
          const ts = Date.parse(j.ts);
          if (isNaN(ts)) continue;
          if (now - ts <= range) {
            result.push({
              time: new Date(ts).toISOString(),
              cpu1: Number(j.cpu1 || 0),
              cpu2: Number(j.cpu2 || 0),
              ambient: Number(j.ambient || 0),
              chipset: Number(j.chipset || 0),
              batteryZone: Number(j.batteryZone || 0),
              inlet: Number(j.inlet || 0),
              memory: Number(j.memory || 0),
              vr_p2: Number(j.vr_p2 || 0),
              vr_p1: Number(j.vr_p1 || 0),
              ps2: Number(j.ps2 || 0),
              systemBoard: Number(j.systemBoard || 0),
              sysExhaust: Number(j.sysExhaust || 0),
              hdController: Number(j.hdController || 0),
            });
          }
        } catch {}
      }
    }
    if (range > (30*24*60*60*1000) && fs.existsSync(HISTORY_ARCHIVE)) {
      try {
        const gzBuf = fs.readFileSync(HISTORY_ARCHIVE);
        const plain = zlib.gunzipSync(gzBuf).toString('utf-8');
        const lines = plain.split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const j = JSON.parse(line);
            const ts = Date.parse(j.ts);
            if (isNaN(ts)) continue;
            if (now - ts <= range) {
              result.push({
                time: new Date(ts).toISOString(),
                cpu1: Number(j.cpu1 || 0),
                cpu2: Number(j.cpu2 || 0),
                ambient: Number(j.ambient || 0),
                chipset: Number(j.chipset || 0),
                batteryZone: Number(j.batteryZone || 0),
                inlet: Number(j.inlet || 0),
                memory: Number(j.memory || 0),
                vr_p2: Number(j.vr_p2 || 0),
                vr_p1: Number(j.vr_p1 || 0),
                ps2: Number(j.ps2 || 0),
                systemBoard: Number(j.systemBoard || 0),
                sysExhaust: Number(j.sysExhaust || 0),
                hdController: Number(j.hdController || 0),
              });
            }
          } catch {}
        }
      } catch {}
    }
    res.json(result);
  } catch (e) {
    res.json([]);
  }
});

app.get('/api/history/size', (req, res) => {
  try {
    const files = [];
    const add = (name, fp) => { if (fs.existsSync(fp)) { const st = fs.statSync(fp); files.push({ name, bytes: st.size }); } };
    add('history.jsonl', HISTORY_FILE);
    add('history.archive.gz', HISTORY_ARCHIVE);
    const total = files.reduce((a,b)=>a+b.bytes,0);
    res.json({ totalBytes: total, files });
  } catch (e) { res.status(500).json({ error: 'Failed to stat history' }); }
});

app.post('/api/history/clear', (req, res) => {
  try {
    if (fs.existsSync(HISTORY_FILE)) fs.rmSync(HISTORY_FILE, { force: true });
    if (fs.existsSync(HISTORY_ARCHIVE)) fs.rmSync(HISTORY_ARCHIVE, { force: true });
    LAST_SENSORS = null;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to clear history' }); }
});


// 2. Control Fan (SSH)
app.post('/api/fan', async (req, res) => {
  const { speed } = req.body;
  const config = getIloConfig(req);

  if (speed === undefined || speed < 5 || speed > 100) {
    return res.status(400).json({ error: 'Invalid speed range (5-100)' });
  }

  const now = Date.now();
  if (FAN_CONTROL_LOCK) {
    const start = Date.now();
    while (FAN_CONTROL_LOCK && (Date.now() - start) < 5000) { await sleep(100); }
    if (FAN_CONTROL_LOCK) return res.status(429).json({ error: 'Controle de fans em andamento' });
  }
  FAN_CONTROL_LOCK = true;
  FAN_LAST_AT = now;

  let currentFans = {};
  try { const s = await readSensorsUnified(config); currentFans = s?.fans || {}; } catch {}
  try {
    const vals = Object.values(currentFans).map(v => Number(v)).filter(v => Number.isFinite(v));
    if (vals.length > 0) {
      const deltas = vals.map(v => Math.abs(speed - v));
      const needWrite = deltas.some(d => d >= FAN_MIN_DELTA_PERCENT);
      if (!needWrite) {
        FAN_CONTROL_LOCK = false;
        setFanModePersisted('manual');
        return res.json({ success: true, speed, readback: currentFans, skipped: true });
      }
    }
  } catch {}

  const ssh = new NodeSSH();
  try {
    console.log(`[SSH Control] Connecting to ${config.host}...`);
    await ssh.connect({
      host: config.host,
      username: config.username,
      password: config.password,
      readyTimeout: 15000,
      algorithms: {
        kex: ['diffie-hellman-group14-sha1', 'diffie-hellman-group1-sha1'],
        cipher: ['aes128-cbc', '3des-cbc', 'aes256-cbc'],
        serverHostKey: ['ssh-rsa', 'ssh-dss']
      }
    });

    // Logic for iLO 4 Unlock: fan p <index> max <0-255>
    const pwmValue = Math.ceil((speed / 100) * 255);
    console.log(`[SSH Control] Setting fans to ${speed}% (PWM: ${pwmValue})`);

    const commands = [];
    commands.push(`fan p 0 min ${pwmValue}`);
    commands.push(`fan p 0 max ${pwmValue}`);
    for (let j = 1; j <= 6; j++) { commands.push(`fan p ${j} min ${pwmValue}`); commands.push(`fan p ${j} max ${pwmValue}`); }
    let failed = 0;
    for (const cmd of commands) {
        try {
          const out = await ssh.execCommand(cmd);
          const msg = (out.stdout || out.stderr || '').toLowerCase();
          console.log('[SSH Control]', cmd, '=>', out.stdout?.trim() || out.stderr?.trim() || out.code);
          if (msg.includes('command processing failed') || msg.includes('invalid option')) failed++;
        } catch (e) { console.log('[SSH Control Error]', cmd, e?.message); failed++; }
        await sleep(FAN_CMD_SLEEP_MS);
    }
    await sleep(800);
    let readback = {};
    try { const rb = await readSensorsUnified(config); readback = rb?.fans || {}; } catch {}
    // Fallback específico: se 'Fan 1' não atingiu, tenta idx 0 com pausas extras
    try {
      const f1 = Number((readback && readback['Fan 1']) || (readback && readback['F1']) || 0);
      if (Number.isFinite(f1) && Math.abs(f1 - Number(speed)) >= FAN_MIN_DELTA_PERCENT) {
        try { const a0 = await ssh.execCommand(`fan p 0 min ${pwmValue}`); } catch {}
        await sleep(FAN_CMD_SLEEP_MS * 2);
        try { const b0 = await ssh.execCommand(`fan p 0 max ${pwmValue}`); } catch {}
        await sleep(800);
        try { const rb2 = await readSensorsUnified(config); readback = rb2?.fans || readback; } catch {}
      }
    } catch {}
    ssh.dispose();
    if (failed > 0) {
      return res.status(409).json({ success: false, error: 'iLO não permite controle manual de fans via SSH', readback });
    }
    const uncontrolled = Object.entries(readback||{}).filter(([,v])=>Math.abs(Number(v||0)-Number(speed))>=FAN_MIN_DELTA_PERCENT).map(([k])=>k);
    setFanModePersisted('manual');
    res.json({ success: true, speed, readback, uncontrolled });

  } catch (error) {
    console.error('[SSH Control Error]', error.message);
    res.status(500).json({ error: error.message });
  } finally {
    FAN_CONTROL_LOCK = false;
  }
});

// Auto mode: release manual control (min 0 / max 255) for all fans
app.post('/api/fan/auto', async (req, res) => {
  const config = getIloConfig(req);
  const now = Date.now();
  if (FAN_CONTROL_LOCK) {
    const start = Date.now();
    while (FAN_CONTROL_LOCK && (Date.now() - start) < 5000) { await sleep(100); }
    if (FAN_CONTROL_LOCK) return res.status(429).json({ error: 'Controle de fans em andamento' });
  }
  FAN_CONTROL_LOCK = true;
  FAN_LAST_AT = now;
  const ssh = new NodeSSH();
  try {
    await ssh.connect({ host: config.host, username: config.username, password: config.password, readyTimeout: 15000, algorithms: { kex: ['diffie-hellman-group14-sha1', 'diffie-hellman-group1-sha1'], cipher: ['aes128-cbc', '3des-cbc', 'aes256-cbc'], serverHostKey: ['ssh-rsa', 'ssh-dss'] } });
    let successTargets = 0;
    // index 0 é opcional em alguns modelos; não tratar falha como fatal
    try { const a0 = await ssh.execCommand(`fan p 0 min 0`); } catch {}
    await sleep(FAN_CMD_SLEEP_MS);
    try { const b0 = await ssh.execCommand(`fan p 0 max 255`); } catch {}
    await sleep(FAN_CMD_SLEEP_MS);
    for (let j = 1; j <= 6; j++) {
      let ok = false;
      try { const a = await ssh.execCommand(`fan p ${j} min 0`); const m = (a.stdout||a.stderr||'').toLowerCase(); if (!m.includes('failed') && !m.includes('invalid')) ok = true; } catch {}
      await sleep(FAN_CMD_SLEEP_MS);
      try { const b = await ssh.execCommand(`fan p ${j} max 255`); const m = (b.stdout||b.stderr||'').toLowerCase(); if (!m.includes('failed') && !m.includes('invalid')) ok = true; } catch {}
      await sleep(FAN_CMD_SLEEP_MS);
      if (ok) successTargets++;
    }
    await sleep(800);
    let readback = {};
    try { const rb = await readSensorsUnified(config); readback = rb?.fans || {}; } catch {}
    ssh.dispose();
    if (successTargets === 0) return res.status(409).json({ success: false, error: 'iLO não liberou controle automático', readback });
    setFanModePersisted('auto');
    return res.json({ success: true, readback });
  } catch (e) {
    try { ssh.dispose(); } catch {}
    return res.status(500).json({ error: e?.message || 'falha no auto' });
  } finally { FAN_CONTROL_LOCK = false; }
});

app.post('/api/fan/:idx', async (req, res) => {
  const { idx } = req.params;
  const { speed } = req.body || {};
  const config = getIloConfig(req);
  const idxNum = Number(idx);
  if (!Number.isFinite(idxNum)) return res.status(400).json({ error: 'Invalid index' });
  if (speed === undefined || speed < 5 || speed > 100) return res.status(400).json({ error: 'Invalid speed range (5-100)' });
  const now = Date.now();
  if (FAN_CONTROL_LOCK) {
    const start = Date.now();
    while (FAN_CONTROL_LOCK && (Date.now() - start) < 5000) { await sleep(100); }
    if (FAN_CONTROL_LOCK) return res.status(429).json({ error: 'Controle de fans em andamento' });
  }
  FAN_CONTROL_LOCK = true;
  FAN_LAST_AT = now;
  const ssh = new NodeSSH();
  try {
    await ssh.connect({ host: config.host, username: config.username, password: config.password, readyTimeout: 15000, algorithms: { kex: ['diffie-hellman-group14-sha1', 'diffie-hellman-group1-sha1'], cipher: ['aes128-cbc', '3des-cbc', 'aes256-cbc'], serverHostKey: ['ssh-rsa', 'ssh-dss'] } });
    const pwmValue = Math.ceil((speed / 100) * 255);
    const targets = new Set();
    if (idxNum >= 0 && idxNum <= 5) targets.add(idxNum);
    if (idxNum >= 1 && idxNum <= 6) targets.add(idxNum);
    let failed = 0;
    for (const t of Array.from(targets)) {
      try { const a = await ssh.execCommand(`fan p ${t} min ${pwmValue}`); const msgA = (a.stdout || a.stderr || '').toLowerCase(); console.log('[SSH Control idx]', t, 'min', a.stdout?.trim() || a.stderr?.trim() || a.code); if (msgA.includes('command processing failed') || msgA.includes('invalid option')) failed++; } catch (e) { console.log('[SSH Control idx]', t, 'min error', e?.message); failed++; }
      await sleep(FAN_CMD_SLEEP_MS);
      try { const b = await ssh.execCommand(`fan p ${t} max ${pwmValue}`); const msgB = (b.stdout || b.stderr || '').toLowerCase(); console.log('[SSH Control idx]', t, 'max', b.stdout?.trim() || b.stderr?.trim() || b.code); if (msgB.includes('command processing failed') || msgB.includes('invalid option')) failed++; } catch (e) { console.log('[SSH Control idx]', t, 'max error', e?.message); failed++; }
      await sleep(FAN_CMD_SLEEP_MS);
    }
    await sleep(800);
    let readback = {};
    try { const rb = await readSensorsUnified(config); readback = rb?.fans || {}; } catch {}
    ssh.dispose();
    if (failed > 0) {
      return res.status(409).json({ success: false, error: 'iLO não permite controle manual de fans via SSH', idx: idxNum, speed, readback });
    }
    setFanModePersisted('manual');
    res.json({ success: true, idx: idxNum, speed, readback });
  } catch (error) {
    try { ssh.dispose(); } catch {}
    res.status(500).json({ error: error.message });
  } finally {
    FAN_CONTROL_LOCK = false;
  }
});

// [reordered]: '/api/fan/auto' is defined above to avoid '/api/fan/:idx' capture

app.get('/api/fan/cooldown', (req, res) => {
  try {
    const now = Date.now();
    const remaining = Math.max(0, FAN_WRITE_COOLDOWN_MS - (now - FAN_LAST_AT));
    return res.json({ cooldownMs: FAN_WRITE_COOLDOWN_MS, remainingMs: remaining });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read cooldown' });
  }
});

// Auto mode: release manual control (min 0 / max 255) for all fans
// [moved up] auto route defined above to avoid matching '/api/fan/:idx'

// History size and clear

// Backup and Restore (JSON bundle)
app.get('/api/backup', (req, res) => {
  try {
    const bundle = {
      version: 1,
      createdAt: new Date().toISOString(),
      files: {
        'config.json': readJsonSafe(CONFIG_FILE),
        'auth.json': readJsonSafe(AUTH_FILE)
      }
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="ilo-backup-${Date.now()}.json"`);
    res.send(JSON.stringify(bundle, null, 2));
  } catch (e) { res.status(500).json({ error: 'Failed to create backup' }); }
});

app.post('/api/restore', (req, res) => {
  try {
    const { files } = req.body || {};
    if (!files || typeof files !== 'object') return res.status(400).json({ error: 'Backup inválido' });
    if (files['config.json']) writeJsonSafe(CONFIG_FILE, files['config.json']);
    if (files['auth.json']) writeJsonSafe(AUTH_FILE, files['auth.json']);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to restore' }); }
});

// --- Simple System Auth State (persist in memory) ---
let SYSTEM_USER = process.env.SYS_USER || 'admin';
let SYSTEM_PASS = process.env.SYS_PASS || 'admin';
try {
  const a = readJsonSafe(AUTH_FILE);
  if (a) {
    if (a.user) SYSTEM_USER = String(a.user);
    if (a.pass) SYSTEM_PASS = String(a.pass);
  }
} catch {}

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === SYSTEM_USER && password === SYSTEM_PASS) {
    return res.json({ success: true, mustChangePassword: SYSTEM_PASS === 'admin' });
  }
  return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
});

app.post('/api/auth/change-password', (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 4) {
    return res.status(400).json({ error: 'Senha inválida' });
  }
  if (oldPassword !== SYSTEM_PASS) {
    return res.status(403).json({ error: 'Senha atual incorreta' });
  }
  SYSTEM_PASS = String(newPassword);
  writeJsonSafe(AUTH_FILE, { user: SYSTEM_USER, pass: SYSTEM_PASS });
  return res.json({ success: true });
});

app.post('/api/auth/reset', (req, res) => {
  try {
    SYSTEM_USER = 'admin';
    SYSTEM_PASS = 'admin';
    try { if (fs.existsSync(AUTH_FILE)) fs.rmSync(AUTH_FILE, { force: true }); } catch {}
    if (fs.existsSync(HISTORY_FILE)) fs.rmSync(HISTORY_FILE, { force: true });
    if (fs.existsSync(HISTORY_ARCHIVE)) fs.rmSync(HISTORY_ARCHIVE, { force: true });
    LAST_SENSORS = null;
    res.json({ success: true });
    setDefaultFans(15);
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to reset' });
  }
});

app.get('/api/auth/info', (req, res) => {
  return res.json({ mustChangePassword: SYSTEM_PASS === 'admin' });
});

// SPA Fallback

// 1b. Redfish Thermal (fallback / alternative)
app.get('/api/redfish/thermal', async (req, res) => {
  try {
    const config = getIloConfig(req);
    const data = await getThermalViaRedfish(config);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read redfish thermal', details: error.message });
  }
});

app.get('/api/system/info', async (req, res) => {
  try {
    const cfg = getIloConfig(req);
    const info = await getSystemInfoViaRedfish(cfg);
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch system info' });
  }
});

app.get('/api/config', (req, res) => {
  try {
    const cfg = getPersistedConfig();
    if (cfg) return res.json(cfg);
    const envCfg = getIloConfigFromEnv();
    return res.json(envCfg);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read config' });
  }
});

app.post('/api/config', (req, res) => {
  try {
    const { host, username, password } = req.body || {};
    const h = String(host || '').trim();
    const u = String(username || '').trim();
    const p = String(password || '').trim();
    if (!h || !u || !p) return res.status(400).json({ error: 'Config inválida' });
    const ok = writeJsonSafe(CONFIG_FILE, { host: h, username: u, password: p });
    if (!ok) return res.status(500).json({ error: 'Falha ao salvar' });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Falha ao salvar' });
  }
});

app.get('/api/app-log', (req, res) => {
  try {
    if (!fs.existsSync(APP_LOG_FILE)) return res.json([]);
    const content = fs.readFileSync(APP_LOG_FILE, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const tail = lines.slice(Math.max(0, lines.length - 100));
    return res.json(tail.map(l => { try { return JSON.parse(l); } catch { return { ts: '', type: 'info', message: l }; } }));
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read app log' });
  }
});

app.post('/api/app-log', (req, res) => {
  try {
    const { message, type } = req.body || {};
    const obj = { ts: new Date().toISOString(), type: String(type||'info'), message: String(message||'') };
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(APP_LOG_FILE, JSON.stringify(obj) + '\n');
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to write app log' });
  }
});

app.get('/debug/thermal-raw', async (req, res) => {
  try {
    const config = getIloConfig(req);
    const agent = new https.Agent({ rejectUnauthorized: false });
    const url = `https://${config.host}/redfish/v1/chassis/1/Thermal/`;
    const resp = await axios.get(url, { auth: { username: config.username, password: config.password }, httpsAgent: agent, timeout: 8000 });
    const j = resp.data || {};
    const tempsArr = Array.isArray(j.Temperatures) ? j.Temperatures : [];
    const fansArr = Array.isArray(j.Fans) ? j.Fans : [];
    const out = {
      Temperatures: tempsArr.map(t => ({ name: t?.Name || null, value: t?.ReadingCelsius ?? null })),
      Fans: fansArr.map(f => ({ name: (f?.FanName || f?.Name || f?.MemberId || null), speed: (f?.CurrentReading ?? f?.Reading ?? null) }))
    };
    res.json(out);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch thermal raw', details: error.message });
  }
});

app.get('/debug/fans-full', async (req, res) => {
  try {
    const config = getIloConfig(req);
    const agent = new https.Agent({ rejectUnauthorized: false });
    const url = `https://${config.host}/redfish/v1/chassis/1/Thermal/`;
    const resp = await axios.get(url, { auth: { username: config.username, password: config.password }, httpsAgent: agent, timeout: 8000 });
    const j = resp.data || {};
    res.json({ Fans: j.Fans || [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch fans full', details: error.message });
  }
});

app.post('/debug/ssh-cmd', async (req, res) => {
  try {
    const { cmd } = req.body || {};
    const safe = String(cmd || '').trim();
    if (!safe || (!safe.startsWith('fan ') && !safe.startsWith('show '))) {
      return res.status(400).json({ error: 'Invalid command' });
    }
    const config = getIloConfig(req);
    const ssh = new NodeSSH();
    await ssh.connect({ host: config.host, username: config.username, password: config.password, readyTimeout: 15000, algorithms: { kex: ['diffie-hellman-group14-sha1', 'diffie-hellman-group1-sha1'], cipher: ['aes128-cbc', '3des-cbc', 'aes256-cbc'], serverHostKey: ['ssh-rsa', 'ssh-dss'] } });
    const out = await ssh.execCommand(safe);
    ssh.dispose();
    res.json({ cmd: safe, code: out.code, stdout: out.stdout, stderr: out.stderr });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'failed' });
  }
});

// Debug names to help mapping
app.get('/debug/thermal-names', async (req, res) => {
  try {
    const config = getIloConfig(req);
    const agent = new https.Agent({ rejectUnauthorized: false });
    const url = `https://${config.host}/redfish/v1/chassis/1/Thermal/`;
    const resp = await axios.get(url, { auth: { username: config.username, password: config.password }, httpsAgent: agent, timeout: 6000 });
    const j = resp.data || {};
    const tempsArr = Array.isArray(j.Temperatures) ? j.Temperatures : [];
    const fansArr = Array.isArray(j.Fans) ? j.Fans : [];
    res.json({
      temperatures_names: tempsArr.map(t => t?.Name).filter(Boolean),
      fans_names: fansArr.map(f => f?.FanName || f?.Name || f?.MemberId).filter(Boolean)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch thermal names', details: error.message });
  }
});

// SPA Fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

let CURRENT_PORT = process.env.PORT || 8000;
let server = app.listen(CURRENT_PORT, () => { console.log(`Server running on port ${CURRENT_PORT}`); setTimeout(() => { setDefaultFans(15); }, 5000); });

app.post('/api/port', async (req, res) => {
  try {
    const { port } = req.body || {};
    const newPort = Number(port);
    if (!newPort || newPort < 1 || newPort > 65535) {
      return res.status(400).json({ error: 'Invalid port' });
    }
    server.close(() => {
      CURRENT_PORT = newPort;
      server = app.listen(CURRENT_PORT, () => { console.log(`Server running on port ${CURRENT_PORT}`); setTimeout(() => { setDefaultFans(15); }, 5000); });
      res.json({ success: true, port: CURRENT_PORT });
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to change port' });
  }
});
