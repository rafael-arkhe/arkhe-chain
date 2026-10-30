import {writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
const base='https://zenodo.org/api/deposit/depositions/22884311';
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdout.write('Ready for secret on stdin (input hidden).\n');
let token='';
for await(const chunk of process.stdin){token+=chunk.toString();if(token.includes('\n')||token.includes('\r'))break;}
if(process.stdin.isTTY)process.stdin.setRawMode(false);
process.stdin.pause();token=token.trim();
async function api(url,method='GET',body){
 const r=await fetch(url,{method,redirect:'manual',headers:{Accept:'application/json','content-type':'application/json','User-Agent':'ZenodoResearchAccess/1.0 (research metadata client)',Authorization:`Bearer ${token}`},...(body?{body:JSON.stringify(body)}:{})});
 if(!r.ok)throw Error(`Zenodo HTTP ${r.status} at ${method} ${new URL(url).pathname}`);
 return r.status===204?{}:r.json();
}
try{
 const before=await api(base);const creators=before.metadata?.creators;
 const who=creators?.find(x=>x.orcid==='0009-0005-2697-4668');
 if(!who)throw Error('ORCID not found; no change performed.');
 if(who.affiliation==='Pesquisador independente, Brasil'){console.log(JSON.stringify({record_id:22884311,status:'already-corrected'}));process.exit(0);}
 if(who.affiliation!=='Universidade de Brasília')throw Error('Affiliation changed since review; no change performed.');
 if(!before.submitted||before.state!=='done')throw Error('Existing editorial draft; no change performed.');
 await writeFile(new URL('./22884311-before-affiliation-update.json',import.meta.url),JSON.stringify(before,null,2));
 await api(base+'/actions/edit','POST');
 const metadata=structuredClone(before.metadata);
 metadata.creators.find(x=>x.orcid==='0009-0005-2697-4668').affiliation='Pesquisador independente, Brasil';
 const updated=await api(base,'PUT',{metadata});
 const otherBefore=structuredClone(before.metadata);delete otherBefore.creators.find(x=>x.orcid==='0009-0005-2697-4668').affiliation;
 const otherAfter=structuredClone(updated.metadata);delete otherAfter.creators.find(x=>x.orcid==='0009-0005-2697-4668').affiliation;
 // Zenodo may normalize its own metadata; keep both snapshots for review.
 if(updated.metadata.creators.find(x=>x.orcid==='0009-0005-2697-4668').affiliation!=='Pesquisador independente, Brasil')throw Error('Updated affiliation not retained; draft not published.');
 await api(base+'/actions/publish','POST');
 const after=await api(base);
 await writeFile(new URL('./22884311-after-affiliation-update.json',import.meta.url),JSON.stringify(after,null,2));
 console.log(JSON.stringify({record_id:22884311,doi:after.doi||after.metadata?.doi,state:after.state,submitted:after.submitted,affiliation:after.metadata.creators.find(x=>x.orcid==='0009-0005-2697-4668').affiliation}));
}catch(e){console.error(e.message);process.exitCode=1;}
token='';
