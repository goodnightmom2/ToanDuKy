// Gentle WebAudio synthesizer — default OFF until user enables audio.

class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = false;

  setEnabled(value: boolean): void {
    this.enabled = value;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private getContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private playTone(freq: number, duration: number, type: OscillatorType = 'sine', gainVal = 0.08, delay = 0): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainVal, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playCorrect(): void {
    this.playTone(523.25, 0.14, 'triangle', 0.09, 0);
    this.playTone(659.25, 0.16, 'triangle', 0.09, 0.09);
    this.playTone(783.99, 0.22, 'triangle', 0.08, 0.18);
  }

  playGentleHint(): void {
    // Soft warm woodblock-like interval — never harsh buzzer
    this.playTone(349.23, 0.14, 'sine', 0.06, 0);
    this.playTone(392.0, 0.18, 'sine', 0.05, 0.1);
  }

  playStep(): void {
    this.playTone(220 + Math.random() * 25, 0.05, 'sine', 0.03, 0);
  }

  playBossHit(): void {
    this.playTone(440, 0.1, 'triangle', 0.1, 0);
    this.playTone(587.33, 0.14, 'triangle', 0.1, 0.07);
    this.playTone(880, 0.22, 'sine', 0.09, 0.14);
  }

  playChestOpen(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => this.playTone(n, 0.2, 'triangle', 0.09, idx * 0.09));
  }
}

export const soundEngine = new SoundEngine();
