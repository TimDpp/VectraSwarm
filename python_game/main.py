#!/usr/bin/env python3
"""
Vectra Swarm: Infinite Wave Arena (Pygame + NumPy Standalone Desktop Window)
Runs as a native SDL2/Pygame desktop window without any web browser.
Features:
- Infinite map with modular coordinate grid & sector beacons
- NumPy vectorized SoA entity physics, distance-matrix collisions & XP gem magnetization
- 1 initial power-up at round start + maximum of 5 upgrades per round (3 random choices per level-up)
- Upgrading owned power-ups increases level & effectiveness stats
- Balanced difficulty curve + new enemy archetype every 5th wave
- Boss Fight at the end of every 10th wave (Wave 10, 20, 30...) with Boss Health Bar
- Full-screen toggle (F / F11), customizable keyboard controls (key rebinding),
  volume settings, and WCAG High-Contrast accessibility mode.
"""

import json
import math
import os
import sys

try:
    import numpy as np
    import pygame
except ImportError:
    print("Installing required standalone desktop dependencies (pygame-ce, numpy)...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", "pygame-ce", "numpy"])
    import numpy as np
    import pygame

from engine_numpy import (
    FIFTH_WAVE_ENEMY_NAMES,
    MAX_UPGRADES_PER_ROUND,
    POWER_UP_DEFS,
    VectorizedArenaEngine,
)

CONFIG_FILE = os.path.join(os.path.expanduser("~"), ".vectra_swarm_settings.json")

DEFAULT_SETTINGS = {
    "master_volume": 80,
    "sfx_volume": 85,
    "music_volume": 60,
    "muted": False,
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


def load_settings() -> dict:
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                merged = {**DEFAULT_SETTINGS, **data}
                merged["keybindings"] = {
                    **DEFAULT_SETTINGS["keybindings"],
                    **data.get("keybindings", {}),
                }
                return merged
        except Exception:
            pass
    return json.loads(json.dumps(DEFAULT_SETTINGS))


def save_settings(settings: dict) -> None:
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2)
    except Exception:
        pass


def make_beep_sound(freq: float, duration_ms: int, volume: float) -> "pygame.mixer.Sound":
    sample_rate = 44100
    n_samples = int(sample_rate * (duration_ms / 1000.0))
    t = np.linspace(0, duration_ms / 1000.0, n_samples, endpoint=False)
    envelope = np.exp(-t * 18.0)
    wave = (np.sin(2.0 * np.pi * freq * t) * envelope * 32767 * volume).astype(np.int16)
    stereo = np.column_stack((wave, wave))
    return pygame.sndarray.make_sound(stereo)


def run_game() -> None:
    pygame.init()
    try:
        pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=512)
        audio_ok = True
    except Exception:
        audio_ok = False

    settings = load_settings()
    flags = pygame.FULLSCREEN if settings["fullscreen"] else pygame.RESIZABLE
    screen = pygame.display.set_mode((1280, 780), flags)
    pygame.display.set_caption("Vectra Swarm: Infinite Wave Arena (Standalone Desktop Window)")
    clock = pygame.time.Clock()

    font_xl = pygame.font.SysFont("avenirnext,bahnschrift,helvetica,arial", 46, bold=True)
    font_lg = pygame.font.SysFont("avenirnext,bahnschrift,helvetica,arial", 28, bold=True)
    font_md = pygame.font.SysFont("avenirnext,bahnschrift,helvetica,arial", 19, bold=True)
    font_sm = pygame.font.SysFont("menlo,consolas,monospace", 14)

    engine = VectorizedArenaEngine()
    state = "MENU"  # MENU, PLAYING, LEVEL_UP, PAUSED, SETTINGS, GAME_OVER
    rebind_action = None
    current_choices = []
    starter_options = ["pulse_cannon", "orbital_blades", "chain_arc"]
    starter_idx = 0
    wave_timer = 0.0
    spawn_timer = 0.0
    dash_cd = 0.0
    fire_cd = 0.0
    invuln_timer = 0.0
    orbital_angle = 0.0
    banner_text = ""
    banner_timer = 0.0

    def play_tone(freq: float, dur: int = 75) -> None:
        if not audio_ok or settings.get("muted"):
            return
        vol = (settings["master_volume"] / 100.0) * (settings["sfx_volume"] / 100.0) * 0.35
        if vol > 0.01:
            try:
                snd = make_beep_sound(freq, dur, vol)
                snd.play()
            except Exception:
                pass

    def spawn_wave_enemies(wave_num: int, count: int = 6) -> None:
        free_slots = np.flatnonzero(~engine.enemy_active)
        actual = min(count, free_slots.size)
        if actual <= 0:
            return
        angles = np.random.uniform(0, 2 * np.pi, size=actual).astype(np.float32)
        dists = np.random.uniform(460, 660, size=actual).astype(np.float32)
        slots = free_slots[:actual]
        engine.enemy_pos[slots, 0] = engine.player_pos[0] + np.cos(angles) * dists
        engine.enemy_pos[slots, 1] = engine.player_pos[1] + np.sin(angles) * dists

        max_type = min(6, 2 + (wave_num // 5))
        types = np.random.randint(0, max_type + 1, size=actual, dtype=np.int32)
        if wave_num % 5 == 0 and actual > 0:
            types[0] = max_type
        engine.enemy_type[slots] = types
        engine.enemy_is_boss[slots] = False
        hp_mult = 1.0 + (wave_num - 1) * 0.14
        base_hps = np.array([22, 20, 38, 68, 165, 140, 380], dtype=np.float32)[types] * hp_mult
        engine.enemy_hp[slots] = base_hps
        engine.enemy_max_hp[slots] = base_hps
        engine.enemy_radius[slots] = np.array([13, 14, 17, 18, 25, 20, 32], dtype=np.float32)[types]
        engine.enemy_speed[slots] = np.array([102, 86, 82, 118, 64, 98, 56], dtype=np.float32)[types] * (
            1.0 + min(0.45, (wave_num - 1) * 0.022)
        )
        engine.enemy_active[slots] = True

    def start_new_round() -> None:
        nonlocal engine, wave_timer, spawn_timer, dash_cd, fire_cd, invuln_timer, banner_text, banner_timer, state
        engine = VectorizedArenaEngine()
        engine.inventory = {starter_options[starter_idx]: 1}
        spawn_wave_enemies(1, 6)
        wave_timer = 0.0
        spawn_timer = 0.0
        dash_cd = 0.0
        fire_cd = 0.0
        invuln_timer = 0.0
        banner_text = "ROUND STARTED · 1 STARTER EQUIPPED · MAX 5 UPGRADES THIS ROUND"
        banner_timer = 3.5
        state = "PLAYING"
        play_tone(520, 90)

    def advance_to_wave(target_wave: int) -> None:
        nonlocal wave_timer, banner_text, banner_timer
        engine.wave = target_wave
        wave_timer = 0.0
        spawn_wave_enemies(engine.wave, 5 + min(10, engine.wave))
        if engine.wave % 10 == 0:
            engine.spawn_tenth_wave_boss(engine.wave)
            boss_name = "Omega Aegis Colossus" if engine.wave == 10 else f"Apex Dreadnought Mk.{engine.wave // 10}"
            banner_text = f"WAVE {engine.wave} BOSS FIGHT: {boss_name.upper()}!"
            banner_timer = 5.0
            play_tone(220, 240)
        elif engine.wave % 5 == 0:
            challenger = FIFTH_WAVE_ENEMY_NAMES.get(engine.wave, f"Ascendant Tier Mk.{engine.wave // 5}")
            banner_text = f"WAVE {engine.wave} CHALLENGER UNLOCKED: {challenger}"
            banner_timer = 4.5
            play_tone(310, 160)

    running = True
    while running:
        dt = min(clock.tick(60) / 1000.0, 0.05)
        w, h = screen.get_size()
        hc = settings["high_contrast"]

        bg_col = (0, 0, 0) if hc else (9, 13, 22)
        fg_col = (255, 255, 255) if hc else (248, 250, 252)
        accent_col = (255, 255, 0) if hc else (56, 189, 248)
        card_col = (12, 12, 12) if hc else (15, 23, 42)
        border_col = (255, 255, 0) if hc else (51, 65, 85)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if rebind_action:
                    settings["keybindings"][rebind_action] = event.key
                    save_settings(settings)
                    rebind_action = None
                    play_tone(660, 60)
                    continue

                kb = settings["keybindings"]
                if event.key == kb["fullscreen"] or event.key == pygame.K_F11:
                    settings["fullscreen"] = not settings["fullscreen"]
                    save_settings(settings)
                    flags = pygame.FULLSCREEN if settings["fullscreen"] else pygame.RESIZABLE
                    screen = pygame.display.set_mode((1280, 780), flags)

                if state == "MENU":
                    if event.key in (pygame.K_RETURN, pygame.K_SPACE):
                        start_new_round()
                    elif event.key in (pygame.K_1, pygame.K_2, pygame.K_3):
                        starter_idx = event.key - pygame.K_1
                        play_tone(440, 50)
                    elif event.key == pygame.K_s:
                        state = "SETTINGS"
                    elif event.key == pygame.K_c:
                        settings["high_contrast"] = not settings["high_contrast"]
                        save_settings(settings)
                elif state == "SETTINGS":
                    if event.key == pygame.K_ESCAPE:
                        state = "MENU"
                    elif event.key == pygame.K_c:
                        settings["high_contrast"] = not settings["high_contrast"]
                        save_settings(settings)
                    elif event.key == pygame.K_m:
                        settings["muted"] = not settings["muted"]
                        save_settings(settings)
                    elif event.key == pygame.K_UP:
                        settings["master_volume"] = min(100, settings["master_volume"] + 10)
                        save_settings(settings)
                    elif event.key == pygame.K_DOWN:
                        settings["master_volume"] = max(0, settings["master_volume"] - 10)
                        save_settings(settings)
                    elif event.key in (pygame.K_1, pygame.K_2, pygame.K_3, pygame.K_4, pygame.K_5):
                        actions = ["up", "down", "left", "right", "dash"]
                        rebind_action = actions[event.key - pygame.K_1]
                elif state == "PLAYING":
                    if event.key == kb["pause"]:
                        state = "PAUSED"
                    elif event.key == kb["dash"] and dash_cd <= 0.0:
                        dash_cd = 1.25
                        invuln_timer = max(invuln_timer, 0.35)
                        play_tone(320, 80)
                    elif event.key == pygame.K_l:
                        if engine.can_draft_upgrade():
                            engine.level += 1
                            current_choices = engine.roll_three_upgrades()
                            state = "LEVEL_UP"
                    elif event.key == pygame.K_n:
                        next_milestone = ((engine.wave // 5) + 1) * 5
                        advance_to_wave(next_milestone)
                elif state == "PAUSED":
                    if event.key == kb["pause"] or event.key == pygame.K_RETURN:
                        state = "PLAYING"
                    elif event.key == pygame.K_s:
                        state = "SETTINGS"
                    elif event.key == pygame.K_q:
                        state = "MENU"
                elif state == "LEVEL_UP":
                    if event.key in (pygame.K_1, pygame.K_2, pygame.K_3):
                        idx = event.key - pygame.K_1
                        if idx < len(current_choices):
                            engine.apply_upgrade(current_choices[idx].power_id)
                            play_tone(780, 110)
                            state = "PLAYING"
                elif state == "GAME_OVER":
                    if event.key in (pygame.K_RETURN, pygame.K_SPACE):
                        start_new_round()
                    elif event.key == pygame.K_ESCAPE:
                        state = "MENU"

        screen.fill(bg_col)

        # Simulation Update
        if state == "PLAYING":
            keys = pygame.key.get_pressed()
            kb = settings["keybindings"]
            move = np.array(
                [
                    float(keys[kb["right"]] or keys[pygame.K_RIGHT])
                    - float(keys[kb["left"]] or keys[pygame.K_LEFT]),
                    float(keys[kb["down"]] or keys[pygame.K_DOWN])
                    - float(keys[kb["up"]] or keys[pygame.K_UP]),
                ],
                dtype=np.float32,
            )
            norm = float(np.linalg.norm(move))
            dash_cd = max(0.0, dash_cd - dt)
            invuln_timer = max(0.0, invuln_timer - dt)
            orbital_angle += dt * 3.2
            if norm > 0:
                speed_lvl = engine.inventory.get("kinetic_thrusters", 0)
                dash_mult = 2.4 if dash_cd > 1.0 else 1.0
                spd = 245.0 * (1.0 + speed_lvl * 0.14) * dash_mult
                engine.player_pos += (move / norm) * spd * dt

            overclock_lvl = engine.inventory.get("overclock_core", 0)
            dmg_mult = 1.0 + overclock_lvl * 0.15
            rate_mult = 1.0 + overclock_lvl * 0.09

            # Auto-fire nearest enemy
            fire_cd -= dt * rate_mult
            active_e = np.flatnonzero(engine.enemy_active)
            if fire_cd <= 0.0 and active_e.size > 0:
                pulse_lvl = max(1, engine.inventory.get("pulse_cannon", 1))
                fire_cd = max(0.14, 0.34 * (0.88 ** (pulse_lvl - 1)))
                deltas = engine.enemy_pos[active_e] - engine.player_pos
                d2 = np.sum(deltas * deltas, axis=1)
                nearest = active_e[int(np.argmin(d2))]
                vec = engine.enemy_pos[nearest] - engine.player_pos
                vlen = float(np.linalg.norm(vec)) + 1e-6
                free_p = np.flatnonzero(~engine.proj_active)
                bolts = 1 + (pulse_lvl // 2)
                for b_idx in range(min(bolts, free_p.size)):
                    pi = free_p[b_idx]
                    spread = (b_idx - (bolts - 1) / 2.0) * 0.12
                    base_ang = math.atan2(float(vec[1]), float(vec[0])) + spread
                    engine.proj_pos[pi] = engine.player_pos.copy()
                    engine.proj_vel[pi] = np.array(
                        [math.cos(base_ang) * 580.0, math.sin(base_ang) * 580.0], dtype=np.float32
                    )
                    engine.proj_dmg[pi] = 26.0 * (1.0 + (pulse_lvl - 1) * 0.32) * dmg_mult
                    engine.proj_ttl[pi] = 1.05
                    engine.proj_active[pi] = True
                play_tone(480, 35)

            # Orbital Glaives damage
            blade_lvl = engine.inventory.get("orbital_blades", 0)
            if blade_lvl > 0 and active_e.size > 0:
                blade_count = 2 + ((blade_lvl + 1) // 2)
                orbit_r = 92.0 + (blade_lvl - 1) * 12.0
                for b_i in range(blade_count):
                    ang = orbital_angle + (b_i * 2.0 * math.pi / blade_count)
                    bx = engine.player_pos[0] + math.cos(ang) * orbit_r
                    by = engine.player_pos[1] + math.sin(ang) * orbit_r
                    b_diff = engine.enemy_pos[active_e] - np.array([bx, by], dtype=np.float32)
                    b_hit = np.sum(b_diff * b_diff, axis=1) <= (engine.enemy_radius[active_e] + 16.0) ** 2
                    for ei in active_e[b_hit]:
                        engine.enemy_hp[ei] -= (18.0 * (1.0 + (blade_lvl - 1) * 0.34) * dmg_mult) * dt * 8.0

            # Enemy <-> Player Contact with Knockback
            if invuln_timer <= 0.0 and active_e.size > 0:
                p_diff = engine.enemy_pos[active_e] - engine.player_pos
                p_dist = np.linalg.norm(p_diff, axis=1)
                touching = active_e[p_dist <= (engine.enemy_radius[active_e] + 15.0)]
                if touching.size > 0:
                    hull_lvl = engine.inventory.get("reactive_hull", 0)
                    mitigation = min(0.5, hull_lvl * 0.06)
                    raw_dmg = 16.0 if np.any(engine.enemy_is_boss[touching]) else 7.0
                    engine.player_hp -= max(2.0, raw_dmg * (1.0 - mitigation))
                    invuln_timer = 0.65
                    # Knockback enemies away
                    for ti in touching:
                        v = engine.enemy_pos[ti] - engine.player_pos
                        vl = float(np.linalg.norm(v)) + 1e-6
                        engine.enemy_pos[ti] += (v / vl) * 85.0
                    play_tone(150, 110)
                    if engine.player_hp <= 0.0:
                        engine.player_hp = 0.0
                        state = "GAME_OVER"

            boss_indices = np.flatnonzero(engine.enemy_active & engine.enemy_is_boss)
            boss_alive = boss_indices.size > 0

            if not boss_alive:
                wave_timer += dt
            spawn_timer += dt
            if spawn_timer >= max(0.38, 1.45 * (0.94 ** (engine.wave - 1))):
                spawn_timer = 0.0
                if np.count_nonzero(engine.enemy_active) < 28 + engine.wave * 2:
                    spawn_wave_enemies(engine.wave, 2)

            if wave_timer >= min(34.0, 18.0 + engine.wave * 1.1) and not boss_alive:
                advance_to_wave(engine.wave + 1)

            kills, leveled = engine.step_simulation(dt)
            if leveled:
                current_choices = engine.roll_three_upgrades()
                if len(current_choices) > 0:
                    play_tone(880, 140)
                    state = "LEVEL_UP"

        # Render Infinite Grid
        cam_x = float(engine.player_pos[0]) - w / 2.0
        cam_y = float(engine.player_pos[1]) - h / 2.0
        grid_step = 96
        g_col = (70, 70, 70) if hc else (20, 30, 48)
        for gx in range(int(-cam_x % grid_step), w, grid_step):
            pygame.draw.line(screen, g_col, (gx, 0), (gx, h), 2 if hc else 1)
        for gy in range(int(-cam_y % grid_step), h, grid_step):
            pygame.draw.line(screen, g_col, (0, gy), (w, gy), 2 if hc else 1)

        # Render XP Gems
        for gi in np.flatnonzero(engine.gem_active):
            gx = int(engine.gem_pos[gi, 0] - cam_x)
            gy = int(engine.gem_pos[gi, 1] - cam_y)
            pygame.draw.rect(screen, (0, 255, 102) if hc else (52, 211, 153), (gx - 4, gy - 4, 8, 8))

        # Render Active Enemies & Boss
        boss_slot = None
        for ei in np.flatnonzero(engine.enemy_active):
            ex = int(engine.enemy_pos[ei, 0] - cam_x)
            ey = int(engine.enemy_pos[ei, 1] - cam_y)
            r = int(engine.enemy_radius[ei])
            is_b = bool(engine.enemy_is_boss[ei])
            if is_b:
                boss_slot = int(ei)
                col = (255, 255, 0) if hc else (234, 179, 8)
                pygame.draw.circle(screen, col, (ex, ey), r + 6, 3)
            else:
                col = (255, 51, 102) if hc else (244, 63, 94)
            pygame.draw.circle(screen, col, (ex, ey), r)
            pygame.draw.circle(screen, (255, 255, 255), (ex, ey), r, 2 if hc or is_b else 1)

        # Render Orbital Glaives
        blade_lvl = engine.inventory.get("orbital_blades", 0)
        if blade_lvl > 0:
            blade_count = 2 + ((blade_lvl + 1) // 2)
            orbit_r = 92.0 + (blade_lvl - 1) * 12.0
            for b_i in range(blade_count):
                ang = orbital_angle + (b_i * 2.0 * math.pi / blade_count)
                bx = int(w // 2 + math.cos(ang) * orbit_r)
                by = int(h // 2 + math.sin(ang) * orbit_r)
                pygame.draw.circle(screen, (251, 191, 36), (bx, by), 9)

        # Render Projectiles
        for pi in np.flatnonzero(engine.proj_active):
            px = int(engine.proj_pos[pi, 0] - cam_x)
            py = int(engine.proj_pos[pi, 1] - cam_y)
            pygame.draw.circle(screen, accent_col, (px, py), 5)

        # Render Player
        p_col = (255, 255, 255) if invuln_timer > 0.1 else accent_col
        pygame.draw.circle(screen, p_col, (w // 2, h // 2), 16)
        pygame.draw.circle(screen, (255, 255, 255), (w // 2, h // 2), 16, 2)

        # Render Top HUD Bar
        upgrades_used = engine.upgrades_used_count()
        hud_rect = pygame.Rect(18, 16, 620, 44)
        pygame.draw.rect(screen, card_col, hud_rect, border_radius=8)
        pygame.draw.rect(screen, border_col, hud_rect, 1, border_radius=8)
        hud_str = (
            f"HP {int(engine.player_hp)}/{int(engine.player_max_hp)}   "
            f"WAVE {engine.wave}   LVL {engine.level}   "
            f"UPGRADES {upgrades_used}/{MAX_UPGRADES_PER_ROUND}   SCORE {engine.score}"
        )
        screen.blit(font_md.render(hud_str, True, fg_col), (30, 26))

        # Render 10th-Wave Boss Health Bar if Boss Active
        if boss_slot is not None:
            b_rect = pygame.Rect(w // 2 - 220, 70, 440, 54)
            pygame.draw.rect(screen, (20, 16, 8), b_rect, border_radius=8)
            pygame.draw.rect(screen, (234, 179, 8), b_rect, 2, border_radius=8)
            bhp = max(0.0, float(engine.enemy_hp[boss_slot]))
            bmax = max(1.0, float(engine.enemy_max_hp[boss_slot]))
            b_title = f"WAVE {engine.wave} BOSS · {int(bhp)} / {int(bmax)} HP"
            screen.blit(font_md.render(b_title, True, (254, 240, 138)), (b_rect.x + 16, b_rect.y + 8))
            bar_bg = pygame.Rect(b_rect.x + 16, b_rect.y + 34, 408, 10)
            bar_fg = pygame.Rect(b_rect.x + 16, b_rect.y + 34, int(408 * (bhp / bmax)), 10)
            pygame.draw.rect(screen, (50, 40, 20), bar_bg, border_radius=4)
            pygame.draw.rect(screen, (250, 204, 21), bar_fg, border_radius=4)

        if banner_timer > 0:
            banner_timer -= dt
            b_surf = font_md.render(banner_text, True, (255, 255, 0))
            screen.blit(b_surf, (w // 2 - b_surf.get_width() // 2, 134))

        # Bottom Controls Hint
        hint_surf = font_sm.render(
            "WASD/Arrows Move | Space Dash | [N] Skip to Milestone/Boss Wave | [L] Test Level-Up Draft | [F] Fullscreen | [ESC] Pause",
            True,
            (148, 163, 184),
        )
        screen.blit(hint_surf, (20, h - 28))

        # Overlay Screens
        if state == "MENU":
            overlay = pygame.Surface((w, h), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 215))
            screen.blit(overlay, (0, 0))
            t_surf = font_xl.render("VECTRA SWARM // STANDALONE DESKTOP", True, accent_col)
            screen.blit(t_surf, (80, 100))
            screen.blit(
                font_md.render(
                    "Native Pygame + NumPy Engine · 1 Starter + Max 5 Upgrades/Round · Boss Every 10th Wave",
                    True,
                    (148, 163, 184),
                ),
                (80, 162),
            )
            screen.blit(
                font_md.render(
                    "Select Starter Power-Up (Press 1, 2, or 3):  " + POWER_UP_DEFS[starter_options[starter_idx]][0],
                    True,
                    fg_col,
                ),
                (80, 230),
            )
            screen.blit(
                font_lg.render("[ENTER / SPACE] Launch Run     [S] Settings & Key Rebinding", True, accent_col),
                (80, 300),
            )
            screen.blit(
                font_md.render(
                    f"[C] Toggle High-Contrast Mode ({'ON' if hc else 'OFF'})     [F] Toggle Fullscreen",
                    True,
                    fg_col,
                ),
                (80, 360),
            )
        elif state == "SETTINGS":
            overlay = pygame.Surface((w, h), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 230))
            screen.blit(overlay, (0, 0))
            screen.blit(font_lg.render("SETTINGS, HIGH-CONTRAST & KEY REBINDING", True, accent_col), (80, 80))
            screen.blit(
                font_md.render(
                    f"[C] High-Contrast Mode: {'ON (WCAG AAA)' if hc else 'STANDARD'}   "
                    f"[UP/DOWN] Master Volume: {settings['master_volume']}%   [M] Mute: {settings['muted']}",
                    True,
                    fg_col,
                ),
                (80, 150),
            )
            kb = settings["keybindings"]
            binds_text = (
                f"Press [1-5] to Rebind -> [1] Up: {pygame.key.name(kb['up'])}  "
                f"[2] Down: {pygame.key.name(kb['down'])}  [3] Left: {pygame.key.name(kb['left'])}  "
                f"[4] Right: {pygame.key.name(kb['right'])}  [5] Dash: {pygame.key.name(kb['dash'])}"
            )
            screen.blit(font_sm.render(binds_text, True, fg_col), (80, 220))
            if rebind_action:
                screen.blit(
                    font_md.render(f"PRESS ANY KEY TO REBIND '{rebind_action.upper()}'...", True, (255, 255, 0)),
                    (80, 270),
                )
            screen.blit(font_md.render("Press [ESC] to Return to Main Menu", True, fg_col), (80, 340))
        elif state == "LEVEL_UP":
            overlay = pygame.Surface((w, h), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 220))
            screen.blit(overlay, (0, 0))
            screen.blit(
                font_lg.render(
                    f"LEVEL {engine.level} REACHED · UPGRADE {engine.upgrades_used_count() + 1} OF {MAX_UPGRADES_PER_ROUND} THIS ROUND",
                    True,
                    accent_col,
                ),
                (80, 90),
            )
            screen.blit(
                font_md.render("Press [1], [2], or [3] to Choose One of Three Power-Up Upgrades:", True, fg_col),
                (80, 132),
            )
            for idx, ch in enumerate(current_choices):
                rect = pygame.Rect(80 + idx * 360, 185, 335, 250)
                pygame.draw.rect(screen, card_col, rect, border_radius=10)
                pygame.draw.rect(screen, border_col, rect, 2, border_radius=10)
                tag = (
                    f"UPGRADE LV.{ch.current_level} -> LV.{ch.next_level}"
                    if ch.is_upgrade
                    else "NEW POWER-UP LV.1"
                )
                screen.blit(font_sm.render(f"[{idx + 1}] {tag}", True, accent_col), (rect.x + 18, rect.y + 22))
                screen.blit(font_md.render(ch.name, True, fg_col), (rect.x + 18, rect.y + 62))
                screen.blit(font_sm.render(ch.description[:42], True, fg_col), (rect.x + 18, rect.y + 112))
                screen.blit(
                    font_sm.render(f"Press [{idx + 1}] to Equip/Upgrade", True, (52, 211, 153)),
                    (rect.x + 18, rect.y + 195),
                )
        elif state == "PAUSED":
            overlay = pygame.Surface((w, h), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 210))
            screen.blit(overlay, (0, 0))
            screen.blit(font_xl.render("ARENA PAUSED", True, accent_col), (80, 160))
            screen.blit(
                font_lg.render("[ESC / ENTER] Resume   [S] Settings   [Q] Main Menu", True, fg_col),
                (80, 240),
            )
        elif state == "GAME_OVER":
            overlay = pygame.Surface((w, h), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 225))
            screen.blit(overlay, (0, 0))
            screen.blit(font_xl.render("HULL BREACHED // RUN COMPLETE", True, (244, 63, 94)), (80, 140))
            screen.blit(
                font_lg.render(
                    f"Final Score: {engine.score}   Wave Reached: {engine.wave}   Upgrades: {engine.upgrades_used_count()}/{MAX_UPGRADES_PER_ROUND}",
                    True,
                    fg_col,
                ),
                (80, 220),
            )
            screen.blit(
                font_lg.render("[ENTER / SPACE] Deploy Again     [ESC] Main Menu", True, accent_col),
                (80, 300),
            )

        pygame.display.flip()

    pygame.quit()
    sys.exit()


if __name__ == "__main__":
    run_game()
