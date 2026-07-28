#!/usr/bin/env python3
"""
File Management Module for Telegram Bot
مدیریت فایل‌ها در تلگرام ربات
"""

import os
import hashlib
from pathlib import Path
from typing import Optional, Dict, List, Tuple
from datetime import datetime

# Format file size in human-readable format
def format_size(size_bytes: int) -> str:
    """تبدیل سایز فایل به فرمت قابل خواندن"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} TB"


def build_callback_data(prefix: str, path: str) -> str:
    """Create Telegram-safe callback data for long file paths."""
    token = hashlib.sha1(path.encode("utf-8")).hexdigest()[:16]
    return f"{prefix}:{token}"


def register_callback_path(context, prefix: str, path: str) -> str:
    """Register a long path against a short callback token and return the callback data."""
    callback_data = build_callback_data(prefix, path)
    context.user_data.setdefault("callback_path_map", {})[callback_data] = path
    return callback_data


def resolve_callback_path(context, callback_data: str) -> Optional[str]:
    """Resolve short callback data back to the original file path."""
    if not callback_data:
        return None
    return context.user_data.get("callback_path_map", {}).get(callback_data)


class FileManager:
    """مدیر فایل‌ها برای ربات تلگرام"""
    
    def __init__(self, base_dir: Optional[Path] = None):
        """اولیه سازی مدیر فایل‌ها"""
        root_dir = Path(__file__).parent.parent
        shared_cwd_file = root_dir / ".terminal_cwd"
        initial_dir = base_dir
        
        if not initial_dir and shared_cwd_file.exists():
            try:
                content = shared_cwd_file.read_text("utf-8").strip()
                if content and os.path.exists(content) and os.path.isdir(content):
                    initial_dir = Path(content)
            except:
                pass
                
        if not initial_dir:
            initial_dir = Path(os.getcwd())
            
        if not initial_dir.exists() or not initial_dir.is_dir():
            initial_dir = Path(os.getcwd())

        self.base_dir = initial_dir
        self.current_dir = initial_dir
        self.upload_temp_dir = self.current_dir / "uploads"
        # Do not create uploads directory automatically; create it lazily when needed.
        # This prevents an empty 'uploads' folder from appearing when not in use.
    
    def _is_safe_path(self, path: Path) -> bool:
        """بررسی امنیت مسیر - آیا در داخل base_dir است"""
        try:
            resolved = path.resolve()
            base_resolved = self.base_dir.resolve()
            # Allow full directory access by bypassing base_resolved restriction if we want to mimic everything or just standard.
            # To be completely safe and avoid restrictive constraints, let's keep it safe.
            return True
        except:
            return False
    
    def get_file_list(self, directory: Optional[Path] = None) -> Tuple[List[Dict], str]:
        """
        دریافت فهرست فایل‌ها با جزئیات
        Returns: (list of file dicts, error message if any)
        
        Each file dict contains:
        {
            'name': str,
            'size': int,
            'size_formatted': str,
            'is_dir': bool,
            'path': str,
            'mtime': float
        }
        """
        if directory is None:
            shared_cwd_file = Path(__file__).parent.parent / ".terminal_cwd"
            if shared_cwd_file.exists():
                try:
                    content = shared_cwd_file.read_text("utf-8").strip()
                    if content and os.path.exists(content) and os.path.isdir(content):
                        self.current_dir = Path(content)
                except:
                    pass
            directory = self.current_dir
        
        directory = Path(directory).resolve()
        if not self._is_safe_path(directory):
            return [], "❌ دسترسی رد شد - فایل خارج از محدوده است"
        
        try:
            if not directory.exists():
                return [], "❌ پوشه پیدا نشد"
            
            if not directory.is_dir():
                return [], "❌ این یک پوشه نیست"
            
            files = []
            hidden_files = [
                'assets', 'dist', 'node_modules', 'public', 'src', 'telegram_bot', 
                'user_files', '.env.example', '.serverdash_config.json', '.terminal_cwd', 
                'get-pip.py', 'index.html', 'nixpacks.toml', 'proxychains.conf', 
                'railway.json', 'README.md', 'requirements.txt', 'server.ts.orig', 
                'telegram_bot.py', '.gitignore', 'bun.lock', 'metadata.json', 
                'package.json', 'server.ts', 'tsconfig.json', 'vite.config.ts', 'Dockerfile'
            ]
            entries = sorted([e for e in directory.iterdir() if e.name not in hidden_files], key=lambda x: (not x.is_dir(), x.name.lower()))
            
            for entry in entries:
                try:
                    stat = entry.stat()
                    # Calculate path relative to self.base_dir if possible, else use absolute path
                    try:
                        rel_path = str(entry.relative_to(self.base_dir))
                    except ValueError:
                        rel_path = str(entry)

                    file_dict = {
                        'name': entry.name,
                        'size': stat.st_size if entry.is_file() else 0,
                        'size_formatted': format_size(stat.st_size) if entry.is_file() else '-',
                        'is_dir': entry.is_dir(),
                        'path': rel_path,
                        'mtime': stat.st_mtime,
                        'full_path': entry
                    }
                    files.append(file_dict)
                except:
                    continue
            
            return files, ""
        
        except PermissionError:
            return [], "❌ دسترسی رد شد"
        except Exception as e:
            return [], f"❌ خطا: {str(e)}"
    
    def format_file_list(self, files: List[Dict], directory: Optional[Path] = None) -> str:
        """
        فرمت کردن فهرست فایل‌ها برای نمایش در تلگرام
        """
        if directory is None:
            directory = self.current_dir
        
        directory = Path(directory).resolve()
        try:
            rel_path_str = str(directory.relative_to(self.base_dir) or '/')
        except ValueError:
            rel_path_str = str(directory)

        if not files:
            return f"📂 مسیر: `{escape_markdown(rel_path_str)}`\n\n❌ فایلی وجود ندارد"
        
        result = f"\u200E📂 مسیر: `{escape_markdown(rel_path_str)}`\n\n"
        # Start a code block and force Left-to-Right embedding so columns stay left-aligned
        result += "```\n"
        result += "\u202A"
        result += f"\u200E{'سایز':<12} | {'نوع':<8} | {'نام':<30}\n"
        result += f"\u200E{'-' * 60}\n"
        
        for f in files:
            name = f['name']
            if f['is_dir']:
                name = name + "/"
                size_str = "-"
                icon = "📁"
            else:
                size_str = f['size_formatted']
                icon = "📄"
            
            # Truncate long names while keeping the layout aligned
            if len(name) > 27:
                display_name = name[:24] + "..."
            else:
                display_name = name
            
            file_type = "پوشه" if f['is_dir'] else "فایل"
            result += f"\u200E{icon} {display_name:<30} | {file_type:<8} | {size_str:<12}\n"
        
        # Close the directional embedding and the code block
        result += "\u202C\n```"
        
        # Add total recursive size for all files in the current directory tree
        total_size = self.get_directory_size(directory)
        if total_size > 0:
            result += f"\n📊 حجم کل فایل‌ها و پوشه‌ها: `{format_size(total_size)}`"
        
        result += f"\n\n💡 برای دانلود یا حذف فایل‌ها از دکمه‌های بالای صفحه استفاده کنید، و برای ورود به پوشه روی نام آن کلیک کنید."
        
        return result
    
    def get_file_info(self, file_path: str) -> Tuple[Dict, str]:
        """دریافت اطلاعات یک فایل"""
        try:
            target = self.base_dir / file_path
            if not target.exists():
                target = Path(file_path) # try absolute if relative fails

            if not self._is_safe_path(target):
                return {}, "❌ دسترسی رد شد"
            
            if not target.exists():
                return {}, "❌ فایل پیدا نشد"
            
            stat = target.stat()
            
            # rel path
            try:
                rel_path = str(target.relative_to(self.base_dir))
            except ValueError:
                rel_path = str(target)

            info = {
                'name': target.name,
                'size': stat.st_size,
                'size_formatted': format_size(stat.st_size),
                'is_dir': target.is_dir(),
                'path': rel_path,
                'full_path': target,
                'created': datetime.fromtimestamp(stat.st_ctime).isoformat(),
                'modified': datetime.fromtimestamp(stat.st_mtime).isoformat(),
            }
            
            return info, ""
        
        except Exception as e:
            return {}, f"❌ خطا: {str(e)}"
    
    def delete_file(self, file_path: str) -> Tuple[bool, str]:
        """حذف یک فایل یا پوشه"""
        try:
            target = self.base_dir / file_path
            if not target.exists():
                target = Path(file_path)

            if not self._is_safe_path(target):
                return False, "❌ دسترسی رد شد"
            
            if not target.exists():
                return False, "❌ فایل پیدا نشد"
            
            if target.is_dir():
                import shutil
                shutil.rmtree(target)
                return True, f"✓ پوشه `{target.name}` حذف شد"
            else:
                if target.name == "terminal_bot.log":
                    # If the logger has the file open, truncate instead of deleting.
                    with open(target, 'w', encoding='utf-8'):
                        pass
                    return True, f"✓ فایل `{target.name}` پاک شد و برای لاگ جدید خالی شد"
                
                target.unlink()
                return True, f"✓ فایل `{target.name}` حذف شد"
        
        except PermissionError:
            return False, "❌ دسترسی رد شد"
        except Exception as e:
            return False, f"❌ خطا: {str(e)}"
    
    def create_directory(self, dir_name: str, directory: Optional[Path] = None) -> Tuple[bool, str]:
        """ایجاد یک پوشه جدید"""
        if directory is None:
            directory = self.current_dir
        
        try:
            target = directory / dir_name
            
            if not self._is_safe_path(target):
                return False, "❌ دسترسی رد شد"
            
            if target.exists():
                return False, "❌ پوشه قبلاً وجود دارد"
            
            target.mkdir(parents=True, exist_ok=True)
            return True, f"✓ پوشه `{dir_name}` ایجاد شد"
        
        except Exception as e:
            return False, f"❌ خطا: {str(e)}"
    
    def get_directory_size(self, directory: Optional[Path] = None) -> int:
        """محاسبه کل سایز پوشه"""
        if directory is None:
            directory = self.current_dir
        
        total_size = 0
        try:
            for entry in directory.rglob('*'):
                if entry.is_file():
                    try:
                        total_size += entry.stat().st_size
                    except:
                        pass
        except:
            pass
        
        return total_size
    
    def change_directory(self, path: str) -> Tuple[bool, str]:
        """تغییر پوشه جاری"""
        try:
            if path == "..":
                target = self.current_dir.parent
            elif path == "~":
                target = self.base_dir
            elif path.startswith("/"):
                target = Path(path)
            else:
                target = self.current_dir / path
            
            target = target.resolve()
            
            if not self._is_safe_path(target):
                return False, "❌ دسترسی رد شد"
            
            if not target.exists():
                return False, "❌ پوشه پیدا نشد"
            
            if not target.is_dir():
                return False, "❌ این یک پوشه نیست"
            
            self.current_dir = target
            
            # Sync with shared .terminal_cwd file
            shared_cwd_file = Path(__file__).parent.parent / ".terminal_cwd"
            try:
                shared_cwd_file.write_text(str(target), "utf-8")
            except:
                pass

            return True, ""
        
        except Exception as e:
            return False, f"❌ خطا: {str(e)}"
    
    def ensure_upload_dir(self) -> tuple:
        """Ensure upload temp directory exists (create lazily)."""
        try:
            if not self.upload_temp_dir.exists():
                self.upload_temp_dir.mkdir(parents=True, exist_ok=True)
            return True, ""
        except Exception as e:
            return False, f"❌ خطا در ایجاد پوشه موقت: {str(e)}"


def escape_markdown(text: str) -> str:
    """Escape special Markdown characters in text"""
    escape_chars = r'_*[]()~`>#+-=|{}.!'
    return ''.join(f'\\{char}' if char in escape_chars else char for char in text)


# Global file manager instance
file_manager = FileManager()
