import React, { useEffect, useState } from 'react';
import { ContrastMode, DEFAULT_KEY_BINDINGS, GameSettings, KeyBindings } from '../game/rules';

interface SettingsModalProps {
  settings: GameSettings;
  isFullscreen: boolean;
  onUpdateSettings: (next: GameSettings) => void;
  onToggleFullscreen: () => void;
  onClose: () => void;
}

const KEY_LABELS: Array<{ key: keyof KeyBindings; label: string }> = [
  { key: 'moveUp', label: 'Thrust Up' },
  { key: 'moveDown', label: 'Thrust Down' },
  { key: 'moveLeft', label: 'Strafe Left' },
  { key: 'moveRight', label: 'Strafe Right' },
  { key: 'dash', label: 'Kinetic Dash' },
  { key: 'fullscreen', label: 'Toggle Fullscreen' },
  { key: 'pause', label: 'Pause Menu' },
  { key: 'upgrade1', label: 'Draft Power-Up 1' },
  { key: 'upgrade2', label: 'Draft Power-Up 2' },
  { key: 'upgrade3', label: 'Draft Power-Up 3' },
];

export function formatKeyCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return `Arrow ${code.slice(5)}`;
  if (code === 'Space') return 'Spacebar';
  return code;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  isFullscreen,
  onUpdateSettings,
  onToggleFullscreen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'accessibility' | 'controls' | 'audio'>('accessibility');
  const [rebindingField, setRebindingField] = useState<keyof KeyBindings | null>(null);
  const hc = settings.contrastMode === 'high';

  useEffect(() => {
    if (!rebindingField) return;
    const handleCaptureKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const nextBindings: KeyBindings = {
        ...settings.keyBindings,
        [rebindingField]: e.code,
      };
      onUpdateSettings({
        ...settings,
        keyBindings: nextBindings,
      });
      setRebindingField(null);
    };
    window.addEventListener('keydown', handleCaptureKey, { capture: true });
    return () => window.removeEventListener('keydown', handleCaptureKey, { capture: true });
  }, [rebindingField, settings, onUpdateSettings]);

  const setContrastMode = (contrastMode: ContrastMode) => {
    onUpdateSettings({
      ...settings,
      contrastMode,
      boldOutlines: contrastMode === 'high' ? true : settings.boldOutlines,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 pointer-events-auto"
    >
      <div
        className={`w-full max-w-2xl rounded-xl p-6 border ${
          hc
            ? 'bg-black border-2 border-yellow-300 text-white'
            : 'bg-[#0c1322] border-slate-700 text-slate-100 shadow-2xl'
        }`}
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2
              id="settings-modal-title"
              className={`font-display text-3xl font-bold uppercase tracking-wide ${
                hc ? 'text-yellow-300' : 'text-white'
              }`}
            >
              Settings, Accessibility & Keybinds
            </h2>
            <p className={`text-xs mt-0.5 ${hc ? 'text-white' : 'text-slate-400'}`}>
              Customize high-contrast visibility, audio mix, fullscreen display, and keyboard controls.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Settings"
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              hc
                ? 'bg-yellow-300 text-black hover:bg-yellow-200'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            Done
          </button>
        </div>

        {/* Functional Tab Selector */}
        <div className="flex items-center gap-2 mt-4 p-1 rounded-lg bg-slate-900 border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('accessibility')}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'accessibility'
                ? hc
                  ? 'bg-yellow-300 text-black'
                  : 'bg-sky-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Visual Accessibility & Display
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('controls')}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'controls'
                ? hc
                  ? 'bg-yellow-300 text-black'
                  : 'bg-sky-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Customize Keyboard Controls
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audio')}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'audio'
                ? hc
                  ? 'bg-yellow-300 text-black'
                  : 'bg-sky-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Volume & Audio Mix
          </button>
        </div>

        {/* TAB 1: Visual Accessibility & Display */}
        {activeTab === 'accessibility' && (
          <div className="mt-5 space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Visual Contrast Mode (Inclusivity Preset)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setContrastMode('standard')}
                  className={`p-3.5 rounded-lg border text-left transition-colors ${
                    settings.contrastMode === 'standard'
                      ? 'border-sky-400 bg-sky-950/50 text-white'
                      : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="text-sm font-bold">Standard Arena</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Deep obsidian slate canvas with tactical cyan & coral accents.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setContrastMode('high')}
                  className={`p-3.5 rounded-lg border text-left transition-colors ${
                    settings.contrastMode === 'high'
                      ? 'border-2 border-yellow-300 bg-black text-yellow-300'
                      : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="text-sm font-bold">High Contrast (WCAG AAA)</div>
                  <div className="text-xs text-slate-300 mt-1">
                    Pitch-black background, pure yellow/cyan entities & thick white outlines.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setContrastMode('deuteranopia')}
                  className={`p-3.5 rounded-lg border text-left transition-colors ${
                    settings.contrastMode === 'deuteranopia'
                      ? 'border-amber-400 bg-amber-950/40 text-white'
                      : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="text-sm font-bold">Colorblind Safe</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Deuteranopia/Protanopia distinct luminance separation & shape cues.
                  </div>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                <div>
                  <div className="text-sm font-semibold">High-Visibility Hull Outlines</div>
                  <div className="text-xs text-slate-400">Adds crisp white perimeter strokes to all entities</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.boldOutlines}
                  onClick={() =>
                    onUpdateSettings({ ...settings, boldOutlines: !settings.boldOutlines })
                  }
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors whitespace-nowrap ${
                    settings.boldOutlines
                      ? hc
                        ? 'bg-yellow-300 text-black'
                        : 'bg-sky-400 text-slate-950'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {settings.boldOutlines ? 'Enabled' : 'Off'}
                </button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                <div>
                  <div className="text-sm font-semibold">Full-Screen Arena Mode</div>
                  <div className="text-xs text-slate-400">Expand viewport to native monitor fullscreen</div>
                </div>
                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors whitespace-nowrap ${
                    isFullscreen
                      ? hc
                        ? 'bg-yellow-300 text-black'
                        : 'bg-emerald-400 text-slate-950'
                      : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                <label htmlFor="screen-shake-slider">Camera Recoil & Screen Shake Intensity</label>
                <span className="font-mono-tabular">{settings.screenShake}%</span>
              </div>
              <input
                id="screen-shake-slider"
                type="range"
                min={0}
                max={100}
                value={settings.screenShake}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, screenShake: Number(e.target.value) })
                }
                className="w-full accent-sky-400 cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* TAB 2: Customizable Keyboard Controls */}
        {activeTab === 'controls' && (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-300">
                Click any binding below and press any key to rebind. Arrow keys always remain active as secondary movement.
              </p>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    keyBindings: { ...DEFAULT_KEY_BINDINGS },
                  })
                }
                className="px-3 py-1.5 text-xs font-semibold rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 whitespace-nowrap shrink-0"
              >
                Reset Default Keys
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
              {KEY_LABELS.map(({ key, label }) => {
                const isWaiting = rebindingField === key;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-slate-900/90 border border-slate-800"
                  >
                    <span className="text-xs font-medium text-slate-200">{label}</span>
                    <button
                      type="button"
                      data-rebinding={isWaiting ? 'true' : 'false'}
                      onClick={() => setRebindingField(isWaiting ? null : key)}
                      className={`px-3 py-1 rounded text-xs font-mono-tabular font-bold transition-colors whitespace-nowrap ${
                        isWaiting
                          ? 'bg-amber-400 text-slate-950 animate-pulse'
                          : hc
                          ? 'bg-yellow-300 text-black'
                          : 'bg-slate-800 text-sky-300 hover:bg-slate-700 border border-slate-700'
                      }`}
                    >
                      {isWaiting ? 'Press Key...' : formatKeyCode(settings.keyBindings[key])}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: Volume & Audio Mix */}
        {activeTab === 'audio' && (
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div>
                <div className="text-sm font-semibold">Master Audio Output</div>
                <div className="text-xs text-slate-400">Mute or enable real-time procedural synthesizer</div>
              </div>
              <button
                type="button"
                onClick={() => onUpdateSettings({ ...settings, muted: !settings.muted })}
                className={`px-4 py-1.5 rounded-md text-xs font-bold whitespace-nowrap ${
                  settings.muted
                    ? 'bg-rose-500 text-white'
                    : hc
                    ? 'bg-yellow-300 text-black'
                    : 'bg-emerald-400 text-slate-950'
                }`}
              >
                {settings.muted ? 'Muted' : 'Audio Active'}
              </button>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <label htmlFor="master-vol-slider">Master Volume</label>
                <span className="font-mono-tabular">{settings.masterVolume}%</span>
              </div>
              <input
                id="master-vol-slider"
                type="range"
                min={0}
                max={100}
                value={settings.masterVolume}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, masterVolume: Number(e.target.value) })
                }
                className="w-full accent-sky-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <label htmlFor="sfx-vol-slider">Weapons & Impact SFX Volume</label>
                <span className="font-mono-tabular">{settings.sfxVolume}%</span>
              </div>
              <input
                id="sfx-vol-slider"
                type="range"
                min={0}
                max={100}
                value={settings.sfxVolume}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, sfxVolume: Number(e.target.value) })
                }
                className="w-full accent-sky-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <label htmlFor="music-vol-slider">Arena Synth Ambience Volume</label>
                <span className="font-mono-tabular">{settings.musicVolume}%</span>
              </div>
              <input
                id="music-vol-slider"
                type="range"
                min={0}
                max={100}
                value={settings.musicVolume}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, musicVolume: Number(e.target.value) })
                }
                className="w-full accent-sky-400 cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
