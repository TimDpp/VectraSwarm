#!/usr/bin/env python3
"""
Pure-Python Tkinter Standalone Desktop Window Fallback for Vectra Swarm.
Opens a native desktop OS window (no web browser required) if Pygame is not available.
"""

import math
import random
import time
import tkinter as tk


def run_tk_window() -> None:
    root = tk.Tk()
    root.title("Vectra Swarm: Infinite Wave Arena (Standalone Desktop Window)")
    root.geometry("1180x740")
    root.configure(bg="#090d16")

    canvas = tk.Canvas(root, bg="#090d16", highlightthickness=0)
    canvas.pack(fill=tk.BOTH, expand=True)

    state = {
        "mode": "PLAYING",
        "hc": False,
        "fullscreen": False,
        "px": 0.0,
        "py": 0.0,
        "hp": 100,
        "max_hp": 100,
        "xp": 0,
        "xp_next": 30,
        "lvl": 1,
        "wave": 1,
        "score": 0,
        "upgrades": 0,
        "max_upgrades": 5,
        "inv": {"Pulse Autocannon": 1},
        "wave_timer": 0.0,
        "spawn_timer": 0.0,
        "fire_timer": 0.0,
    }
    keys_down = set()
    enemies = []
    bullets = []
    gems = []
    choices = []

    def spawn_enemy(is_boss: bool = False) -> None:
        ang = random.uniform(0, math.pi * 2)
        dist = 460.0
        hp = 620.0 if is_boss else (22.0 + state["wave"] * 5.0)
        enemies.append(
            {
                "x": state["px"] + math.cos(ang) * dist,
                "y": state["py"] + math.sin(ang) * dist,
                "hp": hp,
                "max_hp": hp,
                "r": 34 if is_boss else 14,
                "spd": 58.0 if is_boss else (96.0 + state["wave"] * 2.0),
                "boss": is_boss,
            }
        )

    for _ in range(6):
        spawn_enemy(False)

    def trigger_level_up() -> None:
        if state["upgrades"] >= state["max_upgrades"]:
            state["hp"] = min(state["max_hp"], state["hp"] + 25)
            state["score"] += 250
            return
        pool = [
            ("Pulse Autocannon", "+32% Bolt DMG & Faster Cycle"),
            ("Orbital Glaives", "360° Rotating Plasma Ring"),
            ("Voltaic Arc Emitter", "Chain Lightning Multi-Target"),
            ("Overclock Matrix", "+15% Global DMG & Fire Rate"),
            ("Reactive Hull Plating", "+30 Max HP & Hull Repair"),
        ]
        random.shuffle(pool)
        choices.clear()
        choices.extend(pool[:3])
        state["mode"] = "LEVEL_UP"

    def on_key_press(event: tk.Event) -> None:
        k = event.keysym.lower()
        keys_down.add(k)
        if k == "c":
            state["hc"] = not state["hc"]
        elif k in ("f", "f11"):
            state["fullscreen"] = not state["fullscreen"]
            root.attributes("-fullscreen", state["fullscreen"])
        elif k == "n" and state["mode"] == "PLAYING":
            state["wave"] = ((state["wave"] // 5) + 1) * 5
            state["wave_timer"] = 0.0
            if state["wave"] % 10 == 0:
                spawn_enemy(True)
        elif k == "l" and state["mode"] == "PLAYING":
            state["lvl"] += 1
            trigger_level_up()
        elif state["mode"] == "LEVEL_UP" and k in ("1", "2", "3"):
            idx = int(k) - 1
            if idx < len(choices):
                name, _ = choices[idx]
                state["inv"][name] = state["inv"].get(name, 0) + 1
                state["upgrades"] += 1
                if name == "Reactive Hull Plating":
                    state["max_hp"] += 30
                    state["hp"] = min(state["max_hp"], state["hp"] + 35)
                state["mode"] = "PLAYING"

    def on_key_release(event: tk.Event) -> None:
        keys_down.discard(event.keysym.lower())

    root.bind("<KeyPress>", on_key_press)
    root.bind("<KeyRelease>", on_key_release)

    last_t = [time.perf_counter()]

    def tick() -> None:
        now = time.perf_counter()
        dt = min(0.05, now - last_t[0])
        last_t[0] = now

        w = max(640, canvas.winfo_width())
        h = max(480, canvas.winfo_height())
        hc = state["hc"]

        if state["mode"] == "PLAYING":
            mx = (1.0 if ("d" in keys_down or "right" in keys_down) else 0.0) - (
                1.0 if ("a" in keys_down or "left" in keys_down) else 0.0
            )
            my = (1.0 if ("s" in keys_down or "down" in keys_down) else 0.0) - (
                1.0 if ("w" in keys_down or "up" in keys_down) else 0.0
            )
            mlen = math.hypot(mx, my) or 1.0
            if mx or my:
                state["px"] += (mx / mlen) * 240.0 * dt
                state["py"] += (my / mlen) * 240.0 * dt

            boss_alive = any(e["boss"] for e in enemies)
            if not boss_alive:
                state["wave_timer"] += dt
            state["spawn_timer"] += dt
            if state["spawn_timer"] >= 1.25 and len(enemies) < 24:
                state["spawn_timer"] = 0.0
                spawn_enemy(False)
            if state["wave_timer"] >= 18.0 and not boss_alive:
                state["wave_timer"] = 0.0
                state["wave"] += 1
                if state["wave"] % 10 == 0:
                    spawn_enemy(True)

            state["fire_timer"] -= dt
            if state["fire_timer"] <= 0.0 and enemies:
                p_lvl = state["inv"].get("Pulse Autocannon", 1)
                state["fire_timer"] = max(0.14, 0.34 * (0.88 ** (p_lvl - 1)))
                nearest = min(enemies, key=lambda e: math.hypot(e["x"] - state["px"], e["y"] - state["py"]))
                ang = math.atan2(nearest["y"] - state["py"], nearest["x"] - state["px"])
                bullets.append(
                    {
                        "x": state["px"],
                        "y": state["py"],
                        "vx": math.cos(ang) * 580.0,
                        "vy": math.sin(ang) * 580.0,
                        "dmg": 26.0 * (1.0 + (p_lvl - 1) * 0.32),
                        "ttl": 1.0,
                    }
                )

            for b in bullets:
                b["x"] += b["vx"] * dt
                b["y"] += b["vy"] * dt
                b["ttl"] -= dt
            bullets[:] = [b for b in bullets if b["ttl"] > 0]

            for e in enemies:
                ang = math.atan2(state["py"] - e["y"], state["px"] - e["x"])
                e["x"] += math.cos(ang) * e["spd"] * dt
                e["y"] += math.sin(ang) * e["spd"] * dt
                if math.hypot(state["px"] - e["x"], state["py"] - e["y"]) < e["r"] + 15:
                    state["hp"] = max(10, state["hp"] - 6)
                    e["x"] -= math.cos(ang) * 75.0
                    e["y"] -= math.sin(ang) * 75.0
                for b in bullets:
                    if b["ttl"] > 0 and math.hypot(b["x"] - e["x"], b["y"] - e["y"]) < e["r"] + 6:
                        b["ttl"] = 0
                        e["hp"] -= b["dmg"]
                        if e["hp"] <= 0:
                            state["score"] += 500 if e["boss"] else 25
                            gems.append({"x": e["x"], "y": e["y"], "val": 160 if e["boss"] else 15})
            enemies[:] = [e for e in enemies if e["hp"] > 0]

            for g in gems:
                d = math.hypot(state["px"] - g["x"], state["py"] - g["y"])
                if d < 200:
                    g["x"] += ((state["px"] - g["x"]) / (d + 1e-6)) * 450.0 * dt
                    g["y"] += ((state["py"] - g["y"]) / (d + 1e-6)) * 450.0 * dt
                if d < 24:
                    g["done"] = True
                    state["xp"] += g["val"]
                    if state["xp"] >= state["xp_next"]:
                        state["xp"] -= state["xp_next"]
                        state["lvl"] += 1
                        state["xp_next"] = int(state["xp_next"] * 1.35)
                        trigger_level_up()
            gems[:] = [g for g in gems if not g.get("done")]

        canvas.delete("all")
        canvas.configure(bg="#000000" if hc else "#090d16")
        cam_x, cam_y = state["px"] - w / 2, state["py"] - h / 2
        grid_col = "#333333" if hc else "#131c2e"
        for gx in range(int(-cam_x % 96), w, 96):
            canvas.create_line(gx, 0, gx, h, fill=grid_col)
        for gy in range(int(-cam_y % 96), h, 96):
            canvas.create_line(0, gy, w, gy, fill=grid_col)

        for g in gems:
            gx, gy = g["x"] - cam_x, g["y"] - cam_y
            canvas.create_rectangle(gx - 4, gy - 4, gx + 4, gy + 4, fill="#34d399", outline="")
        for b in bullets:
            bx, by = b["x"] - cam_x, b["y"] - cam_y
            canvas.create_oval(bx - 4, by - 4, bx + 4, by + 4, fill="#ffff00" if hc else "#38bdf8", outline="")
        for e in enemies:
            ex, ey, r = e["x"] - cam_x, e["y"] - cam_y, e["r"]
            col = "#eab308" if e["boss"] else ("#ff3366" if hc else "#f43f5e")
            canvas.create_oval(ex - r, ey - r, ex + r, ey + r, fill=col, outline="#ffffff")

        canvas.create_oval(
            w / 2 - 15, h / 2 - 15, w / 2 + 15, h / 2 + 15, fill="#00ffff" if hc else "#38bdf8", outline="#ffffff", width=2
        )

        hud = (
            f"HP {state['hp']}/{state['max_hp']}   WAVE {state['wave']}   "
            f"LVL {state['lvl']} (XP {state['xp']}/{state['xp_next']})   "
            f"UPGRADES {state['upgrades']}/{state['max_upgrades']}   SCORE {state['score']}"
        )
        canvas.create_text(24, 24, anchor="nw", text=hud, fill="#ffffff", font=("Menlo", 14, "bold"))
        canvas.create_text(
            24,
            h - 28,
            anchor="nw",
            text="WASD/Arrows Move | [N] Next Milestone/Boss Wave | [L] Draft Upgrade | [C] High-Contrast | [F] Fullscreen",
            fill="#94a3b8",
            font=("Menlo", 11),
        )

        if state["mode"] == "LEVEL_UP":
            canvas.create_rectangle(w / 2 - 360, h / 2 - 150, w / 2 + 360, h / 2 + 150, fill="#0b1220", outline="#38bdf8", width=2)
            canvas.create_text(
                w / 2,
                h / 2 - 115,
                text=f"LEVEL {state['lvl']} REACHED · UPGRADE {state['upgrades'] + 1} OF 5 THIS ROUND (PRESS 1, 2, OR 3)",
                fill="#38bdf8",
                font=("Helvetica", 15, "bold"),
            )
            for idx, (uname, udesc) in enumerate(choices):
                cx = w / 2 - 230 + idx * 230
                cur = state["inv"].get(uname, 0)
                tag = f"Lv.{cur} -> Lv.{cur+1}" if cur > 0 else "NEW Lv.1"
                canvas.create_text(
                    cx,
                    h / 2 - 20,
                    text=f"[{idx + 1}] {uname}\n({tag})\n\n{udesc}",
                    fill="#ffffff",
                    font=("Helvetica", 12, "bold"),
                    justify="center",
                )

        root.after(16, tick)

    tick()
    root.mainloop()


if __name__ == "__main__":
    run_tk_window()
