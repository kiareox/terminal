import React, { useState, useEffect, useRef } from 'react';
import { Cpu, Play, StopCircle, RefreshCw, Terminal, Eye, Search, Radio, Copy, Check, X, ShieldAlert, GitCommit, UploadCloud } from 'lucide-react';
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

  const modalLogEndRef = useRef<HTMLDivElement>(null);

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

  // Auto scroll log modal
  useEffect(() => {
    if (activeTaskLogs) {
      modalLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeTaskLogs?.logs]);

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

  const handleViewLogs = async (task: BackgroundTask) => {
    try {
      const res = await fetch(`/api/processes/${task.id}/logs`, {
        headers: { 'x-auth-token': token || '' }
      });
      if (res.ok) {
        const data = await res.json();
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

      {/* Bento Highlight Banner Card */}
      <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 rounded-2xl p-5 relative overflow-hidden shadow-xl shadow-blue-900/20 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative z-10">
          <h3 className="text-base font-bold mb-1 flex items-center gap-2">
            <Terminal className="h-4 w-4 text-emerald-300" />
            <span>مدیریت اسکریپت‌ها و پردازش‌های پس‌زمینه</span>
          </h3>
          <p className="text-blue-100 text-xs leading-relaxed max-w-xl">
            تمام اسکریپت‌ها و دستورات جدا شده از ترمینال (Ctrl+A+D) در این بخش به صورت زنده ثبت می‌شوند و لاگ‌های لحظه‌ای آن‌ها قابل مشاهده است.
          </p>
        </div>
        <div className="relative z-10 flex items-center gap-2 shrink-0">
          <div className="flex -space-x-2 space-x-reverse">
            <div className="w-8 h-8 rounded-full bg-white/20 border border-white/30 flex items-center justify-center text-[10px] font-mono text-white">SH</div>
            <div className="w-8 h-8 rounded-full bg-white/20 border border-white/30 flex items-center justify-center text-[10px] font-mono text-white">PY</div>
          </div>
          <span className="bg-white/20 px-3 py-1 rounded-xl text-xs font-bold border border-white/30 backdrop-blur-md">
            {tasks.filter(t => t.status === 'running').length} در حال اجرا
          </span>
        </div>
        <div className="absolute top-[-20px] left-[-20px] w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
      </div>

      {/* Dedicated Deploy & Launch Section */}
      <div className="p-6 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-lg flex flex-col md:flex-row items-center justify-between gap-6 transition hover:shadow-xl">
        <div className="flex items-start gap-4">
          <div className="p-3.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-neutral-900 dark:text-white mb-1">
              {lang === 'fa' ? 'راه‌اندازی و دپلوی پروژه جدید' : 'Launch & Deploy New Project'}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-xl">
              {lang === 'fa'
                ? 'پروژه‌های خود را مستقیماً از مخازن گیت‌هاب دپلوی کنید یا فایل‌های کد فشرده (ZIP) را آپلود نمایید تا اسکریپت شما به عنوان پردازش پس‌زمینه با لاگ زنده اجرا شود.'
                : 'Deploy your projects directly from GitHub repositories or upload zip archives to execute your script as a persistent background process with real-time logs.'}
            </p>
          </div>
        </div>
        <div className="shrink-0 w-full md:w-auto">
          <button
            onClick={() => setIsGithubDeployModalOpen(true)}
            className="w-full md:w-auto px-6 py-3 rounded-xl text-xs font-bold bg-[#238636] hover:bg-[#2ea043] text-white transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/25 whitespace-nowrap"
          >
            <UploadCloud className="h-4 w-4" />
            <span>{lang === 'fa' ? 'شروع دپلوی پروژه جدید' : 'Start New Deployment'}</span>
          </button>
        </div>
      </div>


      {/* Active Background Tasks List */}
      <div className="p-5 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
            <span>{t.activeTasks}</span>
            <span className="text-xs font-normal text-neutral-500">(شامل اسکریپت‌های ترمینال)</span>
          </h3>
          <span className="text-xs text-neutral-500">مجموع: {tasks.length} اسکریپت</span>
        </div>

        {tasks.length === 0 ? (
          <p className="text-xs text-neutral-500 italic py-6 text-center">هیچ اسکریپت پس‌زمینه‌ای ثبت نشده است.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-100 dark:bg-white/5 text-neutral-500 font-semibold border-b border-neutral-200 dark:border-white/10">
                <tr>
                  <th className="p-3">{t.taskName}</th>
                  <th className="p-3">{t.commandToRun}</th>
                  <th className="p-3">{t.pid}</th>
                  <th className="p-3">{t.status}</th>
                  <th className="p-3">{t.startedAt}</th>
                  <th className="p-3 text-right">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-white/5 font-mono">
                {tasks.map((task) => (
                  <tr key={task.id} className="hover:bg-neutral-50 dark:hover:bg-white/5 transition">
                    <td className="p-3 font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                      <Terminal className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                      <span className="truncate max-w-[160px]">{task.name}</span>
                    </td>
                    <td className="p-3 text-neutral-600 dark:text-neutral-400 max-w-[220px] truncate">{task.command}</td>
                    <td className="p-3 text-neutral-500 font-bold text-amber-500">{task.pid || '-'}</td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          task.status === 'running'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 animate-pulse'
                            : task.status === 'completed'
                            ? 'bg-blue-500/10 text-blue-400'
                            : 'bg-rose-500/10 text-rose-400'
                        }`}
                      >
                        {task.status === 'running' && <Radio className="h-2.5 w-2.5" />}
                        {task.status}
                      </span>
                    </td>
                    <td className="p-3 text-neutral-500">{new Date(task.startedAt).toLocaleTimeString()}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleViewLogs(task)}
                          className="px-2.5 py-1 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white transition flex items-center gap-1.5 cursor-pointer font-sans font-semibold text-xs"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>مشاهده لاگ زنده</span>
                        </button>
                        <button
                          onClick={() => handleRestartTask(task.id)}
                          className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500 hover:text-white transition flex items-center gap-1 cursor-pointer font-sans font-semibold text-xs"
                          title="Restart Task"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          <span>{t.restartTask}</span>
                        </button>
                        <button
                          onClick={() => setUpdatingTask(task)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white transition flex items-center gap-1 cursor-pointer font-sans font-semibold text-xs"
                          title="Update Project"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          <span>{t.updateProject}</span>
                        </button>
                        {task.status === 'running' && (
                          <button
                            onClick={() => handleKillTask(task.id)}
                            className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition flex items-center gap-1 cursor-pointer font-sans font-semibold text-xs"
                          >
                            <StopCircle className="h-3.5 w-3.5" />
                            <span>توقف</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* System Processes Table */}
      <div className="p-5 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200">{t.systemProcesses}</h3>
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchProcess}
              className="pl-8 pr-3 py-1.5 rounded-xl border border-neutral-300 dark:border-white/10 bg-neutral-50 dark:bg-white/5 text-xs text-neutral-900 dark:text-neutral-100 w-full sm:w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-neutral-100 dark:bg-white/5 text-neutral-500 font-semibold sticky top-0 border-b border-neutral-200 dark:border-white/10">
              <tr>
                <th className="p-2.5">PID</th>
                <th className="p-2.5">User</th>
                <th className="p-2.5">CPU %</th>
                <th className="p-2.5">MEM %</th>
                <th className="p-2.5">Command</th>
                <th className="p-2.5 text-right">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
              {filteredSysProcesses.slice(0, 20).map((proc) => (
                <tr key={proc.pid} className="hover:bg-neutral-50 dark:hover:bg-white/5">
                  <td className="p-2.5 text-blue-400 font-bold">{proc.pid}</td>
                  <td className="p-2.5 text-neutral-500">{proc.user}</td>
                  <td className="p-2.5 text-emerald-400 font-semibold">{proc.cpu}%</td>
                  <td className="p-2.5 text-purple-400 font-semibold">{proc.mem}%</td>
                  <td className="p-2.5 text-neutral-700 dark:text-neutral-300 max-w-xs truncate">{proc.command}</td>
                  <td className="p-2.5 text-right">
                    <button
                      onClick={() => handleKillTask(undefined, proc.pid)}
                      className="px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white transition cursor-pointer"
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
            <div className="flex-1 overflow-y-auto p-4 bg-[#0d0d0e] leading-relaxed whitespace-pre-wrap text-neutral-200 text-xs font-mono space-y-1 scrollbar-thin scrollbar-thumb-neutral-800">
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

            {/* Modal Footer */}
            <div className="p-3 bg-neutral-900 border-t border-neutral-800 text-[11px] text-neutral-400 flex items-center justify-between font-sans">
              <span>
                {activeTaskLogs.isRunning
                  ? '🔄 لاگ‌ها به صورت زنده بروزرسانی می‌شوند (مشابه screen / tmux)'
                  : 'پایان اجرای اسکریپت'}
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
