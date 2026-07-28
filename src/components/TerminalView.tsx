import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal as TerminalIcon,
  Trash2,
  StopCircle,
  Copy,
  Check,
  CornerDownLeft,
  Sparkles,
  LogOut,
  Radio
} from 'lucide-react';
import { Language, TerminalHistoryItem } from '../types';
import { translations } from '../locales/translations';

interface TerminalViewProps {
  token: string | null;
  lang: Language;
}

export const TerminalView: React.FC<TerminalViewProps> = ({ token, lang }) => {
  const t = translations[lang];
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<TerminalHistoryItem[]>([
    {
      id: 'init',
      command: 'uname -a && uptime',
      output: 'Linux serverdash 6.6.0-x86_64 #1 SMP PREEMPT_DYNAMIC GNU/Linux\nSystem uptime: 12:34:56 up 5 days, 2 user, load average: 0.12, 0.15, 0.10',
      cwd: '~',
      timestamp: new Date().toLocaleTimeString(),
      isRunning: false
    }
  ]);
  const [cwd, setCwd] = useState('~');
  const [isExecuting, setIsExecuting] = useState(false);
  const [commandHistoryIndex, setCommandHistoryIndex] = useState<number>(-1);
  const [executedCommandsList, setExecutedCommandsList] = useState<string[]>(['uname -a && uptime']);
  const [currentProcessId, setCurrentProcessId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch shared terminal CWD on mount
  useEffect(() => {
    fetch('/api/terminal/cwd', {
      headers: { 'x-auth-token': token || '' }
    })
      .then(res => res.json())
      .then(data => {
        if (data && data.cwd) {
          setCwd(data.cwd);
          setHistory(prev => prev.map(item => item.id === 'init' ? { ...item, cwd: data.cwd } : item));
        }
      })
      .catch(() => {});
  }, [token]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const ctrlAPressedRef = useRef<boolean>(false);
  const ctrlATimeoutRef = useRef<any>(null);

  // Auto-scroll on new log data
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // Global keydown listener for Ctrl+A+D detach & Ctrl+C interrupt
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Track Ctrl+A sequence for Detach (Ctrl+A then D)
      if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
        ctrlAPressedRef.current = true;
        if (ctrlATimeoutRef.current) clearTimeout(ctrlATimeoutRef.current);
        ctrlATimeoutRef.current = setTimeout(() => {
          ctrlAPressedRef.current = false;
        }, 1500);
      }

      if (e.key === 'd' || e.key === 'D') {
        if (ctrlAPressedRef.current || (e.ctrlKey && (e.key === 'd' || e.key === 'D'))) {
          e.preventDefault();
          ctrlAPressedRef.current = false;
          if (isExecuting) {
            handleDetach();
          }
        }
      }

      // Ctrl + C shortcut to Interrupt
      if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
        if (isExecuting) {
          e.preventDefault();
          handleInterrupt();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [isExecuting, currentProcessId]);

  const executeCommand = async (cmdToRun?: string) => {
    const finalCmd = cmdToRun !== undefined ? cmdToRun : command;
    if (!finalCmd.trim() || isExecuting) return;

    const trimmed = finalCmd.trim();
    setExecutedCommandsList((prev) => [...prev, trimmed]);
    setCommandHistoryIndex(-1);
    setCommand('');
    setIsExecuting(true);

    const itemId = 'item_' + Date.now();
    setHistory((prev) => [
      ...prev,
      {
        id: itemId,
        command: trimmed,
        output: '',
        cwd: cwd,
        timestamp: new Date().toLocaleTimeString(),
        isRunning: true
      }
    ]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch('/api/terminal/exec-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify({ command: trimmed, cwd }),
        signal: controller.signal
      });

      if (!res.ok || !res.body) {
        throw new Error(`Execution request failed: ${res.statusText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmedLine.slice(6));
              if (data.type === 'init') {
                if (data.cwd) setCwd(data.cwd);
                if (data.processId) setCurrentProcessId(data.processId);
              } else if (data.type === 'output') {
                setHistory((prev) =>
                  prev.map((item) =>
                    item.id === itemId
                      ? { ...item, output: item.output + data.text }
                      : item
                  )
                );
              } else if (data.type === 'exit') {
                setHistory((prev) =>
                  prev.map((item) =>
                    item.id === itemId
                      ? { ...item, isRunning: false, exitCode: data.exitCode }
                      : item
                  )
                );
              }
            } catch (err) {
              console.error('Failed to parse SSE payload:', err);
            }
          }
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        // User detached manually
      } else {
        setHistory((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  output: item.output + `\n[Error: ${e.message}]`,
                  isRunning: false
                }
              : item
          )
        );
      }
    } finally {
      setIsExecuting(false);
      setCurrentProcessId(null);
      abortControllerRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // Detach log viewer (Ctrl+A+D) - Process continues in background
  const handleDetach = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setHistory((prev) =>
      prev.map((item) =>
        item.isRunning
          ? {
              ...item,
              isRunning: false,
              output: item.output + '\n\n[🔒 برنامه در پس‌زمینه در حال اجراست | جهت مشاهده لاگ زنده به بخش "پردازش‌ها و اسکریپت‌ها" بروید (Ctrl+A+D)]'
            }
          : item
      )
    );
    setIsExecuting(false);
    setCurrentProcessId(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Interrupt process (Ctrl+C) - Sends SIGINT to kill process
  const handleInterrupt = async () => {
    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      await fetch('/api/terminal/interrupt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify({ processId: currentProcessId })
      });

      setHistory((prev) =>
        prev.map((item) =>
          item.isRunning
            ? {
                ...item,
                isRunning: false,
                output: item.output + '\n^C\n[توقف دستور توسط کاربر | Process interrupted (SIGINT)]'
              }
            : item
        )
      );
    } catch (e) {
      console.error('Failed to interrupt:', e);
    } finally {
      setIsExecuting(false);
      setCurrentProcessId(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleClear = () => {
    setHistory([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Ctrl + L shortcut (Clear terminal screen)
    if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault();
      handleClear();
      return;
    }

    // Arrow Up (History previous)
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (executedCommandsList.length === 0) return;
      const nextIndex =
        commandHistoryIndex < executedCommandsList.length - 1
          ? commandHistoryIndex + 1
          : commandHistoryIndex;
      setCommandHistoryIndex(nextIndex);
      setCommand(
        executedCommandsList[executedCommandsList.length - 1 - nextIndex] || ''
      );
      return;
    }

    // Arrow Down (History next)
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (commandHistoryIndex > 0) {
        const nextIndex = commandHistoryIndex - 1;
        setCommandHistoryIndex(nextIndex);
        setCommand(
          executedCommandsList[executedCommandsList.length - 1 - nextIndex] || ''
        );
      } else if (commandHistoryIndex === 0) {
        setCommandHistoryIndex(-1);
        setCommand('');
      }
      return;
    }

    // Tab autocomplete feature
    if (e.key === 'Tab') {
      e.preventDefault();
      const suggestions = [
        'python3 terminal_bot.py',
        'systemctl status',
        'ls -la',
        'top',
        'df -h',
        'ps aux',
        'netstat -tuln',
        'htop',
        'uptime',
        'journalctl -n 20'
      ];
      const matched = suggestions.find((s) => s.startsWith(command));
      if (matched) {
        setCommand(matched);
      }
      return;
    }

    // Enter key execution
    if (e.key === 'Enter') {
      executeCommand();
    }
  };

  const handleCopyLogs = () => {
    const fullText = history
      .map((item) => `[${item.timestamp}] ${item.cwd}$ ${item.command}\n${item.output}`)
      .join('\n\n');
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const quickPills = [
    { label: 'python3 terminal_bot.py', cmd: 'python3 terminal_bot.py' },
    { label: 'ls -la', cmd: 'ls -la' },
    { label: 'df -h', cmd: 'df -h' },
    { label: 'free -m', cmd: 'free -m' },
    { label: 'ps aux | head -n 10', cmd: 'ps aux | head -n 10' },
    { label: 'uptime', cmd: 'uptime' }
  ];

  return (
    <div className="space-y-4">
      {/* Top Header & Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200 dark:border-neutral-800">
        <div>
          <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <TerminalIcon className="h-5 w-5 text-blue-500" />
            <span>{t.terminalHeader}</span>
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            {t.shortcutTitle}{' '}
            <span className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-amber-600 dark:text-amber-400 font-bold">
              Ctrl+A+D
            </span>{' '}
            ({t.shortcutCtrlAD || 'خروج از لاگ و ادامه در پس‌زمینه'}) |{' '}
            <span className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-rose-600 dark:text-rose-400">
              Ctrl+C
            </span>{' '}
            ({t.shortcutCtrlC}) |{' '}
            <span className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-400">
              Ctrl+L
            </span>{' '}
            ({t.shortcutCtrlL})
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Active Process Status / Detach Action */}
          {isExecuting && (
            <button
              onClick={handleDetach}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition flex items-center gap-1.5 cursor-pointer animate-pulse"
              title="Ctrl+A+D"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>{t.detachCmd || 'جدا شدن (Ctrl+A+D)'}</span>
            </button>
          )}

          <button
            onClick={handleInterrupt}
            disabled={!isExecuting}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 disabled:opacity-50 transition flex items-center gap-1.5 cursor-pointer"
          >
            <StopCircle className="h-3.5 w-3.5" />
            <span>{t.interruptCmd}</span>
          </button>

          <button
            onClick={handleClear}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5 text-neutral-500" />
            <span>{t.clearTerminal}</span>
          </button>

          <button
            onClick={handleCopyLogs}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition flex items-center gap-1.5 cursor-pointer"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>{t.copyOutput}</span>
          </button>
        </div>
      </div>

      {/* Quick Command Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs scrollbar-none">
        <span className="text-neutral-500 shrink-0 flex items-center gap-1 font-medium">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          {t.quickCommands}
        </span>
        {quickPills.map((p) => (
          <button
            key={p.cmd}
            onClick={() => executeCommand(p.cmd)}
            disabled={isExecuting}
            className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-white/5 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 font-mono text-neutral-700 dark:text-gray-300 disabled:opacity-40 transition shrink-0 cursor-pointer text-xs"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Live Running Banner if Process is Attached */}
      {isExecuting && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-semibold flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 animate-ping text-amber-500" />
            <span>{t.runningProcess || 'برنامه در حال اجراست... لاگ‌ها به صورت زنده نمایش داده می‌شوند.'}</span>
          </div>
          <button
            onClick={handleDetach}
            className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition text-xs shrink-0 cursor-pointer flex items-center gap-1"
          >
            <LogOut className="h-3 w-3" />
            <span>خروج از لاگ (Ctrl+A+D)</span>
          </button>
        </div>
      )}

      {/* Main Interactive Terminal Window */}
      <div
        className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-neutral-900 dark:bg-[#121214] text-neutral-100 font-mono text-sm p-4 h-[550px] flex flex-col shadow-2xl overflow-hidden cursor-text w-full max-w-full"
        dir="ltr"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Terminal Header Bar */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10 shrink-0 text-xs text-neutral-400">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex gap-1.5 shrink-0">
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
            </div>
            <span className="ml-2 font-mono text-xs text-gray-400 truncate max-w-[220px] sm:max-w-md">
              root@linux-server:~ {cwd}
            </span>
          </div>
          <span className="text-[10px] text-gray-500 uppercase tracking-widest shrink-0 ml-2">
            {isExecuting ? '🔴 Stream Attached' : '🟢 Ready'}
          </span>
        </div>

        {/* Scrollable Command Output Area */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin scrollbar-thumb-neutral-800 w-full max-w-full">
          {history.map((item) => (
            <div key={item.id} className="space-y-1 w-full max-w-full overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 text-neutral-400 text-xs">
                <div className="flex items-center gap-1 min-w-0 shrink-0">
                  <span className="text-emerald-400 font-bold shrink-0">root@serverdash</span>
                  <span>:</span>
                  <span className="text-blue-400 font-medium truncate max-w-[140px] sm:max-w-[280px]" title={item.cwd}>
                    {item.cwd}
                  </span>
                  <span className="text-neutral-200">$</span>
                </div>
                <span className="text-neutral-100 font-semibold break-all">{item.command}</span>
                {item.isRunning && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full animate-pulse shrink-0">
                    <Radio className="h-3 w-3" /> LIVE
                  </span>
                )}
                <span className="text-neutral-600 text-[11px] font-sans ml-auto shrink-0">{item.timestamp}</span>
              </div>
              <pre className="text-neutral-300 whitespace-pre-wrap break-words text-xs leading-relaxed pl-2 border-l-2 border-neutral-800 bg-neutral-900/40 p-2.5 rounded-r-lg font-mono overflow-x-auto max-w-full">
                {item.output || (item.isRunning ? 'در حال دریافت لاگ‌های اولیه...' : 'دستور بدون خروجی متنی اجرا شد.')}
              </pre>
            </div>
          ))}

          {/* Active Input Line */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/5 w-full max-w-full overflow-hidden">
            <div className="flex items-center gap-1 text-xs shrink-0">
              <span className="text-emerald-400 font-bold">root@serverdash</span>
              <span className="text-neutral-400">:</span>
              <span className="text-blue-400 font-medium truncate max-w-[100px] sm:max-w-[200px]" title={cwd}>{cwd}</span>
              <span className="text-neutral-200">$</span>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={command || ''}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isExecuting}
              placeholder={
                isExecuting
                  ? 'در حال اجرا... (Ctrl+A+D جهت خروج)'
                  : t.cmdPlaceholder
              }
              className="flex-1 min-w-[80px] bg-transparent border-none outline-none text-neutral-100 font-mono text-xs sm:text-sm placeholder-neutral-500 focus:ring-0"
              autoFocus
            />
            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              {isExecuting && (
                <button
                  type="button"
                  onClick={handleDetach}
                  className="px-2 py-1 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-xs font-sans transition cursor-pointer flex items-center gap-1 shrink-0"
                  title="Ctrl+A+D"
                >
                  <LogOut className="h-3 w-3" />
                  <span className="hidden sm:inline">جدا شدن</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => executeCommand()}
                disabled={isExecuting || !command.trim()}
                className="p-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 transition cursor-pointer shrink-0"
              >
                <CornerDownLeft className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
};
