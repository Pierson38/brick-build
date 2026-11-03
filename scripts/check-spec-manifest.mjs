// Verifies the specification files against DOSSIER_MANIFEST.json (v1.0, immutable).
// A file may differ from the manifest only if docs/implementation/spec-deviations.json declares it
// with BOTH the manifest hash and the exact current hash: any further, undeclared edit fails.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const sha = (path) => (existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : 'ABSENT');
const manifest = JSON.parse(readFileSync('DOSSIER_MANIFEST.json', 'utf8'));
const { deviations } = JSON.parse(readFileSync('docs/implementation/spec-deviations.json', 'utf8'));
const tracked = new Map(manifest.files.map((f) => [f.path, f.sha256]));
let failures = 0;
const fail = (msg) => { console.log(msg); failures++; };

const declared = new Map();
for (const d of deviations) {
  if (!tracked.has(d.path)) fail(`INVALIDE ${d.path} : absent du manifeste`);
  else if (declared.has(d.path)) fail(`INVALIDE ${d.path} : déclaré deux fois`);
  else if (!/^[0-9a-f]{64}$/.test(d.currentSha256 ?? '')) fail(`INVALIDE ${d.path} : currentSha256 manquant`);
  else if (d.manifestSha256 !== tracked.get(d.path)) fail(`INVALIDE ${d.path} : manifestSha256 ne correspond pas au manifeste`);
  else if (!d.reason) fail(`INVALIDE ${d.path} : raison manquante`);
  declared.set(d.path, d);
}

for (const [path, expected] of tracked) {
  const actual = sha(path);
  const d = declared.get(path);
  if (actual === expected) {
    if (d) fail(`PÉRIMÉ  ${path} (écart déclaré mais fichier identique à la spec : retirer la déclaration)`);
    else console.log(`OK      ${path}`);
  } else if (d && d.currentSha256 === actual) {
    console.log(`DÉCLARÉ ${path} — ${d.reason}`);
  } else if (d) {
    fail(`MODIFIÉ ${path} (écart déclaré, mais le contenu a changé depuis : mettre à jour currentSha256 et la raison)`);
  } else {
    fail(`ÉCART   ${path} (non déclaré dans docs/implementation/spec-deviations.json)`);
  }
}
process.exit(failures === 0 ? 0 : 1);
