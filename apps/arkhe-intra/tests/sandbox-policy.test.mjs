import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSandboxArguments} from '../lib/sandbox-policy.mjs';

test('shared sandbox policy preserves hardening and explicit image identity', () => {
  const image = 'sha256:'+'a'.repeat(64);
  const args = buildSandboxArguments(image,'owned','/fixture',{id:'arkhe-agent'},{connection:'dedicated'});
  for (const flag of ['--pull=never','--network=none','--read-only','--cap-drop=ALL',
    '--security-opt=no-new-privileges','--user=10001:10001','--memory=1536m','--cpus=2',
    '--pids-limit=128','--cgroup-parent=/arkhe-sandbox']) assert.ok(args.includes(flag));
  assert.deepEqual(args.slice(0,3),['--connection','dedicated','run']);
  assert.ok(args.includes('/fixture:/input:ro'));
  assert.ok(args.includes('--tmpfs=/tmp:rw,noexec,size=67108864'));
  assert.ok(args.includes('--tmpfs=/work:rw,exec,size=1073741824,mode=1777'));
  assert.throws(()=>buildSandboxArguments('rust:latest','owned','/fixture',{id:'x'}),/ARKHE_SANDBOX_IMAGE/);
});
