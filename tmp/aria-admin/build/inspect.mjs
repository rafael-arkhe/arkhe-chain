import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const w=await SpreadsheetFile.importXlsx(await FileBlob.load('../cost.xlsx'));
console.log((await w.inspect({kind:'sheet',include:'id,name',maxChars:2000})).ndjson);
const b=await w.render({sheetName:'1. Basic Info',range:'B4:F25',scale:1.5,format:'png'});
await fs.writeFile('../template-before.png',new Uint8Array(await b.arrayBuffer()));
console.log('rendered');
