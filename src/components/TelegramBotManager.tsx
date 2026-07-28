import React, { useState, useEffect } from 'react';
import { Bot, Save, Power, RefreshCw, Send, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Language } from '../types';

interface TelegramBotManagerProps {
  token: string | null;
  lang: Language;
}

export const TelegramBotManager: React.FC<TelegramBotManagerProps> = ({ token, lang }) => {
  const isFa = lang === 'fa';

  const [botConfig, setBotConfig] = useState({
    bot_token: '',
    admin_user_id: '',
    web_url: ''
  });

  const [status, setStatus] = useState({
    isRunning: false,
    pid: null as number | null,
    startedAt: null as string | null,
    logs: [] as string[],
    configValid: false
  });

  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Fetch bot config and status on mount
  useEffect(() => {
    if (!token) return;
    fetchConfig();
    fetchStatus();

    // Poll status every 3 seconds for live logs
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [token]);

  const fetchConfig = async () => {
    if (!token) return;
    setConfigLoading(true);
    try {
      const resp = await fetch('/api/telegram-bot/config', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (resp.ok && resp.headers.get('content-type')?.includes('application/json')) {
        const data = await resp.json();
        setBotConfig({
          bot_token: data.bot_token || '',
          admin_user_id: data.admin_user_id ? String(data.admin_user_id) : '',
          web_url: data.web_url || window.location.origin
        });
      }
    } catch (err) {
      console.error('Failed to fetch bot config:', err);
    } finally {
      setConfigLoading(false);
    }
  };

  const fetchStatus = async () => {
    if (!token) return;
    try {
      const resp = await fetch('/api/telegram-bot/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (resp.ok && resp.headers.get('content-type')?.includes('application/json')) {
        const data = await resp.json();
        setStatus({
          isRunning: data.isRunning,
          pid: data.pid,
          startedAt: data.startedAt,
          logs: data.logs || [],
          configValid: data.configValid
        });
      }
    } catch (err) {
      console.error('Failed to fetch bot status:', err);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const resp = await fetch('/api/telegram-bot/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(botConfig)
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setMessage({
          text: isFa ? 'تنظیمات ربات با موفقیت ذخیره شد.' : 'Telegram bot configuration saved successfully.',
          type: 'success'
        });
        fetchStatus();
      } else {
        setMessage({
          text: data.error || (isFa ? 'خطا در ذخیره تنظیمات' : 'Failed to save configuration'),
          type: 'error'
        });
      }
    } catch (err: any) {
      setMessage({
        text: err.message || (isFa ? 'خطا در شبکه' : 'Network error'),
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStartBot = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const resp = await fetch('/api/telegram-bot/start', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setMessage({
          text: isFa ? 'ربات تلگرام با موفقیت راه‌اندازی شد.' : 'Telegram bot started successfully.',
          type: 'success'
        });
        fetchStatus();
      } else {
        setMessage({
          text: data.error || (isFa ? 'خطا در راه‌اندازی ربات' : 'Failed to start bot'),
          type: 'error'
        });
      }
    } catch (err: any) {
      setMessage({
        text: err.message || (isFa ? 'خطا در شبکه' : 'Network error'),
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStopBot = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const resp = await fetch('/api/telegram-bot/stop', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (resp.ok) {
        setMessage({
          text: isFa ? 'ربات تلگرام متوقف شد.' : 'Telegram bot stopped successfully.',
          type: 'success'
        });
        fetchStatus();
      }
    } catch (err: any) {
      setMessage({
        text: err.message || (isFa ? 'خطا در شبکه' : 'Network error'),
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6" dir={isFa ? 'rtl' : 'ltr'}>
      {/* Title Header */}
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-neutral-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-sky-50 dark:bg-sky-950/30 text-sky-500 rounded-xl">
            <Bot size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-neutral-100">
              {isFa ? 'دستیار و ربات تلگرام ترمینال' : 'Telegram Terminal Assistant Bot'}
            </h1>
            <p className="text-sm text-gray-500 dark:text-neutral-400 mt-0.5">
              {isFa 
                ? 'مدیریت و اتصال سرور به ربات تلگرام جهت کنترل از راه دور سیستم' 
                : 'Manage and connect your server to Telegram for full remote-control'}
            </p>
          </div>
        </div>
        
        {/* Status indicator */}
        <div className="flex items-center gap-2">
          {status.isRunning ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {isFa ? 'در حال اجرا' : 'Running'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-400">
              <span className="w-2 h-2 rounded-full bg-gray-400"></span>
              {isFa ? 'متوقف شده' : 'Stopped'}
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className={`p-4 rounded-xl flex items-start gap-3 border ${
          message.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-400' 
            : 'bg-rose-50 dark:bg-rose-950/10 border-rose-100 dark:border-rose-900/30 text-rose-800 dark:text-rose-400'
        }`}>
          {message.type === 'success' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <AlertCircle size={18} className="mt-0.5 shrink-0" />}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Config and control Column */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-md font-semibold text-gray-900 dark:text-neutral-100 mb-4 flex items-center gap-2">
              <Save size={18} className="text-sky-500" />
              {isFa ? 'پیکربندی هویت ربات' : 'Bot Configuration'}
            </h3>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-neutral-400 mb-1.5">
                  {isFa ? 'توکن ربات تلگرام (Bot Token)' : 'Telegram Bot Token'}
                </label>
                <input
                  type="password"
                  value={botConfig.bot_token || ''}
                  onChange={(e) => setBotConfig({ ...botConfig, bot_token: e.target.value })}
                  placeholder="e.g. 123456789:ABCdefGhI..."
                  required
                  className="w-full px-3.5 py-2 text-sm bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-gray-800 dark:text-neutral-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-neutral-400 mb-1.5">
                  {isFa ? 'شناسه عددی ادمین (Admin Chat ID)' : 'Admin User Chat ID'}
                </label>
                <input
                  type="text"
                  value={botConfig.admin_user_id || ''}
                  onChange={(e) => setBotConfig({ ...botConfig, admin_user_id: e.target.value })}
                  placeholder="e.g. 987654321"
                  required
                  className="w-full px-3.5 py-2 text-sm bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-gray-800 dark:text-neutral-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-neutral-400 mb-1.5">
                  {isFa ? 'آدرس لینک یا وب اپ پنل (Web Panel URL)' : 'Web Panel URL / WebApp'}
                </label>
                <input
                  type="text"
                  value={botConfig.web_url || ''}
                  onChange={(e) => setBotConfig({ ...botConfig, web_url: e.target.value })}
                  placeholder="e.g. https://your-server-panel.app"
                  className="w-full px-3.5 py-2 text-sm bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-gray-800 dark:text-neutral-200"
                />
              </div>

              <button
                type="submit"
                disabled={configLoading || loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-400 text-white rounded-xl text-sm font-semibold cursor-pointer transition-colors mt-2"
              >
                {configLoading ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                {isFa ? 'ذخیره تنظیمات' : 'Save Configuration'}
              </button>
            </form>
          </div>

          {/* Controller Card */}
          <div className="bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-md font-semibold text-gray-900 dark:text-neutral-100 flex items-center gap-2">
              <Power size={18} className="text-indigo-500" />
              {isFa ? 'کنترلر وضعیت ربات' : 'Bot Process Control'}
            </h3>

            {!status.configValid && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-xl flex gap-2 text-amber-800 dark:text-amber-400 text-xs">
                <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                <span>
                  {isFa 
                    ? 'پیکربندی ربات کامل نیست. ابتدا توکن معتبر و آیدی ادمین را وارد و ذخیره کنید.' 
                    : 'Bot configuration is incomplete. Please enter and save valid keys first.'}
                </span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleStartBot}
                disabled={status.isRunning || !status.configValid || loading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-100 dark:disabled:bg-neutral-800 disabled:text-gray-400 text-white rounded-xl text-sm font-semibold cursor-pointer transition-colors"
              >
                <Power size={16} />
                {isFa ? 'راه‌اندازی ربات' : 'Start Bot'}
              </button>

              <button
                type="button"
                onClick={handleStopBot}
                disabled={!status.isRunning || loading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-500 hover:bg-rose-600 disabled:bg-neutral-100 dark:disabled:bg-neutral-800 disabled:text-gray-400 text-white rounded-xl text-sm font-semibold cursor-pointer transition-colors"
              >
                <Power size={16} />
                {isFa ? 'خاموش کردن' : 'Stop Bot'}
              </button>
            </div>

            {status.isRunning && (
              <div className="border-t border-gray-50 dark:border-neutral-800 pt-3 text-xs text-gray-500 dark:text-neutral-400 space-y-1.5">
                <div className="flex justify-between">
                  <span>{isFa ? 'شناسه پردازش (PID):' : 'Process ID (PID):'}</span>
                  <span className="font-mono text-gray-700 dark:text-neutral-300 font-semibold">{status.pid}</span>
                </div>
                <div className="flex justify-between">
                  <span>{isFa ? 'زمان شروع فعالیت:' : 'Uptime Started At:'}</span>
                  <span className="font-mono text-gray-700 dark:text-neutral-300">
                    {status.startedAt ? status.startedAt.substring(11, 19) : ''}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Live Logs Column */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 rounded-2xl p-5 shadow-sm flex flex-col h-[400px]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-md font-semibold text-gray-900 dark:text-neutral-100 flex items-center gap-2">
                <RefreshCw size={16} className="text-sky-500" />
                {isFa ? 'لاگ‌های زنده ربات تلگرام' : 'Telegram Bot Live Output Logs'}
              </h3>
              <button 
                onClick={fetchStatus}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-neutral-200 transition-colors"
                title={isFa ? 'بروزرسانی لاگ‌ها' : 'Refresh Logs'}
              >
                <RefreshCw size={16} />
              </button>
            </div>

            <div className="flex-1 bg-neutral-950 border border-neutral-900 rounded-xl p-4 font-mono text-xs text-neutral-300 overflow-y-auto space-y-1 select-text">
              {status.logs.length > 0 ? (
                status.logs.map((log, idx) => (
                  <div key={idx} className="whitespace-pre-wrap break-all leading-relaxed hover:bg-neutral-900/50 px-1 py-0.5 rounded">
                    {log}
                  </div>
                ))
              ) : (
                <div className="text-neutral-600 text-center py-12">
                  {isFa ? 'هیچ خروجی یا لاگی برای نمایش وجود ندارد.' : 'No output logs available. Start the bot to see logs here.'}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
