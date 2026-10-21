import React, { useEffect, useRef } from 'react';
import {
  canDraftUpgrade,
  ContrastMode,
  ENEMY_ARCHETYPES,
  EnemyArchetypeId,
  GameSettings,
  getBossEncounterForWave,
  getInfiniteSectorCoords,
  getUpgradesUsedCount,
  getWaveConfig,
  getXpRequiredForLevel,
  MAX_UPGRADES_PER_ROUND,
  POWER_UP_CATALOG,
  PowerUpId,
  PowerUpInventory,
  stepVectorizedEntitiesSoA,
} from '../game/rules';
import { soundEngine } from '../game/sound';

export type GameLifecycleState = 'title' | 'playing' | 'levelup' | 'paused' | 'gameover';

export interface HudDomRefs {
  hpFillRef: React.RefObject<HTMLDivElement | null>;
  hpGhostRef: React.RefObject<HTMLDivElement | null>;
  xpFillRef: React.RefObject<HTMLDivElement | null>;
  dashFillRef: React.RefObject<HTMLDivElement | null>;
  waveProgressRef: React.RefObject<HTMLDivElement | null>;
  sectorTextRef: React.RefObject<HTMLSpanElement | null>;
}

export interface ActiveBossTelemetry {
  wave: number;
  name: string;
  title: string;
  hp: number;
  maxHp: number;
}

export interface TelemetrySnapshot {
  hp: number;
  maxHp: number;
  xp: number;
  xpNext: number;
  level: number;
  wave: number;
  score: number;
  kills: number;
  upgradesUsed: number;
  maxUpgradesPerRound: number;
  inventory: PowerUpInventory;
  activeBoss: ActiveBossTelemetry | null;
  newEnemyBanner: {
    wave: number;
    name: string;
    description: string;
  } | null;
}

export interface SimulationControlsRef {
  startNewRun: (starterId?: PowerUpId) => void;
  applyUpgradeAndResume: (powerUpId: PowerUpId) => void;
  triggerInstantLevelUp: () => void;
  advanceToWave: (targetWave: number) => void;
}

interface ArenaCanvasProps {
  gameState: GameLifecycleState;
  settings: GameSettings;
  hudRefs: HudDomRefs;
  simControlsRef: React.MutableRefObject<SimulationControlsRef | null>;
  onTelemetryUpdate: (snapshot: TelemetrySnapshot) => void;
  onTriggerLevelUp: (snapshot: TelemetrySnapshot) => void;
  onTriggerGameOver: (snapshot: TelemetrySnapshot) => void;
  onTogglePause: () => void;
  onToggleFullscreen: () => void;
}

const MAX_ENEMIES = 320;
const MAX_PROJECTILES = 280;
const MAX_ENEMY_BULLETS = 160;
const MAX_GEMS = 400;
const MAX_PARTICLES = 360;

const ARCHETYPE_LIST: EnemyArchetypeId[] = [
  'swarmer',
  'spitter',
  'charger',
  'orbiter',
  'juggernaut',
  'weaver',
  'dreadnought',
];

export const ArenaCanvas: React.FC<ArenaCanvasProps> = ({
  gameState,
  settings,
  hudRefs,
  simControlsRef,
  onTelemetryUpdate,
  onTriggerLevelUp,
  onTriggerGameOver,
  onTogglePause,
  onToggleFullscreen,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const gameStateRef = useRef<GameLifecycleState>(gameState);
  gameStateRef.current = gameState;

  const settingsRef = useRef<GameSettings>(settings);
  settingsRef.current = settings;

  const callbacksRef = useRef({
    onTelemetryUpdate,
    onTriggerLevelUp,
    onTriggerGameOver,
    onTogglePause,
    onToggleFullscreen,
  });
  callbacksRef.current = {
    onTelemetryUpdate,
    onTriggerLevelUp,
    onTriggerGameOver,
    onTogglePause,
    onToggleFullscreen,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let viewportW = window.innerWidth;
    let viewportH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const updateCanvasSize = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      viewportW = Math.max(320, rect.width || window.innerWidth);
      viewportH = Math.max(240, rect.height || window.innerHeight);
      canvas.width = Math.round(viewportW * dpr);
      canvas.height = Math.round(viewportH * dpr);
    };
    updateCanvasSize();

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
    });
    resizeObserver.observe(canvas);

    // =========================================================================
    // Vectorized SoA TypedArray Buffers (Mirrors Python NumPy Engine 1-to-1)
    // =========================================================================
    const ePosX = new Float32Array(MAX_ENEMIES);
    const ePosY = new Float32Array(MAX_ENEMIES);
    const eVelX = new Float32Array(MAX_ENEMIES);
    const eVelY = new Float32Array(MAX_ENEMIES);
    const eDistSq = new Float32Array(MAX_ENEMIES);
    const eHp = new Float32Array(MAX_ENEMIES);
    const eMaxHp = new Float32Array(MAX_ENEMIES);
    const eRadius = new Float32Array(MAX_ENEMIES);
    const eSpeed = new Float32Array(MAX_ENEMIES);
    const eDamage = new Float32Array(MAX_ENEMIES);
    const eXpVal = new Float32Array(MAX_ENEMIES);
    const eTypeIdx = new Int32Array(MAX_ENEMIES);
    const eIsBoss = new Uint8Array(MAX_ENEMIES);
    const eActive = new Uint8Array(MAX_ENEMIES);
    const eFlash = new Float32Array(MAX_ENEMIES);
    const eKoTimer = new Float32Array(MAX_ENEMIES);
    const eTelegraph = new Float32Array(MAX_ENEMIES);
    const eAttackCooldown = new Float32Array(MAX_ENEMIES);
    const eAimAngle = new Float32Array(MAX_ENEMIES);

    // Player Projectiles SoA
    const pPosX = new Float32Array(MAX_PROJECTILES);
    const pPosY = new Float32Array(MAX_PROJECTILES);
    const pVelX = new Float32Array(MAX_PROJECTILES);
    const pVelY = new Float32Array(MAX_PROJECTILES);
    const pDmg = new Float32Array(MAX_PROJECTILES);
    const pTtl = new Float32Array(MAX_PROJECTILES);
    const pKind = new Int32Array(MAX_PROJECTILES);
    const pActive = new Uint8Array(MAX_PROJECTILES);

    // Enemy Projectiles / Telegraphed Hazards SoA
    const ebPosX = new Float32Array(MAX_ENEMY_BULLETS);
    const ebPosY = new Float32Array(MAX_ENEMY_BULLETS);
    const ebVelX = new Float32Array(MAX_ENEMY_BULLETS);
    const ebVelY = new Float32Array(MAX_ENEMY_BULLETS);
    const ebDmg = new Float32Array(MAX_ENEMY_BULLETS);
    const ebTtl = new Float32Array(MAX_ENEMY_BULLETS);
    const ebRadius = new Float32Array(MAX_ENEMY_BULLETS);
    const ebActive = new Uint8Array(MAX_ENEMY_BULLETS);

    // XP Gems SoA
    const gPosX = new Float32Array(MAX_GEMS);
    const gPosY = new Float32Array(MAX_GEMS);
    const gVal = new Float32Array(MAX_GEMS);
    const gActive = new Uint8Array(MAX_GEMS);

    // Pooled Particle Ring Buffer (Zero-GC)
    const partX = new Float32Array(MAX_PARTICLES);
    const partY = new Float32Array(MAX_PARTICLES);
    const partVx = new Float32Array(MAX_PARTICLES);
    const partVy = new Float32Array(MAX_PARTICLES);
    const partLife = new Float32Array(MAX_PARTICLES);
    const partMaxLife = new Float32Array(MAX_PARTICLES);
    const partSize = new Float32Array(MAX_PARTICLES);
    const partColorIdx = new Int32Array(MAX_PARTICLES);
    let partCursor = 0;

    const PARTICLE_COLORS_STD = ['#38bdf8', '#f43f5e', '#fbbf24', '#a855f7', '#4ade80', '#ffffff'];
    const PARTICLE_COLORS_HC = ['#00ffff', '#ff3366', '#ffff00', '#ff77ff', '#00ff66', '#ffffff'];

    const spawnParticles = (
      x: number,
      y: number,
      count: number,
      colorIdx: number,
      speedMin: number = 60,
      speedMax: number = 220,
      size: number = 3.5
    ) => {
      for (let i = 0; i < count; i++) {
        const idx = partCursor;
        partCursor = (partCursor + 1) % MAX_PARTICLES;
        const angle = Math.random() * Math.PI * 2;
        const spd = speedMin + Math.random() * (speedMax - speedMin);
        partX[idx] = x;
        partY[idx] = y;
        partVx[idx] = Math.cos(angle) * spd;
        partVy[idx] = Math.sin(angle) * spd;
        const life = 0.18 + Math.random() * 0.28;
        partLife[idx] = life;
        partMaxLife[idx] = life;
        partSize[idx] = size * (0.75 + Math.random() * 0.5);
        partColorIdx[idx] = colorIdx;
      }
    };

    // Player & Run State
    let playerX = 0;
    let playerY = 0;
    let playerVx = 0;
    let playerVy = 0;
    let playerFacing = 0;
    let playerHp = 100;
    let playerGhostHp = 100;
    let playerMaxHp = 100;
    let playerInvulnTimer = 0;
    let playerDashTimer = 0;
    let playerDashCooldown = 0;
    let playerScaleX = 1;
    let playerScaleY = 1;
    let walkDistAccumulator = 0;

    let xp = 0;
    let xpNext = getXpRequiredForLevel(1);
    let level = 1;
    let wave = 1;
    let waveElapsed = 0;
    let waveSpawnTimer = 0;
    let bossSpawnedThisWave = false;
    let activeBossSlot = -1;
    let activeBossTitle = '';
    let activeBossName = '';
    let score = 0;
    let kills = 0;
    let inventory: PowerUpInventory = { pulse_cannon: 1 };
    let newEnemyBanner: TelemetrySnapshot['newEnemyBanner'] = null;
    let bannerTimer = 0;

    // Weapon cooldown trackers
    let pulseTimer = 0;
    let orbitalAngle = 0;
    let orbitalHitCooldown = 0;
    let arcTimer = 0;
    let novaTimer = 0;
    let novaRingRadius = 0;
    let novaRingAlpha = 0;
    let seekerTimer = 0;
    let activeLightningArcs: Array<{ x1: number; y1: number; x2: number; y2: number; ttl: number }> = [];

    // Juice: Hitstop & Camera Trauma
    let hitstopTimer = 0;
    let cameraTrauma = 0;
    let defeatDelayTimer = 0;
    let pendingDefeat = false;
    let titleTourTime = 0;

    const keysHeld = new Set<string>();
    let pointerScreenX = viewportW / 2;
    let pointerScreenY = viewportH / 2;
    let pointerActive = false;

    const getActiveBossTelemetry = (): ActiveBossTelemetry | null => {
      if (
        activeBossSlot >= 0 &&
        eActive[activeBossSlot] === 1 &&
        eIsBoss[activeBossSlot] === 1 &&
        eKoTimer[activeBossSlot] <= 0
      ) {
        return {
          wave,
          name: activeBossName,
          title: activeBossTitle,
          hp: Math.max(0, Math.round(eHp[activeBossSlot])),
          maxHp: Math.round(eMaxHp[activeBossSlot]),
        };
      }
      return null;
    };

    const getSnapshot = (): TelemetrySnapshot => ({
      hp: Math.max(0, Math.round(playerHp)),
      maxHp: Math.round(playerMaxHp),
      xp: Math.round(xp),
      xpNext: Math.round(xpNext),
      level,
      wave,
      score: Math.round(score),
      kills,
      upgradesUsed: getUpgradesUsedCount(inventory),
      maxUpgradesPerRound: MAX_UPGRADES_PER_ROUND,
      inventory: { ...inventory },
      activeBoss: getActiveBossTelemetry(),
      newEnemyBanner,
    });

    const syncDomBars = () => {
      const hpRatio = Math.max(0, Math.min(1, playerHp / Math.max(1, playerMaxHp)));
      const ghostRatio = Math.max(0, Math.min(1, playerGhostHp / Math.max(1, playerMaxHp)));
      const xpRatio = Math.max(0, Math.min(1, xp / Math.max(1, xpNext)));
      const dashReadyRatio = playerDashCooldown <= 0 ? 1 : Math.max(0, Math.min(1, 1 - playerDashCooldown / 1.4));
      const waveCfg = getWaveConfig(wave);
      const waveRatio = Math.max(0, Math.min(1, waveElapsed / waveCfg.waveDurationSeconds));

      if (hudRefs.hpFillRef.current) {
        hudRefs.hpFillRef.current.style.transform = `scaleX(${hpRatio})`;
      }
      if (hudRefs.hpGhostRef.current) {
        hudRefs.hpGhostRef.current.style.transform = `scaleX(${ghostRatio})`;
      }
      if (hudRefs.xpFillRef.current) {
        hudRefs.xpFillRef.current.style.transform = `scaleX(${xpRatio})`;
      }
      if (hudRefs.dashFillRef.current) {
        hudRefs.dashFillRef.current.style.transform = `scaleX(${dashReadyRatio})`;
      }
      if (hudRefs.waveProgressRef.current) {
        hudRefs.waveProgressRef.current.style.transform = `scaleX(${waveRatio})`;
      }
      if (hudRefs.sectorTextRef.current) {
        const sec = getInfiniteSectorCoords(playerX, playerY, 1000);
        hudRefs.sectorTextRef.current.textContent = `${sec.sectorCode} [${Math.round(playerX)}, ${Math.round(playerY)}]`;
      }
    };

    const spawnEnemy = (archetypeId: EnemyArchetypeId, waveCfg = getWaveConfig(wave), angleOverride?: number) => {
      let slot = -1;
      for (let i = 0; i < MAX_ENEMIES; i++) {
        if (eActive[i] === 0) {
          slot = i;
          break;
        }
      }
      if (slot === -1) return -1;

      const arch = ENEMY_ARCHETYPES[archetypeId];
      const angle = angleOverride !== undefined ? angleOverride : Math.random() * Math.PI * 2;
      const spawnDist = Math.max(viewportW, viewportH) * 0.54 + 60 + Math.random() * 90;

      ePosX[slot] = playerX + Math.cos(angle) * spawnDist;
      ePosY[slot] = playerY + Math.sin(angle) * spawnDist;
      eVelX[slot] = 0;
      eVelY[slot] = 0;
      const scaledHp = Math.round(arch.baseHp * waveCfg.hpMultiplier);
      eHp[slot] = scaledHp;
      eMaxHp[slot] = scaledHp;
      eRadius[slot] = arch.radius;
      eSpeed[slot] = arch.baseSpeed * waveCfg.speedMultiplier;
      eDamage[slot] = Math.round(arch.baseDamage * waveCfg.damageMultiplier);
      eXpVal[slot] = arch.xpValue;
      eTypeIdx[slot] = ARCHETYPE_LIST.indexOf(archetypeId);
      eIsBoss[slot] = 0;
      eActive[slot] = 1;
      eFlash[slot] = 0;
      eKoTimer[slot] = 0;
      eTelegraph[slot] = 0;
      eAttackCooldown[slot] = 1.2 + Math.random() * 1.5;
      eAimAngle[slot] = angle + Math.PI;
      return slot;
    };

    const spawnTenthWaveBoss = (wNum: number) => {
      const bossCfg = getBossEncounterForWave(wNum);
      if (!bossCfg) return;
      const slot = spawnEnemy(bossCfg.id, getWaveConfig(wNum), -Math.PI / 4);
      if (slot === -1) return;

      ePosX[slot] = playerX + 340;
      ePosY[slot] = playerY - 120;
      eHp[slot] = bossCfg.maxHp;
      eMaxHp[slot] = bossCfg.maxHp;
      eRadius[slot] = bossCfg.radius;
      eSpeed[slot] = bossCfg.speed;
      eDamage[slot] = bossCfg.damage;
      eXpVal[slot] = bossCfg.xpReward;
      eIsBoss[slot] = 1;
      eAttackCooldown[slot] = 1.4;

      bossSpawnedThisWave = true;
      activeBossSlot = slot;
      activeBossName = bossCfg.name;
      activeBossTitle = bossCfg.title;

      newEnemyBanner = {
        wave: wNum,
        name: `BOSS FIGHT: ${bossCfg.name}`,
        description: bossCfg.title,
      };
      bannerTimer = 6.0;
      soundEngine.playWaveWarning(true);
      callbacksRef.current.onTelemetryUpdate(getSnapshot());
    };

    const spawnInitialWavePack = (wNum: number) => {
      const cfg = getWaveConfig(wNum);
      bossSpawnedThisWave = false;
      activeBossSlot = -1;

      const initialCount = Math.min(10, 4 + Math.floor(wNum * 1.2));
      for (let i = 0; i < initialCount; i++) {
        const chosen = cfg.availableEnemies[i % cfg.availableEnemies.length];
        spawnEnemy(chosen.id, cfg, (i / initialCount) * Math.PI * 2);
      }

      if (cfg.isBossWave) {
        spawnTenthWaveBoss(wNum);
      } else if (cfg.isFifthWaveMilestone && cfg.newlyUnlockedEnemy) {
        const unlockedId = cfg.newlyUnlockedEnemy.id;
        spawnEnemy(unlockedId, cfg, 0.4);
        newEnemyBanner = {
          wave: wNum,
          name: cfg.newlyUnlockedEnemy.name,
          description: cfg.newlyUnlockedEnemy.description,
        };
        bannerTimer = 5.0;
        soundEngine.playWaveWarning(true);
      } else {
        soundEngine.playWaveWarning(false);
      }
    };

    const resetAndStartRun = (starterId: PowerUpId = 'pulse_cannon') => {
      eActive.fill(0);
      eIsBoss.fill(0);
      pActive.fill(0);
      ebActive.fill(0);
      gActive.fill(0);
      partLife.fill(0);
      activeLightningArcs = [];

      playerX = 0;
      playerY = 0;
      playerVx = 0;
      playerVy = 0;
      playerMaxHp = 100;
      playerHp = 100;
      playerGhostHp = 100;
      playerInvulnTimer = 1.4;
      playerDashTimer = 0;
      playerDashCooldown = 0;
      playerScaleX = 1;
      playerScaleY = 1;

      xp = 0;
      level = 1;
      xpNext = getXpRequiredForLevel(1);
      wave = 1;
      waveElapsed = 0;
      waveSpawnTimer = 0;
      bossSpawnedThisWave = false;
      activeBossSlot = -1;
      score = 0;
      kills = 0;
      hitstopTimer = 0;
      cameraTrauma = 0;
      pendingDefeat = false;
      defeatDelayTimer = 0;
      newEnemyBanner = null;
      bannerTimer = 0;

      inventory = { [starterId]: 1 };
      keysHeld.clear();

      spawnInitialWavePack(1);
      syncDomBars();
      callbacksRef.current.onTelemetryUpdate(getSnapshot());
    };

    const spawnXpGem = (x: number, y: number, val: number) => {
      for (let i = 0; i < MAX_GEMS; i++) {
        if (gActive[i] === 0) {
          gPosX[i] = x;
          gPosY[i] = y;
          gVal[i] = val;
          gActive[i] = 1;
          return;
        }
      }
    };

    const spawnPlayerProjectile = (
      x: number,
      y: number,
      vx: number,
      vy: number,
      dmg: number,
      ttl: number,
      kind: number
    ) => {
      for (let i = 0; i < MAX_PROJECTILES; i++) {
        if (pActive[i] === 0) {
          pPosX[i] = x;
          pPosY[i] = y;
          pVelX[i] = vx;
          pVelY[i] = vy;
          pDmg[i] = dmg;
          pTtl[i] = ttl;
          pKind[i] = kind;
          pActive[i] = 1;
          return;
        }
      }
    };

    const spawnEnemyBullet = (
      x: number,
      y: number,
      vx: number,
      vy: number,
      dmg: number,
      ttl: number,
      rad: number = 6
    ) => {
      for (let i = 0; i < MAX_ENEMY_BULLETS; i++) {
        if (ebActive[i] === 0) {
          ebPosX[i] = x;
          ebPosY[i] = y;
          ebVelX[i] = vx;
          ebVelY[i] = vy;
          ebDmg[i] = dmg;
          ebTtl[i] = ttl;
          ebRadius[i] = rad;
          ebActive[i] = 1;
          return;
        }
      }
    };

    const damageEnemy = (idx: number, dmgAmount: number, knockX: number, knockY: number) => {
      if (eActive[idx] === 0 || eKoTimer[idx] > 0) return;

      let actualDmg = dmgAmount;
      if (ARCHETYPE_LIST[eTypeIdx[idx]] === 'juggernaut' && eIsBoss[idx] === 0) {
        actualDmg = Math.max(1, Math.round(dmgAmount * 0.72));
      }

      eHp[idx] -= actualDmg;
      eFlash[idx] = 0.06;
      const kbFactor = eIsBoss[idx] === 1 ? 2 : 8;
      ePosX[idx] += knockX * kbFactor;
      ePosY[idx] += knockY * kbFactor;

      if (eHp[idx] <= 0) {
        const wasBoss = eIsBoss[idx] === 1;
        eKoTimer[idx] = wasBoss ? 0.45 : 0.24;
        eVelX[idx] = knockX * (wasBoss ? 90 : 210);
        eVelY[idx] = knockY * (wasBoss ? 90 : 210);
        hitstopTimer = Math.max(hitstopTimer, wasBoss ? 0.075 : 0.03);
        cameraTrauma = Math.min(1, cameraTrauma + (wasBoss ? 0.55 : 0.14));
        kills += 1;
        score += Math.round((wasBoss ? 500 : 25) * (1 + (wave - 1) * 0.25));
        spawnXpGem(ePosX[idx], ePosY[idx], eXpVal[idx]);
        spawnParticles(ePosX[idx], ePosY[idx], wasBoss ? 36 : 14, wasBoss ? 2 : 1, 80, 280, wasBoss ? 5.5 : 4.0);
        soundEngine.playHit(true);

        // Balanced Sustain: Boss defeat restores +35 HP; regular enemies have a 18% chance to restore +3 HP
        if (wasBoss) {
          playerHp = Math.min(playerMaxHp, playerHp + 35);
          activeBossSlot = -1;
        } else if (Math.random() < 0.18) {
          playerHp = Math.min(playerMaxHp, playerHp + 3);
        }

        callbacksRef.current.onTelemetryUpdate(getSnapshot());
      } else {
        spawnParticles(ePosX[idx], ePosY[idx], 4, 0, 40, 140, 2.8);
        soundEngine.playHit(false);
        if (eIsBoss[idx] === 1) {
          callbacksRef.current.onTelemetryUpdate(getSnapshot());
        }
      }
    };

    const handlePlayerLevelUp = () => {
      level += 1;
      xpNext = getXpRequiredForLevel(level);
      // Balanced sustain: +15 HP hull repair on every level up
      playerHp = Math.min(playerMaxHp, playerHp + 15);
      soundEngine.playLevelUp();

      // Check 5-Upgrade Cap per round
      if (canDraftUpgrade(inventory)) {
        keysHeld.clear();
        const snap = getSnapshot();
        callbacksRef.current.onTelemetryUpdate(snap);
        callbacksRef.current.onTriggerLevelUp(snap);
      } else {
        // Max 5 upgrades reached: grant Overdrive Hull Repair + Score Bonus
        playerHp = Math.min(playerMaxHp, playerHp + 20);
        score += 250;
        callbacksRef.current.onTelemetryUpdate(getSnapshot());
      }
    };

    simControlsRef.current = {
      startNewRun: (starterId: PowerUpId = 'pulse_cannon') => {
        resetAndStartRun(starterId);
      },
      applyUpgradeAndResume: (powerUpId: PowerUpId) => {
        if (canDraftUpgrade(inventory)) {
          const curLvl = inventory[powerUpId] ?? 0;
          const maxLvl = POWER_UP_CATALOG[powerUpId].maxLevel;
          inventory = {
            ...inventory,
            [powerUpId]: Math.min(maxLvl, curLvl + 1),
          };
          if (powerUpId === 'reactive_hull') {
            playerMaxHp += 30;
            playerHp = Math.min(playerMaxHp, playerHp + 35);
            playerGhostHp = playerHp;
          }
        }
        keysHeld.clear();
        syncDomBars();
        callbacksRef.current.onTelemetryUpdate(getSnapshot());
      },
      triggerInstantLevelUp: () => {
        xp = 0;
        handlePlayerLevelUp();
      },
      advanceToWave: (targetWave: number) => {
        // Clear existing enemies when warping to a milestone/boss wave for a clean encounter
        for (let i = 0; i < MAX_ENEMIES; i++) {
          eActive[i] = 0;
          eIsBoss[i] = 0;
        }
        ebActive.fill(0);
        wave = Math.max(1, targetWave);
        waveElapsed = 0;
        spawnInitialWavePack(wave);
        syncDomBars();
        callbacksRef.current.onTelemetryUpdate(getSnapshot());
      },
    };

    spawnInitialWavePack(1);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        (document.activeElement.tagName === 'INPUT' ||
          document.activeElement.getAttribute('data-rebinding') === 'true')
      ) {
        return;
      }

      const kb = settingsRef.current.keyBindings;
      const code = e.code;

      if (code === kb.fullscreen || code === 'F11') {
        e.preventDefault();
        callbacksRef.current.onToggleFullscreen();
        return;
      }

      if (gameStateRef.current === 'playing') {
        if (code === kb.pause || code === 'Escape' || code === 'KeyP') {
          e.preventDefault();
          keysHeld.clear();
          callbacksRef.current.onTogglePause();
          return;
        }

        if (code === kb.dash && !keysHeld.has(code)) {
          e.preventDefault();
          if (playerDashCooldown <= 0) {
            const thrusterLvl = inventory.kinetic_thrusters ?? 0;
            const cdReduction = Math.min(0.6, thrusterLvl * 0.1);
            playerDashTimer = 0.18;
            playerDashCooldown = 1.35 * (1 - cdReduction);
            playerInvulnTimer = Math.max(playerInvulnTimer, 0.28);
            playerScaleX = 1.28;
            playerScaleY = 0.74;
            soundEngine.playDash();
            spawnParticles(playerX, playerY, 10, 0, 50, 180, 3.5);
          }
        }
      } else if (gameStateRef.current === 'paused') {
        if (code === kb.pause || code === 'Escape' || code === 'KeyP') {
          e.preventDefault();
          callbacksRef.current.onTogglePause();
          return;
        }
      }

      keysHeld.add(code);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysHeld.delete(e.code);
    };

    const handleBlurOrVisibility = () => {
      keysHeld.clear();
    };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerScreenX = e.clientX - rect.left;
      pointerScreenY = e.clientY - rect.top;
      pointerActive = true;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlurOrVisibility);
    document.addEventListener('visibilitychange', handleBlurOrVisibility);
    canvas.addEventListener('pointermove', handlePointerMove);

    let lastTime = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(0, rawDt), 0.05);

      const state = gameStateRef.current;
      const currentSettings = settingsRef.current;
      const contrastMode: ContrastMode = currentSettings.contrastMode;
      const isHighContrast = contrastMode === 'high';

      cameraTrauma = Math.max(0, cameraTrauma - dt * 1.8);
      if (hitstopTimer > 0) {
        hitstopTimer = Math.max(0, hitstopTimer - dt);
      }

      playerScaleX += (1 - playerScaleX) * Math.min(1, dt * 14);
      playerScaleY += (1 - playerScaleY) * Math.min(1, dt * 14);

      if (playerGhostHp > playerHp) {
        playerGhostHp = Math.max(playerHp, playerGhostHp - dt * 32);
      } else {
        playerGhostHp = playerHp;
      }

      if (bannerTimer > 0) {
        bannerTimer = Math.max(0, bannerTimer - dt);
        if (bannerTimer <= 0 && newEnemyBanner) {
          newEnemyBanner = null;
          callbacksRef.current.onTelemetryUpdate(getSnapshot());
        }
      }

      if (state === 'title') {
        titleTourTime += dt;
        playerX = Math.cos(titleTourTime * 0.22) * 320;
        playerY = Math.sin(titleTourTime * 0.16) * 240;
        playerFacing = titleTourTime * 0.6;
        orbitalAngle += dt * 2.4;

        for (let i = 0; i < MAX_ENEMIES; i++) {
          if (eActive[i] === 1) {
            const ang = titleTourTime * 0.5 + i * 0.7;
            ePosX[i] += Math.cos(ang) * 45 * dt;
            ePosY[i] += Math.sin(ang) * 45 * dt;
          }
        }
      }

      if (state === 'playing') {
        if (pendingDefeat) {
          defeatDelayTimer -= dt;
          if (defeatDelayTimer <= 0) {
            pendingDefeat = false;
            callbacksRef.current.onTriggerGameOver(getSnapshot());
          }
        } else {
          const simDt = hitstopTimer > 0 ? 0 : dt;

          // 1. Wave Progression & 10th-Wave Boss Gate
          const waveCfg = getWaveConfig(wave);
          const bossAlive = getActiveBossTelemetry() !== null;

          // At the end of a 10th wave, if the boss hasn't spawned yet, spawn it; while boss is alive, hold wave timer!
          if (!bossAlive) {
            waveElapsed += simDt;
          }
          waveSpawnTimer += simDt;

          if (waveElapsed >= waveCfg.waveDurationSeconds && !bossAlive) {
            wave += 1;
            waveElapsed = 0;
            spawnInitialWavePack(wave);
            callbacksRef.current.onTelemetryUpdate(getSnapshot());
          } else if (waveSpawnTimer >= waveCfg.spawnInterval) {
            waveSpawnTimer = 0;
            let activeCount = 0;
            for (let i = 0; i < MAX_ENEMIES; i++) {
              if (eActive[i] === 1) activeCount++;
            }
            // During a Boss Wave, limit regular minion count so the Boss Fight stays fair & balanced
            const effectiveBudget = bossAlive ? Math.min(8, waveCfg.spawnBudget) : waveCfg.spawnBudget;
            if (activeCount < effectiveBudget) {
              const randArch =
                waveCfg.availableEnemies[Math.floor(Math.random() * waveCfg.availableEnemies.length)];
              spawnEnemy(randArch.id, waveCfg);
            }
          }

          // 2. Player Movement
          const kb = currentSettings.keyBindings;
          let moveX = 0;
          let moveY = 0;
          if (keysHeld.has(kb.moveRight) || keysHeld.has('ArrowRight')) moveX += 1;
          if (keysHeld.has(kb.moveLeft) || keysHeld.has('ArrowLeft')) moveX -= 1;
          if (keysHeld.has(kb.moveDown) || keysHeld.has('ArrowDown')) moveY += 1;
          if (keysHeld.has(kb.moveUp) || keysHeld.has('ArrowUp')) moveY -= 1;

          const moveLen = Math.hypot(moveX, moveY);
          if (moveLen > 0) {
            moveX /= moveLen;
            moveY /= moveLen;
            playerFacing = Math.atan2(moveY, moveX);
          } else if (pointerActive) {
            playerFacing = Math.atan2(pointerScreenY - viewportH / 2, pointerScreenX - viewportW / 2);
          }

          const thrusterLvl = inventory.kinetic_thrusters ?? 0;
          const speedMult = 1 + thrusterLvl * 0.14;
          const dashBoost = playerDashTimer > 0 ? 2.65 : 1.0;
          const baseSpeed = 240 * speedMult * dashBoost;

          playerVx = moveX * baseSpeed;
          playerVy = moveY * baseSpeed;
          playerX += playerVx * simDt;
          playerY += playerVy * simDt;
          walkDistAccumulator += Math.hypot(playerVx * simDt, playerVy * simDt);

          if (playerDashTimer > 0) playerDashTimer = Math.max(0, playerDashTimer - simDt);
          if (playerDashCooldown > 0) playerDashCooldown = Math.max(0, playerDashCooldown - simDt);
          if (playerInvulnTimer > 0) playerInvulnTimer = Math.max(0, playerInvulnTimer - simDt);

          // 3. Player Weapons Execution
          const overclockLvl = inventory.overclock_core ?? 0;
          const globalDmgMult = 1 + overclockLvl * 0.15;
          const globalCdMult = Math.max(0.38, 1 - overclockLvl * 0.09);

          let nearestIdx = -1;
          let nearestDistSq = Infinity;
          for (let i = 0; i < MAX_ENEMIES; i++) {
            if (eActive[i] === 1 && eKoTimer[i] <= 0) {
              const dx = ePosX[i] - playerX;
              const dy = ePosY[i] - playerY;
              const d2 = dx * dx + dy * dy;
              if (d2 < nearestDistSq) {
                nearestDistSq = d2;
                nearestIdx = i;
              }
            }
          }

          // Weapon A: Pulse Autocannon
          const pulseLvl = inventory.pulse_cannon ?? 0;
          if (pulseLvl > 0) {
            const pStats = POWER_UP_CATALOG.pulse_cannon.computeStats(pulseLvl);
            pulseTimer -= simDt;
            if (pulseTimer <= 0 && nearestIdx !== -1 && nearestDistSq <= pStats.radius * pStats.radius * 1.6) {
              pulseTimer = pStats.cooldown * globalCdMult;
              const baseAngle = Math.atan2(ePosY[nearestIdx] - playerY, ePosX[nearestIdx] - playerX);
              const count = pStats.projectiles;
              const spread = 0.14;
              for (let b = 0; b < count; b++) {
                const offset = (b - (count - 1) / 2) * spread;
                const ang = baseAngle + offset;
                spawnPlayerProjectile(
                  playerX + Math.cos(ang) * 18,
                  playerY + Math.sin(ang) * 18,
                  Math.cos(ang) * 580,
                  Math.sin(ang) * 580,
                  Math.round(pStats.damage * globalDmgMult),
                  0.95,
                  0
                );
              }
              soundEngine.playShot(1.0);
            }
          }

          // Weapon B: Orbital Glaives
          const orbitalLvl = inventory.orbital_blades ?? 0;
          if (orbitalLvl > 0) {
            const oStats = POWER_UP_CATALOG.orbital_blades.computeStats(orbitalLvl);
            orbitalAngle += simDt * (3.3 + orbitalLvl * 0.28);
            orbitalHitCooldown = Math.max(0, orbitalHitCooldown - simDt);
            if (orbitalHitCooldown <= 0) {
              let didHit = false;
              const bladeCount = oStats.projectiles;
              for (let b = 0; b < bladeCount; b++) {
                const bAng = orbitalAngle + (b * Math.PI * 2) / bladeCount;
                const bx = playerX + Math.cos(bAng) * oStats.radius;
                const by = playerY + Math.sin(bAng) * oStats.radius;
                for (let i = 0; i < MAX_ENEMIES; i++) {
                  if (eActive[i] === 1 && eKoTimer[i] <= 0) {
                    const dx = ePosX[i] - bx;
                    const dy = ePosY[i] - by;
                    const rSum = eRadius[i] + 15;
                    if (dx * dx + dy * dy <= rSum * rSum) {
                      const dist = Math.hypot(dx, dy) || 1;
                      damageEnemy(i, Math.round(oStats.damage * globalDmgMult), dx / dist, dy / dist);
                      didHit = true;
                    }
                  }
                }
              }
              if (didHit) {
                orbitalHitCooldown = 0.15;
              }
            }
          }

          // Weapon C: Voltaic Arc Emitter
          const arcLvl = inventory.chain_arc ?? 0;
          if (arcLvl > 0) {
            const aStats = POWER_UP_CATALOG.chain_arc.computeStats(arcLvl);
            arcTimer -= simDt;
            if (arcTimer <= 0 && nearestIdx !== -1 && nearestDistSq <= aStats.radius * aStats.radius) {
              arcTimer = aStats.cooldown * globalCdMult;
              let curX = playerX;
              let curY = playerY;
              const hitSet = new Set<number>();
              for (let bounce = 0; bounce < aStats.projectiles; bounce++) {
                let bestTarget = -1;
                let bestD2 = aStats.radius * aStats.radius;
                for (let i = 0; i < MAX_ENEMIES; i++) {
                  if (eActive[i] === 1 && eKoTimer[i] <= 0 && !hitSet.has(i)) {
                    const dx = ePosX[i] - curX;
                    const dy = ePosY[i] - curY;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < bestD2) {
                      bestD2 = d2;
                      bestTarget = i;
                    }
                  }
                }
                if (bestTarget === -1) break;
                hitSet.add(bestTarget);
                const tx = ePosX[bestTarget];
                const ty = ePosY[bestTarget];
                activeLightningArcs.push({ x1: curX, y1: curY, x2: tx, y2: ty, ttl: 0.16 });
                const dx = tx - curX;
                const dy = ty - curY;
                const dist = Math.hypot(dx, dy) || 1;
                damageEnemy(bestTarget, Math.round(aStats.damage * globalDmgMult), dx / dist, dy / dist);
                curX = tx;
                curY = ty;
              }
              soundEngine.playShot(1.35);
            }
          }

          // Weapon D: Seismic Shockwave Nova
          const novaLvl = inventory.nova_emitter ?? 0;
          if (novaLvl > 0) {
            const nStats = POWER_UP_CATALOG.nova_emitter.computeStats(novaLvl);
            novaTimer -= simDt;
            if (novaTimer <= 0) {
              novaTimer = nStats.cooldown * globalCdMult;
              novaRingRadius = nStats.radius;
              novaRingAlpha = 0.9;
              soundEngine.playShot(0.65);
              for (let i = 0; i < MAX_ENEMIES; i++) {
                if (eActive[i] === 1 && eKoTimer[i] <= 0) {
                  const dx = ePosX[i] - playerX;
                  const dy = ePosY[i] - playerY;
                  const dist = Math.hypot(dx, dy);
                  if (dist <= nStats.radius + eRadius[i]) {
                    const nx = dx / (dist || 1);
                    const ny = dy / (dist || 1);
                    damageEnemy(i, Math.round(nStats.damage * globalDmgMult), nx * 2.2, ny * 2.2);
                  }
                }
              }
            }
          }

          // Weapon E: Swarm Micro-Pods
          const seekerLvl = inventory.seeker_missiles ?? 0;
          if (seekerLvl > 0) {
            const sStats = POWER_UP_CATALOG.seeker_missiles.computeStats(seekerLvl);
            seekerTimer -= simDt;
            if (seekerTimer <= 0 && nearestIdx !== -1) {
              seekerTimer = sStats.cooldown * globalCdMult;
              for (let m = 0; m < sStats.projectiles; m++) {
                const ang = playerFacing + ((m - (sStats.projectiles - 1) / 2) * 0.45);
                spawnPlayerProjectile(
                  playerX,
                  playerY,
                  Math.cos(ang) * 400,
                  Math.sin(ang) * 400,
                  Math.round(sStats.damage * globalDmgMult),
                  1.5,
                  1
                );
              }
              soundEngine.playShot(0.85);
            }
          }

          // 4. Step Player Projectiles
          for (let p = 0; p < MAX_PROJECTILES; p++) {
            if (pActive[p] === 0) continue;
            pTtl[p] -= simDt;
            if (pTtl[p] <= 0) {
              pActive[p] = 0;
              continue;
            }

            if (pKind[p] === 1 && nearestIdx !== -1) {
              const desiredAng = Math.atan2(ePosY[nearestIdx] - pPosY[p], ePosX[nearestIdx] - pPosX[p]);
              const spd = Math.hypot(pVelX[p], pVelY[p]) || 400;
              pVelX[p] += (Math.cos(desiredAng) * spd - pVelX[p]) * Math.min(1, simDt * 8);
              pVelY[p] += (Math.sin(desiredAng) * spd - pVelY[p]) * Math.min(1, simDt * 8);
            }

            pPosX[p] += pVelX[p] * simDt;
            pPosY[p] += pVelY[p] * simDt;

            for (let i = 0; i < MAX_ENEMIES; i++) {
              if (eActive[i] === 1 && eKoTimer[i] <= 0) {
                const dx = ePosX[i] - pPosX[p];
                const dy = ePosY[i] - pPosY[p];
                const rSum = eRadius[i] + 6;
                if (dx * dx + dy * dy <= rSum * rSum) {
                  pActive[p] = 0;
                  const vLen = Math.hypot(pVelX[p], pVelY[p]) || 1;
                  damageEnemy(i, pDmg[p], pVelX[p] / vLen, pVelY[p] / vLen);
                  break;
                }
              }
            }
          }

          // 5. Step Distinct Enemy & 10th-Wave Boss Behavior Policies
          let activeAttackersCount = 0;
          const MAX_CONCURRENT_TELEGRAPHS = 3;

          for (let i = 0; i < MAX_ENEMIES; i++) {
            if (eActive[i] === 0) continue;
            if (eFlash[i] > 0) eFlash[i] = Math.max(0, eFlash[i] - dt);

            if (eKoTimer[i] > 0) {
              eKoTimer[i] -= dt;
              ePosX[i] += eVelX[i] * dt;
              ePosY[i] += eVelY[i] * dt;
              eVelX[i] *= 0.88;
              eVelY[i] *= 0.88;
              if (eKoTimer[i] <= 0) {
                eActive[i] = 0;
                eIsBoss[i] = 0;
              }
              continue;
            }

            const dx = playerX - ePosX[i];
            const dy = playerY - ePosY[i];
            const dist = Math.hypot(dx, dy) || 1;
            const nx = dx / dist;
            const ny = dy / dist;
            const archId = ARCHETYPE_LIST[eTypeIdx[i]];
            const spd = eSpeed[i];

            eAttackCooldown[i] = Math.max(0, eAttackCooldown[i] - simDt);

            if (eIsBoss[i] === 1) {
              // 10th-Wave Boss Behavior: Deliberate siege advance + telegraphed radial ring burst
              eVelX[i] = nx * spd;
              eVelY[i] = ny * spd;
              eAimAngle[i] = Math.atan2(ny, nx);
              if (eTelegraph[i] > 0) {
                eVelX[i] *= 0.25;
                eVelY[i] *= 0.25;
                eTelegraph[i] -= simDt;
                if (eTelegraph[i] <= 0) {
                  const volleyCount = 8;
                  for (let v = 0; v < volleyCount; v++) {
                    const vang = eAimAngle[i] + (v * Math.PI * 2) / volleyCount;
                    spawnEnemyBullet(
                      ePosX[i],
                      ePosY[i],
                      Math.cos(vang) * 230,
                      Math.sin(vang) * 230,
                      eDamage[i],
                      2.8,
                      8
                    );
                  }
                  eAttackCooldown[i] = 3.2;
                }
              } else if (eAttackCooldown[i] <= 0 && dist < 440) {
                eTelegraph[i] = 0.75;
              }
            } else if (archId === 'swarmer') {
              const weave = Math.sin(waveElapsed * 4 + i) * 0.32;
              eVelX[i] = (nx - ny * weave) * spd;
              eVelY[i] = (ny + nx * weave) * spd;
              eAimAngle[i] = Math.atan2(ny, nx);
            } else if (archId === 'spitter') {
              if (eTelegraph[i] > 0) {
                eVelX[i] = 0;
                eVelY[i] = 0;
                eTelegraph[i] -= simDt;
                if (eTelegraph[i] <= 0) {
                  spawnEnemyBullet(
                    ePosX[i],
                    ePosY[i],
                    Math.cos(eAimAngle[i]) * 260,
                    Math.sin(eAimAngle[i]) * 260,
                    eDamage[i],
                    2.4,
                    6
                  );
                  eAttackCooldown[i] = 2.8;
                }
              } else {
                if (dist < 220) {
                  eVelX[i] = (-nx * 0.7 - ny * 0.5) * spd;
                  eVelY[i] = (-ny * 0.7 + nx * 0.5) * spd;
                } else if (dist > 320) {
                  eVelX[i] = nx * spd;
                  eVelY[i] = ny * spd;
                } else {
                  eVelX[i] = -ny * spd * 0.75;
                  eVelY[i] = nx * spd * 0.75;
                }
                eAimAngle[i] = Math.atan2(ny, nx);
                if (dist < 380 && eAttackCooldown[i] <= 0 && activeAttackersCount < MAX_CONCURRENT_TELEGRAPHS) {
                  eTelegraph[i] = 0.45;
                  activeAttackersCount++;
                }
              }
            } else if (archId === 'charger') {
              if (eTelegraph[i] > 0) {
                eTelegraph[i] -= simDt;
                if (eTelegraph[i] > 0.22) {
                  eVelX[i] = 0;
                  eVelY[i] = 0;
                } else {
                  eVelX[i] = Math.cos(eAimAngle[i]) * spd * 2.8;
                  eVelY[i] = Math.sin(eAimAngle[i]) * spd * 2.8;
                }
                if (eTelegraph[i] <= 0) {
                  eAttackCooldown[i] = 3.0;
                }
              } else {
                eVelX[i] = nx * spd;
                eVelY[i] = ny * spd;
                eAimAngle[i] = Math.atan2(ny, nx);
                if (dist < 270 && eAttackCooldown[i] <= 0 && activeAttackersCount < MAX_CONCURRENT_TELEGRAPHS) {
                  eTelegraph[i] = 0.55;
                  eAimAngle[i] = Math.atan2(ny, nx);
                  activeAttackersCount++;
                }
              }
            } else if (archId === 'orbiter') {
              const radialPull = dist > 200 ? 0.55 : dist < 150 ? -0.45 : 0;
              eVelX[i] = (nx * radialPull - ny * 0.95) * spd;
              eVelY[i] = (ny * radialPull + nx * 0.95) * spd;
              eAimAngle[i] = Math.atan2(ny, nx);
              if (eAttackCooldown[i] <= 0 && activeAttackersCount < MAX_CONCURRENT_TELEGRAPHS) {
                eTelegraph[i] = 0.5;
                eAttackCooldown[i] = 3.2;
                spawnEnemyBullet(ePosX[i], ePosY[i], nx * 290, ny * 290, eDamage[i], 2.0, 7);
                activeAttackersCount++;
              }
            } else {
              eVelX[i] = nx * spd;
              eVelY[i] = ny * spd;
              eAimAngle[i] = Math.atan2(ny, nx);
            }
          }

          stepVectorizedEntitiesSoA(ePosX, ePosY, eVelX, eVelY, eDistSq, playerX, playerY, simDt, MAX_ENEMIES);

          // Contact Damage
          if (playerInvulnTimer <= 0) {
            for (let i = 0; i < MAX_ENEMIES; i++) {
              if (eActive[i] === 1 && eKoTimer[i] <= 0) {
                const rSum = eRadius[i] + 15;
                if (eDistSq[i] <= rSum * rSum) {
                  const hullLvl = inventory.reactive_hull ?? 0;
                  const mitigation = Math.min(0.5, hullLvl * 0.06);
                  const dmgTaken = Math.max(2, Math.round(eDamage[i] * (1 - mitigation) * 0.6));
                  playerHp = Math.max(0, playerHp - dmgTaken);
                  playerInvulnTimer = 1.0;
                  hitstopTimer = 0.045;
                  cameraTrauma = Math.min(1, cameraTrauma + 0.42);
                  const dx = ePosX[i] - playerX;
                  const dy = ePosY[i] - playerY;
                  const dist = Math.hypot(dx, dy) || 1;
                  ePosX[i] += (dx / dist) * 80;
                  ePosY[i] += (dy / dist) * 80;
                  eTelegraph[i] = 0;
                  eAttackCooldown[i] = 2.0;
                  soundEngine.playPlayerHurt();
                  spawnParticles(playerX, playerY, 18, 1, 90, 260, 4.5);
                  callbacksRef.current.onTelemetryUpdate(getSnapshot());
                  if (playerHp <= 0 && !pendingDefeat) {
                    pendingDefeat = true;
                    defeatDelayTimer = 0.45;
                    soundEngine.playGameOver();
                  }
                  break;
                }
              }
            }
          }

          // 6. Step Enemy Projectiles
          for (let b = 0; b < MAX_ENEMY_BULLETS; b++) {
            if (ebActive[b] === 0) continue;
            ebTtl[b] -= simDt;
            if (ebTtl[b] <= 0) {
              ebActive[b] = 0;
              continue;
            }
            ebPosX[b] += ebVelX[b] * simDt;
            ebPosY[b] += ebVelY[b] * simDt;

            if (playerInvulnTimer <= 0) {
              const dx = ebPosX[b] - playerX;
              const dy = ebPosY[b] - playerY;
              const rSum = ebRadius[b] + 14;
              if (dx * dx + dy * dy <= rSum * rSum) {
                ebActive[b] = 0;
                const hullLvl = inventory.reactive_hull ?? 0;
                const mitigation = Math.min(0.5, hullLvl * 0.06);
                const dmgTaken = Math.max(2, Math.round(ebDmg[b] * (1 - mitigation) * 0.6));
                playerHp = Math.max(0, playerHp - dmgTaken);
                playerInvulnTimer = 0.9;
                cameraTrauma = Math.min(1, cameraTrauma + 0.35);
                soundEngine.playPlayerHurt();
                spawnParticles(playerX, playerY, 14, 1, 70, 210, 4.0);
                callbacksRef.current.onTelemetryUpdate(getSnapshot());
                if (playerHp <= 0 && !pendingDefeat) {
                  pendingDefeat = true;
                  defeatDelayTimer = 0.45;
                  soundEngine.playGameOver();
                }
              }
            }
          }

          // 7. Step XP Gems Magnetization & Collection
          const magnetLvl = inventory.magnet_field ?? 0;
          const magnetRadius = 190 + magnetLvl * 45;
          const magnetRadiusSq = magnetRadius * magnetRadius;
          const xpBonusMult = 1 + magnetLvl * 0.12;

          for (let g = 0; g < MAX_GEMS; g++) {
            if (gActive[g] === 0) continue;
            const dx = playerX - gPosX[g];
            const dy = playerY - gPosY[g];
            const d2 = dx * dx + dy * dy;
            if (d2 <= magnetRadiusSq) {
              const d = Math.sqrt(d2) || 1;
              gPosX[g] += (dx / d) * 450 * simDt;
              gPosY[g] += (dy / d) * 450 * simDt;
              if (d <= 24) {
                gActive[g] = 0;
                xp += Math.round(gVal[g] * xpBonusMult);
                score += 10;
                soundEngine.playXpPickup(1 + (xp / Math.max(1, xpNext)) * 0.3);
                spawnParticles(playerX, playerY, 4, 4, 40, 110, 2.5);

                if (xp >= xpNext) {
                  xp -= xpNext;
                  handlePlayerLevelUp();
                } else {
                  callbacksRef.current.onTelemetryUpdate(getSnapshot());
                }
              }
            }
          }
        }
      }

      if (novaRingAlpha > 0) {
        novaRingAlpha = Math.max(0, novaRingAlpha - dt * 2.4);
      }
      for (let i = activeLightningArcs.length - 1; i >= 0; i--) {
        activeLightningArcs[i].ttl -= dt;
        if (activeLightningArcs[i].ttl <= 0) {
          activeLightningArcs.splice(i, 1);
        }
      }
      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (partLife[i] > 0) {
          partLife[i] -= dt;
          partX[i] += partVx[i] * dt;
          partY[i] += partVy[i] * dt;
          partVx[i] *= 0.92;
          partVy[i] *= 0.92;
        }
      }

      syncDomBars();

      // =======================================================================
      // Rendering Pass
      // =======================================================================
      ctx.save();
      ctx.scale(dpr, dpr);

      ctx.fillStyle = isHighContrast ? '#000000' : '#090d16';
      ctx.fillRect(0, 0, viewportW, viewportH);

      const shakePower =
        cameraTrauma * cameraTrauma * 14 * (currentSettings.screenShake / 100);
      const shakeX = (Math.random() * 2 - 1) * shakePower;
      const shakeY = (Math.random() * 2 - 1) * shakePower;

      const camX = playerX - viewportW / 2 + shakeX;
      const camY = playerY - viewportH / 2 + shakeY;

      const gridStep = 96;
      const minorColor = isHighContrast ? '#262626' : '#131c2e';
      const majorColor = isHighContrast ? '#525252' : '#1e293b';

      const startGridX = Math.floor(camX / gridStep) * gridStep;
      const startGridY = Math.floor(camY / gridStep) * gridStep;

      ctx.lineWidth = isHighContrast ? 1.5 : 1;
      for (let gx = startGridX; gx < camX + viewportW + gridStep; gx += gridStep) {
        const sx = gx - camX;
        const isMajor = Math.abs(Math.round(gx / gridStep)) % 5 === 0;
        ctx.strokeStyle = isMajor ? majorColor : minorColor;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, viewportH);
        ctx.stroke();
      }
      for (let gy = startGridY; gy < camY + viewportH + gridStep; gy += gridStep) {
        const sy = gy - camY;
        const isMajor = Math.abs(Math.round(gy / gridStep)) % 5 === 0;
        ctx.strokeStyle = isMajor ? majorColor : minorColor;
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(viewportW, sy);
        ctx.stroke();
      }

      const beaconStep = 480;
      const bStartX = Math.floor(camX / beaconStep) * beaconStep;
      const bStartY = Math.floor(camY / beaconStep) * beaconStep;
      ctx.fillStyle = isHighContrast ? '#737373' : '#334155';
      ctx.font = '600 10px "JetBrains Mono", monospace';
      for (let bx = bStartX; bx < camX + viewportW + beaconStep; bx += beaconStep) {
        for (let by = bStartY; by < camY + viewportH + beaconStep; by += beaconStep) {
          const sx = bx - camX;
          const sy = by - camY;
          ctx.beginPath();
          ctx.arc(sx, sy, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillText(`${bx / beaconStep},${by / beaconStep}`, sx + 8, sy - 6);
        }
      }

      for (let g = 0; g < MAX_GEMS; g++) {
        if (gActive[g] === 0) continue;
        const sx = gPosX[g] - camX;
        const sy = gPosY[g] - camY;
        if (sx < -20 || sx > viewportW + 20 || sy < -20 || sy > viewportH + 20) continue;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = isHighContrast ? '#00ff66' : '#34d399';
        ctx.fillRect(-5, -5, 10, 10);
        if (isHighContrast || currentSettings.boldOutlines) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(-5, -5, 10, 10);
        }
        ctx.restore();
      }

      if (novaRingAlpha > 0) {
        const currentR = novaRingRadius * (1.15 - novaRingAlpha * 0.4);
        ctx.save();
        ctx.strokeStyle = isHighContrast
          ? `rgba(0, 255, 102, ${novaRingAlpha})`
          : `rgba(16, 185, 129, ${novaRingAlpha})`;
        ctx.lineWidth = isHighContrast ? 5 : 3.5;
        ctx.beginPath();
        ctx.arc(playerX - camX, playerY - camY, currentR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      for (let i = 0; i < MAX_ENEMIES; i++) {
        if (eActive[i] === 0) continue;
        const sx = ePosX[i] - camX;
        const sy = ePosY[i] - camY;
        if (sx < -90 || sx > viewportW + 90 || sy < -90 || sy > viewportH + 90) continue;

        const archId = ARCHETYPE_LIST[eTypeIdx[i]];
        const arch = ENEMY_ARCHETYPES[archId];
        const r = eRadius[i];
        const isBoss = eIsBoss[i] === 1;

        if (isBoss && eKoTimer[i] <= 0) {
          // Boss Siege Aura Ring
          ctx.save();
          ctx.strokeStyle = isHighContrast ? '#ffff00' : 'rgba(234, 179, 8, 0.55)';
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 6]);
          ctx.beginPath();
          ctx.arc(sx, sy, r + 14 + Math.sin(now * 0.006) * 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        if (eTelegraph[i] > 0 && eKoTimer[i] <= 0) {
          ctx.save();
          if (archId === 'charger' && !isBoss) {
            ctx.strokeStyle = isHighContrast ? '#ffff00' : 'rgba(251, 146, 60, 0.85)';
            ctx.lineWidth = isHighContrast ? 4 : 2.5;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(
              sx + Math.cos(eAimAngle[i]) * 260,
              sy + Math.sin(eAimAngle[i]) * 260
            );
            ctx.stroke();
          } else {
            ctx.strokeStyle = isHighContrast ? '#ffff00' : '#f43f5e';
            ctx.lineWidth = isBoss ? 4 : 2.5;
            ctx.beginPath();
            ctx.arc(sx, sy, r + 10 + eTelegraph[i] * 22, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        }

        ctx.save();
        ctx.translate(sx, sy);
        if (eKoTimer[i] > 0) {
          ctx.globalAlpha = Math.max(0, eKoTimer[i] / 0.26);
          ctx.scale(1.25, 0.75);
        }
        ctx.rotate(eAimAngle[i]);

        const fillCol =
          eFlash[i] > 0
            ? '#ffffff'
            : isHighContrast
            ? arch.highContrastColor
            : isBoss
            ? '#eab308'
            : arch.color;

        ctx.fillStyle = fillCol;
        ctx.strokeStyle = isHighContrast || currentSettings.boldOutlines || isBoss ? '#ffffff' : '#090d16';
        ctx.lineWidth = isHighContrast || currentSettings.boldOutlines || isBoss ? 3 : 1.5;

        ctx.beginPath();
        if (archId === 'swarmer' && !isBoss) {
          ctx.moveTo(r * 1.15, 0);
          ctx.lineTo(-r * 0.8, -r * 0.85);
          ctx.lineTo(-r * 0.4, 0);
          ctx.lineTo(-r * 0.8, r * 0.85);
          ctx.closePath();
        } else if (archId === 'spitter' && !isBoss) {
          for (let s = 0; s < 6; s++) {
            const a = (s * Math.PI) / 3;
            const px = Math.cos(a) * r;
            const py = Math.sin(a) * r;
            if (s === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
        } else if (archId === 'charger' && !isBoss) {
          ctx.moveTo(r * 1.25, 0);
          ctx.lineTo(-r * 0.6, -r);
          ctx.lineTo(-r, -r * 0.4);
          ctx.lineTo(-r, r * 0.4);
          ctx.lineTo(-r * 0.6, r);
          ctx.closePath();
        } else if (archId === 'orbiter' && !isBoss) {
          ctx.arc(0, 0, r, 0, Math.PI * 2);
        } else {
          for (let s = 0; s < 8; s++) {
            const a = (s * Math.PI) / 4;
            const px = Math.cos(a) * r;
            const py = Math.sin(a) * r;
            if (s === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
        }
        ctx.fill();
        ctx.stroke();

        if (archId === 'juggernaut' || isBoss) {
          ctx.strokeStyle = isHighContrast ? '#00ffff' : '#fde047';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(0, 0, r + 5, -Math.PI * 0.4, Math.PI * 0.4);
          ctx.stroke();
        }
        ctx.restore();

        if ((eHp[i] < eMaxHp[i] || isBoss) && eKoTimer[i] <= 0) {
          const bw = r * 2.2;
          const ratio = Math.max(0, eHp[i] / eMaxHp[i]);
          ctx.fillStyle = 'rgba(0,0,0,0.8)';
          ctx.fillRect(sx - bw / 2, sy - r - 12, bw, isBoss ? 6 : 4);
          ctx.fillStyle = isHighContrast ? '#ffff00' : isBoss ? '#eab308' : '#f43f5e';
          ctx.fillRect(sx - bw / 2, sy - r - 12, bw * ratio, isBoss ? 6 : 4);
        }
      }

      for (let p = 0; p < MAX_PROJECTILES; p++) {
        if (pActive[p] === 0) continue;
        const sx = pPosX[p] - camX;
        const sy = pPosY[p] - camY;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(Math.atan2(pVelY[p], pVelX[p]));
        ctx.fillStyle = isHighContrast
          ? '#00ffff'
          : pKind[p] === 1
          ? '#fb7185'
          : '#38bdf8';
        ctx.fillRect(-8, -3, 16, 6);
        ctx.restore();
      }

      for (let b = 0; b < MAX_ENEMY_BULLETS; b++) {
        if (ebActive[b] === 0) continue;
        const sx = ebPosX[b] - camX;
        const sy = ebPosY[b] - camY;
        ctx.beginPath();
        ctx.arc(sx, sy, ebRadius[b], 0, Math.PI * 2);
        ctx.fillStyle = isHighContrast ? '#ffff00' : '#f43f5e';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      for (const arc of activeLightningArcs) {
        ctx.save();
        ctx.strokeStyle = isHighContrast ? '#00ffff' : '#c084fc';
        ctx.lineWidth = isHighContrast ? 3.5 : 2.5;
        ctx.beginPath();
        ctx.moveTo(arc.x1 - camX, arc.y1 - camY);
        const midX = (arc.x1 + arc.x2) / 2 - camX + (Math.random() - 0.5) * 18;
        const midY = (arc.y1 + arc.y2) / 2 - camY + (Math.random() - 0.5) * 18;
        ctx.lineTo(midX, midY);
        ctx.lineTo(arc.x2 - camX, arc.y2 - camY);
        ctx.stroke();
        ctx.restore();
      }

      const orbitalLvl = inventory.orbital_blades ?? 0;
      if (orbitalLvl > 0) {
        const oStats = POWER_UP_CATALOG.orbital_blades.computeStats(orbitalLvl);
        const bladeCount = oStats.projectiles;
        for (let b = 0; b < bladeCount; b++) {
          const bAng = orbitalAngle + (b * Math.PI * 2) / bladeCount;
          const bx = playerX - camX + Math.cos(bAng) * oStats.radius;
          const by = playerY - camY + Math.sin(bAng) * oStats.radius;
          ctx.save();
          ctx.translate(bx, by);
          ctx.rotate(bAng + Math.PI / 2);
          ctx.fillStyle = isHighContrast ? '#ffff00' : '#fbbf24';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(14, 0);
          ctx.lineTo(-8, -7);
          ctx.lineTo(-4, 0);
          ctx.lineTo(-8, 7);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      const px = playerX - camX;
      const py = playerY - camY;
      ctx.save();
      ctx.translate(px, py);
      const bob = Math.sin(walkDistAccumulator * 0.08) * 0.04;
      ctx.scale(playerScaleX + bob, playerScaleY - bob);
      ctx.rotate(playerFacing);

      const magnetLvl = inventory.magnet_field ?? 0;
      const magnetRadius = 190 + magnetLvl * 45;
      ctx.strokeStyle = isHighContrast ? 'rgba(255,255,255,0.22)' : 'rgba(56, 189, 248, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, magnetRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle =
        playerInvulnTimer > 0 && Math.floor(now / 60) % 2 === 0
          ? '#ffffff'
          : isHighContrast
          ? '#00ffff'
          : '#38bdf8';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = isHighContrast ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(-14, -14);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-14, 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#090d16';
      ctx.beginPath();
      ctx.arc(2, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const palette = isHighContrast ? PARTICLE_COLORS_HC : PARTICLE_COLORS_STD;
      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (partLife[i] <= 0) continue;
        const sx = partX[i] - camX;
        const sy = partY[i] - camY;
        const alpha = Math.max(0, partLife[i] / partMaxLife[i]);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = palette[partColorIdx[i] % palette.length];
        const sz = partSize[i];
        ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
        ctx.restore();
      }

      if (state === 'playing' && playerHp > 0 && playerHp / playerMaxHp <= 0.3) {
        const grad = ctx.createRadialGradient(
          viewportW / 2,
          viewportH / 2,
          viewportH * 0.28,
          viewportW / 2,
          viewportH / 2,
          viewportW * 0.65
        );
        grad.addColorStop(0, 'rgba(244, 63, 94, 0)');
        grad.addColorStop(1, 'rgba(244, 63, 94, 0.36)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, viewportW, viewportH);
      }

      ctx.restore();
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlurOrVisibility);
      document.removeEventListener('visibilitychange', handleBlurOrVisibility);
      canvas.removeEventListener('pointermove', handlePointerMove);
    };
  }, [hudRefs, simControlsRef]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="arena-canvas"
      aria-label="Vectra Swarm Infinite Arena Canvas"
      className="fixed inset-0 w-full h-full block cursor-crosshair"
    />
  );
};
