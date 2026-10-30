import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sha256 } from '../verify.mjs';

const rust = process.env.ARKHE_VERIFIER ?? fileURLToPath(new URL(`../../../target/debug/arkhe-verify${process.platform === 'win32' ? '.exe' : ''}`, import.meta.url));
const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

function gguf() {
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
  const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
  const text = (s) => Buffer.concat([u64(Buffer.byteLength(s)), Buffer.from(s)]);
  const header = Buffer.concat([Buffer.from('GGUF'), u32(3), u64(1), u64(1),
    text('general.architecture'), u32(8), text('arkhe_lab'),
    text('lab.weight'), u32(1), u64(1), u32(0), u64(0)]);
  return Buffer.concat([header, Buffer.alloc(Math.ceil(header.length / 32) * 32 - header.length), Buffer.alloc(4)]);
}

test('Rust inspects the exact stdin GGUF snapshot, and the real Sigstore path rejects a transplanted signature', () => {
  const artifact = gguf();
  const inspected = spawnSync(rust, ['inspect-gguf', '-'], { input: artifact, encoding: 'utf8', timeout: 30000 });
  assert.equal(inspected.status, 0, inspected.stderr || inspected.error?.message);
  assert.equal(JSON.parse(inspected.stdout).artifact_sha256, sha256(artifact));
  const directory = mkdtempSync(join(tmpdir(), 'arkhe-gguf-sigstore-'));
  const path = join(directory, 'model.gguf');
  try {
    writeFileSync(path, artifact);
    const args = [cli, 'verify-gguf', path, '--bundle', fixture('message.sigstore.json'),
      '--trusted-root', fixture('trusted-root.public.json'), '--policy', fixture('policy.public.json'), '--arkhe-verifier', rust];
    const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /artifact\/message digest mismatch/);
    writeFileSync(path, 'not GGUF');
    const invalid = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30000 });
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout, '');
    assert.match(invalid.stderr, /gate 1/);
  } finally { unlinkSync(path); rmdirSync(directory); }
});
