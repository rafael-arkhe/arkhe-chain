import { mkdirSync, writeFileSync, readFileSync, lstatSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { local } from './paths.mjs';
import { db } from './store.mjs';
import { demand } from './documents.mjs';
import { hash, canonical } from './evaluation-core.mjs';
const directory=join(local,'evaluation-artifacts');
export function evaluationTables() {
  db().exec(`CREATE TABLE IF NOT EXISTS evaluation_artifacts(id TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS no_artifact_update BEFORE UPDATE ON evaluation_artifacts BEGIN SELECT RAISE(ABORT,'immutable artifact'); END;
    CREATE TRIGGER IF NOT EXISTS no_artifact_delete BEFORE DELETE ON evaluation_artifacts BEGIN SELECT RAISE(ABORT,'immutable artifact'); END;
    CREATE TABLE IF NOT EXISTS evaluation_studies(id TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS evaluation_cycles(id TEXT PRIMARY KEY,study_id TEXT NOT NULL,value TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS freeze_study_baseline BEFORE UPDATE ON evaluation_studies WHEN
      json_extract(OLD.value,'$.baseline') IS NOT json_extract(NEW.value,'$.baseline') OR
      json_extract(OLD.value,'$.image') IS NOT json_extract(NEW.value,'$.image') OR
      json_extract(OLD.value,'$.evaluator') IS NOT json_extract(NEW.value,'$.evaluator') OR
      json_extract(OLD.value,'$.policy') IS NOT json_extract(NEW.value,'$.policy') OR
      (json_extract(OLD.value,'$.baselineReportDigest') IS NOT NULL AND
       (json_extract(OLD.value,'$.baselineReportDigest') IS NOT json_extract(NEW.value,'$.baselineReportDigest') OR
        json_extract(OLD.value,'$.baselineReport') IS NOT json_extract(NEW.value,'$.baselineReport')))
      BEGIN SELECT RAISE(ABORT,'immutable baseline'); END;
    CREATE TRIGGER IF NOT EXISTS freeze_cycle_evidence BEFORE UPDATE ON evaluation_cycles WHEN
      OLD.study_id IS NOT NEW.study_id OR
      json_extract(OLD.value,'$.candidate') IS NOT json_extract(NEW.value,'$.candidate') OR
      json_extract(OLD.value,'$.incumbent') IS NOT json_extract(NEW.value,'$.incumbent') OR
      json_extract(OLD.value,'$.revision') IS NOT json_extract(NEW.value,'$.revision') OR
      (json_extract(OLD.value,'$.state') != 'measuring' AND
       (json_extract(OLD.value,'$.report') IS NOT json_extract(NEW.value,'$.report') OR
        json_extract(OLD.value,'$.evidenceDigest') IS NOT json_extract(NEW.value,'$.evidenceDigest')))
      BEGIN SELECT RAISE(ABORT,'immutable evaluation evidence'); END;
    CREATE TABLE IF NOT EXISTS evaluation_secrets(id TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS evaluation_history(seq INTEGER PRIMARY KEY AUTOINCREMENT,study_id TEXT NOT NULL,value TEXT NOT NULL,previous TEXT NOT NULL,hash TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS no_evaluation_history_update BEFORE UPDATE ON evaluation_history BEGIN SELECT RAISE(ABORT,'append only'); END;
    CREATE TRIGGER IF NOT EXISTS no_evaluation_history_delete BEFORE DELETE ON evaluation_history BEGIN SELECT RAISE(ABORT,'append only'); END;`);
}
function safePath(path) {return typeof path==='string' && /^(Cargo\.(toml|lock)|(kernel|cognition|governance|work|evidence|orchestration|storage\/sql|verification\/crates|integration)\/[A-Za-z0-9_./-]+)$/.test(path) && !path.split('/').some(part=>part==='..'||part==='.'||part==='');}
export function freezeArtifact(snapshot,manifest) {
  evaluationTables(); mkdirSync(directory,{recursive:true});
  const normalized=Object.fromEntries(Object.entries(manifest).sort(([a],[b])=>a.localeCompare(b,'en')));
  demand(Object.keys(normalized).length>0&&Object.keys(normalized).length<=5000,422,'Manifesto inválido.');
  let total=0;
  for(const [path,digest] of Object.entries(normalized)) {
    demand(safePath(path)&&/^[a-f0-9]{64}$/.test(digest),422,'Caminho ou hash inválido.');
    demand(lstatSync(join(snapshot,path)).isFile()&&!lstatSync(join(snapshot,path)).isSymbolicLink(),422,'Snapshot não regular.');
    const bytes=readFileSync(join(snapshot,path));total+=bytes.length;demand(total<=50*1024*1024&&hash(bytes)===digest,409,'Fonte diverge do manifesto.');
    const blob=join(directory,digest);
    try{writeFileSync(blob,bytes,{flag:'wx',mode:0o400});}catch(error){if(error.code!=='EEXIST')throw error;demand(hash(readFileSync(blob))===digest,409,'Artefato congelado corrompido.');}
  }
  const id=hash(normalized);
  db().prepare('INSERT OR IGNORE INTO evaluation_artifacts(id,value) VALUES(?,?)').run(id,canonical(normalized));
  return id;
}
export function artifactManifest(id) {
  evaluationTables();demand(/^[a-f0-9]{64}$/.test(id||''),400,'Artefato inválido.');
  const row=db().prepare('SELECT value FROM evaluation_artifacts WHERE id=?').get(id);demand(row,404,'Artefato não encontrado.');
  const manifest=JSON.parse(row.value);demand(hash(manifest)===id,409,'Manifesto congelado alterado.');return manifest;
}
export function checkoutArtifact(id,destination) {
  const manifest=artifactManifest(id);
  for(const [path,digest] of Object.entries(manifest)) {
    demand(safePath(path)&&/^[a-f0-9]{64}$/.test(digest),409,'Manifesto inválido.');
    const bytes=readFileSync(join(directory,digest));demand(hash(bytes)===digest,409,'Artefato congelado corrompido.');
    mkdirSync(dirname(join(destination,path)),{recursive:true});writeFileSync(join(destination,path),bytes,{flag:'wx'});
  }
  return manifest;
}
