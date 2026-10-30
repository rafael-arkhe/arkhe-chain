export interface RecordingInfo {
  mbid: string;
  title: string;
  artist: string;
  isrcs: string[];
  iswcs: string[];
  composers: string[];
  release_date?: string;
}

export interface DeezerTrack {
  deezer_id?: number | string;
  title?: string;
  artist?: string;
  album?: string;
  isrc?: string;
}

export interface AcoustIDResult {
  fingerprint: string;
  duration: number;
  recordings: {
    id: string;
    title: string;
    score: number;
    artists: string[];
  }[];
  gate_passed: boolean;
}

export interface ACRCloudResult {
  status: 'ok' | 'skipped' | 'error';
  recordings: {
    title: string;
    artists: string[];
    score?: number;
    acrid?: string;
  }[];
  error?: string;
}

export interface MelodicNote {
  pitch: number;        // MIDI note number (e.g. 65 = F4)
  pitchName: string;    // e.g. "F4"
  onset: number;        // quarter length offset or seconds
  duration: number;     // duration in beats
  velocity?: number;
}

export interface MatrixCell {
  score: number;
  dir: 'diag' | 'up' | 'left' | 'none';
  len: number;
  inTrace: boolean;
}

export interface AlignmentStep {
  aIndex: number;
  bIndex: number;
  valA: number | null; // interval or null if gap
  valB: number | null; // interval or null if gap
  type: 'exact' | 'tolerance' | 'mismatch' | 'gap_a' | 'gap_b';
  explanation: string;
}

export interface MelodicSimilarityResult {
  score: number;
  normalizedScore: number;
  alignedLength: number;
  skylineALength: number;
  skylineBLength: number;
  intervalsALength: number;
  intervalsBLength: number;
  matrix: MatrixCell[][];
  traceback: { r: number; c: number }[];
  alignmentSteps: AlignmentStep[];
  intervalsA: number[];
  intervalsB: number[];
  maxScore: number;
}

export interface CalibrationPair {
  id: string;
  label: 'positive' | 'negative';
  nameA: string;
  nameB: string;
  score: number;
  category?: string;
}

export interface CalibrationResult {
  threshold: number;
  calibration_valid: boolean;
  alpha: number;
  alpha_guaranteed: boolean;
  seed: number;
  n_positives: number;
  n_negatives: number;
  n_calibration: number;
  n_validation_negatives: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  fpr: number;
  recall: number;
  precision: number;
  f1: number;
  val_scores: { label: 'positive' | 'negative'; score: number; name?: string }[];
  reason?: string;
}

export interface TargetMetadata {
  id: 'A' | 'B';
  title: string;
  artist: string;
  year: number;
  album?: string;
  genre?: string;
  historicalContext: string;
  recording: RecordingInfo;
  deezer: DeezerTrack | null;
  acoustid: AcoustIDResult;
  acrcloud: ACRCloudResult;
  sha256: string;
  midiSha256: string;
  separation: 'ok' | 'unavailable_or_failed' | 'not_requested';
  source:
    | 'vocals'
    | 'mix'
    | 'synth'
    | 'lead'
    | 'vocals / synth lead'
    | 'bassline'
    | 'acoustic guitar'
    | 'orchestral mix'
    | string;
  notes: MelodicNote[];
  bpm: number;
  originalKey: string;
  youtubeMusicUrl?: string;
  youtubeVideoId?: string;
  hookTimestamp?: string;
  hookLyrics?: string;
}

export interface PipelineReport {
  schema_version?: string;
  generated_at: string;
  identity_stage: { status: string };
  target_a: {
    title: string;
    artist: string;
    year: number;
    mbid: string | null;
    isrcs: string[] | null;
    iswcs: string[] | null;
    composers: string[] | null;
    deezer: DeezerTrack | null;
    acoustid_gate: boolean;
    acrcloud: ACRCloudResult | null;
    sha256: string;
    creator_did?: string;
  };
  target_b: {
    title: string;
    artist: string;
    year: number;
    mbid: string | null;
    isrcs: string[] | null;
    iswcs: string[] | null;
    composers: string[] | null;
    deezer: DeezerTrack | null;
    acoustid_gate: boolean;
    acrcloud: ACRCloudResult | null;
    sha256: string;
    creator_did?: string;
  };
  similarity: {
    clap_cosine: number | null;
    clap_available: boolean;
    melodic: {
      status: string;
      a: {
        source: string;
        separation: string;
        midi_sha256: string;
        skyline_length: number;
      };
      b: {
        source: string;
        separation: string;
        midi_sha256: string;
        skyline_length: number;
      };
      similarity: {
        score: number;
        aligned_length: number;
        skyline_a_length: number;
        skyline_b_length: number;
        intervals_a_length: number;
        intervals_b_length: number;
      };
      calibration: CalibrationResult | null;
      decision: 'above_threshold' | 'below_threshold' | 'uncalibrated';
      warning?: string;
    };
  };
  manifest: {
    generated_at: string;
    targets: { id: string; title: string; artist: string }[];
    config: Record<string, unknown>;
    versions: Record<string, string | null>;
    clap_pipeline_version: string;
  };
  script_sha256: string;
  report_hash: string;
  anchor?: {
    network: 'solana-devnet';
    tx_signature: string;
    mmr_root: string;
    mmr_version?: string;
    mmr_algorithm?: string;
    leaf_index: number;
    leaf_count?: number;
    peak_index?: number;
    peaks?: { height: number; hash: string }[];
    path?: { direction: 'L' | 'R'; sibling_hash: string }[];
    timestamp: string;
    explorer_url: string;
  };
  c2pa?: {
    manifest_id: string;
    signer_did: string;
    algorithm: 'Ed25519';
    claim_generator: string;
    valid: boolean;
    a?: { integrity: string; signature: string; hard_binding: string; format?: string; title?: string; signer?: string };
    b?: { integrity: string; signature: string; hard_binding: string; format?: string; title?: string; signer?: string };
  };
}

export interface CasePreset {
  id: string;
  name: string;
  shortDesc: string;
  legalOutcome: string;
  yearA: number;
  yearB: number;
  targetA: TargetMetadata;
  targetB: TargetMetadata;
  clapCosine: number;
  calibrationBenchmark: CalibrationPair[];
  historicalQuote?: string;
  historicalQuoteAuthor?: string;
}
