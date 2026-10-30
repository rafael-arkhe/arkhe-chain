"""Build the editorial sample with Pandoc and inspect basic EPUB structure."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import subprocess
import xml.etree.ElementTree as ET
import zipfile
import posixpath

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent.parent
SOURCE = BASE / 'manuscrito/07-do-resultado-a-autorizacao.md'
INPUTS = [
    'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml',
    'kernel/arkhe-kernel/examples/budget_pco.rs',
    'kernel/arkhe-kernel/src/lib.rs',
    'kernel/arkhe-kernel/tests/budget_pco.rs',
    'kernel/arkhe-kernel/tests/rejection_gates.rs',
    'kernel/arkhe-core/src/work.rs', 'kernel/arkhe-core/src/worker.rs',
    'kernel/arkhe-core/src/output_proof.rs',
    'cognition/arkhe-agent/src/budget_pco.rs',
    'verification/crates/arkhe-verify-core/src/output_proof.rs',
    'docs/PROOF-CARRYING-BUDGET.md', 'docs/MMR-PROFILE.md',
    'integration/arkhe-depin/README.md',
    'agi-coder/crates/agi-coder-cost/src/lib.rs',
    'verification/crates/arkhe-verify-wasm/src/lib.rs',
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lang', choices=['pt-BR', 'en-US'], default='pt-BR')
    parser.add_argument('--section', choices=['sample', 'part-i', 'part-ii', 'part-iii', 'part-iv', 'part-v'], default='sample')
    args = parser.parse_args()
    if args.section != 'sample' and args.lang != 'en-US':
        parser.error('Book parts are currently available only with --lang en-US.')
    english = args.lang == 'en-US'
    source = BASE / 'manuscrito/07-from-output-to-authorization.en.md' if english else SOURCE
    stem = 'arkhe-sample-en' if english else 'arkhe-amostra'
    suffix = '-en' if english else ''
    if args.section == 'part-i':
        source = BASE / 'manuscrito/00-part-i.en.md'
        stem = 'arkhe-part-i-en'
        suffix = '-part-i-en'
    if args.section == 'part-ii':
        source = BASE / 'manuscrito/00-part-ii.en.md'
        stem = 'arkhe-part-ii-en'
        suffix = '-part-ii-en'
    if args.section == 'part-iii':
        source = BASE / 'manuscrito/00-part-iii.en.md'
        stem = 'arkhe-part-iii-en'
        suffix = '-part-iii-en'
    if args.section == 'part-iv':
        source = BASE / 'manuscrito/00-part-iv.en.md'
        stem = 'arkhe-part-iv-en'
        suffix = '-part-iv-en'
    if args.section == 'part-v':
        source = BASE / 'manuscrito/00-part-v.en.md'
        stem = 'arkhe-part-v-en'
        suffix = '-part-v-en'
    pandoc = shutil.which('pandoc')
    if not pandoc:
        raise SystemExit('Instale Pandoc e disponibilize-o no PATH.')
    for name in INPUTS:
        if not (ROOT / name).is_file():
            raise SystemExit(f'Fonte ausente: {name}')
    dist = BASE / 'dist'
    evidence = BASE / 'evidence'
    dist.mkdir(exist_ok=True)
    evidence.mkdir(exist_ok=True)
    common = [pandoc, str(source), '--standalone', '--toc', '--toc-depth=2',
              '--css', str(BASE / 'style.css')]
    html = dist / f'{stem}.html'
    epub = dist / f'{stem}.epub'
    subprocess.run(common + ['--embed-resources', '-t', 'html5', '-o', str(html)], check=True)
    subprocess.run(common + ['-t', 'epub3', '--split-level=1', '-o', str(epub)], check=True)
    with zipfile.ZipFile(epub) as archive:
        assert archive.namelist()[0] == 'mimetype'
        assert archive.getinfo('mimetype').compress_type == zipfile.ZIP_STORED
        assert archive.read('mimetype') == b'application/epub+zip'
        names = set(archive.namelist())
        for name in names:
            if name.endswith(('.xml', '.opf', '.xhtml', '.ncx')):
                ET.fromstring(archive.read(name))
        container = ET.fromstring(archive.read('META-INF/container.xml'))
        package_path = container.find('.//{*}rootfile').attrib['full-path']
        package = ET.fromstring(archive.read(package_path))
        items = {i.attrib['id']: i.attrib for i in package.findall('.//{*}manifest/{*}item')}
        for item in items.values():
            target = posixpath.normpath(posixpath.join(posixpath.dirname(package_path), item['href']))
            assert target in names, target
        for item in package.findall('.//{*}spine/{*}itemref'):
            assert item.attrib['idref'] in items
        assert any('nav' in item.get('properties', '').split() for item in items.values())
    manifest = {'scope': 'editorial inputs, not a complete build provenance attestation',
                'files': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
                          for name in INPUTS}}
    extra_inputs = []
    if args.section != 'sample':
        extra_inputs.append('docs/SECURITY-MODEL.md')
    if args.section == 'part-ii':
        extra_inputs.extend([
            'docs/ARCHITECTURE.md', 'config/architecture.json',
            'kernel/arkhe-core/src/canonical.rs',
            'kernel/arkhe-core/src/evidence.rs',
            'kernel/arkhe-core/tests/golden_vectors.rs',
            'specs/mmr/spec/mmr-profile-v1.md',
            'verification/crates/arkhe-verify-core/src/mmr/inclusion.rs',
            'verification/crates/arkhe-verify-core/src/mmr/profile.rs',
            'evidence/arkhe-wormgraph/src/lib.rs',
            'evidence/arkhe-wormgraph/src/postgres.rs',
            'docs/ebook/manuscrito/07-from-output-to-authorization.en.md',
        ])
    if args.section == 'part-iii':
        extra_inputs.extend([
            'docs/ACTION-BROKER.md',
            'governance/arkhe-governance/src/lib.rs',
            'kernel/arkhe-kernel/Cargo.toml',
            'kernel/arkhe-kernel/src/broker.rs',
            'kernel/arkhe-kernel/src/broker_sqlite.rs',
            'kernel/arkhe-kernel/tests/action_broker.rs',
            'kernel/arkhe-kernel/tests/broker_durable.rs',
            'kernel/arkhe-core/src/evidence.rs',
            'evidence/arkhe-wormgraph/src/postgres.rs',
            'integrations/verify-mcp/package.json',
            'integrations/verify-mcp/README.md',
            'integrations/verify-mcp/src/index.ts',
            'integrations/verify-mcp/src/utils/wasm.ts',
            'integrations/verify-mcp/src/tools/verify-artifact.ts',
            'integrations/verify-mcp/src/tools/verify-mmr.ts',
            'integrations/verify-mcp/src/tools/verify-c2pa-signature.ts',
            'integrations/verify-mcp/tests/workspace-adapter.test.mjs',
            'integrations/verify-mcp/tests/verification-scope.test.mjs',
            'integrations/verify-mcp/tests/stdio.test.mjs',
            'integrations/verify-mcp/tests/c2pa-signature.test.mjs',
            'scripts/build_verifier.py',
        ])
    if args.section == 'part-iv':
        extra_inputs.extend([
            'governance/arkhe-governance/src/lib.rs',
            'docs/security/TRUST-LIFECYCLE-2026-10-18.md',
            'docs/security/PRODUCTION-BOUNDARY-2026-10-18.md',
            'docs/backlog/BACKLOG.md',
            'integration/arkhe-bugbounty/src/bounty_evidence/durable.rs',
            'integration/arkhe-bugbounty/tests/durable_gates.rs',
            'agi-coder/Cargo.toml', 'agi-coder/Cargo.lock',
            'agi-coder/crates/agi-coder-cost/Cargo.toml',
            'agi-coder/crates/agi-coder-tests/tests/cognition_verification.rs',
        ])
    if args.section == 'part-v':
        extra_inputs.extend([
            'docs/JULES-COMPLETION.md', 'docs/PREVIEW-EXECUTION.md',
            'agi-coder/Cargo.toml', 'agi-coder/Cargo.lock',
            'agi-coder/crates/agi-coder-jules/src/worker_record.rs',
            'agi-coder/crates/agi-coder-jules/src/client.rs',
            'agi-coder/crates/agi-coder-tests/tests/jules_completion.rs',
            'agi-coder/crates/agi-coder-tests/tests/e2e_mock_jules.rs',
            'integration/arkhe-depin/src/adapters/gensyn.rs',
            'integration/arkhe-depin/src/proof/mod.rs',
            'integration/arkhe-depin/src/types.rs',
            'integration/arkhe-depin/fixtures/gensyn_verde_receipt.synthetic.json',
            'integration/arkhe-depin/tests/portable_proof_composite.rs',
            'verification/crates/arkhe-verify-core/src/c2pa/claim.rs',
            'verification/crates/arkhe-verify-core/src/c2pa/signature.rs',
            'verification/crates/arkhe-verify-core/tests/c2pa_signature.rs',
        ])
    for name in extra_inputs:
        manifest['files'][name] = hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
    manifest['editorial_source'] = {'path': source.relative_to(ROOT).as_posix(),
                                    'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
    (evidence / f'source-manifest{suffix}.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    report = {'basic_epub_structure': 'PASS', 'epubcheck': 'NOT RUN',
              'kindle_previewer': 'NOT RUN',
              'pandoc': subprocess.check_output([pandoc, '--version'], text=True).splitlines()[0],
              'language': args.lang,
              'section': args.section,
              'sample_words_whitespace': len(source.read_text(encoding='utf-8').split()),
              'artifacts': {p.name: {'bytes': p.stat().st_size,
                                    'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
                            for p in (html, epub)}}
    (evidence / f'build-report{suffix}.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
