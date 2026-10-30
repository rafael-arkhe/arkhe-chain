import { readFile, mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { testArtifact } from '../scripts/conformance.mjs';
const original = await readFile(new URL('../dist/plugin.mjs',import.meta.url));
const padded = await readFile(new URL('../dist/large/plugin.mjs',import.meta.url));
assert.equal(padded.length,7*1024*1024);
assert(padded.subarray(0,original.length).equals(original));
assert.equal(padded.subarray(original.length,original.length+3).toString(),'\n/*');
assert.equal(padded.subarray(-3).toString(),'*/\n');
const directory=await mkdtemp(join(tmpdir(),'arkhe-padded-'));
try {
 await mkdir(join(directory,'dist'));
 await copyFile(new URL('../dist/large/plugin.mjs',import.meta.url),join(directory,'dist/plugin.mjs'));
 await copyFile(new URL('../paybox-plugin.json',import.meta.url),join(directory,'paybox-plugin.json'));
 const report=await testArtifact(directory);
 assert.equal(report.status,'passed');
 console.log(JSON.stringify({...report,variant:'7 MiB upload-size fixture',sha256:createHash('sha256').update(padded).digest('hex')}));
}finally{await rm(directory,{recursive:true,force:true});}
