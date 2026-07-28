import React from 'react';
import { Sun, Moon, Languages, LogOut, Shield, Wifi, User as UserIcon } from 'lucide-react';
import { Language, ThemeMode, User } from '../types';
import { translations } from '../locales/translations';

const avatarImg = '/terminal_avatar.jpg';

interface NavbarProps {
  user: User | null;
  lang: Language;
  theme: ThemeMode;
  onToggleLang: () => void;
  onToggleTheme: () => void;
  onOpenSecurity: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  lang,
  theme,
  onToggleLang,
  onToggleTheme,
  onOpenSecurity,
  onLogout
}) => {
  const t = translations[lang];

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-neutral-200 dark:border-white/10 bg-white/90 dark:bg-[#0A0A0B]/80 backdrop-blur-md px-4 md:px-6 flex items-center justify-between transition-colors">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl overflow-hidden border border-emerald-500/30 shadow-lg shadow-emerald-500/10 bg-neutral-900 shrink-0">
          <img src={avatarImg} alt="Terminal Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        </div>
        <div>
          <h1 className="font-bold text-base leading-none tracking-tight text-neutral-900 dark:text-white">
            {t.appTitle}
          </h1>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 hidden sm:block">
            {t.appSubTitle}
          </p>
        </div>
        <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20 mr-2">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
          <Wifi className="h-3.5 w-3.5" />
          <span>{t.serverOnline}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Language Toggle */}
        <button
          onClick={onToggleLang}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition flex items-center gap-1.5 text-neutral-700 dark:text-neutral-200 cursor-pointer"
          title={t.langToggle}
        >
          <Languages className="h-3.5 w-3.5" />
          <span>{t.langToggle}</span>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition text-neutral-700 dark:text-neutral-200 cursor-pointer"
          title={t.themeToggle}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-700" />}
        </button>

        {/* User / Security */}
        {user && (
          <div className="flex items-center gap-2 pl-2 border-l border-neutral-200 dark:border-neutral-800 mr-1">
            <button
              onClick={onOpenSecurity}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 transition cursor-pointer"
            >
              <UserIcon className="h-3.5 w-3.5 text-emerald-500" />
              <span>{user.username}</span>
              <Shield className="h-3.5 w-3.5 text-neutral-400 ml-1" />
            </button>

            <button
              onClick={onLogout}
              className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200/50 dark:border-red-900/30 transition cursor-pointer"
              title={t.logout}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
