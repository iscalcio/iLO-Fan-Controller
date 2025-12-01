
export interface FanStatus {
  id: number;
  speed: number;
  label: string;
}

export interface TempData {
  time: string;
  cpu1: number;
  cpu2: number;
  ambient?: number;
  chipset?: number;
  batteryZone?: number;
  inlet?: number;
  memory?: number;
  vr_p2?: number;
  vr_p1?: number;
  ps2?: number;
  systemBoard?: number;
  sysExhaust?: number;
  hdController?: number;
}

export interface ScheduleItem {
  id: string;
  description: string;
  time: string;
  speed: number;
  active: boolean;
  mode?: 'manual' | 'auto';
}

export interface LogEntry {
  id: string;
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

export interface IloSettings {
  host: string;
  username: string;
  password?: string;
}

export type TempUnit = 'C' | 'F';

export type Language = 'pt' | 'en' | 'es' | 'fr';

export interface Translation {
  dashboardTitle: string;
  connected: string;
  disconnected: string;
  connect: string;
  settings: string;
  logs: string;
  
  // Charts
  temperatureHistory: string;
  cpuTemp: string;
  lastHour: string;
  hours24: string;
  days7: string;
  days30: string;
  year1: string;
  years5: string;
  
  // Controls
  fanControl: string;
  manualControl: string;
  applySpeed: string;
  minimum: string;
  medium: string;
  maximum: string;
  autoMode: string;
  autoModeDesc: string;
  autoSettings: string;
  minTemp: string;
  maxTemp: string;
  minSpeed: string;
  maxSpeed: string;
  configurationSaved: string;
  
  // Schedule
  schedules: string;
  addSchedule: string;
  description: string;
  time: string;
  speed: string;
  actions: string;
  noSchedules: string;
  
  // Settings
  serverSettings: string;
  hostIp: string;
  username: string;
  password: string;
  testConnection: string;
  testing: string;
  connectionSuccess: string;
  connectionFailed: string;
  preferences: string;
  tempUnit: string;
  language: string;
  save: string;
  cancel: string;

  // Login / First-run
  loginTitle: string;
  loginUsernameLabel: string;
  loginPasswordLabel: string;
  loginEnterButton: string;
  loginInstructions: string;
  loginDefaultCreds: string;
  loginChangePasswordPrompt: string;
  loginOpenSettingsHint: string;
}

declare global {
  interface Window {
    __ENV__: {
      ILO_HOST?: string;
      ILO_USERNAME?: string;
      ILO_PASSWORD?: string;
    }
  }
}
