import React from 'react';
import { Activity, Terminal as TerminalIcon, FolderOpen, Cpu, BookOpen, Globe, Bot } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../locales/translations';

export type ActiveTab = 'monitoring' | 'terminal' | 'fileManager' | 'processManager' | 'telegramBot' | 'vpnManager' | 'documentation';

interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  lang: Language;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, lang }) => {
  const t = translations[lang];

  const navItems = [
    { id: 'monitoring' as ActiveTab, label: t.monitoring, icon: Activity, color: 'text-emerald-500' },
    { id: 'terminal' as ActiveTab, label: t.terminal, icon: TerminalIcon, color: 'text-blue-500' },
    { id: 'fileManager' as ActiveTab, label: t.fileManager, icon: FolderOpen, color: 'text-amber-500' },
    { id: 'processManager' as ActiveTab, label: t.processManager, icon: Cpu, color: 'text-purple-500' },
    { id: 'telegramBot' as ActiveTab, label: t.telegramBot, icon: Bot, color: 'text-sky-500' },
    { id: 'vpnManager' as ActiveTab, label: t.vpnManager, icon: Globe, color: 'text-indigo-500' },
    { id: 'documentation' as ActiveTab, label: t.documentation, icon: BookOpen, color: 'text-teal-500' },
  ];


  return (
    <aside className="w-full md:w-64 border-b md:border-b-0 md:border-l border-neutral-200 dark:border-white/10 bg-neutral-50/80 dark:bg-[#121214] p-4 shrink-0 flex flex-col gap-6 md:sticky md:top-16 md:h-[calc(100vh-4rem)] md:overflow-y-auto">
      <nav className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible pb-1 md:pb-0 scrollbar-none">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-600/20 shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/60 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white border border-transparent'
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-blue-400' : item.color}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};
