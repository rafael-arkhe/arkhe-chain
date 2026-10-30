import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { PipelineService } from '../services/pipeline.service';

@Component({
  selector: 'app-interval-alignment-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <h2 class="text-base font-bold text-white flex items-center gap-2">
            <mat-icon class="text-amber-400 text-lg">timeline</mat-icon>
            Aligned Relative Melodic Interval Trace
          </h2>
          <p class="text-xs text-slate-400">
            Transposition-invariant sequence representation (<code class="text-amber-300 font-mono">intervals[i] = pitch[i+1] - pitch[i]</code>).
          </p>
        </div>

        <div class="flex items-center space-x-2 text-[11px] font-mono">
          <span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            Exact Match
          </span>
          <span class="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
            &plusmn;1 Tolerated
          </span>
          <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-400">
            Gap / Insertion
          </span>
        </div>
      </div>

      <!-- Musical Principle Banner -->
      <div class="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start space-x-3 text-xs text-slate-300">
        <mat-icon class="text-sky-400 shrink-0 mt-0.5 text-base">lightbulb</mat-icon>
        <p class="leading-relaxed">
          <strong class="text-white">Melodic Transposition Invariance:</strong> Even when a composition is transposed to another key (e.g. {{ targetA().originalKey }} in {{ targetA().title }} &times; {{ targetB().originalKey }} in {{ targetB().title }}), absolute MIDI pitch numbers shift, yet relative semitone intervals remain identical. The Smith-Waterman dynamic programming algorithm detects the invariant melodic contour irrespective of pitch key shifts.
        </p>
      </div>

      <!-- Step Cards Horizontal Flow -->
      <div class="overflow-x-auto custom-scrollbar pb-2">
        <div class="flex items-stretch gap-2 min-w-max">
          @for (step of pipeline.similarityResult().alignmentSteps; track $index) {
            <div
              class="p-2.5 rounded-xl border text-center font-mono text-xs flex flex-col justify-between w-24 shrink-0 transition"
              [class]="getStepCardClass(step.type)"
            >
              <div class="text-[10px] text-slate-400 uppercase font-bold mb-1">
                Step #{{ $index + 1 }}
              </div>

              <!-- Values -->
              <div class="space-y-1 my-1">
                <div class="flex justify-between items-center text-[11px]">
                  <span class="text-amber-400">A:</span>
                  <span class="font-bold text-white">
                    {{ step.valA !== null ? (step.valA > 0 ? '+' : '') + step.valA : '&mdash;' }}
                  </span>
                </div>
                <div class="flex justify-between items-center text-[11px]">
                  <span class="text-rose-400">B:</span>
                  <span class="font-bold text-white">
                    {{ step.valB !== null ? (step.valB > 0 ? '+' : '') + step.valB : '&mdash;' }}
                  </span>
                </div>
              </div>

              <!-- Badge -->
              <div class="mt-1 pt-1 border-t border-slate-800/80 text-[10px] font-bold">
                @switch (step.type) {
                  @case ('exact') {
                    <span class="text-emerald-400">EXACT</span>
                  }
                  @case ('tolerance') {
                    <span class="text-amber-300">&plusmn;1 TOL</span>
                  }
                  @case ('mismatch') {
                    <span class="text-rose-400">DIFF</span>
                  }
                  @default {
                    <span class="text-slate-400">GAP</span>
                  }
                }
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class IntervalAlignmentView {
  readonly pipeline = inject(PipelineService);

  targetA() {
    return this.pipeline.activeTargetA();
  }

  targetB() {
    return this.pipeline.activeTargetB();
  }

  getStepCardClass(type: string): string {
    switch (type) {
      case 'exact':
        return 'bg-emerald-950/30 border-emerald-500/40 shadow-sm shadow-emerald-500/10';
      case 'tolerance':
        return 'bg-amber-950/30 border-amber-500/40 shadow-sm shadow-amber-500/10';
      case 'mismatch':
        return 'bg-rose-950/30 border-rose-500/40';
      default:
        return 'bg-slate-950/60 border-slate-800 text-slate-500';
    }
  }
}
