import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { PipelineService } from '../services/pipeline.service';

@Component({
  selector: 'app-youtube-music-explorer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
      <!-- Section Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h2 class="text-base font-bold text-white flex items-center gap-2">
            <mat-icon class="text-rose-500 text-lg">play_circle_filled</mat-icon>
            Official Master Recordings on YouTube Music &bull; Auditory Forensic Proof
          </h2>
          <p class="text-xs text-slate-400">
            Compare the original master recordings on YouTube Music with precise cue timestamps pointing to the disputed melodic hooks.
          </p>
        </div>

        <div class="flex items-center space-x-2">
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-rose-500/10 text-rose-300 border border-rose-500/20">
            <mat-icon class="text-xs mr-1 text-rose-400">headphones</mat-icon>
            YouTube Music Audio Proof
          </span>
        </div>
      </div>

      <!-- Quick Search Bar -->
      <div class="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row items-center gap-2">
        <div class="relative w-full">
          <input
            type="text"
            [value]="searchQuery()"
            (input)="searchQuery.set($any($event.target).value)"
            (keydown.enter)="openCustomSearch()"
            class="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-slate-200 text-xs font-mono focus:ring-2 focus:ring-rose-500 outline-none"
            [placeholder]="'Search track or artist on YouTube Music (e.g. ' + targetA().artist + ' ' + targetA().title + ' vs ' + targetB().artist + ' ' + targetB().title + ')...'"
          />
          <mat-icon class="text-slate-500 absolute left-2.5 top-2.5 text-base">search</mat-icon>
        </div>

        <button
          type="button"
          (click)="openCustomSearch()"
          class="w-full sm:w-auto px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-bold transition flex items-center justify-center gap-1.5 shrink-0 shadow-lg shadow-rose-600/20"
        >
          <mat-icon class="text-sm">open_in_new</mat-icon>
          <span>Search YT Music</span>
        </button>
      </div>

      <!-- Dual Cards: Real Recordings Comparison -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
        <!-- Target A Card -->
        <div class="p-4 rounded-xl bg-slate-950/90 border border-amber-500/30 flex flex-col justify-between space-y-3 relative group">
          <div>
            <div class="flex items-center justify-between">
              <span class="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                TARGET A &bull; ORIGINAL WORK ({{ targetA().year }})
              </span>
              <span class="text-slate-400 text-[11px]">{{ targetA().originalKey }} &bull; {{ targetA().bpm }} BPM</span>
            </div>

            <h3 class="text-base font-bold text-white mt-2">{{ targetA().title }}</h3>
            <p class="text-xs text-amber-400 font-medium">{{ targetA().artist }} &mdash; Album: {{ targetA().album || 'Original Release' }}</p>

            <!-- Hook timestamp highlight -->
            <div class="mt-3 p-3 rounded-lg bg-slate-900 border border-amber-500/20 space-y-1">
              <div class="flex items-center justify-between text-amber-300 font-bold text-[11px]">
                <span class="flex items-center gap-1">
                  <mat-icon class="text-sm">schedule</mat-icon> Hook Cue Point:
                </span>
                <span class="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-200">{{ targetA().hookTimestamp || 'Melodic Entry' }}</span>
              </div>
              <p class="text-slate-300 italic text-[11px]">
                "{{ targetA().hookLyrics || 'Main motif melody' }}"
              </p>
              <p class="text-[10px] text-slate-500">
                Key / Tonality: {{ targetA().originalKey }} &bull; {{ targetA().notes.length }} notes analyzed
              </p>
            </div>
          </div>

          <!-- YouTube Music Links -->
          <div class="pt-2 border-t border-slate-800 flex items-center justify-between">
            <a
              [href]="targetA().youtubeMusicUrl || getDynamicYtMusicUrl(targetA().artist + ' ' + targetA().title)"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold transition"
            >
              <mat-icon class="text-sm text-rose-500">music_note</mat-icon>
              <span>Open in YouTube Music</span>
              <mat-icon class="text-xs text-slate-400">open_in_new</mat-icon>
            </a>

            <a
              [href]="getDynamicYtSearchUrl(targetA().artist + ' ' + targetA().title + ' ' + targetA().year)"
              target="_blank"
              rel="noopener noreferrer"
              class="text-slate-400 hover:text-white transition text-[11px]"
            >
              Search on YouTube
            </a>
          </div>
        </div>

        <!-- Target B Card -->
        <div class="p-4 rounded-xl bg-slate-950/90 border border-rose-500/30 flex flex-col justify-between space-y-3 relative group">
          <div>
            <div class="flex items-center justify-between">
              <span class="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                TARGET B &bull; ALLEGED DERIVATION ({{ targetB().year }})
              </span>
              <span class="text-slate-400 text-[11px]">{{ targetB().originalKey }} &bull; {{ targetB().bpm }} BPM</span>
            </div>

            <h3 class="text-base font-bold text-white mt-2">{{ targetB().title }}</h3>
            <p class="text-xs text-rose-400 font-medium">{{ targetB().artist }} &mdash; Album: {{ targetB().album || 'Alleged Infringement' }}</p>

            <!-- Hook timestamp highlight -->
            <div class="mt-3 p-3 rounded-lg bg-slate-900 border border-rose-500/20 space-y-1">
              <div class="flex items-center justify-between text-rose-300 font-bold text-[11px]">
                <span class="flex items-center gap-1">
                  <mat-icon class="text-sm">schedule</mat-icon> Hook Cue Point:
                </span>
                <span class="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-200">{{ targetB().hookTimestamp || 'Disputed section' }}</span>
              </div>
              <p class="text-slate-300 italic text-[11px]">
                "{{ targetB().hookLyrics || 'Disputed melodic response' }}"
              </p>
              <p class="text-[10px] text-slate-500">
                Key / Tonality: {{ targetB().originalKey }} &bull; {{ targetB().notes.length }} notes analyzed
              </p>
            </div>
          </div>

          <!-- YouTube Music Links -->
          <div class="pt-2 border-t border-slate-800 flex items-center justify-between">
            <a
              [href]="targetB().youtubeMusicUrl || getDynamicYtMusicUrl(targetB().artist + ' ' + targetB().title)"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 font-bold transition"
            >
              <mat-icon class="text-sm text-rose-500">music_note</mat-icon>
              <span>Open in YouTube Music</span>
              <mat-icon class="text-xs text-slate-400">open_in_new</mat-icon>
            </a>

            <a
              [href]="getDynamicYtSearchUrl(targetB().artist + ' ' + targetB().title + ' ' + targetB().year)"
              target="_blank"
              rel="noopener noreferrer"
              class="text-slate-400 hover:text-white transition text-[11px]"
            >
              Search on YouTube
            </a>
          </div>
        </div>
      </div>

      <!-- Musicological Forensic Listening Guide -->
      <div class="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 flex items-start space-x-3">
        <mat-icon class="text-rose-400 shrink-0 mt-0.5 text-base">hearing</mat-icon>
        <div class="space-y-1">
          <p class="font-bold text-white">Forensic Musicological Auditory Guide:</p>
          <p class="text-slate-400 text-[11px] leading-relaxed">
            When listening to <strong class="text-amber-300">{{ targetA().title }}</strong> ({{ targetA().artist }}, {{ targetA().year }}) and <strong class="text-rose-300">{{ targetB().title }}</strong> ({{ targetB().artist }}, {{ targetB().year }}), pay attention to the progression of relative interval jumps. The Smith-Waterman alignment algorithm calculates <strong>{{ (pipeline.similarityResult().normalizedScore * 100).toFixed(1) }}% melodic similarity</strong> (Status: {{ pipeline.decisionStatus() === 'above_threshold' ? 'Above conformal infringement threshold' : 'Below conformal threshold' }}).
          </p>
        </div>
      </div>
    </div>
  `,
})
export class YoutubeMusicExplorer {
  readonly pipeline = inject(PipelineService);
  readonly searchQuery = signal<string>('');

  targetA() {
    return this.pipeline.activeTargetA();
  }

  targetB() {
    return this.pipeline.activeTargetB();
  }

  getDynamicYtMusicUrl(query: string): string {
    return `https://music.youtube.com/search?q=${encodeURIComponent(query)}`;
  }

  getDynamicYtSearchUrl(query: string): string {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  }

  openCustomSearch(): void {
    const raw = this.searchQuery().trim() || `${this.targetA().artist} ${this.targetA().title} vs ${this.targetB().artist} ${this.targetB().title}`;
    const query = encodeURIComponent(raw);
    if (query) {
      window.open(`https://music.youtube.com/search?q=${query}`, '_blank');
    }
  }
}
