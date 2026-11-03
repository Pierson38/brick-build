// Checks that LDRAW_LIBRARY_DIR (from the environment or .env.local) points to an LDraw parts library.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

let dir = process.env.LDRAW_LIBRARY_DIR;
if (!dir && existsSync('.env.local')) {
  const line = readFileSync('.env.local', 'utf8').split('\n').find((l) => l.startsWith('LDRAW_LIBRARY_DIR='));
  dir = line?.slice('LDRAW_LIBRARY_DIR='.length).trim();
}
if (!dir) {
  console.error('LDRAW_LIBRARY_DIR absent (ni variable d’environnement, ni .env.local).');
  process.exit(1);
}
const checks = ['LDConfig.ldr', 'parts/3001.dat', 'p/stud.dat', 'parts/s/3001s01.dat'];
let ok = true;
for (const rel of checks) {
  const found = existsSync(path.join(dir, rel));
  ok &&= found;
  console.log(`${found ? 'OK     ' : 'ABSENT '} ${path.join(dir, rel)}`);
}
const license = path.join(dir, 'CAreadme.txt');
if (existsSync(license)) console.log('Licence de la bibliothèque : voir', license);
process.exit(ok ? 0 : 1);
