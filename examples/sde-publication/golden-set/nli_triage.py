"""Separate semantic triage pilot. Does not modify ai-output-panel or execute tools."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import time

ROOT = Path(__file__).resolve().parent

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def sentence_claims(text):
    # Preserve literal spans. Do not silently paraphrase or claim exhaustive atomization.
    return [span.strip() for span in re.split(r'(?<=[.!?])\s+(?=[A-Z])|\n+', text) if span.strip()]

def windows(text, size, stride):
    words = text.split()
    for start in range(0, len(words), stride):
        yield start, ' '.join(words[start:start + size])
        if start + size >= len(words): break

def triage(base, claims, policy):
    if base['reason'] == 'rule_judge_failed': return 'DENY', 'structural_rule_failure'
    if not claims or any(c.get('status') != 'MEASURED' for c in claims):
        return 'REQUIRE_APPROVAL', 'verifier_unavailable_or_invalid'
    if any(c['max_contradiction'] >= policy['contradiction_threshold'] for c in claims):
        return 'REQUIRE_APPROVAL', 'nli_contradiction'
    if base['decision'] in ('ALLOW', 'ALLOW_WITH_LOGGING') and any(
        c['max_entailment'] < policy['entailment_threshold'] for c in claims):
        return 'REQUIRE_APPROVAL', 'acceptance_without_entailment'
    return base['decision'], 'base_panel'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-run', type=Path, default=ROOT / 'runs/wixqa-local-cpu-v4')
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'runs/wixqa-nli-v5')
    args = parser.parse_args()
    policy_path = ROOT / 'v5-policy.json'; policy = json.loads(policy_path.read_text())
    candidates = [json.loads(line) for line in (args.source_run / 'candidates.jsonl').read_text().splitlines()]
    scores = [json.loads(line) for line in (args.source_run / 'measured-judges.jsonl').read_text().splitlines()]
    latest = {row['id']: row for row in scores if row['judge_response_status'] == 'VALID'}
    args.output_dir.mkdir(parents=True, exist_ok=True)
    manifest = {'started_at': datetime.now(timezone.utc).isoformat(), 'status': 'RUNNING',
        'policy': policy, 'policy_sha256': sha(policy_path), 'runner_sha256': sha(Path(__file__)),
        'candidates_sha256': sha(args.source_run / 'candidates.jsonl'),
        'measured_judges_sha256': sha(args.source_run / 'measured-judges.jsonl'),
        'human_labels_status': 'NOT_ANNOTATED', 'calibration_status': 'PENDING'}
    model_dir = ROOT / 'models/nli-deberta-v3-base'
    try:
        import torch
        import transformers
        from transformers import AutoModelForSequenceClassification, AutoTokenizer
        download = json.loads((model_dir / 'download-manifest.json').read_text())
        if download['revision'] != policy['nli_model']['revision']: raise ValueError('Unexpected model revision')
        for entry in download['files']:
            if sha(model_dir / entry['file']) != entry['sha256']: raise ValueError('Model hash mismatch')
        torch.set_num_threads(4)
        tokenizer = AutoTokenizer.from_pretrained(model_dir, local_files_only=True, trust_remote_code=False)
        model = AutoModelForSequenceClassification.from_pretrained(model_dir, local_files_only=True,
            trust_remote_code=False, use_safetensors=True).to('cpu').eval()
        labels = [model.config.id2label[i] for i in range(3)]
        if labels != policy['nli_model']['labels']: raise ValueError('Unexpected label ordering')
        manifest.update({'model_files': download, 'torch_version': torch.__version__,
            'transformers_version': transformers.__version__, 'device': 'cpu'})
        probes = [('A person is eating pizza.', 'Someone is eating.', 'entailment'),
            ('A person is eating pizza.', 'Nobody is eating.', 'contradiction'),
            ('A person is eating pizza.', 'The food costs ten dollars.', 'neutral')]
        encoded = tokenizer([p[0] for p in probes], [p[1] for p in probes], padding=True, return_tensors='pt')
        with torch.inference_mode(): probe_scores = model(**encoded).logits.softmax(dim=-1).tolist()
        manifest['synthetic_label_order_probes'] = [{'premise': p[0], 'hypothesis': p[1],
            'expected': p[2], 'predicted': labels[max(range(3), key=lambda i: probabilities[i])],
            'probabilities': dict(zip(labels, probabilities))} for p, probabilities in zip(probes, probe_scores)]
        model_error = None
    except Exception as exc:
        model_error = {'type': type(exc).__name__, 'message': str(exc)}
        manifest['model_error'] = model_error
    manifest_path = args.output_dir / 'run-manifest.json'
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    output = args.output_dir / 'triage.jsonl'
    if output.exists(): raise ValueError('Refusing to overwrite an existing semantic run; use another output-dir')
    for candidate in candidates:
        if candidate['id'] not in latest: raise ValueError('Missing base evaluation')
        started = time.monotonic(); base = latest[candidate['id']]['aggregation']
        text = candidate.get('structured_output', {}).get('answer', candidate['candidate'])
        selected = set(candidate.get('structured_output', {}).get('citations', []))
        context = [r for r in candidate['retrieved'] if r['article_id'] in selected]
        claims = []
        for index, claim in enumerate(sentence_claims(text)):
            result = {'id': index + 1, 'text': claim, 'status': 'UNAVAILABLE', 'pairs': []}
            if not model_error:
                for article in context:
                    for offset, premise in windows(article['text'], policy['premises']['window_words'], policy['premises']['stride_words']):
                        encoded = tokenizer(premise, claim, truncation=False, return_tensors='pt')
                        if encoded['input_ids'].shape[1] > policy['premises']['maximum_pair_tokens']:
                            result['pairs'].append({'article_id': article['article_id'], 'status': 'TRUNCATION_REQUIRED'})
                            continue
                        with torch.inference_mode(): probabilities = model(**encoded).logits.softmax(dim=-1)[0].tolist()
                        result['pairs'].append({'article_id': article['article_id'], 'word_offset': offset,
                            'premise': premise, 'status': 'MEASURED',
                            'probabilities': dict(zip(labels, probabilities))})
                if result['pairs'] and all(pair['status'] == 'MEASURED' for pair in result['pairs']):
                    result['status'] = 'MEASURED'
                    result['max_contradiction'] = max(p['probabilities']['contradiction'] for p in result['pairs'])
                    result['max_entailment'] = max(p['probabilities']['entailment'] for p in result['pairs'])
            claims.append(result)
        decision, reason = triage(base, claims, policy)
        record = {'id': candidate['id'], 'policy_id': policy['id'], 'policy_version': policy['version'],
            'base_panel': base, 'nli_model': policy['nli_model'], 'heterogeneous_verifier': True,
            'error_independence_established': False, 'claims': claims, 'decision': decision, 'reason': reason,
            'calibration_status': 'PENDING', 'human_labels_status': 'NOT_ANNOTATED',
            'model_error': model_error, 'duration_seconds': time.monotonic() - started}
        with output.open('a', encoding='utf-8') as handle: handle.write(json.dumps(record) + '\n')
        print(json.dumps({'id': candidate['id'], 'decision': decision, 'reason': reason,
            'claim_count': len(claims), 'max_contradiction': max((c.get('max_contradiction', 0) for c in claims), default=None)}), flush=True)
    manifest.update({'status': 'COMPLETE' if not model_error else 'VERIFIER_UNAVAILABLE',
        'triage_sha256': sha(output), 'completed_at': datetime.now(timezone.utc).isoformat()})
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')

if __name__ == '__main__': main()
