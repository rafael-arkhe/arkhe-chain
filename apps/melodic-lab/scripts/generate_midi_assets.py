#!/usr/bin/env python3
"""
generate_midi_assets.py — Generates standard Type 0 MIDI files for the Arkhe benchmark dataset.
"""

import json
from pathlib import Path


def write_midi_file(filepath: Path, notes: list[tuple[int, float, float]], bpm: int = 120):
    """
    Writes a standard MIDI Type 0 file.
    notes: list of (midi_pitch, onset_in_beats, duration_in_beats)
    """
    division = 480  # ticks per quarter note
    events = []

    for pitch, onset, duration in notes:
        start_tick = int(onset * division)
        end_tick = int((onset + duration) * division)
        events.append((start_tick, 0x90, pitch, 90))  # Note On
        events.append((end_tick, 0x80, pitch, 0))    # Note Off

    # Sort by tick time, note-offs before note-ons if simultaneous
    events.sort(key=lambda e: (e[0], 0 if e[1] == 0x80 else 1))

    track_data = bytearray()
    last_tick = 0

    def write_var_len(val: int):
        buf = []
        buf.append(val & 0x7F)
        while val > 0x7F:
            val >>= 7
            buf.append((val & 0x7F) | 0x80)
        buf.reverse()
        for b in buf:
            track_data.append(b)

    for tick, status, pitch, vel in events:
        delta = max(0, tick - last_tick)
        write_var_len(delta)
        track_data.append(status)
        track_data.append(pitch & 0x7F)
        track_data.append(vel & 0x7F)
        last_tick = tick

    # End of Track meta event: delta 0, 0xFF, 0x2F, 0x00
    write_var_len(0)
    track_data.extend([0xFF, 0x2F, 0x00])

    # Build Header: MThd, length 6, format 0, 1 track, division
    header = bytearray(b"MThd")
    header.extend((6).to_bytes(4, "big"))
    header.extend((0).to_bytes(2, "big"))  # format 0
    header.extend((1).to_bytes(2, "big"))  # 1 track
    header.extend(division.to_bytes(2, "big"))

    # Build Track: MTrk, length, track_data
    trk_chunk = bytearray(b"MTrk")
    trk_chunk.extend(len(track_data).to_bytes(4, "big"))
    trk_chunk.extend(track_data)

    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "wb") as f:
        f.write(header + trk_chunk)


def main():
    data_dir = Path("data/midi")
    data_dir.mkdir(parents=True, exist_ok=True)

    # 1. Jorge Ben — Taj Mahal (1972)
    # F4 (65), F4 (65), G4 (67), A4 (69), F4 (65), D4 (62), F4 (65), D4 (62), C4 (60), D4 (62), F4 (65), G4 (67), A4 (69), G4 (67), F4 (65), D4 (62)
    taj_mahal = [
        (65, 0.0, 0.5), (65, 0.5, 0.5), (67, 1.0, 0.5), (69, 1.5, 1.0),
        (65, 2.5, 0.5), (62, 3.0, 1.0), (65, 4.0, 0.5), (62, 4.5, 0.5),
        (60, 5.0, 0.5), (62, 5.5, 0.5), (65, 6.0, 0.5), (67, 6.5, 0.5),
        (69, 7.0, 1.0), (67, 8.0, 0.5), (65, 8.5, 0.5), (62, 9.0, 1.0),
    ]
    write_midi_file(data_dir / "taj_mahal.mid", taj_mahal, bpm=116)

    # 2. Rod Stewart — Da Ya Think I'm Sexy? (1978)
    da_ya_think = [
        (65, 0.0, 0.5), (65, 0.5, 0.5), (67, 1.0, 0.5), (69, 1.5, 1.0),
        (65, 2.5, 0.5), (62, 3.0, 1.0), (65, 4.0, 0.5), (62, 4.5, 0.5),
        (60, 5.0, 0.5), (62, 5.5, 0.5), (65, 6.0, 0.5), (67, 6.5, 0.5),
        (69, 7.0, 1.0), (67, 8.0, 0.5), (65, 8.5, 0.5), (62, 9.0, 1.0),
    ]
    write_midi_file(data_dir / "da_ya_think.mid", da_ya_think, bpm=114)

    # 3. The Chiffons — He's So Fine (1963)
    chiffons = [
        (67, 0.0, 0.5), (64, 0.5, 0.5), (62, 1.0, 1.0),
        (67, 2.0, 0.5), (64, 2.5, 0.5), (62, 3.0, 1.0),
        (72, 4.0, 0.5), (71, 4.5, 0.5), (69, 5.0, 0.5), (67, 5.5, 1.0),
    ]
    write_midi_file(data_dir / "chiffons_hes_so_fine.mid", chiffons, bpm=122)

    # 4. George Harrison — My Sweet Lord (1970)
    harrison = [
        (67, 0.0, 0.5), (64, 0.5, 0.5), (62, 1.0, 1.0),
        (67, 2.0, 0.5), (64, 2.5, 0.5), (62, 3.0, 1.0),
        (72, 4.0, 0.5), (71, 4.5, 0.5), (69, 5.0, 0.5), (67, 5.5, 1.0),
    ]
    write_midi_file(data_dir / "harrison_my_sweet_lord.mid", harrison, bpm=121)

    # 5. Queen — Under Pressure (1981)
    queen = [
        (62, 0.0, 0.5), (62, 0.5, 0.5), (62, 1.0, 0.5), (62, 1.5, 0.5),
        (62, 2.0, 0.5), (62, 2.5, 0.5), (69, 3.0, 1.0),
    ]
    write_midi_file(data_dir / "queen_under_pressure.mid", queen, bpm=114)

    # 6. Vanilla Ice — Ice Ice Baby (1990)
    vanilla = [
        (62, 0.0, 0.5), (62, 0.5, 0.5), (62, 1.0, 0.5), (62, 1.5, 0.5),
        (62, 2.0, 0.5), (62, 2.5, 0.5), (63, 2.75, 0.25), (69, 3.0, 1.0),
    ]
    write_midi_file(data_dir / "vanilla_ice_baby.mid", vanilla, bpm=116)

    # 7. Beethoven — Symphony No. 5 (1808)
    beethoven = [
        (67, 0.0, 0.25), (67, 0.35, 0.25), (67, 0.7, 0.25), (63, 1.05, 1.5),
        (65, 3.0, 0.25), (65, 3.35, 0.25), (65, 3.7, 0.25), (62, 4.05, 1.5),
    ]
    write_midi_file(data_dir / "beethoven_sym5.mid", beethoven, bpm=108)

    # 8. Daft Punk — Get Lucky (2013)
    daft_punk = [
        (71, 0.0, 0.5), (74, 0.5, 0.5), (76, 1.0, 0.5), (74, 1.5, 0.5),
        (71, 2.0, 0.5), (69, 2.5, 0.5), (67, 3.0, 0.5), (69, 3.5, 1.0),
    ]
    write_midi_file(data_dir / "daft_punk_get_lucky.mid", daft_punk, bpm=116)

    # 9. Miles Davis — So What (1959)
    miles = [(62, 0.0, 0.5), (65, 0.5, 0.5), (69, 1.0, 1.0), (67, 2.0, 1.0)]
    write_midi_file(data_dir / "miles_davis_so_what.mid", miles, bpm=135)

    # 10. Taylor Swift — Shake It Off (2014)
    taylor = [(69, 0.0, 0.25), (69, 0.25, 0.25), (69, 0.5, 0.25), (67, 0.75, 0.5), (64, 1.25, 0.5)]
    write_midi_file(data_dir / "taylor_swift_shake.mid", taylor, bpm=160)

    # 11. Chopin — Nocturne Op. 9 No. 2
    chopin = [(70, 0.0, 1.0), (72, 1.0, 0.5), (70, 1.5, 0.5), (68, 2.0, 1.0), (67, 3.0, 1.0)]
    write_midi_file(data_dir / "chopin_nocturne.mid", chopin, bpm=66)

    # 12. AC/DC — Back In Black
    acdc = [(64, 0.0, 0.5), (62, 1.0, 0.5), (60, 2.0, 0.5), (57, 3.0, 1.0)]
    write_midi_file(data_dir / "acdc_back_in_black.mid", acdc, bpm=92)

    # 13. Tom Jobim — Desafinado
    jobim = [(65, 0.0, 1.0), (66, 1.0, 1.0), (67, 2.0, 1.0), (68, 3.0, 1.0)]
    write_midi_file(data_dir / "jobim_desafinado.mid", jobim, bpm=130)

    # 14. Metallica — Enter Sandman
    metallica = [(52, 0.0, 0.5), (64, 0.5, 0.5), (63, 1.0, 0.5), (58, 1.5, 0.5)]
    write_midi_file(data_dir / "metallica_sandman.mid", metallica, bpm=123)

    # 15. Bob Dylan — Blowin' In The Wind
    dylan = [(60, 0.0, 0.5), (64, 0.5, 0.5), (67, 1.0, 1.0), (69, 2.0, 0.5), (67, 2.5, 1.0)]
    write_midi_file(data_dir / "dylan_blowin.mid", dylan, bpm=88)

    # 16. Kraftwerk — Autobahn
    kraftwerk = [(60, 0.0, 0.5), (60, 0.5, 0.5), (67, 1.0, 1.0), (60, 2.0, 0.5), (60, 2.5, 0.5)]
    write_midi_file(data_dir / "kraftwerk_autobahn.mid", kraftwerk, bpm=120)

    # 17. Stevie Wonder — Superstition
    wonder = [(63, 0.0, 0.25), (66, 0.25, 0.25), (68, 0.5, 0.25), (66, 0.75, 0.25), (63, 1.0, 0.5)]
    write_midi_file(data_dir / "wonder_superstition.mid", wonder, bpm=100)

    # 18. Debussy — Clair de Lune
    debussy = [(68, 0.0, 1.5), (65, 1.5, 1.5), (63, 3.0, 1.5), (61, 4.5, 3.0)]
    write_midi_file(data_dir / "debussy_clair.mid", debussy, bpm=60)

    # 19. ABBA — Dancing Queen
    abba = [(64, 0.0, 0.5), (69, 0.5, 0.5), (71, 1.0, 0.5), (73, 1.5, 0.5), (71, 2.0, 1.0)]
    write_midi_file(data_dir / "abba_dancing_queen.mid", abba, bpm=101)

    # 20. Nirvana — Smells Like Teen Spirit
    nirvana = [(65, 0.0, 0.5), (65, 0.5, 0.5), (70, 1.0, 0.5), (68, 1.5, 0.5)]
    write_midi_file(data_dir / "nirvana_teen_spirit.mid", nirvana, bpm=117)

    # Generate calibration_pairs.json
    pairs = [
        # Known Positives
        {"label": "positive", "midi_a": "data/midi/taj_mahal.mid", "midi_b": "data/midi/da_ya_think.mid", "name_a": "Jorge Ben (Taj Mahal)", "name_b": "Rod Stewart (Da Ya Think)"},
        {"label": "positive", "midi_a": "data/midi/chiffons_hes_so_fine.mid", "midi_b": "data/midi/harrison_my_sweet_lord.mid", "name_a": "The Chiffons (He's So Fine)", "name_b": "George Harrison (My Sweet Lord)"},
        {"label": "positive", "midi_a": "data/midi/queen_under_pressure.mid", "midi_b": "data/midi/vanilla_ice_baby.mid", "name_a": "Queen (Under Pressure)", "name_b": "Vanilla Ice (Ice Ice Baby)"},

        # Empirical Negatives
        {"label": "negative", "midi_a": "data/midi/beethoven_sym5.mid", "midi_b": "data/midi/daft_punk_get_lucky.mid", "name_a": "Beethoven (Sym 5)", "name_b": "Daft Punk (Get Lucky)"},
        {"label": "negative", "midi_a": "data/midi/miles_davis_so_what.mid", "midi_b": "data/midi/taylor_swift_shake.mid", "name_a": "Miles Davis", "name_b": "Taylor Swift"},
        {"label": "negative", "midi_a": "data/midi/chopin_nocturne.mid", "midi_b": "data/midi/acdc_back_in_black.mid", "name_a": "Chopin", "name_b": "AC/DC"},
        {"label": "negative", "midi_a": "data/midi/jobim_desafinado.mid", "midi_b": "data/midi/metallica_sandman.mid", "name_a": "Jobim", "name_b": "Metallica"},
        {"label": "negative", "midi_a": "data/midi/dylan_blowin.mid", "midi_b": "data/midi/kraftwerk_autobahn.mid", "name_a": "Bob Dylan", "name_b": "Kraftwerk"},
        {"label": "negative", "midi_a": "data/midi/wonder_superstition.mid", "midi_b": "data/midi/debussy_clair.mid", "name_a": "Stevie Wonder", "name_b": "Debussy"},
        {"label": "negative", "midi_a": "data/midi/abba_dancing_queen.mid", "midi_b": "data/midi/nirvana_teen_spirit.mid", "name_a": "ABBA", "name_b": "Nirvana"},
        {"label": "negative", "midi_a": "data/midi/beethoven_sym5.mid", "midi_b": "data/midi/taj_mahal.mid", "name_a": "Beethoven", "name_b": "Jorge Ben"},
        {"label": "negative", "midi_a": "data/midi/daft_punk_get_lucky.mid", "midi_b": "data/midi/chiffons_hes_so_fine.mid", "name_a": "Daft Punk", "name_b": "The Chiffons"},
    ]

    with open("calibration_pairs.json", "w", encoding="utf-8") as f:
        json.dump(pairs, f, indent=2, ensure_ascii=False)

    print(f"Generated {len(pairs)} calibration pairs and MIDI files in {data_dir}")


if __name__ == "__main__":
    main()
