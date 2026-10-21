export type PowerUpId =
  | 'pulse_cannon'
  | 'orbital_blades'
  | 'chain_arc'
  | 'nova_emitter'
  | 'seeker_missiles'
  | 'overclock_core'
  | 'kinetic_thrusters'
  | 'magnet_field'
  | 'reactive_hull';

export type PowerUpCategory = 'weapon' | 'passive';

export const MAX_UPGRADES_PER_ROUND = 5;
export const MAX_POWERUP_LEVEL = 5;

export interface PowerUpStats {
  damage: number;
  cooldown: number;
  projectiles: number;
  radius: number;
  speedBonus: number;
  pickupRadiusBonus: number;
  maxHpBonus: number;
  effectSummary: string;
}

export interface PowerUpDefinition {
  id: PowerUpId;
  name: string;
  category: PowerUpCategory;
  roleClue: string;
  maxLevel: number;
  accentColor: string;
  highContrastColor: string;
  computeStats: (level: number) => PowerUpStats;
}

export type PowerUpInventory = Partial<Record<PowerUpId, number>>;

export interface DraftChoice {
  id: PowerUpId;
  name: string;
  category: PowerUpCategory;
  roleClue: string;
  isUpgrade: boolean;
  currentLevel: number;
  nextLevel: number;
  currentStats: PowerUpStats | null;
  nextStats: PowerUpStats;
  statDeltaLabels: string[];
  accentColor: string;
  highContrastColor: string;
}

export type EnemyArchetypeId =
  | 'swarmer'
  | 'spitter'
  | 'charger'
  | 'orbiter'
  | 'juggernaut'
  | 'weaver'
  | 'dreadnought';

export interface EnemyArchetype {
  id: EnemyArchetypeId;
  name: string;
  unlockWave: number;
  behaviorPolicy:
    | 'chaser'
    | 'kiter'
    | 'charger'
    | 'orbiter'
    | 'shielded_tank'
    | 'area_denial'
    | 'siege_boss';
  baseHp: number;
  baseSpeed: number;
  baseDamage: number;
  radius: number;
  xpValue: number;
  telegraphDuration: number;
  color: string;
  highContrastColor: string;
  description: string;
}

export interface BossEncounterConfig {
  wave: number;
  id: EnemyArchetypeId;
  name: string;
  title: string;
  maxHp: number;
  damage: number;
  speed: number;
  radius: number;
  xpReward: number;
  color: string;
  highContrastColor: string;
}

export interface WaveConfig {
  wave: number;
  isFifthWaveMilestone: boolean;
  isBossWave: boolean;
  bossEncounter: BossEncounterConfig | null;
  newlyUnlockedEnemy: EnemyArchetype | null;
  ascendantTierName: string | null;
  availableEnemies: EnemyArchetype[];
  spawnBudget: number;
  spawnInterval: number;
  hpMultiplier: number;
  speedMultiplier: number;
  damageMultiplier: number;
  waveDurationSeconds: number;
}

export type ContrastMode = 'standard' | 'high' | 'deuteranopia';

export interface KeyBindings {
  moveUp: string;
  moveDown: string;
  moveLeft: string;
  moveRight: string;
  dash: string;
  pause: string;
  fullscreen: string;
  upgrade1: string;
  upgrade2: string;
  upgrade3: string;
}

export interface GameSettings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  muted: boolean;
  contrastMode: ContrastMode;
  screenShake: number;
  boldOutlines: boolean;
  keyBindings: KeyBindings;
}

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  moveUp: 'KeyW',
  moveDown: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  dash: 'Space',
  pause: 'Escape',
  fullscreen: 'KeyF',
  upgrade1: 'Digit1',
  upgrade2: 'Digit2',
  upgrade3: 'Digit3',
};

export const POWER_UP_CATALOG: Record<PowerUpId, PowerUpDefinition> = {
  pulse_cannon: {
    id: 'pulse_cannon',
    name: 'Pulse Autocannon',
    category: 'weapon',
    roleClue: 'Rapid Auto-Target Bolts',
    maxLevel: MAX_POWERUP_LEVEL,
    accentColor: '#38bdf8',
    highContrastColor: '#00ffff',
    computeStats: (level: number) => {
      const lvl = Math.max(1, level);
      const damage = Math.round(26 * (1 + (lvl - 1) * 0.32));
      const cooldown = +(Math.max(0.14, 0.34 * Math.pow(0.88, lvl - 1))).toFixed(2);
      const projectiles = 1 + Math.floor(lvl / 2);
      const radius = 430 + (lvl - 1) * 28;
      return {
        damage,
        cooldown,
        projectiles,
        radius,
        speedBonus: 0,
        pickupRadiusBonus: 0,
        maxHpBonus: 0,
        effectSummary: `${damage} DMG · ${projectiles}x Bolts · ${cooldown}s Cycle`,
      };
    },
  },
  orbital_blades: {
    id: 'orbital_blades',
    name: 'Orbital Glaives',
    category: 'weapon',
    roleClue: '360° Rotating Plasma Ring',
    maxLevel: MAX_POWERUP_LEVEL,
    accentColor: '#f59e0b',
    highContrastColor: '#ffff00',
    computeStats: (level: number) => {
      const lvl = Math.max(1, level);
      const damage = Math.round(18 * (1 + (lvl - 1) * 0.34));
      const cooldown = +(Math.max(0.16, 0.42 * Math.pow(0.9, lvl - 1))).toFixed(2);
      const projectiles = 2 + Math.floor((lvl + 1) / 2);
      const radius = 92 + (lvl - 1) * 12;
      return {
        damage,
        cooldown,
        projectiles,
        radius,
        speedBonus: 0,
        pickupRadiusBonus: 0,
        maxHpBonus: 0,
        effectSummary: `${projectiles} Glaives · ${damage} DMG · ${radius}px Orbit`,
      };
    },
  },
  chain_arc: {
    id: 'chain_arc',
    name: 'Voltaic Arc Emitter',
    category: 'weapon',
    roleClue: 'Chain Lightning Multi-Target',
    maxLevel: MAX_POWERUP_LEVEL,
    accentColor: '#a855f7',
    highContrastColor: '#ff77ff',
    computeStats: (level: number) => {
      const lvl = Math.max(1, level);
      const damage = Math.round(28 * (1 + (lvl - 1) * 0.35));
      const cooldown = +(Math.max(0.42, 1.05 * Math.pow(0.88, lvl - 1))).toFixed(2);
      const projectiles = 2 + lvl;
      const radius = 280 + (lvl - 1) * 22;
      return {
        damage,
        cooldown,
        projectiles,
        radius,
        speedBonus: 0,
        pickupRadiusBonus: 0,
        maxHpBonus: 0,
        effectSummary: `${damage} DMG · ${projectiles}x Arcs · ${cooldown}s Pulse`,
      };
    },
  },
  nova_emitter: {
    id: 'nova_emitter',
    name: 'Seismic Shockwave',
    category: 'weapon',
    roleClue: 'Radial Area Knockback Blast',
    maxLevel: MAX_POWERUP_LEVEL,
    accentColor: '#10b981',
    highContrastColor: '#00ff66',
    computeStats: (level: number) => {
      const lvl = Math.max(1, level);
      const damage = Math.round(34 * (1 + (lvl - 1) * 0.36));
      const cooldown = +(Math.max(0.8, 1.95 * Math.pow(0.88, lvl - 1))).toFixed(2);
      const projectiles = 1;
      const radius = 145 + (lvl - 1) * 26;
      return {
        damage,
        cooldown,
        projectiles,
        radius,
        speedBonus: 0,
        pickupRadiusBonus: 0,
        maxHpBonus: 0,
        effectSummary: `${damage} Area DMG · ${radius}px Blast · ${cooldown}s`,
      };
    },
  },
  seeker_missiles: {
    id: 'seeker_missiles',
    name: 'Swarm Micro-Pods',
    category: 'weapon',
    roleClue: 'Homing Heavy-Target Salvo',
    maxLevel: MAX_POWERUP_LEVEL,
    accentColor: '#f43f5e',
    highContrastColor: '#ff5555',
    computeStats: (level: number) => {
      const lvl = Math.max(1, level);
      const damage = Math.round(32 * (1 + (lvl - 1) * 0.32));
      const cooldown = +(Math.max(0.6, 1.5 * Math.pow(0.88, lvl - 1))).toFixed(2);
      const projectiles = 2 + lvl;
      const radius = 440 + (lvl - 1) * 28;
      return {
        damage,
        cooldown,
        projectiles,
        radius,
        speedBonus: 0,
        pickupRadiusBonus: 0,
        maxHpBonus: 0,
        effectSummary: `${projectiles}x Seekers · ${damage} DMG · ${cooldown}s`,
      };
    },
  },
  overclock_core: {
    id: 'overclock_core',
    name: 'Overclock Matrix',
    category: 'passive',
    roleClue: 'Global Fire Rate & Damage Boost',
    maxLevel: MAX_POWERUP_LEVEL,
    accentColor: '#fbbf24',
    highContrastColor: '#ffff00',
    computeStats: (level: number) => {
      const lvl = Math.max(1, level);
      const dmgPct = lvl * 15;
      const cdPct = lvl * 9;
      return {
        damage: dmgPct,
        cooldown: cdPct,
        projectiles: 0,
        radius: 0,
        speedBonus: 0,
        pickupRadiusBonus: 0,
        maxHpBonus: 0,
        effectSummary: `+${dmgPct}% Global DMG · +${cdPct}% Fire Rate`,
      };
    },
  },
  kinetic_thrusters: {
    id: 'kinetic_thrusters',
    name: 'Kinetic Thrusters',
    category: 'passive',
    roleClue: 'Move Speed & Dash Recovery',
    maxLevel: MAX_POWERUP_LEVEL,
    accentColor: '#2dd4bf',
    highContrastColor: '#00ffff',
    computeStats: (level: number) => {
      const lvl = Math.max(1, level);
      const speedBonus = lvl * 14;
      return {
        damage: 0,
        cooldown: lvl * 10,
        projectiles: 0,
        radius: 0,
        speedBonus,
        pickupRadiusBonus: 0,
        maxHpBonus: 0,
        effectSummary: `+${speedBonus}% Move Speed · -${lvl * 10}% Dash CD`,
      };
    },
  },
  magnet_field: {
    id: 'magnet_field',
    name: 'Graviton Attractor',
    category: 'passive',
    roleClue: 'XP Magnet Radius & XP Gain',
    maxLevel: MAX_POWERUP_LEVEL,
    accentColor: '#60a5fa',
    highContrastColor: '#ffffff',
    computeStats: (level: number) => {
      const lvl = Math.max(1, level);
      const pickupRadiusBonus = lvl * 45;
      const xpBonus = lvl * 12;
      return {
        damage: xpBonus,
        cooldown: 0,
        projectiles: 0,
        radius: pickupRadiusBonus,
        speedBonus: 0,
        pickupRadiusBonus,
        maxHpBonus: 0,
        effectSummary: `+${pickupRadiusBonus}px Magnet · +${xpBonus}% XP Gain`,
      };
    },
  },
  reactive_hull: {
    id: 'reactive_hull',
    name: 'Reactive Hull Plating',
    category: 'passive',
    roleClue: 'Max Hull Integrity & Repair',
    maxLevel: MAX_POWERUP_LEVEL,
    accentColor: '#4ade80',
    highContrastColor: '#00ff00',
    computeStats: (level: number) => {
      const lvl = Math.max(1, level);
      const maxHpBonus = lvl * 30;
      return {
        damage: lvl * 6,
        cooldown: 0,
        projectiles: 0,
        radius: 0,
        speedBonus: 0,
        pickupRadiusBonus: 0,
        maxHpBonus,
        effectSummary: `+${maxHpBonus} Max HP · +${lvl * 6}% Hull Mitigation`,
      };
    },
  },
};

export const INITIAL_STARTER_POOL: PowerUpId[] = [
  'pulse_cannon',
  'orbital_blades',
  'chain_arc',
];

export const ENEMY_ARCHETYPES: Record<EnemyArchetypeId, EnemyArchetype> = {
  swarmer: {
    id: 'swarmer',
    name: 'Swarmer Drone',
    unlockWave: 1,
    behaviorPolicy: 'chaser',
    baseHp: 22,
    baseSpeed: 102,
    baseDamage: 6,
    radius: 13,
    xpValue: 14,
    telegraphDuration: 0,
    color: '#f43f5e',
    highContrastColor: '#ff3366',
    description: 'Light pack pursuer that closes distance in coordinated vectors.',
  },
  spitter: {
    id: 'spitter',
    name: 'Plasma Kiter',
    unlockWave: 1,
    behaviorPolicy: 'kiter',
    baseHp: 20,
    baseSpeed: 86,
    baseDamage: 9,
    radius: 14,
    xpValue: 18,
    telegraphDuration: 0.45,
    color: '#a855f7',
    highContrastColor: '#ff66ff',
    description: 'Maintains standoff range and fires telegraphed plasma bolts.',
  },
  charger: {
    id: 'charger',
    name: 'Vanguard Charger',
    unlockWave: 1,
    behaviorPolicy: 'charger',
    baseHp: 38,
    baseSpeed: 82,
    baseDamage: 12,
    radius: 17,
    xpValue: 24,
    telegraphDuration: 0.55,
    color: '#fb923c',
    highContrastColor: '#ffaa00',
    description: 'Locks a visible trajectory line before executing a high-velocity lunge.',
  },
  orbiter: {
    id: 'orbiter',
    name: 'Phase Sentinel',
    unlockWave: 5,
    behaviorPolicy: 'orbiter',
    baseHp: 68,
    baseSpeed: 118,
    baseDamage: 14,
    radius: 18,
    xpValue: 38,
    telegraphDuration: 0.5,
    color: '#38bdf8',
    highContrastColor: '#00ffff',
    description: 'Wave 5 Challenger: Orbits the player perimeter and emits inward energy lances.',
  },
  juggernaut: {
    id: 'juggernaut',
    name: 'Aegis Juggernaut',
    unlockWave: 10,
    behaviorPolicy: 'shielded_tank',
    baseHp: 165,
    baseSpeed: 64,
    baseDamage: 18,
    radius: 26,
    xpValue: 75,
    telegraphDuration: 0.7,
    color: '#eab308',
    highContrastColor: '#ffff00',
    description: 'Wave 10 Challenger & Boss Frame: Heavy armored hull with frontal directional plating.',
  },
  weaver: {
    id: 'weaver',
    name: 'Void Weaver',
    unlockWave: 15,
    behaviorPolicy: 'area_denial',
    baseHp: 140,
    baseSpeed: 98,
    baseDamage: 17,
    radius: 20,
    xpValue: 95,
    telegraphDuration: 0.65,
    color: '#ec4899',
    highContrastColor: '#ff99ff',
    description: 'Wave 15 Challenger: Warps across the arena and anchors gravity hazard zones.',
  },
  dreadnought: {
    id: 'dreadnought',
    name: 'Apex Dreadnought',
    unlockWave: 20,
    behaviorPolicy: 'siege_boss',
    baseHp: 380,
    baseSpeed: 56,
    baseDamage: 24,
    radius: 34,
    xpValue: 200,
    telegraphDuration: 0.8,
    color: '#ef4444',
    highContrastColor: '#ffffff',
    description: 'Wave 20 Boss Warship: Multi-turret siege dreadnought with radial beam telegraphs.',
  },
};

const FIFTH_WAVE_UNLOCK_MAP: Record<number, EnemyArchetypeId> = {
  5: 'orbiter',
  10: 'juggernaut',
  15: 'weaver',
  20: 'dreadnought',
};

/**
 * Counts total upgrades applied after the initial starter power-up.
 * Each round allows a maximum of `MAX_UPGRADES_PER_ROUND` (5) upgrades.
 */
export function getUpgradesUsedCount(inventory: PowerUpInventory): number {
  const totalLevels = Object.values(inventory).reduce<number>((sum, lvl) => sum + (lvl ?? 0), 0);
  // Subtract the 1 initial starter power-up granted at the beginning of the round
  return Math.max(0, totalLevels - 1);
}

/**
 * Returns true if the player can still draft another power-up upgrade in this round (max 5).
 */
export function canDraftUpgrade(inventory: PowerUpInventory): boolean {
  return getUpgradesUsedCount(inventory) < MAX_UPGRADES_PER_ROUND;
}

/**
 * Grants the initial starting power-up at the beginning of a round (Wave 1, Level 1).
 */
export function createInitialInventory(starterId: PowerUpId = 'pulse_cannon'): PowerUpInventory {
  return {
    [starterId]: 1,
  };
}

/**
 * Calculates required XP to advance from `level` to `level + 1`.
 */
export function getXpRequiredForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.round(30 + (safeLevel - 1) * 22 + Math.pow(safeLevel - 1, 1.25) * 8);
}

/**
 * Builds human-readable stat improvement labels comparing current level to next level.
 */
export function computeStatDeltaLabels(id: PowerUpId, currentLevel: number): string[] {
  const def = POWER_UP_CATALOG[id];
  const nextLevel = currentLevel + 1;
  const nextStats = def.computeStats(nextLevel);
  if (currentLevel <= 0) {
    return [nextStats.effectSummary];
  }
  const curStats = def.computeStats(currentLevel);
  const deltas: string[] = [];

  if (nextStats.damage !== curStats.damage) {
    const unit = def.category === 'passive' ? '%' : ' DMG';
    deltas.push(`+${nextStats.damage - curStats.damage}${unit} (${curStats.damage} → ${nextStats.damage})`);
  }
  if (nextStats.projectiles !== curStats.projectiles) {
    deltas.push(`+${nextStats.projectiles - curStats.projectiles} Count (${curStats.projectiles} → ${nextStats.projectiles})`);
  }
  if (nextStats.cooldown !== curStats.cooldown) {
    if (def.category === 'weapon') {
      const diff = +(curStats.cooldown - nextStats.cooldown).toFixed(2);
      if (diff > 0) deltas.push(`-${diff}s Cooldown (${curStats.cooldown}s → ${nextStats.cooldown}s)`);
    } else {
      deltas.push(`+${nextStats.cooldown - curStats.cooldown}% Rate`);
    }
  }
  if (nextStats.radius !== curStats.radius && nextStats.radius > 0) {
    deltas.push(`+${nextStats.radius - curStats.radius}px Radius`);
  }
  if (nextStats.speedBonus !== curStats.speedBonus) {
    deltas.push(`+${nextStats.speedBonus - curStats.speedBonus}% Move Speed`);
  }
  if (nextStats.maxHpBonus !== curStats.maxHpBonus) {
    deltas.push(`+${nextStats.maxHpBonus - curStats.maxHpBonus} Max HP`);
  }

  return deltas.length > 0 ? deltas : [nextStats.effectSummary];
}

/**
 * Generates 3 distinct random power-up choices on level-up.
 * Enforces the maximum of 5 upgrades per round (`MAX_UPGRADES_PER_ROUND`).
 */
export function rollThreePowerUpChoices(
  inventory: PowerUpInventory,
  rng: () => number = Math.random
): DraftChoice[] {
  if (!canDraftUpgrade(inventory)) {
    return [];
  }

  const allIds = Object.keys(POWER_UP_CATALOG) as PowerUpId[];
  const eligible = allIds.filter((id) => {
    const curLvl = inventory[id] ?? 0;
    return curLvl < POWER_UP_CATALOG[id].maxLevel;
  });

  const pool = [...eligible];
  const selectedIds: PowerUpId[] = [];

  while (selectedIds.length < 3 && pool.length > 0) {
    const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
    selectedIds.push(pool[idx]);
    pool.splice(idx, 1);
  }

  return selectedIds.map((id) => {
    const def = POWER_UP_CATALOG[id];
    const currentLevel = inventory[id] ?? 0;
    const nextLevel = currentLevel + 1;
    const isUpgrade = currentLevel > 0;
    const currentStats = isUpgrade ? def.computeStats(currentLevel) : null;
    const nextStats = def.computeStats(nextLevel);
    return {
      id,
      name: def.name,
      category: def.category,
      roleClue: def.roleClue,
      isUpgrade,
      currentLevel,
      nextLevel,
      currentStats,
      nextStats,
      statDeltaLabels: computeStatDeltaLabels(id, currentLevel),
      accentColor: def.accentColor,
      highContrastColor: def.highContrastColor,
    };
  });
}

/**
 * Applies a chosen power-up upgrade to the player's inventory.
 * Strictly enforces `MAX_UPGRADES_PER_ROUND = 5`.
 */
export function applyPowerUpChoice(
  inventory: PowerUpInventory,
  choiceId: PowerUpId
): PowerUpInventory {
  if (!canDraftUpgrade(inventory)) {
    return { ...inventory };
  }
  const def = POWER_UP_CATALOG[choiceId];
  const currentLevel = inventory[choiceId] ?? 0;
  const nextLevel = Math.min(def.maxLevel, currentLevel + 1);
  return {
    ...inventory,
    [choiceId]: nextLevel,
  };
}

/**
 * Returns the Boss Fight configuration for every 10th wave (Wave 10, 20, 30...).
 */
export function getBossEncounterForWave(waveNumber: number): BossEncounterConfig | null {
  const wave = Math.max(1, Math.floor(waveNumber));
  if (wave % 10 !== 0) return null;

  const bossTier = Math.floor(wave / 10);
  if (bossTier === 1) {
    return {
      wave,
      id: 'juggernaut',
      name: 'Omega Aegis Colossus',
      title: 'Wave 10 Siege Boss · Directional Shield & Radial Slam',
      maxHp: 620,
      damage: 18,
      speed: 62,
      radius: 36,
      xpReward: 160,
      color: '#eab308',
      highContrastColor: '#ffff00',
    };
  }
  if (bossTier === 2) {
    return {
      wave,
      id: 'dreadnought',
      name: 'Apex Void Dreadnought',
      title: 'Wave 20 Dreadnought Boss · Multi-Turret Nova Barrage',
      maxHp: 1150,
      damage: 24,
      speed: 58,
      radius: 42,
      xpReward: 280,
      color: '#ef4444',
      highContrastColor: '#ffffff',
    };
  }
  return {
    wave,
    id: 'dreadnought',
    name: `Sovereign Core Mk.${bossTier}`,
    title: `Wave ${wave} Ascendant Boss · Singularity Siege Matrix`,
    maxHp: Math.round(620 * Math.pow(1.65, bossTier - 1)),
    damage: Math.round(18 + (bossTier - 1) * 5),
    speed: Math.min(82, 58 + bossTier * 3),
    radius: 42,
    xpReward: 200 * bossTier,
    color: '#f43f5e',
    highContrastColor: '#00ffff',
  };
}

/**
 * Computes balanced difficulty scaling, 5th-wave enemy archetype unlocks,
 * and 10th-wave Boss Fight configurations for a given wave number.
 */
export function getWaveConfig(waveNumber: number): WaveConfig {
  const wave = Math.max(1, Math.floor(waveNumber));
  const isFifthWaveMilestone = wave % 5 === 0;
  const isBossWave = wave % 10 === 0;
  const bossEncounter = getBossEncounterForWave(wave);

  const availableEnemies: EnemyArchetype[] = (Object.values(ENEMY_ARCHETYPES) as EnemyArchetype[]).filter(
    (enemy) => enemy.unlockWave <= wave
  );

  let newlyUnlockedEnemy: EnemyArchetype | null = null;
  let ascendantTierName: string | null = null;

  if (isFifthWaveMilestone) {
    const directUnlockId = FIFTH_WAVE_UNLOCK_MAP[wave];
    if (directUnlockId) {
      newlyUnlockedEnemy = ENEMY_ARCHETYPES[directUnlockId];
    } else if (wave >= 25) {
      const cycleIds: EnemyArchetypeId[] = ['orbiter', 'juggernaut', 'weaver', 'dreadnought'];
      const cycleIdx = (Math.floor(wave / 5) - 5) % cycleIds.length;
      const baseArch = ENEMY_ARCHETYPES[cycleIds[cycleIdx]];
      const tierNum = Math.floor(wave / 5) - 3;
      ascendantTierName = `Ascendant Mk.${tierNum} ${baseArch.name}`;
      newlyUnlockedEnemy = {
        ...baseArch,
        name: ascendantTierName,
        unlockWave: wave,
      };
    }
  }

  // Balanced multi-knob difficulty curve
  const spawnBudget = Math.round(7 + wave * 3 + Math.pow(wave, 1.15) * 1.1);
  const spawnInterval = +(Math.max(0.38, 1.48 * Math.pow(0.94, wave - 1))).toFixed(3);
  const hpMultiplier = +(1 + (wave - 1) * 0.14 + Math.pow(Math.max(0, wave - 1), 1.2) * 0.025).toFixed(2);
  const speedMultiplier = +(1 + Math.min(0.45, (wave - 1) * 0.022)).toFixed(2);
  const damageMultiplier = +(1 + (wave - 1) * 0.08).toFixed(2);
  const waveDurationSeconds = Math.min(36, 18 + Math.floor((wave - 1) * 1.2));

  return {
    wave,
    isFifthWaveMilestone,
    isBossWave,
    bossEncounter,
    newlyUnlockedEnemy,
    ascendantTierName,
    availableEnemies,
    spawnBudget,
    spawnInterval,
    hpMultiplier,
    speedMultiplier,
    damageMultiplier,
    waveDurationSeconds,
  };
}

/**
 * Vectorized Structure-of-Arrays (SoA) batch step mirroring NumPy array broadcasting.
 */
export function stepVectorizedEntitiesSoA(
  posX: Float32Array,
  posY: Float32Array,
  velX: Float32Array,
  velY: Float32Array,
  distSqOut: Float32Array,
  playerX: number,
  playerY: number,
  dt: number,
  count: number
): void {
  const clampedDt = Math.min(Math.max(0, dt), 0.05);
  for (let i = 0; i < count; i++) {
    const nx = posX[i] + velX[i] * clampedDt;
    const ny = posY[i] + velY[i] * clampedDt;
    posX[i] = nx;
    posY[i] = ny;
    const dx = playerX - nx;
    const dy = playerY - ny;
    distSqOut[i] = dx * dx + dy * dy;
  }
}

/**
 * Wraps world coordinates into repeating modular sector tiles for infinite map rendering.
 */
export function getInfiniteSectorCoords(worldX: number, worldY: number, sectorSize: number = 1024): {
  sectorX: number;
  sectorY: number;
  localX: number;
  localY: number;
  sectorCode: string;
} {
  const sectorX = Math.floor(worldX / sectorSize);
  const sectorY = Math.floor(worldY / sectorSize);
  const localX = ((worldX % sectorSize) + sectorSize) % sectorSize;
  const localY = ((worldY % sectorSize) + sectorSize) % sectorSize;
  const ew = sectorX >= 0 ? `E${sectorX}` : `W${Math.abs(sectorX)}`;
  const ns = sectorY >= 0 ? `S${sectorY}` : `N${Math.abs(sectorY)}`;
  return {
    sectorX,
    sectorY,
    localX,
    localY,
    sectorCode: `${ns}·${ew}`,
  };
}
