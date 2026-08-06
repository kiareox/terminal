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
  Radio,
  ArrowDown
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
  const terminalScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const ctrlAPressedRef = useRef<boolean>(false);
  const ctrlATimeoutRef = useRef<any>(null);
  const [autoScrollTerminal, setAutoScrollTerminal] = useState(true);

  const handleTerminalScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight <= 40;
    setAutoScrollTerminal(isAtBottom);
  };

  // Auto-scroll on new log data only when autoScrollTerminal is true
  useEffect(() => {
    if (autoScrollTerminal) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history, autoScrollTerminal]);

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
        className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-neutral-900 dark:bg-[#121214] text-neutral-100 font-mono text-sm p-3 sm:p-4 h-[calc(100vh-16rem)] min-h-[380px] md:h-[550px] flex flex-col shadow-2xl overflow-hidden cursor-text w-full max-w-full"
        dir="ltr"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Terminal Header Bar */}
        <div className="flex items-center justify-between pb-2 mb-2 sm:pb-3 sm:mb-3 border-b border-white/10 shrink-0 text-xs text-neutral-400">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex gap-1.5 shrink-0">
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
            </div>
            <span className="ml-1 sm:ml-2 font-mono text-[11px] sm:text-xs text-gray-400 truncate max-w-[160px] sm:max-w-md">
              root@linux-server:~ {cwd}
            </span>
          </div>
          <span className="text-[9px] sm:text-[10px] text-gray-500 uppercase tracking-widest shrink-0 ml-1 sm:ml-2">
            {isExecuting ? '🔴 Stream Attached' : '🟢 Ready'}
          </span>
        </div>

        {/* Scrollable Command Output Area */}
        <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
          <div
            ref={terminalScrollRef}
            onScroll={handleTerminalScroll}
            className="flex-1 overflow-y-auto space-y-3 sm:space-y-4 pr-1 scrollbar-thin scrollbar-thumb-neutral-800 w-full max-w-full"
          >
            {history.map((item) => (
              <div key={item.id} className="space-y-1 w-full max-w-full overflow-hidden">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-neutral-400 text-xs">
                  <div className="flex items-center gap-1 min-w-0 shrink-0 text-[11px] sm:text-xs">
                    <span className="text-emerald-400 font-bold shrink-0">root@server</span>
                    <span>:</span>
                    <span className="text-blue-400 font-medium truncate max-w-[90px] sm:max-w-[280px]" title={item.cwd}>
                      {item.cwd}
                    </span>
                    <span className="text-neutral-200">$</span>
                  </div>
                  <span className="text-neutral-100 font-semibold break-all text-xs">{item.command}</span>
                  {item.isRunning && (
                    <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full animate-pulse shrink-0">
                      <Radio className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> LIVE
                    </span>
                  )}
                  <span className="text-neutral-600 text-[10px] sm:text-[11px] font-sans ml-auto shrink-0">{item.timestamp}</span>
                </div>
                <pre className="text-neutral-300 whitespace-pre-wrap break-words text-[11px] sm:text-xs leading-relaxed pl-2 border-l-2 border-neutral-800 bg-neutral-900/40 p-2 sm:p-2.5 rounded-r-lg font-mono overflow-x-auto max-w-full">
                  {item.output || (item.isRunning ? 'در حال دریافت لاگ‌های اولیه...' : 'دستور بدون خروجی متنی اجرا شد.')}
                </pre>
              </div>
            ))}

            <div ref={bottomRef} />
          </div>

          {!autoScrollTerminal && (
            <button
              type="button"
              onClick={() => {
                setAutoScrollTerminal(true);
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-sans px-3 py-1 rounded-full shadow-lg flex items-center gap-1.5 opacity-90 transition cursor-pointer border border-white/20 z-20"
            >
              <ArrowDown className="h-3 w-3" />
              <span>{lang === 'fa' ? 'اسکرول به انتهای خروجی' : 'Scroll to Bottom'}</span>
            </button>
          )}
        </div>

        {/* Mobile Quick Keys Toolbar */}
        <div className="pt-2 border-t border-white/5 flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none text-xs shrink-0">
          <span className="text-[10px] text-neutral-500 font-mono shrink-0 px-1">KEYS:</span>
          {[
            { label: '|', action: () => setCommand((c) => c + '|') },
            { label: '/', action: () => setCommand((c) => c + '/') },
            { label: '-', action: () => setCommand((c) => c + '-') },
            { label: '~', action: () => setCommand((c) => c + '~') },
            { label: 'Tab', action: () => handleKeyDown({ key: 'Tab', preventDefault: () => {} } as any) },
            { label: 'Ctrl+C', action: handleInterrupt },
            { label: 'Ctrl+A+D', action: handleDetach },
            { label: 'clear', action: handleClear }
          ].map((k, idx) => (
            <button
              key={idx}
              type="button"
              onClick={k.action}
              className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 active:bg-blue-600 text-neutral-300 hover:text-white font-mono text-[11px] border border-white/10 shrink-0 cursor-pointer transition"
            >
              {k.label}
            </button>
          ))}
        </div>

        {/* Active Input Line */}
        <div className="flex items-center gap-1.5 sm:gap-2 pt-2 border-t border-white/5 w-full max-w-full overflow-hidden shrink-0">
          <div className="flex items-center gap-1 text-xs shrink-0">
            <span className="text-emerald-400 font-bold text-[11px] sm:text-xs">root@server</span>
            <span className="text-neutral-400">:</span>
            <span className="text-blue-400 font-medium truncate max-w-[70px] sm:max-w-[200px] text-[11px] sm:text-xs" title={cwd}>{cwd}</span>
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
            className="flex-1 min-w-[60px] bg-transparent border-none outline-none text-neutral-100 font-mono text-xs sm:text-sm placeholder-neutral-500 focus:ring-0"
            autoFocus
          />
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
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
      </div>
    </div>
  );
};
