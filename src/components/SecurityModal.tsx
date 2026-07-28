import React, { useState } from 'react';
import { Shield, Lock, User, Check, AlertCircle, X } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../locales/translations';

interface SecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
  lang: Language;
  onCredentialsUpdated: (newToken: string) => void;
}

export const SecurityModal: React.FC<SecurityModalProps> = ({
  isOpen,
  onClose,
  token,
  lang,
  onCredentialsUpdated
}) => {
  const t = translations[lang];
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword && newPassword !== confirmPassword) {
      setError(t.passMismatch);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify({ currentPassword, newUsername, newPassword })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(t.secUpdateSuccess);
        if (data.newToken) {
          onCredentialsUpdated(data.newToken);
        }
        setTimeout(() => {
          onClose();
          setSuccess(null);
        }, 1500);
      } else {
        setError(data.error || 'خطا در بروزرسانی اطلاعات');
      }
    } catch (e: any) {
      setError(e.message || 'خطا در شبکه');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#121214] rounded-2xl border border-neutral-200 dark:border-white/10 w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-neutral-200 dark:border-white/10">
          <h3 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            <span>{t.secSettingsTitle}</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-500 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{t.currentPassword} *</label>
            <input
              type="password"
              value={currentPassword || ''}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full mt-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-white/10 bg-neutral-50 dark:bg-white/5 text-xs text-neutral-900 dark:text-neutral-100"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{t.currentUsername} (اختیاری جهت تغییر)</label>
            <input
              type="text"
              value={newUsername || ''}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="admin"
              className="w-full mt-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-white/10 bg-neutral-50 dark:bg-white/5 text-xs text-neutral-900 dark:text-neutral-100"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{t.newPassword} (اختیاری جهت تغییر)</label>
            <input
              type="password"
              value={newPassword || ''}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-white/10 bg-neutral-50 dark:bg-white/5 text-xs text-neutral-900 dark:text-neutral-100"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{t.confirmNewPassword}</label>
            <input
              type="password"
              value={confirmPassword || ''}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-white/10 bg-neutral-50 dark:bg-white/5 text-xs text-neutral-900 dark:text-neutral-100"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-white/10 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/10 transition cursor-pointer"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 transition cursor-pointer shadow-lg shadow-blue-500/20"
            >
              {loading ? 'در حال بروزرسانی...' : t.updateSecurity}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
