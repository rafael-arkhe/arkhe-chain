// Rust is the single signing/canonicalization implementation.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const run = spawnSync('cargo', ['run', '--quiet', '--locked', '--manifest-path',
  'Cargo.toml', '--example', 'fixture'], { cwd: root, encoding:'utf8', timeout:60000, maxBuffer:1024*1024 });
if (run.error || run.status !== 0) throw new Error(run.error?.message ?? run.stderr);
const fixture=JSON.parse(run.stdout);
const output=process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../fixtures/generated',import.meta.url));
mkdirSync(output,{recursive:true});
const files={
  'receipt.json':fixture.passport, 'context.json':fixture.context,
  'presentation.json':{format:'arkhe-kya-presentation@1',label:'synthetic-poc',receipt:fixture.passport,status:JSON.parse(fixture.status_cases[0].status_json)},
  'status-clear.json':JSON.parse(fixture.status_cases[0].status_json),
  'status-revoked.json':JSON.parse(fixture.status_cases[1].status_json),
  'status-unavailable.json':JSON.parse(fixture.status_cases[2].status_json),
  'policy-demo.json':JSON.parse(fixture.policy_cases[0].policy_json),
  'policy-required-tee.json':JSON.parse(fixture.policy_cases[1].policy_json),
  'metadata.json':{profile:'arkhe-kya-experimental@1',label:'synthetic-poc',warning:fixture.warning,
    context_warning:'Fixed historical test time, root and challenge; not a production trust configuration.'},
};
for (const [name,value] of Object.entries(files)) writeFileSync(join(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,files:Object.keys(files),label:'synthetic-poc'}));
