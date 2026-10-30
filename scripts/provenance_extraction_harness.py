"""Four distinct experimental stages; no fixture/oracle/policy promotion.

Extraction: actual pinned GLiNER on source text.
Support: narrow identified rule evaluator, not an extractor score mapping.
Comparison: agreement with provisional author labels, never independent accuracy.
Integration: retained control plus UNTRUSTED evaluator rejection and pure-policy
simulation. No evaluator is signed or relabeled as the accepted fixture human.
"""
from copy import deepcopy
import argparse
import hashlib
from importlib.metadata import version
import json
import os
from pathlib import Path
import re

from compare_provenance_broker import host_input
from provenance_broker_decision import decide, digest
from provenance_broker_host import FrozenHost, HostVerificationError

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT/'tests/provenance-broker/v3.1'
EXPERIMENT = ROOT/'tests/provenance-broker/extraction-harness'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def artifact_bytes(obj):
    # Experimental artifacts allow raw, uncalibrated finite model scores.
    # This is not the broker's integer-only canonical profile.
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def artifact_ref(stage, obj):
    return hashlib.sha256(('ARKHE:EXPERIMENT:'+stage+':v1\0').encode()+artifact_bytes(obj)).hexdigest()


def save(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2, allow_nan=False)+'\n', encoding='utf-8')


def check_spans(raw, text):
    checks = []
    def walk(value, path):
        if isinstance(value, dict):
            if all(k in value for k in ('start', 'end', 'text')):
                a, b = value['start'], value['end']
                valid = (type(a) is int and type(b) is int and 0 <= a <= b <= len(text)
                         and text[a:b] == value['text'])
                checks.append({'path': path, 'character_start': a, 'character_end': b,
                    'valid': valid, 'byte_start': len(text[:a].encode()) if valid else None,
                    'byte_end': len(text[:b].encode()) if valid else None})
            for k, child in value.items():
                walk(child, path+'/'+k)
        elif isinstance(value, list):
            for i, child in enumerate(value):
                walk(child, path+'/'+str(i))
    walk(raw, '')
    return checks


def extraction_stage(model, schema, text, config, metadata):
    if len(text.encode()) > config['max_text_bytes']:
        raise ValueError('text exceeds configured extraction limit; no truncation allowed')
    # Match this pinned implementation's actual pre-schema word splitter. Its
    # max_len truncates these word tokens, not Python whitespace-separated words.
    word_count = sum(1 for _ in model.processor.word_splitter(text, lower=True))
    if word_count > config['max_len']:
        raise ValueError('word-token limit would truncate the source')
    raw = model.extract(text, schema, threshold=config['threshold'], include_spans=True,
                        include_confidence=True, max_len=config['max_len'])
    return {'stage': 'Extraction', 'extractor': metadata, 'source_utf8_sha256': hashlib.sha256(text.encode()).hexdigest(),
        'source_bytes': len(text.encode()), 'word_tokens': word_count, 'truncated': False,
        'raw': raw, 'span_checks': check_spans(raw, text),
        'qualifier_scope': 'document-level classification; not assigned automatically to each predicate',
        'score_calibrated': False}


MIGRATION = re.compile(r'\batlas\s+(não\s+)?(migrou|poderá migrar)\s+para\s+postgresql\s+16\b', re.I)
CORRECTION = re.compile(r'correção de (\d{2}/\d{2}): o relato de (\d{2}/\d{2}) estava errado;', re.I)


def support_stage(claim, chunks, extraction_artifacts, evaluator):
    result = {'stage': 'SupportEvaluation', 'evaluator': evaluator,
        'claim_digest': digest('CLAIM', claim),
        'support_refs': sorted(c['record_hash'] for c in chunks),
        'extraction_refs': [artifact_ref('EXTRACTION', a) for a in extraction_artifacts],
        'semantic_outcome': 'NotEvaluated', 'reason': 'UNSUPPORTED_PREDICATE', 'evidence': []}
    if any(not check['valid'] for a in extraction_artifacts for check in a['span_checks']):
        result['reason'] = 'INVALID_EXTRACTED_SPAN'
        return result
    if (claim['subject'], claim['predicate'], claim['object']) != ('service:atlas', 'migrated_to', 'database:postgresql-16'):
        return result
    facts = []
    for c in chunks:
        text = bytes.fromhex(c['bytes_hex']).decode('utf-8')
        correction = CORRECTION.search(text)
        is_linked_correction = bool(correction and any(
            ('relato de '+correction.group(2)).casefold() in bytes.fromhex(prior['bytes_hex']).decode().casefold()
            for prior in chunks if prior['chunk_id'] != c['chunk_id']))
        for match in MIGRATION.finditer(text):
            facts.append({'chunk_id': c['chunk_id'], 'polarity': 'Negative' if match.group(1) else 'Positive',
                'modality': 'Possible' if match.group(2).casefold().startswith('poderá') else 'Asserted',
                'byte_start': len(text[:match.start()].encode()), 'byte_end': len(text[:match.end()].encode()),
                'explicit_linked_correction': is_linked_correction})
    result['evidence'] = facts
    if not facts:
        result.update(semantic_outcome='Indeterminate', reason='NO_LITERAL_SUPPORT')
        return result
    corrected = [f for f in facts if f['explicit_linked_correction']]
    active = corrected if corrected else facts
    judgments = {(f['polarity'], f['modality']) for f in active}
    if len(judgments) != 1:
        result.update(semantic_outcome='Indeterminate', reason='CONFLICT_WITHOUT_RESOLVED_CORRECTION')
    else:
        polarity, modality = next(iter(judgments))
        if modality != claim['modality']:
            result.update(semantic_outcome='Indeterminate', reason='MODALITY_MISMATCH')
        elif polarity != claim['polarity']:
            result.update(semantic_outcome='Contradicted', reason='POLARITY_MISMATCH')
        else:
            result.update(semantic_outcome='Supported', reason='LITERAL_GRAMMAR_SUPPORT')
    return result


def provisional_extraction_reference(text):
    # Authored literal-span reference, not human-reviewed gold annotations.
    mentions = [('service', 'Atlas'), ('database', 'PostgreSQL 16'), ('organization', 'Aurora'),
                ('person', 'Alice'), ('organization', 'Acme')]
    entities = set()
    for label, literal in mentions:
        for match in re.finditer(re.escape(literal), text):
            entities.add((label, match.start(), match.end()))
    polarity = 'negated statement' if re.search(r'\bnão migrou\b', text, re.I) else 'affirmative statement'
    modality = 'possibility' if re.search(r'\bpoderá migrar\b', text, re.I) else 'factual assertion'
    return entities, polarity, modality


def extraction_comparison(extractions, text_by_hash):
    tp = fp = fn = 0
    qualifier_matches = {'polarity': 0, 'modality': 0}
    disagreements = []
    for a in extractions:
        text = text_by_hash[a['source_utf8_sha256']]
        expected, pol, mod = provisional_extraction_reference(text)
        observed = set()
        for label, values in a['raw'].get('entities', {}).items():
            for value in values:
                if isinstance(value, dict) and all(k in value for k in ('start', 'end')):
                    observed.add((label, value['start'], value['end']))
        tp += len(expected & observed)
        fp += len(observed-expected)
        fn += len(expected-observed)
        labels = {}
        for key, target in [('polarity', pol), ('modality', mod)]:
            value = a['raw'].get(key)
            labels[key] = value.get('label') if isinstance(value, dict) else value
            qualifier_matches[key] += labels[key] == target
        if observed != expected or labels != {'polarity': pol, 'modality': mod}:
            disagreements.append({'source_sha256': a['source_utf8_sha256'],
                'missing_entities': sorted(expected-observed), 'extra_entities': sorted(observed-expected),
                'qualifiers_expected': {'polarity': pol, 'modality': mod}, 'qualifiers_observed': labels})
    precision = tp/(tp+fp) if tp+fp else 0.0
    recall = tp/(tp+fn) if tp+fn else 0.0
    return {'reference_status': 'provisional authored literal spans; independent review pending',
        'sources': len(extractions), 'entity_exact_span_tp': tp, 'fp': fp, 'fn': fn,
        'precision': precision, 'recall': recall, 'f1': 2*precision*recall/(precision+recall) if precision+recall else 0.0,
        'qualifier_matches': qualifier_matches, 'disagreements': disagreements,
        'predicate_quality': 'not scored: no independently reviewed relation annotations'}


def integration_stage(fixture, evaluation, extraction_artifacts, profile):
    data = host_input(fixture)
    control = FrozenHost(data, profile).evaluate_and_release(data['candidate'])
    sem = {'claim_digest': evaluation['claim_digest'], 'support_set_digest': digest('SUPPORT', evaluation['support_refs']),
        'outcome': evaluation['semantic_outcome'], 'method': 'Rule', 'evaluator': evaluation['evaluator']['id'],
        'evaluator_version': evaluation['evaluator']['version'], 'support_refs': evaluation['support_refs']}
    # Explicitly unsigned experimental evaluator; never forge fixture authority.
    data['observations']['semantic'] = {'key_id': 'experimental-rule-unsigned', 'body': sem, 'signature_hex': ''}
    try:
        FrozenHost(data, profile).evaluate_and_release(data['candidate'])
        ingestion = {'status': 'UnexpectedAcceptance'}
    except HostVerificationError:
        ingestion = {'status': 'Blocked', 'reason': 'EVALUATOR_NOT_TRUSTED', 'agent_payload': {'chunks': []}}
    simulation = decide(data)
    oracle = fixture['expected_output']
    return {'stage': 'Integration', 'fixture_id': fixture['fixture_id'],
        'extraction_refs': [artifact_ref('EXTRACTION', a) for a in extraction_artifacts],
        'evaluation_ref': artifact_ref('SUPPORT', evaluation),
        'retained_control_decision': control['host_audit']['decision'],
        'retained_control_payload_match': control['host_audit']['released_payload'] == oracle['released_payload'],
        'experimental_ingestion': ingestion,
        'pure_policy_simulation_only': True, 'simulation': simulation,
        'simulation_decision_matches_authored_oracle': simulation['decision'] == oracle['decision'],
        'simulation_payload_matches_authored_oracle': simulation['released_payload'] == oracle['released_payload'],
        'policy_unchanged': True, 'authenticated_experimental_integration': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-dir', type=Path, default=ROOT/'ops/local/provenance-harness-models/gliner2.5-multi-v1')
    parser.add_argument('--output', type=Path, default=EXPERIMENT/'runs/gliner2.5-multi-rule-pt-v1')
    args = parser.parse_args()
    config = read(EXPERIMENT/'config.json')
    for name in ('HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE', 'HF_HUB_DISABLE_TELEMETRY'):
        os.environ[name] = '1'
    model_paths = [p for p in args.model_dir.rglob('*') if p.is_file() and '.cache' not in p.parts]
    for path in model_paths:
        metadata_file = args.model_dir/'.cache/huggingface/download'/Path(str(path.relative_to(args.model_dir))+'.metadata')
        if not metadata_file.is_file() or metadata_file.read_text().splitlines()[0] != config['model_revision']:
            raise ValueError('local model revision provenance missing or mismatched: '+str(path))
    if not model_paths:
        raise ValueError('local model snapshot absent')
    import torch
    from gliner2 import AutoExtractor
    torch.manual_seed(config['seed'])
    torch.set_num_threads(config['threads'])
    print('Loading pinned local checkpoint...', flush=True)
    model = AutoExtractor.from_pretrained(str(args.model_dir), map_location=config['device'])
    model.eval()
    schema = (model.create_schema().entities(config['entity_labels']).relations(config['predicate_labels'])
        .classification('polarity', config['polarity_labels']).classification('modality', config['modality_labels']))
    model_files = {p.relative_to(args.model_dir).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                   for p in model_paths}
    metadata = {'id': config['model_id'], 'revision': config['model_revision'], 'library_version': version('gliner2'),
        'torch': version('torch'), 'transformers': version('transformers'),
        'config_ref': artifact_ref('CONFIG', config), 'checkpoint_file_hashes': model_files}
    paths = sorted((BASE/'extensions-v2/fixtures').glob('*.json'))
    fixtures = [read(p) for p in paths if not p.stem.startswith('V2-LIMIT-')]
    fixtures.insert(0, read(BASE/'fixtures/P-02.json'))
    # The synthetic profiles share key pins; retain each policy unchanged.
    profiles = {v: read(ROOT/f'schemas/provenance-broker/profile-{v}.json') for v in ('v1', 'v2')}
    extracted = {}
    text_by_hash = {}
    support_outputs = []
    integrations = []
    confusion = {}
    disagreements = []
    agreements = 0
    for fixture in fixtures:
        artifacts = []
        for chunk in fixture['chunks']:
            text = bytes.fromhex(chunk['bytes_hex']).decode()
            sha = hashlib.sha256(text.encode()).hexdigest()
            text_by_hash[sha] = text
            if sha not in extracted:
                print('Extracting source '+sha[:12]+'...', flush=True)
                with torch.inference_mode():
                    artifact = extraction_stage(model, schema, text, config, metadata)
                extracted[sha] = artifact
                save(args.output/'extraction'/(sha+'.json'), artifact)
            artifacts.append(extracted[sha])
        evaluation = support_stage(fixture['candidate']['claim'], fixture['chunks'], artifacts, config['support_evaluator'])
        save(args.output/'support'/(fixture['fixture_id']+'.json'), evaluation)
        support_outputs.append(evaluation)
        expected = fixture['observations']['semantic']['body']['outcome']
        observed = evaluation['semantic_outcome']
        confusion[expected+'->'+observed] = confusion.get(expected+'->'+observed, 0)+1
        agreements += expected == observed
        if expected != observed:
            disagreements.append({'fixture_id': fixture['fixture_id'], 'expected_provisional': expected,
                'observed': observed, 'reason': evaluation['reason']})
        profile = profiles['v2' if fixture['profile_id'].endswith('v2') else 'v1']
        integration = integration_stage(fixture, evaluation, artifacts, profile)
        if integration['experimental_ingestion']['status'] != 'Blocked':
            raise AssertionError('experimental evaluator unexpectedly trusted')
        integrations.append(integration)
        save(args.output/'integration'/(fixture['fixture_id']+'.json'), integration)
    report = {'experiment_id': config['experiment_id'], 'status': 'executed', 'model': metadata,
        'config': config, 'fixture_count': len(fixtures), 'unique_sources': len(extracted),
        'skipped': ['V2-LIMIT-* structural byte-limit tests; no silent truncation'],
        'extraction_comparison': extraction_comparison(list(extracted.values()), text_by_hash),
        'support_comparison': {'metric': 'agreement with provisional authored labels, not independently established accuracy',
            'agreements': agreements, 'count': len(fixtures), 'fraction': agreements/len(fixtures),
            'confusion': confusion, 'disagreements': disagreements},
        'integration': {'authenticated_experimental_ingestion': False,
            'blocked_untrusted_evaluators': len(integrations),
            'simulation_decision_matches': sum(i['simulation_decision_matches_authored_oracle'] for i in integrations),
            'simulation_payload_matches': sum(i['simulation_payload_matches_authored_oracle'] for i in integrations),
            'policy_promoted': False},
        'independent_review': 'pending', 'reserved_corpus': False,
        'hf_offline_flags_enabled': True, 'network_isolation_verified': False,
        'limitations': ['same author and known corpus', 'rule evaluator limited to Atlas migration grammar',
            'no automatic relation-level qualifier binding', 'no live services', 'experimental evaluator not trusted by broker policy'],
        'fixture_hashes': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in paths+[BASE/'fixtures/P-02.json'] if not p.stem.startswith('V2-LIMIT-')},
        'source_code_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    save(args.output/'report.json', report)
    print(json.dumps({'fixtures': len(fixtures), 'unique_sources': len(extracted),
        'support_agreement': report['support_comparison']['fraction'],
        'experimental_ingestion': 'blocked; policy not promoted', 'report': str(args.output/'report.json')}), flush=True)


if __name__ == '__main__':
    main()
