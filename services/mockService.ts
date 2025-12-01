import { TempData, IloSettings } from '../types';

// Função auxiliar para criar headers com as configurações
const getAuthHeaders = (settings: IloSettings) => {
  return {
    'Content-Type': 'application/json',
    'x-ilo-host': settings.host,
    'x-ilo-username': settings.username,
    'x-ilo-password': settings.password || ''
  };
};

export const setFanSpeed = async (speed: number, settings: IloSettings, force: boolean = false): Promise<{ success: boolean; uncontrolled?: string[]; readback?: any }> => {
  try {
    const response = await fetch('/api/fan', {
      method: 'POST',
      headers: getAuthHeaders(settings),
      body: JSON.stringify({ speed, force })
    });
    if (!response.ok) {
      let msg = 'Falha na API';
      try {
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data = await response.json();
          msg = String(data?.error || msg);
        }
      } catch {}
      throw new Error(msg);
    }
    try {
      const ct = response.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await response.json();
        return { success: true, uncontrolled: data?.uncontrolled || [], readback: data?.readback };
      }
    } catch {}
    return { success: true };
  } catch (e) {
    console.error('Erro ao definir velocidade:', e);
    throw e;
  }
};

export const setFanSpeedIndex = async (idx: number, speed: number, settings: IloSettings, force: boolean = false): Promise<boolean> => {
  try {
    const response = await fetch(`/api/fan/${idx}`, {
      method: 'POST',
      headers: getAuthHeaders(settings),
      body: JSON.stringify({ speed, force })
    });
    if (!response.ok) {
      let msg = 'Falha na API';
      try {
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data = await response.json();
          msg = String(data?.error || msg);
        }
      } catch {}
      throw new Error(msg);
    }
    return true;
  } catch (e) {
    console.error('Erro ao definir velocidade (idx):', e);
    throw e;
  }
};

export const getFanStatus = async (settings: IloSettings): Promise<any> => {
    try {
        const response = await fetch('/api/fans', {
            headers: getAuthHeaders(settings)
        });
        if(response.ok) return await response.json();
        return {};
    } catch(e) {
        return {};
    }
}

export const getFanCooldown = async (): Promise<{ cooldownMs: number; remainingMs: number } | null> => {
  try {
    const res = await fetch('/api/fan/cooldown');
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
};

export const testConnection = async (settings: IloSettings): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await fetch('/api/redfish/thermal', { headers: getAuthHeaders(settings) });
    const data = await response.json();
    const temps = data?.temps || data;
    if (response.ok && (Number(temps.cpu1) > 0 || Number(temps.cpu2) > 0 || Number(temps.ambient) > 0)) {
      return { success: true, message: 'Conectado com sucesso' };
    }
    const msg = data?.error ? String(data.error) : 'Falha ao conectar';
    return { success: false, message: msg };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Falha ao conectar' };
  }
};

export const getSensorsData = async (settings: IloSettings): Promise<{ fans: Record<string, number>; temps: { cpu1: number; cpu2: number; ambient: number }; other?: Record<string, number> }> => {
  try {
    const response = await fetch('/api/sensors', { headers: getAuthHeaders(settings) });
    if (response.ok) return await response.json();
    throw new Error('Falha');
  } catch (e) {
    try {
      const rf = await fetch('/api/redfish/thermal', { headers: getAuthHeaders(settings) });
      if (rf.ok) return await rf.json();
    } catch {}
    return { fans: {}, temps: { cpu1: 0, cpu2: 0, ambient: 0 }, other: {} };
  }
};

export const updateSystemPort = async (port: number): Promise<boolean> => {
  try {
    const response = await fetch('/api/port', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port })
    });
    if (!response.ok) return false;
    return true;
  } catch (e) {
    return false;
  }
};


export const getServerConfig = async (): Promise<IloSettings | null> => {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) return null;
    const data = await response.json();
    return data;
  } catch {
    return null;
  }
};

export const saveServerConfig = async (settings: IloSettings): Promise<boolean> => {
  try {
    const response = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: settings.host, username: settings.username, password: settings.password || '' })
    });
    return response.ok;
  } catch {
    return false;
  }
};

export const writeAppLog = async (message: string, type: 'info'|'success'|'error'|'warning' = 'info'): Promise<void> => {
  try {
    await fetch('/api/app-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, type }) });
  } catch {}
};

export const setFanAuto = async (settings: IloSettings): Promise<{ success: boolean; readback?: any; error?: string }> => {
  const attempt = async (): Promise<{ success: boolean; readback?: any; error?: string }> => {
    try {
      const res = await fetch('/api/fan/auto', { method: 'POST', headers: getAuthHeaders(settings) });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok) {
        if (ct.includes('application/json')) {
          try { const j = await res.json(); return { success: false, error: String(j?.error || 'Falha auto') }; } catch {}
        }
        try { const txt = await res.text(); return { success: false, error: txt || 'Falha auto' }; } catch { return { success: false, error: 'Falha auto' }; }
      }
      if (ct.includes('application/json')) {
        try { const j = await res.json(); return { success: true, readback: j?.readback }; } catch {}
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Falha auto' };
    }
  };
  const r1 = await attempt();
  if (r1.success || !String(r1.error||'').toLowerCase().includes('econnreset')) return r1;
  await new Promise(res => setTimeout(res, 300));
  const r2 = await attempt();
  return r2;
};

export const setFanManual = async (settings: IloSettings): Promise<{ success: boolean; error?: string }> => {
  try {
    const res = await fetch('/api/fan/manual', { method: 'POST', headers: getAuthHeaders(settings) });
    if (!res.ok) return { success: false, error: (await res.text()) };
    return await res.json();
  } catch (e: any) {
    return { success: false, error: e?.message || 'Falha manual' };
  }
};

export const setFanMode = async (mode: 'auto'|'manual', settings: IloSettings): Promise<{ success: boolean; mode?: string; error?: string }> => {
  try {
    const res = await fetch('/api/fan/mode', { method: 'POST', headers: getAuthHeaders(settings), body: JSON.stringify({ mode }) });
    if (!res.ok) return { success: false, error: (await res.text()) };
    return await res.json();
  } catch (e: any) {
    return { success: false, error: e?.message || 'Falha ao persistir modo' };
  }
};

export const getFanMode = async (settings: IloSettings): Promise<'auto'|'manual'> => {
  const res = await fetch('/api/fan/mode', { headers: getAuthHeaders(settings) });
  if (!res.ok) throw new Error('Falha ao ler modo');
  const j = await res.json();
  const m = String(j?.mode || '').toLowerCase();
  if (m === 'manual') return 'manual';
  if (m === 'auto') return 'auto';
  throw new Error('Modo inválido');
};

// Cache simples para histórico
let historyData: TempData[] = [];

// Função auxiliar para inicializar dados falsos se a API falhar
const generateMockHistory = (points: number): TempData[] => {
  const now = new Date();
  const data: TempData[] = [];
  for (let i = points; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 5000);
    data.push({
      time: time.toLocaleTimeString(),
      cpu1: 0,
      cpu2: 0,
      ambient: 0,
    });
  }
  return data;
};

if (historyData.length === 0) {
  historyData = generateMockHistory(20);
}

export const getTemperatureData = async (period: string, settings: IloSettings): Promise<TempData[]> => {
  try {
    const response = await fetch(`/api/history?period=${encodeURIComponent(period)}`, {
      headers: getAuthHeaders(settings)
    });
    const contentType = response.headers.get("content-type");
    if (!response.ok || !contentType || !contentType.includes("application/json")) {
       throw new Error('Invalid response');
    }
    const points: TempData[] = await response.json();
    if (Array.isArray(points) && points.length > 0) return points;
    throw new Error('empty');
  } catch (e) {
    return historyData;
  }
};

export const loginSystem = async (username: string, password: string): Promise<{ success: boolean; mustChangePassword: boolean; error?: string }> => {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const ct = response.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return { success: false, mustChangePassword: false, error: 'Resposta inválida do servidor' };
    }
    const data = await response.json();
    if (!response.ok) return { success: false, mustChangePassword: false, error: data.error || 'Falha' };
    return data;
  } catch (e: any) {
    return { success: false, mustChangePassword: false, error: e?.message || 'Falha' };
  }
};

export const changeSystemPassword = async (oldPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword, newPassword })
    });
    const ct = response.headers.get('content-type') || '';
    let data: any = {};
    if (ct.includes('application/json')) {
      try { data = await response.json(); } catch {}
    }
    if (!response.ok) return { success: false, error: data?.error || 'Falha ao alterar senha' };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Falha ao alterar senha' };
  }
};

export const resetSystemBackend = async (): Promise<boolean> => {
  try {
    const response = await fetch('/api/auth/reset', { method: 'POST' });
    return response.ok;
  } catch {
    return false;
  }
};

export const getAuthInfo = async (): Promise<{ mustChangePassword: boolean }> => {
  try {
    const response = await fetch('/api/auth/info');
    return await response.json();
  } catch {
    return { mustChangePassword: true };
  }
};

export const getHistorySize = async (): Promise<{ totalBytes: number; files: { name: string; bytes: number }[] } | null> => {
  try { const res = await fetch('/api/history/size'); if (!res.ok) return null; return await res.json(); } catch { return null; }
};

export const clearHistory = async (): Promise<boolean> => {
  try { const res = await fetch('/api/history/clear', { method: 'POST' }); return res.ok; } catch { return false; }
};

export const downloadBackup = async (): Promise<void> => {
  try {
    const res = await fetch('/api/backup');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ilo-backup-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {}
};

export const restoreBackup = async (file: File): Promise<boolean> => {
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const res = await fetch('/api/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(json) });
    return res.ok;
  } catch { return false; }
};

 
