import { ChangeDetectionStrategy, Component, inject, signal, effect } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AudioSynthService } from '../services/audio-synth.service';
import { PipelineService } from '../services/pipeline.service';

@Component({
  selector: 'app-audio-player-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-base font-bold text-white flex items-center gap-2">
            <mat-icon class="text-amber-400 text-lg">audiotrack</mat-icon>
            Forensic Audio Synthesizer & Auditory Comparison
          </h2>
          <p class="text-xs text-slate-400">
            Web Audio API Synthesizer: Auditory comparison of extracted monophonic motifs from {{ targetA().artist }} (Target A) and {{ targetB().artist }} (Target B).
          </p>
        </div>

        <!-- Controls -->
        <div class="flex flex-wrap items-center gap-2 font-mono text-xs">
          <!-- Play A -->
          <button
            type="button"
            (click)="playA()"
            [disabled]="audio.isPlaying() && audio.playingSide() === 'A'"
            class="flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-semibold transition disabled:opacity-50"
            [title]="'Play Target A melody (' + targetA().title + ' - ' + targetA().artist + ' · ' + targetA().bpm + ' BPM)'"
          >
            <mat-icon class="text-base">
              {{ audio.isPlaying() && audio.playingSide() === 'A' ? 'volume_up' : 'play_arrow' }}
            </mat-icon>
            <span>Play A ({{ targetA().title }})</span>
          </button>

          <!-- Play B -->
          <button
            type="button"
            (click)="playB()"
            [disabled]="audio.isPlaying() && audio.playingSide() === 'B'"
            class="flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-semibold transition disabled:opacity-50"
            [title]="'Play Target B melody (' + targetB().title + ' - ' + targetB().artist + ' · ' + targetB().bpm + ' BPM)'"
          >
            <mat-icon class="text-base">
              {{ audio.isPlaying() && audio.playingSide() === 'B' ? 'volume_up' : 'play_arrow' }}
            </mat-icon>
            <span>Play B ({{ targetB().title }})</span>
          </button>

          <!-- Play Both Simultaneous -->
          <button
            type="button"
            (click)="playBoth()"
            [disabled]="audio.isPlaying() && audio.playingSide() === 'both'"
            class="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-purple-500/40 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 font-bold transition shadow-lg shadow-purple-500/10 disabled:opacity-50"
            [title]="'Play both in simultaneous stereo (Left: ' + targetA().artist + ', Right: ' + targetB().artist + ')'"
          >
            <mat-icon class="text-base">
              {{ audio.isPlaying() && audio.playingSide() === 'both' ? 'graphic_eq' : 'compare_arrows' }}
            </mat-icon>
            <span>Play Dual Stereo (L &times; R)</span>
          </button>

          <!-- Play Transposed Match -->
          <button
            type="button"
            (click)="playBothTransposed()"
            [disabled]="audio.isPlaying()"
            class="flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-semibold transition disabled:opacity-50"
            [title]="'Transposes Target A to the key of Target B for direct auditory alignment without scale shift'"
          >
            <mat-icon class="text-base">tune</mat-icon>
            <span>Audition in Matching Key</span>
          </button>

          <!-- Stop -->
          @if (audio.isPlaying()) {
            <button
              type="button"
              (click)="stop()"
              class="flex items-center space-x-1 px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition"
            >
              <mat-icon class="text-base text-rose-400">stop</mat-icon>
              <span>Stop</span>
            </button>
          }
        </div>
      </div>

      <!-- Playback Timeline & Tempo Slider -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-center pt-2 border-t border-slate-800/80">
        <!-- Progress Bar -->
        <div class="md:col-span-2 space-y-1.5">
          <div class="flex justify-between items-center text-[11px] font-mono text-slate-400">
            <span>
              STATUS:
              @if (audio.isPlaying()) {
                <span class="text-amber-300 font-bold uppercase animate-pulse">
                  Playing ({{ audio.playingSide() === 'both' ? 'Dual Stereo L/R' : 'Target ' + audio.playingSide() }})
                </span>
              } @else {
                <span class="text-slate-500">Idle / Ready</span>
              }
            </span>
            <span>{{ audio.playbackProgress().toFixed(0) }}%</span>
          </div>
          <div class="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
            <div
              class="h-2 rounded-full transition-all duration-75"
              [class]="audio.playingSide() === 'A' ? 'bg-amber-400' : audio.playingSide() === 'B' ? 'bg-rose-400' : 'bg-gradient-to-r from-amber-400 via-purple-400 to-rose-400'"
              [style.width.%]="audio.playbackProgress()"
            ></div>
          </div>
        </div>

        <!-- Quick Tempo Presets & Slider -->
        <div class="md:col-span-2 flex flex-col sm:flex-row items-center gap-3">
          <div class="flex items-center gap-1 text-[11px] font-mono text-slate-400">
            <span>PRESETS:</span>
            <button
              type="button"
              (click)="setBpm(targetA().bpm || 120)"
              class="px-2 py-0.5 rounded border border-slate-700 hover:bg-slate-800 text-xs transition truncate max-w-[130px]"
              [class]="playbackBpm() === targetA().bpm ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'text-slate-300'"
              [title]="targetA().bpm + ' BPM (' + targetA().title + ')'"
            >
              {{ targetA().bpm }} ({{ targetA().title.slice(0, 8) }}...)
            </button>
            <button
              type="button"
              (click)="setBpm(targetB().bpm || 116)"
              class="px-2 py-0.5 rounded border border-slate-700 hover:bg-slate-800 text-xs transition truncate max-w-[130px]"
              [class]="playbackBpm() === targetB().bpm ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'text-slate-300'"
              [title]="targetB().bpm + ' BPM (' + targetB().title + ')'"
            >
              {{ targetB().bpm }} ({{ targetB().title.slice(0, 8) }}...)
            </button>
          </div>

          <!-- Tempo / BPM slider -->
          <div class="flex items-center space-x-2 text-xs font-mono text-slate-400 flex-1 w-full">
            <span>TEMPO:</span>
            <input
              type="range"
              min="70"
              max="170"
              [value]="playbackBpm()"
              (input)="onBpmChange($event)"
              class="w-full accent-amber-500 cursor-pointer"
            />
            <span class="text-slate-200 font-bold min-w-14">{{ playbackBpm() }} BPM</span>
          </div>
        </div>
      </div>

      <!-- Musical analysis tip -->
      <div class="flex flex-wrap items-center justify-between text-[11px] text-slate-400 bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/60 font-mono gap-2">
        <span class="text-amber-300 flex items-center gap-1">
          <mat-icon class="text-xs">info</mat-icon>
          <strong>{{ targetA().title }} ({{ targetA().artist }}):</strong> {{ targetA().originalKey }} &bull; {{ targetA().notes.length }} notes
        </span>
        <span class="text-rose-300 flex items-center gap-1">
          <mat-icon class="text-xs">graphic_eq</mat-icon>
          <strong>{{ targetB().title }} ({{ targetB().artist }}):</strong> {{ targetB().originalKey }} &bull; {{ targetB().notes.length }} notes
        </span>
        <span class="text-emerald-300">
          Smith-Waterman Similarity: {{ (pipeline.similarityResult().normalizedScore * 100).toFixed(1) }}%
        </span>
      </div>
    </div>
  `,
})
export class AudioPlayerBar {
  readonly audio = inject(AudioSynthService);
  readonly pipeline = inject(PipelineService);
  readonly playbackBpm = signal<number>(120);

  constructor() {
    effect(() => {
      const a = this.pipeline.activeTargetA();
      if (a && a.bpm) {
        this.playbackBpm.set(a.bpm);
      }
      this.audio.stop();
    });
  }

  targetA() {
    return this.pipeline.activeTargetA();
  }

  targetB() {
    return this.pipeline.activeTargetB();
  }

  playA(): void {
    const notes = this.targetA().notes;
    this.audio.playMelody(notes, 'A', this.playbackBpm(), 0, 'warm');
  }

  playB(): void {
    const notes = this.targetB().notes;
    this.audio.playMelody(notes, 'B', this.playbackBpm(), 0, 'synth');
  }

  playBoth(): void {
    const notesA = this.targetA().notes;
    const notesB = this.targetB().notes;
    this.audio.playBothSimultaneously(notesA, notesB, this.playbackBpm());
  }

  playBothTransposed(): void {
    const notesA = this.targetA().notes;
    const notesB = this.targetB().notes;
    if (!notesA.length || !notesB.length) return;

    // Transpose Target A by the difference of starting pitches between B and A
    const diff = notesB[0].pitch - notesA[0].pitch;
    const transposedA = notesA.map((n) => ({
      ...n,
      pitch: n.pitch + diff,
      pitchName: this.audio.pitchToName(n.pitch + diff),
    }));
    this.audio.playBothSimultaneously(transposedA, notesB, this.playbackBpm());
  }

  stop(): void {
    this.audio.stop();
  }

  setBpm(val: number): void {
    this.playbackBpm.set(val);
  }

  onBpmChange(event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    this.playbackBpm.set(val);
  }
}
