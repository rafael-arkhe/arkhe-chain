import {mkdirSync,copyFileSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source=new URL('../../../integration/arkhe-pix/site/wasm/',import.meta.url),target=new URL('../public/pix/',import.meta.url);
mkdirSync(target,{recursive:true});const files={};
for(const name of ['arkhe_pix_wasm.js','arkhe_pix_wasm_bg.wasm']){copyFileSync(new URL(name,source),new URL(name,target));files[name]=createHash('sha256').update(readFileSync(new URL(name,target))).digest('hex');}
writeFileSync(new URL('manifest.json',target),JSON.stringify({profile:'arkhe-pix-receipt@1',label:'synthetic-poc',unsigned:true,files},null,2)+'\n');
console.log('Pix browser assets synchronized; SHA-256 manifest is unsigned.');

const serverSource=new URL('../../../integration/arkhe-pix/pkg/',import.meta.url),serverTarget=new URL('../lib/pix-runtime/',import.meta.url);
mkdirSync(serverTarget,{recursive:true});
copyFileSync(new URL('arkhe_pix_wasm.js',serverSource),new URL('arkhe_pix_wasm.cjs',serverTarget));
copyFileSync(new URL('arkhe_pix_wasm_bg.wasm',serverSource),new URL('arkhe_pix_wasm_bg.wasm',serverTarget));
if(createHash('sha256').update(readFileSync(new URL('arkhe_pix_wasm_bg.wasm',serverTarget))).digest('hex')!==files['arkhe_pix_wasm_bg.wasm'])throw new Error('Client/server Pix WASM mismatch');
