import React, { useState } from 'react';
import { X, Save, Wifi, CheckCircle, AlertCircle } from 'lucide-react';
import { IloSettings, TempUnit, Language, Translation } from '../types';
import { testConnection, updateSystemPort, changeSystemPassword, resetSystemBackend, saveServerConfig, downloadBackup, restoreBackup } from '../services/mockService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: IloSettings;
  onSave: (settings: IloSettings) => void;
  currentUnit: TempUnit;
  onUnitChange: (unit: TempUnit) => void;
  currentLang: Language;
  onLangChange: (lang: Language) => void;
  t: Translation;
}

export function SettingsModal({ 
  isOpen, 
  onClose, 
  currentSettings, 
  onSave,
  currentUnit,
  onUnitChange,
  currentLang,
  onLangChange,
  t
}: SettingsModalProps) {
  const [settings, setSettings] = useState<IloSettings>(currentSettings);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testMessage, setTestMessage] = useState<string>('');
  const [port, setPort] = useState<string>('');
  const [showPortConfirm, setShowPortConfirm] = useState(false);
  const [isRebooting, setIsRebooting] = useState(false);
  const [loginBgType, setLoginBgType] = useState<'solid'|'gradient'|'image'>('solid');
  const [loginBgImage, setLoginBgImage] = useState('');
  const [loginBgBlur, setLoginBgBlur] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      const curr = String(window.location.port || '8000');
      setPort(curr);
      try {
        const raw = localStorage.getItem('ilo_login_bg_cfg') || '';
        if (raw) {
          const obj = JSON.parse(raw);
          if (obj?.type) setLoginBgType(obj.type);
          if (obj?.image) setLoginBgImage(obj.image);
          if (typeof obj?.blur === 'boolean') setLoginBgBlur(!!obj.blur);
        }
      } catch {}
    }
  }, [isOpen]);
  const [showPwModal, setShowPwModal] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [safetyEnabled, setSafetyEnabled] = useState(true);
  const [safetyThreshold, setSafetyThreshold] = useState<number>(90);
  const [safetySpeed, setSafetySpeed] = useState<number>(100);

  const readSafety = () => {
    try {
      const raw = localStorage.getItem('ilo_safety') || '';
      if (!raw) {
        localStorage.setItem('ilo_safety', JSON.stringify({ enabled: true, thresholdC: 90, speed: 100 }));
      }
      const obj = raw ? JSON.parse(raw) : { enabled: true, thresholdC: 90, speed: 100 };
      setSafetyEnabled(true);
      setSafetySpeed(Math.min(100, Math.max(5, Number(obj?.speed || 100))));
      const thrC = Number(obj?.thresholdC || 75);
      const thrDisplay = currentUnit === 'F' ? ((thrC * 9) / 5 + 32) : thrC;
      setSafetyThreshold(Number(thrDisplay.toFixed(1)));
    } catch {}
  };
  const writeSafety = (enabled = true, thresholdDisplay = safetyThreshold, speed = safetySpeed) => {
    try {
      const thrC = currentUnit === 'F' ? ((Number(thresholdDisplay) - 32) * 5) / 9 : Number(thresholdDisplay);
      const obj = { enabled: true, thresholdC: Number(thrC.toFixed(1)), speed: Math.min(100, Math.max(5, Number(speed))) };
      localStorage.setItem('ilo_safety', JSON.stringify(obj));
    } catch {}
  };

  React.useEffect(() => { readSafety(); }, [isOpen, currentUnit]);

  if (!isOpen) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection(settings);
      setTestResult(result.success ? 'success' : 'error');
      setTestMessage(result.message);
    } catch (e) {
      setTestResult('error');
      setTestMessage('Falha ao conectar');
    }
    setTesting(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      host: settings.host.trim(),
      username: settings.username.trim(),
      password: (settings.password || '').trim()
    });
    saveServerConfig({ host: settings.host.trim(), username: settings.username.trim(), password: (settings.password || '').trim() });
    try { localStorage.setItem('ilo_login_bg_cfg', JSON.stringify({ type: loginBgType, image: loginBgImage.trim(), blur: !!loginBgBlur })); } catch {}
    writeSafety();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 p-6 rounded-md w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-700 shadow-xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            {t.serverSettings}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1">{t.hostIp}</label>
              <input
                type="text"
                value={settings.host}
                onChange={(e) => setSettings({...settings, host: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                placeholder="192.168.15.103"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">{t.username}</label>
              <input
                type="text"
                value={settings.username}
                onChange={(e) => setSettings({...settings, username: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">{t.password}</label>
              <input
                type="password"
                value={settings.password}
                onChange={(e) => setSettings({...settings, password: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          

          <div className="flex items-center gap-4 py-2">
             <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-white transition-colors disabled:opacity-50"
             >
               <Wifi size={16} />
               {testing ? t.testing : t.testConnection}
             </button>
             {testResult === 'success' && <span className="text-green-400 text-sm flex items-center gap-1"><CheckCircle size={14}/> {testMessage || t.connectionSuccess}</span>}
             {testResult === 'error' && <span className="text-red-400 text-sm flex items-center gap-1"><AlertCircle size={14}/> {testMessage || t.connectionFailed}</span>}
          </div>

          <div className="border-t border-slate-700 pt-4 mt-4">
             <h3 className="text-sm font-bold text-white mb-3">Preferências</h3>
             
             {/* Temp Unit Selector */}
             <div className="flex items-center justify-between mb-4">
                <span className="text-slate-300 text-sm">{t.tempUnit}</span>
                <div className="flex bg-slate-900 rounded-lg p-1">
                   <button
                     type="button"
                     onClick={() => onUnitChange('C')}
                     className={`px-3 py-1 rounded text-sm font-medium transition-colors ${currentUnit === 'C' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                   >
                     °C
                   </button>
                   <button
                     type="button"
                     onClick={() => onUnitChange('F')}
                     className={`px-3 py-1 rounded text-sm font-medium transition-colors ${currentUnit === 'F' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                   >
                     °F
                   </button>
                </div>
             </div>

            {/* Language Selector */}
            <div className="flex items-center justify-between">
               <span className="text-slate-300 text-sm">{t.language}</span>
               <div className="flex bg-slate-900 rounded-lg p-1 gap-1">
                  {(['pt', 'en', 'es', 'fr'] as Language[]).map((lang) => (
                     <button
                       key={lang}
                       type="button"
                       onClick={() => onLangChange(lang)}
                       className={`px-2 py-1 rounded text-xs font-bold uppercase transition-colors ${currentLang === lang ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                     >
                       {lang}
                     </button>
                  ))}
               </div>
            </div>

             <div className="mt-4 p-3 rounded-lg border border-slate-700 bg-slate-900/40">
               <h4 className="text-sm font-bold text-white mb-2">Proteção de temperatura</h4>
               <div className="text-xs text-slate-400 mb-3">Sempre habilitada</div>
               <div className="grid grid-cols-2 gap-3">
                 <div>
                   <label className="block text-xs text-slate-400 mb-1">Limite de temperatura ({currentUnit})</label>
                   <input type="number" value={safetyThreshold} onChange={(e)=>{ const v = Number(e.target.value); setSafetyThreshold(v); writeSafety(true, v, safetySpeed); }} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white" />
                 </div>
                 <div>
                   <label className="block text-xs text-slate-400 mb-1">Velocidade (%)</label>
                  <input type="number" min={5} max={100} value={safetySpeed} onChange={(e)=>{ const v = Math.min(100, Math.max(5, Number(e.target.value)||100)); setSafetySpeed(v); writeSafety(true, safetyThreshold, v); }} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white" />
                 </div>
               </div>
              <p className="text-xs text-slate-500 mt-2">Quando a média dos CPUs atingir o limite, as ventoinhas serão ajustadas para a velocidade definida.</p>
            </div>
            <div className="mt-4 p-3 rounded-md border border-slate-700 bg-slate-900/40">
              <h4 className="text-sm font-bold text-white mb-2">Tela de Login</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Fundo</label>
                  <select value={loginBgType} onChange={(e)=>setLoginBgType(e.target.value as any)} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white">
                    <option value="solid">Sólido</option>
                    <option value="gradient">Gradiente</option>
                    <option value="image">Imagem (URL)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Blur de fundo</label>
                  <input type="checkbox" checked={loginBgBlur} onChange={(e)=>setLoginBgBlur(e.target.checked)} />
                </div>
              </div>
              {loginBgType === 'image' && (
                <div className="mt-2">
                  <label className="block text-xs text-slate-400 mb-1">URL da imagem</label>
                  <input type="text" value={loginBgImage} onChange={(e)=>setLoginBgImage(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white" placeholder="https://.../background.jpg" />
                </div>
              )}
            </div>
          </div>

             <div className="mt-4">
               <div className="grid md:grid-cols-3 gap-3">
                 <div className="md:col-span-2">
                   <label className="block text-sm font-medium text-slate-300 mb-1">Porta do sistema</label>
                   <input
                     type="number"
                     value={port}
                     onChange={(e) => setPort(e.target.value)}
                     placeholder="8000"
                     className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                   />
                 </div>
                 <div className="flex items-end">
                   <button
                     type="button"
                     onClick={() => { const p = Number(port); if (p > 0 && p < 65536) { setShowPortConfirm(true); } }}
                     className="w-full px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-white"
                   >
                     Aplicar Porta
                   </button>
                 </div>
               </div>
             </div>

            <div className="mt-4 flex gap-2">
               <button
                 type="button"
                 onClick={() => setShowPwModal(true)}
                 className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-white"
               >
                 Trocar Senha
               </button>
               <button
                 type="button"
                 onClick={async () => { const ok = await resetSystemBackend(); if (ok) { localStorage.clear(); window.location.reload(); } }}
                 className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded text-sm text-white"
               >
                 Redefinir Sistema
               </button>
                <button
                  type="button"
                  onClick={()=>downloadBackup()}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-white"
                >
                  Backup
                </button>
                <label className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-white cursor-pointer">
                  Restaurar
                  <input type="file" accept="application/json" className="hidden" onChange={async (e)=>{ const f = e.target.files?.[0]; if (f) { const ok = await restoreBackup(f); if (ok) { alert('Backup restaurado'); } else { alert('Falha na restauração'); } } }} />
                </label>
            </div>

             {showPwModal && (
               <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                 <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 w-full max-w-sm">
                   <h3 className="text-white text-lg mb-3">Trocar Senha</h3>
                   <div className="space-y-3">
                     <input type="password" value={oldPw} onChange={(e)=>setOldPw(e.target.value)} placeholder="Senha atual" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white" />
                     <input type="password" value={newPw} onChange={(e)=>setNewPw(e.target.value)} placeholder="Nova senha" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white" />
                     <div className="flex justify-end gap-2">
                       <button onClick={()=>setShowPwModal(false)} className="px-3 py-2 text-slate-300 hover:text-white">Cancelar</button>
                       <button onClick={async ()=>{ if(newPw.length>=4){ const res = await changeSystemPassword(oldPw, newPw); alert(res.success ? 'Senha alterada' : (res.error || 'Falha ao alterar senha')); if(res.success){ setShowPwModal(false); setOldPw(''); setNewPw(''); } } }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded">Salvar</button>
                     </div>
                   </div>
                 </div>
               </div>
             )}

             {showPortConfirm && (
               <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                 <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 w-full max-w-sm">
                   <h3 className="text-white text-lg mb-3">O servidor vai reiniciar</h3>
                   <p className="text-sm text-slate-300 mb-4">Aplicar a nova porta e redirecionar?</p>
                   <div className="flex justify-end gap-2">
                     <button
                       onClick={() => { setShowPortConfirm(false); setPort(String(window.location.port || '8000')); }}
                       className="px-3 py-2 text-slate-300 hover:text-white"
                     >
                       Cancelar
                     </button>
                     <button
                       onClick={async () => {
                         const p = Number(port);
                         setIsRebooting(true);
                         const ok = await updateSystemPort(p);
                         if (ok) {
                           const target = `${window.location.protocol}//${window.location.hostname}:${p}/`;
                           let tries = 0;
                           const attempt = () => {
                             tries++;
                             try { fetch(target, { mode: 'no-cors' }).catch(()=>{}); } catch{}
                             setTimeout(() => {
                               if (tries < 5) attempt();
                               else window.location.href = target;
                             }, 1000);
                           };
                           attempt();
                         } else {
                           setIsRebooting(false);
                           setShowPortConfirm(false);
                         }
                       }}
                       className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                     >
                       Continuar
                     </button>
                   </div>
                 </div>
               </div>
             )}

             {isRebooting && (
               <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
                 <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 w-full max-w-sm text-center">
                   <div className="animate-spin mx-auto mb-3 h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
                   <h3 className="text-white text-lg">Reiniciando servidor...</h3>
                   <p className="text-sm text-slate-300 mt-1">Aguarde o redirecionamento automático.</p>
                 </div>
               </div>
             )}
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-2"
            >
              <Save size={18} />
              {t.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
