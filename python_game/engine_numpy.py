"""
Vectra Swarm: Vectorized NumPy Game Logic & Physics Engine
Uses Structure-of-Arrays (SoA) NumPy ndarrays for high-frequency wave simulation,
collision detection, XP gem magnetization, 5-upgrade round cap, 5th-wave enemy unlocks,
and 10th-wave Boss Fights.
"""

import numpy as np
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

MAX_UPGRADES_PER_ROUND = 5
MAX_POWERUP_LEVEL = 5


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
    "overclock_core": ("Overclock Matrix", "passive", "+15% Global Damage & +9% Fire Rate per level"),
    "kinetic_thrusters": ("Kinetic Thrusters", "passive", "+14% Move Speed & -10% Dash Cooldown per level"),
    "magnet_field": ("Graviton Attractor", "passive", "+45px XP Magnet Radius & +12% XP Gain per level"),
    "reactive_hull": ("Reactive Hull Plating", "passive", "+30 Max HP & +6% Hull Mitigation per level"),
}

FIFTH_WAVE_ENEMY_NAMES: Dict[int, str] = {
    5: "Phase Sentinel (Orbiter)",
    10: "BOSS: Omega Aegis Colossus",
    15: "Void Weaver (Area-Denial Warper)",
    20: "BOSS: Apex Void Dreadnought",
}


class VectorizedArenaEngine:
    """
    High-frequency NumPy SoA (Structure of Arrays) simulation engine.
    Enforces a maximum of 5 upgrades per round and spawns a Boss Fight every 10th wave.
    """

    def __init__(self, max_enemies: int = 1024, max_gems: int = 2048, max_projectiles: int = 512):
        self.max_enemies = max_enemies
        self.max_gems = max_gems
        self.max_projectiles = max_projectiles

        self.enemy_pos = np.zeros((max_enemies, 2), dtype=np.float32)
        self.enemy_vel = np.zeros((max_enemies, 2), dtype=np.float32)
        self.enemy_hp = np.zeros(max_enemies, dtype=np.float32)
        self.enemy_max_hp = np.zeros(max_enemies, dtype=np.float32)
        self.enemy_radius = np.zeros(max_enemies, dtype=np.float32)
        self.enemy_speed = np.zeros(max_enemies, dtype=np.float32)
        self.enemy_type = np.zeros(max_enemies, dtype=np.int32)
        self.enemy_is_boss = np.zeros(max_enemies, dtype=np.bool_)
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
        self.xp_next = 30.0
        self.wave = 1
        self.score = 0

        # Round starts with 1 initial power-up
        self.inventory: Dict[str, int] = {"pulse_cannon": 1}

    def upgrades_used_count(self) -> int:
        return max(0, sum(self.inventory.values()) - 1)

    def can_draft_upgrade(self) -> bool:
        return self.upgrades_used_count() < MAX_UPGRADES_PER_ROUND

    def roll_three_upgrades(self) -> List[PowerUpChoice]:
        if not self.can_draft_upgrade():
            return []
        eligible = [pid for pid in POWER_UP_DEFS.keys() if self.inventory.get(pid, 0) < MAX_POWERUP_LEVEL]
        chosen_ids = list(np.random.choice(eligible, size=min(3, len(eligible)), replace=False))
        choices: List[PowerUpChoice] = []
        for pid in chosen_ids:
            name, cat, desc = POWER_UP_DEFS[pid]
            cur_lvl = self.inventory.get(pid, 0)
            choices.append(
                PowerUpChoice(
                    power_id=pid,
                    name=name,
                    category=cat,
                    is_upgrade=cur_lvl > 0,
                    current_level=cur_lvl,
                    next_level=cur_lvl + 1,
                    description=desc,
                )
            )
        return choices

    def apply_upgrade(self, power_id: str) -> None:
        if not self.can_draft_upgrade():
            return
        self.inventory[power_id] = min(MAX_POWERUP_LEVEL, self.inventory.get(power_id, 0) + 1)
        if power_id == "reactive_hull":
            self.player_max_hp += 30.0
            self.player_hp = min(self.player_max_hp, self.player_hp + 35.0)

    def spawn_tenth_wave_boss(self, wave_num: int) -> Optional[int]:
        if wave_num % 10 != 0:
            return None
        free = np.flatnonzero(~self.enemy_active)
        if free.size == 0:
            return None
        slot = int(free[0])
        tier = wave_num // 10
        self.enemy_pos[slot] = self.player_pos + np.array([340.0, -120.0], dtype=np.float32)
        boss_hp = 620.0 * (1.65 ** (tier - 1))
        self.enemy_hp[slot] = boss_hp
        self.enemy_max_hp[slot] = boss_hp
        self.enemy_radius[slot] = 36.0 if tier == 1 else 42.0
        self.enemy_speed[slot] = 60.0
        self.enemy_type[slot] = 4 if tier == 1 else 6
        self.enemy_is_boss[slot] = True
        self.enemy_active[slot] = True
        return slot

    def step_simulation(self, dt: float) -> Tuple[int, bool]:
        dt = float(np.clip(dt, 0.0, 0.05))
        active_idx = np.flatnonzero(self.enemy_active)
        if active_idx.size > 0:
            deltas = self.player_pos - self.enemy_pos[active_idx]
            dists = np.linalg.norm(deltas, axis=1, keepdims=True) + 1e-6
            dirs = deltas / dists

            types = self.enemy_type[active_idx]
            tangent = np.column_stack((-dirs[:, 1], dirs[:, 0]))
            orbit_mask = (types == 3)[:, None]
            kiter_mask = ((types == 1) & (dists[:, 0] < 220.0))[:, None]

            desired_dir = np.where(orbit_mask, dirs * 0.35 + tangent * 0.9, dirs)
            desired_dir = np.where(kiter_mask, -dirs * 0.6 + tangent * 0.5, desired_dir)

            speeds = self.enemy_speed[active_idx][:, None]
            self.enemy_vel[active_idx] = desired_dir * speeds
            self.enemy_pos[active_idx] += self.enemy_vel[active_idx] * dt

        p_idx = np.flatnonzero(self.proj_active)
        kills = 0
        if p_idx.size > 0:
            self.proj_pos[p_idx] += self.proj_vel[p_idx] * dt
            self.proj_ttl[p_idx] -= dt
            expired = p_idx[self.proj_ttl[p_idx] <= 0.0]
            self.proj_active[expired] = False

            p_idx = np.flatnonzero(self.proj_active)
            active_idx = np.flatnonzero(self.enemy_active)
            if p_idx.size > 0 and active_idx.size > 0:
                diff = self.proj_pos[p_idx][:, None, :] - self.enemy_pos[active_idx][None, :, :]
                dist_sq = np.sum(diff * diff, axis=2)
                radii_sq = (self.enemy_radius[active_idx][None, :] + 6.0) ** 2
                hits = dist_sq <= radii_sq

                hit_p, hit_e = np.nonzero(hits)
                for pi, ei in zip(hit_p, hit_e):
                    real_p = p_idx[pi]
                    real_e = active_idx[ei]
                    if self.proj_active[real_p] and self.enemy_active[real_e]:
                        self.proj_active[real_p] = False
                        self.enemy_hp[real_e] -= self.proj_dmg[real_p]
                        if self.enemy_hp[real_e] <= 0.0:
                            was_boss = bool(self.enemy_is_boss[real_e])
                            self.enemy_active[real_e] = False
                            self.enemy_is_boss[real_e] = False
                            kills += 1
                            self.score += (500 if was_boss else 25) * self.wave
                            if was_boss:
                                self.player_hp = min(self.player_max_hp, self.player_hp + 35.0)
                            self._spawn_gem(self.enemy_pos[real_e], 160.0 if was_boss else (14.0 + self.wave * 2.0))

        g_idx = np.flatnonzero(self.gem_active)
        leveled_up = False
        if g_idx.size > 0:
            magnet_lvl = self.inventory.get("magnet_field", 0)
            magnet_radius = 190.0 + magnet_lvl * 45.0
            g_delta = self.player_pos - self.gem_pos[g_idx]
            g_dist = np.linalg.norm(g_delta, axis=1)

            in_magnet = g_dist < magnet_radius
            if np.any(in_magnet):
                mag_indices = g_idx[in_magnet]
                mag_dirs = g_delta[in_magnet] / (g_dist[in_magnet][:, None] + 1e-6)
                self.gem_pos[mag_indices] += mag_dirs * 450.0 * dt

            collected = g_idx[g_dist < 24.0]
            if collected.size > 0:
                xp_mult = 1.0 + magnet_lvl * 0.12
                gained = float(np.sum(self.gem_val[collected])) * xp_mult
                self.gem_active[collected] = False
                self.xp += gained
                if self.xp >= self.xp_next:
                    self.xp -= self.xp_next
                    self.level += 1
                    self.xp_next = round(30.0 + (self.level - 1) * 22.0 + ((self.level - 1) ** 1.25) * 8.0)
                    self.player_hp = min(self.player_max_hp, self.player_hp + 15.0)
                    if self.can_draft_upgrade():
                        leveled_up = True
                    else:
                        self.score += 250

        return kills, leveled_up

    def _spawn_gem(self, pos: np.ndarray, value: float) -> None:
        free = np.flatnonzero(~self.gem_active)
        if free.size > 0:
            idx = free[0]
            self.gem_pos[idx] = pos
            self.gem_val[idx] = value
            self.gem_active[idx] = True
