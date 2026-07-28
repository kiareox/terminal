import React, { useState } from 'react';
import { Server, Lock, User as UserIcon, Shield, ArrowRight, Sparkles } from 'lucide-react';
import { Language, User } from '../types';
import { translations } from '../locales/translations';

interface LoginModalProps {
  lang: Language;
  onLoginSuccess: (token: string, user: User) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ lang, onLoginSuccess }) => {
  const t = translations[lang];
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (res.ok && data.token) {
        onLoginSuccess(data.token, data.user);
      } else {
        setError(data.error || t.loginError);
      }
    } catch (e: any) {
      setError('خطا در ارتباط با سرور. لطفا مجدداً تلاش نمایید.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => {
    setUsername('admin');
    setPassword('admin123');
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0A0A0B]/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#121214] rounded-3xl border border-neutral-200 dark:border-white/10 w-full max-w-md p-8 shadow-2xl space-y-6">
        {/* App Logo & Header */}
        <div className="text-center space-y-2">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center mx-auto shadow-xl shadow-blue-500/20">
            <Server className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">{t.appTitle}</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{t.login}</p>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1.5">{t.username}</label>
            <div className="relative">
              <UserIcon className="h-4 w-4 text-neutral-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={username || ''}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-neutral-300 dark:border-white/10 bg-neutral-50 dark:bg-white/5 text-sm text-neutral-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1.5">{t.password}</label>
            <div className="relative">
              <Lock className="h-4 w-4 text-neutral-400 absolute left-3.5 top-3" />
              <input
                type="password"
                value={password || ''}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-neutral-300 dark:border-white/10 bg-neutral-50 dark:bg-white/5 text-sm text-neutral-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-xl shadow-blue-500/25 transition cursor-pointer flex items-center justify-center gap-2"
          >
            <span>{loading ? 'در حال بررسی اطلاعات...' : t.loginSubmit}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        {/* Demo Credentials Helper Pill */}
        <div className="pt-2 border-t border-neutral-100 dark:border-white/10 text-center">
          <button
            type="button"
            onClick={fillDemo}
            className="text-xs text-neutral-500 hover:text-blue-400 dark:text-neutral-400 dark:hover:text-blue-400 font-medium inline-flex items-center gap-1 cursor-pointer transition"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>پر کردن اطلاعات نمونه (admin / admin123)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
