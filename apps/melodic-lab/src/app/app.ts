import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Header } from './components/header';
import { CaseHero } from './components/case-hero';
import { PipelineStepper } from './components/pipeline-stepper';
import { AudioPlayerBar } from './components/audio-player-bar';
import { PianoRollView } from './components/piano-roll-view';
import { MelodicContourD3 } from './components/melodic-contour-d3';
import { SmithWatermanView } from './components/smith-waterman-view';
import { IntervalAlignmentView } from './components/interval-alignment-view';
import { CalibrationView } from './components/calibration-view';
import { ReportExportView } from './components/report-export-view';
import { ScriptViewerModal } from './components/script-viewer-modal';
import { CustomBenchmarkModal } from './components/custom-benchmark-modal';
import { YoutubeMusicExplorer } from './components/youtube-music-explorer';
import { PipelineService } from './services/pipeline.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatIconModule,
    Header,
    CaseHero,
    PipelineStepper,
    AudioPlayerBar,
    PianoRollView,
    MelodicContourD3,
    SmithWatermanView,
    IntervalAlignmentView,
    CalibrationView,
    ReportExportView,
    ScriptViewerModal,
    CustomBenchmarkModal,
    YoutubeMusicExplorer,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly pipeline = inject(PipelineService);

  readonly activeTab = signal<'workbench' | 'calibration' | 'report' | 'cases' | 'youtube'>('workbench');
  readonly showScriptModal = signal<boolean>(false);
  readonly showCustomModal = signal<boolean>(false);

  activePreset() {
    return (
      this.pipeline.presets().find((p) => p.id === this.pipeline.activePresetId()) ||
      this.pipeline.presets()[0]
    );
  }
}
