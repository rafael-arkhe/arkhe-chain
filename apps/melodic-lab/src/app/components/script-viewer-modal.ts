import { ChangeDetectionStrategy, Component, inject, output, signal, afterNextRender } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { PipelineService } from '../services/pipeline.service';

@Component({
  selector: 'app-script-viewer-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <!-- Header -->
        <div class="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div class="flex items-center space-x-3">
            <div class="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <mat-icon class="text-xl">code</mat-icon>
            </div>
            <div>
              <div class="flex items-center space-x-2">
                <h3 class="text-base font-bold text-white font-mono">arkhe_melodic_pipeline.py</h3>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  v11 · Forensic Engine
                </span>
              </div>
              <p class="text-xs text-slate-400">
                Forensic Melodic Authorship & Similarity Pipeline &bull; Active Case: {{ activePreset().name }}
              </p>
            </div>
          </div>

          <div class="flex items-center space-x-2">
            <button
              type="button"
              (click)="copyCode()"
              class="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition"
            >
              <mat-icon class="text-sm">{{ copied() ? 'check' : 'content_copy' }}</mat-icon>
              <span>{{ copied() ? 'Copied' : 'Copy Script' }}</span>
            </button>

            <button
              type="button"
              (click)="closeModal.emit()"
              class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Close modal"
            >
              <mat-icon class="text-lg">close</mat-icon>
            </button>
          </div>
        </div>

        <!-- Function Jump Navigator -->
        <div class="px-4 py-2 border-b border-slate-800/80 bg-slate-950/40 flex items-center gap-2 overflow-x-auto text-[11px] font-mono text-slate-400">
          <span class="text-slate-500 shrink-0">KEY ALGORITHMS:</span>
          <span class="px-2 py-0.5 rounded bg-slate-800/80 text-amber-300 shrink-0">extract_skyline()</span>
          <span class="px-2 py-0.5 rounded bg-slate-800/80 text-amber-300 shrink-0">intervals_from_pitches()</span>
          <span class="px-2 py-0.5 rounded bg-slate-800/80 text-amber-300 shrink-0">smith_waterman()</span>
          <span class="px-2 py-0.5 rounded bg-slate-800/80 text-purple-300 shrink-0">calibrate_threshold()</span>
          <span class="px-2 py-0.5 rounded bg-slate-800/80 text-emerald-300 shrink-0">fingerprint_acoustid()</span>
          <span class="px-2 py-0.5 rounded bg-slate-800/80 text-sky-300 shrink-0">clap_embed()</span>
        </div>

        <!-- Code Block -->
        <div class="p-4 flex-1 overflow-y-auto custom-scrollbar bg-slate-950 font-mono text-xs text-slate-300 select-all leading-relaxed whitespace-pre">
{{ pythonCode() }}
        </div>
      </div>
    </div>
  `,
})
export class ScriptViewerModal {
  readonly pipeline = inject(PipelineService);
  readonly closeModal = output<void>();
  readonly copied = signal<boolean>(false);

  activePreset() {
    return (
      this.pipeline.presets().find((p) => p.id === this.pipeline.activePresetId()) ||
      this.pipeline.presets()[0]
    );
  }

  readonly pythonCode = signal('Carregando o código do servidor…');
  constructor() {
    afterNextRender(() => {
      void fetch('/api/script').then(async response => {
        if (!response.ok) throw new Error();
        this.pythonCode.set(await response.text());
      }).catch(() => this.pythonCode.set('Não foi possível carregar o script. Verifique o servidor e tente novamente.'));
    });
  }

  copyCode(): void {
    navigator.clipboard.writeText(this.pythonCode());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}
