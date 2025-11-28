
import { useState, useEffect, useRef } from 'react';
import { Settings, Server, Terminal, Menu, LogOut } from 'lucide-react';
import { CpuChart } from './components/CpuChart';
import { FanControls } from './components/FanControls';
import { ScheduleSettings } from './components/ScheduleSettings';
import { SettingsModal } from './components/SettingsModal';
import { IloSettings, TempUnit, Language, ScheduleItem, LogEntry } from './types';
import { translations } from './services/translations';
import { setFanSpeed, getSensorsData, loginSystem, changeSystemPassword } from './services/mockService';

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
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
  const [avgTemp, setAvgTemp] = useState<number>(0);
  
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
  
  // Controle de execução para não repetir o comando no mesmo minuto
  const lastExecutedMinute = useRef<string>('');

  const t = translations[language];
  const formatTemp = (val: number) => {
    if (val <= 0 || isNaN(val)) return '--';
    return tempUnit === 'F' ? (((val * 9) / 5) + 32).toFixed(1) : val.toFixed(1);
  };

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
  };

  // Persistência dos Agendamentos
  useEffect(() => {
    localStorage.setItem('ilo_schedules', JSON.stringify(schedules));
  }, [schedules]);

  useEffect(() => {
    const onActivity = () => { lastActivityRef.current = Date.now(); setIsIdle(false); };
    window.addEventListener('mousemove', onActivity);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('click', onActivity);
    const id = setInterval(() => {
      setIsIdle(Date.now() - lastActivityRef.current > 60000);
    }, 5000);
    return () => {
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('click', onActivity);
      clearInterval(id);
    };
  }, []);

  // Relógio Principal e Verificador de Agendamento
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const currentHM = `${hh}:${mm}`;

      // Se já executou neste minuto, ignora
      if (lastExecutedMinute.current === currentHM) return;

      // Procura agendamento para agora
      const activeSchedule = schedules.find(s => s.active && s.time === currentHM);

      if (activeSchedule) {
        lastExecutedMinute.current = currentHM; // Marca como executado
        
        addLog(`⏰ Executing Schedule: "${activeSchedule.description}"`, 'info');
        
        // Calcula PWM para log (apenas visual)
        const pwmValue = Math.ceil((activeSchedule.speed / 100) * 255);
        addLog(`> Command: fan p 0-5 max ${pwmValue} (${activeSchedule.speed}%)`, 'warning');

        setFanSpeed(activeSchedule.speed, iloSettings)
          .then(() => {
            addLog(`✅ Schedule applied successfully`, 'success');
          })
          .catch((err) => {
            addLog(`❌ Failed to apply schedule: ${err}`, 'error');
          });
      }

    }, 1000); // Verifica a cada segundo para precisão

    return () => clearInterval(timer);
  }, [schedules, iloSettings]);

  useEffect(() => {
    const fn = async () => {
      try {
        const s = await getSensorsData(iloSettings);
        const avg = (Number(s.temps.cpu1) + Number(s.temps.cpu2)) / 2;
        setAvgTemp(avg || 0);
        try {
          const raw = localStorage.getItem('ilo_safety') || '';
          if (raw) {
            const obj = JSON.parse(raw);
            if (obj?.enabled) {
              const thrC = Number(obj.thresholdC || 0);
              const spd = Math.min(100, Math.max(10, Number(obj.speed || 100)));
              const now = Date.now();
              if (avg >= thrC && (now - lastSafetyAtRef.current) > 60000) {
                await setFanSpeed(spd, iloSettings);
                addLog(`Safety: avg ${avg.toFixed(1)}°C >= ${thrC.toFixed(1)}°C -> ${spd}%`, 'warning');
                lastSafetyAtRef.current = now;
              }
            }
          }
        } catch {}
      } catch {}
    };
    fn();
    const poll = !isLoggedIn ? 1200000 : (isIdle ? 15000 : 5000);
    const id = setInterval(fn, poll);
    return () => clearInterval(id);
  }, [iloSettings, isIdle, isLoggedIn]);

  // Log inicial
  useEffect(() => {
    if (isSessionValid()) setIsLoggedIn(true);
    addLog('System started. Monitoring schedules...', 'info');
    addLog(`Target iLO: ${iloSettings.host}`, 'info');
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans">
      {!isLoggedIn && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-lg w-full max-w-sm border border-slate-700">
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
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-40">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20">
              <Server className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white leading-tight">{t.dashboardTitle}</h1>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-slate-400">{t.connected}: {iloSettings.host}</span>
              </div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-6">
            <div className="text-right">
              <div className="text-sm font-medium text-white">
                {currentTime.toLocaleTimeString(language)}
              </div>
              <div className="text-xs text-slate-500">
                {currentTime.toLocaleDateString(language)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-mono text-blue-400">{avgTemp > 0 ? `${formatTemp(avgTemp)}°${tempUnit}` : '--`'}</div>
              <div className="text-xs text-slate-500">média de temperatura</div>
            </div>
            
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <FanControls t={t} settings={iloSettings} onLog={addLog} idle={isIdle} unit={tempUnit} loggedIn={isLoggedIn} />
          <CpuChart unit={tempUnit} t={t} settings={iloSettings} lang={language} idle={isIdle} loggedIn={isLoggedIn} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Passamos o estado e a função de atualização para o componente */}
          <ScheduleSettings t={t} schedules={schedules} onUpdateSchedules={setSchedules} lang={language} />
          
          {/* Logs / Console Preview */}
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 shadow-lg flex flex-col max-h-[400px]">
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
