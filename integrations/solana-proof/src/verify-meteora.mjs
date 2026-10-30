import { readFileSync } from 'node:fs';
import { verifyLifecycle } from './lifecycle.mjs';
const [file, trustedRoot, count] = process.argv.slice(2);
const valid = verifyLifecycle(JSON.parse(readFileSync(file, 'utf8')), trustedRoot, Number(count));
console.log(JSON.stringify({ lifecycleInclusionVerified: valid, checkpointAuthentication: 'NOT_PERFORMED', chainVerification: 'NOT_PERFORMED', authority: false }));
if (!valid) process.exitCode = 1;
