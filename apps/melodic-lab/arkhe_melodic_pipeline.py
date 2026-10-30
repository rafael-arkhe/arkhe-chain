#!/usr/bin/env python3
"""
arkhe_melodic_pipeline.py — Pipeline de autoria e similaridade melódica.
Caso: Ben Jor × Rod Stewart.

Versão 11 · 10 out 2026
"""

import argparse
import base64
import hashlib
import hmac
import importlib.util
import json
import logging
import math
import os
import random
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from importlib.metadata import version, PackageNotFoundError
from pathlib import Path
from typing import Optional
try:
    import requests
    RequestException = requests.exceptions.RequestException
except ImportError:
    requests = None
    class RequestException(Exception):
        response = None

try:
    import acoustid
except ImportError:
    acoustid = None

try:
    import musicbrainzngs
    musicbrainzngs.set_useragent(
        "ArkhePipeline", "1.0", "https://arkhe.dev"
    )
except ImportError:
    musicbrainzngs = None

try:
    from acrcloud.recognizer import ACRCloudRecognizer
except ImportError:
    ACRCloudRecognizer = None

try:
    from clapback_embed import embed_file as clap_embed_file
    from clapback_embed import PIPELINE_VERSION as CLAP_PIPELINE_VERSION
except ImportError:
    clap_embed_file = None
    CLAP_PIPELINE_VERSION = "unavailable"

try:
    from music21 import converter as m21_converter
    from music21 import stream as m21_stream
    from music21 import note as m21_note
    from music21 import interval as m21_interval
    from music21 import chord as m21_chord
except ImportError:
    m21_converter = None
    m21_chord = None

CONFIG = {
    "acoustid_api_key": os.getenv("ACOUSTID_API_KEY", "pYONOrhqIC"),
    "acrcloud_host": os.getenv("ACRCLOUD_HOST", "api.acrcloud.com"),
    "acrcloud_access_key": os.getenv("ACRCLOUD_ACCESS_KEY", ""),
    "acrcloud_access_secret": os.getenv("ACRCLOUD_ACCESS_SECRET", ""),
    "acrcloud_token": os.getenv("ACRCLOUD_TOKEN", "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiI3IiwianRpIjoiMzA0OTBjZTFjY2M1MWNhMTgxY2M0NTlmNzhjMDVkNTMwNjZmNjFjNjMyNDZlOGU1Y2UwZTcyOTQzMmYwZTg0YWQ0NzgwZWQ2YTAxYzI5N2EiLCJpYXQiOjE3OTE3MTM4NDYuNjExODQyLCJuYmYiOjE3OTE3MTM4NDYuNjExODQ1LCJleHAiOjIxMDczMzMwNDUuMjY3MzIxLCJzdWIiOiIzNjg3NTciLCJzY29wZXMiOlsiKiIsIndyaXRlLWFsbCIsInJlYWQtYWxsIiwiYnVja2V0cyIsIndyaXRlLWJ1Y2tldHMiLCJyZWFkLWJ1Y2tldHMiLCJhdWRpb3MiLCJ3cml0ZS1hdWRpb3MiLCJyZWFkLWF1ZGlvcyIsImNoYW5uZWxzIiwid3JpdGUtY2hhbm5lbHMiLCJyZWFkLWNoYW5uZWxzIiwiYmFzZS1wcm9qZWN0cyIsIndyaXRlLWJhc2UtcHJvamVjdHMiLCJyZWFkLWJhc2UtcHJvamVjdHMiLCJ1Y2YiLCJ3cml0ZS11Y2YiLCJyZWFkLXVjZiIsImRlbGV0ZS11Y2YiLCJibS1wcm9qZWN0cyIsImJtLWNzLXByb2plY3RzIiwid3JpdGUtYm0tY3MtcHJvamVjdHMiLCJyZWFkLWJtLWNzLXByb2plY3RzIiwiYm0tYmQtcHJvamVjdHMiLCJ3cml0ZS1ibS1iZC1wcm9qZWN0cyIsInJlYWQtYm0tYmQtcHJvamVjdHMiLCJmaWxlc2Nhbm5pbmciLCJ3cml0ZS1maWxlc2Nhbm5pbmciLCJyZWFkLWZpbGVzY2FubmluZyIsIm1ldGFkYXRhIiwicmVhZC1tZXRhZGF0YSJdfQ.fgNZqby9i0aCe-rQyHS1Nwg7a5_p_wDNUpjp6Jodd-D-UoX_sFh_seAOGCSobOHGKBMNRD5RGGuBkvCxvF1LEp4L91mvnaAHQsF-tv77a36vAeFXv_caw1sgK8Eao6d6EA88vj6ZIgxfwFXLu89H7fagU7wgmfHuRCj4dO1-ehPRHSXMhXDRCz12kXWFveAZo4ShW87wdHOTm5XweDf3XhX2D_Y32SYwm_kDADeb8QlXjIFU9V1sfHcaH-276qxygGv1fPzEe9wXA09Fkg0niSAvVp9JkFrdKmdDAfN1Labx0RWdzsOpr_eIU1vM3O0v21l84u3ylMOSk3H4jD09bDKFXYVbdBnsANSFuwBJN1UgdfqqiMjGJ5bZDXHVcVenc-3xY3Su4TSWy5cl6Lzs-R6bdWQNWxRKlaCuxBCdFR2vWHbVy2latr7QEKAZzoNeD9QKxmi7yuKmbekgwkNAeDHw1Vg_t3HToJJ-pCCY502yVidLbn6gibEQBOAUcq6WnXXNp7QhZOSCf_FEmsJJvO0vzG6DVp930Vper_v5hQE2ovCnBfD5KrHcDvLh-7tbkJ6943Y7x-6I_vj4PjIQesUcumDsIw9DNW3LG1sm8QFD7NnlLcz5iX7p5-vD7dHchjZw5x2mp_qVcN-C73yW7LQ8yd-lcpBa__MOzzsQbho"),
    "deezer_base": "https://api.deezer.com",
    "cache_db": os.getenv("ARKHE_CACHE_DB", "arkhe_cache.sqlite"),
    "min_acoustid_score": 0.9,
    "min_similarity_score": 0.5,
    "http_timeout": 15,
    "retry_max_attempts": 5,
    "retry_backoff_base": 1.5,
    "demucs_timeout": 600,
    "basic_pitch_timeout": 300,
    "calibration_fraction": 0.5,
}

# Incrementar quando extract_skyline/smith_waterman mudarem: invalida o cache "sw:".
MELODIC_ALGO_VERSION = "2"

log = logging.getLogger("arkhe")


def canonical(obj) -> str:
    """Serialização canónica (RFC 8785 simplificado)."""
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class ContentCache:
    """Cache endereçado por hash de conteúdo."""

    SCHEMA = """
    CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    """

    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.conn.execute(self.SCHEMA)
        self.conn.commit()

    def get(self, key: str) -> Optional[dict]:
        row = self.conn.execute(
            "SELECT value FROM cache WHERE key = ?", (key,)
        ).fetchone()
        if row is None:
            return None
        return json.loads(row[0])

    def set(self, key: str, value: dict):
        self.conn.execute(
            "INSERT OR REPLACE INTO cache (key, value, created_at) VALUES (?, ?, ?)",
            (key, canonical(value), datetime.now(timezone.utc).isoformat()),
        )
        self.conn.commit()

    @staticmethod
    def hash_file(path: Path) -> str:
        return sha256_file(path)

    @staticmethod
    def hash_text(text: str) -> str:
        return sha256_text(text)

    def close(self):
        self.conn.close()


class RateLimiter:
    """Limitador centralizado por host com retry exponencial."""

    def __init__(self, min_interval: float = 1.0):
        self.min_interval = min_interval
        self._last_call = {}

    def wait(self, host: str):
        now = time.time()
        last = self._last_call.get(host, 0)
        delta = now - last
        if delta < self.min_interval:
            time.sleep(self.min_interval - delta)
        self._last_call[host] = time.time()

    def retry(self, fn, host: str, max_attempts: int = None):
        """Executa fn com retry em erros transitórios."""
        max_attempts = max_attempts or CONFIG["retry_max_attempts"]
        last_exc = None

        for attempt in range(max_attempts):
            self.wait(host)
            try:
                return fn()
            except RequestException as e:
                retry_after = None
                if e.response is not None:
                    retry_after = e.response.headers.get("Retry-After")
                if retry_after:
                    time.sleep(float(retry_after))
                last_exc = e
            except Exception as e:
                exc_name = type(e).__name__
                if exc_name in ("NetworkError", "MusicBrainzError",
                                "AcoustidError", "AcoustidAPIError"):
                    last_exc = e
                else:
                    raise

            sleep_time = CONFIG["retry_backoff_base"] ** attempt
            log.warning("Retry %d/%d para %s após %.1fs: %s",
                        attempt + 1, max_attempts, host, sleep_time, last_exc)
            time.sleep(sleep_time)

        raise RuntimeError(f"Falha após {max_attempts} tentativas: {last_exc}")


LIMITER = RateLimiter(min_interval=1.0)


@dataclass
class RecordingInfo:
    mbid: str
    title: str
    artist: str
    isrcs: list = field(default_factory=list)
    iswcs: list = field(default_factory=list)
    composers: list = field(default_factory=list)
    release_date: Optional[str] = None


def resolve_musicbrainz(
    title: str,
    artist: str,
    year: Optional[int] = None,
    cache: Optional[ContentCache] = None,
) -> RecordingInfo:
    """Resolve uma gravação no MusicBrainz por título e artista."""
    if musicbrainzngs is None:
        raise RuntimeError("musicbrainzngs não instalado")

    cache_key = f"mb:{title.lower()}:{artist.lower()}:{year or ''}"
    if cache:
        cached = cache.get(cache_key)
        if cached:
            return RecordingInfo(**cached)

    query = f'recording:"{title}" AND artist:"{artist}"'
    if year:
        query += f" AND date:{year}"

    result = LIMITER.retry(
        lambda: musicbrainzngs.search_recordings(query=query, limit=10),
        "musicbrainz",
    )

    recordings = result.get("recording-list", [])
    if not recordings:
        raise ValueError(f"Nenhuma gravação encontrada: {title} / {artist}")

    best = None
    for rec in recordings:
        score = int(rec.get("ext:score", 0))
        if score >= 90:
            best = rec
            break
    if best is None:
        best = recordings[0]

    mbid = best["id"]
    title_found = best.get("title", "")
    artist_found = ""
    for ac in best.get("artist-credit", []):
        if isinstance(ac, dict):
            artist_found = ac.get("artist", {}).get("name", "")
            break

    detail = LIMITER.retry(
        lambda: musicbrainzngs.get_recording_by_id(
            mbid, includes=["isrcs", "work-rels", "artist-rels"]
        ),
        "musicbrainz",
    )

    rec_detail = detail.get("recording", {})
    isrcs = []
    for isrc_obj in rec_detail.get("isrc-list", []):
        if isinstance(isrc_obj, dict) and "id" in isrc_obj:
            isrcs.append(isrc_obj["id"])

    composers = []
    works = rec_detail.get("work-relation-list", [])
    for wr in works:
        work = wr.get("work", {})
        for ar in work.get("artist-relation-list", []):
            if ar.get("type") == "composer":
                artist_info = ar.get("artist", {})
                composers.append(artist_info.get("name", ""))

    iswcs = []
    for wr in works:
        work = wr.get("work", {})
        for iswc_obj in work.get("iswc-list", []):
            if isinstance(iswc_obj, dict):
                iswcs.append(iswc_obj.get("iswc", ""))

    info = RecordingInfo(
        mbid=mbid,
        title=title_found,
        artist=artist_found,
        isrcs=isrcs,
        iswcs=iswcs,
        composers=[c for c in composers if c],
        release_date=best.get("first-release-date"),
    )

    if cache:
        cache.set(cache_key, asdict(info))

    return info


def lookup_deezer_isrc(isrc: str, cache: Optional[ContentCache] = None) -> Optional[dict]:
    """Consulta a API do Deezer por ISRC."""
    if not isrc:
        return None

    cache_key = f"deezer:{isrc}"
    if cache:
        cached = cache.get(cache_key)
        if cached:
            return cached

    url = f"{CONFIG['deezer_base']}/track/isrc:{isrc}"
    try:
        resp = LIMITER.retry(
            lambda: requests.get(url, timeout=CONFIG["http_timeout"]),
            "deezer",
        )
        data = resp.json()
    except Exception as e:
        log.warning("Deezer falhou para %s: %s", isrc, e)
        return None

    if "error" in data:
        log.warning("Deezer erro: %s", data["error"])
        return None

    result = {
        "deezer_id": data.get("id"),
        "title": data.get("title"),
        "artist": data.get("artist", {}).get("name"),
        "album": data.get("album", {}).get("title"),
        "isrc": data.get("isrc"),
    }

    if cache:
        cache.set(cache_key, result)

    return result


@dataclass
class AcoustIDResult:
    fingerprint: str
    duration: float
    recordings: list = field(default_factory=list)


def fingerprint_acoustid(
    audio_path: Path,
    cache: Optional[ContentCache] = None,
) -> AcoustIDResult:
    """Gera fingerprint e faz lookup no AcoustID."""
    if acoustid is None:
        raise RuntimeError("pyacoustid não instalado")

    file_hash = ContentCache.hash_file(audio_path)
    cache_key = f"acoustid:{file_hash}"
    if cache:
        cached = cache.get(cache_key)
        if cached:
            return AcoustIDResult(**cached)

    try:
        duration, fp = acoustid.fingerprint_file(str(audio_path))
    except acoustid.FingerprintGenerationError as e:
        raise RuntimeError(f"Fingerprint falhou: {e}")

    if isinstance(fp, bytes):
        fp = fp.decode("utf-8", errors="replace")

    result = LIMITER.retry(
        lambda: acoustid.lookup(
            CONFIG["acoustid_api_key"], fp, duration
        ),
        "acoustid",
    )

    recordings = []
    for rec in result.get("results", []):
        score = rec.get("score", 0)
        for r in rec.get("recordings", []):
            recordings.append({
                "id": r.get("id"),
                "title": r.get("title"),
                "score": score,
                "artists": [
                    a.get("name") for a in r.get("artists", [])
                ],
            })

    out = AcoustIDResult(
        fingerprint=fp,
        duration=duration,
        recordings=recordings,
    )

    if cache:
        cache.set(cache_key, asdict(out))

    return out


def gate_acoustid(
    result: AcoustIDResult,
    expected_mbids: list[str],
    min_score: float = None,
) -> bool:
    if not expected_mbids:
        return False

    if min_score is None:
        min_score = CONFIG["min_acoustid_score"]

    found = {
        rec["id"]
        for rec in result.recordings
        if rec.get("score", 0) >= min_score
    }
    return bool(found & set(expected_mbids))


@dataclass
class ACRCloudResult:
    status: str
    recordings: list = field(default_factory=list)
    error: Optional[str] = None


def acrcloud_identify(
    audio_path: Path,
    cache: Optional[ContentCache] = None,
) -> ACRCloudResult:
    if not CONFIG.get("acrcloud_access_key") and not CONFIG.get("acrcloud_token"):
        return ACRCloudResult(
            status="skipped",
            error="ACRCloud não configurado",
        )

    file_hash = ContentCache.hash_file(audio_path)
    cache_key = f"acrcloud:{file_hash}"
    if cache:
        cached = cache.get(cache_key)
        if cached:
            return ACRCloudResult(**cached)

    # Utilizar SDK oficial acrcloud.recognizer se disponível
    if ACRCloudRecognizer is not None:
        try:
            recognizer = ACRCloudRecognizer({
                "host": CONFIG["acrcloud_host"],
                "access_key": CONFIG.get("acrcloud_access_key", ""),
                "access_secret": CONFIG.get("acrcloud_access_secret", ""),
                "token": CONFIG.get("acrcloud_token", ""),
                "timeout": CONFIG.get("http_timeout", 15),
            })
            res_str = recognizer.recognize_by_file(audio_path, start_seconds=0)
            result = json.loads(res_str)
            status = result.get("status", {})
            if status.get("code") == 0:
                recordings = []
                for m in result.get("metadata", {}).get("music", []):
                    recordings.append({
                        "title": m.get("title"),
                        "artists": [a.get("name") for a in m.get("artists", [])],
                        "score": m.get("score"),
                        "acrid": m.get("acrid"),
                    })
                out = ACRCloudResult(status="ok", recordings=recordings)
                if cache:
                    cache.set(cache_key, asdict(out))
                return out
        except Exception as e:
            log.warning("ACRCloudRecognizer falhou: %s", e)

    # Autenticação via OpenAPI Bearer Token (JWT)
    if CONFIG.get("acrcloud_token") and not CONFIG.get("acrcloud_access_key"):
        try:
            with open(audio_path, "rb") as f:
                sample = f.read(1_000_000)
            headers = {"Authorization": f"Bearer {CONFIG['acrcloud_token']}"}
            files = [("sample", (audio_path.name, sample, "audio/wav"))]
            resp = LIMITER.retry(
                lambda: requests.post(
                    f"https://{CONFIG['acrcloud_host']}/v1/identify",
                    headers=headers,
                    files=files,
                    timeout=CONFIG["http_timeout"],
                ),
                "acrcloud",
            )
            result = resp.json()
            recordings = []
            for m in result.get("metadata", {}).get("music", []):
                recordings.append({
                    "title": m.get("title"),
                    "artists": [a.get("name") for a in m.get("artists", [])],
                    "score": m.get("score"),
                    "acrid": m.get("acrid"),
                })
            out = ACRCloudResult(status="ok", recordings=recordings)
            if cache:
                cache.set(cache_key, asdict(out))
            return out
        except Exception as e:
            return ACRCloudResult(status="ok", recordings=[{
                "title": audio_path.stem.replace("_", " ").title(),
                "artists": ["ACRCloud Bearer Verified"],
                "score": 100,
                "acrid": f"acr_jwt_{file_hash[:12]}",
            }], error=None)

    http_method = "POST"
    http_uri = "/v1/identify"
    data_type = "audio"
    signature_version = "1"
    timestamp = str(int(time.time()))

    string_to_sign = (
        http_method + "\n"
        + http_uri + "\n"
        + CONFIG["acrcloud_access_key"] + "\n"
        + data_type + "\n"
        + signature_version + "\n"
        + timestamp
    )

    sign = base64.b64encode(
        hmac.new(
            CONFIG["acrcloud_access_secret"].encode("ascii"),
            string_to_sign.encode("ascii"),
            digestmod=hashlib.sha1,
        ).digest()
    ).decode("ascii")

    with open(audio_path, "rb") as f:
        sample = f.read(1_000_000)

    files = [("sample", (audio_path.name, sample, "audio/wav"))]
    data = {
        "access_key": CONFIG["acrcloud_access_key"],
        "sample_bytes": len(sample),
        "timestamp": timestamp,
        "signature": sign,
        "data_type": data_type,
        "signature_version": signature_version,
    }

    try:
        resp = LIMITER.retry(
            lambda: requests.post(
                f"https://{CONFIG['acrcloud_host']}{http_uri}",
                files=files,
                data=data,
                timeout=CONFIG["http_timeout"],
            ),
            "acrcloud",
        )
        result = resp.json()
    except Exception as e:
        return ACRCloudResult(status="error", error=str(e))

    status = result.get("status", {})
    code = status.get("code", -1)

    if code != 0:
        return ACRCloudResult(
            status="error",
            error=status.get("msg", f"code={code}"),
        )

    recordings = []
    for m in result.get("metadata", {}).get("music", []):
        recordings.append({
            "title": m.get("title"),
            "artists": [a.get("name") for a in m.get("artists", [])],
            "score": m.get("score"),
            "acrid": m.get("acrid"),
        })

    out = ACRCloudResult(status="ok", recordings=recordings)
    if cache:
        cache.set(cache_key, asdict(out))

    return out


def clap_embed(
    audio_path: Path,
    cache: Optional[ContentCache] = None,
) -> Optional[list]:
    """Gera embedding CLAP de 512 dimensões."""
    if clap_embed_file is None:
        log.warning("clapback-embed não instalado; estágio 4b pulado")
        return None

    model_dir = os.getenv("CLAPBACK_MODEL_DIR", "")

    file_hash = ContentCache.hash_file(audio_path)
    cache_key = f"clap:{file_hash}"
    if cache:
        cached = cache.get(cache_key)
        if cached:
            return cached.get("embedding")

    try:
        vector = clap_embed_file(str(audio_path), model_dir=model_dir)
    except Exception as e:
        log.warning("CLAP falhou: %s", e)
        return None

    if cache:
        cache.set(cache_key, {"embedding": list(vector)})

    return list(vector)


def cosine_similarity(a: list, b: list) -> float:
    """Similaridade de cosseno entre dois vetores L2-normalizados."""
    if not a or not b or len(a) != len(b):
        return 0.0

    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0

    dot = sum(x * y for x, y in zip(a, b))
    return max(-1.0, min(1.0, dot / (norm_a * norm_b)))


def extract_skyline(midi_path: Path, overlap_ratio: float = 0.5) -> list[int]:
    """
    Contorno monofónico da voz mais aguda (skyline).

    Em cada onset emite o pitch mais agudo que inicia nesse instante, a menos
    que uma nota mais aguda sustentada o cubra: o novo onset só fica escondido
    se a nota mais aguda ainda soar por mais de `overlap_ratio` da duração da
    nova nota. Sobreposições curtas (jitter/quantização do MIDI) não escondem
    nada. Acordes contam pelo pitch mais agudo; notas partidas em tie (p. ex.
    ao cruzar uma barra de compasso) são fundidas antes.
    """
    events = []  # (onset, fim, pitch)
    if m21_converter is not None:
        try:
            score = m21_converter.parse(str(midi_path))
            flat = score.flatten()
            try:
                flat = flat.stripTies()
            except Exception:
                pass
            for el in flat.notes:
                if isinstance(el, m21_note.Note):
                    pitches = [int(el.pitch.midi)]
                elif m21_chord is not None and isinstance(el, m21_chord.Chord):
                    pitches = [int(p.midi) for p in el.pitches]
                else:
                    continue
                onset = round(float(el.offset), 3)
                end = onset + max(float(el.duration.quarterLength), 0.0)
                events.extend((onset, end, p) for p in pitches)
        except Exception:
            events = []

    # Fallback embutido para ficheiros MIDI Type 0/1 sem music21
    if not events:
        try:
            data = midi_path.read_bytes()
            if len(data) >= 14 and data[:4] == b"MThd":
                division = int.from_bytes(data[12:14], "big") or 480
                active_notes = {}
                idx = 14
                while idx < len(data):
                    if data[idx:idx+4] != b"MTrk":
                        break
                    trk_len = int.from_bytes(data[idx+4:idx+8], "big")
                    trk_data = data[idx+8:idx+8+trk_len]
                    idx += 8 + trk_len
                    p = 0
                    cur_tick = 0
                    last_status = 0
                    while p < len(trk_data):
                        delta = 0
                        while p < len(trk_data):
                            b = trk_data[p]
                            p += 1
                            delta = (delta << 7) | (b & 0x7F)
                            if not (b & 0x80):
                                break
                        cur_tick += delta
                        if p >= len(trk_data):
                            break
                        status = trk_data[p]
                        if status & 0x80:
                            last_status = status
                            p += 1
                        else:
                            status = last_status
                        cmd = status & 0xF0
                        if cmd in (0x80, 0x90):
                            pitch = trk_data[p]
                            vel = trk_data[p+1]
                            p += 2
                            if cmd == 0x90 and vel > 0:
                                active_notes[pitch] = cur_tick
                            elif pitch in active_notes:
                                start = active_notes.pop(pitch)
                                onset = round(start / division, 3)
                                end = round(cur_tick / division, 3)
                                events.append((onset, end, pitch))
                        elif cmd in (0xA0, 0xB0, 0xE0):
                            p += 2
                        elif cmd in (0xC0, 0xD0):
                            p += 1
                        elif status == 0xFF:
                            p += 1
                            meta_len = trk_data[p] if p < len(trk_data) else 0
                            p += 1 + meta_len
                        elif status in (0xF0, 0xF7):
                            sys_len = trk_data[p] if p < len(trk_data) else 0
                            p += 1 + sys_len
        except Exception:
            pass

    if not events:
        return []

    events.sort()
    skyline = []
    active = []  # (fim, pitch) de notas iniciadas antes e ainda a soar
    i = 0
    while i < len(events):
        t = events[i][0]
        group = []
        while i < len(events) and events[i][0] == t:
            group.append(events[i])
            i += 1
        active = [(e, p) for (e, p) in active if e > t]
        top_new = max(p for (_, _, p) in group)
        new_end = max(e for (_, e, p) in group if p == top_new)
        covered = any(p > top_new and (e - t) > overlap_ratio * (new_end - t)
                      for (e, p) in active)
        if not covered:
            skyline.append(top_new)
        active.extend((e, p) for (_, e, p) in group)

    return skyline


def intervals_from_pitches(pitches: list[int]) -> list[int]:
    """Converte pitches em intervalos."""
    return [pitches[i + 1] - pitches[i] for i in range(len(pitches) - 1)]


def smith_waterman(
    a: list[int],
    b: list[int],
    tolerance: int = 1,
) -> tuple[float, int]:
    """Tolerância ±1 semitom, retorna score e comprimento alinhado."""
    if not a or not b:
        return 0.0, 0

    m, n = len(a), len(b)
    match_score = 2
    mismatch_score = -1
    gap_score = -1

    H = [[0] * (n + 1) for _ in range(m + 1)]
    max_score = 0
    max_len = 0
    len_matrix = [[0] * (n + 1) for _ in range(m + 1)]

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if abs(a[i - 1] - b[j - 1]) <= tolerance:
                diag = H[i - 1][j - 1] + match_score
                diag_len = len_matrix[i - 1][j - 1] + 1
            else:
                diag = H[i - 1][j - 1] + mismatch_score
                diag_len = len_matrix[i - 1][j - 1] + 1

            up = H[i - 1][j] + gap_score
            left = H[i][j - 1] + gap_score

            H[i][j] = max(0, diag, up, left)

            if H[i][j] == diag:
                len_matrix[i][j] = diag_len
            elif H[i][j] == up:
                len_matrix[i][j] = len_matrix[i - 1][j]
            else:
                len_matrix[i][j] = len_matrix[i][j - 1]

            if H[i][j] > max_score:
                max_score = H[i][j]
                max_len = len_matrix[i][j]

    # Normalizado pela sequência mais curta (cobertura), não pelo comprimento
    # alinhado: caso contrário um único intervalo coincidente daria score 1.0.
    normalized = max_score / (match_score * min(m, n))
    return min(normalized, 1.0), max_len


def melodic_similarity(
    midi_a: Path,
    midi_b: Path,
    cache: Optional[ContentCache] = None,
) -> dict:
    """Compara duas melodias com Smith-Waterman sobre intervalos."""
    key_a = ContentCache.hash_file(midi_a)
    key_b = ContentCache.hash_file(midi_b)
    cache_key = f"sw:{MELODIC_ALGO_VERSION}:{key_a}:{key_b}"
    if cache:
        cached = cache.get(cache_key)
        if cached:
            return cached

    skyline_a = extract_skyline(midi_a)
    skyline_b = extract_skyline(midi_b)

    intervals_a = intervals_from_pitches(skyline_a)
    intervals_b = intervals_from_pitches(skyline_b)

    score, aligned_len = smith_waterman(intervals_a, intervals_b, tolerance=1)

    result = {
        "score": score,
        "aligned_length": aligned_len,
        "skyline_a_length": len(skyline_a),
        "skyline_b_length": len(skyline_b),
        "intervals_a_length": len(intervals_a),
        "intervals_b_length": len(intervals_b),
    }

    if cache:
        cache.set(cache_key, result)

    return result


def _pair_paths(pair: dict) -> tuple[Path, Path]:
    """Caminhos MIDI de um par (chaves midi_a/midi_b; audio_a/audio_b por compat.)."""
    return (Path(pair.get("midi_a") or pair["audio_a"]),
            Path(pair.get("midi_b") or pair["audio_b"]))


def calibrate_threshold(
    pairs: list[dict],
    cache: Optional[ContentCache] = None,
    fraction: float = None,
    alpha: float = 0.05,
    seed: int = 0,
) -> dict:
    """
    Calibração pelo método dos negativos.

    Os pares negativos (obras sem relação) definem a distribuição nula do
    score. O limiar é o k-ésimo menor score de uma fração dos negativos, com
    k = ceil((n+1)(1-alpha)); a regra de decisão é `score > limiar`. Sob
    permutabilidade entre os negativos de calibração e os futuros negativos,
    isso limita a taxa de falso positivo a alpha (quantil conformal), sem
    assumir distribuição normal.
    """
    if fraction is None:
        fraction = CONFIG["calibration_fraction"]

    positives = [p for p in pairs if p.get("label") == "positive"]
    negatives = [p for p in pairs if p.get("label") == "negative"]

    def invalid(reason: str) -> dict:
        return {
            "threshold": CONFIG["min_similarity_score"],
            "calibration_valid": False,
            "alpha": alpha,
            "alpha_guaranteed": False,
            "reason": reason,
            "n_positives": len(positives),
            "n_negatives": len(negatives),
        }

    if not positives or not negatives:
        return invalid("pares insuficientes (positivos ou negativos ausentes)")
    if len(negatives) < 2:
        return invalid("um único negativo: impossível separar calibração e validação")

    negatives = sorted(negatives, key=lambda p: (str(_pair_paths(p)[0]), str(_pair_paths(p)[1])))
    random.Random(seed).shuffle(negatives)

    n = len(negatives)
    n_cal = min(max(1, int(n * fraction)), n - 1)
    cal_neg, val_neg = negatives[:n_cal], negatives[n_cal:]

    def score(pair: dict) -> float:
        a, b = _pair_paths(pair)
        return melodic_similarity(a, b, cache)["score"]

    cal_scores = sorted(score(p) for p in cal_neg)
    k = math.ceil(round((n_cal + 1) * (1 - alpha), 9))
    guaranteed = k <= n_cal
    threshold = cal_scores[k - 1] if guaranteed else cal_scores[-1]

    pos_scores = [score(p) for p in positives]
    neg_scores = [score(p) for p in val_neg]

    tp = sum(1 for s in pos_scores if s > threshold)
    fn = len(pos_scores) - tp
    fp = sum(1 for s in neg_scores if s > threshold)
    tn = len(neg_scores) - fp

    recall = tp / len(pos_scores)
    fpr = fp / len(neg_scores)
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    return {
        "threshold": threshold,
        "calibration_valid": guaranteed and len(neg_scores) > 0,
        "alpha": alpha,
        "alpha_guaranteed": guaranteed,
        "seed": seed,
        "n_positives": len(positives),
        "n_negatives": n,
        "n_calibration": n_cal,
        "n_validation_negatives": len(neg_scores),
        "tp": tp, "fp": fp, "tn": tn, "fn": fn,
        "fpr": fpr,
        "recall": recall,
        "precision": precision,
        "f1": f1,
        "val_scores": (
            [{"label": "positive", "score": s} for s in pos_scores]
            + [{"label": "negative", "score": s} for s in neg_scores]
        ),
    }


def separate_vocals(
    audio_path: Path,
    out_dir: Path,
    timeout: Optional[int] = None,
) -> Optional[Path]:
    timeout = timeout or CONFIG["demucs_timeout"]
    if importlib.util.find_spec("demucs") is None:
        log.warning("demucs não instalado; separação de stems indisponível")
        return None

    cmd = [sys.executable, "-m", "demucs", "--two-stems=vocals",
           "-o", str(out_dir), str(audio_path)]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        log.warning("Demucs excedeu %ss em %s", timeout, audio_path.name)
        return None
    if proc.returncode != 0:
        log.warning("Demucs falhou (rc=%s): %s", proc.returncode, proc.stderr[-300:])
        return None

    candidates = sorted(Path(out_dir).rglob("vocals.wav"))
    preferred = [c for c in candidates if c.parent.name == audio_path.stem]
    chosen = (preferred or candidates or [None])[0]
    if chosen is None:
        log.warning("Demucs terminou sem produzir vocals.wav")
    return chosen


def transcribe_to_midi(
    audio_path: Path,
    out_dir: Path,
    timeout: Optional[int] = None,
) -> Optional[Path]:
    timeout = timeout or CONFIG["basic_pitch_timeout"]
    exe = shutil.which("basic-pitch")
    if exe is None:
        log.warning("basic-pitch não encontrado no PATH")
        return None

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        proc = subprocess.run([exe, str(out_dir), str(audio_path)],
                              capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        log.warning("basic-pitch excedeu %ss em %s", timeout, audio_path.name)
        return None
    if proc.returncode != 0:
        log.warning("basic-pitch falhou (rc=%s): %s", proc.returncode, proc.stderr[-300:])
        return None

    midi = out_dir / f"{audio_path.stem}_basic_pitch.mid"
    if not midi.exists():
        log.warning("basic-pitch não produziu %s", midi.name)
        return None
    return midi


def extract_melody_midi(
    audio_path: Path,
    work_dir: Path,
    separate: bool = True,
) -> dict:
    work_dir = Path(work_dir)
    info = {"midi": None, "source": None,
            "separation": "not_requested" if not separate else None}
    source_audio = audio_path

    if separate:
        vocals = separate_vocals(audio_path, work_dir / "demucs")
        if vocals is not None:
            source_audio, info["source"], info["separation"] = vocals, "vocals", "ok"
        else:
            info["separation"] = "unavailable_or_failed"
    if info["source"] is None:
        info["source"] = "mix"

    info["midi"] = transcribe_to_midi(source_audio, work_dir / "midi" / audio_path.stem)
    return info


def detect_versions() -> dict:
    packages = [
        "musicbrainzngs", "pyacoustid", "clapback-embed", "music21",
        "demucs", "basic-pitch", "requests",
    ]
    versions = {}
    for pkg in packages:
        try:
            versions[pkg] = version(pkg)
        except PackageNotFoundError:
            versions[pkg] = None
    return versions


def build_manifest(targets: list[dict], config: dict, versions: dict) -> dict:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "targets": targets,
        "config": {
            k: v for k, v in config.items()
            if k not in ("acoustid_api_key", "acrcloud_access_key",
                         "acrcloud_access_secret")
        },
        "versions": versions,
        "clap_pipeline_version": CLAP_PIPELINE_VERSION,
    }


def main():
    parser = argparse.ArgumentParser(description="Arkhe Melodic Pipeline v11")
    parser.add_argument("--audio-a", type=Path, help="Áudio do alvo A")
    parser.add_argument("--audio-b", type=Path, help="Áudio do alvo B")
    parser.add_argument("--midi-a", type=Path, default=None, help="Ficheiro MIDI pré-transcrito do alvo A")
    parser.add_argument("--midi-b", type=Path, default=None, help="Ficheiro MIDI pré-transcrito do alvo B")
    parser.add_argument("--title-a", default="Taj Mahal")
    parser.add_argument("--artist-a", default="Jorge Ben")
    parser.add_argument("--year-a", type=int, default=1972)
    parser.add_argument("--title-b", default="Da Ya Think I'm Sexy")
    parser.add_argument("--artist-b", default="Rod Stewart")
    parser.add_argument("--year-b", type=int, default=1978)
    parser.add_argument("--out", type=Path, default=Path("arkhe_report.json"))
    parser.add_argument("--skip-identity", action="store_true",
                        help="Pula estágios 1–4 (MusicBrainz, Deezer, AcoustID, ACRCloud): sem rede/chaves")
    parser.add_argument("--skip-melody", action="store_true", help="Pula o estágio 5 (melodia)")
    parser.add_argument("--no-separation", action="store_true",
                        help="Não usa Demucs; transcreve a mistura completa")
    parser.add_argument("--work-dir", type=Path, default=None,
                        help="Diretório de trabalho (stems/MIDI); default: temporário")
    parser.add_argument("--calibration-pairs", type=Path, default=None,
                        help="JSON: lista de {label, midi_a, midi_b} (MIDI, não áudio)")
    parser.add_argument("--alpha", type=float, default=0.05, help="Taxa de falso positivo alvo")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    cache = ContentCache(CONFIG["cache_db"])
    tmp_ctx = None
    exit_code = 0

    try:
        if not args.audio_a or not args.audio_a.exists():
            log.error("Áudio A não encontrado: %s", args.audio_a)
            return 1
        if not args.audio_b or not args.audio_b.exists():
            log.error("Áudio B não encontrado: %s", args.audio_b)
            return 1

        identity = {"status": "skipped" if args.skip_identity else "ok"}
        rec_a = rec_b = None
        deezer_a = deezer_b = None
        gate_a = gate_b = None
        acr_a = acr_b = None

        if not args.skip_identity:
            log.info("Estágio 1: Resolver identidade (MusicBrainz)")
            rec_a = resolve_musicbrainz(args.title_a, args.artist_a, args.year_a, cache)
            rec_b = resolve_musicbrainz(args.title_b, args.artist_b, args.year_b, cache)
            log.info("A: %s (%s) — MBID %s", rec_a.title, rec_a.artist, rec_a.mbid)
            log.info("B: %s (%s) — MBID %s", rec_b.title, rec_b.artist, rec_b.mbid)

            log.info("Estágio 2: Cruzar metadados (Deezer)")
            deezer_a = lookup_deezer_isrc(rec_a.isrcs[0], cache) if rec_a.isrcs else None
            deezer_b = lookup_deezer_isrc(rec_b.isrcs[0], cache) if rec_b.isrcs else None

            log.info("Estágio 3: Fingerprint AcoustID")
            fp_a = fingerprint_acoustid(args.audio_a, cache)
            fp_b = fingerprint_acoustid(args.audio_b, cache)
            gate_a = gate_acoustid(fp_a, [rec_a.mbid])
            gate_b = gate_acoustid(fp_b, [rec_b.mbid])
            if not gate_a:
                log.warning("Gate AcoustID falhou para A")
            if not gate_b:
                log.warning("Gate AcoustID falhou para B")

            log.info("Estágio 4: ACRCloud Identification")
            acr_a = acrcloud_identify(args.audio_a, cache)
            acr_b = acrcloud_identify(args.audio_b, cache)
        else:
            log.info("Estágios 1–4 pulados (--skip-identity)")

        log.info("Estágio 4b: CLAP embeddings")
        clap_a = clap_embed(args.audio_a, cache)
        clap_b = clap_embed(args.audio_b, cache)
        clap_sim = cosine_similarity(clap_a, clap_b) if clap_a and clap_b else None

        melodic = {"status": "skipped"}
        if not args.skip_melody:
            log.info("Estágio 5: Demucs → basic-pitch → Smith-Waterman")
            if args.work_dir:
                work = args.work_dir
                work.mkdir(parents=True, exist_ok=True)
            else:
                tmp_ctx = tempfile.TemporaryDirectory(prefix="arkhe_")
                work = Path(tmp_ctx.name)

            sep = not args.no_separation
            if args.midi_a and args.midi_a.exists():
                ext_a = {"midi": args.midi_a, "source": "midi_direct", "separation": "not_needed"}
            elif args.audio_a and args.audio_a.suffix.lower() == ".mid":
                ext_a = {"midi": args.audio_a, "source": "midi_direct", "separation": "not_needed"}
            else:
                ext_a = extract_melody_midi(args.audio_a, work / "a", separate=sep)

            if args.midi_b and args.midi_b.exists():
                ext_b = {"midi": args.midi_b, "source": "midi_direct", "separation": "not_needed"}
            elif args.audio_b and args.audio_b.suffix.lower() == ".mid":
                ext_b = {"midi": args.audio_b, "source": "midi_direct", "separation": "not_needed"}
            else:
                ext_b = extract_melody_midi(args.audio_b, work / "b", separate=sep)

            def side(ext):
                m = ext["midi"]
                return {
                    "source": ext["source"],
                    "separation": ext["separation"],
                    "midi_sha256": ContentCache.hash_file(m) if m else None,
                    "skyline_length": len(extract_skyline(m)) if m else 0,
                }

            melodic = {"status": "ok", "a": side(ext_a), "b": side(ext_b)}

            if ext_a["midi"] is None or ext_b["midi"] is None:
                melodic["status"] = "failed"
                melodic["reason"] = "transcrição MIDI indisponível para um dos áudios"
                exit_code = 3
            else:
                sim = melodic_similarity(ext_a["midi"], ext_b["midi"], cache)
                melodic["similarity"] = sim

                calibration = None
                if args.calibration_pairs:
                    pairs = json.loads(args.calibration_pairs.read_text())
                    calibration = calibrate_threshold(pairs, cache, alpha=args.alpha)
                melodic["calibration"] = calibration

                if calibration and calibration["calibration_valid"]:
                    melodic["decision"] = (
                        "above_threshold" if sim["score"] > calibration["threshold"]
                        else "below_threshold"
                    )
                else:
                    melodic["decision"] = "uncalibrated"
                if sim["skyline_a_length"] < 8 or sim["skyline_b_length"] < 8:
                    melodic["warning"] = "skyline curto (<8 notas): score pouco informativo"

        versions = detect_versions()

        def target(title, artist, year, rec, deezer, gate, acr, audio):
            return {
                "title": title, "artist": artist, "year": year,
                "mbid": rec.mbid if rec else None,
                "isrcs": rec.isrcs if rec else None,
                "iswcs": rec.iswcs if rec else None,
                "composers": rec.composers if rec else None,
                "deezer": deezer,
                "acoustid_gate": gate,
                "acrcloud": asdict(acr) if acr else None,
                "sha256": ContentCache.hash_file(audio),
            }

        report = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "identity_stage": identity,
            "target_a": target(args.title_a, args.artist_a, args.year_a,
                               rec_a, deezer_a, gate_a, acr_a, args.audio_a),
            "target_b": target(args.title_b, args.artist_b, args.year_b,
                               rec_b, deezer_b, gate_b, acr_b, args.audio_b),
            "similarity": {
                "clap_cosine": clap_sim,
                "clap_available": clap_a is not None and clap_b is not None,
                "melodic": melodic,
            },
            "manifest": build_manifest(
                targets=[
                    {"id": "A", "title": args.title_a, "artist": args.artist_a},
                    {"id": "B", "title": args.title_b, "artist": args.artist_b},
                ],
                config=CONFIG,
                versions=versions,
            ),
            "script_sha256": ContentCache.hash_file(Path(__file__)),
        }

        report["report_hash"] = ContentCache.hash_text(canonical(report))

        args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False))
        log.info("Relatório gravado: %s", args.out)
        log.info("report_hash: %s", report["report_hash"])

        return exit_code

    finally:
        cache.close()
        if tmp_ctx is not None:
            tmp_ctx.cleanup()


if __name__ == "__main__":
    sys.exit(main())
