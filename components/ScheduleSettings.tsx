
import React, { useState } from 'react';
import { Calendar, Plus, Trash2, Clock, Save, X, FileText, ToggleLeft, ToggleRight } from 'lucide-react';
import { ScheduleItem, Translation } from '../types';

interface ScheduleSettingsProps {
  t: Translation;
  schedules: ScheduleItem[];
  onUpdateSchedules: (schedules: ScheduleItem[]) => void;
  lang: string;
}

export function ScheduleSettings({ t, schedules, onUpdateSchedules, lang }: ScheduleSettingsProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTime, setNewTime] = useState('12:00');
  const [newSpeed, setNewSpeed] = useState(30);
  const [newDescription, setNewDescription] = useState('');
  const [hour, setHour] = useState<number>(12);
  const [minute, setMinute] = useState<number>(0);

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const syncFromString = (s: string) => {
    const [h,m] = (s || '12:00').split(':');
    const hh = Math.max(0, Math.min(23, Number(h)||0));
    const mm = Math.max(0, Math.min(59, Number(m)||0));
    setHour(hh);
    setMinute(mm);
  };
  React.useEffect(()=>{ syncFromString(newTime); }, [isModalOpen]);

  const handleAddSchedule = () => {
    if (!newTime) return;
    
    const newSchedule: ScheduleItem = {
      id: Date.now().toString(),
      description: newDescription || 'Task',
      time: `${pad2(hour)}:${pad2(minute)}`,
      speed: newSpeed,
      active: true,
    };
    const updated = [...schedules, newSchedule].sort((a, b) => a.time.localeCompare(b.time));
    onUpdateSchedules(updated);
    
    setIsModalOpen(false);
    // Reset form
    setNewTime('12:00');
    setHour(12);
    setMinute(0);
    setNewSpeed(30);
    setNewDescription('');
  };

  const removeSchedule = (id: string) => {
    onUpdateSchedules(schedules.filter(s => s.id !== id));
  };

  const toggleSchedule = (id: string) => {
    onUpdateSchedules(schedules.map(s => s.id === id ? { ...s, active: !s.active } : s));
  };

  const formatTime = (hhmm: string) => {
    const [h, m] = hhmm.split(':');
    const d = new Date();
    d.setHours(Number(h)||0, Number(m)||0, 0, 0);
    try {
      return d.toLocaleTimeString(lang || 'pt', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return hhmm;
    }
  };

  return (
    <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 shadow-lg relative flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Calendar className="text-blue-400" />
          {t.schedules}
        </h2>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors shadow-lg shadow-blue-600/20"
        >
          <Plus size={16} />
          {t.addSchedule}
        </button>
      </div>

      <div className="space-y-3 overflow-y-auto pr-2 flex-1 min-h-[200px]">
        {schedules.length === 0 ? (
          <div className="text-center py-8 text-slate-500 border-2 border-dashed border-slate-700 rounded-lg h-full flex flex-col items-center justify-center">
            <Calendar size={32} className="mx-auto mb-2 opacity-50" />
            <p>{t.noSchedules}</p>
          </div>
        ) : (
          schedules.map((schedule) => (
            <div
              key={schedule.id}
              className={`flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-900/50 p-3 rounded-lg border transition-colors ${schedule.active ? 'border-slate-700 hover:border-slate-600' : 'border-slate-800 opacity-60'}`}
            >
              <div className="flex items-center gap-2 text-slate-300 min-w-[90px]">
                <Clock size={16} className={schedule.active ? "text-slate-500" : "text-slate-700"} />
                <span className="font-mono text-lg">{formatTime(schedule.time)}</span>
              </div>

              <div className="flex-1 flex flex-col justify-center">
                <span className="text-sm text-white font-medium">{schedule.description}</span>
                <div className="flex items-center gap-2 mt-1">
                   <div className="h-1.5 w-16 bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full ${schedule.active ? 'bg-blue-500' : 'bg-slate-500'}`} style={{ width: `${schedule.speed}%` }}></div>
                   </div>
                   <span className="text-xs text-slate-400 font-mono">{schedule.speed}%</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                    onClick={() => toggleSchedule(schedule.id)}
                    className={`transition-colors p-2 rounded hover:bg-slate-800 ${schedule.active ? 'text-green-500' : 'text-slate-600'}`}
                    title={schedule.active ? "Active" : "Inactive"}
                >
                    {schedule.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                </button>
                <button
                    onClick={() => removeSchedule(schedule.id)}
                    className="text-slate-500 hover:text-red-400 transition-colors p-2 rounded hover:bg-slate-800"
                    title="Remove"
                >
                    <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de Adicionar Horário */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-600 w-full max-w-sm shadow-2xl animate-fade-in">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-white">{t.addSchedule}</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                    <X size={20} />
                </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">{t.description}</label>
                <div className="relative">
                    <input 
                        type="text" 
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        placeholder="Ex: Night Mode"
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 pl-10 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                    <FileText className="absolute left-3 top-3.5 text-slate-500 pointer-events-none" size={18} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">{t.time}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={hour}
                    onChange={(e)=>setHour(Math.max(0, Math.min(23, Number(e.target.value)||0)))}
                    className="w-20 bg-slate-900 border border-slate-600 rounded-lg p-2 text-white focus:border-blue-500 font-mono"
                  />
                  <span className="text-slate-400">:</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={minute}
                    onChange={(e)=>setMinute(Math.max(0, Math.min(59, Number(e.target.value)||0)))}
                    className="w-20 bg-slate-900 border border-slate-600 rounded-lg p-2 text-white focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                    <label className="text-sm font-medium text-slate-300">{t.speed}</label>
                    <span className="text-blue-400 font-bold">{newSpeed}%</span>
                </div>
                <input 
                  type="range" 
                  min="10" 
                  max="100" 
                  step="5"
                  value={newSpeed}
                  onChange={(e) => setNewSpeed(Number(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-2 font-medium">
                  <span>Silent (10%)</span>
                  <span>Turbo (100%)</span>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                >
                  {t.cancel}
                </button>
                <button 
                  onClick={handleAddSchedule}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 font-medium shadow-lg shadow-blue-600/20"
                >
                  <Save size={18} />
                  {t.save}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
