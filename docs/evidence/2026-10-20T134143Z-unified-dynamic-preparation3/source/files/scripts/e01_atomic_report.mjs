import {open,rename} from 'node:fs/promises';
export const REPLACE_ATTEMPTS=6;
export const REPLACE_BACKOFF_MS=25;
export async function writeReport(path,value,{replace=rename,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
  const temp=path+'.tmp',file=await open(temp,'w');
  try {await file.writeFile(JSON.stringify(value,null,2)+'\n');await file.sync();}
  finally {await file.close();}
  for(let i=0;i<REPLACE_ATTEMPTS;i++) {
    try {await replace(temp,path);return;}
    catch(error) {
      if(!['EPERM','EACCES','EBUSY'].includes(error.code)||i===REPLACE_ATTEMPTS-1)throw error;
      await sleep(REPLACE_BACKOFF_MS*2**i);
    }
  }
}
