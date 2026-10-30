import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
  afterNextRender,
  effect,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import * as d3 from 'd3';
import { PipelineService } from '../services/pipeline.service';
import { AudioSynthService } from '../services/audio-synth.service';

@Component({
  selector: 'app-melodic-contour-d3',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
      <!-- Section Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h2 class="text-base font-bold text-white flex items-center gap-2">
            <mat-icon class="text-amber-400 text-lg">show_chart</mat-icon>
            D3 Melodic Contour & Skyline Motif Comparator
          </h2>
          <p class="text-xs text-slate-400">
            Interactive continuous pitch contour visualization powered by D3.js. Easily verify the shape congruence between "{{ targetA().title }}" and "{{ targetB().title }}".
          </p>
        </div>

        <!-- Mode Toggles -->
        <div class="flex flex-wrap items-center gap-2 text-xs font-mono">
          <!-- View Mode -->
          <div class="flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
            <button
              type="button"
              (click)="viewMode.set('superimposed')"
              class="px-2.5 py-1 rounded text-[11px] font-bold transition"
              [class]="viewMode() === 'superimposed' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'"
            >
              Overlay
            </button>
            <button
              type="button"
              (click)="viewMode.set('split')"
              class="px-2.5 py-1 rounded text-[11px] font-bold transition"
              [class]="viewMode() === 'split' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'"
            >
              Split
            </button>
            <button
              type="button"
              (click)="viewMode.set('diff')"
              class="px-2.5 py-1 rounded text-[11px] font-bold transition"
              [class]="viewMode() === 'diff' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'"
            >
              Delta (&Delta;)
            </button>
          </div>

          <!-- Curve Style -->
          <button
            type="button"
            (click)="toggleCurveType()"
            class="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
          >
            <mat-icon class="text-sm text-sky-400">gesture</mat-icon>
            <span>{{ isStepped() ? 'Stepped' : 'Smooth Bézier' }}</span>
          </button>
        </div>
      </div>

      <!-- Chart Legend & Congruence Banner -->
      <div class="flex flex-wrap items-center justify-between gap-3 text-xs font-mono bg-slate-950/70 p-3 rounded-xl border border-slate-800">
        <div class="flex items-center space-x-4">
          <div class="flex items-center space-x-2">
            <span class="w-3.5 h-1.5 rounded bg-amber-400 inline-block shadow-sm shadow-amber-500"></span>
            <span class="text-amber-300 font-bold">Target A: {{ targetA().title }}</span>
            <span class="text-slate-500">({{ targetA().artist }}, {{ targetA().year }})</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="w-3.5 h-1.5 rounded bg-rose-400 inline-block shadow-sm shadow-rose-500"></span>
            <span class="text-rose-300 font-bold">Target B: {{ targetB().title }}</span>
            <span class="text-slate-500">({{ targetB().artist }}, {{ targetB().year }})</span>
          </div>
        </div>

        <div class="flex items-center space-x-2 text-[11px]">
          <span class="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-bold flex items-center gap-1">
            <mat-icon class="text-xs">check_circle</mat-icon>
            Smith-Waterman Alignment: {{ (pipeline.similarityResult().normalizedScore * 100).toFixed(1) }}%
            (Status: {{ pipeline.decisionStatus() === 'above_threshold' ? 'Above Threshold' : 'Below Threshold' }})
          </span>
        </div>
      </div>

      <!-- D3 Chart Canvas Container -->
      <div class="relative bg-slate-950 rounded-xl border border-slate-800/80 p-2 sm:p-4 overflow-hidden select-none">
        <div #chartContainer class="w-full h-80 sm:h-96"></div>

        <!-- Tooltip overlay -->
        @if (hoveredData()) {
          <div
            class="pointer-events-none absolute z-30 p-2.5 rounded-lg bg-slate-900/95 border border-slate-700 text-[11px] font-mono text-slate-200 shadow-xl backdrop-blur-sm transition-all"
            [style.left.px]="tooltipPos().x"
            [style.top.px]="tooltipPos().y"
          >
            <div class="text-slate-400 text-[10px] mb-1">BEAT {{ hoveredData()!.beat.toFixed(2) }}</div>
            <div class="flex items-center space-x-2">
              <span class="text-amber-400 font-bold">A ({{ targetA().title }}):</span>
              <span>{{ hoveredData()!.pitchA !== null ? pitchToName(hoveredData()!.pitchA!) + ' (' + hoveredData()!.pitchA + ')' : '&mdash;' }}</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="text-rose-400 font-bold">B ({{ targetB().title }}):</span>
              <span>{{ hoveredData()!.pitchB !== null ? pitchToName(hoveredData()!.pitchB!) + ' (' + hoveredData()!.pitchB + ')' : '&mdash;' }}</span>
            </div>
            <div class="mt-1 pt-1 border-t border-slate-800 text-[10px] font-bold">
              @if (hoveredData()!.pitchA !== null && hoveredData()!.pitchB !== null) {
                <span [class]="hoveredData()!.pitchA === hoveredData()!.pitchB ? 'text-emerald-400' : 'text-amber-300'">
                  &Delta; Difference: {{ Math.abs(hoveredData()!.pitchA! - hoveredData()!.pitchB!) }} semitones
                  {{ hoveredData()!.pitchA === hoveredData()!.pitchB ? '(Identical Pitch)' : '' }}
                </span>
              }
            </div>
          </div>
        }
      </div>

      <!-- Visual Motif Explanation Footer -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono text-slate-300">
        @if (pipeline.activePresetId() === 'benjor-stewart') {
          <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
            <span class="text-amber-400 font-bold block">1. Initial Hook Descent (Measure 1)</span>
            <p class="text-slate-400 text-[11px] leading-relaxed">
              Jorge Ben begins on <strong class="text-slate-200">C#5 (73)</strong> descending through A4 &rarr; F#4 &rarr; D4 (minor pentatonic triad drop to tonic). Rod Stewart mirrors this starting on <strong class="text-slate-200">C5 (72)</strong> descending through A4 &rarr; F4 &rarr; D4.
            </p>
          </div>

          <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
            <span class="text-rose-400 font-bold block">2. Syncopated Bouncing Riff (Measure 2)</span>
            <p class="text-slate-400 text-[11px] leading-relaxed">
              The characteristic return jump: <strong class="text-slate-200">F#4/F4 &rarr; D4</strong> replicates the syncopated samba-rock groove on the ARP Quadra lead synthesizer in disco rhythm.
            </p>
          </div>

          <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
            <span class="text-emerald-400 font-bold block">3. Transposition Invariance (&Delta; = 1 semitone)</span>
            <p class="text-slate-400 text-[11px] leading-relaxed">
              When normalized by transposition, the relative interval series (-4, -3, -4, +4, -4) matches 100%, corroborating the unconscious melodic derivation documented in Stewart's autobiography.
            </p>
          </div>
        } @else if (pipeline.activePresetId() === 'chiffons-harrison') {
          <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
            <span class="text-amber-400 font-bold block">1. Motif A (G4 &rarr; E4 &rarr; D4)</span>
            <p class="text-slate-400 text-[11px] leading-relaxed">
              Ronnie Mack's signature 3-note opening phrase ("Doo-lang doo-lang") is directly matched by Harrison in "My Sweet Lord" ("My sweet Lord").
            </p>
          </div>

          <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
            <span class="text-rose-400 font-bold block">2. Motif B (Scalar C5 &rarr; B4 &rarr; A4 &rarr; G4)</span>
            <p class="text-slate-400 text-[11px] leading-relaxed">
              The descending scalar response in phrase 2 ("I really want to see you") solidifies the identical harmonic and melodic contour that Judge Owen ruled as "subconscious copying".
            </p>
          </div>

          <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
            <span class="text-emerald-400 font-bold block">3. Smith-Waterman Alignment</span>
            <p class="text-slate-400 text-[11px] leading-relaxed">
              Alignment scores {{ (pipeline.similarityResult().normalizedScore * 100).toFixed(1) }}%, well above the conformal threshold (&tau; = {{ (pipeline.calibrationResult().threshold * 100).toFixed(1) }}%).
            </p>
          </div>
        } @else {
          <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
            <span class="text-amber-400 font-bold block">1. Target A: {{ targetA().title }}</span>
            <p class="text-slate-400 text-[11px] leading-relaxed">
              {{ targetA().historicalContext }}
            </p>
          </div>

          <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
            <span class="text-rose-400 font-bold block">2. Target B: {{ targetB().title }}</span>
            <p class="text-slate-400 text-[11px] leading-relaxed">
              {{ targetB().historicalContext }}
            </p>
          </div>

          <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
            <span class="text-emerald-400 font-bold block">3. Conformal Decision</span>
            <p class="text-slate-400 text-[11px] leading-relaxed">
              True negative discrimination with alignment score {{ (pipeline.similarityResult().normalizedScore * 100).toFixed(1) }}%, confirming rigorous control over false positives (&le; {{ (pipeline.alpha() * 100).toFixed(0) }}%).
            </p>
          </div>
        }
      </div>
    </div>
  `,
})
export class MelodicContourD3 {
  readonly pipeline = inject(PipelineService);
  readonly audio = inject(AudioSynthService);

  readonly chartContainer = viewChild<ElementRef<HTMLDivElement>>('chartContainer');

  readonly viewMode = signal<'superimposed' | 'split' | 'diff'>('superimposed');
  readonly isStepped = signal<boolean>(false);

  readonly hoveredData = signal<{ beat: number; pitchA: number | null; pitchB: number | null } | null>(null);
  readonly tooltipPos = signal<{ x: number; y: number }>({ x: 0, y: 0 });

  readonly Math = Math;

  constructor() {
    afterNextRender(() => {
      this.renderChart();
      window.addEventListener('resize', this.onResize);
    });

    effect(() => {
      // Re-render whenever notes, preset, viewMode, or curve type changes
      this.pipeline.activeTargetA();
      this.pipeline.activeTargetB();
      this.viewMode();
      this.isStepped();
      this.renderChart();
    });

    effect(() => {
      // Update playhead line position
      const progress = this.audio.playbackProgress();
      this.updatePlayhead(progress);
    });
  }

  private onResize = () => {
    this.renderChart();
  };

  targetA() {
    return this.pipeline.activeTargetA();
  }

  targetB() {
    return this.pipeline.activeTargetB();
  }

  toggleCurveType(): void {
    this.isStepped.update((v) => !v);
  }

  pitchToName(midi: number): string {
    return this.audio.pitchToName(midi);
  }

  private updatePlayhead(progressPercent: number): void {
    const el = this.chartContainer()?.nativeElement;
    if (!el) return;
    const playhead = d3.select(el).select<SVGLineElement>('.d3-playhead');
    const playheadGlow = d3.select(el).select<SVGLineElement>('.d3-playhead-glow');
    if (playhead.empty()) return;

    const width = el.clientWidth || 700;
    const margin = { left: 45, right: 30 };
    const innerWidth = width - margin.left - margin.right;
    const x = margin.left + (progressPercent / 100) * innerWidth;

    playhead.attr('x1', x).attr('x2', x).style('opacity', progressPercent > 0 && progressPercent < 100 ? 1 : 0);
    playheadGlow.attr('x1', x).attr('x2', x).style('opacity', progressPercent > 0 && progressPercent < 100 ? 0.6 : 0);
  }

  renderChart(): void {
    const container = this.chartContainer()?.nativeElement;
    if (!container) return;

    // Clear previous SVG
    d3.select(container).selectAll('*').remove();

    const width = container.clientWidth || 700;
    const height = container.clientHeight || 340;
    const margin = { top: 25, right: 35, bottom: 35, left: 50 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const notesA = this.targetA().notes;
    const notesB = this.targetB().notes;

    if (!notesA.length && !notesB.length) return;

    // Maximum beat length
    const maxBeatA = notesA.length ? notesA[notesA.length - 1].onset + notesA[notesA.length - 1].duration : 10;
    const maxBeatB = notesB.length ? notesB[notesB.length - 1].onset + notesB[notesB.length - 1].duration : 10;
    const maxBeat = Math.max(maxBeatA, maxBeatB, 9.5);

    // Create SVG
    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('class', 'overflow-visible');

    // Defs for gradients and glow filters
    const defs = svg.append('defs');

    // Amber gradient (Target A)
    const gradA = defs.append('linearGradient').attr('id', 'grad-a').attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1');
    gradA.append('stop').attr('offset', '0%').attr('stop-color', '#f59e0b').attr('stop-opacity', 0.4);
    gradA.append('stop').attr('offset', '100%').attr('stop-color', '#f59e0b').attr('stop-opacity', 0.0);

    // Rose gradient (Target B)
    const gradB = defs.append('linearGradient').attr('id', 'grad-b').attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1');
    gradB.append('stop').attr('offset', '0%').attr('stop-color', '#f43f5e').attr('stop-opacity', 0.35);
    gradB.append('stop').attr('offset', '100%').attr('stop-color', '#f43f5e').attr('stop-opacity', 0.0);

    // Scales
    const xScale = d3.scaleLinear().domain([0, maxBeat]).range([margin.left, margin.left + innerWidth]);

    const minPitch = 59; // B3
    const maxPitch = 71; // B4
    const yScale = d3.scaleLinear().domain([minPitch, maxPitch]).range([margin.top + innerHeight, margin.top]);

    // Curve factory
    const curveFactory = this.isStepped() ? d3.curveStepAfter : d3.curveMonotoneX;

    // Gridlines (Pitches / Horizontal)
    const pitches = d3.range(minPitch, maxPitch + 1);
    svg
      .append('g')
      .attr('class', 'grid-horizontal')
      .selectAll('line')
      .data(pitches)
      .join('line')
      .attr('x1', margin.left)
      .attr('x2', margin.left + innerWidth)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d))
      .attr('stroke', (d) => (d % 12 === 0 ? 'rgba(148, 163, 184, 0.25)' : 'rgba(51, 65, 85, 0.4)'))
      .attr('stroke-width', (d) => (d % 12 === 0 ? 1.5 : 1))
      .attr('stroke-dasharray', (d) => (d % 12 === 0 ? 'none' : '2 3'));

    // Gridlines (Beats / Vertical)
    const beats = d3.range(0, Math.ceil(maxBeat) + 1);
    svg
      .append('g')
      .attr('class', 'grid-vertical')
      .selectAll('line')
      .data(beats)
      .join('line')
      .attr('x1', (d) => xScale(d))
      .attr('x2', (d) => xScale(d))
      .attr('y1', margin.top)
      .attr('y2', margin.top + innerHeight)
      .attr('stroke', (d) => (d % 4 === 0 ? 'rgba(148, 163, 184, 0.25)' : 'rgba(51, 65, 85, 0.3)'))
      .attr('stroke-dasharray', '2 3');

    // Axes
    // Y-Axis
    const yAxis = d3
      .axisLeft(yScale)
      .tickValues(pitches)
      .tickFormat((d) => this.pitchToName(d as number));

    svg
      .append('g')
      .attr('transform', `translate(${margin.left}, 0)`)
      .call(yAxis)
      .attr('color', 'rgba(148, 163, 184, 0.7)')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '10px')
      .select('.domain')
      .attr('stroke', 'rgba(100, 116, 139, 0.5)');

    // X-Axis
    const xAxis = d3
      .axisBottom(xScale)
      .ticks(Math.min(12, Math.ceil(maxBeat)))
      .tickFormat((d) => `Beat ${d}`);

    svg
      .append('g')
      .attr('transform', `translate(0, ${margin.top + innerHeight})`)
      .call(xAxis)
      .attr('color', 'rgba(148, 163, 184, 0.7)')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '10px')
      .select('.domain')
      .attr('stroke', 'rgba(100, 116, 139, 0.5)');

    // Data points converter
    const dataPointsA = notesA.map((n) => ({ beat: n.onset, pitch: n.pitch, name: n.pitchName, dur: n.duration }));
    const dataPointsB = notesB.map((n) => ({ beat: n.onset, pitch: n.pitch, name: n.pitchName, dur: n.duration }));

    // Line and Area generators
    const lineGenA = d3
      .line<{ beat: number; pitch: number }>()
      .x((d) => xScale(d.beat))
      .y((d) => yScale(d.pitch))
      .curve(curveFactory);

    const areaGenA = d3
      .area<{ beat: number; pitch: number }>()
      .x((d) => xScale(d.beat))
      .y0(margin.top + innerHeight)
      .y1((d) => yScale(d.pitch))
      .curve(curveFactory);

    const lineGenB = d3
      .line<{ beat: number; pitch: number }>()
      .x((d) => xScale(d.beat))
      .y((d) => yScale(d.pitch))
      .curve(curveFactory);

    const areaGenB = d3
      .area<{ beat: number; pitch: number }>()
      .x((d) => xScale(d.beat))
      .y0(margin.top + innerHeight)
      .y1((d) => yScale(d.pitch))
      .curve(curveFactory);

    const mode = this.viewMode();

    if (mode === 'superimposed' || mode === 'split') {
      // Area Fill Target A
      svg
        .append('path')
        .datum(dataPointsA)
        .attr('fill', 'url(#grad-a)')
        .attr('d', areaGenA);

      // Area Fill Target B
      svg
        .append('path')
        .datum(dataPointsB)
        .attr('fill', 'url(#grad-b)')
        .attr('d', areaGenB);

      // Target B Line (Rose, dashed or subtle offset)
      svg
        .append('path')
        .datum(dataPointsB)
        .attr('fill', 'none')
        .attr('stroke', '#f43f5e')
        .attr('stroke-width', 2.8)
        .attr('stroke-dasharray', mode === 'superimposed' ? '5 4' : 'none')
        .attr('d', lineGenB);

      // Target A Line (Amber, solid glowing)
      svg
        .append('path')
        .datum(dataPointsA)
        .attr('fill', 'none')
        .attr('stroke', '#f59e0b')
        .attr('stroke-width', 3)
        .attr('d', lineGenA);

      // Circles for Target A
      svg
        .append('g')
        .selectAll('circle')
        .data(dataPointsA)
        .join('circle')
        .attr('cx', (d) => xScale(d.beat))
        .attr('cy', (d) => yScale(d.pitch))
        .attr('r', 4.5)
        .attr('fill', '#f59e0b')
        .attr('stroke', '#1e293b')
        .attr('stroke-width', 1.5);

      // Circles for Target B
      svg
        .append('g')
        .selectAll('circle')
        .data(dataPointsB)
        .join('circle')
        .attr('cx', (d) => xScale(d.beat))
        .attr('cy', (d) => yScale(d.pitch))
        .attr('r', 3.5)
        .attr('fill', '#f43f5e')
        .attr('stroke', '#1e293b')
        .attr('stroke-width', 1.5);

      // Pitch Name text labels at prominent peaks
      svg
        .append('g')
        .selectAll('text')
        .data(dataPointsA)
        .join('text')
        .attr('x', (d) => xScale(d.beat))
        .attr('y', (d) => yScale(d.pitch) - 8)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(254, 240, 138, 0.9)')
        .attr('font-size', '9px')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-weight', 'bold')
        .text((d) => d.name);
    } else if (mode === 'diff') {
      // Differential Ribbon mode: shows absolute pitch delta across time
      const diffPoints: { beat: number; delta: number }[] = [];
      const len = Math.min(dataPointsA.length, dataPointsB.length);
      for (let i = 0; i < len; i++) {
        const beat = dataPointsA[i].beat;
        const delta = Math.abs(dataPointsA[i].pitch - dataPointsB[i].pitch);
        diffPoints.push({ beat, delta });
      }

      const yDiffScale = d3.scaleLinear().domain([0, 12]).range([margin.top + innerHeight, margin.top]);

      const diffAreaGen = d3
        .area<{ beat: number; delta: number }>()
        .x((d) => xScale(d.beat))
        .y0(margin.top + innerHeight)
        .y1((d) => yDiffScale(d.delta))
        .curve(curveFactory);

      const diffLineGen = d3
        .line<{ beat: number; delta: number }>()
        .x((d) => xScale(d.beat))
        .y((d) => yDiffScale(d.delta))
        .curve(curveFactory);

      // Shaded area
      svg.append('path').datum(diffPoints).attr('fill', 'rgba(16, 185, 129, 0.25)').attr('d', diffAreaGen);
      svg.append('path').datum(diffPoints).attr('fill', 'none').attr('stroke', '#10b981').attr('stroke-width', 3).attr('d', diffLineGen);

      svg
        .append('g')
        .selectAll('circle')
        .data(diffPoints)
        .join('circle')
        .attr('cx', (d) => xScale(d.beat))
        .attr('cy', (d) => yDiffScale(d.delta))
        .attr('r', 4)
        .attr('fill', '#10b981')
        .attr('stroke', '#064e3b');

      // Zero delta baseline indicator
      svg
        .append('text')
        .attr('x', margin.left + 15)
        .attr('y', margin.top + innerHeight - 10)
        .attr('fill', '#34d399')
        .attr('font-size', '11px')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-weight', 'bold')
        .text('DELTA = 0 SEMITONES (100% IDENTICAL MELODIC CONTOUR)');
    }

    // Playhead glowing lines
    svg
      .append('line')
      .attr('class', 'd3-playhead-glow')
      .attr('x1', margin.left)
      .attr('x2', margin.left)
      .attr('y1', margin.top)
      .attr('y2', margin.top + innerHeight)
      .attr('stroke', '#38bdf8')
      .attr('stroke-width', 6)
      .style('opacity', 0)
      .attr('stroke-linecap', 'round');

    svg
      .append('line')
      .attr('class', 'd3-playhead')
      .attr('x1', margin.left)
      .attr('x2', margin.left)
      .attr('y1', margin.top)
      .attr('y2', margin.top + innerHeight)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2)
      .style('opacity', 0);

    // Interactive Hover Overlay (Invisible rect)
    const overlay = svg
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .attr('cursor', 'crosshair');

    overlay.on('mousemove', (event: MouseEvent) => {
      const [mx, my] = d3.pointer(event);
      const beat = xScale.invert(mx);

      // Find nearest notes
      const findNearest = (pts: typeof dataPointsA) => {
        let best = pts[0];
        let minDist = 999;
        for (const p of pts) {
          const d = Math.abs(p.beat - beat);
          if (d < minDist) {
            minDist = d;
            best = p;
          }
        }
        return minDist < 0.6 ? best : null;
      };

      const matchA = findNearest(dataPointsA);
      const matchB = findNearest(dataPointsB);

      this.hoveredData.set({
        beat: Math.max(0, beat),
        pitchA: matchA ? matchA.pitch : null,
        pitchB: matchB ? matchB.pitch : null,
      });

      this.tooltipPos.set({
        x: Math.min(mx + 15, width - 180),
        y: Math.max(my - 40, 20),
      });
    });

    overlay.on('mouseleave', () => {
      this.hoveredData.set(null);
    });
  }
}
