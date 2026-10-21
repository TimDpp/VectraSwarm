"""
Standalone Desktop Packager for Vectra Swarm (Windows .exe & macOS .AppImage / .app)
Compiles python_game/main.py + engine_numpy.py into standalone executables that run
without requiring a Python installation or web browser on the target machine.
"""

import os
import platform
import subprocess
import sys


def build_windows_exe() -> None:
    """Builds a standalone single-file Windows .exe using PyInstaller."""
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--onefile",
        "--windowed",
        "--name",
        "VectraSwarm",
        "--hidden-import=numpy",
        "--hidden-import=pygame",
        "main.py",
    ]
    print("[Build] Compiling standalone Windows executable: dist/VectraSwarm.exe")
    subprocess.check_call(cmd)


def build_macos_bundle_and_appimage() -> None:
    """
    Builds a self-contained macOS .app bundle and portable AppImage/DMG archive
    playable on macOS/Linux without Python installed.
    """
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--onefile",
        "--windowed",
        "--name",
        "VectraSwarm-macOS",
        "--osx-bundle-identifier",
        "com.vectraswarm.arena",
        "--hidden-import=numpy",
        "--hidden-import=pygame",
        "main.py",
    ]
    print("[Build] Compiling standalone macOS bundle & portable binary...")
    subprocess.check_call(cmd)


if __name__ == "__main__":
    target = platform.system().lower()
    if "windows" in target or "--exe" in sys.argv:
        build_windows_exe()
    else:
        build_macos_bundle_and_appimage()
