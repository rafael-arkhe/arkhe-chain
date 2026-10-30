"""Allowlisted E02 CI projection; never uploads work data, env files or keys."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'output/e02-ci-snapshot'
OUT.mkdir(parents=True, exist_ok=True)
sources = {}


def copy(relative):
    source = ROOT / relative
    target = OUT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    sources[relative] = hashlib.sha256(source.read_bytes()).hexdigest()


for crate in ['kernel/arkhe-core', 'integration/auth-md', 'verification/crates/arkhe-verify-core', 'verification/crates/arkhe-verify-wasm']:
    copy(f'{crate}/Cargo.toml')
    for source in (ROOT / crate / 'src').rglob('*.rs'):
        copy(source.relative_to(ROOT).as_posix())
copy('verification/crates/arkhe-verify-core/examples/e02_mmr_oracle.rs')
for relative in ['rust-toolchain.toml', 'Cargo.lock', '.cargo/config.toml', 'config/architecture.json',
                 'scripts/verify_e02_delivery.py', 'specs/mmr/spec/mmr-profile-v1.md', 'scripts/e02_native_wasm_parity.mjs', 'scripts/e02_ui_review.mjs', 'scripts/build_verifier.py',
                 'scripts/e02_verify.mjs', 'scripts/e02_mmr.mjs', 'scripts/e02_memo_commitment.mjs', 'scripts/e01_solana_transport.mjs']:
    copy(relative)
app = 'apps/arkhe-intra'
for relative in ['package.json', 'tsconfig.json', 'next.config.mjs', 'next-env.d.ts', 'tailwind.config.ts', 'postcss.config.mjs',
                 'scripts/build.mjs', 'app/verificar/e02/page.tsx', 'app/api/e02/verify/route.ts',
                 'components/e02-verifier.tsx', 'components/e02-result-dialog.tsx', 'components/ui.tsx', 'components/providers.tsx',
                 'lib/client.ts', 'lib/paths.mjs', 'lib/e02.mjs', 'lib/e02.d.mts', 'lib/e02-browser.mjs', 'lib/e02-browser.d.mts',
                 'lib/e02-report.mjs', 'lib/e02-report.d.mts', 'lib/verifier-wasm.d.ts', 'tests/e02.test.mjs']:
    copy(f'{app}/{relative}')
for source in (ROOT / app / 'app').glob('*.css'):
    copy(source.relative_to(ROOT).as_posix())
for folder in [f'{app}/public/e02/fixtures', 'verification/vectors/mmr']:
    for source in (ROOT / folder).rglob('*.json'):
        copy(source.relative_to(ROOT).as_posix())

# Workspace projection preserves the original dependency declarations and crate sources.
cargo = (ROOT / 'Cargo.toml').read_text(encoding='utf-8')
start = cargo.index('members = [')
end = cargo.index(']', start) + 1
cargo = cargo[:start] + 'members = ["kernel/arkhe-core", "integration/auth-md", "verification/crates/arkhe-verify-core", "verification/crates/arkhe-verify-wasm"]' + cargo[end:]
(OUT / 'Cargo.toml').write_text(cargo, encoding='utf-8')
(OUT / app / 'app/layout.tsx').write_text('''import { Providers } from '@/components/providers';
import './globals.css';
import './refinements.css';
export const metadata = { title: 'Arkhe E02 conformance snapshot' };
export default function Layout({children}: {children: React.ReactNode}) {
  return <html lang="pt-BR"><body><Providers>{children}</Providers></body></html>;
}
''', encoding='utf-8')
(OUT / '.gitignore').write_text('target/\nnode_modules/\n.next/\n**/pkg/\napps/arkhe-intra/public/verifier/\n', encoding='utf-8')
(OUT / 'tooling/browser').mkdir(parents=True, exist_ok=True)
for name in ['package.json', 'package-lock.json']:
    shutil.copyfile(ROOT / 'ops/local/e02-browser-tools' / name, OUT / 'tooling/browser' / name)
sources.pop('Cargo.lock', None)
subprocess.run(['cargo', 'generate-lockfile', '--offline'], cwd=OUT, check=True)
(OUT / 'SOURCE-MANIFEST.json').write_text(json.dumps({'scope': 'E02-only projection; original crate/UI source bytes, reduced workspace and public-page layout; no claim about the full monorepo', 'projection_overrides': ['Cargo.toml', 'Cargo.lock', 'apps/arkhe-intra/app/layout.tsx'], 'local_sha256': sources}, indent=2) + '\n', encoding='utf-8')
print(OUT)
