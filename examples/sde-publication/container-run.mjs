import { spawnSync } from 'node:child_process';

for (const args of [['--test', 'publication.test.mjs', 'ai-aggregate.test.mjs', 'calibrate.test.mjs'], ['demo.mjs']]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
