import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
for(const [cmd,args] of [
 ['cargo',['build','--locked','--release','--target','wasm32-unknown-unknown','-p','arkhe-pix-wasm']],
 ['wasm-bindgen',['target/wasm32-unknown-unknown/release/arkhe_pix_wasm.wasm','--target','web','--out-dir','site/wasm']],
 ['wasm-bindgen',['target/wasm32-unknown-unknown/release/arkhe_pix_wasm.wasm','--target','nodejs','--out-dir','pkg']]
]){const run=spawnSync(cmd,args,{cwd,stdio:'inherit',timeout:600000});if(run.error||run.status!==0)throw new Error(`${cmd} failed`);}
writeFileSync(new URL('../pkg/package.json',import.meta.url),'{"type":"commonjs","private":true}');
