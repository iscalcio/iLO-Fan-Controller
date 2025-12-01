import React, { useEffect, useMemo, useState, memo } from 'react';
import { Activity, Save, Database, Trash2 } from 'lucide-react';
import { TempUnit, IloSettings, Translation, Language, TempData } from '../types';
import { getTemperatureData, getHistorySize, clearHistory } from '../services/mockService';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

type Point = TempData;

const CpuChartInner: React.FC<{ unit: TempUnit; t: Translation; settings: IloSettings; lang: Language; idle: boolean; loggedIn: boolean }> = ({ unit, t, settings, lang, idle, loggedIn }) => {
  const [period, setPeriod] = useState<string>('1h');
  const [data, setData] = useState<Point[]>([]);
  const [loading, setLoading] = useState(false);
  const [histInfo, setHistInfo] = useState<{ totalBytes: number; files: { name: string; bytes: number }[] } | null>(null);
  const [selected, setSelected] = useState<string[]>(['cpu1','cpu2','ambient']);

  const format = (v: number) => unit === 'F' ? (((v * 9) / 5) + 32) : v;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const points = await getTemperatureData(period, settings);
        if (mounted) setData(points.map(p => ({
          ...p,
          cpu1: format(Number(p.cpu1||0)),
          cpu2: format(Number(p.cpu2||0)),
          ambient: format(Number(p.ambient||0)),
          chipset: p.chipset!=null ? format(Number(p.chipset)) : p.chipset,
          batteryZone: p.batteryZone!=null ? format(Number(p.batteryZone)) : p.batteryZone,
          inlet: p.inlet!=null ? format(Number(p.inlet)) : p.inlet,
          memory: p.memory!=null ? format(Number(p.memory)) : p.memory,
          vr_p2: p.vr_p2!=null ? format(Number(p.vr_p2)) : p.vr_p2,
          vr_p1: p.vr_p1!=null ? format(Number(p.vr_p1)) : p.vr_p1,
          ps2: p.ps2!=null ? format(Number(p.ps2)) : p.ps2,
          systemBoard: p.systemBoard!=null ? format(Number(p.systemBoard)) : p.systemBoard,
          sysExhaust: p.sysExhaust!=null ? format(Number(p.sysExhaust)) : p.sysExhaust,
          hdController: p.hdController!=null ? format(Number(p.hdController)) : p.hdController
        })));
      } catch { if (mounted) setData([]); }
      setLoading(false);
    };
    if (loggedIn && !idle) load();
    return () => { mounted = false; };
  }, [period, unit, loggedIn, idle, settings]);

  useEffect(() => { (async () => { try { const info = await getHistorySize(); setHistInfo(info); } catch {} })(); }, [period]);

  const names: Record<string,string> = {
    cpu1: 'CPU1', cpu2: 'CPU2', ambient: 'Ambient', chipset: 'Chipset', batteryZone: 'Battery', inlet: 'Entrada', memory: 'Memory',
    vr_p2: 'VR P2', vr_p1: 'VR P1', ps2: 'P/S 2', systemBoard: 'System Board', sysExhaust: 'Sys Exhaust', hdController: 'HD Controller'
  };
  const colors: Record<string,string> = {
    cpu1: '#60a5fa', cpu2: '#34d399', ambient: '#f59e0b', chipset: '#a78bfa', batteryZone: '#fb7185', inlet: '#22d3ee', memory: '#d946ef',
    vr_p2: '#84cc16', vr_p1: '#eab308', ps2: '#ef4444', systemBoard: '#10b981', sysExhaust: '#f97316', hdController: '#64748b'
  };

  const downloadCSV = () => {
    try {
      const cols = ['time', ...selected];
      const header = cols.map(c => c==='time' ? 'time' : names[c] || c);
      const rows = [header, ...data.map(d => cols.map(c => String((d as any)[c] ?? '')))];
      const csv = rows.map(r => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `temperaturas_${period}_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {}
  };

  const totalMB = useMemo(() => histInfo ? (histInfo.totalBytes / (1024*1024)).toFixed(2) : '0.00', [histInfo]);
  const latest = useMemo(() => (data.length>0 ? data[data.length-1] : null), [data]);
  const unitLabel = `°${unit}`;

  return (
    <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 shadow-lg min-h-[360px] h-full">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Activity className="text-blue-400" />
          {t.cpuChartTitle}
        </h2>
        <div className="flex items-center gap-2">
          <select value={period} onChange={e=>setPeriod(e.target.value)} className="bg-slate-900 text-white text-sm px-2 py-1 rounded border border-slate-700">
            <option value="1h">1h</option>
            <option value="24h">24h</option>
            <option value="7d">7d</option>
            <option value="1m">1m</option>
            <option value="1y">1y</option>
            <option value="5y">5y</option>
          </select>
          <button onClick={downloadCSV} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 hover:text-white" title="Exportar CSV">
            <Save size={18} />
          </button>
        </div>
      </div>

      <div className="text-xs text-slate-400 mb-3 flex items-center gap-3">
        <span className="flex items-center gap-1"><Database size={14} /> {totalMB} MB</span>
        <button onClick={async()=>{ const ok = await clearHistory(); if(ok){ const info = await getHistorySize(); setHistInfo(info); } }} className="flex items-center gap-1 text-red-400 hover:text-red-300">
          <Trash2 size={14} /> limpar
        </button>
      </div>

      <div className="bg-slate-950 rounded-lg p-2 min-h-[280px]">
        {loading && <div className="text-slate-500 text-sm px-2 py-2">{t.loading}...</div>}
        {!loading && data.length === 0 && <div className="text-slate-500 text-sm px-2 py-2">{t.noData}</div>}
        {!loading && data.length > 0 && (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#475569' }} minTickGap={24} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#475569' }} domain={["auto","auto"]} label={{ value: `°${unit}`, angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
                <Legend wrapperStyle={{ color: '#e2e8f0' }} />
                {selected.map((key) => (
                  <Line key={key} type="monotone" dataKey={key} name={(names[key]||key)} stroke={colors[key]||'#60a5fa'} strokeWidth={2} dot={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {Object.keys(names).map((key) => {
          const val = (latest && (latest as any)[key]);
          const isSelected = selected.includes(key);
          return (
            <button
              key={key}
              onClick={() => {
                setSelected((prev) => prev.includes(key) ? prev.filter(k=>k!==key) : [...prev, key]);
              }}
              className={`px-2 py-1 rounded border ${isSelected ? 'bg-slate-700 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
              title={isSelected ? 'Ocultar da série' : 'Mostrar na série'}
              style={{ color: isSelected ? undefined : undefined }}
            >
              <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: colors[key]||'#94a3b8' }} />
              <span className="text-xs">{names[key]} {val!=null ? `${Number(val).toFixed(1)}${unitLabel}` : `--${unitLabel}`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const CpuChart = memo(CpuChartInner);
