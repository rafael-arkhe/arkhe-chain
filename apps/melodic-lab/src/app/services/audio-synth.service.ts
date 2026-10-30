import { Injectable, signal } from '@angular/core';
import { MelodicNote } from '../models/pipeline.model';

@Injectable({
  providedIn: 'root',
})
export class AudioSynthService {
  private audioCtx: AudioContext | null = null;
  private activeTimers: number[] = [];

  readonly isPlaying = signal<boolean>(false);
  readonly playingSide = signal<'A' | 'B' | 'both' | null>(null);
  readonly currentNoteA = signal<number | null>(null);
  readonly currentNoteB = signal<number | null>(null);
  readonly playbackProgress = signal<number>(0);

  private getAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  pitchToName(midi: number): string {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const note = names[midi % 12];
    return `${note}${octave}`;
  }

  stop(): void {
    this.activeTimers.forEach((t) => clearTimeout(t));
    this.activeTimers = [];
    this.isPlaying.set(false);
    this.playingSide.set(null);
    this.currentNoteA.set(null);
    this.currentNoteB.set(null);
    this.playbackProgress.set(0);
  }

  playMelody(
    notes: MelodicNote[],
    side: 'A' | 'B',
    bpm = 115,
    pan = 0,
    timbre: 'warm' | 'synth' = 'warm'
  ): void {
    this.stop();
    if (!notes.length) return;

    const ctx = this.getAudioContext();
    this.isPlaying.set(true);
    this.playingSide.set(side);

    const secondsPerBeat = 60 / bpm;
    const totalDuration = (notes[notes.length - 1].onset + notes[notes.length - 1].duration) * secondsPerBeat;
    const startTime = ctx.currentTime + 0.05;

    // Schedule audio notes
    notes.forEach((n, idx) => {
      const noteStart = startTime + n.onset * secondsPerBeat;
      const noteDur = Math.max(n.duration * secondsPerBeat * 0.9, 0.08);

      this.scheduleTone(ctx, n.pitch, noteStart, noteDur, pan, timbre);

      // UI timers
      const delayMs = (noteStart - ctx.currentTime) * 1000;
      const t1 = window.setTimeout(() => {
        if (side === 'A') {
          this.currentNoteA.set(idx);
        } else {
          this.currentNoteB.set(idx);
        }
      }, Math.max(0, delayMs));
      this.activeTimers.push(t1);

      const t2 = window.setTimeout(() => {
        if (side === 'A') {
          this.currentNoteA.set(null);
        } else {
          this.currentNoteB.set(null);
        }
      }, Math.max(0, delayMs + noteDur * 1000));
      this.activeTimers.push(t2);
    });

    // Progress bar ticker
    const progressInterval = 50; // ms
    const totalMs = totalDuration * 1000;
    let elapsed = 0;
    const pTimer = window.setInterval(() => {
      elapsed += progressInterval;
      this.playbackProgress.set(Math.min(100, (elapsed / totalMs) * 100));
      if (elapsed >= totalMs) {
        clearInterval(pTimer);
        this.stop();
      }
    }, progressInterval);
    this.activeTimers.push(pTimer);
  }

  playBothSimultaneously(
    notesA: MelodicNote[],
    notesB: MelodicNote[],
    bpm = 115
  ): void {
    this.stop();
    const ctx = this.getAudioContext();
    this.isPlaying.set(true);
    this.playingSide.set('both');

    const secondsPerBeat = 60 / bpm;
    const durA = notesA.length ? (notesA[notesA.length - 1].onset + notesA[notesA.length - 1].duration) * secondsPerBeat : 0;
    const durB = notesB.length ? (notesB[notesB.length - 1].onset + notesB[notesB.length - 1].duration) * secondsPerBeat : 0;
    const totalDuration = Math.max(durA, durB);
    const startTime = ctx.currentTime + 0.05;

    // Schedule A (Panned Left -0.5, warmer brass/vocal sound)
    notesA.forEach((n, idx) => {
      const noteStart = startTime + n.onset * secondsPerBeat;
      const noteDur = Math.max(n.duration * secondsPerBeat * 0.9, 0.08);
      this.scheduleTone(ctx, n.pitch, noteStart, noteDur, -0.45, 'warm');

      const delayMs = (noteStart - ctx.currentTime) * 1000;
      const t = window.setTimeout(() => this.currentNoteA.set(idx), Math.max(0, delayMs));
      const tEnd = window.setTimeout(() => this.currentNoteA.set(null), Math.max(0, delayMs + noteDur * 1000));
      this.activeTimers.push(t, tEnd);
    });

    // Schedule B (Panned Right +0.5, bright synth sound)
    notesB.forEach((n, idx) => {
      const noteStart = startTime + n.onset * secondsPerBeat;
      const noteDur = Math.max(n.duration * secondsPerBeat * 0.9, 0.08);
      this.scheduleTone(ctx, n.pitch, noteStart, noteDur, 0.45, 'synth');

      const delayMs = (noteStart - ctx.currentTime) * 1000;
      const t = window.setTimeout(() => this.currentNoteB.set(idx), Math.max(0, delayMs));
      const tEnd = window.setTimeout(() => this.currentNoteB.set(null), Math.max(0, delayMs + noteDur * 1000));
      this.activeTimers.push(t, tEnd);
    });

    // Progress bar ticker
    const progressInterval = 50;
    const totalMs = totalDuration * 1000;
    let elapsed = 0;
    const pTimer = window.setInterval(() => {
      elapsed += progressInterval;
      this.playbackProgress.set(Math.min(100, (elapsed / totalMs) * 100));
      if (elapsed >= totalMs) {
        clearInterval(pTimer);
        this.stop();
      }
    }, progressInterval);
    this.activeTimers.push(pTimer);
  }

  private scheduleTone(
    ctx: AudioContext,
    midi: number,
    startTime: number,
    duration: number,
    pan: number,
    timbre: 'warm' | 'synth'
  ): void {
    const freq = this.midiToFreq(midi);

    // Primary oscillator
    const osc1 = ctx.createOscillator();
    osc1.type = timbre === 'warm' ? 'triangle' : 'sawtooth';
    osc1.frequency.setValueAtTime(freq, startTime);

    // Secondary oscillator (subtle chorus detuning)
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * (timbre === 'warm' ? 1.002 : 1.005), startTime);

    // Low-pass filter for smooth organic warmth
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(timbre === 'warm' ? 1800 : 3200, startTime);
    filter.Q.setValueAtTime(2.0, startTime);

    // Panner
    let pannerNode: StereoPannerNode | GainNode;
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(pan, startTime);
      pannerNode = panner;
    } else {
      pannerNode = ctx.createGain();
    }

    // Gain envelope (ADSR)
    const gainNode = ctx.createGain();
    const attack = 0.015;
    const decay = 0.08;
    const sustain = 0.7;
    const release = 0.05;

    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.28, startTime + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.28 * sustain, startTime + attack + decay);
    gainNode.gain.setValueAtTime(0.28 * sustain, startTime + duration - release);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    // Graph connection
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(pannerNode);
    pannerNode.connect(ctx.destination);

    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(startTime + duration + 0.02);
    osc2.stop(startTime + duration + 0.02);
  }
}
