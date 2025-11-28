import { useState, useEffect, useRef } from 'react';
import { Fan, Zap, RefreshCw, Settings2, Check, Loader2, Wind } from 'lucide-react';
import { setFanSpeed, setFanSpeedIndex, getFanStatus, getSensorsData } from '../services/mockService';
import { Translation, IloSettings } from '../types';

interface FanControlsProps {
  t: Translation;
  settings: IloSettings;
  onLog?: (message: string, type?: 'info'|'success'|'error'|'warning') => void;
  idle?: boolean;
  unit?: 'C'|'F';
  loggedIn?: boolean;
}

interface AutoConfig {
  minTemp: number;
  maxTemp: number;
  minSpeed: number;
  maxSpeed: number;
}

export function FanControls({ t, settings, onLog, idle, unit = 'C', loggedIn = true }: FanControlsProps) {
  const [speed, setSpeed] = useState(30);
  const [isAuto, setIsAuto] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const lastApplyAtRef = useRef<number>(0);
  const [currentReadings, setCurrentReadings] = useState<Record<string, number>>({});
  const [cpuTemp, setCpuTemp] = useState(0);
  const [cpu1, setCpu1] = useState(0);
  const [cpu2, setCpu2] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  // Configuração do Modo Automático
  const [autoConfig, setAutoConfig] = useState<AutoConfig>(() => {
    const saved = localStorage.getItem('ilo_auto_config');
    return saved ? JSON.parse(saved) : { minTemp: 40, maxTemp: 70, minSpeed: 15, maxSpeed: 100 };
  });

  const lastAutoSpeedRef = useRef<number>(0);

  // Helper para definir cores baseadas na velocidade
  const getStatusColors = (val: number) => {
    if (val <= 35) {
      return {
        border: 'border-emerald-500',
        text: 'text-emerald-400',
        bg: 'bg-emerald-600',
        hover: 'hover:bg-emerald-700',
        shadow: 'shadow-emerald-600/20',
        accent: 'accent-emerald-500'
      };
    }
    if (val <= 70) {
      return {
        border: 'border-yellow-500',
        text: 'text-yellow-400',
        bg: 'bg-yellow-600',
        hover: 'hover:bg-yellow-700',
        shadow: 'shadow-yellow-600/20',
        accent: 'accent-yellow-500'
      };
    }
    return {
      border: 'border-red-600',
      text: 'text-red-500',
      bg: 'bg-red-600',
      hover: 'hover:bg-red-700',
      shadow: 'shadow-red-600/20',
      accent: 'accent-red-600'
    };
  };

  // Velocidade atual para exibição (Auto ou Manual)
  const displaySpeed = isAuto ? lastAutoSpeedRef.current : speed;
  const theme = getStatusColors(displaySpeed);

  // Salva configurações automáticas
  useEffect(() => {
    localStorage.setItem('ilo_auto_config', JSON.stringify(autoConfig));
  }, [autoConfig]);

  // Busca status das fans e temperatura
  const fetchStatus = async () => {
    try {
      // Buscar Fans
      const fanData = await getFanStatus(settings);
      const cleanFanData: Record<string, number> = {};
      
      if (fanData && typeof fanData === 'object') {
          const keys = Object.keys(fanData).sort((a, b) => {
            // Sort logic to handle "Fan 1", "Fan 10" correctly
            const numA = parseInt(a.match(/\d+/)?.[0] || '0');
            const numB = parseInt(b.match(/\d+/)?.[0] || '0');
            return numA - numB;
          });
          
          keys.forEach(k => {
             if (typeof fanData[k] === 'number') {
                 cleanFanData[k] = fanData[k];
             }
          });
          
          if (Object.keys(cleanFanData).length > 0) {
              setIsConnected(true);
              setCurrentReadings(cleanFanData);
          } else {
              setIsConnected(false);
          }
      } else {
          setIsConnected(false);
      }

      const sensors = await getSensorsData(settings);
      setCpu1(Number(sensors.temps.cpu1) || 0);
      setCpu2(Number(sensors.temps.cpu2) || 0);
      setCpuTemp(Math.max(Number(sensors.temps.cpu1)||0, Number(sensors.temps.cpu2)||0));
    } catch (e) {
      console.error(e);
      setIsConnected(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const poll = !loggedIn ? 1200000 : (idle ? 15000 : 5000);
    const interval = setInterval(fetchStatus, poll); 
    return () => clearInterval(interval);
  }, [settings, idle, loggedIn]);

  // Lógica do Modo Automático
  useEffect(() => {
    if (!isAuto || cpuTemp === 0) return;

    const calculateSpeed = () => {
      const { minTemp, maxTemp, minSpeed, maxSpeed } = autoConfig;
      
      if (cpuTemp <= minTemp) return minSpeed;
      if (cpuTemp >= maxTemp) return maxSpeed;

      const ratio = (cpuTemp - minTemp) / (maxTemp - minTemp);
      const calcSpeed = minSpeed + ratio * (maxSpeed - minSpeed);
      
      return Math.round(calcSpeed / 5) * 5;
    };

    const targetSpeed = calculateSpeed();

    if (Math.abs(targetSpeed - lastAutoSpeedRef.current) >= 5) {
      setFanSpeed(targetSpeed, settings)
        .then(() => {
            lastAutoSpeedRef.current = targetSpeed;
            setSpeed(targetSpeed);
        })
        .catch(err => console.error("Auto mode set failed", err));
    }
  }, [isAuto, cpuTemp, autoConfig, settings]);

  const handleSpeedChange = (newSpeed: number) => {
    setSpeed(newSpeed);
    setSuccess(false);
    setErrorMsg(null);
  };

  const handleApply = async () => {
    if (isAuto) return;
    const now = Date.now();
    if (now - lastApplyAtRef.current < 1500) return;
    lastApplyAtRef.current = now;
    setLoading(true);
    setSuccess(false);
    setErrorMsg(null);
    onLog?.(`Apply fans speed: ${speed}%`, 'info');
    
    try {
      await setFanSpeed(speed, settings);
      setSuccess(true);
      onLog?.(`Fans speed applied: ${speed}%`, 'success');
      setTimeout(() => setSuccess(false), 3000);
      setTimeout(fetchStatus, 2000); 
    } catch (error) {
      const msg = (error as any)?.message || 'Falha ao aplicar velocidade';
      onLog?.(`Failed to apply fans: ${msg}`, 'error');
      try {
        let anySuccess = false;
        for (let i = 1; i <= 6; i++) {
          try { await setFanSpeedIndex(i, speed, settings); anySuccess = true; } catch {}
        }
        if (anySuccess) {
          setSuccess(true);
          onLog?.(`Fans speed applied (per-index): ${speed}%`, 'success');
          setTimeout(() => setSuccess(false), 3000);
          setTimeout(fetchStatus, 2000);
        } else {
          setErrorMsg(msg);
        }
      } catch {
        setErrorMsg(msg);
      }
    } finally {
      setLoading(false);
      setTimeout(() => { lastApplyAtRef.current = 0; }, 1500);
    }
  };

  const fmt = (v: number) => {
    if (v <= 0 || isNaN(v)) return '--';
    return unit === 'F' ? String(((v * 9) / 5 + 32).toFixed(1)) : String(v.toFixed(1));
  };

  return (
    <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 shadow-lg flex flex-col h-full justify-between">
      <div>
          <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Fan className={theme.text} />
            {t.fanControl}
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={fetchStatus} className="text-slate-500 hover:text-white" title="Refresh Status">
                <RefreshCw size={16} className={!isConnected ? "text-red-500" : ""} />
            </button>
            <span className={`text-sm ${isAuto ? 'text-green-400' : 'text-slate-400'}`}>
              {isAuto ? t.autoMode : t.manualControl}
            </span>
            <button
              onClick={() => setIsAuto(!isAuto)}
              className={`w-10 h-5 rounded-full p-1 transition-colors ${
                isAuto ? 'bg-green-500' : 'bg-slate-600'
              }`}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                  isAuto ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <div className={`space-y-6 transition-opacity duration-300 ${isAuto ? 'opacity-75' : ''}`}>
          <div className="flex flex-col items-center justify-center py-3">
             <div className="relative w-24 h-24 flex items-center justify-center rounded-full border-4 border-slate-700 bg-slate-900/50">
               <div 
                   className={`absolute inset-0 rounded-full border-4 ${theme.border} transition-all duration-500`}
                   style={{ clipPath: `inset(${100 - displaySpeed}% 0 0 0)` }} 
               />
               <div className="text-center z-10">
                    <span className={`text-2xl font-bold ${theme.text} transition-colors duration-300`}>{displaySpeed}%</span>
                    <span className="block text-xs text-slate-400">{isAuto ? 'AUTO' : 'TARGET'}</span>
               </div>
             </div>
             
             <div className="mt-4 flex items-center justify-center gap-6">
               <div className="flex flex-col items-center">
                 <div className="w-16 h-16 rounded-full border-4 border-slate-700 bg-slate-900/50 flex items-center justify-center">
                  <span className="text-base font-mono text-emerald-400">{cpu1 > 0 ? `${fmt(cpu1)}°${unit}` : '--'}</span>
                 </div>
                 <span className="text-xs text-slate-400 mt-1">CPU 1</span>
               </div>
               <div className="flex flex-col items-center">
                 <div className="w-16 h-16 rounded-full border-4 border-slate-700 bg-slate-900/50 flex items-center justify-center">
                  <span className="text-base font-mono text-red-400">{cpu2 > 0 ? `${fmt(cpu2)}°${unit}` : '--'}</span>
                 </div>
                 <span className="text-xs text-slate-400 mt-1">CPU 2</span>
               </div>
             </div>

             {/* Grid de Fans */}
             <div className="mt-3 w-full">
                <div className="grid grid-cols-3 gap-2">
                    {Object.entries(currentReadings).map(([name, val]) => (
                        <div key={name} className="bg-slate-900/80 rounded p-2 border border-slate-700 flex flex-col items-center">
                            <Wind size={12} className="text-slate-500 mb-1" />
                            <span className="text-[10px] text-slate-400 uppercase tracking-tighter">{name.replace('Fan ','F')}</span>
                            <span className={`text-xs font-mono font-bold ${getStatusColors(val).text}`}>{val}%</span>
                        </div>
                    ))}
                    {Object.keys(currentReadings).length === 0 && (
                        <div className="col-span-3 text-center text-slate-500 text-sm py-2 italic">
                           {t.disconnected}
                        </div>
                    )}
                </div>
             </div>
          </div>

          <div className={isAuto ? 'pointer-events-none opacity-50' : ''}>
            <div className="flex justify-between text-slate-300 mb-1">
              <span>{t.speed}</span>
              <span className={`font-bold ${theme.text}`}>{speed}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={speed}
              onChange={(e) => handleSpeedChange(Number(e.target.value))}
              className={`w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer ${theme.accent}`}
            />
          </div>
          
          <div className={`grid grid-cols-3 gap-2 ${isAuto ? 'pointer-events-none opacity-50' : ''}`}>
            <button onClick={() => handleSpeedChange(15)} className={`px-2 py-2 rounded-lg font-medium transition-colors flex flex-col items-center gap-1 border ${speed === 15 ? `bg-slate-600 border-emerald-500 text-white` : 'bg-slate-700 border-transparent text-slate-300 hover:bg-slate-600'}`}>
              <div className="w-2 h-2 bg-emerald-400 rounded-full" />
              <span className="text-xs">{t.minimum}</span>
            </button>
            <button onClick={() => handleSpeedChange(50)} className={`px-2 py-2 rounded-lg font-medium transition-colors flex flex-col items-center gap-1 border ${speed === 50 ? `bg-slate-600 border-yellow-500 text-white` : 'bg-slate-700 border-transparent text-slate-300 hover:bg-slate-600'}`}>
              <div className="w-2 h-2 bg-yellow-400 rounded-full" />
              <span className="text-xs">{t.medium}</span>
            </button>
            <button onClick={() => handleSpeedChange(100)} className={`px-2 py-2 rounded-lg font-medium transition-colors flex flex-col items-center gap-1 border ${speed === 100 ? `bg-slate-600 border-red-500 text-white` : 'bg-slate-700 border-transparent text-slate-300 hover:bg-slate-600'}`}>
              <div className="w-2 h-2 bg-red-600 rounded-full" />
              <span className="text-xs">{t.maximum}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8">
        {isAuto ? (
            <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                <div className="flex items-center gap-2 mb-3 text-green-400">
                    <Settings2 size={18} />
                    <h3 className="font-medium">{t.autoSettings}</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-2">
                    <div>
                        <label className="text-xs text-slate-400 block mb-1">{t.minTemp}</label>
                        <input 
                            type="number" 
                            value={autoConfig.minTemp}
                            onChange={(e) => setAutoConfig({...autoConfig, minTemp: Number(e.target.value)})}
                            className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 block mb-1">{t.maxTemp}</label>
                        <input 
                            type="number" 
                            value={autoConfig.maxTemp}
                            onChange={(e) => setAutoConfig({...autoConfig, maxTemp: Number(e.target.value)})}
                            className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                        />
                    </div>
                </div>
                <p className="text-slate-500 text-xs italic mt-2 text-center">{t.autoModeDesc}</p>
            </div>
        ) : (
            <>
                <button
                    onClick={handleApply}
                    disabled={loading}
                    className={`w-full py-3 ${theme.bg} ${theme.hover} ${theme.shadow} disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg flex items-center justify-center gap-2 font-bold shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]`}
                >
                    {loading ? <Loader2 className="animate-spin" /> : <Zap size={20} />}
                    {t.applySpeed}
                </button>
                {loading && (
                  <div className="mt-2 text-center text-xs text-slate-400">controle em andamento</div>
                )}
                
                {success && (
                    <div className="mt-3 text-center animate-fade-in">
                        <span className="inline-flex items-center gap-1 text-sm text-emerald-400">
                            <Check size={16} /> {t.configurationSaved}
                        </span>
                    </div>
                )}
                {errorMsg && (
                    <div className="mt-3 text-center">
                        <span className="inline-flex items-center gap-1 text-sm text-red-400">
                            {errorMsg}
                        </span>
                    </div>
                )}
            </>
        )}
      </div>
    </div>
  );
}
