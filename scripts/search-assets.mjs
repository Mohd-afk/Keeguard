import { readFileSync } from 'fs';
import { resolve } from 'path';

const file = resolve('d:/PYTHON/Password Manager/dist/assets/index.js');
console.log('Reading file:', file);

const content = readFileSync(file, 'utf8');

const queries = ['autofillSaveRequest', 'SmartCategorizer', 'AutofillBridge', '4.0.5', '4.0.4', 'ml_worker'];

for (const q of queries) {
  const index = content.indexOf(q);
  console.log(`Query "${q}":`, index !== -1 ? `FOUND at index ${index}` : 'NOT FOUND');
}
process.exit(0);
