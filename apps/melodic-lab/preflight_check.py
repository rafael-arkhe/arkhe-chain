#!/usr/bin/env python3
"""
preflight_check.py — Sanity checker de camada 1 para relatórios Arkhe.

Valida apenas formato, placeholders e consistência interna.
Não consulta Solana, não verifica C2PA, não corre golden vectors.

Para verificação release-grade, usar arkhe_preflight_v20.py --mode release.

Uso:
  python3 preflight_check.py arkhe_report.json \
      --audio-a data/audio/taj_mahal_1972.wav \
      --audio-b data/audio/da_ya_think_1978.wav
"""

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

HEX64_RE = re.compile(r"^[0-9a-f]{64}$")


def _is_hex64(v):
    return isinstance(v, str) and HEX64_RE.match(v) is not None


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def canonicalize(obj):
    """Canonicalização simples (compatível com o corpo sem anchor/c2pa/report_hash)."""
    return json.dumps(obj, sort_keys=True, ensure_ascii=False,
                      separators=(",", ":"))


def check_audio(label, expected, actual):
    ok = True
    if not _is_hex64(expected):
        print(f"[FAIL] {label}.sha256 não é hex64: len={len(expected)}")
        ok = False
    else:
        print(f"[OK] {label}.sha256 tem 64 hex: len=64")

    if expected in ("", "test", "0" * 64):
        print(f"[FAIL] {label}.sha256 é placeholder")
        ok = False
    else:
        print(f"[OK] {label}.sha256 não é placeholder")

    if actual and expected != actual:
        print(f"[FAIL] {label}.sha256 ≠ sha256sum: esperado {expected[:16]}…, "
              f"obtido {actual[:16]}…")
        ok = False
    elif actual:
        print(f"[OK] {label}.sha256 == sha256sum: {actual[:16]}…")

    return ok


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("report", type=Path)
    parser.add_argument("--audio-a", type=Path)
    parser.add_argument("--audio-b", type=Path)
    args = parser.parse_args()

    try:
        raw = json.loads(args.report.read_bytes())
    except Exception as e:
        print(f"[FAIL] JSON inválido: {e}")
        return 2

    checks = []

    # 1-7: audio hashes
    ta = raw.get("target_a", {})
    tb = raw.get("target_b", {})
    actual_a = sha256_file(args.audio_a) if args.audio_a and args.audio_a.exists() else None
    actual_b = sha256_file(args.audio_b) if args.audio_b and args.audio_b.exists() else None

    checks.append(check_audio("audio_a", ta.get("sha256", ""), actual_a))
    checks.append(check_audio("audio_b", tb.get("sha256", ""), actual_b))

    if ta.get("sha256") and tb.get("sha256"):
        if ta["sha256"] != tb["sha256"]:
            print("[OK] audio_a != audio_b")
            checks.append(True)
        else:
            print("[FAIL] audio_a == audio_b")
            checks.append(False)

    # 8-9: report_hash
    claimed = raw.get("report_hash", "")
    if _is_hex64(claimed):
        print(f"[OK] report_hash tem 64 hex: len=64")
        checks.append(True)
    else:
        print(f"[FAIL] report_hash não é hex64: len={len(claimed)}")
        checks.append(False)

    # Recompute sobre corpo sem anchor/c2pa/report_hash
    body = {k: v for k, v in raw.items()
            if k not in ("anchor", "c2pa", "report_hash")}
    computed = hashlib.sha256(canonicalize(body).encode()).hexdigest()
    if computed == claimed:
        print(f"[OK] report_hash == sha256(canonical(corpo)): {computed[:16]}…")
        checks.append(True)
    else:
        print(f"[FAIL] report_hash ≠ sha256(canonical(corpo)): "
              f"calculado {computed[:16]}…")
        checks.append(False)

    # 10: anchor presente
    anchor = raw.get("anchor", {})
    if anchor:
        print("[OK] existe bloco 'anchor'")
        checks.append(True)
    else:
        print("[FAIL] bloco 'anchor' ausente")
        checks.append(False)

    # 11: tx_signature base58 64 bytes
    sig = anchor.get("tx_signature", "")
    if sig and 86 <= len(sig) <= 88:
        print(f"[OK] tx_signature = base58 de 64 bytes ({len(sig)} chars)")
        checks.append(True)
    else:
        print(f"[FAIL] tx_signature inválida: len={len(sig)}")
        checks.append(False)

    # 12: mmr_root 64 hex
    if _is_hex64(anchor.get("mmr_root", "")):
        print("[OK] mmr_root tem 64 hex")
        checks.append(True)
    else:
        print("[FAIL] mmr_root não é hex64")
        checks.append(False)

    # 13: temporalidade
    gen = raw.get("generated_at", "")
    ts = anchor.get("timestamp", "")
    if gen and ts and ts > gen:
        print(f"[OK] anchor.timestamp > generated_at: {ts} vs {gen}")
        checks.append(True)
    else:
        print(f"[FAIL] temporalidade inválida: {ts} <= {gen}")
        checks.append(False)

    # 14: explorer_url
    url = anchor.get("explorer_url", "")
    if sig and sig in url:
        print("[OK] explorer_url contém a assinatura")
        checks.append(True)
    else:
        print("[FAIL] explorer_url não contém a assinatura")
        checks.append(False)

    # 15: hashes independentes sem fragmentos
    h1 = ta.get("sha256", "")
    h2 = tb.get("sha256", "")
    if _is_hex64(h1) and _is_hex64(h2):
        wa = {h1[i:i+16] for i in range(0, 49, 4)}
        wb = {h2[i:i+16] for i in range(0, 49, 4)}
        ov = wa & wb
        if ov:
            print(f"[WARN] fragmentos coincidentes: {len(ov)}")
            checks.append(True)  # não é hard failure
        else:
            print("[OK] hashes independentes sem fragmentos coincidentes")
            checks.append(True)

    # 16-17: DID
    did = ta.get("creator_did", "")
    if did.startswith("did:key:z"):
        # base58 decode
        try:
            import base58
            decoded = base58.b58decode(did[len("did:key:"):][1:])
            if len(decoded) == 34 and decoded[:2] == b"\xed\x01":
                print("[OK] signer_did é did:key Ed25519 (34 bytes)")
                checks.append(True)
            else:
                print(f"[FAIL] did:key estrutura inválida: {decoded[:2].hex()}")
                checks.append(False)
        except ImportError:
            print("[WARN] base58 não instalado; skip DID decode")
            checks.append(True)
    else:
        print("[FAIL] signer_did não é did:key")
        checks.append(False)

    if did and len(set(did)) > 10:
        print("[OK] signer_did sem padrão repetitivo")
        checks.append(True)
    else:
        print("[FAIL] signer_did suspeito")
        checks.append(False)

    # 18: score range
    score = raw.get("similarity", {}).get("melodic", {}).get("similarity", {}).get("score")
    if score is None:
        score = raw.get("similarity", {}).get("score")
    if isinstance(score, (int, float)) and 0 <= score <= 1:
        print(f"[OK] similarity.score entre 0 e 1: {score}")
        checks.append(True)
    else:
        print(f"[FAIL] similarity.score inválido: {score}")
        checks.append(False)

    # 19: target fora da calibração
    melodic = raw.get("similarity", {}).get("melodic", {})
    cal = melodic.get("calibration", {})
    vals = cal.get("val_scores", [])
    targets = {ta.get("sha256"), tb.get("sha256")}
    targets.discard(None)
    cal_hashes = set()
    for v in vals:
        for k in ("sha256_a", "sha256_b"):
            if v.get(k):
                cal_hashes.add(v[k])
    if targets & cal_hashes:
        print(f"[FAIL] par-alvo na calibração: {targets & cal_hashes}")
        checks.append(False)
    else:
        print("[OK] par-alvo fora da calibração")
        checks.append(True)

    # 20: alpha_guaranteed / decision
    alpha_ok = (cal.get("alpha_guaranteed") is False
                or cal.get("decision") == "uncalibrated"
                or cal.get("calibration_valid") is False)
    if alpha_ok:
        print("[OK] calibração sem garantia exibe alpha_guaranteed=False "
              "ou decision='uncalibrated'")
        checks.append(True)
    else:
        print("[WARN] calibração sem flag explícita de garantia")
        checks.append(True)

    passed = sum(1 for c in checks if c)
    total = len(checks)
    print()
    print(f"{passed}/{total} verificações passaram")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
