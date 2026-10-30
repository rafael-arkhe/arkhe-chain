import { ChangeDetectionStrategy, Component, inject, computed } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AudioSynthService } from '../services/audio-synth.service';
import { PipelineService } from '../services/pipeline.service';

@Component({
  selector: 'app-piano-roll-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <h2 class="text-base font-bold text-white flex items-center gap-2">
            <mat-icon class="text-amber-400 text-lg">piano</mat-icon>
            Skyline Lead Monophonic Contours (Piano Roll)
          </h2>
          <p class="text-xs text-slate-400">
            Monophonic voice filtered via <code class="text-amber-300 font-mono">extract_skyline(overlap_ratio=0.5)</code>. Notice how the melodic pitches and rhythmic contours align!
          </p>
        </div>

        <div class="flex items-center space-x-3 text-xs font-mono">
          <div class="flex items-center space-x-1.5">
            <span class="w-3 h-3 rounded bg-amber-500/80 border border-amber-400"></span>
            <span class="text-slate-300">Target A ({{ targetA().artist }})</span>
          </div>
          <div class="flex items-center space-x-1.5">
            <span class="w-3 h-3 rounded bg-rose-500/80 border border-rose-400"></span>
            <span class="text-slate-300">Target B ({{ targetB().artist }})</span>
          </div>
        </div>
      </div>

      <!-- Piano Roll Canvas / SVG Container -->
      <div class="space-y-6">
        <!-- Target A Piano Roll -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-xs font-mono">
            <span class="text-amber-400 font-bold flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-amber-400"></span>
              TARGET A: {{ targetA().artist }} &mdash; "{{ targetA().title }}" ({{ targetA().year }})
            </span>
            <span class="text-slate-500">{{ targetA().notes.length }} notes · Skyline Lead</span>
          </div>

          <div class="relative bg-slate-950/80 rounded-xl border border-slate-800/80 p-3 overflow-x-auto custom-scrollbar">
            <div class="min-w-[680px] h-32 relative select-none">
              <!-- Horizontal Pitch Gridlines -->
              @for (pitch of displayPitches(); track pitch) {
                <div
                  class="absolute w-full border-b border-slate-800/40 text-[9px] font-mono text-slate-600 pl-1 flex items-center"
                  [style.top.px]="pitchToY(pitch)"
                  [style.height.px]="pitchHeight"
                >
                  <span class="opacity-60">{{ pitchToName(pitch) }}</span>
                </div>
              }

              <!-- Target A Notes -->
              @for (note of targetA().notes; track $index) {
                <div
                  class="absolute rounded shadow transition-all duration-100 flex items-center justify-center font-mono text-[10px] font-bold cursor-default"
                  [class]="audio.currentNoteA() === $index ? 'bg-amber-300 text-slate-950 ring-2 ring-white scale-105 z-20 shadow-amber-400/50' : 'bg-amber-500/85 hover:bg-amber-400 text-slate-950 border border-amber-300/40 z-10'"
                  [style.left.px]="beatToX(note.onset)"
                  [style.width.px]="durationToWidth(note.duration)"
                  [style.top.px]="pitchToY(note.pitch)"
                  [style.height.px]="pitchHeight - 2"
                  [title]="note.pitchName + ' (' + note.pitch + ') onset: ' + note.onset + ' beats'"
                >
                  {{ note.pitchName }}
                </div>
              }
            </div>
          </div>
        </div>

        <!-- Target B Piano Roll -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-xs font-mono">
            <span class="text-rose-400 font-bold flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-rose-400"></span>
              TARGET B: {{ targetB().artist }} &mdash; "{{ targetB().title }}" ({{ targetB().year }})
            </span>
            <span class="text-slate-500">{{ targetB().notes.length }} notes · {{ targetB().source || 'Melodic Motif' }}</span>
          </div>

          <div class="relative bg-slate-950/80 rounded-xl border border-slate-800/80 p-3 overflow-x-auto custom-scrollbar">
            <div class="min-w-[680px] h-32 relative select-none">
              <!-- Horizontal Pitch Gridlines -->
              @for (pitch of displayPitches(); track pitch) {
                <div
                  class="absolute w-full border-b border-slate-800/40 text-[9px] font-mono text-slate-600 pl-1 flex items-center"
                  [style.top.px]="pitchToY(pitch)"
                  [style.height.px]="pitchHeight"
                >
                  <span class="opacity-60">{{ pitchToName(pitch) }}</span>
                </div>
              }

              <!-- Target B Notes -->
              @for (note of targetB().notes; track $index) {
                <div
                  class="absolute rounded shadow transition-all duration-100 flex items-center justify-center font-mono text-[10px] font-bold cursor-default"
                  [class]="audio.currentNoteB() === $index ? 'bg-rose-300 text-slate-950 ring-2 ring-white scale-105 z-20 shadow-rose-400/50' : 'bg-rose-500/85 hover:bg-rose-400 text-slate-950 border border-rose-300/40 z-10'"
                  [style.left.px]="beatToX(note.onset)"
                  [style.width.px]="durationToWidth(note.duration)"
                  [style.top.px]="pitchToY(note.pitch)"
                  [style.height.px]="pitchHeight - 2"
                  [title]="note.pitchName + ' (' + note.pitch + ') onset: ' + note.onset + ' beats'"
                >
                  {{ note.pitchName }}
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class PianoRollView {
  readonly pipeline = inject(PipelineService);
  readonly audio = inject(AudioSynthService);

  readonly pitchHeight = 16;
  readonly pixelsPerBeat = 62;

  readonly minPitch = computed<number>(() => {
    const allPitches = [...this.targetA().notes, ...this.targetB().notes].map((n) => n.pitch);
    return allPitches.length ? Math.min(...allPitches) - 1 : 58;
  });

  readonly maxPitch = computed<number>(() => {
    const allPitches = [...this.targetA().notes, ...this.targetB().notes].map((n) => n.pitch);
    return allPitches.length ? Math.max(...allPitches) + 1 : 75;
  });

  readonly displayPitches = computed<number[]>(() => {
    const list: number[] = [];
    const minP = this.minPitch();
    const maxP = this.maxPitch();
    for (let p = maxP; p >= minP; p--) {
      list.push(p);
    }
    return list;
  });

  targetA() {
    return this.pipeline.activeTargetA();
  }

  targetB() {
    return this.pipeline.activeTargetB();
  }

  pitchToY(pitch: number): number {
    return (this.maxPitch() - pitch) * this.pitchHeight;
  }

  beatToX(onset: number): number {
    return onset * this.pixelsPerBeat + 36;
  }

  durationToWidth(duration: number): number {
    return Math.max(duration * this.pixelsPerBeat - 3, 18);
  }

  pitchToName(midi: number): string {
    return this.audio.pitchToName(midi);
  }
}
