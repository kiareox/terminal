import React, { useState, useEffect, useRef } from 'react';
import { Cpu, Play, StopCircle, RefreshCw, Terminal, Eye, Search, Radio, Copy, Check, X, ShieldAlert, GitCommit, UploadCloud, ArrowDown, Trash2 } from 'lucide-react';
import { BackgroundTask, SystemProcess, Language } from '../types';
import { translations } from '../locales/translations';
import { GithubUploadDeployModal } from './GithubUploadDeployModal';
import { ProjectUpdateModal } from './ProjectUpdateModal';

interface ProcessManagerProps {
  token: string | null;
  lang: Language;
}

export const ProcessManager: React.FC<ProcessManagerProps> = ({ token, lang }) => {
  const t = translations[lang];
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [sysProcesses, setSysProcesses] = useState<SystemProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultPath, setDefaultPath] = useState<string>('/app/applet');

  // New script state
  const [isGithubDeployModalOpen, setIsGithubDeployModalOpen] = useState(false);

  useEffect(() => {
    if (token) {
      fetch('/api/terminal/cwd', {
        headers: { 'x-auth-token': token }
      })
        .then(res => res.json())
        .then(data => {
          if (data && data.cwd) {
            setDefaultPath(data.cwd);
          }
        })
        .catch(() => {});
    }
  }, [token]);



  // Logs modal
  const [activeTaskLogs, setActiveTaskLogs] = useState<{ id: string; name: string; command: string; logs: string[]; isRunning: boolean } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);

  const modalLogEndRef = useRef<HTMLDivElement>(null);
  const modalLogContainerRef = useRef<HTMLDivElement>(null);

  const handleLogScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    // If user is within 40px of the bottom, enable auto-scroll; otherwise disable it (user scrolled up to read old logs)
    const isAtBottom = scrollHeight - scrollTop - clientHeight <= 40;
    setAutoScrollLogs(isAtBottom);
  };

  const fetchProcesses = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/processes/list', {
        headers: { 'x-auth-token': token }
      });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        setTasks(data.backgroundTasks || []);
        setSysProcesses(data.systemProcesses || []);
      }
    } catch (e) {
      console.error('Failed to fetch processes:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProcesses();
    const interval = setInterval(fetchProcesses, 2500);
    return () => clearInterval(interval);
  }, [token]);

  // Live log polling when log modal is open for a running task
  useEffect(() => {
    if (!activeTaskLogs) return;

    const pollLogs = async () => {
      try {
        const res = await fetch(`/api/processes/${activeTaskLogs.id}/logs`, {
          headers: { 'x-auth-token': token || '' }
        });
        if (res.ok) {
          const data = await res.json();
          // Find updated task status
          const currentTask = tasks.find(t => t.id === activeTaskLogs.id);
          const isStillRunning = currentTask ? currentTask.status === 'running' : false;

          setActiveTaskLogs(prev => prev ? {
            ...prev,
            logs: data.logs || [],
            isRunning: isStillRunning
          } : null);
        }
      } catch (err) {
        console.error('Failed to poll logs:', err);
      }
    };

    pollLogs();
    const logInterval = setInterval(pollLogs, 1200);
    return () => clearInterval(logInterval);
  }, [activeTaskLogs?.id, token, tasks]);

  // Auto scroll log modal only if user is at bottom (autoScrollLogs is true)
  useEffect(() => {
    if (activeTaskLogs && autoScrollLogs) {
      modalLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeTaskLogs?.logs, autoScrollLogs]);

  const handleRestartTask = async (id: string) => {
    try {
      const res = await fetch('/api/processes/restart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        fetchProcesses();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'خطا در ریستارت اسکریپت');
      }
    } catch {
      alert('خطا در ارتباط با سرور');
    }
  };

  // Update task state
  const [updatingTask, setUpdatingTask] = useState<BackgroundTask | null>(null);

  const handleKillTask = async (id?: string, pid?: number) => {
    try {
      await fetch('/api/processes/kill', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify({ id, pid })
      });
      fetchProcesses();
    } catch (e) {
      alert('Failed to terminate process');
    }
  };

  const handleRemoveTask = async (id: string) => {
    try {
      const res = await fetch('/api/processes/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        setTasks(prev => prev.filter(t => t.id !== id));
        if (activeTaskLogs?.id === id) {
          setActiveTaskLogs(null);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'خطا در حذف اسکریپت');
      }
    } catch {
      alert('خطا در ارتباط با سرور');
    }
  };

  const handleClearStoppedTasks = async () => {
    try {
      const res = await fetch('/api/processes/clear-stopped', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        }
      });
      if (res.ok) {
        fetchProcesses();
      }
    } catch {
      alert('خطا در پاکسازی اسکریپت‌های متوقف شده');
    }
  };

  const handleViewLogs = async (task: BackgroundTask) => {
    try {
      const res = await fetch(`/api/processes/${task.id}/logs`, {
        headers: { 'x-auth-token': token || '' }
      });
      if (res.ok) {
        const data = await res.json();
        setAutoScrollLogs(true);
        setActiveTaskLogs({
          id: task.id,
          name: task.name,
          command: task.command,
          logs: data.logs || [],
          isRunning: task.status === 'running'
        });
      }
    } catch (e) {
      alert('Failed to fetch logs');
    }
  };

  const handleCopyLogs = () => {
    if (!activeTaskLogs) return;
    const text = activeTaskLogs.logs.join('');
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const filteredSysProcesses = sysProcesses.filter(
    (p) => p.command.toLowerCase().includes(searchQuery.toLowerCase()) || p.pid.toString().includes(searchQuery)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-neutral-200 dark:border-white/10">
        <div>
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Cpu className="h-5 w-5 text-purple-500" />
            <span>{t.processManager}</span>
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            {t.backgroundTasks}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchProcesses}
            className="p-2 rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#121214] hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-800 dark:text-neutral-200 transition cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>



      {/* Dedicated Deploy & Launch Section */}
      <div className="p-4 sm:p-5 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition hover:shadow-md">
        <div className="flex items-start gap-3.5">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
            <UploadCloud className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white mb-0.5">
              {lang === 'fa' ? 'راه‌اندازی و دپلوی پروژه جدید' : 'Launch & Deploy New Project'}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-xl">
              {lang === 'fa'
                ? 'دپلوی مستقیم از گیت‌هاب یا فایل ZIP به عنوان پردازش پس‌زمینه با لاگ زنده'
                : 'Deploy directly from GitHub repositories or zip archives as a persistent background process with real-time logs.'}
            </p>
          </div>
        </div>
        <div className="shrink-0 w-full sm:w-auto">
          <button
            onClick={() => setIsGithubDeployModalOpen(true)}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold bg-[#238636] hover:bg-[#2ea043] text-white transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-500/20 whitespace-nowrap"
          >
            <UploadCloud className="h-4 w-4" />
            <span>{lang === 'fa' ? 'دپلوی پروژه جدید' : 'Start New Deployment'}</span>
          </button>
        </div>
      </div>

      {/* Active Background Tasks List */}
      <div className="p-4 sm:p-5 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
              {t.activeTasks}
            </h3>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-white/5 text-neutral-500 font-mono">
              {tasks.length}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {tasks.some(t => t.status !== 'running') && (
              <button
                onClick={handleClearStoppedTasks}
                className="px-2.5 py-1 rounded-lg text-xs font-medium border border-rose-500/20 text-rose-500 hover:bg-rose-500/10 transition flex items-center gap-1 cursor-pointer"
                title={lang === 'fa' ? 'حذف تمام اسکریپت‌های متوقف شده' : 'Clear stopped tasks'}
              >
                <Trash2 className="h-3 w-3" />
                <span>{lang === 'fa' ? 'پاکسازی متوقف‌شده‌ها' : 'Clear Stopped'}</span>
              </button>
            )}
            <span className="text-xs text-neutral-500 hidden sm:inline">
              {lang === 'fa' ? 'اجرا به صورت پس‌زمینه (Screen / Tmux)' : 'Persistent Background Tasks'}
            </span>
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="text-center py-8 text-neutral-400 text-xs">
            <Terminal className="h-8 w-8 mx-auto mb-2 opacity-30 text-neutral-400" />
            <p>{lang === 'fa' ? 'هیچ اسکریپت پس‌زمینه‌ای در حال اجرا نیست.' : 'No active background scripts found.'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="p-3.5 rounded-xl border border-neutral-200/80 dark:border-white/5 bg-neutral-50/50 dark:bg-white/[0.02] hover:bg-neutral-100/60 dark:hover:bg-white/[0.04] transition flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 shrink-0 mt-0.5">
                    <Terminal className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs sm:text-sm text-neutral-900 dark:text-white truncate">
                        {task.name}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          task.status === 'running'
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            : task.status === 'completed'
                            ? 'bg-blue-500/10 text-blue-400'
                            : 'bg-rose-500/10 text-rose-400'
                        }`}
                      >
                        {task.status === 'running' && <Radio className="h-2.5 w-2.5 animate-pulse" />}
                        {task.status}
                      </span>
                      {task.pid && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          PID: {task.pid}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 truncate mt-1 dir-ltr text-right">
                      {task.command}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1.5 pt-2 md:pt-0 border-t md:border-t-0 border-neutral-200/60 dark:border-white/5 shrink-0">
                  <button
                    onClick={() => handleViewLogs(task)}
                    className="px-2.5 py-1.5 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white transition flex items-center gap-1 cursor-pointer text-xs font-medium"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>{lang === 'fa' ? 'مشاهده لاگ' : 'View Logs'}</span>
                  </button>
                  <button
                    onClick={() => handleRestartTask(task.id)}
                    className="p-1.5 rounded-lg bg-neutral-200/60 dark:bg-white/5 text-neutral-700 dark:text-neutral-300 hover:bg-amber-500 hover:text-white transition cursor-pointer"
                    title={t.restartTask}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setUpdatingTask(task)}
                    className="p-1.5 rounded-lg bg-neutral-200/60 dark:bg-white/5 text-neutral-700 dark:text-neutral-300 hover:bg-indigo-600 hover:text-white transition cursor-pointer"
                    title={t.updateProject}
                  >
                    <GitCommit className="h-3.5 w-3.5" />
                  </button>
                  {task.status === 'running' && (
                    <button
                      onClick={() => handleKillTask(task.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition flex items-center gap-1 cursor-pointer text-xs font-medium"
                    >
                      <StopCircle className="h-3.5 w-3.5" />
                      <span>{lang === 'fa' ? 'توقف' : 'Stop'}</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleRemoveTask(task.id)}
                    className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-600 hover:text-white transition cursor-pointer"
                    title={lang === 'fa' ? 'حذف از جدول' : 'Remove from table'}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* System Processes Table */}
      <div className="p-4 sm:p-5 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 dark:border-white/5 pb-3">
          <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200">{t.systemProcesses}</h3>
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchProcess}
              className="pl-8 pr-3 py-1.5 rounded-xl border border-neutral-300 dark:border-white/10 bg-neutral-50 dark:bg-white/5 text-xs text-neutral-900 dark:text-neutral-100 w-full sm:w-64 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-96 scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-800">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-neutral-100 dark:bg-white/5 text-neutral-500 font-semibold sticky top-0 border-b border-neutral-200 dark:border-white/10">
              <tr>
                <th className="p-2.5">PID</th>
                <th className="p-2.5 hidden sm:table-cell">User</th>
                <th className="p-2.5">CPU %</th>
                <th className="p-2.5">MEM %</th>
                <th className="p-2.5">Command</th>
                <th className="p-2.5 text-right">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
              {filteredSysProcesses.slice(0, 30).map((proc) => (
                <tr key={proc.pid} className="hover:bg-neutral-50 dark:hover:bg-white/5 transition">
                  <td className="p-2.5 text-blue-500 dark:text-blue-400 font-bold">{proc.pid}</td>
                  <td className="p-2.5 text-neutral-500 hidden sm:table-cell">{proc.user}</td>
                  <td className="p-2.5 text-emerald-600 dark:text-emerald-400 font-semibold">{proc.cpu}%</td>
                  <td className="p-2.5 text-purple-600 dark:text-purple-400 font-semibold">{proc.mem}%</td>
                  <td className="p-2.5 text-neutral-700 dark:text-neutral-300 max-w-[140px] sm:max-w-xs truncate dir-ltr text-right">{proc.command}</td>
                  <td className="p-2.5 text-right">
                    <button
                      onClick={() => handleKillTask(undefined, proc.pid)}
                      className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition cursor-pointer text-[11px]"
                    >
                      Kill
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Logs View Modal */}
      {activeTaskLogs && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-neutral-950 text-neutral-100 rounded-2xl border border-neutral-800 w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden font-mono text-xs">
            {/* Modal Header */}
            <div className="p-4 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Terminal className="h-5 w-5 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-neutral-100 truncate">{activeTaskLogs.name}</span>
                    {activeTaskLogs.isRunning ? (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold animate-pulse">
                        <Radio className="h-3 w-3" /> LIVE OUTPUT
                      </span>
                    ) : (
                      <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded-full">
                        FINISHED
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-400 truncate mt-0.5">{activeTaskLogs.command}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleCopyLogs}
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition text-xs font-sans flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedLogs ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>کپی لاگ</span>
                </button>

                {activeTaskLogs.isRunning && (
                  <button
                    onClick={() => {
                      handleKillTask(activeTaskLogs.id);
                      setActiveTaskLogs(prev => prev ? { ...prev, isRunning: false } : null);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-rose-600/20 text-rose-400 hover:bg-rose-600 hover:text-white transition text-xs font-sans font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <StopCircle className="h-3.5 w-3.5" />
                    <span>توقف اسکریپت</span>
                  </button>
                )}

                <button
                  onClick={() => setActiveTaskLogs(null)}
                  className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Live Body */}
            <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
              <div
                ref={modalLogContainerRef}
                onScroll={handleLogScroll}
                className="flex-1 overflow-y-auto p-4 bg-[#0d0d0e] leading-relaxed whitespace-pre-wrap text-neutral-200 text-xs font-mono space-y-1 scrollbar-thin scrollbar-thumb-neutral-800"
              >
                {activeTaskLogs.logs.length === 0 ? (
                  <div className="text-neutral-500 py-12 text-center italic">
                    در حال انتظار برای خروجی اسکریپت...
                  </div>
                ) : (
                  activeTaskLogs.logs.map((logLine, idx) => (
                    <div key={idx} className="break-words">
                      {logLine}
                    </div>
                  ))
                )}
                <div ref={modalLogEndRef} />
              </div>

              {!autoScrollLogs && (
                <button
                  type="button"
                  onClick={() => {
                    setAutoScrollLogs(true);
                    modalLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-sans px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 opacity-95 hover:opacity-100 transition cursor-pointer border border-white/20 backdrop-blur-md z-20"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                  <span>{lang === 'fa' ? 'اسکرول به جدیدترین لاگ‌ها' : 'Scroll to Bottom'}</span>
                </button>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-neutral-900 border-t border-neutral-800 text-[11px] text-neutral-400 flex items-center justify-between font-sans">
              <span className="flex items-center gap-1.5">
                {activeTaskLogs.isRunning ? (
                  autoScrollLogs ? (
                    <span className="text-emerald-400">🟢 اسکرول خودکار زنده فعال است</span>
                  ) : (
                    <span className="text-amber-400">⏸️ اسکرول خودکار غیرفعال شد (مکث برای بررسی لاگ‌های قدیمی)</span>
                  )
                ) : (
                  'پایان اجرای اسکریپت'
                )}
              </span>
              <button
                onClick={() => setActiveTaskLogs(null)}
                className="px-4 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold cursor-pointer"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Project Modal */}
      <ProjectUpdateModal
        token={token}
        lang={lang}
        isOpen={updatingTask !== null}
        onClose={() => setUpdatingTask(null)}
        onSuccess={fetchProcesses}
        task={updatingTask}
      />

      {/* GitHub-style Deploy Modal */}
      <GithubUploadDeployModal
        token={token}
        lang={lang}
        isOpen={isGithubDeployModalOpen}
        onClose={() => setIsGithubDeployModalOpen(false)}
        onSuccess={fetchProcesses}
        defaultPath={defaultPath}
        isDeployMode={true}
        initialTaskName=""
        initialCommand=""
      />
    </div>
  );
};
