import React, { useState, useEffect } from 'react';
import { Globe, Power, RefreshCw, Plus, Trash2, Check, AlertCircle, Zap, ShieldCheck, MapPin, Server, Activity, ArrowUpRight, Copy, CheckCircle2 } from 'lucide-react';
import { Language } from '../types';

interface VpnConfigItem {
  index: number;
  name: string;
  config: string;
  isActive: boolean;
  testResult?: {
    success: boolean;
    output: string;
    loading?: boolean;
  };
}

interface IpInfo {
  ip?: string;
  country?: string;
  city?: string;
  org?: string;
  region?: string;
}

interface VpnManagerProps {
  token: string | null;
  lang: Language;
}

export const VpnManager: React.FC<VpnManagerProps> = ({ token, lang }) => {
  const isFa = lang === 'fa';

  const [status, setStatus] = useState<{
    running: boolean;
    enabled: boolean;
    activeIndex: number | null;
    activeName: string | null;
    configsCount: number;
    socksProxy: string;
    httpProxy: string;
  }>({
    running: false,
    enabled: false,
    activeIndex: null,
    activeName: null,
    configsCount: 0,
    socksProxy: '127.0.0.1:10808',
    httpProxy: '127.0.0.1:10809'
  });

  const [configs, setConfigs] = useState<VpnConfigItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [testingAll, setTestingAll] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // New Config Modal/Input
  const [showAddModal, setShowAddModal] = useState(false);
  const [newConfigStr, setNewConfigStr] = useState('');
  const [newConfigName, setNewConfigName] = useState('');

  // IP Check State
  const [ipData, setIpData] = useState<{ direct: IpInfo | null; vpn: IpInfo | null; proxyActive: boolean } | null>(null);
  const [checkingIp, setCheckingIp] = useState(false);
  const [copiedProxy, setCopiedProxy] = useState(false);

  const fetchStatus = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/vpn/status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // silent
    }
  };

  const fetchConfigs = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/vpn/configs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        setConfigs(data.configs || []);
      }
    } catch (err: any) {
      setMessage({ text: isFa ? 'خطا در دریافت کانفیگ‌ها' : 'Error fetching configs', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const fetchIpInfo = async () => {
    if (!token) return;
    try {
      setCheckingIp(true);
      const res = await fetch('/api/vpn/ip-check', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        setIpData(data);
      }
    } catch {
      // silent
    } finally {
      setCheckingIp(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchConfigs();
    fetchIpInfo();
    const interval = setInterval(() => {
      fetchStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, [token]);

  const handleToggleVpn = async () => {
    try {
      setActionLoading(true);
      setMessage(null);
      const endpoint = status.running ? '/api/vpn/stop' : '/api/vpn/start';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: data.message || (isFa ? 'عملیات با موفقیت انجام شد' : 'Success'), type: 'success' });
        setTimeout(() => {
          fetchStatus();
          fetchIpInfo();
        }, 1500);
      } else {
        setMessage({ text: data.error || data.message || (isFa ? 'خطا در تغییر وضعیت VPN' : 'VPN action failed'), type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConfigStr.trim()) return;

    try {
      setActionLoading(true);
      const res = await fetch('/api/vpn/configs/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ configStr: newConfigStr, name: newConfigName })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({
          text: isFa ? `تعداد ${data.added} کانفیگ با موفقیت اضافه شد` : `Successfully added ${data.added} configs`,
          type: 'success'
        });
        setNewConfigStr('');
        setNewConfigName('');
        setShowAddModal(false);
        fetchConfigs();
        fetchStatus();
      } else {
        setMessage({ text: data.error || (isFa ? 'خطا در افزودن کانفیگ' : 'Failed to add config'), type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteConfig = async (index: number) => {
    if (!confirm(isFa ? 'آیا از حذف این کانفیگ اطمینان دارید؟' : 'Are you sure you want to delete this config?')) return;
    try {
      setActionLoading(true);
      const res = await fetch('/api/vpn/configs/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ index })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: data.message, type: 'success' });
        fetchConfigs();
        fetchStatus();
      } else {
        setMessage({ text: data.error || data.message, type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectConfig = async (index: number) => {
    try {
      setActionLoading(true);
      const res = await fetch('/api/vpn/configs/select', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ index })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: data.message, type: 'success' });
        fetchConfigs();
        fetchStatus();
      } else {
        setMessage({ text: data.error || data.message, type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleTestConfig = async (index: number) => {
    setConfigs(prev => prev.map(c => c.index === index ? { ...c, testResult: { success: false, output: isFa ? 'در حال تست...' : 'Testing...', loading: true } } : c));
    try {
      const res = await fetch('/api/vpn/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ index })
      });
      const data = await res.json();
      const resultText = data.result?.[1] || (data.result ? JSON.stringify(data.result) : 'تست انجام شد');
      const isSuccess = data.result?.[0] ?? true;

      setConfigs(prev => prev.map(c => c.index === index ? { ...c, testResult: { success: isSuccess, output: resultText, loading: false } } : c));
    } catch (err: any) {
      setConfigs(prev => prev.map(c => c.index === index ? { ...c, testResult: { success: false, output: err.message, loading: false } } : c));
    }
  };

  const handleTestAllConfigs = async () => {
    try {
      setTestingAll(true);
      const res = await fetch('/api/vpn/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ testAll: true })
      });
      const data = await res.json();
      if (data.results && Array.isArray(data.results)) {
        setConfigs(prev => prev.map(c => {
          const match = data.results.find((r: any) => r.index === c.index);
          if (match) {
            return {
              ...c,
              testResult: {
                success: match.success,
                output: match.output,
                loading: false
              }
            };
          }
          return c;
        }));
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setTestingAll(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedProxy(true);
    setTimeout(() => setCopiedProxy(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Alert Messages */}
      {message && (
        <div
          className={`p-4 rounded-xl text-xs md:text-sm font-medium flex items-center justify-between shadow-lg ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400'
          }`}
        >
          <div className="flex items-center gap-3">
            {message.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
            <span className="leading-relaxed">{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100 cursor-pointer">✕</button>
        </div>
      )}

      {/* Main Status Header Card */}
      <div className="bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/10 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div
              className={`p-4 rounded-2xl ${
                status.running
                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 animate-pulse'
                  : 'bg-neutral-100 dark:bg-white/5 text-neutral-400 border border-neutral-200 dark:border-white/10'
              }`}
            >
              <Globe className="h-8 w-8" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
                  {isFa ? 'سامانه تانل و VPN سرور' : 'Server VPN & Tunnel Engine'}
                </h2>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                    status.running
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${status.running ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`} />
                  {status.running ? (isFa ? 'VPN فعال است' : 'VPN Online') : (isFa ? 'VPN غیرفعال است' : 'VPN Offline')}
                </span>
              </div>

              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {isFa
                  ? 'تانل کردن کل ترافیک سرور، پشتیبانی از vmess، vless، trojan، reality و xhttp'
                  : 'Full server routing via Xray-core with support for VLESS, VMess, Trojan, REALITY & XHTTP'}
              </p>

              <div className="flex flex-wrap items-center gap-4 text-xs font-mono pt-2 text-neutral-600 dark:text-neutral-400">
                <span className="flex items-center gap-1.5 bg-neutral-100 dark:bg-white/5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-white/10">
                  <Server className="h-3.5 w-3.5 text-blue-500" />
                  {isFa ? 'کانفیگ فعال:' : 'Active:'} <strong className="text-neutral-900 dark:text-white">{status.activeName || (isFa ? 'انتخاب نشده' : 'None')}</strong>
                </span>

                <span className="flex items-center gap-1.5 bg-neutral-100 dark:bg-white/5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-white/10">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                  {isFa ? 'پروکسی SOCKS5:' : 'SOCKS5 Proxy:'} <strong className="text-neutral-900 dark:text-white">{status.socksProxy}</strong>
                  <button
                    onClick={() => copyToClipboard(status.socksProxy)}
                    className="hover:text-blue-500 ml-1 cursor-pointer"
                    title={isFa ? 'کپی آدرس پروکسی' : 'Copy Proxy'}
                  >
                    {copiedProxy ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 self-stretch md:self-auto justify-end">
            <button
              onClick={fetchStatus}
              className="p-3 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/10 transition cursor-pointer"
              title={isFa ? 'بروزرسانی وضعیت' : 'Refresh Status'}
            >
              <RefreshCw className="h-5 w-5" />
            </button>

            <button
              onClick={handleToggleVpn}
              disabled={actionLoading}
              className={`flex-1 md:flex-none flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl text-sm font-semibold transition shadow-md cursor-pointer ${
                status.running
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
              } disabled:opacity-50`}
            >
              <Power className="h-5 w-5" />
              <span>
                {actionLoading
                  ? (isFa ? 'در حال پردازش...' : 'Processing...')
                  : status.running
                  ? (isFa ? 'خاموش کردن VPN' : 'Disconnect VPN')
                  : (isFa ? 'روشن کردن VPN' : 'Connect VPN')}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Live IP & Location Checker Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Direct IP */}
        <div className="bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              <MapPin className="h-4 w-4 text-amber-500" />
              <span>{isFa ? 'IP مستقیم سرور (Direct IP)' : 'Direct Server IP'}</span>
            </div>
            <span className="text-xs font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2.5 py-0.5 rounded-full border border-amber-500/20">
              {isFa ? 'بدون پروکسی' : 'Direct'}
            </span>
          </div>

          {ipData?.direct ? (
            <div className="space-y-1 font-mono text-sm">
              <div className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                {ipData.direct.ip || 'نامشخص'}
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
                <span>{ipData.direct.city}, {ipData.direct.region}, {ipData.direct.country}</span>
              </div>
              <div className="text-xs text-neutral-400 dark:text-neutral-500 truncate">
                {ipData.direct.org}
              </div>
            </div>
          ) : (
            <div className="text-xs text-neutral-400 py-2">
              {checkingIp ? (isFa ? 'در حال تست IP...' : 'Checking IP...') : (isFa ? 'اطلاعات در دسترس نیست' : 'No data')}
            </div>
          )}
        </div>

        {/* VPN Proxied IP */}
        <div className="bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>{isFa ? 'IP خروجی VPN (Proxied IP)' : 'VPN Output IP'}</span>
            </div>
            <span
              className={`text-xs font-mono px-2.5 py-0.5 rounded-full border ${
                ipData?.proxyActive
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-neutral-100 dark:bg-white/5 text-neutral-400 border-neutral-200 dark:border-white/10'
              }`}
            >
              {ipData?.proxyActive ? (isFa ? 'تانل فعال' : 'Proxied') : (isFa ? 'غیرفعال' : 'Inactive')}
            </span>
          </div>

          {ipData?.vpn ? (
            <div className="space-y-1 font-mono text-sm">
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                {ipData.vpn.ip}
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
                <span>{ipData.vpn.city}, {ipData.vpn.region}, {ipData.vpn.country}</span>
              </div>
              <div className="text-xs text-neutral-400 dark:text-neutral-500 truncate">
                {ipData.vpn.org}
              </div>
            </div>
          ) : (
            <div className="text-xs text-neutral-400 py-2">
              {checkingIp
                ? (isFa ? 'در حال برقراری تست پروکسی...' : 'Checking proxy...')
                : (isFa ? 'پروکسی متصل نیست یا ترافیک از آن رد نمیشود' : 'Proxy disconnected or unreachable')}
            </div>
          )}

          <div className="pt-1 flex justify-end">
            <button
              onClick={fetchIpInfo}
              disabled={checkingIp}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${checkingIp ? 'animate-spin' : ''}`} />
              <span>{isFa ? 'بررسی مجدد IP' : 'Re-check IP'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Configs List Header & Controls */}
      <div className="bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/10 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              <Server className="h-5 w-5 text-indigo-500" />
              <span>{isFa ? 'لیست کانفیگ‌های ذخیره شده' : 'Saved VPN Configurations'}</span>
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {isFa ? 'میتوانید چند لینک به صورت همزمان یا تکی اضافه کنید' : 'Add single or bulk VLESS/VMess/Trojan/Shadowsocks links'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTestAllConfigs}
              disabled={testingAll || configs.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-800 dark:text-neutral-200 rounded-xl text-xs font-semibold transition border border-neutral-200 dark:border-white/10 cursor-pointer disabled:opacity-50"
            >
              <Zap className={`h-4 w-4 text-amber-500 ${testingAll ? 'animate-bounce' : ''}`} />
              <span>{testingAll ? (isFa ? 'در حال تست همه...' : 'Testing All...') : (isFa ? 'تست سرعت و پینگ همه' : 'Speed Test All')}</span>
            </button>

            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>{isFa ? 'افزودن کانفیگ جدید' : 'Add Config'}</span>
            </button>
          </div>
        </div>

        {/* Configs Table / List */}
        {loading ? (
          <div className="text-center py-12 text-neutral-400 text-sm">
            {isFa ? 'در حال بارگذاری کانفیگ‌ها...' : 'Loading configs...'}
          </div>
        ) : configs.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-neutral-200 dark:border-white/10 rounded-2xl space-y-3">
            <Globe className="h-10 w-10 text-neutral-400 mx-auto opacity-50" />
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              {isFa ? 'هیچ کانفیگی اضافه نشده است' : 'No VPN configurations found'}
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-500 transition cursor-pointer"
            >
              {isFa ? 'افزودن اولین کانفیگ' : 'Add First Config'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {configs.map((cfg) => {
              const isCurrentActive = status.activeIndex === cfg.index;
              return (
                <div
                  key={cfg.index}
                  className={`p-4 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    isCurrentActive
                      ? 'bg-indigo-500/5 border-indigo-500/40 dark:bg-indigo-500/10'
                      : 'bg-neutral-50 dark:bg-[#18181b] border-neutral-200 dark:border-white/5 hover:border-neutral-300 dark:hover:border-white/10'
                  }`}
                >
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <button
                      onClick={() => handleSelectConfig(cfg.index)}
                      className={`mt-0.5 p-1 rounded-full border transition cursor-pointer shrink-0 ${
                        isCurrentActive
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-neutral-300 dark:border-neutral-600 hover:border-indigo-500'
                      }`}
                      title={isFa ? 'انتخاب به عنوان فعال' : 'Select as active'}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-neutral-900 dark:text-white truncate">
                          {cfg.name}
                        </span>
                        {isCurrentActive && (
                          <span className="bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded-md border border-indigo-500/30">
                            {isFa ? 'فعال' : 'Active'}
                          </span>
                        )}
                      </div>

                      <div className="text-xs font-mono text-neutral-500 dark:text-neutral-400 truncate max-w-xl">
                        {cfg.config.substring(0, 70)}...
                      </div>

                      {/* Test Result Output if tested */}
                      {cfg.testResult && (
                        <div
                          className={`mt-2 p-2.5 rounded-lg text-xs font-mono leading-relaxed ${
                            cfg.testResult.loading
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse'
                              : cfg.testResult.success
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          <div className="whitespace-pre-wrap">{cfg.testResult.output}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Config Action Buttons */}
                  <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                    <button
                      onClick={() => handleTestConfig(cfg.index)}
                      className="px-3 py-1.5 bg-neutral-200 dark:bg-white/10 hover:bg-neutral-300 dark:hover:bg-white/15 text-neutral-800 dark:text-neutral-200 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Zap className="h-3.5 w-3.5 text-amber-500" />
                      <span>{isFa ? 'تست پینگ' : 'Ping Test'}</span>
                    </button>

                    {!isCurrentActive && (
                      <button
                        onClick={() => handleSelectConfig(cfg.index)}
                        className="px-3 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-medium transition cursor-pointer border border-indigo-500/20"
                      >
                        {isFa ? 'انتخاب' : 'Select'}
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteConfig(cfg.index)}
                      className="p-1.5 text-neutral-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                      title={isFa ? 'حذف کانفیگ' : 'Delete'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Add Config */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/10 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-white/10 pb-4">
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                <Plus className="h-5 w-5 text-indigo-500" />
                <span>{isFa ? 'افزودن کانفیگ جدید VPN' : 'Add New VPN Config'}</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-neutral-400 hover:text-white text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddConfig} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                  {isFa ? 'عنوان اختیاری (تک کانفیگ):' : 'Optional Title (For single config):'}
                </label>
                <input
                  type="text"
                  value={newConfigName || ''}
                  onChange={(e) => setNewConfigName(e.target.value)}
                  placeholder={isFa ? 'مثلاً: سرور آلمان VLESS' : 'e.g. Germany VLESS Server'}
                  className="w-full bg-neutral-100 dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded-xl px-4 py-2.5 text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                  {isFa ? 'لینک یا کدهای کانفیگ (پشتیبانی از چند لینک همزمان):' : 'Config Link(s) or JSON:'}
                </label>
                <textarea
                  rows={6}
                  value={newConfigStr || ''}
                  onChange={(e) => setNewConfigStr(e.target.value)}
                  placeholder={`vless://...\nvmess://...\ntrojan://...\nss://...`}
                  required
                  className="w-full bg-neutral-100 dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded-xl p-3 text-xs font-mono text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
                />
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                  {isFa
                    ? 'میتوانید چند لینک vless/vmess/trojan را در خطوط مختلف وارد کنید تا به صورت همزمان ثبت شوند.'
                    : 'You can paste multiple vless/vmess/trojan links separated by newlines.'}
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 transition cursor-pointer"
                >
                  {isFa ? 'انصراف' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  disabled={actionLoading || !newConfigStr.trim()}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-md disabled:opacity-50"
                >
                  {actionLoading ? (isFa ? 'در حال ذخیره...' : 'Saving...') : (isFa ? 'ذخیره کانفیگ‌ها' : 'Save Configs')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
