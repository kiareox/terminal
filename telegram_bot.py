import os
import sys

dir_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "telegram_bot")
if os.path.exists(dir_path):
    os.chdir(dir_path)
    if dir_path not in sys.path:
        sys.path.insert(0, dir_path)

bot_script = os.path.join(dir_path, "telegram_bot.py")
if os.path.exists(bot_script):
    with open(bot_script, "r", encoding="utf-8") as f:
        code = f.read()
    exec(compile(code, bot_script, 'exec'), {'__name__': '__main__', '__file__': bot_script})
else:
    print(f"Error: Could not find {bot_script}")
