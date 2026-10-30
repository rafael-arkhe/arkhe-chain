import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { PipelineService } from '../services/pipeline.service';
import { MelodicNote } from '../models/pipeline.model';

@Component({
  selector: 'app-custom-benchmark-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div class="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div class="flex items-center space-x-3">
            <div class="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <mat-icon class="text-xl">edit_note</mat-icon>
            </div>
            <div>
              <h3 class="text-base font-bold text-white">Custom Melodic Comparator</h3>
              <p class="text-xs text-slate-400">
                Input custom note sequences or MIDI pitch numbers to test Smith-Waterman alignment
              </p>
            </div>
          </div>

          <button
            type="button"
            (click)="closeModal.emit()"
            class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <mat-icon class="text-lg">close</mat-icon>
          </button>
        </div>

        <div class="p-5 overflow-y-auto space-y-4 text-xs font-mono">
          <!-- Target A Input -->
          <div class="space-y-2 p-3.5 rounded-xl bg-slate-950 border border-amber-500/30">
            <span class="text-amber-400 font-bold block">TARGET A NOTES (e.g. F4 G4 A4 F4 D4 C4 D4 or 65 67 69 65 62 60 62):</span>
            <input
              type="text"
              [value]="notesInputA()"
              (input)="notesInputA.set($any($event.target).value)"
              class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-100 text-xs focus:ring-2 focus:ring-amber-500 outline-none"
              placeholder="F4 F4 G4 A4 F4 D4 F4 D4 C4 D4 F4 G4 A4"
            />
            <div class="flex gap-2">
              <input
                type="text"
                [value]="titleA()"
                (input)="titleA.set($any($event.target).value)"
                class="w-1/2 bg-slate-900 border border-slate-800 rounded p-1.5 text-slate-300 text-xs"
                placeholder="Title A"
              />
              <input
                type="text"
                [value]="artistA()"
                (input)="artistA.set($any($event.target).value)"
                class="w-1/2 bg-slate-900 border border-slate-800 rounded p-1.5 text-slate-300 text-xs"
                placeholder="Artist A"
              />
            </div>
          </div>

          <!-- Target B Input -->
          <div class="space-y-2 p-3.5 rounded-xl bg-slate-950 border border-rose-500/30">
            <span class="text-rose-400 font-bold block">TARGET B NOTES (Alleged Infringement / Comparison):</span>
            <input
              type="text"
              [value]="notesInputB()"
              (input)="notesInputB.set($any($event.target).value)"
              class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-100 text-xs focus:ring-2 focus:ring-rose-500 outline-none"
              placeholder="F4 F4 G4 A4 F4 D4 F4 D4 C4 D4 F4 G4 A4"
            />
            <div class="flex gap-2">
              <input
                type="text"
                [value]="titleB()"
                (input)="titleB.set($any($event.target).value)"
                class="w-1/2 bg-slate-900 border border-slate-800 rounded p-1.5 text-slate-300 text-xs"
                placeholder="Title B"
              />
              <input
                type="text"
                [value]="artistB()"
                (input)="artistB.set($any($event.target).value)"
                class="w-1/2 bg-slate-900 border border-slate-800 rounded p-1.5 text-slate-300 text-xs"
                placeholder="Artist B"
              />
            </div>
          </div>
        </div>

        @if (error()) { <p role="alert" class="px-4 text-red-300 text-sm">{{ error() }}</p> }
        <div class="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end space-x-2">
          <button
            type="button"
            (click)="closeModal.emit()"
            class="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 text-xs font-mono hover:bg-slate-700 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            (click)="applyCustom()"
            class="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs font-mono transition shadow-lg shadow-amber-500/20"
          >
            Apply to Pipeline & Run S-W
          </button>
        </div>
      </div>
    </div>
  `,
})
export class CustomBenchmarkModal {
  readonly pipeline = inject(PipelineService);
  readonly closeModal = output<void>();

  readonly error = signal('');

  readonly notesInputA = signal<string>('F4 F4 G4 A4 F4 D4 F4 D4 C4 D4 F4 G4 A4 G4 F4 D4');
  readonly titleA = signal<string>('Custom Melody A');
  readonly artistA = signal<string>('Composer A');

  readonly notesInputB = signal<string>('F4 F4 G4 A4 F4 D4 F4 D4 C4 D4 F4 G4 A4 G4 F4 D4');
  readonly titleB = signal<string>('Custom Melody B');
  readonly artistB = signal<string>('Composer B');

  private parseNotes(str: string): MelodicNote[] {
    const tokens = str.trim().split(/\s+/).filter(Boolean);
    if (tokens.length < 2 || tokens.length > 128) throw new Error('Informe entre 2 e 128 notas em cada melodia.');
    const noteMap: Record<string, number> = {
      C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
      G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
    };

    const notes: MelodicNote[] = [];
    let currentOnset = 0;

    for (const token of tokens) {
      let midi = 60;
      let name = token;

      if (/^\d+$/.test(token)) {
        midi = parseInt(token, 10);
        name = `M${midi}`;
      } else {
        const match = token.match(/^([A-Ga-g][#b]?)(-?\d+)?$/);
        if (match) {
          const letter = match[1][0].toUpperCase() + match[1].slice(1);
          const oct = match[2] !== undefined ? parseInt(match[2], 10) : 4;
          const semitone = noteMap[letter];
          if (semitone === undefined) throw new Error('Nota inválida: ' + token);
          midi = (oct + 1) * 12 + semitone;
          name = `${letter}${oct}`;
        } else { throw new Error('Nota inválida: ' + token); }
      }

      if (!Number.isInteger(midi) || midi < 0 || midi > 127) throw new Error('Nota fora do intervalo MIDI 0–127: ' + token);
      notes.push({
        pitch: midi,
        pitchName: name,
        onset: currentOnset,
        duration: 0.5,
      });
      currentOnset += 0.5;
    }

    return notes;
  }

  applyCustom(): void {
    this.error.set('');
    try {
    const notesA = this.parseNotes(this.notesInputA());
    const notesB = this.parseNotes(this.notesInputB());

    const curA = this.pipeline.activeTargetA();
    const curB = this.pipeline.activeTargetB();

    this.pipeline.activeTargetA.set({
      ...curA,
      title: this.titleA() || 'Custom A',
      artist: this.artistA() || 'Author A',
      notes: notesA,
    });

    this.pipeline.activeTargetB.set({
      ...curB,
      title: this.titleB() || 'Custom B',
      artist: this.artistB() || 'Author B',
      notes: notesB,
    });

    this.closeModal.emit();
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'Não foi possível ler as notas.'); }
  }
}
