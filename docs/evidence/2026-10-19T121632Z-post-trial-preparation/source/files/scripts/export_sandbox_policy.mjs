import {readFileSync} from 'node:fs';
import {buildSandboxArguments} from '../apps/arkhe-intra/lib/sandbox-policy.mjs';
const value = JSON.parse(readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(buildSandboxArguments(value.image, value.name,
  value.snapshot, {id:'containment-probe'}, {connection:value.connection,
  cgroupParent:value.cgroupParent})));
