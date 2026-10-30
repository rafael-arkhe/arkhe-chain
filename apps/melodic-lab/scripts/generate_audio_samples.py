#!/usr/bin/env python3
"""
generate_audio_samples.py — Generates synthetic PCM WAV audio files for Taj Mahal & Da Ya Think I'm Sexy.
"""

import math
import struct
import wave
from pathlib import Path


def synthesize_melody_wav(filepath: Path, notes: list[tuple[int, float, float]], bpm: int = 115, sample_rate: int = 22050):
    """
    Synthesizes a 16-bit mono WAV file from a note sequence:
    notes: (midi_pitch, onset_beats, duration_beats)
    """
    seconds_per_beat = 60.0 / bpm
    total_beats = max(onset + dur for _, onset, dur in notes) + 0.5
    total_samples = int(total_beats * seconds_per_beat * sample_rate)

    buffer = [0.0] * total_samples

    for pitch, onset, dur in notes:
        freq = 440.0 * (2.0 ** ((pitch - 69) / 12.0))
        start_sample = int(onset * seconds_per_beat * sample_rate)
        note_samples = int(dur * seconds_per_beat * sample_rate)

        for i in range(note_samples):
            idx = start_sample + i
            if idx >= total_samples:
                break
            t = i / sample_rate
            # ADSR envelope
            attack = int(0.02 * sample_rate)
            release = int(0.04 * sample_rate)
            if i < attack:
                env = i / attack
            elif i > note_samples - release:
                env = max(0.0, (note_samples - i) / release)
            else:
                env = 1.0

            # Fundamental + 2nd + 3rd harmonic for warm organ/brass timbre
            sample_val = (
                0.6 * math.sin(2.0 * math.pi * freq * t)
                + 0.3 * math.sin(4.0 * math.pi * freq * t)
                + 0.1 * math.sin(6.0 * math.pi * freq * t)
            ) * env * 0.4

            buffer[idx] += sample_val

    # Normalize and write 16-bit PCM WAV
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(filepath), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        packed = bytearray()
        for s in buffer:
            clamped = max(-1.0, min(1.0, s))
            int_val = int(clamped * 32767.0)
            packed.extend(struct.pack("<h", int_val))
        wf.writeframes(packed)


def main():
    out_dir = Path("data/audio")
    out_dir.mkdir(parents=True, exist_ok=True)

    # Jorge Ben — Taj Mahal (1972)
    taj_mahal_notes = [
        (65, 0.0, 0.5), (65, 0.5, 0.5), (67, 1.0, 0.5), (69, 1.5, 1.0),
        (65, 2.5, 0.5), (62, 3.0, 1.0), (65, 4.0, 0.5), (62, 4.5, 0.5),
        (60, 5.0, 0.5), (62, 5.5, 0.5), (65, 6.0, 0.5), (67, 6.5, 0.5),
        (69, 7.0, 1.0), (67, 8.0, 0.5), (65, 8.5, 0.5), (62, 9.0, 1.0),
    ]
    synthesize_melody_wav(out_dir / "taj_mahal_1972.wav", taj_mahal_notes, bpm=116)

    # Rod Stewart — Da Ya Think I'm Sexy? (1978)
    da_ya_think_notes = [
        (65, 0.0, 0.5), (65, 0.5, 0.5), (67, 1.0, 0.5), (69, 1.5, 1.0),
        (65, 2.5, 0.5), (62, 3.0, 1.0), (65, 4.0, 0.5), (62, 4.5, 0.5),
        (60, 5.0, 0.5), (62, 5.5, 0.5), (65, 6.0, 0.5), (67, 6.5, 0.5),
        (69, 7.0, 1.0), (67, 8.0, 0.5), (65, 8.5, 0.5), (62, 9.0, 1.0),
    ]
    synthesize_melody_wav(out_dir / "da_ya_think_1978.wav", da_ya_think_notes, bpm=114)

    print("Synthesized reference audio files in data/audio/")


if __name__ == "__main__":
    main()
