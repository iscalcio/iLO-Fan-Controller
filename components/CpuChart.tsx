import { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Save } from 'lucide-react';
import { getTemperatureData, getSensorsData } from '../services/mockService';
import { TempData, TempUnit, Translation, IloSettings, Language } from '../types';

interface CpuChartProps {
  unit: TempUnit;
  t: Translation;
  settings: IloSettings;
  lang: Language;
  idle?: boolean;
  loggedIn?: boolean;
}

export function CpuChart({ unit, t, settings, lang, idle, loggedIn }: CpuChartProps) {
  const [data, setData] = useState<TempData[]>([]);
  const [period, setPeriod] = useState('1h');
  const [currentAvg, setCurrentAvg] = useState(0);
  const [sensors, setSensors] = useState<any>({ fans: {}, temps: { cpu1: 0, cpu2: 0, ambient: 0 }, other: {} });
  const [selected, setSelected] = useState<any>({ cpu1: true, cpu2: true, ambient: false, chipset: false, batteryZone: false, inlet: false, memory: false, vr_p2: false, vr_p1: false, ps2: false, systemBoard: false, sysExhaust: false, hdController: false });
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await getTemperatureData(period, settings);
        setData(result);
        if (result.length > 0) {
          const last = result[result.length - 1];
          const avg = (Number(last.cpu1) + Number(last.cpu2)) / 2;
          setCurrentAvg(avg || 0);
        } else {
          setCurrentAvg(0);
        }
      } catch (e) {
        console.error("Chart Data Error", e);
      }
    };

    fetchData(); 
    const poll = !loggedIn ? 1200000 : (idle ? 15000 : 5000);
    const interval = setInterval(fetchData, poll);
    return () => clearInterval(interval);
  }, [period, settings, idle, loggedIn]);

  useEffect(() => {
    const fn = async () => {
      try {
        const s = await getSensorsData(settings);
        setSensors(s);
      } catch {}
    };
    fn();
    const poll = !loggedIn ? 1200000 : (idle ? 15000 : 5000);
    const id = setInterval(fn, poll);
    return () => clearInterval(id);
  }, [settings, idle, loggedIn]);

  const periods = [
    { label: '1h', value: '1h' },
    { label: '24h', value: '24h' },
    { label: '7d', value: '7d' },
    { label: '1 mês', value: '1m' },
    { label: '1 ano', value: '1y' },
    { label: '5 anos', value: '5y' },
  ];

  const formatTemp = (val: number) => {
    if (val <= 0 || isNaN(val)) return '--';
    if (unit === 'F') {
      return ((val * 9/5) + 32).toFixed(1);
    }
    return val.toFixed(1);
  };

  const downloadCSV = () => {
    try {
      const rows = [['time','cpu1','cpu2','ambient'], ...data.map(d => [String(d.time), String(d.cpu1), String(d.cpu2), String(d.ambient)])];
      const csv = rows.map(r => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `temperaturas_${period}_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {}
  };

  return (
    <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 shadow-lg">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
           <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="text-blue-400" />
            {t.temperatureHistory}
           </h2>
           <div className="flex items-center gap-2">
             <span className="text-3xl font-mono text-blue-400 mt-2 block">
               {formatTemp(currentAvg)}{currentAvg > 0 ? `°${unit}` : ''}
             </span>
             <button onClick={downloadCSV} className="mt-2 p-2 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white" title="Salvar CSV">
               <Save size={16} />
             </button>
           </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                period === p.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[300px] w-full" ref={chartRef}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis 
                dataKey="time" 
                stroke="#94a3b8" 
                tick={{fontSize: 12}}
                minTickGap={30}
                tickFormatter={(v: string) => {
                  try {
                    const d = new Date(v);
                    if (period === '1h' || period === '24h') return d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
                    if (period === '7d' || period === '1m' || period === '1y' || period === '5y') return d.toLocaleDateString(lang);
                    return v;
                  } catch { return v; }
                }}
            />
            <YAxis 
              stroke="#94a3b8" 
              tickFormatter={(val) => `${val}°`}
              domain={[20, 'auto']} 
              width={40}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }}
              formatter={(value: number) => [`${formatTemp(value)} °${unit}`, t.cpuTemp]}
            />
            {selected.cpu1 && (<Area type="monotone" dataKey="cpu1" stroke="#22c55e" fillOpacity={0.4} fill="url(#colorTemp)" isAnimationActive={false} />)}
            {selected.cpu2 && (<Area type="monotone" dataKey="cpu2" stroke="#ef4444" fillOpacity={0.4} fill="url(#colorTemp)" isAnimationActive={false} />)}
            {selected.ambient && (<Area type="monotone" dataKey="ambient" stroke="#3b82f6" fillOpacity={0.3} fill="url(#colorTemp)" isAnimationActive={false} />)}
            {selected.chipset && (<Area type="monotone" dataKey="chipset" stroke="#14b8a6" fillOpacity={0.2} fill="url(#colorTemp)" isAnimationActive={false} />)}
            {selected.batteryZone && (<Area type="monotone" dataKey="batteryZone" stroke="#0ea5e9" fillOpacity={0.2} fill="url(#colorTemp)" isAnimationActive={false} />)}
            {selected.inlet && (<Area type="monotone" dataKey="inlet" stroke="#6366f1" fillOpacity={0.2} fill="url(#colorTemp)" isAnimationActive={false} />)}
            {selected.memory && (<Area type="monotone" dataKey="memory" stroke="#8b5cf6" fillOpacity={0.2} fill="url(#colorTemp)" isAnimationActive={false} />)}
            {selected.vr_p2 && (<Area type="monotone" dataKey="vr_p2" stroke="#f97316" fillOpacity={0.2} fill="url(#colorTemp)" isAnimationActive={false} />)}
            {selected.vr_p1 && (<Area type="monotone" dataKey="vr_p1" stroke="#fb923c" fillOpacity={0.2} fill="url(#colorTemp)" isAnimationActive={false} />)}
            {selected.ps2 && (<Area type="monotone" dataKey="ps2" stroke="#f59e0b" fillOpacity={0.2} fill="url(#colorTemp)" isAnimationActive={false} />)}
            {selected.systemBoard && (<Area type="monotone" dataKey="systemBoard" stroke="#06b6d4" fillOpacity={0.2} fill="url(#colorTemp)" isAnimationActive={false} />)}
            {selected.sysExhaust && (<Area type="monotone" dataKey="sysExhaust" stroke="#22d3ee" fillOpacity={0.2} fill="url(#colorTemp)" isAnimationActive={false} />)}
            {selected.hdController && (<Area type="monotone" dataKey="hdController" stroke="#ec4899" fillOpacity={0.2} fill="url(#colorTemp)" isAnimationActive={false} />)}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 items-center">
        <button onClick={()=>setSelected((prev:any)=>({...prev, cpu1: !prev.cpu1}))} className={`px-3 py-1 rounded text-sm font-mono ${selected.cpu1?'bg-emerald-600 text-white':'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>CPU1 {formatTemp(sensors.temps.cpu1)}°{unit}</button>
        <button onClick={()=>setSelected((prev:any)=>({...prev, cpu2: !prev.cpu2}))} className={`px-3 py-1 rounded text-sm font-mono ${selected.cpu2?'bg-red-600 text-white':'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>CPU2 {formatTemp(sensors.temps.cpu2)}°{unit}</button>
        <button onClick={()=>setSelected((prev:any)=>({...prev, ambient: !prev.ambient}))} className={`px-3 py-1 rounded text-sm font-mono ${selected.ambient?'bg-blue-600 text-white':'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Amb {formatTemp(sensors.temps.ambient)}°{unit}</button>
        {sensors.other && (<>
          <button onClick={()=>setSelected((prev:any)=>({...prev, chipset: !prev.chipset}))} className={`px-3 py-1 rounded text-sm font-mono ${selected.chipset?'bg-teal-600 text-white':'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Chipset {formatTemp(Number(sensors.other?.chipset||0))}°{unit}</button>
          <button onClick={()=>setSelected((prev:any)=>({...prev, batteryZone: !prev.batteryZone}))} className={`px-3 py-1 rounded text-sm font-mono ${selected.batteryZone?'bg-teal-700 text-white':'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Battery {formatTemp(Number(sensors.other?.batteryZone||0))}°{unit}</button>
          <button onClick={()=>setSelected((prev:any)=>({...prev, inlet: !prev.inlet}))} className={`px-3 py-1 rounded text-sm font-mono ${selected.inlet?'bg-indigo-600 text-white':'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Entrada {formatTemp(Number(sensors.other?.inlet||0))}°{unit}</button>
          <button onClick={()=>setSelected((prev:any)=>({...prev, memory: !prev.memory}))} className={`px-3 py-1 rounded text-sm font-mono ${selected.memory?'bg-purple-600 text-white':'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Memory {formatTemp(Number(sensors.other?.memory||0))}°{unit}</button>
          <button onClick={()=>setSelected((prev:any)=>({...prev, vr_p2: !prev.vr_p2}))} className={`px-3 py-1 rounded text-sm font-mono ${selected.vr_p2?'bg-orange-600 text-white':'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>VR P2 {formatTemp(Number(sensors.other?.vr_p2||0))}°{unit}</button>
          <button onClick={()=>setSelected((prev:any)=>({...prev, vr_p1: !prev.vr_p1}))} className={`px-3 py-1 rounded text-sm font-mono ${selected.vr_p1?'bg-orange-700 text-white':'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>VR P1 {formatTemp(Number(sensors.other?.vr_p1||0))}°{unit}</button>
          <button onClick={()=>setSelected((prev:any)=>({...prev, ps2: !prev.ps2}))} className={`px-3 py-1 rounded text-sm font-mono ${selected.ps2?'bg-yellow-700 text-white':'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>P/S 2 {formatTemp(Number(sensors.other?.ps2||0))}°{unit}</button>
          <button onClick={()=>setSelected((prev:any)=>({...prev, systemBoard: !prev.systemBoard}))} className={`px-3 py-1 rounded text-sm font-mono ${selected.systemBoard?'bg-sky-700 text-white':'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>System Board {formatTemp(Number(sensors.other?.systemBoard||0))}°{unit}</button>
          <button onClick={()=>setSelected((prev:any)=>({...prev, sysExhaust: !prev.sysExhaust}))} className={`px-3 py-1 rounded text-sm font-mono ${selected.sysExhaust?'bg-cyan-700 text-white':'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Sys Exhaust {formatTemp(Number(sensors.other?.sysExhaust||0))}°{unit}</button>
          <button onClick={()=>setSelected((prev:any)=>({...prev, hdController: !prev.hdController}))} className={`px-3 py-1 rounded text-sm font-mono ${selected.hdController?'bg-pink-600 text-white':'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>HD Controller {formatTemp(Number(sensors.other?.hdController||0))}°{unit}</button>
        </>)}
      </div>
    </div>
  );
}
