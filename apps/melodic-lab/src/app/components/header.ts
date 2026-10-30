import { ChangeDetectionStrategy, Component, inject, output, signal, afterNextRender } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { PipelineService } from '../services/pipeline.service';

@Component({
  selector: 'app-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <header class="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <!-- Logo and Title -->
        <div class="flex items-center space-x-3">
          <div class="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 via-orange-600 to-rose-600 flex items-center justify-center shadow-lg shadow-amber-500/20 text-white">
            <mat-icon class="text-2xl">graphic_eq</mat-icon>
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <span class="font-bold text-lg tracking-tight text-white flex items-center gap-1.5 font-mono">
                ARKHE<span class="text-amber-400 font-sans font-light">::MELODIC</span>
              </span>
              <span class="text-[10px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                v11 · 2026
              </span>
              <span class="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hidden md:inline-block">
                ANÁLISE DE NOTAS
              </span>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/20 hidden lg:inline-flex items-center gap-1" title="Configuração consultada no servidor">
                <span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                AcoustID: {{ credentials().acoustid }}
              </span>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 hidden lg:inline-flex items-center gap-1" title="Configuração consultada no servidor">
                <span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                ACRCloud: {{ credentials().acrcloud }}
              </span>
            </div>
            <p class="text-xs text-slate-400 hidden sm:block truncate">
              Forensic Musicology & Melodic Similarity Lab · {{ activePreset().name }}
            </p>
          </div>
        </div>

        <!-- Case Quick Selector & Tabs -->
        <div class="flex items-center space-x-2">
          <!-- Preset Dropdown -->
          <div class="relative">
            <select
              [value]="pipeline.activePresetId()"
              (change)="onPresetChange($event)"
              class="bg-slate-900 border border-slate-700/80 hover:border-slate-600 text-slate-200 text-xs rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-amber-500/40 cursor-pointer font-medium appearance-none transition"
            >
              @for (preset of pipeline.presets(); track preset.id) {
                <option [value]="preset.id">{{ preset.name }}</option>
              }
            </select>
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
              <mat-icon class="text-base">arrow_drop_down</mat-icon>
            </div>
          </div>

          <!-- Python Script Modal Toggle Button -->
          <button
            type="button"
            (click)="viewScript.emit()"
            class="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-mono transition"
            title="Inspect arkhe_melodic_pipeline.py Python source code"
          >
            <mat-icon class="text-sm text-amber-400">code</mat-icon>
            <span class="hidden md:inline">arkhe_pipeline.py</span>
          </button>

          <!-- Report JSON Action -->
          <button
            type="button"
            (click)="viewReport.emit()"
            class="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-medium transition"
          >
            <mat-icon class="text-sm">verified</mat-icon>
            <span>Report & Hashes</span>
          </button>
        </div>
      </div>
    </header>
  `,
})
export class Header {
  readonly credentials = signal({ acoustid: 'consultando', acrcloud: 'consultando' });
  constructor() {
    afterNextRender(() => {
      void fetch('/api/credentials/status').then(async response => {
        if (!response.ok) throw new Error();
        const value = await response.json();
        this.credentials.set({ acoustid: value.acoustid.configured ? 'configurado' : 'não configurado', acrcloud: value.acrcloud.configured ? 'configurado' : 'não configurado' });
      }).catch(() => this.credentials.set({ acoustid: 'indisponível', acrcloud: 'indisponível' }));
    });
  }
  readonly pipeline = inject(PipelineService);
  readonly viewScript = output<void>();
  readonly viewReport = output<void>();

  activePreset() {
    return (
      this.pipeline.presets().find((p) => p.id === this.pipeline.activePresetId()) ||
      this.pipeline.presets()[0]
    );
  }

  onPresetChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.pipeline.selectPreset(val);
  }
}
