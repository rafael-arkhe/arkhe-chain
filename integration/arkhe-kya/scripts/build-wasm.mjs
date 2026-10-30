import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
for (const [command,args] of [
  ['cargo',['build','--manifest-path','Cargo.toml','--locked','--target','wasm32-unknown-unknown','--release','--lib']],
  ['wasm-bindgen',['target/wasm32-unknown-unknown/release/arkhe_kya_experimental.wasm','--target','nodejs','--out-dir','pkg']],
]) {
  const result=spawnSync(command,args,{cwd:root,stdio:'inherit',timeout:600000});
  if(result.error || result.status!==0) throw new Error(`${command}: ${result.error?.message??result.status}`);
}
writeFileSync(new URL('../pkg/package.json',import.meta.url),JSON.stringify({type:'commonjs',private:true})+'\n');
