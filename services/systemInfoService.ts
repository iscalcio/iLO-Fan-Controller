import { IloSettings } from '../types';

const headers = (s: IloSettings) => ({
  'Content-Type': 'application/json',
  'x-ilo-host': s.host,
  'x-ilo-username': s.username,
  'x-ilo-password': s.password || ''
});

export const getSystemInfo = async (settings: IloSettings): Promise<{ cpuModel?: string; memoryGiB?: number }> => {
  try {
    const resp = await fetch('/api/system/info', { headers: headers(settings) });
    if (!resp.ok) return {};
    const data = await resp.json();
    return data || {};
  } catch {
    return {};
  }
};
