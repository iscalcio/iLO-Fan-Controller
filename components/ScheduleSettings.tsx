import React, { useEffect, useMemo, useState, memo } from 'react';
import { Clock, Settings as Cog, Trash2, Plus, Calendar } from 'lucide-react';
import { Translation, ScheduleItem, Language, IloSettings } from '../types';
import { setFanAuto, setFanSpeed } from '../services/mockService';

const ScheduleSettingsInner: React.FC<{ t: Translation; schedules: ScheduleItem[]; onUpdateSchedules: (s: ScheduleItem[]) => void; lang: Language; settings: IloSettings; onLog?: (message: string, type?: 'info'|'success'|'error'|'warning') => void }>
 = ({ t, schedules, onUpdateSchedules, lang, settings, onLog }) => {
  const [time, setTime] = useState('00:00');
  const [speed, setSpeed] = useState(30);
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [mode, setMode] = useState<'manual'|'auto'>('manual');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => { if (schedules.length === 0) { onUpdateSchedules([]); } }, []);

  const addSchedule = () => {
    if (!time || !/^\d{2}:\d{2}$/.test(time)) return alert('Horário inválido');
    const item: ScheduleItem = { id: (Date.now().toString()+Math.random()), time, speed, description: description || `${speed}% @ ${time}`, active, mode };
    onUpdateSchedules([...schedules, item]);
    setDescription('');
  };

  const updateSchedule = (idx: number, patch: Partial<ScheduleItem>) => {
    const next = schedules.slice();
    next[idx] = { ...next[idx], ...patch };
    onUpdateSchedules(next);
  };

  const removeSchedule = (idx: number) => {
    const next = schedules.filter((_, i) => i !== idx);
    onUpdateSchedules(next);
  };

  const sorted = useMemo(() => schedules.slice().sort((a,b)=>a.time.localeCompare(b.time)), [schedules]);

  return (
    <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 shadow-lg min-h-[360px] h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="text-blue-400" />
          <h2 className="text-base font-bold text-white">{t.schedules}</h2>
        </div>
        <button onClick={()=>setAdding(true)} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-1 text-sm">
          <Plus size={14} /> {t.addSchedule}
        </button>
      </div>

      {adding && (
        <div className="bg-slate-900 rounded px-3 py-2 mb-2 space-y-2">
          <div className="flex items-center gap-3">
            <input value={time} onChange={e=>setTime(e.target.value)} type="text" placeholder="HH:MM" pattern="^\\d{2}:\\d{2}$" className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white min-w-[96px] text-sm" />
            <input value={description} onChange={e=>setDescription(e.target.value)} placeholder={t.description} className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm" />
            <label className="text-slate-300 text-xs flex items-center gap-1"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)} /> {t.active}</label>
            <button onClick={()=>setMode(mode==='auto'?'manual':'auto')} className={`px-2 py-1 rounded text-xs ${mode==='auto'?'bg-green-600 text-white':'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}>{mode==='auto'?t.autoMode:t.manualControl}</button>
          </div>
            <div className="flex items-center gap-3">
              <span className="text-slate-400 text-xs uppercase tracking-wide">{t.speed}</span>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={speed}
                onChange={(e)=>setSpeed(Number(e.target.value))}
                disabled={mode==='auto'}
                className={`flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none ${mode==='auto'?'opacity-40 pointer-events-none':''}`}
              />
              <span className="text-slate-300 font-bold min-w-[46px] text-right text-xs">{mode==='auto' ? 'AUTO' : `${speed}%`}</span>
            </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={()=>{ addSchedule(); setAdding(false); }} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">{t.addSchedule}</button>
            <button onClick={()=>{ setAdding(false); }} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm">{t.cancel}</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {sorted.length === 0 && (
          <div className="rounded border border-slate-700 bg-slate-900/50 min-h-[160px] flex items-center justify-center">
            <div className="text-center text-slate-500">
              <Calendar className="mx-auto mb-2" />
              {t.noSchedules}
            </div>
          </div>
        )}
        {sorted.map((s, idx) => (
          <div key={`${s.time}-${idx}`} className="bg-slate-900 rounded px-3 py-2">
            <div className="flex items-center gap-3">
              <span className="font-mono text-slate-300 min-w-[64px] text-sm">{s.time}</span>
              <span className="flex-1 text-slate-300 text-sm">{s.description}</span>
              <button onClick={()=>updateSchedule(idx,{ mode: (s.mode==='auto'?'manual':'auto') })} className={`px-2 py-1 rounded text-xs ${s.mode==='auto'?'bg-green-600 text-white':'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}>{s.mode==='auto'?t.autoMode:t.manualControl}</button>
              <button
                onClick={async()=>{ try { if ((s.mode||'manual')==='auto') { const r = await setFanAuto(settings); if (r?.success) onLog?.('Agendamento: modo AUTO aplicado agora', 'success'); else onLog?.('Falha ao aplicar AUTO', 'error'); } else { await setFanSpeed(s.speed, settings); onLog?.(`Agendamento: ${s.speed}% aplicado agora`, 'success'); } } catch(e:any){ onLog?.(`Erro: ${e?.message||'falha'}`, 'error'); } }}
                className="px-2 py-1 rounded text-xs bg-blue-600 hover:bg-blue-700 text-white"
                title="Aplicar agora"
              >Aplicar</button>
              <button onClick={()=>removeSchedule(idx)} className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded text-white" title={t.remove}><Trash2 size={14} /></button>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-slate-400 text-xs uppercase tracking-wide">{t.speed}</span>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={s.speed}
                onChange={(e)=>updateSchedule(idx,{ speed: Number(e.target.value) })}
                disabled={s.mode==='auto'}
                className={`flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none ${s.mode==='auto'?'opacity-40 pointer-events-none':''}`}
              />
              <span className="text-slate-300 font-bold min-w-[46px] text-right text-xs">{s.mode==='auto' ? 'AUTO' : `${s.speed}%`}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const ScheduleSettings = memo(ScheduleSettingsInner);
