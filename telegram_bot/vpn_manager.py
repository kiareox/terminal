#!/usr/bin/env python3
"""
VPN Manager Module - مدیریت VPN با v2ray برای تانل کردن کل سرور
"""

import os
import sys
import json
import asyncio
import subprocess
import logging
from pathlib import Path
from typing import Optional, List, Tuple, Dict

logger = logging.getLogger(__name__)

# ---- مسیرها ----
BASE_DIR = Path(__file__).parent
CONFIGS_DIR = BASE_DIR / "vpn_configs"
ACTIVE_CONFIG_FILE = BASE_DIR / "vpn_active.json"

def get_v2ray_bin() -> str:
    """پیدا کردن یا دانلود خودکار xray در صورت عدم وجود"""
    import shutil
    for path in ["xray", "v2ray", "/usr/local/bin/xray", "/usr/bin/xray", str(BASE_DIR / "bin" / "xray")]:
        if shutil.which(path) or Path(path).exists():
            return path
    
    # دانلود خودکار
    try:
        bin_dir = BASE_DIR / "bin"
        bin_dir.mkdir(exist_ok=True)
        xray_path = bin_dir / "xray"
        if xray_path.exists():
            return str(xray_path)
            
        import urllib.request
        import zipfile
        logger.info("Downloading Xray-core automatically...")
        zip_path = bin_dir / "xray.zip"
        urllib.request.urlretrieve("https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip", zip_path)
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(bin_dir)
        if zip_path.exists():
            zip_path.unlink()
        xray_path.chmod(0o755)
        return str(xray_path)
    except Exception as e:
        logger.error(f"Auto-download xray failed: {e}")
        return "xray"

# ---- مدل داده کانفیگ ----
def _default_store() -> dict:
    return {"configs": [], "active_index": None, "enabled": False}


class VPNManager:
    """مدیریت کانفیگ‌های V2Ray و تانل کردن کل سرور"""

    def __init__(self):
        CONFIGS_DIR.mkdir(exist_ok=True)
        self._store: dict = self._load_store()
        self._process: Optional[asyncio.subprocess.Process] = None

    # ------------------------------------------------------------------
    # ذخیره / بارگذاری
    # ------------------------------------------------------------------
    def _load_store(self) -> dict:
        if ACTIVE_CONFIG_FILE.exists():
            try:
                with open(ACTIVE_CONFIG_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # مطمئن شو همه کلیدها هستند
                    for k, v in _default_store().items():
                        data.setdefault(k, v)
                    return data
            except Exception:
                pass
        return _default_store()

    def _save_store(self):
        try:
            with open(ACTIVE_CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(self._store, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"VPNManager save error: {e}")

    # ------------------------------------------------------------------
    # مدیریت کانفیگ
    # ------------------------------------------------------------------
    @staticmethod
    def extract_name_from_link(link: str) -> str:
        """استخراج نام از fragment لینک (بخش # انتها)"""
        from urllib.parse import urlparse, unquote
        link = link.strip()
        try:
            parsed = urlparse(link)
            if parsed.fragment:
                name = unquote(parsed.fragment).strip()
                if name:
                    return name
        except Exception:
            pass
        # fallback: آدرس:پورت
        try:
            parsed = urlparse(link)
            host = parsed.hostname or ""
            port = parsed.port or ""
            if host:
                return f"{host}:{port}" if port else host
        except Exception:
            pass
        return link[:40]

    @staticmethod
    def split_links(text: str) -> List[str]:
        """
        جدا کردن چند لینک از یک متن.
        هر لینک با پروتکل‌های شناخته‌شده شروع می‌شه.
        """
        import re
        # پیدا کردن همه لینک‌های شناخته‌شده
        pattern = r'((?:vmess|vless|trojan|ss)://[^\s\r\n]*)'
        links = re.findall(pattern, text)
        # اگر لینکی پیدا نشد ولی متن JSON بود، کل متن رو برگردون
        if not links and text.strip().startswith("{"):
            return [text.strip()]
        return [l.strip() for l in links if l.strip()]

    def add_config(self, config_str: str, name: str = "") -> Tuple[bool, str]:
        """اضافه کردن یک کانفیگ جدید — نام خودکار از fragment استخراج میشه"""
        config_str = config_str.strip()
        # اگر نام دستی نداده شد، از لینک بخون
        if not name:
            name = self.extract_name_from_link(config_str)
        name = name.strip() or config_str[:30]

        # اگر اسم تکراری بود، یه شماره اضافه کن
        base_name = name
        counter = 1
        existing_names = {c["name"] for c in self._store["configs"]}
        while name in existing_names:
            name = f"{base_name} ({counter})"
            counter += 1

        entry = {"name": name, "config": config_str}
        self._store["configs"].append(entry)
        self._save_store()
        return True, f"✅ کانفیگ «{name}» اضافه شد."

    def add_configs_bulk(self, text: str) -> Tuple[int, int, List[str]]:
        """
        اضافه کردن چند کانفیگ از یک متن.
        Returns: (موفق, ناموفق, لیست پیام‌ها)
        """
        links = self.split_links(text)
        if not links:
            return 0, 0, ["❌ هیچ لینک معتبری پیدا نشد."]
        ok_count = 0
        fail_count = 0
        messages = []
        for link in links:
            success, msg = self.add_config(link)
            if success:
                ok_count += 1
            else:
                fail_count += 1
            messages.append(msg)
        return ok_count, fail_count, messages

    def delete_config(self, index: int) -> Tuple[bool, str]:
        """حذف کانفیگ با شماره"""
        configs = self._store["configs"]
        if index < 0 or index >= len(configs):
            return False, "❌ شماره کانفیگ معتبر نیست."
        name = configs[index]["name"]
        configs.pop(index)
        # اصلاح active_index بعد از حذف
        ai = self._store["active_index"]
        if ai == index:
            self._store["active_index"] = None
            self._store["enabled"] = False
        elif ai is not None and ai > index:
            self._store["active_index"] = ai - 1
        self._save_store()
        return True, f"✅ کانفیگ «{name}» حذف شد."

    def list_configs(self) -> List[Dict]:
        return self._store["configs"]

    def get_config(self, index: int) -> Optional[Dict]:
        configs = self._store["configs"]
        if 0 <= index < len(configs):
            return configs[index]
        return None

    def set_active(self, index: int) -> Tuple[bool, str]:
        configs = self._store["configs"]
        if index < 0 or index >= len(configs):
            return False, "❌ شماره کانفیگ معتبر نیست."
        self._store["active_index"] = index
        self._save_store()
        return True, f"✅ کانفیگ «{configs[index]['name']}» به عنوان فعال انتخاب شد."


    # ------------------------------------------------------------------
    # تست کانفیگ
    # ------------------------------------------------------------------

    async def _run_v2ray_for_test(self, index: int) -> Tuple[Optional[asyncio.subprocess.Process], int, Optional[str]]:
        """
        v2ray رو برای کانفیگ index اجرا کن و پورت موقت رو برگردون.
        Returns: (process, port, error_msg)
        """
        cfg = self.get_config(index)
        if not cfg:
            return None, 0, "❌ کانفیگ پیدا نشد"

        config_json = self._build_v2ray_json(cfg["config"])
        if config_json is None:
            return None, 0, "❌ فرمت کانفیگ نامعتبر"

        test_port = 10900 + index
        test_cfg = json.loads(json.dumps(config_json))
        for inb in test_cfg.get("inbounds", []):
            if inb.get("protocol") == "socks":
                inb["port"] = test_port
                break

        tmp_path = CONFIGS_DIR / f"test_{index}.json"
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(test_cfg, f)
        except Exception as e:
            return None, 0, f"❌ خطا در نوشتن فایل: {e}"

        try:
            v2ray_bin = get_v2ray_bin()
            proc = await asyncio.create_subprocess_exec(
                v2ray_bin, "run", "-config", str(tmp_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            # بررسی crash سریع
            try:
                await asyncio.wait_for(proc.wait(), timeout=3)
                stderr_out = (await proc.stderr.read()).decode("utf-8", errors="ignore")
                return None, 0, f"❌ v2ray crash کرد: {stderr_out[:200]}"
            except asyncio.TimeoutError:
                pass  # خوبه، هنوز داره اجرا میشه

            await asyncio.sleep(1.5)

            # بررسی listen بودن پورت
            import socket as _socket
            try:
                with _socket.create_connection(("127.0.0.1", test_port), timeout=3):
                    pass
            except Exception:
                proc.terminate()
                return None, 0, "❌ پروکسی روی پورت listen نکرد (کانفیگ نامعتبر)"

            return proc, test_port, None

        except FileNotFoundError:
            return None, 0, "❌ v2ray نصب نیست"
        except Exception as e:
            return None, 0, f"❌ خطا: {e}"
        finally:
            if tmp_path.exists():
                tmp_path.unlink()

    async def _kill_test_proc(self, proc: Optional[asyncio.subprocess.Process]):
        """پروسه تست رو خاموش کن"""
        if proc and proc.returncode is None:
            try:
                proc.terminate()
                await asyncio.wait_for(proc.wait(), timeout=3)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass

    async def _measure_ping(self, proxy_port: int) -> Optional[float]:
        """پینگ TTFB از طریق پروکسی"""
        for target in [
            "http://www.gstatic.com/generate_204",
            "http://connectivitycheck.gstatic.com/generate_204",
            "http://1.1.1.1/cdn-cgi/trace",
        ]:
            try:
                p = await asyncio.create_subprocess_exec(
                    "curl", "-s", "-o", "/dev/null", "-w", "%{time_starttransfer}",
                    "--socks5", f"127.0.0.1:{proxy_port}",
                    "--connect-timeout", "5", "--max-time", "6", target,
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                )
                out, _ = await asyncio.wait_for(p.communicate(), timeout=8)
                val = out.decode().strip()
                if val:
                    ms = round(float(val) * 1000, 1)
                    if ms >= 5.0:
                        return ms
            except Exception:
                pass
        return None

    async def _measure_download(self, proxy_port: int) -> Optional[float]:
        """سرعت دانلود Mbps از طریق پروکسی — Cloudflare"""
        try:
            p = await asyncio.create_subprocess_exec(
                "curl", "-s", "-o", "/dev/null", "-w", "%{speed_download}",
                "--socks5", f"127.0.0.1:{proxy_port}",
                "--connect-timeout", "5", "--max-time", "8",
                "https://speed.cloudflare.com/__down?bytes=1000000",
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            out, _ = await asyncio.wait_for(p.communicate(), timeout=10)
            val = out.decode().strip()
            if val:
                speed = float(val)
                if speed > 0:
                    return round(speed * 8 / 1_000_000, 2)
        except Exception:
            pass
        return None

    async def _measure_upload(self, proxy_port: int) -> Optional[float]:
        """سرعت آپلود Mbps از طریق پروکسی — از Cloudflare speed test"""
        tmp = CONFIGS_DIR / f"_up_{proxy_port}.bin"
        try:
            with open(tmp, "wb") as f:
                f.write(os.urandom(256 * 1024))
            p = await asyncio.create_subprocess_exec(
                "curl", "-s", "-o", "/dev/null", "-w", "%{speed_upload}",
                "--socks5", f"127.0.0.1:{proxy_port}",
                "--connect-timeout", "5", "--max-time", "8",
                "-X", "POST",
                "--data-binary", f"@{tmp}",
                "-H", "Content-Type: application/octet-stream",
                "https://speed.cloudflare.com/__up",
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            out, _ = await asyncio.wait_for(p.communicate(), timeout=10)
            val = out.decode().strip()
            if val:
                speed = float(val)
                if speed > 0:
                    return round(speed * 8 / 1_000_000, 2)
        except Exception:
            pass
        finally:
            if tmp.exists():
                tmp.unlink()
        return None

    async def _measure_speedtest(self, proxy_port: int) -> Dict:
        pass  # حذف شد

    def _format_test_result(self, name: str, ping: Optional[float], dl: Optional[float], ul: Optional[float]) -> Tuple[bool, str]:
        """فرمت‌بندی نتیجه تست — اگه هر متریک timeout خورد ❌ نشون بده"""
        ping_str = f"📶 پینگ: {ping} ms"   if ping is not None else "📶 پینگ: ❌ timeout"
        dl_str   = f"⬇️ دانلود: {dl} Mbps" if dl   is not None else "⬇️ دانلود: ❌ timeout"
        ul_str   = f"⬆️ آپلود: {ul} Mbps"  if ul   is not None else "⬆️ آپلود: ❌ timeout"
        all_ok = (ping is not None and dl is not None and ul is not None)
        icon = "✅" if all_ok else "⚠️"
        lines = [f"{icon} «{name}»", ping_str, dl_str, ul_str]
        return all_ok, "\n".join(lines)

    async def test_config(self, index: int) -> Tuple[bool, str]:
        """تست یک کانفیگ: پینگ + دانلود + آپلود از طریق Cloudflare"""
        cfg = self.get_config(index)
        if not cfg:
            return False, "❌ کانفیگ پیدا نشد."

        proc, port, err = await self._run_v2ray_for_test(index)
        if err:
            return False, err

        try:
            ping = await self._measure_ping(port)
            dl   = await self._measure_download(port)
            ul   = await self._measure_upload(port)
            return self._format_test_result(cfg["name"], ping, dl, ul)
        finally:
            await self._kill_test_proc(proc)

    async def test_all_configs(self) -> List[Tuple[int, str, bool, str]]:
        """
        تست همه کانفیگ‌ها:
        - مرحله ۱: راه‌اندازی v2ray + پینگ → موازی
        - مرحله ۲: دانلود → سری
        - مرحله ۳: آپلود → سری
        """
        configs = self._store["configs"]
        if not configs:
            return []

        n = len(configs)

        # ---- مرحله ۱: پینگ موازی ----
        async def start_and_ping(i: int):
            proc, port, err = await self._run_v2ray_for_test(i)
            if err:
                return i, None, None, None, err, None
            ping = await self._measure_ping(port)
            return i, proc, port, ping, None, None

        ping_outcomes = await asyncio.gather(*[start_and_ping(i) for i in range(n)], return_exceptions=True)

        procs  = [None] * n
        ports  = [0]    * n
        pings  = [None] * n
        errors = [None] * n

        for outcome in ping_outcomes:
            if isinstance(outcome, Exception):
                continue
            i, proc, port, ping, err, _ = outcome
            procs[i]  = proc
            ports[i]  = port
            pings[i]  = ping
            errors[i] = err

        # ---- مرحله ۲: دانلود سری ----
        downloads = [None] * n
        for i in range(n):
            if errors[i] is None and procs[i] is not None:
                downloads[i] = await self._measure_download(ports[i])

        # ---- مرحله ۳: آپلود سری ----
        uploads = [None] * n
        for i in range(n):
            if errors[i] is None and procs[i] is not None:
                uploads[i] = await self._measure_upload(ports[i])

        # ---- خاموش کردن همه v2ray ها ----
        await asyncio.gather(*[self._kill_test_proc(procs[i]) for i in range(n)], return_exceptions=True)

        # ---- نتایج نهایی ----
        final = []
        for i, cfg in enumerate(configs):
            name = cfg["name"]
            if errors[i]:
                final.append((i, name, False, errors[i]))
            else:
                ok, msg = self._format_test_result(name, pings[i], downloads[i], uploads[i])
                final.append((i, name, ok, msg))

        return final

    # ------------------------------------------------------------------
    # روشن / خاموش VPN
    # ------------------------------------------------------------------
    async def enable_vpn(self) -> Tuple[bool, str]:
        """روشن کردن VPN با کانفیگ فعال"""
        ai = self._store.get("active_index")
        if ai is None:
            return False, "❌ هیچ کانفیگ فعالی انتخاب نشده. ابتدا یک کانفیگ انتخاب کنید."
        cfg = self.get_config(ai)
        if not cfg:
            return False, "❌ کانفیگ فعال پیدا نشد."

        config_json = self._build_v2ray_json(cfg["config"])
        if config_json is None:
            return False, "❌ فرمت کانفیگ نامعتبر است."

        # اطمینان از اینکه پروسه قبلی در حال اجرا نباشد
        await self.disable_vpn()

        cfg_path = CONFIGS_DIR / "active.json"
        try:
            with open(cfg_path, "w", encoding="utf-8") as f:
                json.dump(config_json, f)
        except Exception as e:
            return False, f"❌ خطا در نوشتن کانفیگ: {e}"

        try:
            v2ray_bin = get_v2ray_bin()
            log_path = CONFIGS_DIR / "xray.log"
            log_file = open(log_path, "a", encoding="utf-8")
            proc = subprocess.Popen(
                [v2ray_bin, "run", "-config", str(cfg_path)],
                stdout=log_file,
                stderr=log_file,
                start_new_session=True
            )
            # صبر کوتاه تا بررسی کنیم crash نشده
            await asyncio.sleep(1.5)
            if proc.poll() is not None:
                log_file.close()
                err_text = ""
                if log_path.exists():
                    try:
                        with open(log_path, "r", encoding="utf-8") as lf:
                            err_text = lf.read()[-500:]
                    except Exception:
                        pass
                return False, f"❌ v2ray/xray بلافاصله خارج شد (کد {proc.returncode}):\n{err_text}"

            self._store["enabled"] = True
            self._save_store()
            return True, (
                f"✅ VPN روشن شد با کانفیگ «{cfg['name']}» (PID: {proc.pid})\n"
                f"🔌 SOCKS5 proxy: `127.0.0.1:10808`\n"
                f"💡 همه دستورات به‌صورت خودکار از طریق VPN اجرا می‌شوند."
            )
        except FileNotFoundError:
            return False, f"❌ {V2RAY_BIN} نصب نیست."
        except Exception as e:
            return False, f"❌ خطا در اجرا: {e}"

    async def disable_vpn(self) -> Tuple[bool, str]:
        """خاموش کردن VPN"""
        msg_parts = []
        try:
            subprocess.run(["pkill", "-9", "-f", "xray"], timeout=5)
            subprocess.run(["pkill", "-9", "-f", "v2ray"], timeout=5)
            msg_parts.append("✅ پروسه xray/v2ray متوقف شد.")
        except Exception as e:
            msg_parts.append(f"⚠️ خطا در توقف پروسه: {e}")

        self._process = None
        self._store["enabled"] = False
        self._save_store()
        return True, "\n".join(msg_parts) if msg_parts else "✅ VPN خاموش شد."

    def is_running(self) -> bool:
        """آیا xray/v2ray در حال اجراست و پورت SOCKS5 یا HTTP واقعاً باز است؟"""
        import socket
        process_alive = False
        try:
            r1 = subprocess.run(["pgrep", "-f", "xray"], capture_output=True, text=True, timeout=3)
            r2 = subprocess.run(["pgrep", "-f", "v2ray"], capture_output=True, text=True, timeout=3)
            process_alive = (r1.returncode == 0 or r2.returncode == 0)
        except Exception:
            pass

        if not process_alive:
            return False

        # بررسی اینکه پورت SOCKS5 (10808) یا HTTP (10809) واقعاً listen هست
        for port in [10808, 10809]:
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=1.5):
                    return True
            except Exception:
                pass
        return False

    def status(self) -> str:
        """وضعیت کنونی"""
        running = self.is_running()
        ai = self._store.get("active_index")
        cfg_name = self._store["configs"][ai]["name"] if (ai is not None and ai < len(self._store["configs"])) else "ندارد"
        configs_count = len(self._store["configs"])
        icon = "🟢" if running else "🔴"
        return (
            f"{icon} وضعیت VPN: {'فعال' if running else 'غیرفعال'}\n"
            f"📌 کانفیگ انتخابی: {cfg_name}\n"
            f"📋 تعداد کانفیگ‌ها: {configs_count}"
        )


    # ------------------------------------------------------------------
    # پارسر کانفیگ
    # ------------------------------------------------------------------
    def _build_v2ray_json(self, raw: str) -> Optional[dict]:
        """
        تبدیل ورودی کاربر به JSON کانفیگ v2ray.
        ورودی می‌تواند:
          - JSON کامل v2ray config باشد
          - لینک vmess://... باشد
          - لینک vless://... باشد  
          - لینک trojan://... باشد
          - لینک ss://... (shadowsocks) باشد
        """
        raw = raw.strip()

        # اگر JSON مستقیم بود
        if raw.startswith("{"):
            try:
                return json.loads(raw)
            except Exception:
                return None

        # لینک vmess
        if raw.startswith("vmess://"):
            return self._vmess_to_json(raw)

        # لینک vless
        if raw.startswith("vless://"):
            return self._vless_to_json(raw)

        # لینک trojan
        if raw.startswith("trojan://"):
            return self._trojan_to_json(raw)

        # لینک ss (Shadowsocks)
        if raw.startswith("ss://"):
            return self._ss_to_json(raw)

        return None

    def _vmess_to_json(self, link: str) -> Optional[dict]:
        import base64
        try:
            b64 = link[8:]
            # padding
            b64 += "=" * (-len(b64) % 4)
            decoded = base64.urlsafe_b64decode(b64).decode("utf-8")
            vmess = json.loads(decoded)
            port = int(vmess.get("port", 443))
            tls = vmess.get("tls", "") == "tls"
            net = vmess.get("net", "tcp")
            ws_path = vmess.get("path", "/")
            host = vmess.get("host", vmess.get("add", ""))
            server_addr = vmess.get("add", "")

            stream_settings: dict = {"network": net}
            if net == "ws":
                stream_settings["wsSettings"] = {
                    "path": ws_path,
                    "headers": {"Host": host}
                }
            if tls:
                stream_settings["security"] = "tls"
                stream_settings["tlsSettings"] = {"serverName": host or server_addr}

            return self._base_outbound_json(
                protocol="vmess",
                address=server_addr,
                port=port,
                users=[{
                    "id": vmess.get("id", ""),
                    "alterId": int(vmess.get("aid", 0)),
                    "security": vmess.get("scy", "auto"),
                }],
                stream_settings=stream_settings,
            )
        except Exception as e:
            logger.error(f"vmess parse error: {e}")
            return None

    def _vless_to_json(self, link: str) -> Optional[dict]:
        try:
            from urllib.parse import urlparse, parse_qs, unquote
            parsed = urlparse(link)
            uuid = parsed.username or ""
            address = parsed.hostname or ""
            port = parsed.port or 443
            params = parse_qs(parsed.query)
            net = params.get("type", ["tcp"])[0]
            security = params.get("security", ["none"])[0]
            sni = params.get("sni", [address])[0]
            path = unquote(params.get("path", ["/"])[0])
            host = params.get("host", [address])[0]
            flow = params.get("flow", [""])[0]

            stream_settings: dict = {"network": net}
            if net == "ws":
                stream_settings["wsSettings"] = {"path": path, "headers": {"Host": host}}
            elif net == "grpc":
                stream_settings["grpcSettings"] = {"serviceName": params.get("serviceName", [""])[0]}
            if security == "tls":
                stream_settings["security"] = "tls"
                stream_settings["tlsSettings"] = {"serverName": sni}
            elif security == "reality":
                stream_settings["security"] = "reality"
                stream_settings["realitySettings"] = {
                    "serverName": sni,
                    "fingerprint": params.get("fp", ["chrome"])[0],
                    "publicKey": params.get("pbk", [""])[0],
                    "shortId": params.get("sid", [""])[0],
                }

            user: dict = {"id": uuid, "encryption": "none"}
            if flow:
                user["flow"] = flow

            return self._base_outbound_json(
                protocol="vless",
                address=address,
                port=port,
                users=[user],
                stream_settings=stream_settings,
            )
        except Exception as e:
            logger.error(f"vless parse error: {e}")
            return None

    def _trojan_to_json(self, link: str) -> Optional[dict]:
        try:
            from urllib.parse import urlparse, parse_qs
            parsed = urlparse(link)
            password = parsed.username or ""
            address = parsed.hostname or ""
            port = parsed.port or 443
            params = parse_qs(parsed.query)
            sni = params.get("sni", [address])[0]
            net = params.get("type", ["tcp"])[0]
            path = params.get("path", ["/"])[0]
            host = params.get("host", [address])[0]

            stream_settings: dict = {
                "network": net,
                "security": "tls",
                "tlsSettings": {"serverName": sni},
            }
            if net == "ws":
                stream_settings["wsSettings"] = {"path": path, "headers": {"Host": host}}

            return self._base_outbound_json(
                protocol="trojan",
                address=address,
                port=port,
                users=[{"password": password}],
                stream_settings=stream_settings,
            )
        except Exception as e:
            logger.error(f"trojan parse error: {e}")
            return None

    def _ss_to_json(self, link: str) -> Optional[dict]:
        import base64
        from urllib.parse import urlparse
        try:
            if "#" in link:
                link = link.split("#")[0]

            parsed = urlparse(link)
            address = parsed.hostname or ""
            port = parsed.port or 443
            userinfo = parsed.username or ""
            password_from_parsed = parsed.password or ""

            method = ""
            password = ""

            if userinfo:
                try:
                    b64 = userinfo + "=" * (-len(userinfo) % 4)
                    decoded = base64.urlsafe_b64decode(b64).decode("utf-8")
                    if ":" in decoded:
                        parts = decoded.split(":", 1)
                        method = parts[0]
                        password = parts[1]
                except Exception:
                    pass

                if not method or not password:
                    if password_from_parsed:
                        method = userinfo
                        password = password_from_parsed
                    elif ":" in userinfo:
                        parts = userinfo.split(":", 1)
                        method = parts[0]
                        password = parts[1]
                    else:
                        method = "chacha20-ietf-poly1305"
                        password = userinfo

            if not address or not password:
                return None

            if not method:
                method = "chacha20-ietf-poly1305"

            server_item = {
                "address": address,
                "port": port,
                "method": method,
                "password": password
            }

            return {
                "log": {"loglevel": "warning"},
                "inbounds": [
                    {
                        "port": 10808,
                        "listen": "127.0.0.1",
                        "protocol": "socks",
                        "settings": {
                            "auth": "noauth",
                            "udp": False,
                        },
                        "tag": "socks-in"
                    },
                    {
                        "port": 10809,
                        "listen": "127.0.0.1",
                        "protocol": "http",
                        "settings": {},
                        "tag": "http-in"
                    }
                ],
                "outbounds": [
                    {
                        "protocol": "shadowsocks",
                        "tag": "proxy",
                        "settings": {
                            "servers": [server_item]
                        }
                    },
                    {"protocol": "freedom", "tag": "direct"}
                ],
                "routing": {
                    "domainStrategy": "IPIfNonMatch",
                    "rules": [
                        {
                            "type": "field",
                            "ip": [
                                "127.0.0.0/8",
                                "10.0.0.0/8",
                                "172.16.0.0/12",
                                "192.168.0.0/16",
                            ],
                            "outboundTag": "direct"
                        }
                    ]
                }
            }
        except Exception as e:
            logger.error(f"ss parse error: {e}")
            return None

    def _base_outbound_json(
        self,
        protocol: str,
        address: str,
        port: int,
        users: list,
        stream_settings: dict,
    ) -> dict:
        """ساخت JSON کامل v2ray با SOCKS5 inbound روی localhost:10808"""
        server_item: dict = {
            "address": address,
            "port": port,
        }
        if protocol in ("vmess", "vless"):
            server_item["users"] = users
        elif protocol == "trojan":
            if users and isinstance(users, list) and len(users) > 0:
                server_item["password"] = users[0].get("password", "")
            else:
                server_item["password"] = ""

        return {
            "log": {"loglevel": "warning"},
            "inbounds": [
                {
                    "port": 10808,
                    "listen": "127.0.0.1",
                    "protocol": "socks",
                    "settings": {
                        "auth": "noauth",
                        "udp": False,
                    },
                    "tag": "socks-in"
                },
                {
                    "port": 10809,
                    "listen": "127.0.0.1",
                    "protocol": "http",
                    "settings": {},
                    "tag": "http-in"
                }
            ],
            "outbounds": [
                {
                    "protocol": protocol,
                    "tag": "proxy",
                    "settings": {
                        "vnext" if protocol in ("vmess", "vless") else "servers": [
                            server_item
                        ]
                    },
                    "streamSettings": stream_settings,
                },
                {"protocol": "freedom", "tag": "direct"},
            ],
            "routing": {
                "domainStrategy": "IPIfNonMatch",
                "rules": [
                    {
                        "type": "field",
                        "ip": [
                            "127.0.0.0/8",
                            "10.0.0.0/8",
                            "172.16.0.0/12",
                            "192.168.0.0/16",
                        ],
                        "outboundTag": "direct"
                    }
                ]
            },
        }


# نمونه global
vpn_manager = VPNManager()
