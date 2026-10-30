import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { PipelineService } from '../services/pipeline.service';
import { MatrixCell } from '../models/pipeline.model';

@Component({
  selector: 'app-smith-waterman-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-5">
      <!-- Section Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h2 class="text-base font-bold text-white flex items-center gap-2">
            <mat-icon class="text-amber-400 text-lg">grid_on</mat-icon>
            Smith-Waterman Dynamic Programming Alignment Matrix
          </h2>
          <p class="text-xs text-slate-400">
            Local melodic alignment over relative interval vectors. Traceback path highlighted in emerald.
          </p>
        </div>

        <!-- Formula Callout -->
        <div class="px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] font-mono text-slate-300 flex items-center gap-2">
          <span class="text-amber-400 font-bold">NORMALIZATION:</span>
          <span>max(H) / (match &times; min(m, n))</span>
          <span class="text-emerald-400 font-bold">= {{ (pipeline.similarityResult().normalizedScore * 100).toFixed(1) }}%</span>
        </div>
      </div>

      <!-- Parameter Sliders -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
        <!-- Tolerance -->
        <div class="space-y-1">
          <div class="flex justify-between text-slate-400">
            <span>TOLERANCE:</span>
            <span class="text-amber-300 font-bold">&plusmn;{{ pipeline.tolerance() }} semitone</span>
          </div>
          <input
            type="range"
            min="0"
            max="3"
            step="1"
            [value]="pipeline.tolerance()"
            (input)="onTolChange($event)"
            class="w-full accent-amber-500 cursor-pointer"
          />
        </div>

        <!-- Match Score -->
        <div class="space-y-1">
          <div class="flex justify-between text-slate-400">
            <span>MATCH SCORE:</span>
            <span class="text-emerald-300 font-bold">+{{ pipeline.matchScore() }}</span>
          </div>
          <input
            type="range"
            min="1"
            max="5"
            step="1"
            [value]="pipeline.matchScore()"
            (input)="onMatchChange($event)"
            class="w-full accent-emerald-500 cursor-pointer"
          />
        </div>

        <!-- Mismatch Score -->
        <div class="space-y-1">
          <div class="flex justify-between text-slate-400">
            <span>MISMATCH:</span>
            <span class="text-rose-300 font-bold">{{ pipeline.mismatchScore() }}</span>
          </div>
          <input
            type="range"
            min="-4"
            max="0"
            step="1"
            [value]="pipeline.mismatchScore()"
            (input)="onMismatchChange($event)"
            class="w-full accent-rose-500 cursor-pointer"
          />
        </div>

        <!-- Gap Score -->
        <div class="space-y-1">
          <div class="flex justify-between text-slate-400">
            <span>GAP PENALTY:</span>
            <span class="text-purple-300 font-bold">{{ pipeline.gapScore() }}</span>
          </div>
          <input
            type="range"
            min="-4"
            max="0"
            step="1"
            [value]="pipeline.gapScore()"
            (input)="onGapChange($event)"
            class="w-full accent-purple-500 cursor-pointer"
          />
        </div>
      </div>

      <!-- Matrix Interactive Heatmap Grid -->
      <div class="space-y-2">
        <div class="flex items-center justify-between text-xs font-mono text-slate-400">
          <span>Rows: Target A intervals ({{ pipeline.similarityResult().intervalsALength }}) &bull; Cols: Target B intervals ({{ pipeline.similarityResult().intervalsBLength }})</span>
          <span class="text-emerald-400 font-bold flex items-center gap-1">
            <span class="w-2.5 h-2.5 rounded bg-emerald-500 inline-block"></span>
            Optimal Traceback Path (Length: {{ pipeline.similarityResult().alignedLength }})
          </span>
        </div>

        <div class="bg-slate-950 rounded-xl border border-slate-800 p-3 overflow-x-auto custom-scrollbar select-none">
          <table class="border-collapse text-[10px] font-mono min-w-full">
            <thead>
              <tr>
                <th class="p-1.5 text-slate-600 bg-slate-950 sticky left-0 z-10 border-b border-r border-slate-800">i &#92; j</th>
                <th class="p-1.5 text-slate-600 bg-slate-950 border-b border-slate-800">0</th>
                @for (valB of pipeline.similarityResult().intervalsB; track $index) {
                  <th class="p-1.5 text-rose-300 bg-slate-900/60 border-b border-slate-800 text-center font-bold" title="Interval B {{ $index }}">
                    {{ valB > 0 ? '+' : '' }}{{ valB }}
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of pipeline.similarityResult().matrix; track $index; let r = $index) {
                <tr>
                  <!-- Row header with Interval A value -->
                  <th class="p-1.5 text-center sticky left-0 z-10 bg-slate-950 border-r border-slate-800 font-bold" [class.text-amber-300]="r > 0" [class.text-slate-600]="r === 0">
                    @if (r === 0) {
                      0
                    } @else {
                      {{ pipeline.similarityResult().intervalsA[r - 1] > 0 ? '+' : '' }}{{ pipeline.similarityResult().intervalsA[r - 1] }}
                    }
                  </th>

                  <!-- Cells -->
                  @for (cell of row; track $index; let c = $index) {
                    <td
                      (mouseenter)="onHoverCell(r, c, cell)"
                      (mouseleave)="onLeaveCell()"
                      class="p-1.5 text-center transition-all cursor-crosshair border border-slate-900/60 font-mono"
                      [class]="getCellClass(cell)"
                    >
                      {{ cell.score }}
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Hover Cell Inspector Details -->
      @if (hoveredCell()) {
        <div class="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 text-xs font-mono text-slate-300 flex flex-wrap items-center justify-between gap-2 animate-fadeIn">
          <div class="flex items-center space-x-2">
            <span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
              Cell [{{ hoveredCell()!.r }}, {{ hoveredCell()!.c }}]
            </span>
            <span>Score: <strong class="text-white">{{ hoveredCell()!.cell.score }}</strong></span>
            <span>Direction: <strong class="text-amber-400 uppercase">{{ hoveredCell()!.cell.dir }}</strong></span>
            <span>Aligned length so far: <strong class="text-slate-200">{{ hoveredCell()!.cell.len }}</strong></span>
          </div>

          <div class="text-[11px] text-slate-400">
            @if (hoveredCell()!.cell.inTrace) {
              <span class="text-emerald-400 font-bold flex items-center gap-1">
                <mat-icon class="text-xs">star</mat-icon> In Optimal Traceback Alignment
              </span>
            } @else {
              <span>Non-optimal cell</span>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class SmithWatermanView {
  readonly pipeline = inject(PipelineService);
  readonly hoveredCell = signal<{ r: number; c: number; cell: MatrixCell } | null>(null);

  getCellClass(cell: MatrixCell): string {
    if (cell.inTrace) {
      return 'bg-emerald-500/30 text-emerald-200 font-extrabold ring-1 ring-emerald-400 shadow-sm shadow-emerald-500/40';
    }
    if (cell.score === 0) {
      return 'text-slate-700 bg-slate-950';
    }
    if (cell.score > 15) {
      return 'bg-amber-500/25 text-amber-200 font-bold';
    }
    if (cell.score > 8) {
      return 'bg-amber-500/15 text-amber-300';
    }
    return 'bg-slate-900/60 text-slate-400';
  }

  onHoverCell(r: number, c: number, cell: MatrixCell): void {
    this.hoveredCell.set({ r, c, cell });
  }

  onLeaveCell(): void {
    this.hoveredCell.set(null);
  }

  onTolChange(event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    this.pipeline.tolerance.set(val);
  }

  onMatchChange(event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    this.pipeline.matchScore.set(val);
  }

  onMismatchChange(event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    this.pipeline.mismatchScore.set(val);
  }

  onGapChange(event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    this.pipeline.gapScore.set(val);
  }
}
