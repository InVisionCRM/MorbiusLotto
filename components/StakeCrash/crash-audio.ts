/**
 * crash-audio.ts — procedural Web Audio engine for /crash.
 *
 * Verbatim port of the crash prototype's lib/audio.ts: every sound is
 * synthesized (oscillators + filtered noise) — no audio files. Includes the
 * rising engine drone pitched by the live multiplier and the quiet cyber-neon
 * BGM arpeggio.
 */

import { playWinSting, preloadWinSounds } from '@/lib/win-audio';

class GameAudio {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  droneOsc: OscillatorNode | null = null;
  droneGain: GainNode | null = null;
  droneFilter: BiquadFilterNode | null = null;
  isMuted = true;
  hasInit = false;

  bgmInterval: ReturnType<typeof setInterval> | null = null;
  bgmPlaying = false;

  init() {
    if (this.hasInit || typeof window === 'undefined') return;
    preloadWinSounds();
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = this.isMuted ? 0 : 0.3;
      this.hasInit = true;
    } catch (e) {
      console.warn('Web Audio API not supported', e);
    }
  }

  setMute(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.3, this.ctx.currentTime, 0.05);
    }
    if (muted && this.bgmPlaying) {
      this.stopBGM();
    } else if (!muted && !this.bgmPlaying && this.hasInit) {
      this.startBGM();
    }
  }

  playTone(freq: number, type: OscillatorType, duration: number, vol = 1, slideToFreq?: number) {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (slideToFreq) {
      osc.frequency.exponentialRampToValueAtTime(slideToFreq, this.ctx.currentTime + duration);
    }

    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playNoise(duration: number, vol = 1) {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
  }

  playBet() {
    this.playTone(880, 'sine', 0.1, 0.3);
    setTimeout(() => this.playTone(1760, 'sine', 0.15, 0.4), 100);
  }

  playCashout() {
    // Recorded sting first; the tones below are the fallback for when it
    // has not loaded yet. See lib/win-audio.ts.
    if (playWinSting('small', { muted: this.isMuted })) return;
    this.playTone(1046.5, 'sine', 0.1, 0.4); // C6
    setTimeout(() => this.playTone(1318.51, 'sine', 0.4, 0.5), 100); // E6
  }

  playTransition() {
    this.playTone(300, 'square', 0.2, 0.2, 100); // Drop down
  }

  playCrash() {
    this.playNoise(1.5, 1);
    this.playTone(150, 'sawtooth', 1.0, 0.6, 40); // Boom
  }

  playLaunch() {
    this.playTone(100, 'sawtooth', 1.0, 0.2, 600); // Riser
  }

  startDrone() {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    if (this.droneOsc) this.stopDrone();

    this.droneOsc = this.ctx.createOscillator();
    this.droneOsc.type = 'sawtooth';
    this.droneOsc.frequency.setValueAtTime(50, this.ctx.currentTime);

    this.droneFilter = this.ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.setValueAtTime(200, this.ctx.currentTime);

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.05, this.ctx.currentTime);

    this.droneOsc.connect(this.droneFilter);
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.masterGain);

    this.droneOsc.start();
  }

  updateDrone(multiplier: number) {
    if (!this.droneOsc || !this.droneFilter || !this.ctx || this.isMuted) return;

    const pitch = 50 + Math.min(200, multiplier * 4);
    const filterFreq = 300 + Math.min(2000, multiplier * 50);

    this.droneOsc.frequency.setTargetAtTime(pitch, this.ctx.currentTime, 0.1);
    this.droneFilter.frequency.setTargetAtTime(filterFreq, this.ctx.currentTime, 0.1);
  }

  stopDrone() {
    if (this.droneOsc && this.ctx && this.droneGain) {
      this.droneGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);

      const oscToStop = this.droneOsc;
      this.droneOsc = null; // Detach to avoid double stops

      setTimeout(() => {
        try {
          oscToStop.stop();
          oscToStop.disconnect();
        } catch {
          /* already stopped */
        }
      }, 500);
    }
  }

  startBGM() {
    if (this.bgmPlaying || this.isMuted) return;
    this.bgmPlaying = true;

    let step = 0;
    // Cyber-neon arpeggio pattern: Cm add9
    const notes = [130.81, 155.56, 196.0, 261.63, 146.83, 196.0, 261.63, 311.13];

    const playNote = () => {
      if (!this.bgmPlaying || this.isMuted) return;
      const freq = notes[step % notes.length];
      const finalFreq = Math.random() > 0.8 ? freq * 2 : freq;
      this.playTone(finalFreq, 'sine', 0.3, 0.05); // Very quiet
      step++;
    };

    this.bgmInterval = setInterval(playNote, 300);
  }

  stopBGM() {
    this.bgmPlaying = false;
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  }
}

// Singleton pattern
export const crashAudio = new GameAudio();
