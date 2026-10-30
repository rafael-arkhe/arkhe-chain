import { spawn, execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PROGRAM_FIXTURES, DAMM_CONFIG, DAMM_CONFIG_SHA256, FIXTURE_DIRECTORY, CONFIG_FILE } from './meteora-config.mjs';

for (const fixture of PROGRAM_FIXTURES) {
  const digest = createHash('sha256').update(readFileSync(`${FIXTURE_DIRECTORY}/${fixture.file}`)).digest('hex');
  if (digest !== fixture.sha256) throw Error(`bad fixture ${fixture.file}; run npm run prepare:meteora`);
}
const configFile = resolve(CONFIG_FILE);
const config = JSON.parse(readFileSync(configFile));
if (config.pubkey !== DAMM_CONFIG || createHash('sha256').update(Buffer.from(config.account.data[0], 'base64')).digest('hex') !== DAMM_CONFIG_SHA256) throw Error('bad DAMM config snapshot');
const isWindows = process.platform === 'win32';
const distro = process.env.ARKHE_WSL_DISTRO ?? 'Ubuntu';
const wsl = args => execFileSync('wsl.exe', ['-d', distro, '--', ...args], { encoding: 'utf8', windowsHide: true }).trim();
const pathForValidator = path => isWindows ? wsl(['wslpath', '-u', resolve(path).replaceAll('\\', '/')]) : resolve(path);
const validator = isWindows
  ? wsl(['sh', '-lc', 'command -v solana-test-validator || printf "%s" "$HOME/.local/share/solana/install/active_release/bin/solana-test-validator"'])
  : 'solana-test-validator';
const ledger = isWindows ? `/tmp/arkhe-meteora-${randomUUID()}` : resolve(`output/meteora-ledger-${randomUUID()}`);
const args = [validator, '--ledger', ledger, '--rpc-port', '18899', '--faucet-port', '18950', '--dynamic-port-range', '19100-19140', '--bind-address', '127.0.0.1', '--ticks-per-slot', '8', '--account', DAMM_CONFIG, pathForValidator(configFile)];
for (const fixture of PROGRAM_FIXTURES) args.push('--bpf-program', fixture.program, pathForValidator(`${FIXTURE_DIRECTORY}/${fixture.file}`));
args.push('--quiet');
console.log(`Meteora local validator: http://127.0.0.1:18899; isolated ledger: ${ledger}`);
const child = isWindows
  ? spawn('wsl.exe', ['-d', distro, '--', ...args], { stdio: 'inherit', windowsHide: true })
  : spawn(args[0], args.slice(1), { stdio: 'inherit' });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
