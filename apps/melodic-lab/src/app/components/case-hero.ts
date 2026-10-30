import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { PipelineService } from '../services/pipeline.service';

@Component({
  selector: 'app-case-hero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/90 via-slate-900/50 to-slate-950 p-6 sm:p-8 shadow-2xl">
      <!-- Glow ambient backdrop -->
      <div class="pointer-events-none absolute -top-24 -left-24 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl"></div>
      <div class="pointer-events-none absolute -bottom-24 -right-24 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl"></div>

      <div class="relative z-10 flex flex-col lg:flex-row gap-6 items-start justify-between">
        <!-- Main Description -->
        <div class="max-w-3xl space-y-3">
          <div class="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-300 text-xs font-mono">
            <mat-icon class="text-sm">gavel</mat-icon>
            <span>FORENSIC MUSICOLOGY BENCHMARK · CASE STUDY</span>
          </div>

          <h1 class="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {{ activePreset().name }}
          </h1>

          <p class="text-slate-300 text-sm leading-relaxed">
            {{ activePreset().shortDesc }} —
            <span class="text-slate-400">{{ activePreset().legalOutcome }}</span>
          </p>

          <!-- Historical quote / context callout -->
          @if (activePreset().historicalQuote) {
            <div class="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-start space-x-3 text-xs text-slate-300">
              <mat-icon class="text-amber-400 shrink-0 mt-0.5 text-base">format_quote</mat-icon>
              <div class="space-y-1">
                <p class="italic text-slate-200">
                  "{{ activePreset().historicalQuote }}"
                </p>
                <p class="text-slate-400 text-[11px]">
                  — {{ activePreset().historicalQuoteAuthor }}
                </p>
              </div>
            </div>
          }
        </div>

        <!-- Key Metrics Badge Matrix -->
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full lg:w-auto shrink-0 font-mono">
          <!-- Melodic Score -->
          <div class="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
            <span class="text-[11px] text-slate-400">SW MELODIC SIM</span>
            <div class="flex items-baseline space-x-1 my-1">
              <span class="text-2xl font-bold" [class.text-emerald-400]="pipeline.decisionStatus() === 'above_threshold'" [class.text-slate-300]="pipeline.decisionStatus() !== 'above_threshold'">
                {{ (pipeline.similarityResult().normalizedScore * 100).toFixed(1) }}%
              </span>
            </div>
            <span class="text-[10px] text-amber-300/80">
              @if (pipeline.decisionStatus() === 'above_threshold') {
                Acima do limiar de exemplo > {{ (pipeline.calibrationResult().threshold * 100).toFixed(1) }}%
              } @else {
                Below Threshold
              }
            </span>
          </div>

          <!-- CLAP Cosine -->
          <div class="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
            <span class="text-[11px] text-slate-400">CLAP · VALOR DO PRESET</span>
            <div class="flex items-baseline space-x-1 my-1">
              <span class="text-2xl font-bold text-sky-400">
                {{ pipeline.activeClapCosine().toFixed(3) }}
              </span>
            </div>
            <span class="text-[10px] text-slate-400">Não medido nesta sessão</span>
          </div>

          <!-- Conformal Alpha -->
          <div class="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between col-span-2 sm:col-span-1">
            <span class="text-[11px] text-slate-400">CONFORMAL FPR</span>
            <div class="flex items-baseline space-x-1 my-1">
              <span class="text-2xl font-bold text-purple-400">
                &le; {{ (pipeline.alpha() * 100).toFixed(0) }}%
              </span>
            </div>
            <span class="text-[10px] text-purple-300/80">
              k={{ mathCeil((pipeline.calibrationResult().n_calibration + 1) * (1 - pipeline.alpha())) }} (Valid)
            </span>
          </div>
        </div>
      </div>

      <!-- Target A and Target B side-by-side summaries -->
      <div class="mt-6 pt-6 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Target A Card -->
        <div class="p-4 rounded-xl bg-slate-950/60 border border-amber-500/20 relative group">
          <div class="flex items-start justify-between">
            <div>
              <div class="flex items-center space-x-2">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">TARGET A</span>
                <span class="text-xs font-mono text-slate-400">{{ targetA().year }} · ORIGINAL WORK</span>
              </div>
              <h3 class="text-base font-bold text-white mt-1">{{ targetA().title }}</h3>
              <p class="text-xs text-amber-400 font-medium">{{ targetA().artist }}</p>
            </div>
            <div class="text-right text-[11px] text-slate-400 font-mono">
              <p>Key: {{ targetA().originalKey }}</p>
              <p>{{ targetA().bpm }} BPM</p>
            </div>
          </div>
          <div class="mt-3 pt-3 border-t border-slate-800/60 grid grid-cols-2 gap-2 text-[11px] text-slate-400 font-mono">
            <div>
              <span class="text-slate-500 block">ISRC:</span>
              <span class="text-slate-300 truncate block">{{ targetA().recording.isrcs[0] || 'N/A' }}</span>
            </div>
            <div>
              <span class="text-slate-500 block">MBID:</span>
              <span class="text-slate-300 truncate block" [title]="targetA().recording.mbid">{{ targetA().recording.mbid.slice(0, 13) }}...</span>
            </div>
          </div>
        </div>

        <!-- Target B Card -->
        <div class="p-4 rounded-xl bg-slate-950/60 border border-rose-500/20 relative group">
          <div class="flex items-start justify-between">
            <div>
              <div class="flex items-center space-x-2">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-500/20 text-rose-300 border border-rose-500/30">TARGET B</span>
                <span class="text-xs font-mono text-slate-400">{{ targetB().year }} · ALLEGED INFRINGEMENT</span>
              </div>
              <h3 class="text-base font-bold text-white mt-1">{{ targetB().title }}</h3>
              <p class="text-xs text-rose-400 font-medium">{{ targetB().artist }}</p>
            </div>
            <div class="text-right text-[11px] text-slate-400 font-mono">
              <p>Key: {{ targetB().originalKey }}</p>
              <p>{{ targetB().bpm }} BPM</p>
            </div>
          </div>
          <div class="mt-3 pt-3 border-t border-slate-800/60 grid grid-cols-2 gap-2 text-[11px] text-slate-400 font-mono">
            <div>
              <span class="text-slate-500 block">ISRC:</span>
              <span class="text-slate-300 truncate block">{{ targetB().recording.isrcs[0] || 'N/A' }}</span>
            </div>
            <div>
              <span class="text-slate-500 block">MBID:</span>
              <span class="text-slate-300 truncate block" [title]="targetB().recording.mbid">{{ targetB().recording.mbid.slice(0, 13) }}...</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class CaseHero {
  readonly pipeline = inject(PipelineService);

  activePreset() {
    return (
      this.pipeline.presets().find((p) => p.id === this.pipeline.activePresetId()) ||
      this.pipeline.presets()[0]
    );
  }

  targetA() {
    return this.pipeline.activeTargetA();
  }

  targetB() {
    return this.pipeline.activeTargetB();
  }

  mathCeil(num: number): number {
    return Math.ceil(num);
  }
}
