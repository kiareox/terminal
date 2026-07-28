import React, { useState, useEffect } from 'react';
import { FileText, Search, Download, Filter, RefreshCw } from 'lucide-react';
import { LogEntry, Language } from '../types';
import { translations } from '../locales/translations';

interface LogsViewerProps {
  token: string | null;
  lang: Language;
}

export const LogsViewer: React.FC<LogsViewerProps> = ({ token, lang }) => {
  const t = translations[lang];
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchLogs = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/logs/system', {
        headers: { 'x-auth-token': token }
      });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error('Failed to fetch logs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [token]);

  const filteredLogs = logs.filter((log) => {
    const matchesLevel = selectedLevel === 'ALL' || log.level === selectedLevel;
    const matchesSearch =
      log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.source.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  const handleExportLogs = () => {
    const content = filteredLogs
      .map((l) => `[${l.timestamp}] [${l.level}] [${l.source}]: ${l.message}`)
      .join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `serverdash_system_logs_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200 dark:border-white/10">
        <div>
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <FileText className="h-5 w-5 text-rose-500" />
            <span>{t.systemLogsTitle}</span>
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            مشاهده و بررسی رویدادها، لاگ‌های سیستمی و هشدارهای سرور
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportLogs}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-500 transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-blue-500/20"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t.exportLogs}</span>
          </button>

          <button
            onClick={fetchLogs}
            className="p-2 rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#121214] hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-800 dark:text-neutral-200 transition cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="p-4 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xl">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-neutral-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery || ''}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchLogs}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-neutral-300 dark:border-white/10 bg-neutral-50 dark:bg-white/5 text-xs text-neutral-900 dark:text-neutral-100 font-mono"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-neutral-400" />
          <select
            value={selectedLevel || 'ALL'}
            onChange={(e) => setSelectedLevel(e.target.value)}
            className="px-3 py-2 rounded-xl border border-neutral-300 dark:border-white/10 bg-neutral-50 dark:bg-white/5 text-xs font-semibold text-neutral-800 dark:text-neutral-200"
          >
            <option value="ALL">{t.allLevels}</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
            <option value="DEBUG">DEBUG</option>
          </select>
        </div>
      </div>

      {/* Log Console Container */}
      <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-neutral-900 dark:bg-[#121214] text-neutral-200 p-5 font-mono text-xs h-[520px] overflow-y-auto space-y-2.5 shadow-2xl">
        {filteredLogs.length === 0 ? (
          <p className="text-neutral-500 italic text-center py-12">هیچ لاگی با فیلتر مشخص شده پیدا نشد.</p>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              className={`p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition flex flex-col sm:flex-row sm:items-center gap-3 ${
                log.level === 'ERROR'
                  ? 'border-r-4 border-r-red-500'
                  : log.level === 'WARN'
                  ? 'border-r-4 border-r-amber-500'
                  : 'border-r-4 border-r-blue-500'
              }`}
            >
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-gray-500 text-[11px] font-mono">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                <span
                  className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider ${
                    log.level === 'ERROR'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : log.level === 'WARN'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  }`}
                >
                  {log.level}
                </span>
                <span className="text-purple-400 font-semibold font-mono">[{log.source}]</span>
              </div>
              <p className="text-gray-300 break-words flex-1 leading-relaxed font-mono text-xs">{log.message}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
