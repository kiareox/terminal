import React, { useState, useEffect } from 'react';
import { AuthState, Language, ThemeMode, User } from './types';
import { Navbar } from './components/Navbar';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { MonitoringDashboard } from './components/MonitoringDashboard';
import { TerminalView } from './components/TerminalView';
import { FileManager } from './components/FileManager';
import { ProcessManager } from './components/ProcessManager';
import { TelegramBotManager } from './components/TelegramBotManager';
import { VpnManager } from './components/VpnManager';
import { DocumentationView } from './components/DocumentationView';
import { SecurityModal } from './components/SecurityModal';
import { LoginModal } from './components/LoginModal';

export default function App() {
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('serverdash_lang');
    return (saved === 'fa' || saved === 'en') ? saved : 'fa';
  });
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('serverdash_theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });
  const [activeTab, setActiveTab] = useState<ActiveTab>('monitoring');
  const [isSecurityOpen, setIsSecurityOpen] = useState(false);

  const [auth, setAuth] = useState<AuthState>(() => {
    let savedToken = localStorage.getItem('serverdash_token');
    if (!savedToken) {
      savedToken = 'serverdash_secret_token_2026_x98';
      localStorage.setItem('serverdash_token', savedToken);
    }
    return {
      isAuthenticated: true,
      user: { username: 'admin', role: 'Administrator', loginTime: new Date().toISOString() },
      token: savedToken
    };
  });

  // Apply RTL/LTR dir attribute based on language
  useEffect(() => {
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    localStorage.setItem('serverdash_lang', lang);
  }, [lang]);

  // Apply dark/light class to root document
  useEffect(() => {
    localStorage.setItem('serverdash_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Verify stored token on load
  useEffect(() => {
    if (auth.token) {
      fetch('/api/auth/me', {
        headers: { 'x-auth-token': auth.token }
      })
        .then((res) => {
          if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
            return res.json();
          }
          throw new Error('Token expired or invalid response');
        })
        .then((data) => {
          if (data && data.user) {
            setAuth((prev) => ({ ...prev, isAuthenticated: true, user: data.user }));
          }
        })
        .catch(() => {
          localStorage.removeItem('serverdash_token');
          setAuth({ isAuthenticated: false, user: null, token: null });
        });
    } else {
      setAuth({ isAuthenticated: false, user: null, token: null });
    }
  }, []);

  const handleLoginSuccess = (token: string, user: User) => {
    localStorage.setItem('serverdash_token', token);
    setAuth({ isAuthenticated: true, user, token });
  };

  const handleLogout = () => {
    localStorage.removeItem('serverdash_token');
    setAuth({ isAuthenticated: false, user: null, token: null });
  };

  const handleCredentialsUpdated = (newToken: string) => {
    localStorage.setItem('serverdash_token', newToken);
    setAuth((prev) => ({ ...prev, token: newToken }));
  };

  const toggleLang = () => {
    setLang((prev) => (prev === 'fa' ? 'en' : 'fa'));
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <div 
      className="min-h-screen bg-neutral-100 dark:bg-[#0A0A0B] text-neutral-900 dark:text-gray-200 font-sans transition-colors duration-200"
      dir={lang === 'fa' ? 'rtl' : 'ltr'}
    >
      {/* Top Navbar */}
      <Navbar
        user={auth.user}
        lang={lang}
        theme={theme}
        onToggleLang={toggleLang}
        onToggleTheme={toggleTheme}
        onOpenSecurity={() => setIsSecurityOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Layout Area */}
      <div className="flex flex-col md:flex-row min-h-[calc(100vh-4rem)]">
        {/* Sidebar */}
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} lang={lang} />

        {/* Content Pane */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          <div className={activeTab === 'monitoring' ? '' : 'hidden'}>
            <MonitoringDashboard token={auth.token} lang={lang} active={activeTab === 'monitoring'} />
          </div>
          <div className={activeTab === 'terminal' ? '' : 'hidden'}>
            <TerminalView token={auth.token} lang={lang} />
          </div>
          <div className={activeTab === 'fileManager' ? '' : 'hidden'}>
            <FileManager token={auth.token} lang={lang} />
          </div>
          <div className={activeTab === 'processManager' ? '' : 'hidden'}>
            <ProcessManager token={auth.token} lang={lang} />
          </div>
          <div className={activeTab === 'telegramBot' ? '' : 'hidden'}>
            <TelegramBotManager token={auth.token} lang={lang} />
          </div>

          <div className={activeTab === 'vpnManager' ? '' : 'hidden'}>
            <VpnManager token={auth.token} lang={lang} />
          </div>
          <div className={activeTab === 'documentation' ? '' : 'hidden'}>
            <DocumentationView lang={lang} />
          </div>
        </main>
      </div>

      {/* Login Screen Modal if not authenticated */}
      {!auth.isAuthenticated && (
        <LoginModal lang={lang} onLoginSuccess={handleLoginSuccess} />
      )}

      {/* Security Credentials Modal */}
      <SecurityModal
        isOpen={isSecurityOpen}
        onClose={() => setIsSecurityOpen(false)}
        token={auth.token}
        lang={lang}
        onCredentialsUpdated={handleCredentialsUpdated}
      />
    </div>
  );
}
