import {build} from '../node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/lib/main.js';
import {readFile,writeFile,mkdir,copyFile,readdir,stat,realpath} from 'node:fs/promises';
import {resolve,dirname,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),name='Arkhe-E01-Verifier-0.1.0-windows-x64',out=resolve('dist',name);
await mkdir(out); // refuse overwrite or mixed releases
for(const dir of ['lib','runtime','wasm','fixtures','licenses'])await mkdir(join(out,dir));
const options={bundle:true,platform:'node',format:'esm',target:'node24',metafile:true,
  nodePaths:[resolve('integrations/verify-mcp/node_modules')],legalComments:'eof',
  banner:{js:'import {createRequire as __kitCreateRequire} from "node:module";const require=__kitCreateRequire(import.meta.url);'}};
const metadata=[];
for(const [entry,file]of [['integrations/verify-mcp/dist/index.js','server.mjs'],['packaging/e01/cli.mjs','cli.mjs']]) {
  const result=await build({...options,entryPoints:[resolve(entry)],outfile:join(out,'lib',file)});metadata.push(result.metafile);
}
await copyFile(process.execPath,join(out,'runtime/node.exe'));
await copyFile('dist/Arkhe-0.1.0-evaluation-windows-x64/licenses/Node-24.13.0-LICENSE.txt',join(out,'licenses/Node-LICENSE.txt'));
for(const file of ['arkhe_verify_wasm.js','arkhe_verify_wasm_bg.wasm','package.json'])
  await copyFile(resolve('verification/crates/arkhe-verify-wasm/pkg',file),join(out,'wasm',file));
await copyFile('packaging/e01/TUTORIAL.md',join(out,'TUTORIAL.md'));
await copyFile('verification/docs/MMR-PROFILE.md',join(out,'MMR-PROFILE.md'));
await writeFile(join(out,'server.mjs'),'import {fileURLToPath} from "node:url";\nprocess.env.ARKHE_VERIFY_WASM_MODULE=fileURLToPath(new URL("./wasm/arkhe_verify_wasm.js",import.meta.url));\nawait import("./lib/server.mjs");\n');
for(const [cmd,script]of [['arkhe-verify','lib\\cli.mjs'],['mcp-server','server.mjs']])
  await writeFile(join(out,cmd+'.cmd'),'@echo off\r\n"%~dp0runtime\\node.exe" "%~dp0'+script+'" %*\r\nexit /b %errorlevel%\r\n');
const vector=JSON.parse(await readFile('verification/vectors/mmr/3-leaves.json','utf8'));
const proof=vector.expected_output.proofs[0];
const positive={leafHex:vector.input.leaves[proof.target_index],leafCount:3,expectedRootHex:vector.expected_output.root_hash_hex,
  proof:proof.inclusion_proof_hashes.map((hashHex,i)=>({hashHex,kind:proof.inclusion_proof_kinds[i],direction:proof.inclusion_proof_directions[i]}))};
const negative=structuredClone(positive);negative.leafHex='ff';
for(const [file,value]of [['A',positive],['B',negative]])await writeFile(join(out,'fixtures',file+'.json'),JSON.stringify(value,null,2)+'\n');
// Collect notices from every bundled third-party package, without shipping host node_modules.
const packages=new Map();
for(const meta of metadata)for(const input of Object.keys(meta.inputs)) {
  let dir=dirname(await realpath(resolve(input)));
  while(dir!==dirname(dir)) {
    try {
      const pkg=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));
      if(pkg.name&&input.includes('node_modules'))packages.set(pkg.name+'@'+pkg.version,{dir,pkg});
      break;
    }catch{dir=dirname(dir);}
  }
}
const dependencies=[];
for(const [id,{dir,pkg}]of packages) {
  const notices=(await readdir(dir)).filter(f=>/^(license|licence|copying|notice)(\.|$)/i.test(f));
  if(!notices.length)throw new Error('missing license notice for '+id);
  const folder=id.replaceAll('/','_').replaceAll('@','_');await mkdir(join(out,'licenses',folder));
  for(const file of notices)if((await stat(join(dir,file))).isFile())await copyFile(join(dir,file),join(out,'licenses',folder,file));
  dependencies.push({name:pkg.name,version:pkg.version,declared_license:pkg.license??null});
}
await writeFile(join(out,'licenses/dependencies.json'),JSON.stringify(dependencies,null,2)+'\n');
const files={};
async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){
 const path=join(dir,item.name);if(item.isDirectory())await walk(path);else files[relative(out,path).replaceAll('\\','/')]=createHash('sha256').update(await readFile(path)).digest('hex');
}}
await walk(out);
await writeFile(join(out,'manifest.json'),JSON.stringify({schema:1,kit:name,version:'0.1.0',profile:'E01_MCP_WASM_VERIFICATION',
  node:process.version,authority:false,publisher_signature:'NOT_PERFORMED',files},null,2)+'\n');
await mkdir('ops/local/e01-kit',{recursive:true});
await writeFile('ops/local/e01-kit/bundle-metafiles.json',JSON.stringify(metadata,null,2));
console.log(JSON.stringify({directory:out,files:Object.keys(files).length,third_party_packages:dependencies.length}));
