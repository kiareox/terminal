import os
import sys
import json
import asyncio
import logging
import shutil
try:
    import psutil
except ImportError:
    class MockPsutil:
        def cpu_percent(self, interval=0.5):
            return 0.0
        def virtual_memory(self):
            class Mem:
                percent = 0.0
                used = 0
                total = 1024
            return Mem()
        def disk_usage(self, path):
            class Disk:
                percent = 0.0
                used = 0
                total = 1024
            return Disk()
        def boot_time(self):
            return 0
        def net_io_counters(self):
            class Net:
                bytes_sent = 0
                bytes_recv = 0
            return Net()
    psutil = MockPsutil()
from datetime import datetime
from pathlib import Path
import aiohttp
from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    ReplyKeyboardMarkup,
    KeyboardButton,
    WebAppInfo
)
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ContextTypes,
    filters
)
from file_manager import (
    file_manager,
    format_size,
    build_callback_data,
    register_callback_path,
    resolve_callback_path,
)

# Enable logging
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO
)
logger = logging.getLogger(__name__)

# Paths
BASE_DIR = Path(__file__).parent
ROOT_DIR = BASE_DIR.parent
CONFIG_PATH = BASE_DIR / "config.json"
GLOBAL_CONFIG_PATH = ROOT_DIR / ".serverdash_config.json"

DEFAULT_CWD = str(ROOT_DIR)

def get_shared_cwd():
    shared_cwd_file = ROOT_DIR / ".terminal_cwd"
    if shared_cwd_file.exists():
        try:
            content = shared_cwd_file.read_text("utf-8").strip()
            if content and os.path.exists(content) and os.path.isdir(content):
                return content
        except:
            pass
    return DEFAULT_CWD

def save_shared_cwd(cwd_path: str):
    shared_cwd_file = ROOT_DIR / ".terminal_cwd"
    try:
        shared_cwd_file.write_text(cwd_path, "utf-8")
    except:
        pass

# Load bot credentials
BOT_TOKEN = ""
ALLOWED_USER_ID = 0
WEB_URL = ""

def load_config():
    global BOT_TOKEN, ALLOWED_USER_ID, WEB_URL
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                BOT_TOKEN = data.get("bot_token", "")
                WEB_URL = data.get("web_url", "")
                try:
                    ALLOWED_USER_ID = int(data.get("admin_user_id", 0))
                except ValueError:
                    ALLOWED_USER_ID = 0
        except Exception as e:
            logger.error(f"Error loading bot config: {e}")

load_config()

def get_web_url():
    load_config()
    url = (WEB_URL or "").strip()
    if not url:
        import os
        railway_domain = os.environ.get("RAILWAY_PUBLIC_DOMAIN") or os.environ.get("RAILWAY_STATIC_URL")
        if railway_domain:
            if not railway_domain.startswith("http"):
                url = f"https://{railway_domain}"
            else:
                url = railway_domain
    return url if url else None

# Read Express Auth Token
def get_auth_token():
    try:
        if GLOBAL_CONFIG_PATH.exists():
            with open(GLOBAL_CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("authToken", "serverdash_secret_token_2026_x98")
    except Exception as e:
        logger.error(f"Error reading auth token: {e}")
    return "serverdash_secret_token_2026_x98"

# Express API Helper
async def express_api(method: str, path: str, data: dict = None):
    token = get_auth_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    url = f"http://127.0.0.1:3000{path}"
    async with aiohttp.ClientSession() as session:
        try:
            if method == "GET":
                async with session.get(url, headers=headers) as resp:
                    if resp.status == 200:
                        return await resp.json()
            elif method == "POST":
                async with session.post(url, headers=headers, json=data) as resp:
                    if resp.status == 200:
                        return await resp.json()
        except Exception as e:
            logger.error(f"Express API error ({path}): {e}")
    return None

# Authorization Decorator
def admin_only(func):
    async def wrapper(*args, **kwargs):
        update = None
        for arg in args:
            if isinstance(arg, Update):
                update = arg
                break
        if not update and 'update' in kwargs:
            update = kwargs['update']

        if update and update.effective_user:
            user_id = update.effective_user.id
            if ALLOWED_USER_ID and user_id != ALLOWED_USER_ID:
                await update.effective_message.reply_text(
                    "⛔ *دسترسی غیرمجاز!*\nشما مجاز به استفاده از این ربات نیستید.",
                    parse_mode="Markdown"
                )
                return
        return await func(*args, **kwargs)
    return wrapper

# Main keyboards
def get_main_keyboard():
    keyboard = [
        [KeyboardButton("🖥️ ترمینال وب"), KeyboardButton("📁 مدیریت فایل")],
        [KeyboardButton("⚙️ برنامه‌های فعال"), KeyboardButton("📊 وضعیت سیستم")],
        [KeyboardButton("🌐 وضعیت وی‌پی‌ان")]
    ]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True)

# Start Command
@admin_only
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    url = get_web_url()
    
    welcome_text = (
        "👋 *سلام به ربات مدیریت سرور NexShell خوش آمدید!*\n\n"
        "این ربات به صورت مستقیم به کنترل پنل وب متصل است و به شما امکان مانیتورینگ، "
        "اجرای دستورات، مدیریت فایل‌ها و ترافیک را می‌دهد.\n\n"
        "🌐 *جهت ورود به کنترل پنل وب:* کلیک کنید"
    )

    reply_markup = None
    if url and url.startswith("https://"):
        inline_keyboard = [
            [
                InlineKeyboardButton("🌐 باز کردن وب‌اپ در تلگرام", web_app=WebAppInfo(url=url)),
                InlineKeyboardButton("🌐 باز کردن در مرورگر", url=url)
            ]
        ]
        reply_markup = InlineKeyboardMarkup(inline_keyboard)

    # Send welcome text with inline buttons (glass buttons)
    await update.effective_message.reply_text(
        welcome_text,
        reply_markup=reply_markup,
        parse_mode="Markdown"
    )

    # Send bottom menu keyboard with clean minimal label
    await update.effective_message.reply_text(
        "▾ منوی مدیریت",
        reply_markup=get_main_keyboard()
    )

# Info/Metrics command
@admin_only
async def show_system_metrics(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # Retrieve system stats using psutil
    cpu_percent = psutil.cpu_percent(interval=0.5)
    ram = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    
    uptime_sec = int(psutil.boot_time())
    import datetime
    uptime_str = str(datetime.timedelta(seconds=int(asyncio.get_event_loop().time())))
    
    # Network metrics
    net_io = psutil.net_io_counters()
    sent_mb = net_io.bytes_sent / (1024 * 1024)
    recv_mb = net_io.bytes_recv / (1024 * 1024)

    metrics_text = (
        "📊 *آخرین وضعیت سخت‌افزار سرور:*\n\n"
        f"💻 *مصرف پردازنده (CPU):* `{cpu_percent}%`\n"
        f"💾 *مصرف حافظه (RAM):* `{ram.percent}%` `({ram.used // (1024*1024)}MB / {ram.total // (1024*1024)}MB)`\n"
        f"💽 *فضای دیسک (Disk):* `{disk.percent}%` `({disk.used // (1024**3)}GB / {disk.total // (1024**3)}GB)`\n\n"
        f"📤 *ارسال شبکه:* `{sent_mb:.2f} MB`\n"
        f"📥 *دریافت شبکه:* `{recv_mb:.2f} MB`\n\n"
        f"⏱️ *مدت زمان فعالیت ربات:* `{uptime_str}`"
    )
    await update.effective_message.reply_text(metrics_text, parse_mode="Markdown")

# Terminal Mode Handlers
@admin_only
async def enter_terminal_mode(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data["mode"] = "terminal"
    current_cwd = get_shared_cwd()
    context.user_data["terminal_cwd"] = current_cwd

    # Inline buttons for Ctrl shortcuts
    keyboard = [
        [
            InlineKeyboardButton("Ctrl + C (Interrupt)", callback_data="term_ctrl_c"),
        ],
        [
#            InlineKeyboardButton("Ctrl + A", callback_data="term_ctrl_a"),
#            InlineKeyboardButton("Ctrl + B", callback_data="term_ctrl_b")
        ],
        [
            InlineKeyboardButton("❌ خروج از ترمینال", callback_data="term_exit")
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        f"🖥️ *وارد محیط ترمینال شدید!*\n"
        f"📍 *مسیر کاری فعلی:* `{current_cwd}`\n\n"
        f"هر پیامی بفرستید به عنوان دستور لینوکس اجرا خواهد شد.\n"
        f"برای ارسال سیگنال‌ها از دکمه‌های زیر استفاده کنید:",
        reply_markup=reply_markup,
        parse_mode="Markdown"
    )

# Process Manager
@admin_only
async def show_processes(update: Update, context: ContextTypes.DEFAULT_TYPE):
    data = await express_api("GET", "/api/processes/list")
    if not data:
        await update.effective_message.reply_text("❌ خطا در برقراری ارتباط با سرور Express.")
        return
        
    tasks = data.get("backgroundTasks", [])
    if not tasks:
        await update.effective_message.reply_text("⚠️ هیچ اسکریپت یا برنامه پس‌زمینه ثبت‌شده‌ای یافت نشد.")
        return

    running_tasks = [t for t in tasks if t.get("status") == "running"]
    other_tasks = [t for t in tasks if t.get("status") != "running"]

    keyboard = []
    for t in running_tasks:
        name = t.get("name", t.get("command", ""))[:32]
        keyboard.append([InlineKeyboardButton(f"🟢 {name}", callback_data=f"proc_view_{t.get('id')}")])

    for t in other_tasks[:6]:  # show up to 6 recent
        st = t.get("status")
        status_emoji = "🔴" if st == "failed" else ("⚪" if st == "completed" else "⏹")
        name = t.get("name", t.get("command", ""))[:32]
        keyboard.append([InlineKeyboardButton(f"{status_emoji} {name}", callback_data=f"proc_view_{t.get('id')}")])
    
    keyboard.append([InlineKeyboardButton("🔄 بروزرسانی لیست", callback_data="proc_refresh_list")])
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    running_count = len(running_tasks)
    total_count = len(tasks)
    msg_text = (
        f"⚙️ *لیست برنامه‌ها و اسکریپت‌ها:*\n\n"
        f"🟢 *اسکریپت‌های در حال اجرا:* `{running_count}`\n"
        f"📦 *کل اسکریپت‌های ثبت‌شده:* `{total_count}`\n\n"
        f"جهت مشاهده لاگ یا توقف اسکریپت، آن را انتخاب کنید:"
    )

    await update.effective_message.reply_text(
        msg_text,
        reply_markup=reply_markup,
        parse_mode="Markdown"
    )

# VPN Manager
@admin_only
async def show_vpn_status(update: Update, context: ContextTypes.DEFAULT_TYPE, message_to_edit=None):
    """نمایش پنل اصلی مدیریت وی‌پی‌ان و پروکسی"""
    status = await express_api("GET", "/api/vpn/status")
    if not status:
        msg = "❌ خطا در برقراری ارتباط با سرویس VPN."
        if message_to_edit:
            await message_to_edit.edit_text(msg)
        else:
            await update.effective_message.reply_text(msg)
        return

    running = status.get("running", False)
    enabled = status.get("enabled", False)
    active_name = status.get("activeName") or "هیچکدام"
    configs_count = status.get("configsCount", 0)
    socks_proxy = status.get("socksProxy", "127.0.0.1:10808")
    http_proxy = status.get("httpProxy", "127.0.0.1:10809")

    is_connected = running or enabled
    status_str = "🟢 متصل و فعال" if is_connected else "🔴 غیرفعال (قطع)"
    now_time = datetime.now().strftime("%H:%M:%S")

    panel_text = (
        "🌐 *پنل مدیریت وی‌پی‌ان و تونل Xray-Core*\n\n"
        f"📊 *وضعیت اتصال:* {status_str}\n"
        f"🔌 *کانفیگ فعال:* `{active_name}`\n"
        f"📦 *تعداد کل کانفیگ‌ها:* `{configs_count}` کانفیگ\n"
        f"⏱️ *آخرین بروزرسانی:* `{now_time}`\n\n"
        f"📡 *پروکسی SOCKS5:* `socks5://{socks_proxy}`\n"
        f"🌐 *پروکسی HTTP:* `http://{http_proxy}`\n\n"
        "💡 *راهنما:* تمام ترافیک ترمینال و برنامه‌ها را می‌توانید از طریق این تونل هدایت کنید."
    )

    toggle_btn_text = "🔴 قطع اتصال VPN" if is_connected else "🚀 اتصال و فعال‌سازی VPN"

    keyboard = [
        [InlineKeyboardButton(toggle_btn_text, callback_data="vpn_toggle")],
        [
            InlineKeyboardButton("📋 فهرست کانفیگ‌ها", callback_data="vpn_configs_list"),
            InlineKeyboardButton("➕ افزودن کانفیگ جدید", callback_data="vpn_add_prompt")
        ],
        [
            InlineKeyboardButton("⚡ تست پینگ همگی", callback_data="vpn_test_all"),
            InlineKeyboardButton("🔍 بررسی IP و لوکیشن", callback_data="vpn_check_ip")
        ],
        [InlineKeyboardButton("🔄 بروزرسانی وضعیت", callback_data="vpn_refresh_panel")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    if message_to_edit:
        try:
            await message_to_edit.edit_text(panel_text, reply_markup=reply_markup, parse_mode="Markdown")
        except Exception:
            pass
    else:
        await update.effective_message.reply_text(panel_text, reply_markup=reply_markup, parse_mode="Markdown")

async def show_vpn_configs_list(update: Update, context: ContextTypes.DEFAULT_TYPE, message_to_edit=None):
    """نمایش لیست کانفیگ‌های ثبت شده با امکان انتخاب، تست و حذف"""
    res = await express_api("GET", "/api/vpn/configs")
    if not res:
        msg = "❌ خطا در دریافت فهرست کانفیگ‌های VPN."
        if message_to_edit:
            await message_to_edit.edit_text(msg)
        else:
            await update.effective_message.reply_text(msg)
        return

    configs = res.get("configs", [])

    if not configs:
        text = "📭 *هیچ کانفیگی ثبت نشده است!*\n\nبرای شروع، روی دکمه افزودن کانفیگ جدید کلیک کنید یا لینک vless/vmess/ss خود را ارسال کنید."
        keyboard = [
            [InlineKeyboardButton("➕ افزودن کانفیگ جدید", callback_data="vpn_add_prompt")],
            [InlineKeyboardButton("⬅️ بازگشت به پنل اصلی", callback_data="vpn_refresh_panel")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        if message_to_edit:
            await message_to_edit.edit_text(text, reply_markup=reply_markup, parse_mode="Markdown")
        else:
            await update.effective_message.reply_text(text, reply_markup=reply_markup, parse_mode="Markdown")
        return

    lines = ["📋 *فهرست کانفیگ‌های VPN ثبت شده:*\n"]
    keyboard = []

    for item in configs:
        idx = item.get("index")
        name = item.get("name", f"Config {idx+1}")
        is_active = item.get("isActive", False)
        
        status_tag = "✅ [فعال]" if is_active else "⚪"
        lines.append(f"{idx+1}. {status_tag} *{name}*")

        btn_row = []
        if not is_active:
            btn_row.append(InlineKeyboardButton(f"🔌 انتخاب {idx+1}", callback_data=f"vpn_select_{idx}"))
        btn_row.append(InlineKeyboardButton(f"⚡ تست {idx+1}", callback_data=f"vpn_test_{idx}"))
        btn_row.append(InlineKeyboardButton(f"🗑️ حذف {idx+1}", callback_data=f"vpn_delete_{idx}"))
        
        keyboard.append(btn_row)

    lines.append("\n💡 جهت فعال‌سازی، تست یا حذف هر کانفیگ از دکمه‌های بالا استفاده کنید.")

    keyboard.append([
        InlineKeyboardButton("➕ افزودن کانفیگ جدید", callback_data="vpn_add_prompt"),
        InlineKeyboardButton("⚡ تست همه", callback_data="vpn_test_all")
    ])
    keyboard.append([InlineKeyboardButton("⬅️ بازگشت به پنل VPN", callback_data="vpn_refresh_panel")])

    reply_markup = InlineKeyboardMarkup(keyboard)
    text = "\n".join(lines)

    if message_to_edit:
        try:
            await message_to_edit.edit_text(text, reply_markup=reply_markup, parse_mode="Markdown")
        except Exception as e:
            logger.warning(f"Error editing configs list message: {e}")
    else:
        await update.effective_message.reply_text(text, reply_markup=reply_markup, parse_mode="Markdown")

async def show_vpn_ip_check(update: Update, context: ContextTypes.DEFAULT_TYPE, message_to_edit=None):
    """استعلام آی‌پی و لوکیشن اتصال مستقیم و VPN"""
    if message_to_edit:
        try:
            await message_to_edit.edit_text("⏳ *در حال استعلام IP و لوکیشن سرور...*", parse_mode="Markdown")
        except Exception:
            pass
    else:
        message_to_edit = await update.effective_message.reply_text("⏳ *در حال استعلام IP و لوکیشن سرور...*", parse_mode="Markdown")

    res = await express_api("GET", "/api/vpn/ip-check")
    if not res:
        await message_to_edit.edit_text("❌ خطا در استعلام آی‌پی.")
        return

    direct = res.get("direct") or {}
    vpn = res.get("vpn") or {}
    proxy_active = res.get("proxyActive", False)

    direct_ip = direct.get("ip", "نامشخص")
    direct_country = direct.get("country", "")
    direct_city = direct.get("city", "")
    direct_org = direct.get("org", "نامشخص")

    vpn_ip = vpn.get("ip", "نامتصل / نامشخص")
    vpn_country = vpn.get("country", "")
    vpn_city = vpn.get("city", "")
    vpn_org = vpn.get("org", "نامتصل / نامشخص")

    routing_status = "🟢 ترافیک تونل‌شده و پروکسی فعال است" if proxy_active else "🔴 ترافیک مستقیم است (پروکسی غیرفعال)"

    text = (
        "🔍 *نتایج بررسی IP و لوکیشن شبکه:*\n\n"
        f"📊 *وضعیت مسیردهی:* {routing_status}\n\n"
        "�� *اتصال مستقیم سرور (اصلی):*\n"
        f"• IP: `{direct_ip}`\n"
        f"• کشور/شهر: `{direct_country} - {direct_city}`\n"
        f"• ارائه‌دهنده: `{direct_org}`\n\n"
        "🛡️ *اتصال از طریق پروکسی / VPN:*\n"
        f"• IP: `{vpn_ip}`\n"
        f"• کشور/شهر: `{vpn_country} - {vpn_city}`\n"
        f"• ارائه‌دهنده: `{vpn_org}`"
    )

    keyboard = [
        [
            InlineKeyboardButton("🔄 بروزرسانی استعلام", callback_data="vpn_check_ip"),
            InlineKeyboardButton("⬅️ بازگشت به پنل اصلی", callback_data="vpn_refresh_panel")
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    try:
        await message_to_edit.edit_text(text, reply_markup=reply_markup, parse_mode="Markdown")
    except Exception:
        pass

async def handle_vpn_test_all(update: Update, context: ContextTypes.DEFAULT_TYPE, message_to_edit=None):
    """تست پینگ و اتصال تمامی کانفیگ‌ها"""
    if message_to_edit:
        try:
            await message_to_edit.edit_text("⚡ *در حال بررسی و تست تمامی کانفیگ‌ها... لطفاً چند لحظه شکیبا باشید.*", parse_mode="Markdown")
        except Exception:
            pass
    else:
        message_to_edit = await update.effective_message.reply_text("⚡ *در حال بررسی و تست تمامی کانفیگ‌ها... لطفاً چند لحظه شکیبا باشید.*", parse_mode="Markdown")

    res = await express_api("POST", "/api/vpn/test", {"testAll": True})
    if not res or "results" not in res:
        await message_to_edit.edit_text("❌ خطا در اجرای تست کانفیگ‌ها.")
        return

    results = res.get("results", [])
    if not results:
        await message_to_edit.edit_text("📭 هیچ کانفیگی برای تست وجود ندارد.")
        return

    lines = ["⚡ *نتایج تست پینگ کانفیگ‌ها:*\n"]
    for r in results:
        idx = r.get("index")
        name = r.get("name", f"Config {idx+1}")
        success = r.get("success", False)
        out = r.get("output", "")

        status_emoji = "🟢" if success else "🔴"
        lines.append(f"{status_emoji} *{idx+1}. {name}:* `{out}`")

    keyboard = [
        [
            InlineKeyboardButton("📋 فهرست کانفیگ‌ها", callback_data="vpn_configs_list"),
            InlineKeyboardButton("⬅️ بازگشت به پنل VPN", callback_data="vpn_refresh_panel")
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    text = "\n".join(lines)

    try:
        await message_to_edit.edit_text(text, reply_markup=reply_markup, parse_mode="Markdown")
    except Exception:
        pass

async def prompt_vpn_add_config(update: Update, context: ContextTypes.DEFAULT_TYPE, message_to_edit=None):
    """درخواست ارسال لینک کانفیگ جدید"""
    context.user_data["mode"] = "vpn_add_config"
    text = (
        "➕ *افزودن کانفیگ جدید VPN*\n\n"
        "لطفاً لینک کانفیگ خود را ارسال کنید (پشتیبانی از پروتکل‌های `vless://`, `vmess://`, `ss://`, `trojan://` و متون چند خطی).\n\n"
        "همچنین می‌توانید چند لینک را همزمان ارسال نمایید."
    )
    keyboard = [[InlineKeyboardButton("❌ انصراف", callback_data="vpn_refresh_panel")]]
    reply_markup = InlineKeyboardMarkup(keyboard)

    if message_to_edit:
        try:
            await message_to_edit.edit_text(text, reply_markup=reply_markup, parse_mode="Markdown")
        except Exception:
            pass
    else:
        await update.effective_message.reply_text(text, reply_markup=reply_markup, parse_mode="Markdown")

# File Manager Entry
@admin_only
async def enter_file_manager(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """مدیریت فایل‌ها - نمایش فهرست فایل‌ها"""
    try:
        # Reset batch upload queue
        context.user_data['upload_queue'] = {}
        context.user_data['file_operation'] = None
        context.user_data['mode'] = 'files'
        
        await show_file_menu(update, context)
        
    except Exception as e:
        logger.error(f"Error in enter_file_manager: {e}")
        await update.effective_message.reply_text(f"❌ خطا: {str(e)}")

async def show_file_menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """نمایش منوی فایل‌ها با دکمه‌های دایناميكی برای پوشه‌ها"""
    try:
        files, error = file_manager.get_file_list()
        
        if error:
            if getattr(update, "callback_query", None) is not None:
                await update.callback_query.edit_message_text(error, parse_mode="Markdown")
            elif hasattr(update, "edit_message_text"):
                await update.edit_message_text(error, parse_mode="Markdown")
            else:
                await update.effective_message.reply_text(error, parse_mode="Markdown")
            return
        
        file_list_text = file_manager.format_file_list(files)
        
        # Create inline keyboard: only folders have buttons on the main view
        keyboard = []

        for f in files:
            if f['is_dir']:
                callback_data = register_callback_path(context, "file_enter", f['path'])
                item_button = InlineKeyboardButton(f"📁 {f['name']}", callback_data=callback_data)
                # Append single button row for the folder
                keyboard.append([item_button])

        # Add global action buttons
        keyboard.extend([
            [
                InlineKeyboardButton("📥 دانلود", callback_data="file_mode:download"),
                InlineKeyboardButton("🗑️ حذف", callback_data="file_mode:delete")
            ],
            [
                InlineKeyboardButton("📤 آپلود", callback_data="file_upload"),
                InlineKeyboardButton("📁 پوشه جدید", callback_data="file_mkdir")
            ],
            [
                InlineKeyboardButton("📂 بازگشت", callback_data="file_back"),
                InlineKeyboardButton("🔄 تازه کردن", callback_data="file_refresh")
            ],
            [
                InlineKeyboardButton("❌ خروج از فایل منیجر", callback_data="file_exit")
            ]
        ])
        
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        if getattr(update, "callback_query", None) is not None:
            await update.callback_query.edit_message_text(
                file_list_text,
                reply_markup=reply_markup,
                parse_mode="Markdown"
            )
        elif hasattr(update, "edit_message_text"):
            await update.edit_message_text(
                file_list_text,
                reply_markup=reply_markup,
                parse_mode="Markdown"
            )
        else:
            await update.effective_message.reply_text(
                file_list_text,
                reply_markup=reply_markup,
                parse_mode="Markdown"
            )
        
        # Store current context for file operations
        context.user_data['file_operation'] = None
        context.user_data['file_menu_shown'] = True
        
    except Exception as e:
        logger.error(f"Error in show_file_menu: {e}")
        await update.effective_message.reply_text(f"❌ خطا: {str(e)}")

async def show_batch_selection(query, files: list, mode: str, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Show file selection UI with toggle buttons for batch operations"""
    selected = context.user_data.get('batch_selected', set())
    
    # Build the display text
    icon_mode = "📥" if mode == "download" else "🗑️"
    title = "دانلود" if mode == "download" else "حذف"
    text = f"{icon_mode} انتخاب فایل‌ها برای {title}:\n\n"
    text += f"انتخاب شده: {len(selected)}\n\n"
    
    # Build keyboard with toggle buttons
    keyboard = []
    for f in files:
        icon = "📁" if f['is_dir'] else "📄"
        # Check if selected
        check = "✓" if f['path'] in selected else "☐"
        label = f"{check} {icon} {f['name']}"
        callback_data = register_callback_path(context, "file_toggle", f['path'])
        keyboard.append([InlineKeyboardButton(label, callback_data=callback_data)])
    
    # Add action buttons
    keyboard.append([
        InlineKeyboardButton(f"✓ تأیید ({len(selected)})", callback_data="file_batch_confirm"),
        InlineKeyboardButton("✕ منسوخ", callback_data="file_batch_cancel")
    ])
    
    reply_markup = InlineKeyboardMarkup(keyboard)
    await query.edit_message_text(text, reply_markup=reply_markup)

async def handle_batch_download(query, context: ContextTypes.DEFAULT_TYPE, selected_paths: set) -> None:
    """Download multiple files at once"""
    try:
        ok, emsg = file_manager.ensure_upload_dir()
        if not ok:
            await query.answer(emsg, show_alert=True)
            return
        
        if len(selected_paths) == 1:
            # Single file - send directly
            path = list(selected_paths)[0]
            info, error = file_manager.get_file_info(path)
            if error:
                await query.answer(error, show_alert=True)
                return
            
            target = info['full_path']
            if info['is_dir']:
                # Zip single folder
                zip_name = f"{info['name']}.zip"
                zip_path = file_manager.upload_temp_dir / zip_name
                try:
                    shutil.make_archive(str(zip_path.with_suffix('')), 'zip', target)
                    await query.message.reply_document(
                        document=open(zip_path, 'rb'),
                        caption=f"📦 {zip_name}\nسایز: {format_size(zip_path.stat().st_size)}"
                    )
                    zip_path.unlink()
                except Exception as e:
                    await query.answer(f"❌ خطا: {str(e)}", show_alert=True)
            else:
                # Send single file
                await query.message.reply_document(
                    document=open(target, 'rb'),
                    caption=f"📥 {info['name']}\nسایز: {info['size_formatted']}"
                )
        else:
            # Multiple files - create zip with all selected items
            zip_name = "files_batch.zip"
            zip_path = file_manager.upload_temp_dir / zip_name
            
            try:
                import zipfile
                with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                    for path in selected_paths:
                        info, error = file_manager.get_file_info(path)
                        if error:
                            continue
                        
                        target = info['full_path']
                        if info['is_dir']:
                            # Add all files in directory
                            for root, dirs, files in os.walk(target):
                                for file in files:
                                    file_path = os.path.join(root, file)
                                    arcname = os.path.relpath(file_path, target)
                                    zipf.write(file_path, arcname=f"{info['name']}/{arcname}")
                        else:
                            # Add single file
                            zipf.write(target, arcname=info['name'])
                
                size = zip_path.stat().st_size
                await query.message.reply_document(
                    document=open(zip_path, 'rb'),
                    caption=f"📦 {zip_name}\n{len(selected_paths)} آیتم\nسایز: {format_size(size)}"
                )
                zip_path.unlink()
                await query.answer("✓ دانلود کامل شد", show_alert=True)
            except Exception as e:
                await query.answer(f"❌ خطا در zip: {str(e)}", show_alert=True)
                if zip_path.exists():
                    zip_path.unlink()
        
        context.user_data['batch_selected'] = set()
        context.user_data['batch_mode'] = None
        
        # Return to main menu
        files, _ = file_manager.get_file_list()
        await show_file_menu_from_query(query, files, context)
        
    except Exception as e:
        logger.error(f"Error in batch download: {e}")
        await query.answer(f"❌ خطا: {str(e)}", show_alert=True)

async def handle_batch_delete(query, context: ContextTypes.DEFAULT_TYPE, selected_paths: set) -> None:
    """Delete multiple files at once"""
    try:
        deleted_count = 0
        errors = []
        
        for path in selected_paths:
            success, msg = file_manager.delete_file(path)
            if success:
                deleted_count += 1
            else:
                errors.append(msg)
        
        # Show result
        result_text = f"✓ {deleted_count} فایل حذف شد"
        if errors:
            result_text += f"\n\n❌ خطا‌ها:\n" + "\n".join(errors)
        
        await query.answer(result_text, show_alert=True)
        
        context.user_data['batch_selected'] = set()
        context.user_data['batch_mode'] = None
        
        # Return to main menu
        files, _ = file_manager.get_file_list()
        await show_file_menu_from_query(query, files, context)
        
    except Exception as e:
        logger.error(f"Error in batch delete: {e}")
        await query.answer(f"❌ خطا: {str(e)}", show_alert=True)

async def show_file_menu_from_query(query, files: list, context) -> None:
    """Helper to show file menu when we have a query instead of update"""
    file_list_text = file_manager.format_file_list(files)
    
    keyboard = []
    for f in files:
        if f['is_dir']:
            callback_data = register_callback_path(context, "file_enter", f['path'])
            item_button = InlineKeyboardButton(f"📁 {f['name']}", callback_data=callback_data)
            keyboard.append([item_button])
    
    keyboard.extend([
        [
            InlineKeyboardButton("📥 دانلود", callback_data="file_mode:download"),
            InlineKeyboardButton("🗑️ حذف", callback_data="file_mode:delete")
        ],
        [
            InlineKeyboardButton("📤 آپلود", callback_data="file_upload"),
            InlineKeyboardButton("📁 پوشه جدید", callback_data="file_mkdir")
        ],
        [
            InlineKeyboardButton("📂 بازگشت", callback_data="file_back"),
            InlineKeyboardButton("🔄 تازه کردن", callback_data="file_refresh")
        ],
        [
            InlineKeyboardButton("❌ خروج از فایل منیجر", callback_data="file_exit")
        ]
    ])
    
    reply_markup = InlineKeyboardMarkup(keyboard)
    await query.edit_message_text(file_list_text, reply_markup=reply_markup, parse_mode="Markdown")

active_log_tasks = {}

async def stream_process_logs(message, proc_id: str, title: str = "", cwd: str = "", is_terminal: bool = True):
    msg_id = message.message_id
    if msg_id in active_log_tasks and not active_log_tasks[msg_id].done():
        active_log_tasks[msg_id].cancel()

    async def _loop():
        last_logs_str = None
        last_st = None
        
        keyboard = [
            [
                InlineKeyboardButton("🔄 بروزرسانی آنلاین لاگ", callback_data=f"proc_logs_{proc_id}"),
                InlineKeyboardButton("🛑 توقف / Ctrl+C", callback_data=f"proc_kill_{proc_id}")
            ],
            [
                InlineKeyboardButton("⚙️ برنامه‌های فعال", callback_data="proc_refresh_list"),
                InlineKeyboardButton("❌ خروج از ترمینال", callback_data="term_exit") if is_terminal else InlineKeyboardButton("📋 جزئیات کامل", callback_data=f"proc_view_{proc_id}")
            ]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)

        for i in range(600):  # Stream live logs for up to 20 minutes automatically
            try:
                logs_res = await express_api("GET", f"/api/processes/{proc_id}/logs") if proc_id else None
                proc_list_res = await express_api("GET", "/api/processes/list")
                
                bg_tasks = proc_list_res.get("backgroundTasks", []) if proc_list_res else []
                current_task = next((t for t in bg_tasks if t.get("id") == proc_id), None)
                
                logs_list = logs_res.get("logs", []) if logs_res else []
                logs_text = "".join(logs_list[-35:]).strip() if logs_list else "در حال جمع‌آوری خروجی..."
                
                st = current_task.get("status") if current_task else "running"
                status_emoji = "🟢" if st == "running" else "⏳"
                status_text = "در حال اجرا"
                if st == "completed":
                    status_emoji = "✅"
                    status_text = "تکمیل شد"
                elif st == "failed":
                    status_emoji = "❌"
                    status_text = "با خطا خاتمه یافت"
                elif st == "killed":
                    status_emoji = "🛑"
                    status_text = "متوقف شد"

                now_time = datetime.now().strftime("%H:%M:%S")

                if logs_text != last_logs_str or st != last_st or i % 5 == 0:
                    last_logs_str = logs_text
                    last_st = st
                    display_text = logs_text[-3000:] if len(logs_text) > 3000 else logs_text
                    
                    header_line = f"🖥️ *خروجی زنده دستور:* `{title}`\n" if title else f"📄 *لاگ آنلاین:* `{proc_id}`\n"
                    path_footer = f"\n\n📍 *مسیر:* `{cwd}`" if cwd else ""

                    resp_text = (
                        f"{header_line}"
                        f"وضعیت: {status_emoji} `{status_text}` | ⏱️ `{now_time}`\n\n"
                        f"```\n{display_text}\n```"
                        f"{path_footer}"
                    )
                    try:
                        await message.edit_text(resp_text, reply_markup=reply_markup, parse_mode="Markdown")
                    except Exception as e:
                        if "Message is not modified" not in str(e):
                            logger.warning(f"Error editing live log message: {e}")

                if st in ["completed", "failed", "killed"]:
                    break
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in stream_process_logs loop: {e}")

            await asyncio.sleep(2.0)

    t = asyncio.create_task(_loop())
    active_log_tasks[msg_id] = t
    return t

# Text messages handling (Router)
@admin_only
async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    message = update.message
    if not message:
        return
        
    text = message.text
    mode = context.user_data.get("mode", "normal")
    action_state = context.user_data.get("action_state")

    # Handle Reply Keyboard Buttons
    if text:
        if text == "🖥️ ترمینال وب":
            await enter_terminal_mode(update, context)
            return
        elif text == "📁 مدیریت فایل":
            await enter_file_manager(update, context)
            return
        elif text == "⚙️ برنامه‌های فعال":
            await show_processes(update, context)
            return
        elif text == "📊 وضعیت سیستم":
            await show_system_metrics(update, context)
            return
        elif text == "🌐 وضعیت وی‌پی‌ان":
            await show_vpn_status(update, context)
            return

    # Handle VPN Config addition (links or add_config mode)
    if text and (mode == "vpn_add_config" or any(proto in text.lower() for proto in ["vless://", "vmess://", "ss://", "trojan://"])):
        context.user_data["mode"] = "normal"
        wait_msg = await message.reply_text("⏳ *در حال افزودن و پردازش کانفیگ...*", parse_mode="Markdown")
        res = await express_api("POST", "/api/vpn/configs/add", {"configStr": text, "name": ""})
        if res and res.get("success"):
            added = res.get("added", 1)
            msgs = "\n".join(res.get("messages", []))
            await wait_msg.edit_text(f"✅ *{added} کانفیگ با موفقیت به لیست اضافه شد!*\n\n{msgs}", parse_mode="Markdown")
            await show_vpn_configs_list(update, context)
        else:
            err_msg = res.get("error") or res.get("message") or "خطا در فرمت یا ثبت کانفیگ"
            await wait_msg.edit_text(f"❌ خطا در افزودن کانفیگ: {err_msg}")
            await show_vpn_status(update, context)
        return

    # Handle file uploads if in files mode or upload_batch mode
    has_attachment = (
        message.document or 
        message.photo or 
        message.audio or 
        message.video
    )
    if (mode == "files" or context.user_data.get("file_operation") == "upload_batch") and has_attachment:
        await handle_file_upload(update, context)
        return

    # Handle active text-input states inside File Manager (mkdir, etc.)
    file_op = context.user_data.get("file_operation")
    if mode == "files" and file_op == "mkdir" and text:
        dir_name = text.strip()
        success, msg = file_manager.create_directory(dir_name)
        await message.reply_text(msg, parse_mode="Markdown")
        context.user_data["file_operation"] = None
        await show_file_menu(update, context)
        return

    # Handle Terminal Mode command execution
    if mode == "terminal" and text:
        cmd_msg = await update.message.reply_text("⏳ *در حال اجرای دستور...*", parse_mode="Markdown")
        
        # Prevent running duplicate bot instances which cause 409 Conflict
        lower_text = text.lower()
        if ("telegram_bot.py" in lower_text or "terminal_bot.py" in lower_text) and "python" in lower_text:
            await cmd_msg.edit_text(
                "⚠️ *ربات تلگرام در حال حاضر فعال و در حال اجراست.*\n\n"
                "اجرای مجدد فایل ربات از داخل ترمینال باعث بروز خطای تداخل (409 Conflict) می‌شود. "
                "در صورت نیاز به راه‌اندازی مجدد ربات، از پنل وب یا بخش مدیریت استفاده کنید.",
                parse_mode="Markdown"
            )
            return

        # Execute via local Express Terminal execution API using shared CWD
        current_cwd = get_shared_cwd()
        context.user_data["terminal_cwd"] = current_cwd
        payload = {
            "command": text,
            "cwd": current_cwd
        }
        res = await express_api("POST", "/api/terminal/exec", payload)
        
        if res:
            new_cwd = res.get("cwd", "")
            if new_cwd:
                context.user_data["terminal_cwd"] = new_cwd
                save_shared_cwd(new_cwd)
                
            proc_id = res.get("processId")
            is_running = res.get("isRunning") or res.get("status") == "running"
            
            keyboard = [
                [
                    InlineKeyboardButton("🔄 بروزرسانی لاگ آنلاین", callback_data=f"proc_logs_{proc_id}"),
                    InlineKeyboardButton("🔌 Ctrl + C (توقف)", callback_data=f"proc_kill_{proc_id}" if proc_id else "term_ctrl_c")
                ],
                [
                    InlineKeyboardButton("⚙️ برنامه‌های فعال", callback_data="proc_refresh_list"),
                    InlineKeyboardButton("❌ خروج از ترمینال", callback_data="term_exit")
                ]
            ]

            # Fast completion case
            if not is_running:
                output = res.get("output", "").strip() or "Command executed with no output."
                if len(output) > 3500:
                    output = output[:3500] + "\n\n... (خروجی طولانی‌تر قطع شد)"
                    
                resp_text = (
                    f"🖥️ *خروجی دستور:* `{text}`\n\n"
                    f"```\n{output}\n```\n\n"
                    f"📍 *مسیر:* `{new_cwd}`"
                )
                await cmd_msg.edit_text(resp_text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")
                return

            # Long-running / live streaming case
            await stream_process_logs(cmd_msg, proc_id, title=text, cwd=new_cwd, is_terminal=True)
        else:
            await cmd_msg.edit_text("❌ خطا در اجرای دستور از طریق سرور Express.")
        return

    # Default fallback
    await update.message.reply_text(
        "💡 لطفاً یک گزینه از منوی پایین را انتخاب کنید:",
        reply_markup=get_main_keyboard()
    )

# Callback Queries Handler (All Button Clicks)
@admin_only
async def handle_callback_query(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    data = query.data
    chat_id = update.effective_chat.id
    message_id = query.message.message_id
    
    # ------------------ TERMINAL CALLBACKS ------------------
    if data == "term_exit":
        context.user_data["mode"] = "normal"
        await query.message.edit_text("❌ از ترمینال خارج شدید. منوی اصلی فعال است.")
        return
        
    elif data == "term_ctrl_c":
        # Send interrupt API call to Express
        res = await express_api("POST", "/api/terminal/interrupt", {})
        if res and res.get("success"):
            await query.message.reply_text("🔌 سیگنال *Ctrl + C (SIGINT)* با موفقیت ارسال شد.", parse_mode="Markdown")
        else:
            await query.message.reply_text("❌ خطایی در ارسال سیگنال رخ داد.")
        return
        
    elif data == "term_ctrl_a":
        await query.message.reply_text("⌨️ دکمه *Ctrl + A* شبیه‌سازی شد.", parse_mode="Markdown")
        return
        
    elif data == "term_ctrl_b":
        await query.message.reply_text("⌨️ دکمه *Ctrl + B* شبیه‌سازی شد.", parse_mode="Markdown")
        return

    # ------------------ PROCESS CALLBACKS ------------------
    elif data == "proc_refresh_list":
        # Reload active processes
        await show_processes(update, context)
        try:
            await context.bot.delete_message(chat_id=chat_id, message_id=message_id)
        except Exception:
            pass
        return

    elif data.startswith("proc_view_"):
        proc_id = data.replace("proc_view_", "")
        # Fetch process details
        proc_list_data = await express_api("GET", "/api/processes/list")
        if not proc_list_data:
            await query.message.reply_text("❌ خطا در دریافت اطلاعات برنامه‌ها.")
            return
            
        tasks = proc_list_data.get("backgroundTasks", [])
        task = next((t for t in tasks if t.get("id") == proc_id), None)
        if not task:
            await query.message.edit_text("❌ برنامه مورد نظر یافت نشد یا متوقف شده است.", reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("⬅️ بازگشت به لیست", callback_data="proc_refresh_list")]
            ]))
            return

        status_emoji = "🟢" if task.get("status") == "running" else "🔴"
        details = (
            f"⚙️ *جزئیات برنامه:* `{task.get('name')}`\n\n"
            f"🆔 *شناسه:* `{task.get('id')}`\n"
            f"🔌 *دستور:* `{task.get('command')}`\n"
            f"📊 *وضعیت:* {status_emoji} `{task.get('status')}`\n"
            f"🔢 *PID:* `{task.get('pid', 'نامشخص')}`\n"
            f"⏱️ *شروع:* `{task.get('startedAt', '')[:19].replace('T', ' ')}`"
        )
        
        keyboard = [
            [
                InlineKeyboardButton("📄 مشاهده لاگ‌ها", callback_data=f"proc_logs_{proc_id}"),
                InlineKeyboardButton("⏸ توقف برنامه", callback_data=f"proc_kill_{proc_id}")
            ],
            [
                InlineKeyboardButton("🔄 بروزرسانی", callback_data=f"proc_view_{proc_id}"),
                InlineKeyboardButton("⬅️ بازگشت به لیست", callback_data="proc_refresh_list")
            ]
        ]
        await query.message.edit_text(details, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")
        return

    elif data.startswith("proc_logs_"):
        proc_id = data.replace("proc_logs_", "")
        proc_list_res = await express_api("GET", "/api/processes/list")
        bg_tasks = proc_list_res.get("backgroundTasks", []) if proc_list_res else []
        current_task = next((t for t in bg_tasks if t.get("id") == proc_id), None)
        task_name = current_task.get("name", proc_id) if current_task else proc_id
        
        await stream_process_logs(query.message, proc_id, title=task_name, cwd="", is_terminal=False)
        return

    elif data.startswith("proc_kill_"):
        proc_id = data.replace("proc_kill_", "")
        kill_res = await express_api("POST", "/api/processes/kill", {"id": proc_id})
        if kill_res and kill_res.get("success"):
            await query.message.reply_text(f"🛑 اسکریپت با موفقیت متوقف شد.", parse_mode="Markdown")
            await show_processes(update, context)
        else:
            err = kill_res.get("error", "خطای ناشناخته") if kill_res else "پاسخی از سرور دریافت نشد"
            await query.message.reply_text(f"❌ خطا در توقف اسکریپت: {err}")
        return

    # ------------------ VPN & PROXY CALLBACKS ------------------
    elif data == "vpn_refresh_panel":
        try:
            await query.answer("🔄 وضعیت پنل بروزرسانی شد", show_alert=False)
        except Exception:
            pass
        await show_vpn_status(update, context, message_to_edit=query.message)
        return

    elif data == "vpn_configs_list":
        try:
            await query.answer("📋 دریافت لیست کانفیگ‌ها...", show_alert=False)
        except Exception:
            pass
        await show_vpn_configs_list(update, context, message_to_edit=query.message)
        return

    elif data == "vpn_add_prompt":
        try:
            await query.answer("➕ افزودن کانفیگ", show_alert=False)
        except Exception:
            pass
        await prompt_vpn_add_config(update, context, message_to_edit=query.message)
        return

    elif data == "vpn_toggle":
        status = await express_api("GET", "/api/vpn/status")
        if status:
            running = status.get("running", False) or status.get("enabled", False)
            endpoint = "/api/vpn/stop" if running else "/api/vpn/start"
            res = await express_api("POST", endpoint)
            if res and res.get("success"):
                msg_txt = res.get("message", "عملیات با موفقیت انجام شد")
                try:
                    await query.answer(f"✅ {msg_txt}", show_alert=False)
                except Exception:
                    pass
            else:
                err = res.get("error") if res else "خطا در تغییر وضعیت"
                try:
                    await query.answer(f"❌ {err}", show_alert=True)
                except Exception:
                    pass
        await show_vpn_status(update, context, message_to_edit=query.message)
        return

    elif data == "vpn_check_ip":
        try:
            await query.answer("🔍 در حال استعلام IP...", show_alert=False)
        except Exception:
            pass
        await show_vpn_ip_check(update, context, message_to_edit=query.message)
        return

    elif data == "vpn_test_all":
        try:
            await query.answer("⚡ شروع تست همگی...", show_alert=False)
        except Exception:
            pass
        await handle_vpn_test_all(update, context, message_to_edit=query.message)
        return

    elif data.startswith("vpn_select_"):
        try:
            idx = int(data.replace("vpn_select_", ""))
            res = await express_api("POST", "/api/vpn/configs/select", {"index": idx})
            if res and res.get("success"):
                try:
                    await query.answer("✅ کانفیگ با موفقیت انتخاب شد.", show_alert=False)
                except Exception:
                    pass
            else:
                err = res.get("error") if res else "خطا در انتخاب کانفیگ"
                try:
                    await query.answer(f"❌ {err}", show_alert=True)
                except Exception:
                    pass
        except Exception as e:
            logger.error(f"Error selecting vpn config: {e}")
        await show_vpn_configs_list(update, context, message_to_edit=query.message)
        return

    elif data.startswith("vpn_delete_"):
        try:
            idx = int(data.replace("vpn_delete_", ""))
            res = await express_api("POST", "/api/vpn/configs/delete", {"index": idx})
            if res and res.get("success"):
                try:
                    await query.answer("🗑️ کانفیگ با موفقیت حذف شد.", show_alert=False)
                except Exception:
                    pass
            else:
                err = res.get("error") if res else "خطا در حذف کانفیگ"
                try:
                    await query.answer(f"❌ {err}", show_alert=True)
                except Exception:
                    pass
        except Exception as e:
            logger.error(f"Error deleting vpn config: {e}")
        await show_vpn_configs_list(update, context, message_to_edit=query.message)
        return

    elif data.startswith("vpn_test_"):
        try:
            idx = int(data.replace("vpn_test_", ""))
            try:
                await query.answer("⏳ در حال تست پینگ...", show_alert=False)
            except Exception:
                pass
            res = await express_api("POST", "/api/vpn/test", {"index": idx})
            if res and "result" in res:
                test_out = res.get("result", {}).get("output", "بدون پاسخ")
                try:
                    await query.answer(f"⚡ نتیجه تست: {test_out}", show_alert=True)
                except Exception:
                    await query.message.reply_text(f"⚡ *نتیجه تست کانفیگ {idx+1}:*\n`{test_out}`", parse_mode="Markdown")
            else:
                try:
                    await query.answer("❌ خطا در اجرای تست پینگ", show_alert=True)
                except Exception:
                    pass
        except Exception as e:
            logger.error(f"Error testing vpn config: {e}")
        return
    # All file-related inline button callbacks are now processed by the dedicated file_callback_handler

async def file_callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """مدیریت تمام دکمه‌های شیشه‌ای بخش فایل منیجر"""
    query = update.callback_query
    await query.answer()
    
    data = query.data
    
    try:
        # Exit File Manager
        if data == "file_exit":
            context.user_data["mode"] = "normal"
            context.user_data["file_operation"] = None
            await query.message.edit_text("❌ از مدیریت فایل خارج شدید. منوی اصلی فعال است.")
            return

        # Navigate back / up
        elif data == "file_back":
            file_manager.change_directory("..")
            files, _ = file_manager.get_file_list()
            await show_file_menu_from_query(query, files, context)
            return

        # Refresh directory
        elif data == "file_refresh":
            files, _ = file_manager.get_file_list()
            await show_file_menu_from_query(query, files, context)
            return

        # Single folder enter
        elif data.startswith("file_enter:"):
            path_str = resolve_callback_path(context, data)
            if path_str:
                file_manager.change_directory(path_str)
                files, _ = file_manager.get_file_list()
                await show_file_menu_from_query(query, files, context)
            else:
                await query.answer("❌ نشست منسوخ شده است، لطفاً تازه کنید.", show_alert=True)
            return

        # Change Mode (Download / Delete) -> Start Batch Selection
        elif data.startswith("file_mode:"):
            mode = data.split(":")[1]
            context.user_data['batch_mode'] = mode
            context.user_data['batch_selected'] = set()
            
            files, _ = file_manager.get_file_list()
            await show_batch_selection(query, files, mode, context)
            return

        # Toggle item selection in batch mode
        elif data.startswith("file_toggle:"):
            path_str = resolve_callback_path(context, data)
            if not path_str:
                await query.answer("❌ نشست منسوخ شده است.", show_alert=True)
                return
                
            selected = context.user_data.get('batch_selected', set())
            if path_str in selected:
                selected.remove(path_str)
            else:
                selected.add(path_str)
                
            context.user_data['batch_selected'] = selected
            
            # Redisplay
            mode = context.user_data.get('batch_mode', 'download')
            files, _ = file_manager.get_file_list()
            await show_batch_selection(query, files, mode, context)
            return

        # Confirm batch operation (Download ZIP / Delete all selected)
        elif data == "file_batch_confirm":
            selected = context.user_data.get('batch_selected', set())
            if not selected:
                await query.answer("⚠️ ابتدا حداقل یک مورد را انتخاب کنید.", show_alert=True)
                return
                
            mode = context.user_data.get('batch_mode')
            if mode == "download":
                await handle_batch_download(query, context, selected)
            elif mode == "delete":
                keyboard = [
                    [
                        InlineKeyboardButton("✔️ بله، حذف شوند", callback_data="file_delete_confirm_batch"),
                        InlineKeyboardButton("❌ لغو", callback_data="file_batch_cancel")
                    ]
                ]
                await query.edit_message_text(
                    f"⚠️ *آیا از حذف {len(selected)} آیتم انتخاب شده مطمئن هستید؟*\nاین عمل غیرقابل بازگشت است!",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode="Markdown"
                )
            return

        elif data == "file_delete_confirm_batch":
            selected = context.user_data.get('batch_selected', set())
            await handle_batch_delete(query, context, selected)
            return

        # Cancel batch operation
        elif data == "file_batch_cancel":
            context.user_data['batch_selected'] = set()
            context.user_data['batch_mode'] = None
            
            files, _ = file_manager.get_file_list()
            await show_file_menu_from_query(query, files, context)
            return

        # Trigger Mkdir prompt
        elif data == "file_mkdir":
            context.user_data['file_operation'] = 'mkdir'
            await query.message.reply_text(
                "📁 *ایجاد پوشه جدید*\n\n"
                "لطفاً نام پوشه‌ی جدید را وارد کنید:",
                parse_mode="Markdown"
            )
            return

        # Trigger Upload prompt
        elif data == "file_upload":
            context.user_data['file_operation'] = 'upload_batch'
            context.user_data['upload_queue'] = {}
            await query.message.reply_text(
                "📤 *آپلود فایل به سرور*\n\n"
                "لطفاً فایل(های) خود را ارسال کنید. پس از ارسال تمامی فایل‌ها، دکمه تایید نهایی ظاهر خواهد شد.",
                parse_mode="Markdown"
            )
            return

        # Confirm and proceed with batch upload moves
        elif data == "file_confirm_upload":
            await handle_batch_upload_confirm(query, context)
            return

        # Cancel batch upload and delete temp files
        elif data == "file_cancel_upload":
            await handle_batch_upload_cancel(query, context)
            return

    except Exception as e:
        logger.error(f"Error in file_callback_handler: {e}")
        await query.answer(f"❌ خطا در پردازش دکمه: {str(e)}", show_alert=True)

async def handle_file_upload(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """دریافت فایل‌ها و افزودن به صف آپلود با سیستم debounce"""
    if not update.message:
        return
    
    file_operation = context.user_data.get('file_operation')
    if file_operation != 'upload_batch':
        context.user_data['file_operation'] = 'upload_batch'
        context.user_data['upload_queue'] = {}

    message = update.message
    
    try:
        tg_file = None
        file_name = None
        
        if message.document:
            tg_file = await message.document.get_file()
            file_name = message.document.file_name
        elif message.photo:
            tg_file = await message.photo[-1].get_file()
            file_name = f"photo_{message.photo[-1].file_unique_id}.jpg"
        elif message.video:
            tg_file = await message.video.get_file()
            file_name = message.video.file_name or f"video_{message.video.file_unique_id}.mp4"
        elif message.audio:
            tg_file = await message.audio.get_file()
            file_name = message.audio.file_name or f"audio_{message.audio.file_unique_id}.mp3"
            
        if not tg_file or not file_name:
            await message.reply_text("❌ فرمت فایل پشتیبانی نمی‌شود.")
            return

        ok, emsg = file_manager.ensure_upload_dir()
        if not ok:
            await message.reply_text(emsg)
            return

        temp_path = file_manager.upload_temp_dir / file_name
        await tg_file.download_to_drive(str(temp_path))
        
        if 'upload_queue' not in context.user_data:
            context.user_data['upload_queue'] = {}
        context.user_data['upload_queue'][file_name] = str(temp_path)
        
        if 'upload_debounce_task' in context.user_data:
            context.user_data['upload_debounce_task'].cancel()
            
        async def _send_confirm_after_delay():
            await asyncio.sleep(1.5)
            
            queue = context.user_data.get('upload_queue', {})
            if not queue:
                return
                
            file_list = "\n".join([f"🔹 `{name}`" for name in queue.keys()])
            try:
                rel_path = file_manager.current_dir.relative_to(ROOT_DIR.resolve())
                display_dest = f"/{rel_path}" if str(rel_path) != "." else "/"
            except ValueError:
                display_dest = str(file_manager.current_dir)
                
            text = (
                f"📥 *فایل‌های دریافت شده برای آپلود ({len(queue)}):*\n\n"
                f"{file_list}\n\n"
                f"📍 پوشه مقصد: `{display_dest}`\n\n"
                f"آیا مایل به آپلود نهایی این فایل‌ها هستید؟"
            )
            
            keyboard = [
                [
                    InlineKeyboardButton("✅ تأیید و آپلود", callback_data="file_confirm_upload"),
                    InlineKeyboardButton("❌ لغو", callback_data="file_cancel_upload")
                ]
            ]
            
            await message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")

        task = asyncio.create_task(_send_confirm_after_delay())
        context.user_data['upload_debounce_task'] = task

    except Exception as e:
        logger.error(f"Error in handle_file_upload: {e}")
        await message.reply_text(f"❌ خطا در دریافت فایل: {str(e)}")

async def handle_batch_upload_confirm(query, context: ContextTypes.DEFAULT_TYPE) -> None:
    """انتقال فایل‌های آپلود شده از پوشه موقت به پوشه فعلی"""
    queue = context.user_data.get('upload_queue', {})
    if not queue:
        await query.answer("صف آپلود خالی است.", show_alert=True)
        return
        
    await query.message.edit_text("⏳ در حال ذخیره و انتقال فایل‌ها...")
    
    success_count = 0
    errors = []
    
    for filename, temp_path_str in queue.items():
        try:
            temp_path = Path(temp_path_str)
            if temp_path.exists():
                dest_path = file_manager.current_dir / filename
                shutil.move(str(temp_path), str(dest_path))
                success_count += 1
        except Exception as e:
            errors.append(f"خطا در {filename}: {str(e)}")
            
    context.user_data['upload_queue'] = {}
    context.user_data['file_operation'] = None
    
    result_text = f"✅ {success_count} فایل با موفقیت آپلود شد."
    if errors:
        result_text += "\n\n❌ خطا‌ها:\n" + "\n".join(errors)
        
    await query.message.reply_text(result_text)
    
    files, _ = file_manager.get_file_list()
    await show_file_menu_from_query(query, files, context)

async def handle_batch_upload_cancel(query, context: ContextTypes.DEFAULT_TYPE) -> None:
    """لغو آپلود و حذف فایل‌های موقت"""
    queue = context.user_data.get('upload_queue', {})
    for filename, temp_path_str in queue.items():
        try:
            temp_path = Path(temp_path_str)
            if temp_path.exists():
                temp_path.unlink()
        except Exception as e:
            logger.error(f"Error deleting temp file {filename}: {e}")
            
    context.user_data['upload_queue'] = {}
    context.user_data['file_operation'] = None
    
    await query.answer("❌ آپلود لغو شد.", show_alert=True)
    
    files, _ = file_manager.get_file_list()
    await show_file_menu_from_query(query, files, context)

async def main():
    if not BOT_TOKEN:
        logger.warning("BOT_TOKEN is not set. Please configure the Telegram bot via panel settings.")
        # Hold and watch for configuration file to appear/load in a loop
        while not BOT_TOKEN:
            await asyncio.sleep(5)
            load_config()
            
    logger.info("Initializing Telegram Bot client...")
    # Build PTB v20 Application
    app = Application.builder().token(BOT_TOKEN).build()
    
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", start))
    app.add_handler(CommandHandler("info", show_system_metrics))
    app.add_handler(CommandHandler("files", enter_file_manager))
    app.add_handler(CommandHandler("terminal", enter_terminal_mode))
    app.add_handler(CommandHandler("processes", show_processes))
    app.add_handler(CommandHandler("vpn", show_vpn_status))
    
    app.add_handler(CallbackQueryHandler(file_callback_handler, pattern="^file_"))
    app.add_handler(CallbackQueryHandler(handle_callback_query))
    app.add_handler(MessageHandler(filters.ALL & ~filters.COMMAND, handle_message))
    
    await app.initialize()
    await app.start()
    logger.info("Bot started successfully and polling...")
    await app.updater.start_polling()
    
    # Run forever
    try:
        while True:
            await asyncio.sleep(3600)
    except (KeyboardInterrupt, SystemExit):
        await app.updater.stop()
        await app.stop()
        await app.shutdown()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        logger.critical(f"Bot execution halted: {e}")
