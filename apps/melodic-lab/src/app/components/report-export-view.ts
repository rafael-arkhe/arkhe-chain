import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { reportPreimage } from '../services/report-integrity';
import { PipelineReport } from '../models/pipeline.model';
import { PipelineService } from '../services/pipeline.service';

@Component({
  selector: 'app-report-export-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-5">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h2 class="text-base font-bold text-white flex items-center gap-2">
            <mat-icon class="text-amber-400 text-lg">verified</mat-icon>
            Cryptographic Integrity & Forensic JSON Report
          </h2>
          <p class="text-xs text-slate-400">
            Análise de notas fornecidas. Metadados dos presets não comprovam identidade, assinatura ou ancoragem. O SHA-256 é calculado sobre o JSON com chaves ordenadas, excluindo report_hash.
          </p>
        </div>

        <div class="flex items-center space-x-2">
          <!-- Copy JSON Button -->
          <button
            type="button"
            (click)="copyJson()"
            class="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition"
          >
            <mat-icon class="text-sm">{{ copied() ? 'check' : 'content_copy' }}</mat-icon>
            <span>{{ copied() ? 'Copied!' : 'Copy JSON' }}</span>
          </button>

          <!-- Download JSON Button -->
          <button
            type="button"
            (click)="downloadJson()"
            class="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-mono font-bold transition"
          >
            <mat-icon class="text-sm">download</mat-icon>
            <span>Download arkhe_report.json</span>
          </button>
        </div>
      </div>

      <div class="space-y-3 text-sm">
        <button type="button" (click)="saveReport()" [disabled]="busy()" class="px-3 py-2 rounded bg-slate-800 text-white">{{ busy() ? 'Salvando…' : 'Salvar análise no servidor' }}</button>
        <button type="button" (click)="loadHistory()" [disabled]="busy()" class="px-3 py-2 rounded bg-slate-800 text-white">Atualizar histórico</button>
        <p role="status" aria-live="polite">{{ status() }}</p>
        @for (entry of history(); track entry.id) {
          <div class="flex gap-3 text-slate-300"><span>{{ entry.title }} · {{ entry.generated_at }}</span><button type="button" (click)="downloadSaved(entry.id)" class="underline">Baixar análise salva</button></div>
        }
      </div>
      <!-- SHA-256 Hash Chain Summary -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
          <span class="text-slate-500 text-[10px] block">AUDIO TARGET A SHA-256</span>
          <span class="text-slate-300 break-all select-all">{{ report().target_a.sha256 || 'Não medido' }}</span>
        </div>
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
          <span class="text-slate-500 text-[10px] block">AUDIO TARGET B SHA-256</span>
          <span class="text-slate-300 break-all select-all">{{ report().target_b.sha256 || 'Não medido' }}</span>
        </div>
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
          <span class="text-slate-500 text-[10px] block">SCRIPT SHA-256 (arkhe_melodic_pipeline.py v11)</span>
          <span class="text-amber-400 break-all select-all">{{ report().script_sha256 || 'Não medido nesta análise de navegador' }}</span>
        </div>
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
          <span class="text-slate-500 text-[10px] block">REPORT SHA-256 (JSON COM CHAVES ORDENADAS)</span>
          <span class="text-emerald-400 break-all select-all">{{ exportHash() || 'Calculado ao copiar, baixar ou salvar' }}</span>
        </div>
      </div>

      <!-- Hash Architecture Callout -->
      <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <div class="flex items-center gap-2">
          <mat-icon class="text-amber-400 text-sm">lock_clock</mat-icon>
          <span>Integridade da exportação: <strong>SHA-256</strong> sobre o JSON com chaves ordenadas. Arquivos de áudio e MIDI precisam ser verificados com os originais.</span>
        </div>
        <span class="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 text-[10px]">
          SHA-256
        </span>
      </div>

      <!-- Blockchain & C2PA Provenance Verification Card -->
      @if (report().anchor) {
        <div class="p-4 rounded-xl bg-slate-950/80 border border-purple-500/30 space-y-3 font-mono text-xs">
          <div class="flex items-center justify-between">
            <span class="text-purple-400 font-bold flex items-center gap-2">
              <mat-icon class="text-base text-purple-400">link</mat-icon>
              SOLANA DEVNET ANCHOR & MMR ROOT (APPEND-ONLY PROOF)
            </span>
            <span class="px-2 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30">
              CLUSTER: DEVNET
            </span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
            <div class="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <span class="text-slate-500 text-[10px] block">TRANSACTION SIGNATURE</span>
              <a
                [href]="report().anchor?.explorer_url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-sky-400 hover:text-sky-300 underline break-all flex items-center gap-1"
              >
                <span>{{ report().anchor?.tx_signature }}</span>
                <mat-icon class="text-xs shrink-0">open_in_new</mat-icon>
              </a>
            </div>

            <div class="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <span class="text-slate-500 text-[10px] block">MERKLE MOUNTAIN RANGE (MMR) ROOT</span>
              <span class="text-purple-300 break-all select-all">{{ report().anchor?.mmr_root }}</span>
            </div>
          </div>

          @if (report().c2pa) {
            <div class="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
              <div class="flex items-center gap-2">
                <mat-icon class="text-xs text-emerald-400">shield</mat-icon>
                <span>C2PA Manifest: <code class="text-slate-200">{{ report().c2pa?.manifest_id }}</code></span>
              </div>
              <div class="flex items-center gap-2">
                <span>Signer DID: <code class="text-slate-300">{{ report().c2pa?.signer_did?.slice(0, 24) }}...</code></span>
                <span class="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">Ed25519 VERIFIED</span>
              </div>
            </div>
          }
        </div>
      }

      <!-- CLI Terminal & Preflight Verification Snippet -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
        <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-slate-400 flex items-center gap-1.5 font-bold">
              <mat-icon class="text-xs text-amber-400">terminal</mat-icon> Pipeline Generation CLI
            </span>
            <span class="text-[10px] text-slate-500">Python v11</span>
          </div>
          <pre class="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 text-[11px] text-amber-300 overflow-x-auto select-all">python3 arkhe_melodic_pipeline.py \
  --audio-a "data/{{ sanitizeForFilename(report().target_a.title) }}_{{ report().target_a.year }}.wav" \
  --audio-b "data/{{ sanitizeForFilename(report().target_b.title) }}_{{ report().target_b.year }}.wav" \
  --title-a "{{ report().target_a.title }}" --artist-a "{{ report().target_a.artist }}" --year-a {{ report().target_a.year }} \
  --title-b "{{ report().target_b.title }}" --artist-b "{{ report().target_b.artist }}" --year-b {{ report().target_b.year }} \
  --alpha {{ pipeline.alpha() }} \
  --out arkhe_report.json</pre>
        </div>

        <div class="p-3.5 rounded-xl bg-slate-950 border border-emerald-900/40 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-emerald-400 flex items-center gap-1.5 font-bold">
              <mat-icon class="text-xs text-emerald-400">verified</mat-icon> Preflight Mechanical Verification
            </span>
            <span class="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
              VERIFICAÇÃO EXTERNA NÃO EXECUTADA
            </span>
          </div>
          <pre class="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 text-[11px] text-emerald-300 overflow-x-auto select-all">python3 preflight_check.py arkhe_report.json \
  --audio-a data/audio/taj_mahal_1972.wav \
  --audio-b data/audio/da_ya_think_1978.wav</pre>
          <div class="text-[10px] text-slate-400 flex flex-wrap gap-x-3 gap-y-1 pt-1">
            <span class="text-emerald-400">Hash do arquivo: não medido</span>
            <span class="text-emerald-400">Hash do relatório: calculado na exportação</span>
            <span class="text-emerald-400">Ancoragem: não executada</span>
            <span class="text-emerald-400">C2PA: não verificado</span>
            <span class="text-emerald-400">Calibração: consultar resultado</span>
          </div>
        </div>
      </div>

      <!-- JSON Viewer with Scrollbar -->
      <div class="space-y-1.5">
        <div class="flex justify-between items-center text-xs font-mono text-slate-400">
          <span>JSON da análise (antes da exportação)</span>
          <span class="text-[10px] text-slate-500">ISO 8601 Timestamp: {{ report().generated_at }}</span>
        </div>
        <pre class="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 max-h-96 overflow-y-auto custom-scrollbar select-all">{{ formattedJson() }}</pre>
      </div>
    </div>
  `,
})
export class ReportExportView {
  readonly pipeline = inject(PipelineService);
  readonly copied = signal<boolean>(false);

  report() {
    return this.pipeline.generatedReport();
  }

  sanitizeForFilename(name: string): string {
    return (name || 'track').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  formattedJson(): string {
    return JSON.stringify(this.report(), null, 2);
  }

  readonly busy = signal(false);
  readonly status = signal('');
  private readonly exported = signal<{ report: PipelineReport; hash: string } | null>(null);
  exportHash(): string { const exported = this.exported(); return exported?.report === this.report() ? exported.hash : ''; }
  readonly history = signal<{id: string; title: string; generated_at: string}[]>([]);

  private async exportReport(): Promise<PipelineReport> {
    const report = this.report();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(reportPreimage(report)));
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    this.exported.set({ report, hash });
    return { ...report, report_hash: hash };
  }

  async copyJson(): Promise<void> {
    try {
      await navigator.clipboard.writeText(JSON.stringify(await this.exportReport(), null, 2));
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch { this.status.set('Não foi possível copiar. Use o download.'); }
  }

  private download(report: unknown): void {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'arkhe_report.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async downloadJson(): Promise<void> {
    try { this.download(await this.exportReport()); }
    catch { this.status.set('Não foi possível gerar a exportação.'); }
  }

  async loadHistory(): Promise<void> {
    try {
      const response = await fetch('/api/reports');
      if (!response.ok) throw new Error();
      this.history.set(await response.json());
      this.status.set(this.history().length ? 'Histórico atualizado.' : 'Nenhuma análise salva.');
    } catch { this.status.set('Histórico indisponível. Verifique o servidor.'); }
  }

  async saveReport(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const response = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(await this.exportReport()) });
      if (!response.ok) throw new Error();
      const saved = await response.json();
      await this.loadHistory();
      this.status.set('Análise salva. Protocolo: ' + saved.id);
    } catch { this.status.set('Não foi possível salvar a análise. Tente novamente.'); }
    finally { this.busy.set(false); }
  }

  async downloadSaved(id: string): Promise<void> {
    try {
      const response = await fetch('/api/reports/' + encodeURIComponent(id));
      if (!response.ok) throw new Error();
      this.download(await response.json());
    } catch { this.status.set('Não foi possível recuperar a análise salva.'); }
  }
}
