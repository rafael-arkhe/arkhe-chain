import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { PipelineService } from '../services/pipeline.service';

@Component({
  selector: 'app-calibration-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-5">
      <!-- Section Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h2 class="text-base font-bold text-white flex items-center gap-2">
            <mat-icon class="text-purple-400 text-lg">science</mat-icon>
            Conformal Calibration Test Bench (<code class="text-purple-300 font-mono text-sm">calibrate_threshold</code>)
          </h2>
          <p class="text-xs text-slate-400">
            Finite-sample false-positive guarantee via empirical negative null distribution (conformal quantiles).
          </p>
        </div>

        <div class="flex items-center space-x-2 text-xs font-mono">
          <span class="px-2.5 py-1 rounded-lg border" [class]="cal().calibration_valid ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border-rose-500/30'">
            {{ cal().calibration_valid ? 'CALIBRATION VALID (ALPHA GUARANTEED)' : 'UNCALIBRATED' }}
          </span>
        </div>
      </div>

      <!-- Conformal Prediction Theory Explanation -->
      <div class="p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300 space-y-2">
        <div class="flex items-center space-x-2 font-bold text-white">
          <mat-icon class="text-purple-400 text-base">balance</mat-icon>
          <span>Conformal Method of Negatives & Empirical Null Distribution</span>
        </div>
        <p class="leading-relaxed text-slate-400">
          In copyright forensics, choosing an arbitrary similarity threshold (like 0.50) is legally indefensible. The Arkhe pipeline uses <strong class="text-slate-200">conformal prediction over negative pairs</strong>: unrelated pairs define the null distribution. The threshold is set to the <code class="text-amber-300 font-mono">k = ceil((n_cal + 1)(1 - &alpha;))</code>-th order statistic. Under exchangeability, this provides a distribution-free mathematical guarantee that the false positive rate will not exceed <strong class="text-purple-300">&alpha; ({{ (pipeline.alpha() * 100).toFixed(0) }}%)</strong>.
        </p>
      </div>

      <!-- Controls for Alpha and Calibration Fraction -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
        <!-- Target Alpha -->
        <div class="space-y-1">
          <div class="flex justify-between text-slate-400">
            <span>TARGET &alpha; (MAX FPR):</span>
            <span class="text-purple-300 font-bold">{{ (pipeline.alpha() * 100).toFixed(1) }}%</span>
          </div>
          <input
            type="range"
            min="0.01"
            max="0.15"
            step="0.01"
            [value]="pipeline.alpha()"
            (input)="onAlphaChange($event)"
            class="w-full accent-purple-500 cursor-pointer"
          />
        </div>

        <!-- Calibration Fraction -->
        <div class="space-y-1">
          <div class="flex justify-between text-slate-400">
            <span>CALIBRATION FRACTION:</span>
            <span class="text-amber-300 font-bold">{{ (pipeline.calibrationFraction() * 100).toFixed(0) }}%</span>
          </div>
          <input
            type="range"
            min="0.2"
            max="0.8"
            step="0.05"
            [value]="pipeline.calibrationFraction()"
            (input)="onFractionChange($event)"
            class="w-full accent-amber-500 cursor-pointer"
          />
        </div>

        <!-- Random Seed -->
        <div class="space-y-1">
          <div class="flex justify-between text-slate-400">
            <span>SHUFFLE SEED:</span>
            <span class="text-sky-300 font-bold">{{ pipeline.randomSeed() }}</span>
          </div>
          <button
            type="button"
            (click)="shuffleSeed()"
            class="w-full py-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-mono flex items-center justify-center gap-1.5 transition"
          >
            <mat-icon class="text-sm text-sky-400">shuffle</mat-icon>
            <span>Re-shuffle Negatives</span>
          </button>
        </div>
      </div>

      <!-- Forensic Confusion Matrix & Metrics -->
      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs font-mono">
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800">
          <span class="text-slate-500 block text-[10px]">CALIBRATED &tau;</span>
          <span class="text-base font-bold text-purple-400">{{ (cal().threshold * 100).toFixed(1) }}%</span>
          <span class="text-[10px] text-slate-400">Decision Cutoff</span>
        </div>

        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800">
          <span class="text-slate-500 block text-[10px]">EMPIRICAL FPR</span>
          <span class="text-base font-bold text-emerald-400">{{ (cal().fpr * 100).toFixed(1) }}%</span>
          <span class="text-[10px] text-slate-400">&le; {{ (cal().alpha * 100).toFixed(0) }}% bounded</span>
        </div>

        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800">
          <span class="text-slate-500 block text-[10px]">RECALL (TPR)</span>
          <span class="text-base font-bold text-sky-400">{{ (cal().recall * 100).toFixed(1) }}%</span>
          <span class="text-[10px] text-slate-400">{{ cal().tp }} / {{ cal().n_positives }} detected</span>
        </div>

        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800">
          <span class="text-slate-500 block text-[10px]">PRECISION</span>
          <span class="text-base font-bold text-amber-400">{{ (cal().precision * 100).toFixed(1) }}%</span>
          <span class="text-[10px] text-slate-400">Positive Predictive</span>
        </div>

        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800">
          <span class="text-slate-500 block text-[10px]">F1 SCORE</span>
          <span class="text-base font-bold text-white">{{ (cal().f1 * 100).toFixed(1) }}%</span>
          <span class="text-[10px] text-slate-400">Harmonic Mean</span>
        </div>

        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800">
          <span class="text-slate-500 block text-[10px]">PAIRS BENCHMARK</span>
          <span class="text-base font-bold text-slate-200">{{ cal().n_positives + cal().n_negatives }}</span>
          <span class="text-[10px] text-slate-400">{{ cal().n_positives }} Pos &bull; {{ cal().n_negatives }} Neg</span>
        </div>
      </div>

      <!-- Null Distribution Visual Spectrum -->
      <div class="space-y-2 pt-2">
        <div class="flex justify-between items-center text-xs font-mono text-slate-400">
          <span>Similarity Distribution: Null Negatives vs. Benchmark Precedents</span>
          <span class="text-purple-400 font-bold">Cutoff &tau; = {{ (cal().threshold * 100).toFixed(1) }}%</span>
        </div>

        <div class="relative bg-slate-950 rounded-xl border border-slate-800 p-4 h-24 flex items-center select-none overflow-hidden">
          <!-- Background Zones -->
          <div class="absolute inset-y-0 left-0 bg-slate-900/40" [style.width.%]="cal().threshold * 100"></div>
          <div class="absolute inset-y-0 right-0 bg-rose-950/20" [style.left.%]="cal().threshold * 100"></div>

          <!-- Threshold Line -->
          <div class="absolute inset-y-0 w-0.5 bg-purple-400 z-10 shadow-lg shadow-purple-500" [style.left.%]="cal().threshold * 100">
            <span class="absolute -top-1 -translate-x-1/2 px-1.5 py-0.5 rounded bg-purple-500 text-white text-[9px] font-mono font-bold">
              &tau; {{ (cal().threshold * 100).toFixed(0) }}%
            </span>
          </div>

          <!-- Active Case Score Pin -->
          <div
            class="absolute top-2 -translate-x-1/2 z-20 flex flex-col items-center"
            [style.left.%]="pipeline.similarityResult().normalizedScore * 100"
          >
            <span class="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-mono text-[10px] font-extrabold shadow-lg shadow-emerald-500/50 flex items-center gap-1">
              <mat-icon class="text-xs">flag</mat-icon> Active Case: {{ (pipeline.similarityResult().normalizedScore * 100).toFixed(1) }}%
            </span>
            <div class="w-1 h-12 bg-emerald-400"></div>
          </div>

          <!-- Scatter points of benchmark scores -->
          @for (item of cal().val_scores; track $index) {
            <div
              class="absolute rounded-full transition-transform hover:scale-150 cursor-pointer"
              [class]="item.label === 'positive' ? 'w-3 h-3 bg-rose-400 border border-rose-200 z-10 bottom-4' : 'w-2.5 h-2.5 bg-slate-500 border border-slate-300 bottom-3'"
              [style.left.%]="item.score * 100"
              [title]="(item.name || item.label) + ': ' + (item.score * 100).toFixed(1) + '%'"
            ></div>
          }
        </div>

        <div class="flex justify-between items-center text-[10px] font-mono text-slate-500">
          <span>0.0% (Unrelated Null Works)</span>
          <span class="text-purple-400 font-bold">&larr; Permissible Non-Infringing | Infringing Domain &rarr;</span>
          <span>100.0% (Identical Motif)</span>
        </div>
      </div>
    </div>
  `,
})
export class CalibrationView {
  readonly pipeline = inject(PipelineService);

  cal() {
    return this.pipeline.calibrationResult();
  }

  onAlphaChange(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.pipeline.alpha.set(val);
  }

  onFractionChange(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.pipeline.calibrationFraction.set(val);
  }

  shuffleSeed(): void {
    this.pipeline.randomSeed.update((s) => (s * 31 + 17) % 9999);
  }
}
