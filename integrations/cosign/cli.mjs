import { open } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_ARTIFACT_BYTES, sha256, verifySigstoreBlob } from './verify.mjs';

async function readBounded(path, maximum) {
  const file = await open(path, 'r');
  try {
    const chunks = [];
    let count = 0;
    for await (const chunk of file.createReadStream({ autoClose: false })) {
      count += chunk.length;
      if (count > maximum) throw new Error(`input exceeds size limit: ${path}`);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } finally { await file.close(); }
}

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    bundle: { type: 'string' }, 'trusted-root': { type: 'string' }, policy: { type: 'string' },
    'arkhe-verifier': { type: 'string' },
  } });
  const [command, path] = positionals;
  if (!['verify-blob', 'verify-gguf'].includes(command) || positionals.length !== 2
    || !values.bundle || !values['trusted-root'] || !values.policy
    || (command === 'verify-gguf' && !values['arkhe-verifier'])) {
    throw new Error('usage: node cli.mjs verify-blob|verify-gguf <artifact> --bundle <bundle.json> --trusted-root <root.json> --policy <policy.json> [--arkhe-verifier <absolute-path-to-arkhe-verify>]');
  }
  const [artifact, bundleBytes, rootBytes, policyBytes] = await Promise.all([
    readBounded(path, MAX_ARTIFACT_BYTES), readBounded(values.bundle, 1024 * 1024),
    readBounded(values['trusted-root'], 1024 * 1024), readBounded(values.policy, 16384),
  ]);
  let inspection;
  if (command === 'verify-gguf') {
    // Send the exact same in-memory snapshot to Rust and Sigstore, avoiding a
    // reopen/TOCTOU race between parsing and signature verification.
    inspection = JSON.parse(execFileSync(resolve(values['arkhe-verifier']), ['inspect-gguf', '-'], {
      input: artifact, maxBuffer: 1024 * 1024, timeout: 30000, windowsHide: true, encoding: 'utf8',
    }));
    if (inspection.artifact_sha256 !== sha256(artifact) || inspection.profile !== 'arkhe-gguf-lab@1') {
      throw new Error('Rust inspection did not bind the artifact snapshot');
    }
  }
  const report = verifySigstoreBlob(artifact, JSON.parse(bundleBytes), rootBytes, JSON.parse(policyBytes));
  if (inspection) {
    report.profile = 'arkhe-gguf-sigstore@1';
    report.artifact_blake3 = inspection.artifact_blake3;
    report.metadata_sha256 = inspection.metadata_sha256;
    report.checks.unshift('gguf_restricted_structure', 'artifact_sha256_and_blake3', 'canonical_metadata_sha256');
  }
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`Sigstore verification rejected: ${error.message}`); process.exitCode = 1; });
}
