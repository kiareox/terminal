import React from 'react';
import { BookOpen, Shield, Terminal, Cpu, FolderOpen, Key, HelpCircle, CheckCircle2 } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../locales/translations';

interface DocumentationViewProps {
  lang: Language;
}

export const DocumentationView: React.FC<DocumentationViewProps> = ({ lang }) => {
  const t = translations[lang];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Title */}
      <div className="pb-3 border-b border-neutral-200 dark:border-white/10">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-blue-500" />
          <span>{t.docTitle}</span>
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
          {t.docIntro}
        </p>
      </div>

      {/* Section 1: Security */}
      <div className="p-6 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-2xl space-y-3">
        <h3 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
          <Shield className="h-5 w-5 text-indigo-400" />
          <span>{t.docSection1}</span>
        </h3>
        <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
          {t.docSection1Text}
        </p>
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/5 font-mono text-xs text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-white/10">
          نام کاربری پیش‌فرض: <span className="text-emerald-400 font-bold">admin</span> | رمز عبور پیش‌فرض: <span className="text-emerald-400 font-bold">admin123</span>
        </div>
      </div>

      {/* Section 2: Terminal Shortcuts */}
      <div className="p-6 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-2xl space-y-4">
        <h3 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
          <Terminal className="h-5 w-5 text-blue-400" />
          <span>{t.docSection2}</span>
        </h3>
        <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
          {t.docSection2Text}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
            <span className="font-mono font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">Ctrl + C</span>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">{t.shortcutCtrlC}</p>
          </div>
          <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
            <span className="font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">Ctrl + L</span>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">{t.shortcutCtrlL}</p>
          </div>
          <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
            <span className="font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">Tab</span>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">{t.shortcutTab}</p>
          </div>
          <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
            <span className="font-mono font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">کلیدهای جهت بالا/پایین</span>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">{t.shortcutArrows}</p>
          </div>
        </div>
      </div>

      {/* Section 3: Background Tasks */}
      <div className="p-6 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-2xl space-y-3">
        <h3 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
          <Cpu className="h-5 w-5 text-purple-400" />
          <span>{t.docSection3}</span>
        </h3>
        <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
          {t.docSection3Text}
        </p>
      </div>

      {/* Section 4: File Manager & Permissions */}
      <div className="p-6 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-2xl space-y-3">
        <h3 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-amber-400" />
          <span>{t.docSection4}</span>
        </h3>
        <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
          {t.docSection4Text}
        </p>
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/5 font-mono text-xs text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-white/10 space-y-1">
          <div><span className="text-amber-400 font-bold">755</span>: دسترسی خواندن و اجرا برای همه، ویرایش فقط صاحب فایل</div>
          <div><span className="text-amber-400 font-bold">644</span>: دسترسی خواندن برای همه، ویرایش فقط صاحب فایل</div>
          <div><span className="text-amber-400 font-bold">777</span>: دسترسی کامل خواندن، نوشتن و اجرا برای همه کاربران</div>
        </div>
      </div>
    </div>
  );
};
