import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArenaCanvas,
  GameLifecycleState,
  HudDomRefs,
  SimulationControlsRef,
  TelemetrySnapshot,
} from './components/ArenaCanvas';
import { PythonExportModal } from './components/PythonExportModal';
import { formatKeyCode, SettingsModal } from './components/SettingsModal';
import { PowerUpIconSvg, VectraTitleEmblem } from './components/SvgIcons';
import {
  DEFAULT_KEY_BINDINGS,
  DraftChoice,
  GameSettings,
  getWaveConfig,
  getXpRequiredForLevel,
  INITIAL_STARTER_POOL,
  MAX_UPGRADES_PER_ROUND,
  POWER_UP_CATALOG,
  PowerUpId,
  rollThreePowerUpChoices,
} from './game/rules';
import { soundEngine } from './game/sound';

const SETTINGS_STORAGE_KEY = 'vectra_swarm_settings_v1';
const BEST_SCORE_STORAGE_KEY = 'vectra_swarm_best_score_v1';

function loadSavedSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        masterVolume: parsed.masterVolume ?? 80,
        sfxVolume: parsed.sfxVolume ?? 85,
        musicVolume: parsed.musicVolume ?? 60,
        muted: parsed.muted ?? false,
        contrastMode: parsed.contrastMode ?? 'standard',
        screenShake: parsed.screenShake ?? 80,
        boldOutlines: parsed.boldOutlines ?? false,
        keyBindings: {
          ...DEFAULT_KEY_BINDINGS,
          ...(parsed.keyBindings || {}),
        },
      };
    }
  } catch {
    // Fallback to defaults
  }
  return {
    masterVolume: 80,
    sfxVolume: 85,
    musicVolume: 60,
    muted: false,
    contrastMode: 'standard',
    screenShake: 80,
    boldOutlines: false,
    keyBindings: { ...DEFAULT_KEY_BINDINGS },
  };
}

export default function App() {
  const isAutostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [gameState, setGameState] = useState<GameLifecycleState>(
    isAutostart ? 'playing' : 'title'
  );
  const [settings, setSettings] = useState<GameSettings>(loadSavedSettings);
  const [starterPowerUp, setStarterPowerUp] = useState<PowerUpId>('pulse_cannon');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showPythonModal, setShowPythonModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>({
    hp: 100,
    maxHp: 100,
    xp: 0,
    xpNext: getXpRequiredForLevel(1),
    level: 1,
    wave: 1,
    score: 0,
    kills: 0,
    upgradesUsed: 0,
    maxUpgradesPerRound: MAX_UPGRADES_PER_ROUND,
    inventory: { pulse_cannon: 1 },
    activeBoss: null,
    newEnemyBanner: null,
  });

  const [draftChoices, setDraftChoices] = useState<DraftChoice[]>([]);
  const [endOfRunStats, setEndOfRunStats] = useState<{
    score: number;
    bestScore: number;
    wave: number;
    level: number;
    kills: number;
  } | null>(null);

  const hpFillRef = useRef<HTMLDivElement | null>(null);
  const hpGhostRef = useRef<HTMLDivElement | null>(null);
  const xpFillRef = useRef<HTMLDivElement | null>(null);
  const dashFillRef = useRef<HTMLDivElement | null>(null);
  const waveProgressRef = useRef<HTMLDivElement | null>(null);
  const sectorTextRef = useRef<HTMLSpanElement | null>(null);

  const hudRefs = useRef<HudDomRefs>({
    hpFillRef,
    hpGhostRef,
    xpFillRef,
    dashFillRef,
    waveProgressRef,
    sectorTextRef,
  }).current;

  const simControlsRef = useRef<SimulationControlsRef | null>(null);

  useEffect(() => {
    const mappedState =
      gameState === 'levelup' ? 'playing' : gameState;
    document.body.dataset.state = mappedState;
    document.body.dataset.contrast = settings.contrastMode;
    soundEngine.updateSettings(settings);
  }, [gameState, settings]);

  const handleUpdateSettings = useCallback((next: GameSettings) => {
    setSettings(next);
    soundEngine.updateSettings(next);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen?.()
        .then(() => setIsFullscreen(true))
        .catch(() => setIsFullscreen((prev) => !prev));
    } else {
      document
        .exitFullscreen?.()
        .then(() => setIsFullscreen(false))
        .catch(() => setIsFullscreen(false));
    }
  }, []);

  const handleStartRun = useCallback(
    (chosenStarter?: PowerUpId) => {
      const activeStarter = chosenStarter ?? starterPowerUp;
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setShowSettingsModal(false);
      setShowPythonModal(false);
      setEndOfRunStats(null);
      document.body.dataset.state = 'playing';
      setGameState('playing');
      simControlsRef.current?.startNewRun(activeStarter);
    },
    [starterPowerUp]
  );

  useEffect(() => {
    if (isAutostart) {
      simControlsRef.current?.startNewRun('pulse_cannon');
    }
  }, [isAutostart]);

  useEffect(() => {
    if (gameState !== 'title' || showSettingsModal || showPythonModal) return;
    const onTitleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        handleStartRun();
      }
    };
    window.addEventListener('keydown', onTitleKeyDown);
    return () => window.removeEventListener('keydown', onTitleKeyDown);
  }, [gameState, showSettingsModal, showPythonModal, handleStartRun]);

  const handleTriggerLevelUp = useCallback((snapshot: TelemetrySnapshot) => {
    const choices = rollThreePowerUpChoices(snapshot.inventory);
    if (choices.length > 0) {
      setDraftChoices(choices);
      setGameState('levelup');
    }
  }, []);

  const handleSelectDraftChoice = useCallback((powerUpId: PowerUpId) => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    simControlsRef.current?.applyUpgradeAndResume(powerUpId);
    setDraftChoices([]);
    setGameState('playing');
  }, []);

  useEffect(() => {
    if (gameState !== 'levelup') return;
    const onDraftKey = (e: KeyboardEvent) => {
      const kb = settings.keyBindings;
      if ((e.code === kb.upgrade1 || e.code === 'Digit1') && draftChoices[0]) {
        e.preventDefault();
        handleSelectDraftChoice(draftChoices[0].id);
      } else if ((e.code === kb.upgrade2 || e.code === 'Digit2') && draftChoices[1]) {
        e.preventDefault();
        handleSelectDraftChoice(draftChoices[1].id);
      } else if ((e.code === kb.upgrade3 || e.code === 'Digit3') && draftChoices[2]) {
        e.preventDefault();
        handleSelectDraftChoice(draftChoices[2].id);
      }
    };
    window.addEventListener('keydown', onDraftKey);
    return () => window.removeEventListener('keydown', onDraftKey);
  }, [gameState, draftChoices, settings.keyBindings, handleSelectDraftChoice]);

  const handleTriggerGameOver = useCallback((snapshot: TelemetrySnapshot) => {
    let best = snapshot.score;
    try {
      const prevBest = Number(localStorage.getItem(BEST_SCORE_STORAGE_KEY) || '0');
      best = Math.max(prevBest, snapshot.score);
      localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(best));
    } catch {
      // Ignore storage error
    }
    setEndOfRunStats({
      score: snapshot.score,
      bestScore: best,
      wave: snapshot.wave,
      level: snapshot.level,
      kills: snapshot.kills,
    });
    document.body.dataset.state = 'gameover';
    setGameState('gameover');
  }, []);

  const handleTogglePause = useCallback(() => {
    setGameState((prev) => {
      if (prev === 'playing') return 'paused';
      if (prev === 'paused') {
        setShowSettingsModal(false);
        return 'playing';
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    const onUtilKey = (e: KeyboardEvent) => {
      if (showSettingsModal || showPythonModal || gameState === 'title') return;
      if (e.code === 'KeyM') {
        handleUpdateSettings({ ...settings, muted: !settings.muted });
      } else if (e.code === 'KeyR' && gameState === 'playing') {
        handleStartRun();
      }
    };
    window.addEventListener('keydown', onUtilKey);
    return () => window.removeEventListener('keydown', onUtilKey);
  }, [gameState, showSettingsModal, showPythonModal, settings, handleUpdateSettings, handleStartRun]);

  const hc = settings.contrastMode === 'high';
  const nextMilestoneWave = Math.ceil((telemetry.wave + (telemetry.wave % 5 === 0 ? 1 : 0)) / 5) * 5;
  const nextBossWave = Math.ceil((telemetry.wave + (telemetry.wave % 10 === 0 ? 1 : 0)) / 10) * 10;
  const nextMilestoneCfg = getWaveConfig(nextMilestoneWave);

  const totalPips = 5;
  const hpFraction = Math.max(0, Math.min(1, telemetry.hp / Math.max(1, telemetry.maxHp)));
  const exactPips = hpFraction * totalPips;
  const upgradesRemaining = Math.max(0, telemetry.maxUpgradesPerRound - telemetry.upgradesUsed);

  return (
    <main className="relative w-screen h-screen overflow-hidden select-none">
      <ArenaCanvas
        gameState={gameState}
        settings={settings}
        hudRefs={hudRefs}
        simControlsRef={simControlsRef}
        onTelemetryUpdate={setTelemetry}
        onTriggerLevelUp={handleTriggerLevelUp}
        onTriggerGameOver={handleTriggerGameOver}
        onTogglePause={handleTogglePause}
        onToggleFullscreen={handleToggleFullscreen}
      />

      {/* =================================================================== */}
      {/* 1. TITLE SCREEN OVERLAY                                             */}
      {/* =================================================================== */}
      {gameState === 'title' && (
        <section
          aria-label="Title Screen"
          className="fixed inset-0 z-20 flex flex-col justify-between p-6 sm:p-12 pointer-events-none"
          style={{
            background: hc
              ? 'linear-gradient(90deg, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.88) 42%, rgba(0,0,0,0.25) 100%)'
              : 'linear-gradient(90deg, rgba(7,10,18,0.95) 0%, rgba(9,13,22,0.82) 44%, rgba(9,13,22,0.12) 100%)',
          }}
        >
          <div className="max-w-xl w-full my-auto pointer-events-auto space-y-6">
            <VectraTitleEmblem highContrast={hc} />

            {/* Initial Power-Up Selector for Start of Round */}
            <div
              className={`p-4 rounded-xl border ${
                hc
                  ? 'bg-black border-2 border-yellow-300'
                  : 'bg-[#0c1424]/95 border-slate-800 shadow-xl'
              }`}
            >
              <div className="flex items-center justify-between mb-2.5">
                <span
                  className={`text-xs font-bold uppercase tracking-wider ${
                    hc ? 'text-yellow-300' : 'text-slate-300'
                  }`}
                >
                  Initial Round Power-Up (Lv.1 Starter)
                </span>
                <span className="text-xs font-mono-tabular text-slate-400">
                  1 Starter + Max {MAX_UPGRADES_PER_ROUND} Upgrades / Round
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {INITIAL_STARTER_POOL.map((id) => {
                  const def = POWER_UP_CATALOG[id];
                  const isSelected = starterPowerUp === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setStarterPowerUp(id)}
                      className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                        isSelected
                          ? hc
                            ? 'bg-yellow-300 text-black border-white font-bold'
                            : 'bg-sky-950/80 border-sky-400 text-white'
                          : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <PowerUpIconSvg
                          id={id}
                          color={hc ? def.highContrastColor : def.accentColor}
                          size={20}
                        />
                        <span className="text-xs font-bold whitespace-nowrap">{def.name}</span>
                      </div>
                      <div
                        className={`text-[11px] mt-1 leading-snug ${
                          isSelected && hc ? 'text-black' : 'text-slate-400'
                        }`}
                      >
                        {def.roleClue}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* <= 3 Menu Actions Total */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                type="button"
                data-start="true"
                onClick={() => handleStartRun(starterPowerUp)}
                className={`px-7 py-3.5 rounded-lg font-display text-2xl font-bold uppercase tracking-wider transition-transform active:scale-95 whitespace-nowrap shrink-0 cursor-pointer ${
                  hc
                    ? 'bg-yellow-300 text-black border-2 border-white hover:bg-yellow-200'
                    : 'bg-sky-400 text-slate-950 hover:bg-sky-300 shadow-lg shadow-sky-500/20'
                }`}
              >
                Start Run
              </button>

              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                className={`px-4 py-3.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                  hc
                    ? 'bg-black text-yellow-300 border-2 border-yellow-300 hover:bg-slate-900'
                    : 'bg-[#0f172a] text-slate-100 border-slate-700 hover:bg-slate-800'
                }`}
              >
                Settings &amp; Controls
              </button>

              <button
                type="button"
                onClick={() => setShowPythonModal(true)}
                className={`px-4 py-3.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                  hc
                    ? 'bg-black text-cyan-300 border-2 border-cyan-300 hover:bg-slate-900'
                    : 'bg-[#0f172a] text-sky-300 border-slate-700 hover:bg-slate-800'
                }`}
              >
                macOS &amp; Windows Downloads
              </button>
            </div>
          </div>

          <div
            className={`text-xs font-mono-tabular tracking-wide ${
              hc ? 'text-yellow-300' : 'text-slate-400'
            }`}
          >
            {formatKeyCode(settings.keyBindings.moveUp)}/
            {formatKeyCode(settings.keyBindings.moveLeft)}/
            {formatKeyCode(settings.keyBindings.moveDown)}/
            {formatKeyCode(settings.keyBindings.moveRight)} Move ·{' '}
            {formatKeyCode(settings.keyBindings.dash)} Dash · 1/2/3 Draft Upgrade (Max 5/Round) ·{' '}
            {formatKeyCode(settings.keyBindings.fullscreen)} Fullscreen ·{' '}
            {formatKeyCode(settings.keyBindings.pause)} Pause
          </div>
        </section>
      )}

      {/* =================================================================== */}
      {/* 2. PLAYING HUD                                                      */}
      {/* =================================================================== */}
      {gameState !== 'title' && (
        <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 sm:p-5">
          {/* Top Row */}
          <div className="flex items-start justify-between gap-4">
            {/* Cluster 1 (Top-Left): Vitality, XP & 5-Upgrade Round Counter */}
            <div
              className={`p-3 rounded-lg border pointer-events-auto min-w-[240px] sm:min-w-[270px] ${
                hc
                  ? 'bg-black border-2 border-white'
                  : 'bg-[#090d16]/90 border-slate-800/90 shadow-lg'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    HP
                  </span>
                  <span
                    data-testid="hud-hp"
                    className={`font-display text-3xl font-bold leading-none font-mono-tabular hud-stroke ${
                      hc ? 'text-yellow-300' : 'text-white'
                    }`}
                  >
                    {telemetry.hp}
                  </span>
                  <span className="text-xs font-mono-tabular text-slate-400">
                    /{telemetry.maxHp}
                  </span>
                </div>

                <div className="flex items-center gap-1" aria-hidden="true">
                  {Array.from({ length: totalPips }).map((_, idx) => {
                    const isFull = exactPips >= idx + 0.85;
                    const isCracked = !isFull && exactPips > idx + 0.15;
                    return (
                      <svg key={idx} width="14" height="14" viewBox="0 0 16 16">
                        <rect
                          x="2"
                          y="2"
                          width="12"
                          height="12"
                          rx="2"
                          fill={
                            isFull
                              ? hc
                                ? '#ffff00'
                                : '#38bdf8'
                              : isCracked
                              ? '#f59e0b'
                              : '#0f172a'
                          }
                          stroke="#ffffff"
                          strokeWidth="1.5"
                        />
                        {isCracked && (
                          <path d="M5 3L9 8L6 13" stroke="#090d16" strokeWidth="1.8" />
                        )}
                      </svg>
                    );
                  })}
                </div>
              </div>

              <div className="relative h-2.5 w-full bg-slate-900 rounded overflow-hidden mt-1.5 border border-slate-800">
                <div
                  ref={hpGhostRef}
                  className="absolute inset-y-0 left-0 w-full origin-left bg-amber-400/80 transition-none"
                  style={{ transform: 'scaleX(1)' }}
                />
                <div
                  ref={hpFillRef}
                  className={`absolute inset-y-0 left-0 w-full origin-left transition-none ${
                    hc ? 'bg-yellow-300' : 'bg-sky-400'
                  }`}
                  style={{ transform: 'scaleX(1)' }}
                />
              </div>

              <div className="mt-2.5 flex items-center justify-between text-xs font-mono-tabular">
                <span className={hc ? 'text-cyan-300 font-bold' : 'text-emerald-300 font-semibold'}>
                  LVL {telemetry.level}
                </span>
                <span data-testid="hud-upgrades" className="text-amber-300 font-semibold">
                  UPGRADES {telemetry.upgradesUsed}/{telemetry.maxUpgradesPerRound}
                </span>
                <span className="text-slate-400">
                  XP {telemetry.xp}/{telemetry.xpNext}
                </span>
              </div>
              <div className="relative h-1.5 w-full bg-slate-900 rounded overflow-hidden mt-1">
                <div
                  ref={xpFillRef}
                  className={`absolute inset-y-0 left-0 w-full origin-left transition-none ${
                    hc ? 'bg-cyan-300' : 'bg-emerald-400'
                  }`}
                  style={{ transform: 'scaleX(0)' }}
                />
              </div>
            </div>

            {/* Center: 10th-Wave Active Boss HP Bar OR 5th-Wave Challenger Alert */}
            {telemetry.activeBoss ? (
              <div
                role="status"
                data-testid="boss-hud-banner"
                className={`px-5 py-2.5 rounded-lg border min-w-[300px] sm:min-w-[380px] ${
                  hc
                    ? 'bg-black border-2 border-yellow-300 text-yellow-300'
                    : 'bg-[#090d16]/95 border-amber-400 text-white shadow-xl'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-mono-tabular font-bold uppercase tracking-wider text-amber-300">
                      Wave {telemetry.activeBoss.wave} Boss Fight · Defeat Boss to Advance
                    </div>
                    <div className="font-display text-2xl font-bold uppercase leading-tight text-white">
                      {telemetry.activeBoss.name}
                    </div>
                  </div>
                  <div className="text-right font-mono-tabular">
                    <span className="font-display text-2xl font-bold text-amber-300">
                      {telemetry.activeBoss.hp}
                    </span>
                    <span className="text-xs text-slate-400">
                      /{telemetry.activeBoss.maxHp}
                    </span>
                  </div>
                </div>
                <div className="relative h-2.5 w-full bg-slate-900 rounded overflow-hidden mt-1.5 border border-slate-700">
                  <div
                    className={`h-full transition-all duration-75 ${
                      hc ? 'bg-yellow-300' : 'bg-amber-400'
                    }`}
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(100, (telemetry.activeBoss.hp / Math.max(1, telemetry.activeBoss.maxHp)) * 100)
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ) : (
              telemetry.newEnemyBanner && (
                <div
                  role="status"
                  className={`px-4 py-2 rounded-lg border text-center max-w-md ${
                    hc
                      ? 'bg-black border-2 border-yellow-300 text-yellow-300'
                      : 'bg-[#090d16]/95 border-amber-400/80 text-amber-200 shadow-lg'
                  }`}
                >
                  <div className="text-[11px] font-bold uppercase tracking-wider">
                    Wave {telemetry.newEnemyBanner.wave} Challenger Alert
                  </div>
                  <div className="font-display text-xl font-bold uppercase text-white">
                    {telemetry.newEnemyBanner.name}
                  </div>
                </div>
              )
            )}

            {/* Cluster 2 (Top-Right): Wave Readout, Boss Schedule & Utility Icon Buttons */}
            <div className="flex items-start gap-2.5 pointer-events-auto">
              <div
                className={`px-3.5 py-2.5 rounded-lg border text-right ${
                  hc
                    ? 'bg-black border-2 border-white'
                    : 'bg-[#090d16]/90 border-slate-800/90 shadow-lg'
                }`}
              >
                <div className="flex items-baseline justify-end gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1.5">
                      WAVE
                    </span>
                    <span
                      data-testid="hud-wave"
                      className={`font-display text-3xl font-bold leading-none font-mono-tabular hud-stroke ${
                        hc ? 'text-yellow-300' : 'text-white'
                      }`}
                    >
                      {telemetry.wave}
                    </span>
                  </div>
                  <div className="border-l border-slate-800 pl-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1.5">
                      SCORE
                    </span>
                    <span
                      data-testid="hud-score"
                      className="font-display text-2xl font-bold leading-none font-mono-tabular text-sky-300 hud-stroke"
                    >
                      {telemetry.score}
                    </span>
                  </div>
                </div>

                <div className="relative h-1.5 w-full bg-slate-900 rounded overflow-hidden mt-1.5">
                  <div
                    ref={waveProgressRef}
                    className={`absolute inset-y-0 left-0 w-full origin-left ${
                      hc ? 'bg-yellow-300' : 'bg-amber-400'
                    }`}
                    style={{ transform: 'scaleX(0)' }}
                  />
                </div>

                <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] font-mono-tabular text-slate-400">
                  <span ref={sectorTextRef}>S0·E0 [0, 0]</span>
                  <span>·</span>
                  <span className="text-amber-300">
                    Wave {nextBossWave}: Boss Fight
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Toggle Fullscreen"
                    title="Fullscreen [F]"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      handleToggleFullscreen();
                    }}
                    className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                      hc
                        ? 'bg-black border-2 border-yellow-300 text-yellow-300'
                        : 'bg-[#090d16]/90 border-slate-800 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M4 9V4H9M20 9V4H15M4 15V20H9M20 15V20H15"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>

                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={settings.muted ? 'Unmute Audio' : 'Mute Audio'}
                    title="Mute [M]"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      handleUpdateSettings({ ...settings, muted: !settings.muted });
                    }}
                    className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                      hc
                        ? 'bg-black border-2 border-yellow-300 text-yellow-300'
                        : 'bg-[#090d16]/90 border-slate-800 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M11 5L6 9H2V15H6L11 19V5Z" fill="currentColor" />
                      {settings.muted ? (
                        <path
                          d="M22 9L16 15M16 9L22 15"
                          stroke="#f43f5e"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                        />
                      ) : (
                        <path
                          d="M15.5 8.5C16.8 9.8 16.8 14.2 15.5 15.5M19 5C22 8 22 16 19 19"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      )}
                    </svg>
                  </button>

                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Pause Game"
                    title="Pause [P / Esc]"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      handleTogglePause();
                    }}
                    className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                      hc
                        ? 'bg-black border-2 border-yellow-300 text-yellow-300'
                        : 'bg-[#090d16]/90 border-slate-800 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
                      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Restart Run"
                    title="Restart [R]"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      handleStartRun();
                    }}
                    className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                      hc
                        ? 'bg-black border-2 border-yellow-300 text-yellow-300'
                        : 'bg-[#090d16]/90 border-slate-800 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M4 12A8 8 0 1 1 6.3 17.6M4 12V17M4 12H9"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Row: Cluster 3 (Bottom-Left Equipped Power-Up Arsenal & Dash Meter) */}
          <div className="flex items-end justify-between gap-4">
            <div
              className={`p-2.5 rounded-lg border pointer-events-auto flex flex-wrap items-center gap-2 ${
                hc
                  ? 'bg-black border-2 border-white'
                  : 'bg-[#090d16]/90 border-slate-800/90 shadow-lg'
              }`}
            >
              {(Object.entries(telemetry.inventory) as Array<[PowerUpId, number]>).map(
                ([id, lvl]) => {
                  const def = POWER_UP_CATALOG[id];
                  if (!def || !lvl) return null;
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-slate-900/90 border border-slate-800"
                    >
                      <PowerUpIconSvg
                        id={id}
                        color={hc ? def.highContrastColor : def.accentColor}
                        size={20}
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white whitespace-nowrap">
                            {def.name}
                          </span>
                          <span className="text-[11px] font-mono-tabular font-bold text-sky-300">
                            Lv.{lvl}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 whitespace-nowrap">
                          {def.roleClue}
                        </div>
                      </div>
                    </div>
                  );
                }
              )}

              <div className="px-2.5 py-1.5 rounded bg-slate-900/90 border border-slate-800 min-w-[110px]">
                <div className="flex items-center justify-between text-[10px] font-mono-tabular text-slate-300">
                  <span>DASH [{formatKeyCode(settings.keyBindings.dash)}]</span>
                </div>
                <div className="relative h-1.5 w-full bg-slate-950 rounded overflow-hidden mt-1">
                  <div
                    ref={dashFillRef}
                    className={`absolute inset-y-0 left-0 w-full origin-left ${
                      hc ? 'bg-yellow-300' : 'bg-sky-400'
                    }`}
                    style={{ transform: 'scaleX(1)' }}
                  />
                </div>
              </div>
            </div>

            {/* Bottom-Right Tactical Controls (Wave 5, Wave 10 Boss, Draft Power-Up) */}
            <div className="hidden sm:flex items-center gap-2 pointer-events-auto">
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  simControlsRef.current?.advanceToWave(nextMilestoneWave);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-mono-tabular font-semibold bg-[#090d16]/90 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 cursor-pointer whitespace-nowrap"
              >
                Skip to Wave {nextMilestoneWave} ({nextMilestoneCfg.newlyUnlockedEnemy?.name ?? 'Milestone'})
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  simControlsRef.current?.advanceToWave(nextBossWave);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-mono-tabular font-semibold bg-[#090d16]/90 border border-amber-500/60 text-amber-300 hover:text-white hover:border-amber-400 cursor-pointer whitespace-nowrap"
              >
                Skip to Wave {nextBossWave} Boss
              </button>
              <button
                type="button"
                tabIndex={-1}
                disabled={upgradesRemaining <= 0}
                onClick={(e) => {
                  e.currentTarget.blur();
                  simControlsRef.current?.triggerInstantLevelUp();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono-tabular font-semibold border whitespace-nowrap ${
                  upgradesRemaining > 0
                    ? 'bg-[#090d16]/90 border-slate-800 text-emerald-300 hover:text-white hover:border-slate-700 cursor-pointer'
                    : 'bg-slate-950/80 border-slate-900 text-slate-500 cursor-not-allowed'
                }`}
              >
                {upgradesRemaining > 0
                  ? `Draft Power-Up (${upgradesRemaining} Left)`
                  : 'Max 5 Upgrades Reached'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 3. LEVEL-UP 3-CHOICE POWER-UP UPGRADE MODAL (MAX 5 PER ROUND)       */}
      {/* =================================================================== */}
      {gameState === 'levelup' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="levelup-modal-title"
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/80 pointer-events-auto"
        >
          <div
            className={`w-full max-w-3xl rounded-xl p-6 border ${
              hc
                ? 'bg-black border-2 border-yellow-300 text-white'
                : 'bg-[#0b1220] border-slate-700 text-slate-100 shadow-2xl'
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <div className="text-xs font-mono-tabular font-bold uppercase tracking-wider text-emerald-400">
                  Level {telemetry.level} Reached · Upgrade {telemetry.upgradesUsed + 1} of{' '}
                  {telemetry.maxUpgradesPerRound} This Round
                </div>
                <h2
                  id="levelup-modal-title"
                  className="font-display text-3xl font-bold uppercase tracking-wide text-white mt-0.5"
                >
                  Choose One of Three Power-Up Upgrades
                </h2>
              </div>
              <span className="text-xs font-mono-tabular text-slate-400">
                Press [1], [2], or [3]
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
              {draftChoices.map((choice, idx) => (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => handleSelectDraftChoice(choice.id)}
                  className={`flex flex-col justify-between p-4 rounded-xl border text-left transition-transform hover:-translate-y-0.5 cursor-pointer ${
                    hc
                      ? 'bg-black border-2 border-yellow-300 hover:bg-slate-900'
                      : choice.isUpgrade
                      ? 'bg-slate-900/95 border-amber-400/70 hover:border-amber-300'
                      : 'bg-slate-900/90 border-slate-700 hover:border-sky-400'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span
                        className={`text-[11px] font-mono-tabular font-bold uppercase tracking-wider ${
                          choice.isUpgrade ? 'text-amber-300' : 'text-sky-300'
                        }`}
                      >
                        {choice.isUpgrade
                          ? `Upgrade · Lv.${choice.currentLevel} → Lv.${choice.nextLevel}`
                          : 'New System · Lv.1'}
                      </span>
                      <span className="text-xs font-mono-tabular text-slate-400">
                        [{idx + 1}]
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mb-2">
                      <PowerUpIconSvg
                        id={choice.id}
                        color={hc ? choice.highContrastColor : choice.accentColor}
                        size={32}
                      />
                      <div>
                        <div className="font-display text-2xl font-bold uppercase leading-tight text-white">
                          {choice.name}
                        </div>
                        <div className="text-xs text-slate-400">{choice.roleClue}</div>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5">
                      {choice.statDeltaLabels.map((line, lIdx) => (
                        <div
                          key={lIdx}
                          className="text-xs font-mono-tabular font-semibold text-emerald-300"
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    className={`mt-4 py-2 px-3 rounded-lg text-center text-xs font-bold uppercase tracking-wider ${
                      hc
                        ? 'bg-yellow-300 text-black'
                        : choice.isUpgrade
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-sky-400 text-slate-950'
                    }`}
                  >
                    {choice.isUpgrade ? `Upgrade to Lv.${choice.nextLevel}` : 'Equip Power-Up'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 4. PAUSED MODAL                                                     */}
      {/* =================================================================== */}
      {gameState === 'paused' && !showSettingsModal && !showPythonModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-modal-title"
          className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/80 pointer-events-auto"
        >
          <div
            className={`w-full max-w-md rounded-xl p-6 border ${
              hc
                ? 'bg-black border-2 border-yellow-300 text-white'
                : 'bg-[#0b1220] border-slate-700 text-slate-100 shadow-2xl'
            }`}
          >
            <h2
              id="pause-modal-title"
              className="font-display text-4xl font-bold uppercase tracking-wide text-center text-white"
            >
              Simulation Paused
            </h2>

            <div className="grid grid-cols-3 gap-3 my-5 p-3 rounded-lg bg-slate-900 border border-slate-800 text-center">
              <div>
                <div className="text-[11px] uppercase text-slate-400">Wave</div>
                <div className="font-display text-2xl font-bold font-mono-tabular text-white">
                  {telemetry.wave}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-slate-400">Upgrades</div>
                <div className="font-display text-2xl font-bold font-mono-tabular text-emerald-300">
                  {telemetry.upgradesUsed}/{telemetry.maxUpgradesPerRound}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-slate-400">Hostiles</div>
                <div className="font-display text-2xl font-bold font-mono-tabular text-sky-300">
                  {telemetry.kills}
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleTogglePause}
                className={`w-full py-3 rounded-lg font-display text-xl font-bold uppercase tracking-wider cursor-pointer ${
                  hc
                    ? 'bg-yellow-300 text-black'
                    : 'bg-sky-400 text-slate-950 hover:bg-sky-300'
                }`}
              >
                Resume Run
              </button>
              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                className="w-full py-2.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-100 hover:bg-slate-700 cursor-pointer"
              >
                Volume, High-Contrast &amp; Key Rebinding
              </button>
              <button
                type="button"
                onClick={() => setShowPythonModal(true)}
                className="w-full py-2.5 rounded-lg text-xs font-semibold bg-slate-800 text-sky-300 hover:bg-slate-700 cursor-pointer"
              >
                macOS (.app / .command) &amp; Windows (.exe) Downloads
              </button>
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleStartRun()}
                  className="py-2.5 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-700 text-slate-200 hover:bg-slate-800 cursor-pointer"
                >
                  Restart
                </button>
                <button
                  type="button"
                  onClick={() => {
                    document.body.dataset.state = 'title';
                    setGameState('title');
                  }}
                  className="py-2.5 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-700 text-slate-200 hover:bg-slate-800 cursor-pointer"
                >
                  Title Screen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 5. GAME OVER MODAL                                                  */}
      {/* =================================================================== */}
      {gameState === 'gameover' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="gameover-modal-title"
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/85 pointer-events-auto"
        >
          <div
            className={`w-full max-w-md rounded-xl p-6 border ${
              hc
                ? 'bg-black border-2 border-yellow-300 text-white'
                : 'bg-[#0b1220] border-rose-500/60 text-slate-100 shadow-2xl'
            }`}
          >
            <div className="text-xs font-mono-tabular font-bold uppercase tracking-wider text-rose-400 text-center">
              Hull Integrity Depleted
            </div>
            <h2
              id="gameover-modal-title"
              className="font-display text-4xl font-bold uppercase tracking-wide text-center text-white mt-1"
            >
              Run Terminated
            </h2>

            <div className="grid grid-cols-3 gap-3 my-5 p-3.5 rounded-lg bg-slate-900 border border-slate-800 text-center">
              <div>
                <div className="text-[11px] uppercase text-slate-400">Wave Reached</div>
                <div className="font-display text-2xl font-bold font-mono-tabular text-white">
                  {endOfRunStats?.wave ?? telemetry.wave}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-slate-400">Score</div>
                <div className="font-display text-2xl font-bold font-mono-tabular text-sky-300">
                  {endOfRunStats?.score ?? telemetry.score}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-slate-400">Best Score</div>
                <div className="font-display text-2xl font-bold font-mono-tabular text-amber-300">
                  {endOfRunStats?.bestScore ?? telemetry.score}
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                data-start="true"
                onClick={() => handleStartRun()}
                className={`w-full py-3 rounded-lg font-display text-2xl font-bold uppercase tracking-wider cursor-pointer ${
                  hc
                    ? 'bg-yellow-300 text-black'
                    : 'bg-sky-400 text-slate-950 hover:bg-sky-300'
                }`}
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => {
                  document.body.dataset.state = 'title';
                  setGameState('title');
                }}
                className="w-full py-2.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer"
              >
                Return to Title Screen
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <SettingsModal
          settings={settings}
          isFullscreen={isFullscreen}
          onUpdateSettings={handleUpdateSettings}
          onToggleFullscreen={handleToggleFullscreen}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {showPythonModal && (
        <PythonExportModal
          highContrast={hc}
          onClose={() => setShowPythonModal(false)}
        />
      )}
    </main>
  );
}
