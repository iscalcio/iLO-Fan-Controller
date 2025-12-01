
import { useState, useEffect, useRef } from 'react';
import { Settings, Server, Terminal, Menu, LogOut } from 'lucide-react';
import { FanControls } from './components/FanControls';
import { CpuChart } from './components/CpuChart';
import { ScheduleSettings } from './components/ScheduleSettings';
import { SettingsModal } from './components/SettingsModal';
import { IloSettings, TempUnit, Language, LogEntry, ScheduleItem } from './types';
import { translations } from './services/translations';
import { setFanSpeed, getSensorsData, loginSystem, changeSystemPassword, getServerConfig, writeAppLog, setFanAuto } from './services/mockService';
import { getSystemInfo } from './services/systemInfoService';

function ClockNow({ lang }: { lang: Language }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  return (
    <div className="text-right">
      <div className="text-sm font-medium text-white">{now.toLocaleTimeString(lang)}</div>
      <div className="text-xs text-slate-500">{now.toLocaleDateString(lang)}</div>
    </div>
  );
}

function AvgTempDisplay({ unit, t, settings, isIdle, loggedIn, isInteracting }: { unit: TempUnit; t: any; settings: IloSettings; isIdle: boolean; loggedIn: boolean; isInteracting: boolean }) {
  const [avg, setAvg] = useState<number>(0);
  const formatTemp = (val: number) => {
    if (val <= 0 || isNaN(val)) return '--';
    return unit === 'F' ? (((val * 9) / 5) + 32).toFixed(1) : val.toFixed(1);
  };
  useEffect(() => {
    const fn = async () => {
      if (isInteracting) return;
      try {
        const s = await getSensorsData(settings);
        const c1 = Number(s.temps.cpu1) || 0;
        const c2 = Number(s.temps.cpu2) || 0;
        const a = (c1 + c2) / 2;
        setAvg(a || 0);
      } catch {}
    };
    fn();
    const poll = !loggedIn ? 1200000 : (isInteracting ? 20000 : (isIdle ? 15000 : 5000));
    const id = setInterval(fn, poll);
    return () => clearInterval(id);
  }, [settings, isIdle, loggedIn, isInteracting]);
  return (
    <div className="text-right">
      <div className="text-sm font-mono text-blue-400">{avg > 0 ? `${formatTemp(avg)}°${unit}` : '--'}</div>
      <div className="text-xs text-slate-500">média de temperatura</div>
    </div>
  );
}

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginUser, setLoginUser] = useState('admin');
  const [loginPass, setLoginPass] = useState('');
  const [showChangePw, setShowChangePw] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  
  // Initialize from global ENV if available (Docker injection)
  const env = window.__ENV__ || {};
  
  const [iloSettings, setIloSettings] = useState<IloSettings>({
    host: env.ILO_HOST || '192.168.15.103',
    username: env.ILO_USERNAME || 'fan',
    password: env.ILO_PASSWORD || '20134679',
  });

  const [tempUnit, setTempUnit] = useState<TempUnit>('C');
  const [language, setLanguage] = useState<Language>('pt');
  const [sysInfo, setSysInfo] = useState<{ cpuModel?: string; memoryGiB?: number }>({});
  const [loginBgCfg, setLoginBgCfg] = useState<{ type?: 'solid'|'gradient'|'image'; image?: string; blur?: boolean }>({});
  const [isInteracting, setIsInteracting] = useState(false);
  
  // Agendamentos (Lifted State)
  const [schedules, setSchedules] = useState<ScheduleItem[]>(() => {
    const saved = localStorage.getItem('ilo_schedules');
    return saved ? JSON.parse(saved) : [];
  });

  // Logs do Sistema
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const lastLogRef = useRef<{ msg: string; type: 'info'|'success'|'error'|'warning'; count: number; lastTime: number } | null>(null);
  const [isIdle, setIsIdle] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());
  const lastSafetyAtRef = useRef<number>(0);
  const [retryQueue, setRetryQueue] = useState<{ id: string; description: string; mode: 'auto'|'manual'; speed: number; nextAt: number; attempts: number }[]>(() => {
    try { const raw = localStorage.getItem('ilo_retry_queue')||''; if(raw){ const arr = JSON.parse(raw); if(Array.isArray(arr)) return arr; } } catch {}
    return [];
  });
  
  // Controle de execução para não repetir o comando no mesmo minuto
  const lastExecutedMinute = useRef<string>('');

  const t = translations[language];
  const formatTemp = (val: number) => {
    if (val <= 0 || isNaN(val)) return '--';
    return tempUnit === 'F' ? (((val * 9) / 5) + 32).toFixed(1) : val.toFixed(1);
  };

  

  // Helpers de Log
  const addLog = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const now = Date.now();
    const last = lastLogRef.current;
    if (last && last.msg === message && last.type === type && (now - last.lastTime) < 60000) {
      const newCount = last.count + 1;
      lastLogRef.current = { msg: message, type, count: newCount, lastTime: now };
      setLogs(prev => {
        if (prev.length === 0) return prev;
        const updated = { ...prev[0], time: new Date().toLocaleTimeString(), message: `${message} (x${newCount})` };
        return [updated, ...prev.slice(1)].slice(0, 100);
      });
      return;
    }
    lastLogRef.current = { msg: message, type, count: 1, lastTime: now };
    const newLog: LogEntry = { id: now.toString() + Math.random(), time: new Date().toLocaleTimeString(), message, type };
    setLogs(prev => [newLog, ...prev].slice(0, 100));
    try { writeAppLog(message, type); } catch {}
  };

  

  useEffect(() => {
    const onActivity = () => { lastActivityRef.current = Date.now(); setIsIdle(false); };
    const onFocusIn = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName.toLowerCase();
      const editable = (el as any)?.isContentEditable;
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || editable) setIsInteracting(true);
    };
    const onFocusOut = () => {
      setTimeout(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) { setIsInteracting(false); return; }
        const tag = el.tagName.toLowerCase();
        const editable = (el as any)?.isContentEditable;
        const focusedInteractive = tag === 'input' || tag === 'textarea' || tag === 'select' || editable;
        setIsInteracting(focusedInteractive);
      }, 0);
    };
    window.addEventListener('mousemove', onActivity);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('click', onActivity);
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('focusout', onFocusOut);
    const id = setInterval(() => {
      setIsIdle(Date.now() - lastActivityRef.current > 60000);
    }, 5000);
    return () => {
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('click', onActivity);
      window.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('focusout', onFocusOut);
      clearInterval(id);
    };
  }, []);

  // Relógio Principal e Verificador de Agendamento
  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const currentHM = `${hh}:${mm}`;
      if (lastExecutedMinute.current === currentHM) return;
      const activeSchedule = schedules.find(s => s.active && s.time === currentHM);
      if (activeSchedule) {
        lastExecutedMinute.current = currentHM;
        addLog(`⏰ Executing Schedule: "${activeSchedule.description}"`, 'info');
        const exec = async () => {
          try {
            if ((activeSchedule.mode||'manual') === 'auto') {
              addLog(`> Command: fan auto`, 'warning');
              const res = await setFanAuto(iloSettings);
              if (res && res.success) { addLog(`✅ Auto mode applied`, 'success'); return true; }
              addLog(`❌ Auto failed: ${res?.error||'Falha'}`, 'error');
              return false;
            } else {
              const pwmValue = Math.ceil((activeSchedule.speed / 100) * 255);
              addLog(`> Command: fan p 0-5 max ${pwmValue} (${activeSchedule.speed}%)`, 'warning');
              const resp = await setFanSpeed(activeSchedule.speed, iloSettings);
              const uncontrolled = Array.isArray(resp?.uncontrolled) ? resp!.uncontrolled! : [];
              if (uncontrolled.length === 0) { addLog(`✅ Schedule applied successfully`, 'success'); return true; }
              addLog(`⚠️ Partial apply. Uncontrolled: ${uncontrolled.join(', ')}`, 'warning');
              return false;
            }
          } catch (err: any) {
            addLog(`❌ Failed to apply schedule: ${err?.message||err}`, 'error');
            return false;
          }
        };
        exec().then((ok) => {
          if (!ok) {
            const rq = { id: activeSchedule.id, description: activeSchedule.description, mode: (activeSchedule.mode||'manual'), speed: activeSchedule.speed, nextAt: Date.now() + 120000, attempts: 1 };
            setRetryQueue(prev => { const exists = prev.some(x=>x.id===rq.id); const next = exists ? prev.map(x=>x.id===rq.id?rq:x) : [...prev, rq]; localStorage.setItem('ilo_retry_queue', JSON.stringify(next)); return next; });
            addLog(`Retry scheduled in 2min for "${activeSchedule.description}"`, 'warning');
          }
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [schedules, iloSettings]);

  useEffect(() => {
    const fn = async () => {
      if (isInteracting) return;
      try {
        const s = await getSensorsData(iloSettings);
        const c1 = Number(s.temps.cpu1) || 0;
        const c2 = Number(s.temps.cpu2) || 0;
        const cpuMax = Math.max(c1, c2);
        try {
          const raw = localStorage.getItem('ilo_safety') || '';
          if (raw) {
            const obj = JSON.parse(raw);
            if (obj?.enabled) {
              const thrC = Number(obj.thresholdC || 0);
              const spd = Math.min(100, Math.max(5, Number(obj.speed || 100)));
              const now = Date.now();
              if (cpuMax >= thrC && (now - lastSafetyAtRef.current) > 60000) {
                await setFanSpeed(spd, iloSettings);
                addLog(`Safety: max ${cpuMax.toFixed(1)}°C >= ${thrC.toFixed(1)}°C -> ${spd}%`, 'warning');
                lastSafetyAtRef.current = now;
              }
            }
          }
        } catch {}
      } catch {}
    };
    fn();
    const poll = !isLoggedIn ? 1200000 : (isInteracting ? 20000 : (isIdle ? 15000 : 5000));
    const id = setInterval(fn, poll);
    return () => clearInterval(id);
  }, [iloSettings, isIdle, isLoggedIn, isInteracting]);

  useEffect(() => {
    getSystemInfo(iloSettings).then(setSysInfo).catch(()=>{});
  }, [iloSettings, isLoggedIn]);

  useEffect(() => {
    const id = setInterval(async () => {
      const now = Date.now();
      for (const item of retryQueue) {
        if (item.nextAt <= now) {
          try {
            let ok = false;
            if (item.mode === 'auto') {
              const res = await setFanAuto(iloSettings);
              ok = !!(res && res.success);
              if (ok) addLog(`✅ Retry OK: AUTO for "${item.description}"`, 'success');
            } else {
              const resp = await setFanSpeed(item.speed, iloSettings);
              const uncontrolled = Array.isArray(resp?.uncontrolled) ? resp!.uncontrolled! : [];
              ok = uncontrolled.length === 0;
              if (ok) addLog(`✅ Retry OK: ${item.speed}% for "${item.description}"`, 'success');
              else addLog(`⚠️ Retry partial: uncontrolled ${uncontrolled.join(', ')}`, 'warning');
            }
            if (ok) {
              setRetryQueue(prev => { const next = prev.filter(x=>x.id!==item.id); localStorage.setItem('ilo_retry_queue', JSON.stringify(next)); return next; });
            } else {
              setRetryQueue(prev => { const next = prev.map(x=>x.id===item.id ? { ...x, nextAt: now + 120000, attempts: x.attempts + 1 } : x); localStorage.setItem('ilo_retry_queue', JSON.stringify(next)); return next; });
            }
          } catch (e: any) {
            setRetryQueue(prev => { const next = prev.map(x=>x.id===item.id ? { ...x, nextAt: now + 120000, attempts: x.attempts + 1 } : x); localStorage.setItem('ilo_retry_queue', JSON.stringify(next)); return next; });
            addLog(`❌ Retry failed: ${e?.message||'falha'} • next in 2min`, 'error');
          }
        }
      }
    }, 10000);
    return () => clearInterval(id);
  }, [retryQueue, iloSettings]);

  useEffect(() => {
    try { localStorage.setItem('ilo_retry_queue', JSON.stringify(retryQueue)); } catch {}
  }, [retryQueue]);

  // Log inicial
  const SESSION_KEY = 'ilo_session';
  const startSession = () => {
    const now = Date.now();
    const ttl = 10 * 60 * 1000;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ loggedAt: now, expiresAt: now + ttl }));
  };
  const isSessionValid = () => {
    try {
      const raw = localStorage.getItem(SESSION_KEY) || '';
      if (!raw) return false;
      const obj = JSON.parse(raw);
      return Number(obj?.expiresAt || 0) > Date.now();
    } catch { return false; }
  };

  const logout = () => {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    setIsSettingsOpen(false);
    setShowChangePw(false);
    setIsLoggedIn(false);
    setLoginPass('');
  };

  useEffect(() => {
    if (isSessionValid()) setIsLoggedIn(true);
    addLog('System started. Monitoring schedules...', 'info');
    addLog(`Target iLO: ${iloSettings.host}`, 'info');
    try { const raw = localStorage.getItem('ilo_login_bg_cfg')||''; if(raw){ setLoginBgCfg(JSON.parse(raw)); } } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      const cfg = await getServerConfig();
      if (cfg && cfg.host && cfg.username) {
        setIloSettings({ host: cfg.host, username: cfg.username, password: cfg.password || '' });
      }
    })();
  }, []);

  // Persistência dos Agendamentos
  useEffect(() => {
    localStorage.setItem('ilo_schedules', JSON.stringify(schedules));
  }, [schedules]);

  return (
    <div className={`min-h-screen bg-slate-900 text-slate-200 font-sans`}>
      

      

      {/* Background wrapper (no blur; login already covers full screen) */}
      <div>
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-40">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20">
              <Server className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white leading-tight">{t.dashboardTitle}{sysInfo?.cpuModel ? ` • ${sysInfo.cpuModel}` : ''}{(sysInfo?.memoryGiB||0)>0 ? ` • ${Math.round(sysInfo.memoryGiB!)}GB` : ''}</h1>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-slate-400">{t.connected}: {iloSettings.host}</span>
              </div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-6">
            <ClockNow lang={language} />
            <AvgTempDisplay unit={tempUnit} t={t} settings={iloSettings} isIdle={isIdle} loggedIn={isLoggedIn} isInteracting={isInteracting} />
            
            <button
              onClick={() => { if (isSessionValid()) { setIsSettingsOpen(true); } else { setIsLoggedIn(false); } }}
              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-slate-300 hover:text-white"
              title={t.settings}
            >
              <Settings size={20} />
            </button>
            <button
              onClick={logout}
              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-slate-300 hover:text-white"
              title="Sair"
            >
              <LogOut size={20} />
            </button>
          </div>
          
          <button className="md:hidden p-2 text-slate-300">
            <Menu size={24} />
          </button>
        </div>
      </header>

      

      {/* Main Content */}
       <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ gridAutoRows: '1fr' }}>
          <FanControls t={t} settings={iloSettings} onLog={addLog} idle={isIdle} unit={tempUnit} loggedIn={isLoggedIn} interacting={isInteracting} />
          <CpuChart unit={tempUnit} t={t} settings={iloSettings} lang={language} idle={isIdle} loggedIn={isLoggedIn} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ gridAutoRows: '1fr' }}>
          {/* Passamos o estado e a função de atualização para o componente */}
          <ScheduleSettings t={t} schedules={schedules} onUpdateSchedules={setSchedules} lang={language} settings={iloSettings} onLog={addLog} />
          
          {/* Logs / Console Preview */}
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 shadow-lg flex flex-col min-h-[360px] h-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Terminal className="text-blue-400" />
                {t.logs}
              </h2>
              <button onClick={() => setLogs([])} className="text-xs text-slate-500 hover:text-white">
                Clear
              </button>
            </div>
            <div className="bg-slate-950 rounded-lg p-4 font-mono text-sm flex-1 overflow-y-auto text-slate-400 space-y-1 scrollbar-thin scrollbar-thumb-slate-700">
              {logs.length === 0 && <span className="text-slate-700 italic">No logs yet...</span>}
              {logs.map((log) => (
                <div key={log.id} className="flex gap-2 hover:bg-slate-900/50 p-0.5 rounded">
                  <span className="text-slate-600 min-w-[80px]">[{log.time}]</span>
                  <span className={`break-all ${
                    log.type === 'error' ? 'text-red-400' : 
                    log.type === 'success' ? 'text-green-400' : 
                    log.type === 'warning' ? 'text-yellow-400' : 'text-slate-300'
                  }`}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        
      </main>
      </div>

      {/* Overlay de Login */}
      {!isLoggedIn && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center ${loginBgCfg?.blur ? 'backdrop-blur-sm' : 'backdrop-blur-none'}`}
          style={loginBgCfg?.type === 'image' && loginBgCfg?.image ? { backgroundImage: `url('${loginBgCfg.image}')`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: loginBgCfg?.type === 'gradient' ? 'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%)' : 'rgba(0,0,0,0.6)' }}
        >
          <div className="w-full h-full flex items-center justify-center p-4">
            <div className="bg-slate-800/90 p-6 rounded-lg w-full max-w-sm border border-slate-700 shadow-xl">
              <h2 className="text-white text-lg mb-4">{t.loginTitle}</h2>
              <div className="space-y-3">
                <div className="text-xs text-slate-400">
                  <div>{t.loginInstructions}</div>
                  <div className="mt-1 font-mono text-slate-300">{t.loginDefaultCreds}</div>
                  <div className="mt-1">{t.loginChangePasswordPrompt}</div>
                  <div className="mt-1">{t.loginOpenSettingsHint}</div>
                </div>
                <div className="flex gap-1 mt-2">
                  {(['pt','en','es','fr'] as Language[]).map(lang => (
                    <button key={lang} onClick={()=>setLanguage(lang)} className={`px-2 py-1 rounded text-xs font-bold uppercase ${language===lang?'bg-blue-600 text-white':'text-slate-400 hover:text-white bg-slate-800'}`}>{lang}</button>
                  ))}
                </div>
                <input className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white" value={loginUser} onChange={(e)=>setLoginUser(e.target.value)} placeholder={t.loginUsernameLabel} />
                <input className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white" type="password" value={loginPass} onChange={(e)=>setLoginPass(e.target.value)} placeholder={t.loginPasswordLabel} />
                <button
                  onClick={async () => {
                    const resp = await loginSystem(loginUser, loginPass);
                    if (!resp.success) { alert(resp.error || 'Login inválido'); return; }
                    setIsLoggedIn(true);
                    startSession();
                    if (resp.mustChangePassword) {
                      setShowChangePw(true);
                    }
                  }}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                >
                  {t.loginEnterButton}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showChangePw && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-lg w-full max-w-sm border border-slate-700">
            <h3 className="text-white text-lg mb-3">{t.loginChangePasswordPrompt}</h3>
            <div className="space-y-3">
              <input type="password" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white" value={newPw} onChange={(e)=>setNewPw(e.target.value)} placeholder={`${t.loginPasswordLabel} (novo)`} />
              <input type="password" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white" value={confirmPw} onChange={(e)=>setConfirmPw(e.target.value)} placeholder={`${t.loginPasswordLabel} (confirmar)`} />
              <div className="flex gap-2 justify-end">
                <button onClick={()=>setShowChangePw(false)} className="px-3 py-2 text-slate-300 hover:text-white">{t.cancel}</button>
                <button
                  onClick={async ()=>{ if(newPw.length>=4 && newPw===confirmPw){ const res = await changeSystemPassword(loginPass, newPw); if(res.success){ setShowChangePw(false); startSession(); setIsSettingsOpen(true);} else { alert(res.error || 'Falha ao alterar senha'); } } else { alert('Senhas não coincidem ou muito curta'); } }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                >
                  {t.save}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentSettings={iloSettings}
        onSave={setIloSettings}
        currentUnit={tempUnit}
        onUnitChange={setTempUnit}
        currentLang={language}
        onLangChange={setLanguage}
        t={t}
      />
    </div>
  );
}

export default App;
