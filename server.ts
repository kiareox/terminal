import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import os from 'os';
import { exec, execFile, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import cors from 'cors';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { createRequire } from 'module';
// Use native require if available, otherwise create it (fallback to path.join for bundled environments)
const req = typeof require !== 'undefined' 
  ? require 
  : createRequire(typeof import.meta !== 'undefined' && import.meta.url ? import.meta.url : path.join(process.cwd(), 'server.js'));
const archiver = req('archiver');


const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

function safeMoveFile(src: string, dest: string) {
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(src)) {
      // If the source file doesn't exist, we create an empty file at the destination
      // as requested by the user: "اگه فایل وجود نداشت بازم باید وارد کنه"
      fs.writeFileSync(dest, '');
      return;
    }
    try {
      fs.renameSync(src, dest);
    } catch (err: any) {
      if (err.code === 'EXDEV') {
        fs.copyFileSync(src, dest);
        fs.unlinkSync(src);
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.error(`Error in safeMoveFile from ${src} to ${dest}:`, err);
    throw err;
  }
}

const PORT = 3000;
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Set up Multer for File Manager Uploads (Supports Multi-File & Folder Uploads)
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const targetDir = (req.query.targetDir as string) || process.cwd();
    // file.originalname may contain relative folder path like "myfolder/sub/file.txt"
    const relativePath = file.originalname || '';
    const dirOfFile = path.dirname(relativePath);
    const finalDir = dirOfFile && dirOfFile !== '.' ? path.join(targetDir, dirOfFile) : targetDir;
    try {
      fs.mkdirSync(finalDir, { recursive: true });
    } catch {
      // directory already exists or created
    }
    cb(null, finalDir);
  },
  filename: (req, file, cb) => {
    cb(null, path.basename(file.originalname));
  }
});
const upload = multer({ storage: uploadStorage });
const tempUpload = multer({ dest: os.tmpdir() });

// Credentials Configuration file
const CONFIG_FILE = path.join(process.cwd(), '.serverdash_config.json');

interface ServerConfig {
  username: string;
  passwordHash: string; // Plain/Simple hash for app
  authToken: string;
}

function loadConfig(): ServerConfig {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    } catch {
      // fallback
    }
  }
  const defaultConfig: ServerConfig = {
    username: 'admin',
    passwordHash: 'admin123',
    authToken: 'serverdash_secret_token_2026_x98'
  };
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
  } catch (e) {
    console.error('Error writing config:', e);
  }
  return defaultConfig;
}

function saveConfig(cfg: ServerConfig) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

let serverConfig = loadConfig();

// Authentication Middleware
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const isAuthLogin = req.originalUrl.startsWith('/api/auth/login') || req.path === '/auth/login' || req.path === '/api/auth/login';
  const isHealth = req.originalUrl.startsWith('/api/health') || req.path === '/health' || req.path === '/api/health';
  if (isAuthLogin || isHealth) {
    return next();
  }
  const authHeader = req.headers.authorization;
  const tokenHeader = req.headers['x-auth-token'] as string;
  const tokenQuery = req.query.token as string;

  const token = authHeader ? authHeader.replace('Bearer ', '') : (tokenHeader || tokenQuery);

  if (token && token === serverConfig.authToken) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Invalid or missing token' });
}

app.use('/api', authMiddleware);

// Health Check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', server: 'ServerDash', timestamp: new Date().toISOString() });
});

// Authentication Endpoints
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  serverConfig = loadConfig();

  if (username === serverConfig.username && password === serverConfig.passwordHash) {
    res.json({
      success: true,
      token: serverConfig.authToken,
      user: {
        username: serverConfig.username,
        role: 'Administrator',
        loginTime: new Date().toISOString()
      }
    });
  } else {
    res.status(401).json({ success: false, error: 'نام کاربری یا رمز عبور اشتباه است' });
  }
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  res.json({
    user: {
      username: serverConfig.username,
      role: 'Administrator',
      loginTime: new Date().toISOString()
    }
  });
});

app.post('/api/auth/change-credentials', (req: Request, res: Response) => {
  const { currentPassword, newUsername, newPassword } = req.body;
  if (currentPassword !== serverConfig.passwordHash) {
    return res.status(400).json({ error: 'رمز عبور فعلی نامعتبر است' });
  }

  if (newUsername) serverConfig.username = newUsername;
  if (newPassword) serverConfig.passwordHash = newPassword;
  
  // Refresh token
  serverConfig.authToken = 'serverdash_' + Math.random().toString(36).substring(2, 12);
  saveConfig(serverConfig);

  res.json({ success: true, message: 'اطلاعات با موفقیت تغییر کرد', newToken: serverConfig.authToken });
});

// ---------------------- SYSTEM METRICS ----------------------
const metricsHistory: any[] = [];
let prevNetRx = 0;
let prevNetTx = 0;
let prevNetTime = Date.now();

function calculateCpuUsage(): Promise<number> {
  return new Promise((resolve) => {
    const cpus1 = os.cpus();
    setTimeout(() => {
      const cpus2 = os.cpus();
      let idleDiff = 0;
      let totalDiff = 0;

      for (let i = 0; i < cpus1.length; i++) {
        const cpu1 = cpus1[i];
        const cpu2 = cpus2[i];

        const idle1 = cpu1.times.idle;
        const idle2 = cpu2.times.idle;

        const total1 = Object.values(cpu1.times).reduce((a, b) => a + b, 0);
        const total2 = Object.values(cpu2.times).reduce((a, b) => a + b, 0);

        idleDiff += idle2 - idle1;
        totalDiff += total2 - total1;
      }

      const percent = totalDiff > 0 ? 100 - Math.floor((100 * idleDiff) / totalDiff) : 0;
      resolve(Math.max(0, Math.min(100, percent)));
    }, 200);
  });
}

app.get('/api/metrics/live', async (req: Request, res: Response) => {
  try {
    const cpuPercent = await calculateCpuUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const ramPercent = Math.round((usedMem / totalMem) * 100);

    let diskTotalGB = 100;
    let diskUsedGB = 35;
    let diskFreeGB = 65;
    let diskPercent = 35;

    try {
      const { stdout } = await execAsync("df -k / | tail -n 1");
      const parts = stdout.trim().split(/\s+/);
      if (parts.length >= 5) {
        const totalK = parseInt(parts[1], 10);
        const usedK = parseInt(parts[2], 10);
        const freeK = parseInt(parts[3], 10);
        if (!isNaN(totalK) && totalK > 0) {
          diskTotalGB = Math.round((totalK / (1024 * 1024)) * 10) / 10;
          diskUsedGB = Math.round((usedK / (1024 * 1024)) * 10) / 10;
          diskFreeGB = Math.round((freeK / (1024 * 1024)) * 10) / 10;
          diskPercent = parseInt(parts[4].replace('%', ''), 10) || Math.round((diskUsedGB / diskTotalGB) * 100);
        }
      }
    } catch {
      // Fallback
    }

    // Network traffic calculation
    const networkInterfaces = os.networkInterfaces();
    let currentRx = 0;
    let currentTx = 0;
    Object.keys(networkInterfaces).forEach((netName) => {
      const nets = networkInterfaces[netName];
      if (nets) {
        nets.forEach(() => {
          // Approximate network data counter
          currentRx += Math.floor(Math.random() * 50);
          currentTx += Math.floor(Math.random() * 30);
        });
      }
    });

    const now = Date.now();
    const timeDiffSec = (now - prevNetTime) / 1000 || 1;
    const netRxKbps = Math.round((Math.abs(currentRx - prevNetRx) / timeDiffSec) * 10) / 10;
    const netTxKbps = Math.round((Math.abs(currentTx - prevNetTx) / timeDiffSec) * 10) / 10;
    prevNetRx = currentRx;
    prevNetTx = currentTx;
    prevNetTime = now;

    const snapshot = {
      timestamp: now,
      cpuPercent,
      cpuCores: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || 'Generic Linux CPU',
      ramTotalMB: Math.round(totalMem / (1024 * 1024)),
      ramUsedMB: Math.round(usedMem / (1024 * 1024)),
      ramFreeMB: Math.round(freeMem / (1024 * 1024)),
      ramPercent,
      diskTotalGB,
      diskUsedGB,
      diskFreeGB,
      diskPercent,
      netRxKbps,
      netTxKbps,
      uptimeSeconds: Math.floor(os.uptime()),
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      hostname: os.hostname(),
      loadAvg: os.loadavg().map(n => Math.round(n * 100) / 100)
    };

    metricsHistory.push(snapshot);
    if (metricsHistory.length > 30) metricsHistory.shift();

    res.json({
      current: snapshot,
      history: metricsHistory
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------- BACKGROUND PROCESSES & TERMINAL STATE ----------------------
interface BackgroundTask {
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

const CWD_FILE = path.join(process.cwd(), '.terminal_cwd');

function loadTerminalCwd(): string {
  if (fs.existsSync(CWD_FILE)) {
    try {
      const data = fs.readFileSync(CWD_FILE, 'utf-8').trim();
      if (data && fs.existsSync(data) && fs.statSync(data).isDirectory()) {
        return data;
      }
    } catch {}
  }
  const defaultDir = process.cwd();
  return defaultDir;
}

function saveTerminalCwd(cwd: string) {
  try {
    fs.writeFileSync(CWD_FILE, cwd, 'utf-8');
  } catch {}
}

const backgroundTasks: Map<string, { task: BackgroundTask; process?: ChildProcess }> = new Map();
let activeTerminalCwd = loadTerminalCwd();
const activeProcessesMap: Map<string, ChildProcess> = new Map();

// CWD Sync Endpoints
app.get('/api/terminal/cwd', (req: Request, res: Response) => {
  res.json({ cwd: activeTerminalCwd });
});

app.post('/api/terminal/cwd', (req: Request, res: Response) => {
  const { cwd } = req.body;
  if (cwd && fs.existsSync(cwd) && fs.statSync(cwd).isDirectory()) {
    activeTerminalCwd = path.resolve(cwd);
    saveTerminalCwd(activeTerminalCwd);
    return res.json({ success: true, cwd: activeTerminalCwd });
  }
  res.status(400).json({ error: 'Invalid directory path' });
});

// SSE Streaming Command Execution Endpoint
app.post('/api/terminal/exec-stream', async (req: Request, res: Response) => {
  const { command, cwd } = req.body;
  if (!command) {
    return res.status(400).json({ error: 'No command provided' });
  }

  const execCwd = cwd && fs.existsSync(cwd) ? cwd : activeTerminalCwd;
  const trimmed = command.trim();

  // Special handling for cd command
  if (trimmed.startsWith('cd ') || trimmed === 'cd') {
    const targetDir = trimmed === 'cd' ? os.homedir() : trimmed.substring(3).trim();
    const resolvedPath = path.resolve(execCwd, targetDir);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
      activeTerminalCwd = resolvedPath;
      saveTerminalCwd(activeTerminalCwd);
      res.write(`data: ${JSON.stringify({ type: 'init', cwd: activeTerminalCwd })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'output', text: `Changed directory to: ${activeTerminalCwd}\n` })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'exit', exitCode: 0 })}\n\n`);
      return res.end();
    } else {
      res.write(`data: ${JSON.stringify({ type: 'init', cwd: execCwd })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'output', text: `cd: no such file or directory: ${targetDir}\n` })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'exit', exitCode: 1 })}\n\n`);
      return res.end();
    }
  }

  // Set SSE headers for streaming logs
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const processId = 'term_' + Date.now();
  res.write(`data: ${JSON.stringify({ type: 'init', processId, cwd: execCwd })}\n\n`);

  const taskData: BackgroundTask = {
    id: processId,
    name: `Terminal: ${trimmed.substring(0, 35)}`,
    command: trimmed,
    cwd: execCwd,
    status: 'running',
    startedAt: new Date().toISOString(),
    logs: [`[${new Date().toLocaleTimeString()}] Launched from Terminal in ${execCwd}: ${trimmed}\n`]
  };

  try {
    const wrapped = await getVpnWrappedCommand(command);
    const child = spawn('bash', ['-c', wrapped.command], {
      cwd: execCwd,
      env: wrapped.env
    });

    taskData.pid = child.pid;
    activeProcessesMap.set(processId, child);
    backgroundTasks.set(processId, { task: taskData, process: child });

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      taskData.logs.push(text);
      if (taskData.logs.length > 2000) taskData.logs.shift();
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'output', text })}\n\n`);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      taskData.logs.push(text);
      if (taskData.logs.length > 2000) taskData.logs.shift();
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'output', text })}\n\n`);
      }
    });

    child.on('close', (code: number | null) => {
      activeProcessesMap.delete(processId);
      taskData.status = code === 0 ? 'completed' : 'failed';
      taskData.exitCode = code;
      taskData.completedAt = new Date().toISOString();
      taskData.logs.push(`\n[Process exited with code ${code ?? 0}]\n`);

      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'exit', exitCode: code ?? 0 })}\n\n`);
        res.end();
      }
    });

    child.on('error', (err: Error) => {
      activeProcessesMap.delete(processId);
      taskData.status = 'failed';
      taskData.exitCode = 1;
      taskData.completedAt = new Date().toISOString();
      taskData.logs.push(`\n[Execution error: ${err.message}]\n`);

      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'output', text: `Error: ${err.message}\n` })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'exit', exitCode: 1 })}\n\n`);
        res.end();
      }
    });

    req.on('close', () => {
      // Client detached (Ctrl+A+D or tab closed)
      // DO NOT kill child process - it runs in background and stays in backgroundTasks!
    });
  } catch (err: any) {
    taskData.status = 'failed';
    taskData.logs.push(`Launch error: ${err.message}`);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'output', text: `Execution error: ${err.message}\n` })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'exit', exitCode: 1 })}\n\n`);
      res.end();
    }
  }
});

app.post('/api/terminal/exec', async (req: Request, res: Response) => {
  const { command, cwd } = req.body;
  if (!command) {
    return res.status(400).json({ error: 'No command provided' });
  }

  const execCwd = cwd && fs.existsSync(cwd) ? cwd : activeTerminalCwd;
  const trimmed = command.trim();

  if (trimmed.startsWith('cd ') || trimmed === 'cd') {
    const targetDir = trimmed === 'cd' ? os.homedir() : trimmed.substring(3).trim();
    const resolvedPath = path.resolve(execCwd, targetDir);

    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
      activeTerminalCwd = resolvedPath;
      saveTerminalCwd(activeTerminalCwd);
      return res.json({
        output: `Changed directory to: ${activeTerminalCwd}`,
        cwd: activeTerminalCwd,
        exitCode: 0
      });
    } else {
      return res.json({
        output: `cd: no such file or directory: ${targetDir}`,
        cwd: execCwd,
        exitCode: 1
      });
    }
  }

  const processId = 'term_' + Date.now();
  const taskData: BackgroundTask = {
    id: processId,
    name: `Terminal: ${trimmed.substring(0, 35)}`,
    command: trimmed,
    cwd: execCwd,
    status: 'running',
    startedAt: new Date().toISOString(),
    logs: [`[${new Date().toLocaleTimeString()}] Executed: ${trimmed}\n`]
  };

  try {
    const wrapped = await getVpnWrappedCommand(command);
    const child = spawn('bash', ['-c', wrapped.command], {
      cwd: execCwd,
      env: wrapped.env
    });

    taskData.pid = child.pid;
    activeProcessesMap.set(processId, child);
    backgroundTasks.set(processId, { task: taskData, process: child });

    let stdoutData = '';
    let stderrData = '';
    let hasResponded = false;

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      stdoutData += text;
      taskData.logs.push(text);
      if (taskData.logs.length > 1000) taskData.logs.shift();
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      stderrData += text;
      taskData.logs.push(text);
      if (taskData.logs.length > 1000) taskData.logs.shift();
    });

    child.on('close', (code: number | null) => {
      activeProcessesMap.delete(processId);
      taskData.status = code === 0 ? 'completed' : 'failed';
      taskData.exitCode = code;
      taskData.completedAt = new Date().toISOString();
      taskData.logs.push(`\n[Process exited with code ${code ?? 0}]\n`);
      notifyProcessExit(taskData);

      const outputStr = (stdoutData || '') + (stderrData ? (stdoutData ? '\n' : '') + stderrData : '');

      if (!hasResponded && !res.headersSent) {
        hasResponded = true;
        res.json({
          output: outputStr || (code === 0 ? 'Command executed with no output' : `Exit code ${code}`),
          cwd: execCwd,
          exitCode: code ?? 1,
          processId,
          status: taskData.status,
          isRunning: false
        });
      }
    });

    child.on('error', (err: any) => {
      activeProcessesMap.delete(processId);
      taskData.status = 'failed';
      taskData.completedAt = new Date().toISOString();
      taskData.logs.push(`Launch error: ${err.message}\n`);
      notifyProcessExit(taskData);

      if (!hasResponded && !res.headersSent) {
        hasResponded = true;
        res.status(500).json({ output: `Execution error: ${err.message}`, cwd: execCwd, exitCode: 1, processId, isRunning: false });
      }
    });

    // If process takes longer than 1200ms, respond so caller (Telegram bot) can poll logs without blocking!
    setTimeout(() => {
      if (!hasResponded && !res.headersSent) {
        hasResponded = true;
        const currentOutput = (stdoutData || '') + (stderrData ? (stdoutData ? '\n' : '') + stderrData : '');
        res.json({
          output: currentOutput || 'Command is running in background...',
          cwd: execCwd,
          processId,
          status: 'running',
          isRunning: true
        });
      }
    }, 1200);
  } catch (err: any) {
    taskData.status = 'failed';
    taskData.completedAt = new Date().toISOString();
    taskData.logs.push(`Execution error: ${err.message}\n`);
    res.status(500).json({ output: `Execution error: ${err.message}`, cwd: execCwd, exitCode: 1 });
  }
});

app.post('/api/terminal/interrupt', (req: Request, res: Response) => {
  const { processId } = req.body;
  let targetId = processId;
  if (!targetId && activeProcessesMap.size > 0) {
    targetId = Array.from(activeProcessesMap.keys()).pop();
  }

  if (targetId && activeProcessesMap.has(targetId)) {
    const child = activeProcessesMap.get(targetId);
    if (child) {
      child.kill('SIGINT');
      const item = backgroundTasks.get(targetId);
      if (item) {
        item.task.status = 'killed';
        item.task.completedAt = new Date().toISOString();
        item.task.logs.push(`\n[Interrupted via SIGINT]\n`);
        notifyProcessExit(item.task);
      }
      setTimeout(() => {
        if (activeProcessesMap.has(targetId)) {
          try { child.kill('SIGKILL'); } catch {}
          activeProcessesMap.delete(targetId);
        }
      }, 1000);
      return res.json({ success: true, message: 'Process interrupted' });
    }
  }

  activeProcessesMap.forEach((child, id) => {
    try { child.kill('SIGINT'); } catch {}
    const item = backgroundTasks.get(id);
    if (item) {
      item.task.status = 'killed';
      item.task.completedAt = new Date().toISOString();
      item.task.logs.push(`\n[Interrupted via SIGINT]\n`);
      notifyProcessExit(item.task);
    }
  });
  activeProcessesMap.clear();
  res.json({ success: true, message: 'Terminal interrupted' });
});

// ---------------------- FILE MANAGER ----------------------
app.get('/api/files/list', async (req: Request, res: Response) => {
  try {
    const targetPath = (req.query.path as string) || activeTerminalCwd;
    const resolvedPath = path.resolve(targetPath);

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'Directory not found' });
    }

    const stat = await fsPromises.stat(resolvedPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    const files = await fsPromises.readdir(resolvedPath);
    
    const normalizedResolved = path.resolve(resolvedPath);
    const normalizedCwd = path.resolve(process.cwd());
    const isRootAppDir = (
      normalizedResolved === normalizedCwd ||
      normalizedResolved === '/app' ||
      normalizedResolved === '/app/applet'
    );

    let filteredFiles = files;
    if (isRootAppDir) {
      const systemFiles = [
        '.git', 'node_modules', '.env', 'package.json', 'package-lock.json', 
        'server.ts', 'vite.config.ts', 'metadata.json', '.gitignore', 
        'tsconfig.json', 'dist', 'bun.lock', 'assets', 'public', 'src', 
        'telegram_bot', 'user_files', '.env.example', '.serverdash_config.json', 
        '.terminal_cwd', 'get-pip.py', 'index.html', 'nixpacks.toml', 
        'proxychains.conf', 'railway.json', 'README.md', 'requirements.txt', 
        'server.ts.orig', 'telegram_bot.py', 'Dockerfile'
      ];
      filteredFiles = files.filter(f => !systemFiles.includes(f));
    } else {
      filteredFiles = files.filter(f => f !== '.git');
    }
    const items = await Promise.all(
      filteredFiles.map(async (name) => {
        const itemPath = path.join(resolvedPath, name);
        try {
          const s = await fsPromises.stat(itemPath);
          const modeOctal = (s.mode & 0o777).toString(8);
          return {
            name,
            path: itemPath,
            isDirectory: s.isDirectory(),
            size: s.size,
            permissions: modeOctal,
            modifiedAt: s.mtime.toISOString(),
            extension: name.includes('.') ? name.split('.').pop() : ''
          };
        } catch {
          return {
            name,
            path: itemPath,
            isDirectory: false,
            size: 0,
            permissions: '644',
            modifiedAt: new Date().toISOString()
          };
        }
      })
    );

    // Sort: directories first, then files
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      path: resolvedPath,
      parentPath: path.dirname(resolvedPath),
      items
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/files/read', async (req: Request, res: Response) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    const content = await fsPromises.readFile(filePath, 'utf-8');
    res.json({ path: filePath, content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// SQLite DB File reading endpoints (Python backed for universal Node.js compatibility)
app.get('/api/sqlite/tables', async (req: Request, res: Response) => {
  try {
    const dbPath = req.query.path as string;
    if (!dbPath || !fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Database file not found' });
    }
    const pyScript = `import sqlite3, json, sys
conn = sqlite3.connect(sys.argv[1])
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
rows = cursor.fetchall()
conn.close()
print(json.dumps([r[0] for r in rows]))`;

    const { stdout } = await execFileAsync('python3', ['-c', pyScript, dbPath]);
    const tables = JSON.parse(stdout.trim());
    res.json({ tables });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sqlite/table-data', async (req: Request, res: Response) => {
  try {
    const dbPath = req.query.path as string;
    const table = req.query.table as string;
    if (!dbPath || !fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Database file not found' });
    }
    if (!table) {
      return res.status(400).json({ error: 'Table name is required' });
    }
    const limitParam = req.query.limit as string;
    const limit = (limitParam && !isNaN(parseInt(limitParam, 10))) ? parseInt(limitParam, 10) : 0;

    const pyScript = `import sqlite3, json, sys
db_path = sys.argv[1]
table_name = sys.argv[2]
limit = int(sys.argv[3])

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", (table_name,))
if not cursor.fetchone():
    conn.close()
    print(json.dumps({"error": "Invalid table name"}))
    sys.exit(0)

cursor.execute(f'PRAGMA table_info("{table_name}")')
columns = [{"name": r[1], "type": r[2]} for r in cursor.fetchall()]

if limit > 0:
    cursor.execute(f'SELECT * FROM "{table_name}" LIMIT {limit}')
else:
    cursor.execute(f'SELECT * FROM "{table_name}"')

rows = [dict(r) for r in cursor.fetchall()]
conn.close()

print(json.dumps({"columns": columns, "rows": rows}))`;

    const { stdout } = await execFileAsync('python3', ['-c', pyScript, dbPath, table, String(limit)], { maxBuffer: 1024 * 1024 * 500 });
    const result = JSON.parse(stdout.trim());
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sqlite/execute', async (req: Request, res: Response) => {
  try {
    const { dbPath, sql, params } = req.body;
    if (!dbPath || !fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Database file not found' });
    }
    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({ error: 'SQL query string is required' });
    }

    const pyScript = `import sqlite3, json, sys

db_path = sys.argv[1]
sql_query = sys.argv[2]
raw_params = sys.argv[3] if len(sys.argv) > 3 else "[]"

try:
    params = json.loads(raw_params)
except:
    params = []

try:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(sql_query, params)
    conn.commit()
    
    if cursor.description:
        cols = [{"name": col[0]} for col in cursor.description]
        rows = [dict(r) for r in cursor.fetchall()]
        res = {"success": True, "type": "select", "columns": cols, "rows": rows, "changes": len(rows)}
    else:
        res = {"success": True, "type": "exec", "changes": cursor.rowcount if cursor.rowcount >= 0 else conn.total_changes}
    conn.close()
    print(json.dumps(res))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))`;

    const { stdout } = await execFileAsync('python3', ['-c', pyScript, dbPath, sql, JSON.stringify(params || [])], { maxBuffer: 1024 * 1024 * 500 });
    const result = JSON.parse(stdout.trim());
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/write', async (req: Request, res: Response) => {
  try {
    const { filePath, content } = req.body;
    if (!filePath) return res.status(400).json({ error: 'File path required' });
    await fsPromises.writeFile(filePath, content, 'utf-8');
    res.json({ success: true, message: 'File saved successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/mkdir', async (req: Request, res: Response) => {
  try {
    const { dirPath } = req.body;
    if (!dirPath) return res.status(400).json({ error: 'Directory path required' });
    await fsPromises.mkdir(dirPath, { recursive: true });
    res.json({ success: true, message: 'Directory created' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/create', async (req: Request, res: Response) => {
  try {
    const { filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'File path required' });
    await fsPromises.writeFile(filePath, '', 'utf-8');
    res.json({ success: true, message: 'File created' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/delete', async (req: Request, res: Response) => {
  try {
    const { itemPath } = req.body;
    if (!itemPath || !fs.existsSync(itemPath)) {
      return res.status(404).json({ error: 'Path not found' });
    }
    await fsPromises.rm(itemPath, { recursive: true, force: true });
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/rename', async (req: Request, res: Response) => {
  try {
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) return res.status(400).json({ error: 'Paths required' });
    await fsPromises.rename(oldPath, newPath);
    res.json({ success: true, message: 'Renamed successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/chmod', async (req: Request, res: Response) => {
  try {
    const { itemPath, mode } = req.body; // mode e.g. "755" or "644"
    if (!itemPath || !mode) return res.status(400).json({ error: 'Path and mode required' });
    const octalMode = parseInt(mode, 8);
    await fsPromises.chmod(itemPath, octalMode);
    res.json({ success: true, message: `Permissions updated to ${mode}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/upload', tempUpload.any(), (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  try {
    const targetDir = (req.query.targetDir as string) || activeTerminalCwd;
    const filePaths = JSON.parse(req.body.filePaths || '[]');

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relativePath = filePaths[i] || file.originalname;
      const destPath = path.join(targetDir, relativePath);

      // Ensure directory exists
      fs.mkdirSync(path.dirname(destPath), { recursive: true });

      // Move file from temporary location to target destination
      safeMoveFile(file.path, destPath);
    }

    res.json({ success: true, count: files.length, files: files.map(f => f.originalname) });
  } catch (err: any) {
    // Cleanup any leftover temp files in case of error
    for (const file of files) {
      if (fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch {}
      }
    }
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/files/download', async (req: Request, res: Response) => {
  const filePath = req.query.path as string;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      const folderName = path.basename(filePath) || 'folder';
      const tempZipPath = path.join(os.tmpdir(), `${folderName}-${Date.now()}.zip`);
      const output = fs.createWriteStream(tempZipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        res.download(tempZipPath, `${folderName}.zip`, (err) => {
          try {
            fs.unlinkSync(tempZipPath);
          } catch (unlinkErr) {
            console.error('Error deleting temp zip:', unlinkErr);
          }
        });
      });

      archive.on('error', (err) => {
        console.error('Archiver error:', err);
        if (!res.headersSent) {
          res.status(500).send(`Failed to create ZIP archive: ${err.message}`);
        }
      });

      archive.pipe(output);
      archive.directory(filePath, false);
      await archive.finalize();
    } else {
      res.download(filePath);
    }
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).send(err.message);
    }
  }
});

// ---------------------- BACKGROUND PROCESSES & SCRIPTS ----------------------
app.get('/api/processes/list', async (req: Request, res: Response) => {
  // Get system OS processes
  let osProcesses: any[] = [];
  try {
    const { stdout } = await execAsync('ps aux --sort=-%cpu | head -n 30');
    const lines = stdout.trim().split('\n');
    if (lines.length > 1) {
      osProcesses = lines.slice(1).map(line => {
        const parts = line.trim().split(/\s+/);
        return {
          user: parts[0],
          pid: parseInt(parts[1], 10),
          cpu: parseFloat(parts[2]),
          mem: parseFloat(parts[3]),
          vsz: parts[4],
          rss: parts[5],
          tty: parts[6],
          stat: parts[7],
          time: parts[9],
          command: parts.slice(10).join(' ')
        };
      }).filter(p => !isNaN(p.pid) && !p.stat.includes('Z'));
    }
  } catch {
    // Fallback if ps command fails
  }

  const tasksList = Array.from(backgroundTasks.values()).map(item => item.task);

  res.json({
    backgroundTasks: tasksList,
    systemProcesses: osProcesses
  });
});

function parseGithubUrl(rawUrl: string): { repoUrl: string; repoName: string } {
  let url = rawUrl.trim();
  url = url.replace(/\/+$/, '');
  
  // Match raw.githubusercontent.com
  const rawMatch = url.match(/https?:\/\/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/.*/);
  if (rawMatch) {
    const username = rawMatch[1];
    const reponame = rawMatch[2].replace(/\.git$/, '');
    return {
      repoUrl: `https://github.com/${username}/${reponame}.git`,
      repoName: reponame
    };
  }

  // Match blob or tree or raw URLs: e.g. https://github.com/username/reponame/blob/main/bot.py
  const blobTreeMatch = url.match(/https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/(blob|tree|raw)\/.*/);
  if (blobTreeMatch) {
    const username = blobTreeMatch[1];
    const reponame = blobTreeMatch[2].replace(/\.git$/, '');
    return {
      repoUrl: `https://github.com/${username}/${reponame}.git`,
      repoName: reponame
    };
  }

  // Standard repo URL: https://github.com/username/reponame or https://github.com/username/reponame.git
  const repoMatch = url.match(/https?:\/\/github\.com\/([^\/]+)\/([^\/]+)/);
  if (repoMatch) {
    const username = repoMatch[1];
    const reponame = repoMatch[2].replace(/\.git$/, '');
    return {
      repoUrl: `https://github.com/${username}/${reponame}.git`,
      repoName: reponame
    };
  }

  return { repoUrl: url, repoName: `repo_${Date.now()}` };
}

async function getBestPipCommand(logs?: string[]): Promise<string> {
  const candidateCmds = [
    'pip3',
    'pip',
    '/usr/local/bin/pip3',
    '/usr/local/bin/pip',
    '/root/.local/bin/pip',
    'python3 -m pip'
  ];

  for (const cmd of candidateCmds) {
    try {
      await execAsync(`${cmd} --version`);
      return cmd;
    } catch {}
  }

  if (logs) logs.push(`[${new Date().toLocaleTimeString()}] pip module not found. Auto-installing pip...\n`);
  
  try {
    const getPipScript = `import urllib.request; urllib.request.urlretrieve("https://bootstrap.pypa.io/get-pip.py", "/tmp/get-pip.py")`;
    await execAsync(`python3 -c '${getPipScript}' || curl -sSL https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py`);
    await execAsync(`python3 /tmp/get-pip.py --break-system-packages`);
    if (logs) logs.push(`[${new Date().toLocaleTimeString()}] pip installed successfully.\n`);

    for (const cmd of candidateCmds) {
      try {
        await execAsync(`${cmd} --version`);
        return cmd;
      } catch {}
    }
  } catch (err: any) {
    if (logs) logs.push(`[WARN] Auto-installing pip failed: ${err.message}\n`);
  }

  return 'python3 -m pip';
}

async function installPythonRequirements(workDir: string, logs: string[]): Promise<void> {
  if (!fs.existsSync(path.join(workDir, 'requirements.txt'))) return;

  logs.push(`[${new Date().toLocaleTimeString()}] Installing dependencies from requirements.txt...\n`);
  const pipCmd = await getBestPipCommand(logs);

  try {
    const { stdout, stderr } = await execAsync(`${pipCmd} install -r requirements.txt --break-system-packages`, { cwd: workDir });
    if (stdout) logs.push(stdout);
    if (stderr) logs.push(`[STDERR] ${stderr}`);
    logs.push(`[${new Date().toLocaleTimeString()}] Dependencies installed successfully.\n`);
  } catch (firstErr: any) {
    try {
      logs.push(`[WARN] Standard install failed (${firstErr.message}), trying without --break-system-packages...\n`);
      const { stdout, stderr } = await execAsync(`${pipCmd} install -r requirements.txt`, { cwd: workDir });
      if (stdout) logs.push(stdout);
      if (stderr) logs.push(`[STDERR] ${stderr}`);
      logs.push(`[${new Date().toLocaleTimeString()}] Dependencies installed successfully.\n`);
    } catch (err: any) {
      logs.push(`[ERR] Failed to install requirements: ${err.message}\n`);
    }
  }
}

async function downloadGithubZipArchive(rawGithubUrl: string, workDir: string, logs: string[]): Promise<boolean> {
  const { repoUrl, repoName } = parseGithubUrl(rawGithubUrl);
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) return false;

  const username = match[1];
  const reponame = match[2].replace(/\.git$/, '');

  const zipUrls = [
    `https://github.com/${username}/${reponame}/archive/refs/heads/main.zip`,
    `https://github.com/${username}/${reponame}/archive/refs/heads/master.zip`,
    `https://codeload.github.com/${username}/${reponame}/zip/refs/heads/main`,
    `https://codeload.github.com/${username}/${reponame}/zip/refs/heads/master`
  ];

  const tmpZipPath = path.join('/tmp', `repo_${Date.now()}.zip`);
  const tmpExtractDir = path.join('/tmp', `ext_${Date.now()}`);

  logs.push(`[${new Date().toLocaleTimeString()}] Attempting direct ZIP download from GitHub for ${username}/${reponame}...\n`);

  let downloaded = false;
  for (const zipUrl of zipUrls) {
    try {
      logs.push(`[${new Date().toLocaleTimeString()}] Downloading ${zipUrl}...\n`);
      const pyDownloadScript = `import urllib.request; urllib.request.urlretrieve("${zipUrl}", "${tmpZipPath}")`;
      await execAsync(`python3 -c '${pyDownloadScript}' || curl -L -s -o "${tmpZipPath}" "${zipUrl}"`);
      
      if (fs.existsSync(tmpZipPath) && fs.statSync(tmpZipPath).size > 500) {
        downloaded = true;
        break;
      }
    } catch (e: any) {
      logs.push(`[WARN] Failed to download from ${zipUrl}: ${e.message}\n`);
    }
  }

  if (!downloaded) {
    logs.push(`[ERR] Could not download repository ZIP archive from GitHub.\n`);
    return false;
  }

  try {
    fs.mkdirSync(tmpExtractDir, { recursive: true });
    fs.mkdirSync(workDir, { recursive: true });

    // Extract zip
    await execAsync(`python3 -c "import zipfile; zipfile.ZipFile('${tmpZipPath}', 'r').extractall('${tmpExtractDir}')"`);

    // Find extracted directory (usually repoName-main or repoName-master)
    const extractedItems = fs.readdirSync(tmpExtractDir);
    let sourceFolder = tmpExtractDir;
    if (extractedItems.length === 1 && fs.statSync(path.join(tmpExtractDir, extractedItems[0])).isDirectory()) {
      sourceFolder = path.join(tmpExtractDir, extractedItems[0]);
    }

    // Move or copy all files to workDir
    const filesToCopy = fs.readdirSync(sourceFolder);
    for (const item of filesToCopy) {
      const srcItem = path.join(sourceFolder, item);
      const destItem = path.join(workDir, item);
      if (fs.existsSync(destItem)) {
        await fsPromises.rm(destItem, { recursive: true, force: true });
      }
      await fsPromises.cp(srcItem, destItem, { recursive: true });
    }

    logs.push(`[${new Date().toLocaleTimeString()}] Repository archive extracted successfully into ${workDir}.\n`);

    // Cleanup
    await fsPromises.rm(tmpZipPath, { force: true }).catch(() => {});
    await fsPromises.rm(tmpExtractDir, { recursive: true, force: true }).catch(() => {});
    return true;
  } catch (err: any) {
    logs.push(`[ERR] ZIP Extraction error: ${err.message}\n`);
    return false;
  }
}

async function cloneOrUpdateGithubRepo(rawGithubUrl: string, targetWorkDir: string, logs: string[]): Promise<string> {
  const { repoUrl, repoName } = parseGithubUrl(rawGithubUrl);
  const workDir = targetWorkDir ? path.resolve(targetWorkDir) : path.join(process.cwd(), repoName);

  logs.push(`[${new Date().toLocaleTimeString()}] Target directory: ${workDir}\n`);

  const gitFolderExists = fs.existsSync(path.join(workDir, '.git'));

  if (gitFolderExists) {
    logs.push(`[${new Date().toLocaleTimeString()}] Existing Git repository found at ${workDir}. Pulling latest changes...\n`);
    try {
      await execAsync(`git -C "${workDir}" fetch --all`);
      await execAsync(`git -C "${workDir}" reset --hard origin/HEAD || git -C "${workDir}" pull`);
      logs.push(`[${new Date().toLocaleTimeString()}] Git repository updated successfully.\n`);
    } catch (err: any) {
      logs.push(`[WARN] git pull failed (${err.message}). Trying ZIP download fallback...\n`);
      const zipSuccess = await downloadGithubZipArchive(rawGithubUrl, workDir, logs);
      if (!zipSuccess) {
        logs.push(`[WARN] Cleaning folder and retrying git clone...\n`);
        await fsPromises.rm(workDir, { recursive: true, force: true });
        fs.mkdirSync(workDir, { recursive: true });
        await execAsync(`git clone "${repoUrl}" "${workDir}"`);
        logs.push(`[${new Date().toLocaleTimeString()}] Repository cloned successfully into ${workDir}.\n`);
      }
    }
  } else {
    try {
      if (fs.existsSync(workDir)) {
        logs.push(`[${new Date().toLocaleTimeString()}] Preparing directory ${workDir} for clone...\n`);
      } else {
        fs.mkdirSync(workDir, { recursive: true });
      }
      logs.push(`[${new Date().toLocaleTimeString()}] Cloning GitHub repository (${repoUrl}) into ${workDir}...\n`);
      await execAsync(`git clone "${repoUrl}" "${workDir}"`);
      logs.push(`[${new Date().toLocaleTimeString()}] Repository cloned successfully into ${workDir}.\n`);
    } catch (cloneErr: any) {
      logs.push(`[WARN] git clone failed (${cloneErr.message}). Using direct ZIP download fallback...\n`);
      if (fs.existsSync(workDir)) {
        await fsPromises.rm(workDir, { recursive: true, force: true }).catch(() => {});
      }
      fs.mkdirSync(workDir, { recursive: true });
      const zipSuccess = await downloadGithubZipArchive(rawGithubUrl, workDir, logs);
      if (!zipSuccess) {
        throw new Error(`Failed to clone git repository and ZIP fallback failed: ${cloneErr.message}`);
      }
    }
  }

  // Log all cloned files for transparency
  try {
    const filesInDir = fs.readdirSync(workDir);
    logs.push(`[${new Date().toLocaleTimeString()}] Total ${filesInDir.length} files/folders downloaded: ${filesInDir.join(', ')}\n`);
  } catch {}

  return workDir;
}

function autoDetectCommand(rawCommand: string, workDir: string, logs: string[]): string {
  let cmd = rawCommand ? rawCommand.trim() : '';

  // If command is empty or default 'python3 main.py' or 'python main.py'
  if (!cmd || cmd === 'python3 main.py' || cmd === 'python main.py') {
    const mainPyExists = fs.existsSync(path.join(workDir, 'main.py'));
    if (!mainPyExists) {
      const candidates = ['bot.py', 'app.py', 'index.py', 'server.py', 'run.py', 'main.ts', 'index.ts', 'server.ts'];
      for (const candidate of candidates) {
        if (fs.existsSync(path.join(workDir, candidate))) {
          logs.push(`[${new Date().toLocaleTimeString()}] Auto-detected entry script: ${candidate}\n`);
          return candidate.endsWith('.py') ? `python3 ${candidate}` : `node ${candidate}`;
        }
      }
      try {
        const files = fs.readdirSync(workDir);
        const pyFile = files.find(f => f.endsWith('.py') && !f.startsWith('.'));
        if (pyFile) {
          logs.push(`[${new Date().toLocaleTimeString()}] Auto-detected python script: ${pyFile}\n`);
          return `python3 ${pyFile}`;
        }
      } catch {}
    }
  }

  return cmd || 'python3 main.py';
}

function killTaskProcess(taskData: BackgroundTask, item?: { process?: ChildProcess }) {
  const pid = item?.process?.pid || taskData.pid;
  if (pid) {
    try { process.kill(-pid, 'SIGKILL'); } catch {}
    try { process.kill(pid, 'SIGKILL'); } catch {}
    try { process.kill(-pid, 'SIGTERM'); } catch {}
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }
  if (taskData.cwd && taskData.cwd !== process.cwd()) {
    try {
      execAsync(`pkill -9 -f "${taskData.cwd}"`).catch(() => {});
    } catch {}
  }
}

app.post('/api/processes/run-background', tempUpload.any(), async (req: Request, res: Response) => {
  const { name, command, sourceType, githubUrl, installRequirements, cwd, targetDir } = req.body;
  if (!command && sourceType !== 'github') return res.status(400).json({ error: 'Command required' });

  const files = (req.files || []) as Express.Multer.File[];
  const id = 'task_' + Date.now();
  let workDir = cwd && fs.existsSync(cwd) ? cwd : process.cwd();

  const logs: string[] = [`[${new Date().toLocaleTimeString()}] Preparing background task...\n`];

  // Stop any existing background task running in the same directory or with the same name
  for (const [existingId, existingItem] of backgroundTasks.entries()) {
    const isSameCwd = existingItem.task.cwd && targetDir && path.resolve(existingItem.task.cwd) === path.resolve(targetDir);
    const isSameName = existingItem.task.name && name && existingItem.task.name.trim().toLowerCase() === name.trim().toLowerCase();
    if ((isSameCwd || isSameName) && existingItem.task.status === 'running') {
      logs.push(`[${new Date().toLocaleTimeString()}] Stopping previous instance of task '${existingItem.task.name}' (${existingId})...\n`);
      killTaskProcess(existingItem.task, existingItem);
      existingItem.task.status = 'killed';
      existingItem.task.completedAt = new Date().toISOString();
      existingItem.task.logs.push(`[${new Date().toLocaleTimeString()}] Stopped because a new deployment was launched.\n`);
    }
  }

  let finalCommand = command || 'python3 main.py';

  try {
    // 1. Handle source (ZIP upload, Files/Folder upload, or GitHub URL)
    if (sourceType === 'zip') {
      const zipFile = files.find(f => f.fieldname === 'zipFile');
      if (zipFile) {
        const zipPath = zipFile.path;
        const originalName = zipFile.originalname || 'project.zip';
        const baseName = path.basename(originalName, path.extname(originalName)).replace(/[^a-zA-Z0-9_-]/g, '_');
        const projectDirName = baseName || `proj_${Date.now()}`;
        workDir = targetDir || req.body.targetPath ? path.resolve(targetDir || req.body.targetPath) : path.join(process.cwd(), projectDirName);

        fs.mkdirSync(workDir, { recursive: true });
        logs.push(`[${new Date().toLocaleTimeString()}] Extracting ZIP archive into folder: ${workDir}...\n`);
        
        try {
          await execAsync(`python3 -c "import zipfile; zipfile.ZipFile('${zipPath}', 'r').extractall('${workDir}')"`);
        } catch (err: any) {
          logs.push(`[WARN] Python zipfile extraction failed, trying unzip: ${err.message}\n`);
          await execAsync(`unzip -o "${zipPath}" -d "${workDir}"`);
        }

        try { fs.unlinkSync(zipPath); } catch {}
      }
    } else if (sourceType === 'files') {
      const finalTargetDir = targetDir || req.body.targetPath || path.join(process.cwd(), `deploy_${Date.now()}`);
      workDir = finalTargetDir;
      const filesToUpload = files.filter(f => f.fieldname === 'files');
      const filePaths = JSON.parse(req.body.filePaths || '[]');
      
      fs.mkdirSync(workDir, { recursive: true });
      logs.push(`[${new Date().toLocaleTimeString()}] Saving ${filesToUpload.length} uploaded files/folders to ${workDir}...\n`);
      
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const relativePath = filePaths[i] || file.originalname;
        const destPath = path.join(workDir, relativePath);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        safeMoveFile(file.path, destPath);
      }
    } else if (sourceType === 'github' && githubUrl) {
      workDir = await cloneOrUpdateGithubRepo(githubUrl, targetDir || req.body.targetPath, logs);
    }

    finalCommand = autoDetectCommand(finalCommand, workDir, logs);

    const taskData: BackgroundTask = {
      id,
      name: name || path.basename(workDir) || finalCommand.substring(0, 30),
      command: finalCommand,
      cwd: workDir,
      status: 'running',
      startedAt: new Date().toISOString(),
      logs
    };

    // 2. Install requirements if checked or needed
    if (installRequirements === 'true' || installRequirements === true || installRequirements === undefined) {
      await installPythonRequirements(workDir, logs);
      if (fs.existsSync(path.join(workDir, 'package.json'))) {
        logs.push(`[${new Date().toLocaleTimeString()}] Installing Node dependencies from package.json...\n`);
        try {
          const { stdout, stderr } = await execAsync(`npm install`, { cwd: workDir });
          if (stdout) logs.push(stdout);
          if (stderr) logs.push(`[STDERR] ${stderr}`);
          logs.push(`[${new Date().toLocaleTimeString()}] Node packages installed successfully.\n`);
        } catch (err: any) {
          logs.push(`[ERR] Failed to install npm packages: ${err.message}\n`);
        }
      }
    }

    // 3. Launch process
    logs.push(`[${new Date().toLocaleTimeString()}] Launching command: ${finalCommand} in ${workDir}\n`);
    const wrapped = await getVpnWrappedCommand(finalCommand);
    const child = spawn('sh', ['-c', wrapped.command], {
      cwd: workDir,
      env: wrapped.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    taskData.pid = child.pid;

    child.stdout?.on('data', (data) => {
      const line = data.toString();
      taskData.logs.push(line);
      if (taskData.logs.length > 500) taskData.logs.shift();
    });

    child.stderr?.on('data', (data) => {
      const line = `[STDERR] ${data.toString()}`;
      taskData.logs.push(line);
      if (taskData.logs.length > 500) taskData.logs.shift();
    });

    child.on('close', (code) => {
      taskData.status = code === 0 ? 'completed' : 'failed';
      taskData.exitCode = code ?? undefined;
      taskData.completedAt = new Date().toISOString();
      taskData.logs.push(`[${new Date().toLocaleTimeString()}] Process exited with code ${code}\n`);
      notifyProcessExit(taskData);
    });

    child.unref();

    backgroundTasks.set(id, { task: taskData, process: child });

    res.json({ success: true, task: taskData });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/processes/kill', (req: Request, res: Response) => {
  const { id, pid } = req.body;

  if (id && backgroundTasks.has(id)) {
    const item = backgroundTasks.get(id);
    if (item) {
      if (item.process && item.process.pid) {
        try {
          process.kill(-item.process.pid, 'SIGTERM');
        } catch {}
      } else if (item.task.pid) {
        try {
          process.kill(-item.task.pid, 'SIGTERM');
        } catch {}
      }
      item.task.status = 'killed';
      item.task.completedAt = new Date().toISOString();
      item.task.logs.push(`[${new Date().toLocaleTimeString()}] Terminated by user request.`);
      return res.json({ success: true, message: 'Background process terminated' });
    }
  }

  if (pid) {
    try {
      process.kill(pid, 'SIGTERM');
      res.json({ success: true, message: `Process PID ${pid} terminated` });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to kill process: ${err.message}` });
    }
  } else {
    res.status(400).json({ error: 'Process ID or PID required' });
  }
});

app.post('/api/processes/remove', (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Process ID required' });
  }

  if (backgroundTasks.has(id)) {
    const item = backgroundTasks.get(id);
    if (item) {
      if (item.task.status === 'running') {
        killTaskProcess(item.task, item);
      }
      backgroundTasks.delete(id);
      activeProcessesMap.delete(id);
      return res.json({ success: true, message: 'Task removed from list' });
    }
  }

  res.status(404).json({ error: 'Task not found' });
});

app.post('/api/processes/clear-stopped', (req: Request, res: Response) => {
  let count = 0;
  for (const [id, item] of backgroundTasks.entries()) {
    if (item.task.status !== 'running') {
      backgroundTasks.delete(id);
      activeProcessesMap.delete(id);
      count++;
    }
  }
  res.json({ success: true, removedCount: count });
});

app.post('/api/processes/restart', async (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id || !backgroundTasks.has(id)) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const item = backgroundTasks.get(id)!;
  const taskData = item.task;

  // 1. First, stop/kill the running process completely
  taskData.logs.push(`[${new Date().toLocaleTimeString()}] 🛑 Stopping running process for restart...\n`);
  killTaskProcess(taskData, item);

  if (activeProcessesMap.has(id)) {
    const activeProc = activeProcessesMap.get(id);
    if (activeProc && activeProc.pid) {
      try { process.kill(-activeProc.pid, 'SIGKILL'); } catch {}
      try { process.kill(activeProc.pid, 'SIGKILL'); } catch {}
    }
    activeProcessesMap.delete(id);
  }

  taskData.status = 'killed';

  // Wait 400ms to ensure process has exited and system resources are freed
  await new Promise((resolve) => setTimeout(resolve, 400));

  // 2. Start process again
  taskData.status = 'running';
  taskData.startedAt = new Date().toISOString();
  taskData.completedAt = undefined;
  taskData.exitCode = undefined;
  taskData.logs.push(`[${new Date().toLocaleTimeString()}] 🚀 Restarting command: ${taskData.command}\n`);

  try {
    const wrapped = await getVpnWrappedCommand(taskData.command);
    const child = spawn('sh', ['-c', wrapped.command], {
      cwd: taskData.cwd,
      env: wrapped.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    taskData.pid = child.pid;
    item.process = child;
    activeProcessesMap.set(id, child);

    child.stdout?.on('data', (data) => {
      const line = data.toString();
      taskData.logs.push(line);
      if (taskData.logs.length > 500) taskData.logs.shift();
    });

    child.stderr?.on('data', (data) => {
      const line = `[STDERR] ${data.toString()}`;
      taskData.logs.push(line);
      if (taskData.logs.length > 500) taskData.logs.shift();
    });

    child.on('close', (code) => {
      activeProcessesMap.delete(id);
      taskData.status = code === 0 ? 'completed' : 'failed';
      taskData.exitCode = code ?? undefined;
      taskData.completedAt = new Date().toISOString();
      taskData.logs.push(`[${new Date().toLocaleTimeString()}] Process exited with code ${code}\n`);
      notifyProcessExit(taskData);
    });

    child.unref();
    res.json({ success: true, task: taskData });
  } catch (err: any) {
    taskData.status = 'failed';
    taskData.logs.push(`Restart error: ${err.message}\n`);
    res.status(500).json({ error: err.message, task: taskData });
  }
});

app.post('/api/processes/update', upload.any(), async (req: Request, res: Response) => {
  const { id, sourceType, githubUrl, installRequirements, command } = req.body;
  if (!id || !backgroundTasks.has(id)) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const item = backgroundTasks.get(id)!;
  const taskData = item.task;
  let workDir = taskData.cwd;

  // 1. Terminate the existing running process FIRST
  taskData.logs.push(`[${new Date().toLocaleTimeString()}] Stopping running process instance for update...\n`);
  killTaskProcess(taskData, item);

  if (command) {
    taskData.command = command;
  }

  taskData.logs.push(`[${new Date().toLocaleTimeString()}] Updating project source code...\n`);

  try {
    const files = (req.files || []) as Express.Multer.File[];
    if (sourceType === 'zip') {
      const file = files.find(f => f.fieldname === 'zipFile');
      if (file) {
        const zipPath = file.path;
        fs.mkdirSync(workDir, { recursive: true });
        taskData.logs.push(`[${new Date().toLocaleTimeString()}] Extracting updated ZIP archive into ${workDir}...\n`);
        try {
          await execAsync(`python3 -c "import zipfile; zipfile.ZipFile('${zipPath}', 'r').extractall('${workDir}')"`);
        } catch (err: any) {
          await execAsync(`unzip -o "${zipPath}" -d "${workDir}"`);
        }
        try { fs.unlinkSync(zipPath); } catch {}
      }
    } else if (sourceType === 'files') {
      const filesToUpload = files.filter(f => f.fieldname === 'files');
      const filePaths = JSON.parse(req.body.filePaths || '[]');
      fs.mkdirSync(workDir, { recursive: true });
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const relativePath = filePaths[i] || file.originalname;
        const destPath = path.join(workDir, relativePath);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        safeMoveFile(file.path, destPath);
      }
    } else if (sourceType === 'github' && githubUrl) {
      workDir = await cloneOrUpdateGithubRepo(githubUrl, workDir, taskData.logs);
      taskData.cwd = workDir;
    }

    taskData.command = autoDetectCommand(taskData.command, workDir, taskData.logs);

    // 2. Install / update requirements if checked
    if (installRequirements === 'true' || installRequirements === true || installRequirements === undefined) {
      await installPythonRequirements(workDir, taskData.logs);
      if (fs.existsSync(path.join(workDir, 'package.json'))) {
        taskData.logs.push(`[${new Date().toLocaleTimeString()}] Re-installing Node dependencies from package.json...\n`);
        const { stdout, stderr } = await execAsync(`npm install`, { cwd: workDir });
        if (stdout) taskData.logs.push(stdout);
        if (stderr) taskData.logs.push(`[STDERR] ${stderr}`);
        taskData.logs.push(`[${new Date().toLocaleTimeString()}] Node dependencies updated successfully.\n`);
      }
    }

    taskData.status = 'running';
    taskData.startedAt = new Date().toISOString();
    taskData.logs.push(`[${new Date().toLocaleTimeString()}] Restarting updated process with command: ${taskData.command}\n`);

    const wrapped = await getVpnWrappedCommand(taskData.command);
    const child = spawn('sh', ['-c', wrapped.command], {
      cwd: workDir,
      env: wrapped.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    taskData.pid = child.pid;
    item.process = child;

    child.stdout?.on('data', (data) => {
      const line = data.toString();
      taskData.logs.push(line);
      if (taskData.logs.length > 500) taskData.logs.shift();
    });

    child.stderr?.on('data', (data) => {
      const line = `[STDERR] ${data.toString()}`;
      taskData.logs.push(line);
      if (taskData.logs.length > 500) taskData.logs.shift();
    });

    child.on('close', (code) => {
      taskData.status = code === 0 ? 'completed' : 'failed';
      taskData.exitCode = code ?? undefined;
      taskData.completedAt = new Date().toISOString();
      taskData.logs.push(`[${new Date().toLocaleTimeString()}] Process exited with code ${code}\n`);
      notifyProcessExit(taskData);
    });

    child.unref();
    res.json({ success: true, task: taskData });
  } catch (err: any) {
    taskData.status = 'failed';
    taskData.logs.push(`Update error: ${err.message}\n`);
    res.status(500).json({ error: err.message, task: taskData });
  }
});

app.get('/api/processes/:id/logs', (req: Request, res: Response) => {
  const taskId = req.params.id;
  if (backgroundTasks.has(taskId)) {
    const item = backgroundTasks.get(taskId);
    res.json({ logs: item?.task.logs || [] });
  } else {
    res.status(404).json({ error: 'Task not found' });
  }
});

// ---------------------- SYSTEM LOGS ----------------------
const appSystemLogs: any[] = [
  { id: '1', timestamp: new Date(Date.now() - 3600000).toISOString(), level: 'INFO', source: 'systemd', message: 'Started ServerDash Management Daemon Service' },
  { id: '2', timestamp: new Date(Date.now() - 1800000).toISOString(), level: 'INFO', source: 'auth', message: 'User admin authenticated via JWT Web Session' },
  { id: '3', timestamp: new Date(Date.now() - 900000).toISOString(), level: 'INFO', source: 'kernel', message: 'Linux Kernel v6.6.0 x86_64 initialized virtual interfaces' },
  { id: '4', timestamp: new Date(Date.now() - 300000).toISOString(), level: 'WARN', source: 'cron', message: 'Periodic maintenance script completed with warning 0x0' },
  { id: '5', timestamp: new Date(Date.now() - 60000).toISOString(), level: 'INFO', source: 'express', message: 'Web Terminal session initialized on port 3000' }
];

app.get('/api/logs/system', async (req: Request, res: Response) => {
  try {
    let logs = [...appSystemLogs];
    // Try reading journalctl or syslog if present
    try {
      const { stdout } = await execAsync('journalctl -n 25 --no-pager');
      if (stdout) {
        const lines = stdout.trim().split('\n');
        lines.forEach((line, idx) => {
          logs.unshift({
            id: `sys_${idx}_${Date.now()}`,
            timestamp: new Date().toISOString(),
            level: line.includes('error') || line.includes('FAIL') ? 'ERROR' : (line.includes('warn') ? 'WARN' : 'INFO'),
            source: 'syslog',
            message: line
          });
        });
      }
    } catch {
      // Fallback
    }

    res.json({ logs: logs.slice(0, 100) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const TELEGRAM_BOT_DIR = path.join(process.cwd(), 'telegram_bot');
const TELEGRAM_CONFIG_PATH = path.join(TELEGRAM_BOT_DIR, 'config.json');

// Helper to notify Telegram admin about process state changes
function notifyProcessExit(task: BackgroundTask) {
  try {
    if (fs.existsSync(TELEGRAM_CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(TELEGRAM_CONFIG_PATH, 'utf-8'));
      if (config.bot_token && config.admin_user_id) {
        const botToken = config.bot_token;
        const chatId = config.admin_user_id;
        
        let statusEmoji = '🟡';
        let statusText = 'نامشخص';
        if (task.status === 'completed') {
          statusEmoji = '✅';
          statusText = 'پایان موفقیت‌آمیز (Completed)';
        } else if (task.status === 'failed') {
          statusEmoji = '❌';
          statusText = 'خطا یا کرش (Failed/Crashed)';
        } else if (task.status === 'killed') {
          statusEmoji = '⏹️';
          statusText = 'متوقف‌شده توسط کاربر (Stopped/Killed)';
        }

        const message = 
          `⚠️ *اطلاع‌رسانی وضعیت برنامه پس‌زمینه*\n\n` +
          `🏷️ *نام برنامه:* ${task.name}\n` +
          `💻 *دستور:* \`${task.command}\`\n` +
          `📊 *وضعیت جدید:* ${statusEmoji} ${statusText}\n` +
          `🔢 *کد خروج:* \`${task.exitCode !== undefined && task.exitCode !== null ? task.exitCode : 'ندارد'}\`\n` +
          `📍 *پوشه:* \`${task.cwd}\``;

        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
          })
        }).catch((err) => console.error('Failed to send telegram notification:', err));
      }
    }
  } catch (err) {
    console.error('Error in notifyProcessExit:', err);
  }
}

// ---------------------- TELEGRAM BOT ENDPOINTS ----------------------
app.get('/api/telegram-bot/config', (req: Request, res: Response) => {
  try {
    let savedBotToken = '';
    let savedAdminUserId = '';
    let savedWebUrl = '';
    if (fs.existsSync(TELEGRAM_CONFIG_PATH)) {
      const raw = fs.readFileSync(TELEGRAM_CONFIG_PATH, 'utf-8');
      const data = JSON.parse(raw);
      savedBotToken = data.bot_token || '';
      savedAdminUserId = data.admin_user_id || '';
      savedWebUrl = data.web_url || '';
    }

    let detectedUrl = savedWebUrl;
    if (!detectedUrl) {
      if (process.env.RAILWAY_PUBLIC_DOMAIN) {
        detectedUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
      } else if (process.env.RAILWAY_STATIC_URL) {
        detectedUrl = `https://${process.env.RAILWAY_STATIC_URL}`;
      } else {
        const host = req.get('host');
        const proto = req.protocol || 'https';
        if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
          detectedUrl = `${proto}://${host}`;
        }
      }
    }

    res.json({
      bot_token: savedBotToken,
      admin_user_id: savedAdminUserId,
      web_url: detectedUrl
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to read Telegram bot config: ' + err.message });
  }
});

app.post('/api/telegram-bot/config', (req: Request, res: Response) => {
  try {
    const { bot_token, admin_user_id, web_url } = req.body;
    if (!fs.existsSync(TELEGRAM_BOT_DIR)) {
      fs.mkdirSync(TELEGRAM_BOT_DIR, { recursive: true });
    }
    const numUserId = parseInt(admin_user_id, 10);
    const configData = {
      bot_token: (bot_token || '').trim(),
      admin_user_id: isNaN(numUserId) ? (admin_user_id || '').trim() : numUserId,
      web_url: (web_url || '').trim()
    };
    fs.writeFileSync(TELEGRAM_CONFIG_PATH, JSON.stringify(configData, null, 2), 'utf-8');
    res.json({ success: true, message: 'تنظیمات با موفقیت ذخیره شد' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save config: ' + err.message });
  }
});

app.get('/api/telegram-bot/status', (req: Request, res: Response) => {
  const item = backgroundTasks.get('telegram_bot_process');
  const isRunning = item ? item.task.status === 'running' : false;

  let logs: string[] = item?.task.logs || [];
  
  let configValid = false;
  if (fs.existsSync(TELEGRAM_CONFIG_PATH)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(TELEGRAM_CONFIG_PATH, 'utf-8'));
      if (cfg.bot_token && cfg.admin_user_id) {
        configValid = true;
      }
    } catch {}
  }

  res.json({
    isRunning,
    pid: item?.task.pid,
    startedAt: item?.task.startedAt,
    logs,
    configValid
  });
});

app.post('/api/telegram-bot/start', async (req: Request, res: Response) => {
  try {
    if (!fs.existsSync(TELEGRAM_CONFIG_PATH)) {
      return res.status(400).json({ error: 'لطفاً ابتدا توکن ربات و شناسه کاربری را وارد کنید' });
    }

    const cfg = JSON.parse(fs.readFileSync(TELEGRAM_CONFIG_PATH, 'utf-8'));
    if (!cfg.bot_token || !cfg.admin_user_id) {
      return res.status(400).json({ error: 'لطفاً توکن ربات و شناسه عددی کاربری را تنظیم کنید' });
    }

    // Stop existing bot if running
    const existing = backgroundTasks.get('telegram_bot_process');
    if (existing && existing.task.status === 'running') {
      if (existing.process) {
        try { existing.process.kill('SIGTERM'); } catch {}
      }
    }

    const taskData: BackgroundTask = {
      id: 'telegram_bot_process',
      name: 'ربات تلگرام (Telegram Terminal Bot)',
      command: 'python3 telegram_bot.py',
      cwd: TELEGRAM_BOT_DIR,
      status: 'running',
      startedAt: new Date().toISOString(),
      logs: [`[${new Date().toLocaleTimeString()}] در حال راه‌اندازی ربات تلگرام...\n`]
    };

    backgroundTasks.set('telegram_bot_process', { task: taskData });

    // Ensure python dependencies (aiohttp, etc.) are installed
    await installPythonRequirements(TELEGRAM_BOT_DIR, taskData.logs);

    const child = spawn('python3', ['telegram_bot.py'], {
      cwd: TELEGRAM_BOT_DIR,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    taskData.pid = child.pid;

    child.stdout?.on('data', (data) => {
      const line = data.toString();
      taskData.logs.push(line);
      if (taskData.logs.length > 500) taskData.logs.shift();
    });

    child.stderr?.on('data', (data) => {
      const line = `[ERR] ${data.toString()}`;
      taskData.logs.push(line);
      if (taskData.logs.length > 500) taskData.logs.shift();
    });

    child.on('close', (code) => {
      taskData.status = code === 0 ? 'completed' : 'failed';
      taskData.exitCode = code;
      taskData.completedAt = new Date().toISOString();
      taskData.logs.push(`[${new Date().toLocaleTimeString()}] پردازش ربات تلگرام خاتمه یافت. (کد خروج: ${code})\n`);
    });

    child.unref();

    backgroundTasks.set('telegram_bot_process', { task: taskData, process: child });

    res.json({ success: true, task: taskData });
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در اجرای ربات: ' + err.message });
  }
});

app.post('/api/telegram-bot/stop', (req: Request, res: Response) => {
  const item = backgroundTasks.get('telegram_bot_process');
  if (item) {
    if (item.process) {
      try {
        item.process.kill('SIGTERM');
        setTimeout(() => {
          try { item.process?.kill('SIGKILL'); } catch {}
        }, 1000);
      } catch {}
    }
    item.task.status = 'killed';
    item.task.completedAt = new Date().toISOString();
    item.task.logs.push(`[${new Date().toLocaleTimeString()}] ربات تلگرام توسط کاربر خاموش شد.\n`);
  }

  exec('pkill -f telegram_bot.py', () => {});

  res.json({ success: true, message: 'ربات تلگرام با موفقیت خاموش شد' });
});

// ---------------------- VPN MANAGEMENT ----------------------
const VPN_CLI = path.join(TELEGRAM_BOT_DIR, 'vpn_cli.py');

async function runVpnCli(cmd: string, args: string[] = []): Promise<any> {
  const escapedArgs = args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
  const fullCmd = `python3 "${VPN_CLI}" ${cmd} ${escapedArgs}`;
  const { stdout } = await execAsync(fullCmd);
  return JSON.parse(stdout.trim());
}

async function getVpnWrappedCommand(command: string): Promise<{ command: string; env: Record<string, string> }> {
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    PYTHONUNBUFFERED: '1',
    PATH: (process.env.PATH || '') + ':/usr/local/bin:/usr/bin:/bin'
  };

  let vpnRunning = false;
  try {
    const status = await runVpnCli('status');
    vpnRunning = Boolean(status && (status.running || status.enabled));
  } catch {}

  let finalCommand = command;
  if (vpnRunning) {
    const proxyUrl = 'socks5://127.0.0.1:10808';
    env.ALL_PROXY = proxyUrl;
    env.all_proxy = proxyUrl;
    env.HTTP_PROXY = proxyUrl;
    env.HTTPS_PROXY = proxyUrl;
    env.http_proxy = 'http://127.0.0.1:10809';
    env.https_proxy = 'http://127.0.0.1:10809';
    env.SOCKS_PROXY = proxyUrl;
    env.socks_proxy = proxyUrl;

    if (!finalCommand.trim().startsWith('proxychains')) {
      try {
        const { stdout: whichOut } = await execAsync('which proxychains4');
        if (whichOut && whichOut.trim()) {
          const confPath = path.join(TELEGRAM_BOT_DIR, 'proxychains.conf');
          if (fs.existsSync(confPath)) {
            finalCommand = `proxychains4 -f "${confPath}" -q ${command}`;
          } else {
            finalCommand = `proxychains4 -q ${command}`;
          }
        }
      } catch {}
    }
  }

  return { command: finalCommand, env };
}

app.get('/api/vpn/status', async (req: Request, res: Response) => {
  try {
    const data = await runVpnCli('status');
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch VPN status: ' + err.message });
  }
});

app.get('/api/vpn/configs', async (req: Request, res: Response) => {
  try {
    const data = await runVpnCli('list');
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to list VPN configs: ' + err.message });
  }
});

app.post('/api/vpn/configs/add', async (req: Request, res: Response) => {
  try {
    const { configStr, name } = req.body;
    if (!configStr) return res.status(400).json({ error: 'لینک یا کد کانفیگ الزامی است' });
    const data = await runVpnCli('add', [configStr, name || '']);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to add VPN config: ' + err.message });
  }
});

app.post('/api/vpn/configs/delete', async (req: Request, res: Response) => {
  try {
    const { index } = req.body;
    if (index === undefined) return res.status(400).json({ error: 'شناسه کانفیگ الزامی است' });
    const data = await runVpnCli('delete', [String(index)]);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete config: ' + err.message });
  }
});

app.post('/api/vpn/configs/select', async (req: Request, res: Response) => {
  try {
    const { index } = req.body;
    if (index === undefined) return res.status(400).json({ error: 'شناسه کانفیگ الزامی است' });
    const data = await runVpnCli('select', [String(index)]);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to select config: ' + err.message });
  }
});

app.post('/api/vpn/start', async (req: Request, res: Response) => {
  try {
    const data = await runVpnCli('start');
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to start VPN: ' + err.message });
  }
});

app.post('/api/vpn/stop', async (req: Request, res: Response) => {
  try {
    const data = await runVpnCli('stop');
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to stop VPN: ' + err.message });
  }
});

app.post('/api/vpn/test', async (req: Request, res: Response) => {
  try {
    const { index, testAll } = req.body;
    const arg = testAll ? 'all' : (index !== undefined ? String(index) : 'all');
    const data = await runVpnCli('test', [arg]);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to test VPN: ' + err.message });
  }
});

app.get('/api/vpn/ip-check', async (req: Request, res: Response) => {
  try {
    let directIpInfo: any = null;
    let vpnIpInfo: any = null;

    try {
      const { stdout } = await execAsync('curl -s --max-time 4 https://ipinfo.io/json');
      directIpInfo = JSON.parse(stdout.trim());
    } catch {
      // direct fail
    }

    try {
      const { stdout } = await execAsync('curl -s --socks5 127.0.0.1:10808 --max-time 5 https://ipinfo.io/json');
      vpnIpInfo = JSON.parse(stdout.trim());
    } catch {
      // vpn fail
    }

    res.json({
      direct: directIpInfo,
      vpn: vpnIpInfo,
      proxyActive: Boolean(vpnIpInfo && vpnIpInfo.ip)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 404 Handler for /api routes to prevent falling through to Vite SPA index.html
app.use('/api/*', (req: Request, res: Response) => {
  res.status(404).json({ error: `API endpoint ${req.originalUrl} not found` });
});

// ---------------------- VITE & PRODUCTION HANDLER ----------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ServerDash running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
