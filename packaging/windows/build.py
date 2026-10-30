"""Build a self-contained local Intra distribution. Run from the repository root."""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import uuid
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
VERSION = '0.1.0'
DIST = ROOT / 'dist' / f'Arkhe-{VERSION}-windows-x64'


def run(*args):
    subprocess.run(list(map(str, args)), cwd=ROOT, check=True)


def copy(source, target, exclude_modules=False):
    target.parent.mkdir(parents=True, exist_ok=True)
    if source.is_dir():
        ignore = ['.env', '.env.*', '*.pdb', '*.tsbuildinfo'] + (['node_modules'] if exclude_modules else [])
        source_path = '\\\\?\\' + str(source.resolve()) if os.name == 'nt' else str(source)
        target_path = '\\\\?\\' + str(target.absolute()) if os.name == 'nt' else str(target)
        shutil.copytree(source_path, target_path, dirs_exist_ok=True, ignore=shutil.ignore_patterns(*ignore))
    else:
        shutil.copy2(source, target)


def installer(wix):
    ns = 'http://wixtoolset.org/schemas/v4/wxs'
    ET.register_namespace('', ns)
    def el(parent, tag, **attrs): return ET.SubElement(parent, f'{{{ns}}}{tag}', attrs)
    doc = ET.Element(f'{{{ns}}}Wix')
    package = el(doc, 'Package', Name='Arkhe Intra', Manufacturer='Arkhe', Version=VERSION,
                 UpgradeCode='A17C1F72-8AF4-4C72-B50C-78B73DB512A3', Scope='perUser', Language='1046')
    el(package, 'MajorUpgrade', DowngradeErrorMessage='Uma versão mais recente do Arkhe já está instalada.')
    el(package, 'MediaTemplate', EmbedCab='yes')
    local = el(package, 'StandardDirectory', Id='LocalAppDataFolder')
    programs = el(local, 'Directory', Id='UserPrograms', Name='Programs')
    install = el(programs, 'Directory', Id='INSTALLFOLDER', Name='Arkhe')
    directories = {'.': install}
    feature = el(package, 'Feature', Id='Complete', Title='Arkhe Intra', Level='1')
    for path in sorted(DIST.rglob('*')):
        if not path.is_file(): continue
        relative = path.relative_to(DIST)
        parent = install
        for index in range(1, len(relative.parts)):
            key = str(Path(*relative.parts[:index]))
            if key not in directories:
                directories[key] = el(parent, 'Directory', Id='D' + hashlib.sha256(key.encode()).hexdigest()[:24], Name=relative.parts[index-1])
            parent = directories[key]
        identity = hashlib.sha256(relative.as_posix().encode()).hexdigest()[:24]
        component = el(parent, 'Component', Id='C' + identity, Guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'arkhe/windows/' + relative.as_posix())))
        el(component, 'File', Id='F' + identity, Source=str(path), KeyPath='yes')
        el(feature, 'ComponentRef', Id='C' + identity)
    menu = el(package, 'StandardDirectory', Id='ProgramMenuFolder')
    folder = el(menu, 'Directory', Id='ArkheMenu', Name='Arkhe')
    component = el(folder, 'Component', Id='Menu', Guid='5CAAE2D8-A3BB-46F3-BAA7-DFA76CF4DFE2')
    el(component, 'Shortcut', Id='Launch', Name='Arkhe Intra', Target='[INSTALLFOLDER]Arkhe.exe', WorkingDirectory='INSTALLFOLDER')
    el(component, 'Shortcut', Id='Stop', Name='Parar Arkhe', Target='[INSTALLFOLDER]arkhe-cli.exe', Arguments='stop', WorkingDirectory='INSTALLFOLDER')
    el(component, 'RemoveFolder', Id='RemoveMenu', On='uninstall')
    el(component, 'RegistryValue', Root='HKCU', Key='Software\\Arkhe\\Intra', Name='Installed', Type='integer', Value='1', KeyPath='yes')
    el(feature, 'ComponentRef', Id='Menu')
    source = ROOT / 'ops/local/packaging/Arkhe.wxs'
    source.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(doc).write(source, encoding='utf-8', xml_declaration=True)
    run(wix, 'build', source, '-arch', 'x64', '-pdbtype', 'none', '-o', Path(str(DIST) + '.msi'))


def main():
    global DIST
    parser = argparse.ArgumentParser()
    parser.add_argument('--skip-build', action='store_true')
    parser.add_argument('--wix', default=str(ROOT / 'ops/local/packaging/tools/wix.exe'))
    parser.add_argument('--output-name', default=DIST.name)
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{1,80}', args.output_name):
        raise SystemExit('Output name must be a simple directory name.')
    DIST = ROOT / 'dist' / args.output_name
    if DIST.exists(): raise SystemExit(f'Refusing to overwrite existing output: {DIST}. Move it aside first.')
    if not args.skip_build:
        env = {**os.environ, 'NODE_OPTIONS': '--require="' + str(ROOT / 'packaging/windows/windows-links.cjs') + '"'}
        subprocess.run(['pnpm.cmd', 'build:intra'], cwd=ROOT, env=env, check=True)
        run('cargo', 'build', '--release', '--locked', '-p', 'arkhe-ollama', '-p', 'arkhe-verify-cli')
        run('dotnet', 'publish', 'packaging/windows/Arkhe.Launcher.csproj', '-c', 'Release', '-o', 'ops/local/packaging/launcher')
        run('dotnet', 'publish', 'packaging/windows/Arkhe.Launcher.csproj', '-c', 'Release', '-p:OutputType=WinExe', '-p:AssemblyName=ArkheDesktop', '-o', 'ops/local/packaging/desktop')
    standalone = ROOT / 'apps/arkhe-intra/.next/standalone'
    copy(standalone, DIST / 'app', exclude_modules=True)
    # Flatten the traced pnpm store to ordinary node_modules. This avoids long
    # Windows install paths and removes every workspace junction from the result.
    versions = {}
    for modules in sorted((standalone / 'node_modules/.pnpm').glob('*/node_modules')):
        for folder in sorted(modules.iterdir()):
            packages = list(folder.iterdir()) if folder.name.startswith('@') else [folder]
            for package in packages:
                metadata = package / 'package.json'
                if not metadata.exists(): continue
                info = json.loads(metadata.read_text(encoding='utf-8'))
                name, version = info['name'], info['version']
                if name in versions:
                    if versions[name] != version: raise SystemExit(f'Conflicting traced versions: {name}')
                    continue
                versions[name] = version
                copy(package, DIST / 'app/node_modules' / name, exclude_modules=True)
    app = DIST / 'app/apps/arkhe-intra'
    if not (app / 'server.js').exists(): raise SystemExit('Missing monorepo standalone server.js')
    copy(ROOT / 'apps/arkhe-intra/.next/static', app / '.next/static')
    copy(ROOT / 'apps/arkhe-intra/public', app / 'public')
    # Server-side hashing uses the Node-target WASM build, distinct from the
    # browser-target verifier copied into public/verifier.
    copy(ROOT / 'verification/crates/arkhe-verify-wasm/pkg', DIST / 'verification/crates/arkhe-verify-wasm/pkg')
    copy(Path(shutil.which('node')), DIST / 'runtime/node.exe')
    copy(ROOT / 'ops/local/packaging/launcher/arkhe.exe', DIST / 'arkhe-cli.exe')
    copy(ROOT / 'ops/local/packaging/desktop/ArkheDesktop.exe', DIST / 'Arkhe.exe')
    for name in ['arkhe-ollama', 'arkhe-verify']:
        copy(ROOT / f'target/release/{name}.exe', DIST / f'bin/{name}.exe')
    copy(ROOT / 'apps/arkhe-intra/scripts/setup.mjs', DIST / 'setup/scripts/setup.mjs')
    copy(ROOT / 'apps/arkhe-intra/lib/paths.mjs', DIST / 'setup/lib/paths.mjs')
    copy(ROOT / 'packaging/windows/server-host.mjs', DIST / 'setup/server-host.mjs')
    copy(ROOT / 'config/ollama.json', DIST / 'config/ollama.json')
    copy(ROOT / 'config/architecture.json', DIST / 'config/architecture.json')
    copy(ROOT / 'packaging/windows/README.md', DIST / 'README.md')
    copy(ROOT / 'packaging/windows/licenses', DIST / 'licenses')
    # Fail if tracing picked up any local credentials or signing material.
    for path in DIST.rglob('*'):
        if path.is_file() and (path.name in {'credentials.json', 'accounts.json', 'intra.sqlite', '.env.local'} or path.name.endswith('.private.pem')):
            raise SystemExit(f'Private file found in package: {path}')
    manifest = {p.relative_to(DIST).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(DIST.rglob('*')) if p.is_file()}
    (DIST / 'manifest.sha256.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    shutil.make_archive(str(DIST), 'zip', DIST.parent, DIST.name)
    installer(args.wix)
    hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(str(DIST) + '.zip'), Path(str(DIST) + '.msi')]}
    (DIST.parent / (DIST.name + '.sha256.json')).write_text(json.dumps(hashes, indent=2), encoding='utf-8')
    if args.output_name == f'Arkhe-{VERSION}-windows-x64':
        (DIST.parent / 'SHA256SUMS.json').write_text(json.dumps(hashes, indent=2), encoding='utf-8')
    print(json.dumps({'output': str(DIST), 'sha256': hashes}, indent=2))


if __name__ == '__main__': main()
