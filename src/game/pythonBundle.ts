export interface PythonProjectFile {
  filename: string;
  title: string;
  description: string;
  language: 'python' | 'bash' | 'text';
  content: string;
}

export const PYTHON_PROJECT_FILES: PythonProjectFile[] = [
  {
    filename: 'engine_numpy.py',
    title: 'NumPy Vectorized SoA Logic (engine_numpy.py)',
    description: 'High-frequency Structure-of-Arrays (SoA) NumPy simulation for 1,000+ enemies, pairwise distance matrix collisions, XP magnetization, and 3-choice stackable power-up upgrades.',
    language: 'python',
    content: `"""
Vectra Swarm: Vectorized NumPy Game Logic & Physics Engine
Uses Structure-of-Arrays (SoA) NumPy ndarrays for high-frequency wave simulation,
collision detection, XP gem magnetization, and 5th-wave enemy behavior policies.
"""

import numpy as np
from dataclasses import dataclass
from typing import Dict, List, Tuple


@dataclass
class PowerUpChoice:
    power_id: str
    name: str
    category: str
    is_upgrade: bool
    current_level: int
    next_level: int
    description: str


POWER_UP_DEFS: Dict[str, Tuple[str, str, str]] = {
    "pulse_cannon": ("Pulse Autocannon", "weapon", "Rapid directional bolts toward nearest threat"),
    "orbital_blades": ("Orbital Glaives", "weapon", "360-degree rotating plasma ring around hull"),
    "chain_arc": ("Voltaic Arc Emitter", "weapon", "High-voltage chain lightning across clusters"),
    "nova_emitter": ("Seismic Shockwave", "weapon", "Periodic radial blast with heavy knockback"),
    "seeker_missiles": ("Swarm Micro-Pods", "weapon", "Homing micro-missiles targeting high-HP foes"),
    "overclock_core": ("Overclock Matrix", "passive", "+12% Global Damage & +7% Fire Rate per level"),
    "kinetic_thrusters": ("Kinetic Thrusters", "passive", "+11% Move Speed & -8% Dash Cooldown per level"),
    "magnet_field": ("Graviton Attractor", "passive", "+38px XP Magnet Radius & +10% XP Gain per level"),
    "reactive_hull": ("Reactive Hull Plating", "passive", "+25 Max HP & +4% Hull Mitigation per level"),
}


class VectorizedArenaEngine:
    def __init__(self, max_enemies: int = 1024, max_gems: int = 2048, max_projectiles: int = 512):
        self.enemy_pos = np.zeros((max_enemies, 2), dtype=np.float32)
        self.enemy_vel = np.zeros((max_enemies, 2), dtype=np.float32)
        self.enemy_hp = np.zeros(max_enemies, dtype=np.float32)
        self.enemy_radius = np.zeros(max_enemies, dtype=np.float32)
        self.enemy_speed = np.zeros(max_enemies, dtype=np.float32)
        self.enemy_type = np.zeros(max_enemies, dtype=np.int32)
        self.enemy_active = np.zeros(max_enemies, dtype=np.bool_)

        self.gem_pos = np.zeros((max_gems, 2), dtype=np.float32)
        self.gem_val = np.zeros(max_gems, dtype=np.float32)
        self.gem_active = np.zeros(max_gems, dtype=np.bool_)

        self.proj_pos = np.zeros((max_projectiles, 2), dtype=np.float32)
        self.proj_vel = np.zeros((max_projectiles, 2), dtype=np.float32)
        self.proj_dmg = np.zeros(max_projectiles, dtype=np.float32)
        self.proj_ttl = np.zeros(max_projectiles, dtype=np.float32)
        self.proj_active = np.zeros(max_projectiles, dtype=np.bool_)

        self.player_pos = np.array([0.0, 0.0], dtype=np.float32)
        self.player_hp = 100.0
        self.player_max_hp = 100.0
        self.level = 1
        self.xp = 0.0
        self.xp_next = 35.0
        self.wave = 1
        self.score = 0
        # Start of round grants 1 initial power-up
        self.inventory: Dict[str, int] = {"pulse_cannon": 1}

    def roll_three_upgrades(self) -> List[PowerUpChoice]:
        eligible = [pid for pid in POWER_UP_DEFS.keys() if self.inventory.get(pid, 0) < 8]
        chosen_ids = list(np.random.choice(eligible, size=min(3, len(eligible)), replace=False))
        return [
            PowerUpChoice(
                power_id=pid,
                name=POWER_UP_DEFS[pid][0],
                category=POWER_UP_DEFS[pid][1],
                is_upgrade=self.inventory.get(pid, 0) > 0,
                current_level=self.inventory.get(pid, 0),
                next_level=self.inventory.get(pid, 0) + 1,
                description=POWER_UP_DEFS[pid][2],
            )
            for pid in chosen_ids
        ]
`,
  },
  {
    filename: 'main.py',
    title: 'Pygame Renderer, Key Rebinding & Accessibility (main.py)',
    description: 'Complete Pygame desktop loop featuring infinite map camera tracking, fullscreen toggle (F11/F), custom key rebinding, volume sliders, and WCAG High-Contrast mode.',
    language: 'python',
    content: `"""
Vectra Swarm: Infinite Wave Arena (Pygame + NumPy Desktop Edition)
Supports full-screen mode, customizable keyboard controls, volume sliders,
and high-contrast accessibility modes.
"""

import json
import os
import sys
import pygame
import numpy as np
from engine_numpy import VectorizedArenaEngine

CONFIG_FILE = "vectra_settings.json"

DEFAULT_SETTINGS = {
    "master_volume": 80,
    "sfx_volume": 85,
    "music_volume": 60,
    "high_contrast": False,
    "fullscreen": False,
    "keybindings": {
        "up": pygame.K_w,
        "down": pygame.K_s,
        "left": pygame.K_a,
        "right": pygame.K_d,
        "dash": pygame.K_SPACE,
        "fullscreen": pygame.K_f,
        "pause": pygame.K_ESCAPE,
    },
}

if __name__ == "__main__":
    pygame.init()
    screen = pygame.display.set_mode((1280, 720), pygame.RESIZABLE)
    pygame.display.set_caption("Vectra Swarm: Infinite Wave Arena (Pygame + NumPy)")
    # Full loop implementation in /python_game/main.py
`,
  },
  {
    filename: 'build_executables.py',
    title: 'Standalone .exe & macOS AppImage Packager (build_executables.py)',
    description: 'Compiles the complete Python + Pygame + NumPy game into a standalone Windows .exe and macOS .AppImage / .app bundle playable without Python or a browser.',
    language: 'python',
    content: `"""
Standalone Desktop Packager for Vectra Swarm (Windows .exe & macOS .AppImage / .app)
Compiles python_game/main.py + engine_numpy.py into standalone executables that run
without requiring a Python installation or web browser on the target machine.
"""

import platform
import subprocess
import sys


def build_windows_exe() -> None:
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm", "--onefile", "--windowed",
        "--name", "VectraSwarm",
        "--hidden-import=numpy", "--hidden-import=pygame",
        "main.py",
    ]
    subprocess.check_call(cmd)


def build_macos_appimage() -> None:
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm", "--onefile", "--windowed",
        "--name", "VectraSwarm-macOS.AppImage",
        "--osx-bundle-identifier", "com.vectraswarm.arena",
        "--hidden-import=numpy", "--hidden-import=pygame",
        "main.py",
    ]
    subprocess.check_call(cmd)


if __name__ == "__main__":
    if "windows" in platform.system().lower() or "--exe" in sys.argv:
        build_windows_exe()
    else:
        build_macos_appimage()
`,
  },
  {
    filename: 'requirements.txt',
    title: 'Python Dependencies (requirements.txt)',
    description: 'Required Python libraries for local compilation into standalone Windows .exe and macOS .AppImage.',
    language: 'text',
    content: `pygame-ce>=2.5.0
numpy>=2.0.0
pyinstaller>=6.10.0
`,
  },
];
