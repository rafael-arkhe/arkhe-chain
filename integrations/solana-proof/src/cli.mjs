import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { receiptFor, verifyReceipt, checkpointMemo } from './proof.mjs';
const [command, file, root, count] = process.argv.slice(2);
if (command === 'demo') {
  const events = Array.from({ length: 7 }, (_, i) => ({
    intent: { cluster: 'synthetic', mint: 'testmint', source: 'alice', destination: 'bob', amount: String(i + 1), decimals: 6, operationId: `demo-${i}` },
    signature: '1'.repeat(64), slot: i
  }));
  const receipt = receiptFor(events, 3);
  mkdirSync('output', { recursive: true });
  writeFileSync('output/receipt.json', JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ synthetic: true, inclusionVerified: verifyReceipt(receipt, receipt.rootHex, 7), rootHex: receipt.rootHex, leafCount: 7, memo: checkpointMemo(receipt.rootHex, 7), chainVerification: 'NOT_PERFORMED' }, null, 2));
} else if (command === 'verify') {
  const receipt = JSON.parse(readFileSync(file, 'utf8'));
  const valid = verifyReceipt(receipt, root, Number(count));
  console.log(JSON.stringify({ inclusionVerified: valid, checkpointAuthentication: 'NOT_PERFORMED', trustedCheckpointSource: 'CALLER_SUPPLIED', chainVerification: 'NOT_PERFORMED', authority: false }));
  if (!valid) process.exitCode = 1;
} else { throw Error('Usage: node src/cli.mjs demo | verify receipt.json TRUSTED_ROOT LEAF_COUNT'); }
