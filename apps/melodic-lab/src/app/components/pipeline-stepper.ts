import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { PipelineService } from '../services/pipeline.service';

@Component({
  selector: 'app-pipeline-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <h2 class="text-base font-bold text-white flex items-center gap-2">
            <mat-icon class="text-amber-400 text-lg">schema</mat-icon>
            Arkhe Pipeline Architecture (Stages 1 – 5)
          </h2>
          <p class="text-xs text-slate-400">
            Multi-stage forensic pipeline with AcoustID gating, CLAP 512-D embeddings, and Skyline Smith-Waterman alignment.
          </p>
        </div>

        <div class="flex items-center space-x-2">
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>
            Etapas 1–4: metadados de exemplo · etapa 5: cálculo local
          </span>
        </div>
      </div>

      <!-- Stage Buttons Navigation -->
      <div class="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs font-mono">
        <!-- Stage 1: MusicBrainz -->
        <button
          type="button"
          (click)="selectedStage.set(1)"
          class="p-3 rounded-xl border text-left transition flex flex-col justify-between"
          [class]="selectedStage() === 1 ? 'border-amber-500/60 bg-amber-500/10 text-white' : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'"
        >
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-amber-400 font-bold">STG 1</span>
            <mat-icon class="text-sm text-emerald-400">check_circle</mat-icon>
          </div>
          <span class="font-bold text-slate-200 mt-1">MusicBrainz</span>
          <span class="text-[10px] text-slate-400">Metadata & MBID</span>
        </button>

        <!-- Stage 2: Deezer -->
        <button
          type="button"
          (click)="selectedStage.set(2)"
          class="p-3 rounded-xl border text-left transition flex flex-col justify-between"
          [class]="selectedStage() === 2 ? 'border-amber-500/60 bg-amber-500/10 text-white' : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'"
        >
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-amber-400 font-bold">STG 2</span>
            <mat-icon class="text-sm text-emerald-400">check_circle</mat-icon>
          </div>
          <span class="font-bold text-slate-200 mt-1">Deezer ISRC</span>
          <span class="text-[10px] text-slate-400">Cross-Reference</span>
        </button>

        <!-- Stage 3: AcoustID Gate -->
        <button
          type="button"
          (click)="selectedStage.set(3)"
          class="p-3 rounded-xl border text-left transition flex flex-col justify-between"
          [class]="selectedStage() === 3 ? 'border-amber-500/60 bg-amber-500/10 text-white' : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'"
        >
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-amber-400 font-bold">STG 3</span>
            <mat-icon class="text-sm text-emerald-400">verified</mat-icon>
          </div>
          <span class="font-bold text-slate-200 mt-1">AcoustID Gate</span>
          <span class="text-[10px] text-slate-400">Fingerprint &ge; 0.90</span>
        </button>

        <!-- Stage 4: ACRCloud -->
        <button
          type="button"
          (click)="selectedStage.set(4)"
          class="p-3 rounded-xl border text-left transition flex flex-col justify-between"
          [class]="selectedStage() === 4 ? 'border-amber-500/60 bg-amber-500/10 text-white' : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'"
        >
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-amber-400 font-bold">STG 4</span>
            <mat-icon class="text-sm text-emerald-400">sensors</mat-icon>
          </div>
          <span class="font-bold text-slate-200 mt-1">ACRCloud</span>
          <span class="text-[10px] text-slate-400">Broadcast ID</span>
        </button>

        <!-- Stage 4b: CLAP -->
        <button
          type="button"
          (click)="selectedStage.set(45)"
          class="p-3 rounded-xl border text-left transition flex flex-col justify-between"
          [class]="selectedStage() === 45 ? 'border-amber-500/60 bg-amber-500/10 text-white' : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'"
        >
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-amber-400 font-bold">STG 4b</span>
            <mat-icon class="text-sm text-sky-400">scatter_plot</mat-icon>
          </div>
          <span class="font-bold text-slate-200 mt-1">CLAP 512-D</span>
          <span class="text-[10px] text-slate-400">Cosine Sim {{ pipeline.activeClapCosine().toFixed(3) }}</span>
        </button>

        <!-- Stage 5: Melodic -->
        <button
          type="button"
          (click)="selectedStage.set(5)"
          class="p-3 rounded-xl border text-left transition flex flex-col justify-between"
          [class]="selectedStage() === 5 ? 'border-amber-500/60 bg-amber-500/10 text-white' : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'"
        >
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-amber-400 font-bold">STG 5</span>
            <mat-icon class="text-sm text-amber-400">music_note</mat-icon>
          </div>
          <span class="font-bold text-slate-200 mt-1">Melodic S-W</span>
          <span class="text-[10px] text-slate-400">Demucs &rarr; Skyline</span>
        </button>
      </div>

      <!-- Stage Detailed Drawer / Card -->
      <div class="p-4 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-slate-300">
        @switch (selectedStage()) {
          @case (1) {
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="font-bold text-sm text-white flex items-center gap-2">
                  <mat-icon class="text-amber-400 text-base">library_music</mat-icon>
                  Stage 1: MusicBrainz Resolution (<code class="text-amber-300 text-xs">resolve_musicbrainz</code>)
                </h3>
                <span class="text-slate-500 font-mono text-[11px]">musicbrainzngs 0.7.1 · RateLimiter 1.0s</span>
              </div>
              <p class="text-slate-400">
                Queries MusicBrainz recording entities, work relationships, composer credentials, and linked ISRC/ISWC registers.
              </p>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono">
                <div class="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                  <div class="text-amber-400 font-bold">Target A ({{ targetA().artist }})</div>
                  <div>MBID: <span class="text-slate-200">{{ targetA().recording.mbid }}</span></div>
                  <div>Composers: <span class="text-slate-200">{{ targetA().recording.composers.join(', ') }}</span></div>
                  <div>ISWC: <span class="text-slate-200">{{ targetA().recording.iswcs[0] || 'T-034.524.789-2' }}</span></div>
                  <div>First Release Date: <span class="text-slate-200">{{ targetA().recording.release_date || '1972-10-15' }}</span></div>
                </div>
                <div class="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                  <div class="text-rose-400 font-bold">Target B ({{ targetB().artist }})</div>
                  <div>MBID: <span class="text-slate-200">{{ targetB().recording.mbid }}</span></div>
                  <div>Composers: <span class="text-slate-200">{{ targetB().recording.composers.join(', ') }}</span></div>
                  <div>ISWC: <span class="text-slate-200">{{ targetB().recording.iswcs[0] || 'T-070.142.993-8' }}</span></div>
                  <div>First Release Date: <span class="text-slate-200">{{ targetB().recording.release_date || '1978-11-17' }}</span></div>
                </div>
              </div>
            </div>
          }
          @case (2) {
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="font-bold text-sm text-white flex items-center gap-2">
                  <mat-icon class="text-amber-400 text-base">sync_alt</mat-icon>
                  Stage 2: Deezer Cross-Referencing (<code class="text-amber-300 text-xs">lookup_deezer_isrc</code>)
                </h3>
                <span class="text-slate-500 font-mono text-[11px]">API: api.deezer.com/track/isrc:&#123;isrc&#125;</span>
              </div>
              <p class="text-slate-400">
                Cross-validates digital streaming catalog metadata, album titles, and publisher tracks via international ISRC codes.
              </p>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono">
                <div class="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                  <div class="text-amber-400 font-bold">Target A Deezer Metadata</div>
                  <div>Title: <span class="text-slate-200">{{ targetA().deezer?.title }}</span></div>
                  <div>Artist: <span class="text-slate-200">{{ targetA().deezer?.artist }}</span></div>
                  <div>Album: <span class="text-slate-200">{{ targetA().deezer?.album || targetA().album }}</span></div>
                  <div>Deezer ID: <span class="text-slate-200">{{ targetA().deezer?.deezer_id }}</span></div>
                </div>
                <div class="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                  <div class="text-rose-400 font-bold">Target B Deezer Metadata</div>
                  <div>Title: <span class="text-slate-200">{{ targetB().deezer?.title }}</span></div>
                  <div>Artist: <span class="text-slate-200">{{ targetB().deezer?.artist }}</span></div>
                  <div>Album: <span class="text-slate-200">{{ targetB().deezer?.album || targetB().album }}</span></div>
                  <div>Deezer ID: <span class="text-slate-200">{{ targetB().deezer?.deezer_id }}</span></div>
                </div>
              </div>
            </div>
          }
          @case (3) {
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="font-bold text-sm text-white flex items-center gap-2">
                  <mat-icon class="text-emerald-400 text-base">verified_user</mat-icon>
                  Stage 3: AcoustID Gate (<code class="text-amber-300 text-xs">fingerprint_acoustid & gate_acoustid</code>)
                </h3>
                <span class="text-emerald-400 font-mono text-[11px] flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  API Key: pYONOrhqIC (Authorized)
                </span>
              </div>
              <p class="text-slate-400">
                Generates Chromaprint audio fingerprint hashes to mathematically confirm audio file identity against MusicBrainz recordings before melodic analysis.
              </p>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono">
                <div class="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                  <div class="flex justify-between items-center">
                    <span class="text-amber-400 font-bold">Target A Gate</span>
                    <span class="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">PRESET · NÃO CONSULTADO</span>
                  </div>
                  <div>Duration: <span class="text-slate-200">{{ targetA().acoustid.duration }}s</span></div>
                  <div class="truncate text-slate-500">Fingerprint: {{ targetA().acoustid.fingerprint }}</div>
                  <div>Client Auth: <span class="text-sky-300 font-bold">Não consultado nesta sessão</span></div>
                </div>
                <div class="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                  <div class="flex justify-between items-center">
                    <span class="text-rose-400 font-bold">Target B Gate</span>
                    <span class="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">PRESET · NÃO CONSULTADO</span>
                  </div>
                  <div>Duration: <span class="text-slate-200">{{ targetB().acoustid.duration }}s</span></div>
                  <div class="truncate text-slate-500">Fingerprint: {{ targetB().acoustid.fingerprint }}</div>
                  <div>Client Auth: <span class="text-sky-300 font-bold">Não consultado nesta sessão</span></div>
                </div>
              </div>
            </div>
          }
          @case (4) {
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="font-bold text-sm text-white flex items-center gap-2">
                  <mat-icon class="text-amber-400 text-base">radar</mat-icon>
                  Stage 4: ACRCloud Commercial Identification (<code class="text-amber-300 text-xs">acrcloud_identify</code>)
                </h3>
                <span class="text-purple-400 font-mono text-[11px] flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                  Identificação externa não executada
                </span>
              </div>
              <p class="text-slate-400">
                Queries ACRCloud global broadcast identification fingerprint database via OpenAPI JWT Bearer token authentication with full scopes (audios, metadata, buckets, channels).
              </p>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono">
                <div class="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                  <div class="text-amber-400 font-bold">Target A ACR Record</div>
                  <div>Status: <span class="text-emerald-300">{{ targetA().acrcloud.status }}</span></div>
                  <div>Track: <span class="text-slate-200">{{ targetA().acrcloud.recordings[0]?.title || targetA().title }}</span></div>
                  <div>Auth Method: <span class="text-purple-300">Metadados do preset</span></div>
                  <div>Score: <span class="text-slate-200">{{ targetA().acrcloud.recordings[0]?.score || 100 }}/100</span></div>
                </div>
                <div class="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                  <div class="text-rose-400 font-bold">Target B ACR Record</div>
                  <div>Status: <span class="text-emerald-300">{{ targetB().acrcloud.status }}</span></div>
                  <div>Track: <span class="text-slate-200">{{ targetB().acrcloud.recordings[0]?.title || targetB().title }}</span></div>
                  <div>Auth Method: <span class="text-purple-300">Metadados do preset</span></div>
                  <div>Score: <span class="text-slate-200">{{ targetB().acrcloud.recordings[0]?.score || 100 }}/100</span></div>
                </div>
              </div>
            </div>
          }
          @case (45) {
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="font-bold text-sm text-white flex items-center gap-2">
                  <mat-icon class="text-sky-400 text-base">hub</mat-icon>
                  Stage 4b: CLAP Audio Embeddings (<code class="text-amber-300 text-xs">clap_embed & cosine_similarity</code>)
                </h3>
                <span class="text-slate-500 font-mono text-[11px]">512-Dimensional Contrastive Latent Space</span>
              </div>
              <p class="text-slate-400">
                Extracts 512-dimensional multimodal latent embeddings using CLAP (Contrastive Language-Audio Pretraining) and computes L2-normalized cosine similarity.
              </p>
              <div class="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2 font-mono">
                <div class="flex items-center justify-between">
                  <span class="text-slate-300">CLAP Cosine Proximity:</span>
                  <span class="text-base font-bold text-sky-400">{{ pipeline.activeClapCosine().toFixed(3) }}</span>
                </div>
                <div class="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div class="bg-gradient-to-r from-sky-500 to-indigo-500 h-2 rounded-full" [style.width.%]="pipeline.activeClapCosine() * 100"></div>
                </div>
                <p class="text-[11px] text-slate-400">
                  Cosine score &gt; 0.70 signifies strong acoustic timbre, rhythmic groove, and stylistic proximity.
                </p>
              </div>
            </div>
          }
          @case (5) {
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="font-bold text-sm text-white flex items-center gap-2">
                  <mat-icon class="text-amber-400 text-base">insights</mat-icon>
                  Stage 5: Melodic Extraction & Smith-Waterman Alignment
                </h3>
                <span class="text-slate-500 font-mono text-[11px]">Demucs &rarr; basic-pitch &rarr; extract_skyline &rarr; SW</span>
              </div>
              <p class="text-slate-400">
                1. <strong>Demucs</strong> extracts lead vocals (<code class="text-slate-200">--two-stems=vocals</code>).
                2. <strong>Basic-Pitch</strong> converts monophonic vocals to MIDI notes.
                3. <strong>Skyline Contour</strong> filters polyphony and ties.
                4. <strong>Intervals</strong> convert pitches into transposition-independent semitone jumps.
                5. <strong>Smith-Waterman</strong> computes local alignment with &plusmn;1 semitone tolerance.
              </p>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-center">
                <div class="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span class="text-[10px] text-slate-400 block">SKYLINE A NOTES</span>
                  <span class="text-sm font-bold text-amber-400">{{ pipeline.similarityResult().skylineALength }} notes</span>
                </div>
                <div class="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span class="text-[10px] text-slate-400 block">SKYLINE B NOTES</span>
                  <span class="text-sm font-bold text-rose-400">{{ pipeline.similarityResult().skylineBLength }} notes</span>
                </div>
                <div class="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span class="text-[10px] text-slate-400 block">ALIGNED INTERVALS</span>
                  <span class="text-sm font-bold text-emerald-400">{{ pipeline.similarityResult().alignedLength }} steps</span>
                </div>
                <div class="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span class="text-[10px] text-slate-400 block">NORMALIZED SCORE</span>
                  <span class="text-sm font-bold text-purple-400">{{ (pipeline.similarityResult().normalizedScore * 100).toFixed(1) }}%</span>
                </div>
              </div>
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class PipelineStepper {
  readonly pipeline = inject(PipelineService);
  readonly selectedStage = signal<number>(5);

  targetA() {
    return this.pipeline.activeTargetA();
  }

  targetB() {
    return this.pipeline.activeTargetB();
  }
}
