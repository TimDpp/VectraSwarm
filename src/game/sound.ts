import { GameSettings } from './rules';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private settings: GameSettings | null = null;
  private ambienceTimer: number | null = null;

  public updateSettings(settings: GameSettings) {
    this.settings = settings;
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getSfxGain(): number {
    if (!this.settings || this.settings.muted) return 0;
    return Math.max(0, Math.min(1, (this.settings.masterVolume / 100) * (this.settings.sfxVolume / 100) * 0.35));
  }

  public playShot(pitchOffset: number = 1) {
    const gainVal = this.getSfxGain();
    if (gainVal <= 0.001) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const variance = 1 + (Math.random() * 0.16 - 0.08);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520 * pitchOffset * variance, now);
    osc.frequency.exponentialRampToValueAtTime(140 * pitchOffset, now + 0.075);

    gain.gain.setValueAtTime(gainVal * 0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.085);
  }

  public playHit(heavy: boolean = false) {
    const gainVal = this.getSfxGain();
    if (gainVal <= 0.001) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const variance = 1 + (Math.random() * 0.16 - 0.08);

    osc.type = heavy ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime((heavy ? 180 : 280) * variance, now);
    osc.frequency.exponentialRampToValueAtTime(heavy ? 48 : 90, now + (heavy ? 0.14 : 0.06));

    gain.gain.setValueAtTime(gainVal * (heavy ? 0.75 : 0.35), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.15 : 0.065));

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (heavy ? 0.16 : 0.07));
  }

  public playXpPickup(comboPitch: number = 1) {
    const gainVal = this.getSfxGain();
    if (gainVal <= 0.001) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const baseFreq = Math.min(1320, 620 * comboPitch * (1 + (Math.random() * 0.08 - 0.04)));

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.35, now + 0.06);

    gain.gain.setValueAtTime(gainVal * 0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playDash() {
    const gainVal = this.getSfxGain();
    if (gainVal <= 0.001) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.12);

    gain.gain.setValueAtTime(gainVal * 0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playPlayerHurt() {
    const gainVal = this.getSfxGain();
    if (gainVal <= 0.001) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(155, now);
    osc.frequency.linearRampToValueAtTime(62, now + 0.22);

    gain.gain.setValueAtTime(gainVal * 0.9, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playLevelUp() {
    const gainVal = this.getSfxGain();
    if (gainVal <= 0.001) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      const now = ctx.currentTime + idx * 0.065;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(gainVal * 0.55, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.23);
    });
  }

  public playWaveWarning(isFifthWave: boolean) {
    const gainVal = this.getSfxGain();
    if (gainVal <= 0.001) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const pulses = isFifthWave ? 3 : 1;
    for (let i = 0; i < pulses; i++) {
      const now = ctx.currentTime + i * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isFifthWave ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(isFifthWave ? 310 : 420, now);
      osc.frequency.exponentialRampToValueAtTime(isFifthWave ? 480 : 540, now + 0.12);
      gain.gain.setValueAtTime(gainVal * 0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    }
  }

  public playGameOver() {
    const gainVal = this.getSfxGain();
    if (gainVal <= 0.001) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const notes = [392, 349.23, 311.13, 261.63];
    notes.forEach((freq, idx) => {
      const now = ctx.currentTime + idx * 0.14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(gainVal * 0.65, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    });
  }
}

export const soundEngine = new SoundEngine();
