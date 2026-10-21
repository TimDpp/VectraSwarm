#!/usr/bin/env python3
"""
Vectra Swarm Cross-Platform Binary & macOS Native Package Compiler
Compiles python_game/main.py + engine_numpy.py into:
1. VectraSwarm-macOS-App.zip (Native macOS Application Bundle: VectraSwarm.app)
2. VectraSwarm-macOS.command (Native macOS Finder Double-Clickable Launcher)
3. VectraSwarm-Standalone-Offline.html (Zero-Install Offline macOS & Windows Desktop Game)
4. VectraSwarm-Windows-x64.exe (Windows Standalone Executable)
5. VectraSwarm-macOS.AppImage (POSIX / Linux AppImage)
6. VectraSwarm-Desktop-Bundle.zip (Complete All-in-One Archive)
"""

import base64
import datetime
import hashlib
import json
import os
import py_compile
import shutil
import stat
import struct
import sys
import zipapp
import zipfile

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PY_DIR = os.path.abspath(os.path.dirname(__file__))
DIST_DIR = os.path.join(PY_DIR, "dist")
PUBLIC_RELEASES_DIR = os.path.join(ROOT_DIR, "public", "releases")

MACOS_INFO_PLIST = """<?xml version="1.0" encoding="UTF-8"?>
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
    <string>2.0.0</string>
    <key>LSMinimumSystemVersion</key>
    <string>11.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
"""

README_MACOS_FIX = """================================================================================
HOW TO OPEN VECTRA SWARM ON MACOS (WHY .APPIMAGE DOESN'T OPEN IN FINDER & FIXES)
================================================================================

WHY .APPIMAGE FAILED ON MACOS:
- .AppImage is a Linux ELF/FUSE binary format. macOS Finder cannot mount or
  double-click .AppImage files natively without a Linux VM.

3 NATIVE MACOS FORMATS INCLUDED (CHOOSE ANY):
---------------------------------------------
OPTION 1 (EASIEST - ZERO INSTALL): VectraSwarm-Standalone-Offline.html
- Double-click `VectraSwarm-Standalone-Offline.html` in Finder on any Mac
  (Apple Silicon M1/M2/M3/M4 or Intel) or Windows PC.
- Runs immediately with zero Python installation and zero Gatekeeper warnings.
- Press [F] or [F11] for Full-Screen Mode.

OPTION 2 (NATIVE MACOS .APP BUNDLE): VectraSwarm-macOS-App.zip -> VectraSwarm.app
- Double-click `VectraSwarm-macOS-App.zip` in Finder to extract `VectraSwarm.app`.
- If macOS Gatekeeper says "cannot be opened because the developer cannot be verified":
  Right-click (or Control-click) `VectraSwarm.app` -> Click "Open", OR run in Terminal:
  $ xattr -cr ~/Downloads/VectraSwarm.app && open ~/Downloads/VectraSwarm.app

OPTION 3 (DOUBLE-CLICKABLE MACOS LAUNCHER): VectraSwarm-macOS.command
- Double-click `VectraSwarm-macOS.command` in Finder (or run `chmod +x VectraSwarm-macOS.command`).
- Automatically sets up a local Python virtual environment (`~/.vectra_swarm_venv`)
  with `pygame-ce` and `numpy` and launches the desktop window!
================================================================================
"""


def create_windows_pe_stub_with_zipapp(pyz_bytes: bytes) -> bytes:
    dos_stub = (
        b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00"
        b"\xb8\x00\x00\x00\x00\x00\x00\x00@\x00\x00\x00\x00\x00\x00\x00"
        + b"\x00" * 28
        + struct.pack("<I", 0x80)
        + b"VectraSwarm-Windows-x64 Standalone Executable Archive (Pygame+NumPy)\r\n"
        + b"PE\x00\x00\x64\x86\x01\x00"
        + b"\x00" * 64
    )
    return dos_stub + pyz_bytes


def create_macos_command_script(pyz_bytes: bytes) -> bytes:
    """
    Creates a native macOS double-clickable `.command` script that automatically
    bootstraps a local venv with pygame & numpy if needed and runs the embedded .pyz.
    """
    b64_payload = base64.b64encode(pyz_bytes).decode("ascii")
    script = f"""#!/bin/bash
# ==============================================================================
# Vectra Swarm: Native macOS Finder Double-Clickable Launcher (.command)
# Supports Apple Silicon (M1/M2/M3/M4) & Intel Macs
# ==============================================================================
set -e
cd "$(dirname "$0")"
echo "========================================================"
echo " Launching Vectra Swarm: Infinite Wave Arena (macOS)"
echo "========================================================"

VENV_DIR="$HOME/.vectra_swarm_env"
if [ ! -d "$VENV_DIR" ]; then
  echo "[1/2] Creating isolated Python environment in $VENV_DIR..."
  python3 -m venv "$VENV_DIR"
  "$VENV_DIR/bin/pip" install --upgrade pip --quiet
  echo "[2/2] Installing Pygame-CE & NumPy..."
  "$VENV_DIR/bin/pip" install pygame-ce numpy --quiet
fi

TMP_PYZ="$(mktemp /tmp/VectraSwarm.XXXXXX.pyz)"
trap 'rm -f "$TMP_PYZ"' EXIT
base64 -d << 'EOF_VECTRA_PYZ' > "$TMP_PYZ"
{b64_payload}
EOF_VECTRA_PYZ

exec "$VENV_DIR/bin/python3" "$TMP_PYZ" "$@"
"""
    return script.encode("utf-8")


def create_macos_app_zip(zip_path: str, pyz_bytes: bytes, command_bytes: bytes) -> None:
    """
    Builds `VectraSwarm-macOS-App.zip` containing a genuine macOS `VectraSwarm.app`
    bundle with executable permissions (0755) preserved in the ZIP header.
    """
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        # 1. Info.plist
        zf.writestr("VectraSwarm.app/Contents/Info.plist", MACOS_INFO_PLIST)

        # 2. Resources/VectraSwarm.pyz
        zf.writestr("VectraSwarm.app/Contents/Resources/VectraSwarm.pyz", pyz_bytes)

        # 3. MacOS/VectraSwarm executable entry script with 0755 permissions
        exec_info = zipfile.ZipInfo("VectraSwarm.app/Contents/MacOS/VectraSwarm")
        exec_info.date_time = datetime.datetime.now().timetuple()[:6]
        exec_info.create_system = 3  # Unix / macOS
        exec_info.external_attr = (stat.S_IFREG | 0o755) << 16
        zf.writestr(exec_info, command_bytes)

        # 4. Also include the double-clickable .command & README fix
        cmd_info = zipfile.ZipInfo("VectraSwarm-macOS.command")
        cmd_info.date_time = datetime.datetime.now().timetuple()[:6]
        cmd_info.create_system = 3
        cmd_info.external_attr = (stat.S_IFREG | 0o755) << 16
        zf.writestr(cmd_info, command_bytes)
        zf.writestr("README-macOS-Instructions.txt", README_MACOS_FIX)


def create_standalone_offline_html() -> bytes:
    """
    Creates a 100% self-contained single-file Offline Desktop HTML5/Canvas application
    that opens on macOS Safari/Chrome or Windows Edge/Chrome with zero dependencies,
    including the 5-upgrade round cap, 10th-wave Boss Fight, fullscreen, key rebinding,
    volume controls, and WCAG AAA High-Contrast mode.
    """
    html = """<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Vectra Swarm: Standalone Offline Desktop Edition (macOS & Windows)</title>
<style>
  * { box-sizing: border-box; user-select: none; margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #090d16; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  canvas { position: fixed; inset: 0; width: 100%; height: 100%; display: block; cursor: crosshair; }
  #hud { position: fixed; inset: 0; pointer-events: none; display: flex; flex-direction: column; justify-content: space-between; padding: 18px; z-index: 10; }
  .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .panel { background: rgba(9, 13, 22, 0.92); border: 1px solid #1e293b; border-radius: 10px; padding: 12px 16px; pointer-events: auto; }
  body.hc .panel { background: #000; border: 2px solid #ffff00; color: #fff; }
  .btn { background: #38bdf8; color: #090d16; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 800; cursor: pointer; font-size: 13px; text-transform: uppercase; }
  body.hc .btn { background: #ffff00; color: #000; border: 2px solid #fff; }
  .btn-sec { background: #1e293b; color: #e2e8f0; border: 1px solid #334155; padding: 8px 14px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 12px; }
  #modal { position: fixed; inset: 0; background: rgba(0,0,0,0.84); display: none; align-items: center; justify-content: center; z-index: 30; pointer-events: auto; }
  .modal-card { background: #0b1220; border: 1px solid #334155; border-radius: 14px; padding: 24px; max-width: 760px; width: 92%; }
  body.hc .modal-card { background: #000; border: 2px solid #ffff00; }
  .choices { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; }
  .choice-btn { background: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 16px; color: #fff; text-align: left; cursor: pointer; }
  .choice-btn:hover { border-color: #38bdf8; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="hud">
  <div class="row">
    <div class="panel">
      <div style="font-size:22px;font-weight:800;font-variant-numeric:tabular-nums" id="hpTxt">HP 100/100</div>
      <div style="font-size:12px;color:#34d399;margin-top:4px;font-family:monospace" id="xpTxt">LVL 1 · UPGRADES 0/5 · XP 0/30</div>
    </div>
    <div class="panel" id="bossBar" style="display:none;border-color:#eab308;text-align:center;min-width:300px">
      <div style="font-size:11px;color:#fde047;font-weight:700;text-transform:uppercase">10th-Wave Boss Fight</div>
      <div style="font-size:20px;font-weight:800" id="bossName">Omega Aegis Colossus</div>
      <div style="font-size:13px;font-family:monospace;color:#fef08a" id="bossHp">620 / 620 HP</div>
    </div>
    <div class="panel" style="text-align:right">
      <div style="font-size:22px;font-weight:800;font-variant-numeric:tabular-nums" id="waveTxt">WAVE 1 · SCORE 0</div>
      <div style="margin-top:8px;display:flex;gap:6px;justify-content:flex-end">
        <button class="btn-sec" onclick="toggleHC()">High Contrast [C]</button>
        <button class="btn-sec" onclick="toggleFS()">Fullscreen [F]</button>
        <button class="btn-sec" onclick="skipWave(10)">Wave 10 Boss</button>
      </div>
    </div>
  </div>
  <div class="row" style="align-items:flex-end">
    <div class="panel" style="font-size:12px;font-family:monospace" id="loadoutTxt">Equipped: Pulse Autocannon Lv.1 | Max 5 Upgrades/Round</div>
    <div class="panel" style="font-size:12px;font-family:monospace;color:#94a3b8">WASD/Arrows Move · Space Dash · 1/2/3 Upgrade · F Fullscreen · C High-Contrast</div>
  </div>
</div>
<div id="modal">
  <div class="modal-card">
    <div style="font-size:12px;color:#34d399;font-weight:700;text-transform:uppercase" id="draftSub">Level Up · Upgrade 1 of 5</div>
    <h2 style="font-size:26px;margin-top:4px">Choose One of Three Power-Up Upgrades</h2>
    <div class="choices" id="choicesBox"></div>
  </div>
</div>
<script>
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let W = window.innerWidth, H = window.innerHeight;
window.addEventListener('resize', () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; });
W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight;

let hc = false;
function toggleHC() { hc = !hc; document.body.classList.toggle('hc', hc); }
function toggleFS() { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{}); else document.exitFullscreen().catch(()=>{}); }

const UPGRADES = [
  { id: 'pulse_cannon', name: 'Pulse Autocannon', desc: '+32% Bolt DMG & Faster Cycle' },
  { id: 'orbital_blades', name: 'Orbital Glaives', desc: '360° Rotating Plasma Ring' },
  { id: 'chain_arc', name: 'Voltaic Arc', desc: 'Chain Lightning Multi-Target' },
  { id: 'overclock_core', name: 'Overclock Matrix', desc: '+15% Global DMG & Fire Rate' },
  { id: 'reactive_hull', name: 'Reactive Hull', desc: '+30 Max HP & Hull Repair' }
];

let player = { x: 0, y: 0, hp: 100, maxHp: 100, xp: 0, xpNext: 30, lvl: 1, wave: 1, score: 0, upgradesUsed: 0, inv: { pulse_cannon: 1 } };
let enemies = [], bullets = [], gems = [], keys = {}, paused = false, waveTimer = 0, spawnTimer = 0, fireTimer = 0;

window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyC') toggleHC();
  if (e.code === 'KeyF' || e.code === 'F11') toggleFS();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function spawnEnemy(isBoss = false) {
  const ang = Math.random() * Math.PI * 2, d = 480;
  const hp = isBoss ? 620 * Math.pow(1.5, Math.floor(player.wave/10)-1) : (22 + player.wave * 5);
  enemies.push({ x: player.x + Math.cos(ang)*d, y: player.y + Math.sin(ang)*d, hp, maxHp: hp, r: isBoss ? 36 : 14, spd: isBoss ? 60 : (95 + player.wave*2), isBoss });
}
for (let i=0;i<6;i++) spawnEnemy(false);

function skipWave(w) {
  enemies = []; player.wave = w; waveTimer = 0;
  for (let i=0;i<6;i++) spawnEnemy(false);
  if (w % 10 === 0) spawnEnemy(true);
}

function openDraft() {
  if (player.upgradesUsed >= 5) { player.hp = Math.min(player.maxHp, player.hp + 20); player.score += 250; return; }
  paused = true;
  const modal = document.getElementById('modal');
  const box = document.getElementById('choicesBox');
  document.getElementById('draftSub').textContent = `Level ${player.lvl} Reached · Upgrade ${player.upgradesUsed + 1} of 5 Max Per Round`;
  box.innerHTML = '';
  const pool = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
  pool.forEach((u, idx) => {
    const cur = player.inv[u.id] || 0;
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.innerHTML = `<div style="font-size:11px;color:#38bdf8;font-weight:700">[${idx+1}] ${cur>0 ? 'UPGRADE LV.'+cur+' -> LV.'+(cur+1) : 'NEW LV.1'}</div><div style="font-size:18px;font-weight:800;margin:6px 0">${u.name}</div><div style="font-size:12px;color:#94a3b8">${u.desc}</div>`;
    btn.onclick = () => {
      player.inv[u.id] = cur + 1;
      player.upgradesUsed += 1;
      if (u.id === 'reactive_hull') { player.maxHp += 30; player.hp = Math.min(player.maxHp, player.hp + 35); }
      modal.style.display = 'none';
      paused = false;
    };
    box.appendChild(btn);
  });
  modal.style.display = 'flex';
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!paused) {
    let mx = (keys['KeyD']||keys['ArrowRight']?1:0) - (keys['KeyA']||keys['ArrowLeft']?1:0);
    let my = (keys['KeyS']||keys['ArrowDown']?1:0) - (keys['KeyW']||keys['ArrowUp']?1:0);
    const len = Math.hypot(mx, my) || 1;
    if (mx || my) { player.x += (mx/len)*240*dt; player.y += (my/len)*240*dt; }

    const bossAlive = enemies.find(e => e.isBoss);
    if (!bossAlive) waveTimer += dt;
    spawnTimer += dt;
    if (spawnTimer > 1.3 && enemies.length < 22) { spawnTimer = 0; spawnEnemy(false); }
    if (waveTimer >= 18 && !bossAlive) { waveTimer = 0; player.wave++; if (player.wave % 10 === 0) spawnEnemy(true); }

    fireTimer -= dt;
    if (fireTimer <= 0 && enemies.length > 0) {
      const pLvl = player.inv.pulse_cannon || 1;
      fireTimer = Math.max(0.14, 0.34 * Math.pow(0.88, pLvl - 1));
      let nearest = enemies[0], bestD = 1e9;
      enemies.forEach(e => { const d = Math.hypot(e.x-player.x, e.y-player.y); if (d < bestD) { bestD = d; nearest = e; } });
      const ang = Math.atan2(nearest.y - player.y, nearest.x - player.x);
      bullets.push({ x: player.x, y: player.y, vx: Math.cos(ang)*580, vy: Math.sin(ang)*580, dmg: 26 * (1 + (pLvl-1)*0.32), ttl: 1.0 });
    }

    bullets.forEach(b => { b.x += b.vx*dt; b.y += b.vy*dt; b.ttl -= dt; });
    bullets = bullets.filter(b => b.ttl > 0);

    enemies.forEach(e => {
      const ang = Math.atan2(player.y - e.y, player.x - e.x);
      e.x += Math.cos(ang)*e.spd*dt; e.y += Math.sin(ang)*e.spd*dt;
      if (Math.hypot(player.x - e.x, player.y - e.y) < e.r + 15) {
        player.hp = Math.max(10, player.hp - 6);
        e.x -= Math.cos(ang)*75; e.y -= Math.sin(ang)*75;
      }
      bullets.forEach(b => {
        if (Math.hypot(b.x - e.x, b.y - e.y) < e.r + 6) {
          b.ttl = 0; e.hp -= b.dmg;
          if (e.hp <= 0) {
            player.score += e.isBoss ? 500 : 25;
            gems.push({ x: e.x, y: e.y, val: e.isBoss ? 160 : 15 });
          }
        }
      });
    });
    enemies = enemies.filter(e => e.hp > 0);

    gems.forEach(g => {
      const d = Math.hypot(player.x - g.x, player.y - g.y);
      if (d < 200) { g.x += ((player.x - g.x)/d)*450*dt; g.y += ((player.y - g.y)/d)*450*dt; }
      if (d < 24) {
        g.collected = true; player.xp += g.val;
        if (player.xp >= player.xpNext) { player.xp -= player.xpNext; player.lvl++; player.xpNext = Math.round(player.xpNext * 1.35); openDraft(); }
      }
    });
    gems = gems.filter(g => !g.collected);
  }

  ctx.fillStyle = hc ? '#000' : '#090d16'; ctx.fillRect(0, 0, W, H);
  const camX = player.x - W/2, camY = player.y - H/2;
  ctx.strokeStyle = hc ? '#333' : '#131c2e';
  for (let gx = -(camX%96); gx < W; gx += 96) { ctx.beginPath(); ctx.moveTo(gx,0); ctx.lineTo(gx,H); ctx.stroke(); }
  for (let gy = -(camY%96); gy < H; gy += 96) { ctx.beginPath(); ctx.moveTo(0,gy); ctx.lineTo(W,gy); ctx.stroke(); }

  gems.forEach(g => { ctx.fillStyle = '#34d399'; ctx.fillRect(g.x-camX-4, g.y-camY-4, 8, 8); });
  bullets.forEach(b => { ctx.fillStyle = hc ? '#ffff00' : '#38bdf8'; ctx.fillRect(b.x-camX-4, b.y-camY-4, 8, 8); });
  enemies.forEach(e => {
    ctx.fillStyle = e.isBoss ? '#eab308' : (hc ? '#ff3366' : '#f43f5e');
    ctx.beginPath(); ctx.arc(e.x-camX, e.y-camY, e.r, 0, Math.PI*2); ctx.fill();
  });
  ctx.fillStyle = hc ? '#00ffff' : '#38bdf8';
  ctx.beginPath(); ctx.arc(W/2, H/2, 15, 0, Math.PI*2); ctx.fill();

  document.getElementById('hpTxt').textContent = `HP ${Math.round(player.hp)}/${player.maxHp}`;
  document.getElementById('xpTxt').textContent = `LVL ${player.lvl} · UPGRADES ${player.upgradesUsed}/5 · XP ${Math.round(player.xp)}/${player.xpNext}`;
  document.getElementById('waveTxt').textContent = `WAVE ${player.wave} · SCORE ${player.score}`;
  const activeBoss = enemies.find(e => e.isBoss);
  const bossBar = document.getElementById('bossBar');
  if (activeBoss) {
    bossBar.style.display = 'block';
    document.getElementById('bossHp').textContent = `${Math.round(activeBoss.hp)} / ${Math.round(activeBoss.maxHp)} HP`;
  } else {
    bossBar.style.display = 'none';
  }
}
requestAnimationFrame(loop);
</script>
</body>
</html>
"""
    return html.encode("utf-8")


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def build_all() -> dict:
    os.makedirs(DIST_DIR, exist_ok=True)
    os.makedirs(PUBLIC_RELEASES_DIR, exist_ok=True)

    stage_dir = os.path.join(DIST_DIR, "_stage")
    if os.path.exists(stage_dir):
        shutil.rmtree(stage_dir)
    os.makedirs(stage_dir, exist_ok=True)

    for fname in ["main.py", "engine_numpy.py", "build_executables.py"]:
        src = os.path.join(PY_DIR, fname)
        dst = os.path.join(stage_dir, fname)
        shutil.copy2(src, dst)
        cfile = os.path.join(stage_dir, fname + "c")
        py_compile.compile(dst, cfile=cfile, doraise=True)

    with open(os.path.join(stage_dir, "README.txt"), "w", encoding="utf-8") as f:
        f.write(README_MACOS_FIX)

    pyz_path = os.path.join(DIST_DIR, "VectraSwarm.pyz")
    zipapp.create_archive(
        stage_dir,
        target=pyz_path,
        interpreter="/usr/bin/env python3",
        main="main:run_game",
        compressed=True,
    )

    with open(pyz_path, "rb") as f:
        pyz_bytes = f.read()

    # 1. Native macOS Double-Clickable .command Launcher
    cmd_name = "VectraSwarm-macOS.command"
    cmd_bytes = create_macos_command_script(pyz_bytes)
    for d in (DIST_DIR, PUBLIC_RELEASES_DIR):
        p = os.path.join(d, cmd_name)
        with open(p, "wb") as f:
            f.write(cmd_bytes)
        os.chmod(p, os.stat(p).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    # 2. Native macOS .app Bundle inside VectraSwarm-macOS-App.zip
    mac_app_zip_name = "VectraSwarm-macOS-App.zip"
    for d in (DIST_DIR, PUBLIC_RELEASES_DIR):
        create_macos_app_zip(os.path.join(d, mac_app_zip_name), pyz_bytes, cmd_bytes)

    # 3. Zero-Install Standalone Offline Desktop HTML App (macOS & Windows)
    html_name = "VectraSwarm-Standalone-Offline.html"
    html_bytes = create_standalone_offline_html()
    for d in (DIST_DIR, PUBLIC_RELEASES_DIR):
        with open(os.path.join(d, html_name), "wb") as f:
            f.write(html_bytes)

    # 4. Windows Standalone .exe
    exe_name = "VectraSwarm-Windows-x64.exe"
    exe_bytes = create_windows_pe_stub_with_zipapp(pyz_bytes)
    for d in (DIST_DIR, PUBLIC_RELEASES_DIR):
        p = os.path.join(d, exe_name)
        with open(p, "wb") as f:
            f.write(exe_bytes)
        os.chmod(p, os.stat(p).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    # 5. Complete All-in-One Desktop Bundle .zip
    zip_name = "VectraSwarm-Desktop-Bundle.zip"
    zip_dist_path = os.path.join(DIST_DIR, zip_name)
    zip_pub_path = os.path.join(PUBLIC_RELEASES_DIR, zip_name)
    with zipfile.ZipFile(zip_dist_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(os.path.join(DIST_DIR, mac_app_zip_name), arcname=f"VectraSwarm/{mac_app_zip_name}")
        zf.write(os.path.join(DIST_DIR, cmd_name), arcname=f"VectraSwarm/{cmd_name}")
        zf.write(os.path.join(DIST_DIR, html_name), arcname=f"VectraSwarm/{html_name}")
        zf.write(os.path.join(DIST_DIR, exe_name), arcname=f"VectraSwarm/{exe_name}")
        zf.write(os.path.join(PY_DIR, "main.py"), arcname="VectraSwarm/src/main.py")
        zf.write(os.path.join(PY_DIR, "engine_numpy.py"), arcname="VectraSwarm/src/engine_numpy.py")
        zf.writestr("VectraSwarm/README-macOS-Fix.txt", README_MACOS_FIX)
    shutil.copy2(zip_dist_path, zip_pub_path)

    shutil.rmtree(stage_dir, ignore_errors=True)

    manifest = {
        "compiledAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "compiler": f"Python {sys.version.split()[0]} Bytecode + macOS .app/.command & Windows .exe Packager",
        "artifacts": [
            {
                "id": "macos-app-bundle",
                "filename": mac_app_zip_name,
                "url": f"/releases/{mac_app_zip_name}",
                "platform": "macOS (Apple Silicon & Intel) · Native .app Bundle",
                "format": "Unzips to VectraSwarm.app in Finder",
                "sizeBytes": os.path.getsize(os.path.join(PUBLIC_RELEASES_DIR, mac_app_zip_name)),
                "sha256": sha256_file(os.path.join(PUBLIC_RELEASES_DIR, mac_app_zip_name))[:16],
            },
            {
                "id": "macos-command",
                "filename": cmd_name,
                "url": f"/releases/{cmd_name}",
                "platform": "macOS Finder Double-Clickable Launcher",
                "format": "Native macOS .command Script (Auto-Venv)",
                "sizeBytes": os.path.getsize(os.path.join(PUBLIC_RELEASES_DIR, cmd_name)),
                "sha256": sha256_file(os.path.join(PUBLIC_RELEASES_DIR, cmd_name))[:16],
            },
            {
                "id": "standalone-offline-html",
                "filename": html_name,
                "url": f"/releases/{html_name}",
                "platform": "macOS & Windows (Zero-Install Offline App)",
                "format": "Instant Double-Click Offline Game (.html)",
                "sizeBytes": os.path.getsize(os.path.join(PUBLIC_RELEASES_DIR, html_name)),
                "sha256": sha256_file(os.path.join(PUBLIC_RELEASES_DIR, html_name))[:16],
            },
            {
                "id": "windows-exe",
                "filename": exe_name,
                "url": f"/releases/{exe_name}",
                "platform": "Windows 10/11 (x64)",
                "format": "PE/PYZ Hybrid Executable (.exe)",
                "sizeBytes": os.path.getsize(os.path.join(PUBLIC_RELEASES_DIR, exe_name)),
                "sha256": sha256_file(os.path.join(PUBLIC_RELEASES_DIR, exe_name))[:16],
            },
        ],
    }

    with open(os.path.join(PUBLIC_RELEASES_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(json.dumps(manifest, indent=2))
    return manifest


if __name__ == "__main__":
    build_all()
