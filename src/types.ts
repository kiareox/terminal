export type Language = 'fa' | 'en';
export type ThemeMode = 'dark' | 'light';

export interface User {
  username: string;
  role: string;
  loginTime: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
}

export interface SystemMetrics {
  timestamp: number;
  cpuPercent: number;
  cpuCores: number;
  cpuModel: string;
  ramTotalMB: number;
  ramUsedMB: number;
  ramFreeMB: number;
  ramPercent: number;
  diskTotalGB: number;
  diskUsedGB: number;
  diskFreeGB: number;
  diskPercent: number;
  netRxKbps: number;
  netTxKbps: number;
  uptimeSeconds: number;
  platform: string;
  hostname: string;
  loadAvg: number[];
}

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  permissions: string;
  modifiedAt: string;
  extension?: string;
}

export interface BackgroundTask {
  id: string;
  name: string;
  command: string;
  cwd: string;
  pid?: number;
  status: 'running' | 'completed' | 'failed' | 'killed';
  startedAt: string;
  completedAt?: string;
  exitCode?: number | null;
  logs: string[];
}

export interface SystemProcess {
  pid: number;
  user: string;
  cpu: number;
  mem: number;
  vsz: string;
  rss: string;
  tty: string;
  stat: string;
  time: string;
  command: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  source: string;
  message: string;
}

export interface TerminalHistoryItem {
  id: string;
  command: string;
  output: string;
  cwd: string;
  timestamp: string;
  exitCode?: number;
  isRunning?: boolean;
}

export interface TelegramBotConfig {
  bot_token: string;
  admin_user_id: number | string;
}

export interface TelegramBotStatus {
  isRunning: boolean;
  pid?: number;
  startedAt?: string;
  logs: string[];
  configValid?: boolean;
}

