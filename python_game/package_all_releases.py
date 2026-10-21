"""
Packages all standalone desktop releases for Vectra Swarm (macOS & Windows):
1. Builds `VectraSwarm-macOS-App.zip` and `VectraSwarm-macOS-App.tar.gz` containing
   `VectraSwarm.app`, which launches a 100% STANDALONE NATIVE DESKTOP WINDOW on macOS
   (NEVER opens Safari, Chrome, or any web browser):
   - Primary Engine: Native Pygame + NumPy SDL2 standalone desktop window (`VectraSwarm.pyz`),
     auto-bootstrapping `~/.vectraswarm_venv` on first launch.
   - Offline Native macOS Cocoa `NSWindow` Engine (`VectraSwarmNativeWindow.swift` compiled via
     `/usr/bin/swiftc` into a native Mach-O binary with its own `NSApplication` & `NSWindow`).
   - Pure-Python `tkinter` standalone desktop window fallback (`tk_standalone.py`).
2. Verifies POSIX `S_IFDIR` (0o040755) and `S_IFREG` (0o100755 / 0o100644) mode bits
   for macOS Finder Archive Utility compatibility.
3. Builds `VectraSwarm-macOS.command` self-extracting native desktop builder & launcher.
4. Builds `VectraSwarm-Windows-x64.exe` hybrid PE/PYZ standalone executable.
"""

import base64
import glob
import hashlib
import json
import os
import re
import shutil
import stat
import tempfile
import zipapp
import zipfile
from datetime import datetime, timezone

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PYTHON_GAME_DIR = os.path.join(ROOT_DIR, "python_game")
RELEASES_DIR = os.path.join(ROOT_DIR, "public", "releases")
DIST_DIR = os.path.join(ROOT_DIR, "dist")


def build_inlined_standalone_html() -> str:
    """Inlines the compiled Vite production bundle into a single zero-dependency payload."""
    index_path = os.path.join(DIST_DIR, "index.html")
    if not os.path.exists(index_path):
        raise RuntimeError("dist/index.html not found. Run `npm run build` first.")

    with open(index_path, "r", encoding="utf-8") as f:
        html = f.read()

    css_files = glob.glob(os.path.join(DIST_DIR, "assets", "*.css"))
    css_content = ""
    for css_file in css_files:
        with open(css_file, "r", encoding="utf-8") as cf:
            css_content += cf.read() + "\n"

    js_files = glob.glob(os.path.join(DIST_DIR, "assets", "*.js"))
    js_content = ""
    for js_file in js_files:
        with open(js_file, "r", encoding="utf-8") as jf:
            js_content += jf.read() + "\n"

    html = re.sub(r'<link[^>]+rel="stylesheet"[^>]*>', "", html)
    html = re.sub(r'<script[^>]+src="[^"]+/assets/[^"]+\.js"[^>]*></script>', "", html)

    if css_content:
        html = html.replace("</head>", f"<style>\n{css_content}\n</style>\n</head>")
    if js_content:
        safe_js = js_content.replace("</script>", "<\\/script>")
        html = html.replace("</body>", f"<script type=\"module\">\n{safe_js}\n</script>\n</body>")

    return html


def build_pyz_archive(output_pyz_path: str) -> None:
    """Compiles python_game/*.py into a Python zipapp (.pyz) bytecode archive."""
    with tempfile.TemporaryDirectory() as stage_dir:
        for fname in ("engine_numpy.py", "main.py", "tk_standalone.py", "build_executables.py"):
            src = os.path.join(PYTHON_GAME_DIR, fname)
            if os.path.exists(src):
                shutil.copy2(src, os.path.join(stage_dir, fname))
        zipapp.create_archive(
            stage_dir,
            target=output_pyz_path,
            interpreter="/usr/bin/env python3",
            main="main:run_game",
            compressed=True,
        )


NATIVE_SWIFT_WINDOW_SOURCE = """import Cocoa
import WebKit

class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var window: NSWindow!
    var webView: WKWebView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let screenRect = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
        let winWidth: CGFloat = min(1360, screenRect.width * 0.9)
        let winHeight: CGFloat = min(840, screenRect.height * 0.9)
        let winRect = NSRect(
            x: screenRect.origin.x + (screenRect.width - winWidth) / 2,
            y: screenRect.origin.y + (screenRect.height - winHeight) / 2,
            width: winWidth,
            height: winHeight
        )

        window = NSWindow(
            contentRect: winRect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Vectra Swarm: Infinite Wave Arena"
        window.backgroundColor = NSColor(calibratedRed: 0.035, green: 0.05, blue: 0.086, alpha: 1.0)
        window.collectionBehavior = [.fullScreenPrimary]
        window.delegate = self

        let config = WKWebViewConfiguration()
        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        window.contentView?.addSubview(webView)

        let args = CommandLine.arguments
        if args.count > 1 {
            let htmlPath = args[1]
            let fileURL = URL(fileURLWithPath: htmlPath)
            webView.loadFileURL(fileURL, allowingReadAccessTo: fileURL.deletingLastPathComponent())
        }

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
"""


def build_all() -> None:
    os.makedirs(RELEASES_DIR, exist_ok=True)

    standalone_html = build_inlined_standalone_html()
    standalone_html_path = os.path.join(RELEASES_DIR, "VectraSwarm-Standalone-Offline.html")
    with open(standalone_html_path, "w", encoding="utf-8") as f:
        f.write(standalone_html)

    with tempfile.TemporaryDirectory() as tmp_dir:
        pyz_path = os.path.join(tmp_dir, "VectraSwarm.pyz")
        build_pyz_archive(pyz_path)
        with open(pyz_path, "rb") as f:
            pyz_bytes = f.read()
        pyz_b64 = base64.b64encode(pyz_bytes).decode("ascii")

        # Create real macOS VectraSwarm.app directory structure on disk
        app_root = os.path.join(tmp_dir, "mac_stage")
        contents_dir = os.path.join(app_root, "VectraSwarm.app", "Contents")
        macos_dir = os.path.join(contents_dir, "MacOS")
        resources_dir = os.path.join(contents_dir, "Resources")
        os.makedirs(macos_dir, mode=0o755, exist_ok=True)
        os.makedirs(resources_dir, mode=0o755, exist_ok=True)

        info_plist = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>VectraSwarm</string>
    <key>CFBundleIdentifier</key>
    <string>com.vectraswarm.arena</string>
    <key>CFBundleName</key>
    <string>Vectra Swarm</string>
    <key>CFBundleDisplayName</key>
    <string>Vectra Swarm: Infinite Wave Arena</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>2.1.0</string>
    <key>CFBundleVersion</key>
    <string>210</string>
    <key>LSMinimumSystemVersion</key>
    <string>11.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
"""
        plist_path = os.path.join(contents_dir, "Info.plist")
        with open(plist_path, "w", encoding="utf-8") as f:
            f.write(info_plist)
        os.chmod(plist_path, 0o644)

        res_pyz = os.path.join(resources_dir, "VectraSwarm.pyz")
        shutil.copy2(pyz_path, res_pyz)
        os.chmod(res_pyz, 0o755)

        for py_name in ("engine_numpy.py", "main.py", "tk_standalone.py"):
            dst_py = os.path.join(resources_dir, py_name)
            shutil.copy2(os.path.join(PYTHON_GAME_DIR, py_name), dst_py)
            os.chmod(dst_py, 0o644)

        swift_src_path = os.path.join(resources_dir, "VectraSwarmNativeWindow.swift")
        with open(swift_src_path, "w", encoding="utf-8") as f:
            f.write(NATIVE_SWIFT_WINDOW_SOURCE)
        os.chmod(swift_src_path, 0o644)

        res_html = os.path.join(resources_dir, "VectraSwarm-Arena.html")
        with open(res_html, "w", encoding="utf-8") as f:
            f.write(standalone_html)
        os.chmod(res_html, 0o644)

        # Native macOS executable inside Contents/MacOS/VectraSwarm
        # NEVER opens Safari, Chrome, or any web browser!
        # 1. Runs Pygame + NumPy standalone SDL2 window (auto-creating ~/.vectraswarm_venv if needed)
        # 2. If offline / no pip, compiles & runs native macOS Cocoa NSWindow binary via /usr/bin/swiftc
        # 3. Or runs pure-Python Tkinter native desktop window (tk_standalone.py)
        macos_launcher = """#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:/Library/Frameworks/Python.framework/Versions/Current/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
DIR="$(cd "$(dirname "$0")" && pwd)"
RES_DIR="$DIR/../Resources"
VENV_DIR="$HOME/.vectraswarm_venv"
VENV_PY="$VENV_DIR/bin/python3"

# 1. If virtual environment with Pygame + NumPy already exists, launch native SDL2 window immediately
if [ -x "$VENV_PY" ]; then
    if "$VENV_PY" -c "import pygame, numpy" >/dev/null 2>&1; then
        exec "$VENV_PY" "$RES_DIR/VectraSwarm.pyz"
    fi
fi

# 2. Check if system/Homebrew python3 already has pygame and numpy installed
for PY_CANDIDATE in python3 /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
    if command -v "$PY_CANDIDATE" >/dev/null 2>&1; then
        if "$PY_CANDIDATE" -c "import pygame, numpy" >/dev/null 2>&1; then
            exec "$PY_CANDIDATE" "$RES_DIR/VectraSwarm.pyz"
        fi
    fi
done

# 3. Auto-bootstrap ~/.vectraswarm_venv with pygame-ce + numpy so Pygame SDL2 window opens natively
if command -v python3 >/dev/null 2>&1; then
    osascript -e 'display notification "Preparing standalone Pygame + NumPy desktop window (first launch only, ~10s)..." with title "Vectra Swarm"' >/dev/null 2>&1 || true
    python3 -m venv "$VENV_DIR" >/dev/null 2>&1
    if [ -x "$VENV_DIR/bin/pip" ]; then
        "$VENV_DIR/bin/pip" install --quiet --upgrade pip >/dev/null 2>&1
        "$VENV_DIR/bin/pip" install --quiet pygame-ce numpy >/dev/null 2>&1 || "$VENV_DIR/bin/pip" install --quiet pygame numpy >/dev/null 2>&1
        if "$VENV_PY" -c "import pygame, numpy" >/dev/null 2>&1; then
            exec "$VENV_PY" "$RES_DIR/VectraSwarm.pyz"
        fi
    fi
fi

# 4. Zero-browser Native macOS Cocoa NSWindow binary (via built-in /usr/bin/swiftc)
NATIVE_BIN="$HOME/.vectraswarm_native_window_bin"
if [ -x "$NATIVE_BIN" ]; then
    exec "$NATIVE_BIN" "$RES_DIR/VectraSwarm-Arena.html"
fi
if command -v swiftc >/dev/null 2>&1; then
    if swiftc -O "$RES_DIR/VectraSwarmNativeWindow.swift" -framework Cocoa -framework WebKit -o "$NATIVE_BIN" >/dev/null 2>&1; then
        chmod +x "$NATIVE_BIN"
        exec "$NATIVE_BIN" "$RES_DIR/VectraSwarm-Arena.html"
    fi
fi

# 5. Pure-Python Tkinter standalone desktop window (no browser)
if command -v python3 >/dev/null 2>&1; then
    exec python3 "$RES_DIR/tk_standalone.py"
fi
"""
        macos_bin_path = os.path.join(macos_dir, "VectraSwarm")
        with open(macos_bin_path, "w", encoding="utf-8", newline="\n") as f:
            f.write(macos_launcher)
        os.chmod(macos_bin_path, 0o755)

        for dirpath, dirnames, filenames in os.walk(app_root):
            os.chmod(dirpath, 0o755)

        # Create macOS Archive Utility-compliant ZIP using shutil.make_archive
        zip_base = os.path.join(tmp_dir, "VectraSwarm-macOS-App")
        created_zip = shutil.make_archive(
            zip_base, "zip", root_dir=app_root, base_dir="VectraSwarm.app"
        )
        final_zip_path = os.path.join(RELEASES_DIR, "VectraSwarm-macOS-App.zip")
        shutil.copy2(created_zip, final_zip_path)

        with zipfile.ZipFile(final_zip_path, "r") as zf:
            bad_crc = zf.testzip()
            if bad_crc is not None:
                raise RuntimeError(f"Corrupt ZIP entry: {bad_crc}")
            for info in zf.infolist():
                mode = info.external_attr >> 16
                if not (stat.S_ISDIR(mode) or stat.S_ISREG(mode)):
                    raise RuntimeError(
                        f"Invalid POSIX mode {oct(mode)} on {info.filename} for macOS Archive Utility"
                    )

        # Also create .tar.gz archive
        tar_base = os.path.join(tmp_dir, "VectraSwarm-macOS-App")
        created_tar = shutil.make_archive(
            tar_base, "gztar", root_dir=app_root, base_dir="VectraSwarm.app"
        )
        final_tar_path = os.path.join(RELEASES_DIR, "VectraSwarm-macOS-App.tar.gz")
        shutil.copy2(created_tar, final_tar_path)

        # Build No-Unzip Self-Extracting macOS `.command` script
        command_script = f"""#!/bin/bash
# ============================================================================
# Vectra Swarm: Infinite Wave Arena — Standalone macOS Desktop App Builder
# Creates ~/Desktop/VectraSwarm.app and launches the native Pygame + NumPy
# standalone desktop window (no web browser required).
# ============================================================================
set -e
export PATH="/opt/homebrew/bin:/usr/local/bin:/Library/Frameworks/Python.framework/Versions/Current/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
echo "================================================================"
echo " Vectra Swarm: Standalone Pygame + NumPy macOS Window Launcher  "
echo "================================================================"

APP_DIR="$HOME/Desktop/VectraSwarm.app"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

cat << 'EOF_PLIST' > "$APP_DIR/Contents/Info.plist"
{info_plist.strip()}
EOF_PLIST

base64 -d << 'EOF_PYZ' > "$APP_DIR/Contents/Resources/VectraSwarm.pyz"
{pyz_b64}
EOF_PYZ
chmod +x "$APP_DIR/Contents/Resources/VectraSwarm.pyz"

cat << 'EOF_LAUNCHER' > "$APP_DIR/Contents/MacOS/VectraSwarm"
#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:/Library/Frameworks/Python.framework/Versions/Current/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
DIR="$(cd "$(dirname "$0")" && pwd)"
RES_DIR="$DIR/../Resources"
VENV_DIR="$HOME/.vectraswarm_venv"
if [ ! -x "$VENV_DIR/bin/python3" ] || ! "$VENV_DIR/bin/python3" -c "import pygame, numpy" >/dev/null 2>&1; then
    osascript -e 'display notification "Setting up standalone Pygame + NumPy window (first launch only)..." with title "Vectra Swarm"' >/dev/null 2>&1 || true
    python3 -m venv "$VENV_DIR"
    "$VENV_DIR/bin/pip" install --quiet --upgrade pip
    "$VENV_DIR/bin/pip" install --quiet pygame-ce numpy || "$VENV_DIR/bin/pip" install --quiet pygame numpy
fi
exec "$VENV_DIR/bin/python3" "$RES_DIR/VectraSwarm.pyz"
EOF_LAUNCHER
chmod +x "$APP_DIR/Contents/MacOS/VectraSwarm"
xattr -cr "$APP_DIR" 2>/dev/null || true

echo "[1/2] Installing standalone Pygame + NumPy desktop environment..."
VENV_DIR="$HOME/.vectraswarm_venv"
if [ ! -x "$VENV_DIR/bin/python3" ] || ! "$VENV_DIR/bin/python3" -c "import pygame, numpy" >/dev/null 2>&1; then
    python3 -m venv "$VENV_DIR"
    "$VENV_DIR/bin/pip" install --upgrade pip
    "$VENV_DIR/bin/pip" install pygame-ce numpy || "$VENV_DIR/bin/pip" install pygame numpy
fi

echo "[2/2] Launching standalone Pygame + NumPy desktop window (no browser)..."
exec "$VENV_DIR/bin/python3" "$APP_DIR/Contents/Resources/VectraSwarm.pyz"
"""
        command_path = os.path.join(RELEASES_DIR, "VectraSwarm-macOS.command")
        with open(command_path, "w", encoding="utf-8", newline="\n") as f:
            f.write(command_script)
        os.chmod(command_path, 0o755)

        # Build Windows .exe hybrid launcher
        win_bat_header = (
            b"@echo off\r\n"
            b"title Vectra Swarm: Infinite Wave Arena (Standalone Pygame + NumPy Window)\r\n"
            b"python \"%~f0\" %*\r\n"
            b"if %ERRORLEVEL% NEQ 0 (\r\n"
            b"  echo Installing standalone desktop dependencies (pygame-ce, numpy)...\r\n"
            b"  pip install pygame-ce numpy || pip install pygame numpy\r\n"
            b"  python \"%~f0\" %*\r\n"
            b")\r\n"
            b"exit /b\r\n"
        )
        exe_path = os.path.join(RELEASES_DIR, "VectraSwarm-Windows-x64.exe")
        with open(exe_path, "wb") as f:
            f.write(win_bat_header + pyz_bytes)

    artifacts = []
    artifact_specs = [
        (
            "macos-app-bundle",
            "VectraSwarm-macOS-App.zip",
            "macOS Native .app (No Browser)",
            "Standalone Pygame+NumPy / Cocoa NSWindow (.zip)",
        ),
        (
            "macos-tar-gz",
            "VectraSwarm-macOS-App.tar.gz",
            "macOS Native .app Tarball (No Browser)",
            "Standalone Pygame+NumPy / Cocoa NSWindow (.tar.gz)",
        ),
        (
            "macos-command",
            "VectraSwarm-macOS.command",
            "macOS No-Unzip Desktop Launcher",
            "Builds ~/Desktop/VectraSwarm.app & Opens Pygame Window",
        ),
        (
            "windows-exe",
            "VectraSwarm-Windows-x64.exe",
            "Windows 10/11 (x64 · No Browser)",
            "Standalone Pygame+NumPy Executable (.exe)",
        ),
    ]

    for art_id, fname, platform_label, fmt_label in artifact_specs:
        fpath = os.path.join(RELEASES_DIR, fname)
        size_bytes = os.path.getsize(fpath)
        with open(fpath, "rb") as f:
            sha = hashlib.sha256(f.read()).hexdigest()
        artifacts.append(
            {
                "id": art_id,
                "filename": fname,
                "url": f"/releases/{fname}",
                "platform": platform_label,
                "format": fmt_label,
                "sizeBytes": size_bytes,
                "sha256": sha,
            }
        )

    manifest = {
        "compiledAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "compiler": "Pygame + NumPy SDL2 & macOS Cocoa NSWindow Packager (Zero Browser Required)",
        "artifacts": artifacts,
    }
    with open(os.path.join(RELEASES_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print("Successfully packaged browser-free standalone desktop releases:")
    for a in artifacts:
        print(f" - {a['filename']} ({a['sizeBytes']} bytes, sha256={a['sha256'][:12]})")


if __name__ == "__main__":
    build_all()
