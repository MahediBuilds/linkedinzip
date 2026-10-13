"""Press the arrow keys for a Zip board the moment it loads.

Usage:
    python auto_play.py                   check, then open Zip in your default browser
    python auto_play.py --browser chrome  ... or in Chrome (or edge, brave)
    python auto_play.py --no-open       don't open the page, just wait for it

It checks the setup, opens the Zip game in the browser profile that has the
Zip Solver extension, and waits for the extension on that page to check in. Then press Start game: as soon as the
board appears, the extension solves it and sends the moves here, and they are
pressed as real keys with PyAutoGUI. There is no countdown and no need to
click into the window: the keys go to the focused window, which must be the
LinkedIn one.
"""

import argparse
import json
import os
import re
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pyautogui

from play_moves import TOTAL_TIME, play

PORT = 8765  # must match PLAYER_URL in zip-extension/background.js
START_DELAY = 0.0  # seconds between the board appearing and the first key
FOCUS_TIMEOUT = 5  # seconds to wait for the Zip tab to be focused
HELLO_TIMEOUT = 15  # seconds to wait for the extension to check in
ZIP_URL = "https://www.linkedin.com/games/zip/"

HERE = os.path.dirname(os.path.abspath(__file__))
EXTENSION_DIR = os.path.join(HERE, "zip-extension")

# Where each browser is installed and keeps its profiles.
BROWSERS = {
    "chrome": {
        "name": "Chrome",
        "exe": [
            r"%ProgramFiles%\Google\Chrome\Application\chrome.exe",
            r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe",
            r"%LocalAppData%\Google\Chrome\Application\chrome.exe",
        ],
        "profiles": r"%LocalAppData%\Google\Chrome\User Data",
        "extensions_page": "chrome://extensions",
    },
    "edge": {
        "name": "Edge",
        "exe": [
            r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe",
            r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe",
        ],
        "profiles": r"%LocalAppData%\Microsoft\Edge\User Data",
        "extensions_page": "edge://extensions",
    },
    "brave": {
        "name": "Brave",
        "exe": [
            r"%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe",
            r"%ProgramFiles(x86)%\BraveSoftware\Brave-Browser\Application\brave.exe",
            r"%LocalAppData%\BraveSoftware\Brave-Browser\Application\brave.exe",
        ],
        "profiles": r"%LocalAppData%\BraveSoftware\Brave-Browser\User Data",
        "extensions_page": "brave://extensions",
    },
}

playing = threading.Lock()
connected = threading.Event()


def zip_focused():
    # A browser window's title is its active tab's title ("Zip | LinkedIn ...
    # - Microsoft Edge"), so this also checks that the Zip tab is the one shown.
    try:
        win = pyautogui.getActiveWindow()
    except Exception:
        return True  # can't check on this platform
    return bool(win) and re.match(r"zip\b.*linkedin", win.title.strip(), re.I) is not None


def run(moves):
    if not playing.acquire(blocking=False):
        print("Already playing, ignored a second board.")
        return
    try:
        deadline = time.monotonic() + FOCUS_TIMEOUT
        while not zip_focused():
            if time.monotonic() > deadline:
                print("The Zip tab isn't the focused window, so no keys were pressed.")
                return
            time.sleep(0.02)
        time.sleep(START_DELAY)
        print(f"Board received, playing {len(moves)} moves...")
        play(moves, TOTAL_TIME)
    finally:
        playing.release()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Lets the extension popup show whether auto_play.py is running.
        if self.path == "/status":
            return self.reply(200, {"ok": True})
        self.reply(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        # Only the extension may call this; web pages can't fake this header.
        if not self.headers.get("Origin", "").startswith("chrome-extension://"):
            return self.reply(403, {"ok": False, "error": "forbidden"})
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
        except ValueError:
            body = None
        if not isinstance(body, dict):
            return self.reply(400, {"ok": False, "error": "bad request"})

        if self.path == "/hello":
            # Sent by the extension each time a Zip page loads.
            connected.set()
            print(f"[ok] Zip Solver connected ({body.get('browser') or 'browser'}). "
                  "Press Start game.")
            return self.reply(200, {"ok": True})

        if self.path == "/play":
            moves = body.get("moves")
            if not isinstance(moves, str) or not re.fullmatch(r"[LDRU]+", moves):
                return self.reply(400, {"ok": False, "error": "bad moves"})
            self.reply(200, {"ok": True})
            threading.Thread(target=run, args=(moves,), daemon=True).start()
            return

        self.reply(404, {"ok": False, "error": "not found"})

    def reply(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


class Server(ThreadingHTTPServer):
    # On Windows, address reuse lets a second copy bind the same port without
    # an error; turn it off so a second copy is refused.
    allow_reuse_address = False


def default_browser():
    """"chrome", "edge" or "brave", whichever Windows opens links in (else "edge")."""
    try:
        import winreg
    except ImportError:
        return "edge"
    base = r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https"
    # Newer Windows 11 builds keep the choice in UserChoiceLatest\ProgId.
    prog_id = ""
    for key in (base + r"\UserChoiceLatest\ProgId", base + r"\UserChoice"):
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key) as k:
                prog_id = winreg.QueryValueEx(k, "ProgId")[0].lower()
                break
        except OSError:
            continue
    if prog_id.startswith("brave"):
        return "brave"
    return "chrome" if prog_id.startswith("chrome") else "edge"


def find_exe(browser):
    for path in map(os.path.expandvars, BROWSERS[browser]["exe"]):
        if os.path.isfile(path):
            return path
    return None


def zip_solver_profiles(browser):
    """The browser's profile folders that have Zip Solver loaded unpacked."""
    root = os.path.expandvars(BROWSERS[browser]["profiles"])
    try:
        names = sorted(os.listdir(root))
    except OSError:
        return []
    found = []
    for name in names:
        for prefs in ("Secure Preferences", "Preferences"):
            try:
                with open(os.path.join(root, name, prefs), encoding="utf-8") as f:
                    exts = json.load(f).get("extensions", {}).get("settings", {})
            except (OSError, ValueError):
                continue
            paths = (str(e.get("path", "")) for e in exts.values() if isinstance(e, dict))
            if any(os.path.normcase(p) == os.path.normcase(EXTENSION_DIR) for p in paths):
                found.append(name)
                break
    return found


def open_zip(browser, profile):
    """Check the browser and profile, then open the Zip page. Returns success."""
    info = BROWSERS[browser]
    exe = find_exe(browser)
    if not exe:
        print(f"[!!] {info['name']} isn't installed. Open {ZIP_URL} yourself.")
        return False
    profiles = zip_solver_profiles(browser)
    if profile is None:
        if not profiles:
            print(
                f"[!!] Zip Solver isn't loaded in any {info['name']} profile. Open "
                f"{info['extensions_page']},\n     turn on Developer mode, click "
                f"Load unpacked and pick\n     {EXTENSION_DIR}\n     then run this again."
            )
            return False
        profile = profiles[0]
    elif profile not in profiles:
        print(f"[!!] Zip Solver isn't loaded in the {info['name']} profile '{profile}'.")
    if profile in profiles:
        print(f"[ok] Zip Solver is loaded in {info['name']} profile '{profile}'.")
    # Naming the profile also skips Chrome's profile picker.
    subprocess.Popen([exe, f"--profile-directory={profile}", ZIP_URL])
    print(f"Opening {ZIP_URL} ...")
    return True


def wait_for_extension():
    if connected.wait(HELLO_TIMEOUT):
        return
    print(
        f"[!!] No word from the Zip Solver extension after {HELLO_TIMEOUT}s. Check that:\n"
        "  - the Zip page has finished loading in this browser\n"
        "  - Zip Solver is loaded in this browser profile (chrome://extensions,\n"
        "    edge://extensions or brave://extensions, Load unpacked > zip-extension)\n"
        "  - you clicked its reload button after updating it, then reloaded the Zip tab\n"
        "  - in an InPrivate/Incognito window, the extension is allowed to run there\n"
        "Still listening: it connects as soon as the page loads with the extension."
    )


def main():
    ap = argparse.ArgumentParser(description="Play Zip boards sent by the extension.")
    ap.add_argument("--browser", choices=list(BROWSERS), default=default_browser(),
                    help="browser to open the Zip page in (default: your default browser)")
    ap.add_argument("--profile",
                    help="browser profile folder, e.g. Default or 'Profile 1' "
                         "(default: the one with Zip Solver)")
    ap.add_argument("--no-open", action="store_true",
                    help="don't open the Zip page, just wait for it")
    args = ap.parse_args()

    # Pre-run checks: the port must be free and PyAutoGUI able to see windows.
    try:
        server = Server(("127.0.0.1", PORT), Handler)
    except OSError:
        raise SystemExit(f"[!!] Port {PORT} is in use: auto_play.py is probably "
                         "already running in another window.")
    try:
        pyautogui.getActiveWindow()
    except Exception as e:
        print(f"[!!] Can't check which window is focused ({e}); keys will be "
              "pressed into whatever window is in front.")
    print(f"[ok] Listening on port {PORT}.")

    if not args.no_open and not open_zip(args.browser, args.profile):
        server.server_close()
        raise SystemExit(1)
    threading.Thread(target=wait_for_extension, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
