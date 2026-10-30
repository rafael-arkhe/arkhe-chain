"""Evaluate the real local Arkhe triage CLI against independently labelled synthetic reports."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def metrics(rows):
    counts = {name: sum(r['outcome'] == name for r in rows)
              for name in ('TP', 'TN', 'FP', 'FN', 'ERROR')}
    def ratio(a, b):
        return a / b if b else None
    positives = sum(r['expected_support'] for r in rows)
    negatives = len(rows) - positives
    return {**counts, 'total': len(rows), 'labelled_positives': positives,
            'labelled_negatives': negatives,
            'precision_completed': ratio(counts['TP'], counts['TP'] + counts['FP']),
            'recall_completed': ratio(counts['TP'], counts['TP'] + counts['FN']),
            'false_positive_rate_completed': ratio(counts['FP'], counts['FP'] + counts['TN']),
            'coverage': ratio(len(rows) - counts['ERROR'], len(rows)),
            'positive_success_all': ratio(counts['TP'], positives),
            'negative_success_all': ratio(counts['TN'], negatives)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', type=Path, default=ROOT / 'tests/evaluation/triage-known-cases.json')
    parser.add_argument('--config', type=Path, default=ROOT / 'config/ollama.json')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    dataset = json.loads(args.dataset.read_text(encoding='utf-8'))
    cases = dataset['cases']
    assert len({c['id'] for c in cases}) == len(cases)
    assert all(type(c['expected_support']) is bool for c in cases)
    binary = ROOT / ('target/debug/ollama_triage.exe' if os.name == 'nt' else 'target/debug/ollama_triage')
    config = json.loads(args.config.read_text(encoding='utf-8'))
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    # Preserve exact evaluation inputs; labels/rationales never enter the model prompt.
    (output / 'dataset.json').write_bytes(args.dataset.read_bytes())
    (output / 'config.json').write_bytes(args.config.read_bytes())
    (output / 'runner.py').write_bytes(Path(__file__).read_bytes())
    manifest = {'started_utc': datetime.now(timezone.utc).isoformat(),
                'dataset_sha256': sha(args.dataset), 'config_sha256': sha(args.config),
                'runner_sha256': sha(Path(__file__)), 'binary_sha256': sha(binary),
                'scope': 'synthetic report proposal support; legacy untrusted assessment; no gate or external writes',
                'model': config['model'], 'model_digest': config['model_digest'],
                'repetitions': 1, 'retries': 0}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    rows = []
    env = {**os.environ, 'ARKHE_OLLAMA_CONFIG': str(args.config.resolve())}
    for case in cases:
        folder = output / case['id']
        folder.mkdir()
        report = {'version': 1, 'report_id': case['id'], 'severity': case['severity'],
                  'title': case['title'], 'report_body': case['body'],
                  'submitted_at': 1, 'affected_assets': []}
        source = folder / 'report.json'
        source.write_text(json.dumps(report, indent=2), encoding='utf-8')
        command = [str(binary), str(source), case['severity'], 'Triaged']
        start = time.monotonic()
        row = {'id': case['id'], 'expected_support': case['expected_support'],
               'family': case['family'], 'rationale': case['rationale'], 'outcome': 'ERROR'}
        try:
            result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True,
                                    text=True, encoding='utf-8', timeout=config['timeout_seconds'] + 20)
            (folder / 'stdout.txt').write_text(result.stdout, encoding='utf-8')
            (folder / 'stderr.txt').write_text(result.stderr, encoding='utf-8')
            row['exit_code'] = result.returncode
            if result.returncode:
                row['error'] = result.stderr.strip()
            else:
                value = json.loads(result.stdout)
                assert value['status'] == 'UNTRUSTED_PROPOSAL'
                assert value['provider']['model_digest'] == config['model_digest']
                prediction = value['assessment']['supports_proposal']
                assert type(prediction) is bool
                row.update(predicted_support=prediction, reason=value['assessment']['reason'],
                           confidence_bps=value['assessment']['confidence_bps'])
                row['outcome'] = ('TP' if prediction else 'FN') if case['expected_support'] else ('FP' if prediction else 'TN')
        except (subprocess.TimeoutExpired, ValueError, KeyError, AssertionError) as exc:
            row['error'] = str(exc) or type(exc).__name__
        row['elapsed_seconds'] = round(time.monotonic() - start, 3)
        rows.append(row)
        (output / 'results.json').write_text(json.dumps({'metrics': metrics(rows), 'cases': rows}, indent=2), encoding='utf-8')
        print(f"{case['id']}: {row['outcome']} ({row['elapsed_seconds']}s)", flush=True)
    summary = metrics(rows)
    lines = ['# Avaliação local de triagem — casos sintéticos conhecidos', '',
             'Mede suporte a propostas High/Triaged ou Medium/Triaged a partir de relatórios.',
             'Não mede descoberta autônoma, execução de Solidity, escopo HackenProof, política aprovada ou autorização.',
             'Rótulos foram fixados antes da inferência e não enviados ao modelo. Uma execução por caso, sem retries.', '',
             '```json', json.dumps(summary, indent=2), '```', '',
             'TP/TN: suporte/rejeição corretos; FP: suporte indevido; FN: rejeição de proposta sustentada.',
             'ERROR não conta como TN nem FN; cobertura e sucesso sobre todos os rótulos expõem esses casos.',
             'Taxas completed excluem erros. Confiança do modelo não é probabilidade calibrada.', '',
             '| Caso | Esperado | Obtido | Segundos |', '|---|---|---|---|']
    lines += [f"| {r['id']} | {r['expected_support']} | {r['outcome']} | {r['elapsed_seconds']} |" for r in rows]
    lines += ['', 'Limites: conjunto pequeno, sintético e não independente do autor do harness; sem revisão externa dos rótulos,',
              'sem controle de contaminação do treinamento ou estimativa de estabilidade entre execuções.',
              'O prompt contém nonce aleatório; não se promete reprodução bit a bit.',
              'Próxima avaliação: corpus externo fixado por commit, rótulos revisados e repetições antes de novos agentes.',
              'Nenhuma mudança de prompt ou de modelo foi feita em resposta a este conjunto.']
    (output / 'RESULTS.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(json.dumps(summary), flush=True)


if __name__ == '__main__':
    main()
