import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,relative,isAbsolute} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const [command,input]=process.argv.slice(2);
try {
  if(command==='doctor') {
    const manifest=JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8'));
    for(const [path,digest]of Object.entries(manifest.files)) {
      const target=resolve(root,path),rel=relative(root,target);
      if(rel.startsWith('..')||isAbsolute(rel))throw new Error('unsafe manifest path');
      if(createHash('sha256').update(await readFile(target)).digest('hex')!==digest)throw new Error(`integrity mismatch: ${path}`);
    }
    console.log(JSON.stringify({status:'PASS',kit:manifest.kit,version:manifest.version,
      files_checked:Object.keys(manifest.files).length,publisher_signature:'NOT_PERFORMED',authority:false}));
  } else if(command==='verify'&&input) {
    const request=JSON.parse(await readFile(resolve(input),'utf8'));
    const client=new Client({name:'arkhe-e01-onboarding',version:'0.1.0'});
    const transport=new StdioClientTransport({command:process.execPath,args:[resolve(root,'server.mjs')],stderr:'pipe'});
    try {
      await client.connect(transport);
      const result=await client.callTool({name:'verify_mmr',arguments:request});
      if(result.isError)throw new Error('MCP tool rejected request');
      const outcome=JSON.parse(result.content[0].text);
      console.log(JSON.stringify(outcome,null,2));
      process.exitCode=outcome.inclusionVerified===true?0:1;
    }finally{await client.close();}
  } else {
    console.log('Arkhe E01 Verifier 0.1.0\narkhe-verify doctor\narkhe-verify verify <proof.json>\nExit: 0 valid/doctor PASS, 1 invalid proof, 2 input/tool error.\nInclusion relative to supplied root; no checkpoint authentication or execution authority.');
    if(command&&!['help','--help','-h'].includes(command))process.exitCode=2;
  }
}catch(error){console.error(JSON.stringify({status:'ERROR',message:error.message,authority:false}));process.exitCode=2;}
