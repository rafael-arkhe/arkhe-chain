# Arkhe Melodic Pipeline v11
### Forensic Musicology & Melodic Similarity Workbench
**Benchmark Case Study: Jorge Ben ("Taj Mahal", 1972) × Rod Stewart ("Da Ya Think I'm Sexy?", 1978)**

---

## 1. Overview

**Arkhe Melodic Pipeline** is a forensic musicology pipeline and interactive web laboratory for quantifying melodic derivation and copyright infringement. It combines identity provenance, audio fingerprinting, deep audio embeddings, monophonic skyline extraction, transposition-invariant Smith-Waterman sequence alignment, and distribution-free conformal calibration.

### The Landmark Precedent
- **Work A**: Jorge Ben (Jorge Ben Jor) — *"Taj Mahal"* (originally recorded in 1972 on *Ben*, rerecorded in 1976 on *África Brasil*).
  - Key motive: the infectious chorus vocal scat hook (*"Te-te-retete, te-te-retete, te-te-retete..."*).
- **Work B**: Rod Stewart — *"Da Ya Think I'm Sexy?"* (1978, *Blondes Have More Fun*).
  - Synthesizer lead hook & chorus vocal refrain (*"If you want my body and you think I'm sexy..."*).
- **Historical Verdict**: Following copyright proceedings in Brazil and the United States, Rod Stewart acknowledged in his 2012 autobiography that he had absorbed the melody during Carnival in Rio de Janeiro, resulting in unintentional "subconscious plagiarism". The parties settled out of court, redirecting 100% of Stewart's composer royalties from the song to UNICEF in perpetuity.

---

## 2. Five-Stage Forensic Architecture

```
Audio Files (Target A & B)
   │
   ├─► Stage 1: MusicBrainz Provenance (MBID, Works, Artists, Composers, ISRCs, ISWCs)
   ├─► Stage 2: Deezer Cross-Referencing (ISRC Streaming Catalog Validation)
   ├─► Stage 3: AcoustID Gate (Chromaprint Fingerprinting, score ≥ 0.90 threshold)
   ├─► Stage 4: ACRCloud Identification (OpenAPI JWT Bearer Token / HMAC)
   ├─► Stage 4b: CLAP Audio Embeddings (512-dimensional multimodal latent cosine similarity)
   └─► Stage 5: Melodic Extraction & Alignment
          │
          ├─► Demucs Lead Vocal Stem Isolation (`--two-stems=vocals`)
          ├─► Basic-Pitch Neural MIDI Transcription
          ├─► Monophonic Skyline Filter (`extract_skyline`, `overlap_ratio=0.5`)
          ├─► Transposition-Invariant Relative Intervals (`pitch[i+1] - pitch[i]`)
          ├─► Smith-Waterman Local Sequence Alignment (±1 semitone tolerance)
          └─► Conformal Prediction Null Calibration (Guaranteed False Positive Rate ≤ α)
```

---

## 3. Mathematical Foundations

### 3.1 Skyline Lead Extraction
Monophonic skyline contour isolates the highest musical voice over time:
$$\text{skyline}(t) = \max \{ p \mid (t_{\text{start}}, t_{\text{end}}, p) \in \text{Events}(t) \}$$
Sustained notes only hide new onsets if their remaining duration exceeds `overlap_ratio` (0.5).

### 3.2 Transposition-Invariant Relative Intervals
$$\Delta_i = p_{i+1} - p_{i}$$
Regardless of whether a melody is sung in D minor or transposed to F major or A minor, the relative interval series remains 100% congruent, preventing key transposition from bypassing detection.

### 3.3 Smith-Waterman Local Alignment
$$H[i, j] = \max \begin{cases} 0 \\ H[i-1, j-1] + s(\Delta^A_i, \Delta^B_j) \\ H[i-1, j] + g \\ H[i, j-1] + g \end{cases}$$
where:
$$s(\Delta^A_i, \Delta^B_j) = \begin{cases} +2 & \text{if } |\Delta^A_i - \Delta^B_j| \le \text{tolerance} \\ -1 & \text{otherwise} \end{cases}, \quad g = -1$$

Normalized coverage score:
$$\text{Score}_{\text{norm}} = \frac{\max(H)}{\text{match} \times \min(m, n)}$$

### 3.4 Conformal Negative Calibration
To avoid arbitrary cutoffs, a curated set of empirical negative pairs (unrelated works across musical centuries and genres) defines the null distribution. The decision threshold $\tau$ is chosen as the $k$-th order statistic:
$$k = \left\lceil (n_{\text{cal}} + 1)(1 - \alpha) \right\rceil$$
Under exchangeability, this provides a finite-sample guarantee that the False Positive Rate (FPR) is bounded by $\alpha$ (e.g. 5%) without assuming Gaussian normality.

---

## 4. Running the Pipeline via CLI

### Basic Execution
```bash
python3 arkhe_melodic_pipeline.py \
  --audio-a "data/audio/taj_mahal_1972.wav" \
  --audio-b "data/audio/da_ya_think_1978.wav" \
  --midi-a "data/midi/taj_mahal.mid" \
  --midi-b "data/midi/da_ya_think.mid" \
  --calibration-pairs "calibration_pairs.json" \
  --alpha 0.05 \
  --out "arkhe_report.json"
```

### Options
- `--config <path>`: Load configuration from a JSON file (e.g., `arkhe_config.json`).
- `--skip-identity`: Bypass network identity stages (MusicBrainz, Deezer, AcoustID, ACRCloud).
- `--skip-melody`: Skip Stage 5 melodic extraction.
- `--no-separation`: Skip Demucs stem separation; transcribe entire audio mix.
- `--calibration-pairs <path>`: JSON file specifying positive and negative benchmark pairs.
- `--alpha <float>`: Target false positive rate bound (default: 0.05).

---

## 5. Web Studio Features

- **Interactive Dynamic Programming Heatmap**: Full 2D matrix inspection with cell recurrence tracing and parameter sliders (Tolerance, Match, Mismatch, Gap).
- **Web Audio Melodic Synthesizer**: Solo playback or dual stereo alignment (Left: Ben Jor, Right: Stewart) to hear hook congruence in real-time.
- **Dual Visual Piano Roll**: Dynamic note lighting synchronized with real-time synthesizer playback.
- **Conformal Calibration Lab**: Interactive null distribution visualizer with live ROC metrics (Threshold, Recall, FPR, Precision, F1-Score).
- **Cryptographic Report**: RFC 8785 canonical JSON generation and SHA-256 hash chaining.

---

## 6. Credentials & Configuration

- **AcoustID**: Key `pYONOrhqIC` configured in `arkhe_config.json` and `.env.example`.
- **ACRCloud**: OpenAPI JWT Bearer Token (Subject `368757`) configured in `acrcloud/recognizer.py` and `arkhe_config.json`.
