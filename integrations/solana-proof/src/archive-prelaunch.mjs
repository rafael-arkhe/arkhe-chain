import { mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const target = 'evidence/prelaunch-2026-10-23'; mkdirSync(target, { recursive: true });
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const copy = (source, destination) => { mkdirSync(destination.slice(0, destination.lastIndexOf('/')), { recursive: true }); copyFileSync(source, destination); };
const cases = [['fixtures', 'fixtures-result'], ['mainnet-snapshot', 'mainnet-result'], ['devnet-snapshot', 'devnet-result'], ['fee125-candidate', 'fee125-result']];
const scenarios = [];
for (const [name, folder] of cases) {
  const directory = `output/prelaunch/${folder}`;
  const report = read(`${directory}/report.json`);
  if (report.status !== 'PASS') throw Error(`cannot archive failed scenario ${name}`);
  for (const file of ['report', 'checks', 'events', 'receipts', 'transactions', 'audit-report']) copy(`${directory}/${file}.json`, `${target}/${name}/${file}.json`);
  const audit = read(`${directory}/audit-report.json`);
  for (const file of ['backup.json', 'signed-checkpoint.json', 'trusted-public-key.pem']) copy(`${audit.directory}/${file}`, `${target}/${name}/audit/${file}`);
  for (const file of ['migration-resume-state.json', 'migration-worker-a.json', 'migration-worker-b.json']) if (existsSync(`${directory}/${file}`)) copy(`${directory}/${file}`, `${target}/${name}/${file}`);
  scenarios.push({ name, status: report.status, environment: report.environment, deploymentSource: report.deploymentSource, additionalChecks: report.additionalChecks.length, rootHex: report.rootHex, indexAudit: audit.status });
}
for (const kind of ['local', 'devnet']) {
  for (const file of ['report.json', ...(kind === 'local' ? ['receipts.json', 'signatures.json'] : ['failure.json'])]) copy(`output/prelaunch/airdrop-${kind}/${file}`, `${target}/airdrop-${kind}/${file}`);
}
copy('output/prelaunch/deployments.json', `${target}/deployments.json`);
copy('output/prelaunch/fee125/profile.json', `${target}/fee125-candidate/profile.json`);
copy('output/prelaunch/load-report.json', `${target}/load-report.json`);
copy('output/chain-report.json', `${target}/token2022-regression.json`);
const junit = readFileSync(`${target}/unit-tests.xml`, 'utf8');
const tests = (junit.match(/<testcase\b/g) ?? []).length;
if (tests !== 32 || /<failure\b|<error\b/.test(junit)) throw Error('unit test artifact did not pass');
const manifest = [];
for (const folder of ['src', 'test']) for (const file of readdirSync(folder).filter(f => f.endsWith('.mjs'))) manifest.push({ path: `${folder}/${file}`, sha256: createHash('sha256').update(readFileSync(`${folder}/${file}`)).digest('hex') });
writeFileSync(`${target}/source-manifest.json`, JSON.stringify(manifest, null, 2));
const summary = { date: '2026-10-23', launchReadiness: 'BLOCKED', automatedTests: { total: tests, failures: 0 }, scenarios, airdropLocal: read('output/prelaunch/airdrop-local/report.json').status, airdropPublicDevnet: read('output/prelaunch/airdrop-devnet/report.json').status, supplyBudget: '60/20/15/5 reconciles alone, but leaves zero additional tokens for curve sale', productionWalletUiVerified: false, vestingEnforced: false, productionIndexerQualified: false, independentReviewPerformed: false, publicMainnetTransactionsSent: false };
writeFileSync(`${target}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
