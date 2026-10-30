import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ApexParserFactory, ApexErrorListener } from '@apexdevtools/apex-parser';
let failures = 0;
const root = fileURLToPath(new URL('../force-app/main/default/', import.meta.url));
class Errors extends ApexErrorListener {
  constructor(file) { super(); this.file = file; }
  apexSyntaxError(line, column, message) {
    failures++; console.error(`${this.file}:${line}:${column} ${message}`);
  }
}
let count = 0;
for (const [folder, extension] of [['classes', '.cls'], ['triggers', '.trigger']]) {
  for (const file of await readdir(path.join(root, folder))) {
    if (!file.endsWith(extension)) continue;
    const source = await readFile(path.join(root, folder, file), 'utf8');
    const { parser } = ApexParserFactory.createLexerAndParser(source, new Errors(file));
    if (extension === '.cls') parser.compilationUnit(); else parser.triggerUnit();
    count++;
  }
}
if (failures) process.exitCode = 1;
else console.log(`Syntax accepted for ${count} Apex files; Salesforce compilation and execution still required.`);
