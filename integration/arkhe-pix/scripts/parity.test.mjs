import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=name=>readFileSync(new URL(`../tests/fixtures/${name}`,import.meta.url),'utf8');
const wasm=createRequire(import.meta.url)('../pkg/arkhe_pix_wasm.js');
const key=read('keys/test-signer.pub.hex').trim();
for(const [name,success] of [['receipt-clear.json',true],['receipt-tampered.json',false]]) {
 test(`CLI/WASM ${name}`,()=>{
  const cli=spawnSync('cargo',['run','--quiet','--locked','-p','arkhe-pix-cli','--','verify','--receipt',`tests/fixtures/${name}`,'--signer-hex',key],{cwd:root,encoding:'utf8',timeout:60000});
  assert.equal(cli.status,success?0:1,cli.stderr);
  const result=JSON.parse(wasm.verify_receipt_json(read(name),key));assert.deepEqual(result,JSON.parse(cli.stdout));
  if(success) assert.deepEqual(result,JSON.parse(read('golden-outcome.json')));
  else assert.equal(result.verdict,'not_verifiable');
 });
}
test('golden canonical bytes remain fixed',()=>{
 const cli=spawnSync('cargo',['run','--quiet','--locked','-p','arkhe-pix-cli','--','canonicalize','--receipt','tests/fixtures/receipt-clear.json'],{cwd:root,encoding:'utf8',timeout:60000});
 assert.equal(cli.status,0,cli.stderr);assert.equal(cli.stdout.trim(),read('golden-canonical.hex').trim());
});
test('WASM rejects duplicate metadata and overlarge input',()=>{
 const good=read('receipt-clear.json');
 for(const input of [good.replace('"metadata": {}','"metadata": {"x":"a","x":"b"}'),' '.repeat(32769)]) {
  assert.equal(JSON.parse(wasm.verify_receipt_json(input,key)).verdict,'not_verifiable');
 }
});
