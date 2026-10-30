"""Prepare or verify a human review package without changing historical run artifacts."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / 'docs/evidence/local/2026-10-17/triage-evaluation/run-01'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def verify(run, package):
    manifest = load(package / 'package-manifest.json')
    for name, digest in manifest['source_sha256'].items():
        assert sha(run / name) == digest, f'Historical source changed: {name}'
    for name, digest in manifest['package_sha256'].items():
        assert sha(package / name) == digest, f'Package changed: {name}'
    cases = load(package / 'dataset.json')['cases']
    sealed = load(package / 'labels-sealed.json')['cases']
    original = {c['id']: c for c in load(run / 'dataset.json')['cases']}
    assert len(cases) == len(sealed) == len(original) == 12
    assert len({c['id'] for c in cases}) == 12
    for case, label in zip(cases, sealed):
        assert set(case) == {'id', 'title', 'severity', 'body'}
        assert case['id'] == label['id']
        source = original[label['source_id']]
        assert case['body'] == source['body'] and case['severity'] == source['severity']
        assert label['expected_support'] is source['expected_support']
    stdout = load(run / 'origin-corrected/stdout.txt')
    assert (package / 'origin-corrected-blind/analysis.txt').read_text(encoding='utf-8') == stdout['assessment']['reason'] + '\n'
    assert (package / 'origin-corrected-blind/stdout-raw.json').read_bytes() == (run / 'origin-corrected/stdout.txt').read_bytes()
    print('PASS: 12 cases; labels separated; source bodies/severities, analysis, stdout and SHA-256 verified')


def prepare(run, package):
    if package.exists():
        raise SystemExit('Package already exists; use --verify. Historical/review artifacts are never overwritten.')
    original = load(run / 'dataset.json')
    cases = original['cases']
    assert len(cases) == 12 and len({c['id'] for c in cases}) == 12
    assert all(type(c['expected_support']) is bool for c in cases)
    historical = load(run / 'manifest.json')
    assert historical['dataset_sha256'] == sha(run / 'dataset.json')
    assert historical['config_sha256'] == sha(run / 'config.json')
    assert historical['runner_sha256'] == sha(run / 'runner.py')
    ordered = sorted(cases, key=lambda c: hashlib.sha256(('arkhe-review-v1:' + c['id']).encode()).hexdigest())
    dataset, labels = [], []
    for i, case in enumerate(ordered, 1):
        case_id = f'case-{i:02d}'
        # Original IDs, family, titles and rationales can leak expected classes.
        dataset.append({'id': case_id, 'title': f'Relatório {case_id}', 'severity': case['severity'], 'body': case['body']})
        labels.append({'id': case_id, 'source_id': case['id'], 'source_title': case['title'], 'family': case['family'], 'expected_support': case['expected_support'], 'rationale': case['rationale']})
    output_bytes = (run / 'origin-corrected/stdout.txt').read_bytes()
    stdout = json.loads(output_bytes)
    assert isinstance(stdout['assessment']['reason'], str)
    package.mkdir()
    blind = package / 'origin-corrected-blind'
    blind.mkdir()
    write(package / 'dataset.json', {'version': 1, 'task': 'Does the report support its proposed severity and Triaged state?', 'proposed_state': 'Triaged', 'cases': dataset})
    write(package / 'labels-sealed.json', {'notice': 'Open only after committing all reviewer labels. Procedural seal, not encryption.', 'source_dataset_sha256': sha(run / 'dataset.json'), 'cases': labels})
    (blind / 'analysis.txt').write_text(stdout['assessment']['reason'] + '\n', encoding='utf-8')
    (blind / 'stdout-raw.json').write_bytes(output_bytes)
    write(blind / 'decision-sealed.json', {'notice': 'Open only after committing the analysis-only verdict.', 'artifact_type': 'historical CLI normalized assessment, not raw provider response', 'assessment': stdout['assessment'], 'historical_result': next(c for c in load(run / 'results.json')['cases'] if c['id'] == 'origin-corrected'), 'source_stdout_sha256': sha(run / 'origin-corrected/stdout.txt')})
    write(package / 'escalation-policy.json', {'status': 'NOT_RECORDED_IN_RUN_01', 'active_policy': None, 'reason': 'The retained run manifest/config/runner do not identify a versioned escalation policy. No policy is reconstructed as historically active.', 'observed_scope': historical['scope'], 'prospective_policy_is_not_historical': True, 'source_runner_sha256': sha(run / 'runner.py'), 'source_config_sha256': sha(run / 'config.json')})
    write(package / 'review-template.json', {
        'status': 'PENDING_HUMAN_REVIEW',
        'reviewer': {'did': 'admin', 'role': 'label-reviewer', 'format_conforms_to_did_scheme': False, 'is_independent_of_operator': False, 'independence_basis': 'Conservative operator-level assumption from supplied instructions; reviewer must confirm.', 'reviewed_at': None},
        'artifacts_reviewed': {'dataset_sha256': sha(package / 'dataset.json'), 'labels_sha256': sha(package / 'labels-sealed.json'), 'origin_corrected_analysis_sha256': sha(blind / 'analysis.txt')},
        'prior_exposure_declared': None,
        'blind_review_eligible': None,
        'labels': {'reviewer_labels': [{'id': c['id'], 'support_proposal': None, 'reasoning': ''} for c in dataset], 'labels_committed_at': None, 'labels_unsealed_at': None, 'agreements': None, 'disagreements': []},
        'origin_corrected': {'analysis_supports_proposal': None, 'analysis_verdict_committed_at': None, 'decision_unsealed_at': None, 'reviewer_verdict': None, 'allowed_verdicts': ['FP', 'TN', 'label_wrong', 'inconclusive'], 'reasoning': '', 'contradiction_confirmed': None},
        'result_label': 'PENDING_OPERATOR_REVIEW', 'result_label_after_completed_operator_review': 'REVIEWED_BY_OPERATOR', 'signature': None})
    (package / 'README.md').write_text(README, encoding='utf-8')
    source_names = ['manifest.json', 'results.json', 'dataset.json', 'config.json', 'runner.py', 'origin-corrected/stdout.txt']
    write(package / 'package-manifest.json', {'version': 1, 'status': 'PREPARED_NOT_REVIEWED', 'prepared_by': 'Codex (package preparation only; no human verdict or signature)', 'source_sha256': {name: sha(run / name) for name in source_names}, 'package_sha256': {p.relative_to(package).as_posix(): sha(p) for p in sorted(package.rglob('*')) if p.is_file()}})
    verify(run, package)


README = '''# Pacote de revisão de run-01

> Não ajustes os rótulos para coincidir com o modelo. Se discordares, discorda.

Status: PREPARED_NOT_REVIEWED. Nenhum veredicto, concordância ou assinatura humana
foi produzido pelo assistente. Copie review-template.json para review.json ao
iniciar sua revisão; preserve o template e os artefatos originais.

## Antes de começar

Revisor previsto: admin, placeholder não conforme did:arkhe:employee:<base58>.
Independência assumida conservadoramente como false, a confirmar pelo revisor.
profile.json continua REQUIRES-OPERATOR-IDENTITY; preparar este pacote não aprova
política nem promove identidade. Revisão de operador concluída recebe
REVIEWED_BY_OPERATOR; revisão independente continua pendente.

Declare exposição prévia antes de abrir os arquivos. Quem já conhece os rótulos,
as previsões ou a discussão de origin-corrected não pode declarar revisão cega
deste caso. O anexo fornecido já discute o resultado: ordem de leitura não apaga
esse conhecimento. Uma nova pessoa sem exposição pode seguir o protocolo abaixo.

## Protocolo de leitura em cinco passos

1. Leia somente dataset.json. Os 12 IDs são opacos, títulos foram neutralizados,
   e family, rationale e expected_support foram removidos. Corpos e severidades
   foram preservados; as evidências semânticas do próprio relatório permanecem.
2. Preencha support_proposal true/false e justificativa para todos os casos no
   seu review.json. Salve, registre horário e hash antes de revelar os rótulos.
3. Abra labels-sealed.json, compare e registre concordâncias/discordâncias sem
   alterar retrospectivamente seus rótulos. O mapa para IDs históricos está ali.
4. Leia apenas origin-corrected-blind/analysis.txt e registre se o texto sustenta
   a proposta, com justificativa e horário, antes de abrir a decisão agregada.
5. Abra decision-sealed.json e então stdout-raw.json; compare texto, decisão e
   rótulo histórico. Registre o veredicto e se a contradição se confirma.

Os selos são procedimentais: arquivos em texto aberto, sem criptografia ou
controle de acesso. stdout-raw.json também revela a decisão e deve ficar fechado
até o passo 5. É cópia byte a byte do stdout completo preservado da CLI; o run não
reteve uma resposta HTTP bruta do provedor. analysis.txt é assessment.reason sem
reescrita; a própria análise pode expressar semanticamente uma conclusão.

## Comparação e métricas

support_proposal é a resposta do revisor; expected_support é o rótulo histórico;
supports_proposal é a previsão do modelo. Não os confunda. TP/TN/FP/FN exigem
comparar previsão e referência: referência false + previsão true = FP. Dizer que
o modelo deveria rejeitar não transforma essa previsão positiva em TN.
Se o rótulo original estiver errado, registre label_wrong e a correção proposta;
nunca sobrescreva run-01. Qualquer recálculo deve gerar novo artefato vinculado
aos hashes originais. Sem veredicto humano, métricas históricas ficam preservadas.

escalation-policy.json registra NOT_RECORDED_IN_RUN_01: não foi encontrada uma
política versionada ativa nos artefatos retidos. O plano prospectivo run-02 não
é aplicado retroativamente. Não há inferência nova, ratificação ou escrita externa.

## Integridade

package-manifest.json vincula SHA-256 das fontes e de cada arquivo preparado.
O manifesto não é assinatura nem timestamp independente. Para verificar:

```powershell
python scripts/prepare_triage_review.py --verify
```
'''


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    package = RUN / 'review-package'
    if args.verify:
        verify(RUN, package)
    else:
        prepare(RUN, package)
