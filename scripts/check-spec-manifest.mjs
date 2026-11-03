// Verifies the specification files against DOSSIER_MANIFEST.json.
// Fails on any deviation not declared in docs/implementation/spec-deviations.json.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('DOSSIER_MANIFEST.json', 'utf8'));
const { deviations } = JSON.parse(readFileSync('docs/implementation/spec-deviations.json', 'utf8'));
const declared = new Map(deviations.map((d) => [d.path, d]));
let failures = 0;

for (const { path, sha256 } of manifest.files) {
  const actual = existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : 'ABSENT';
  const deviation = declared.get(path);
  if (actual === sha256) {
    if (deviation) {
      console.log(`STALE   ${path} (écart déclaré mais fichier identique à la spec : retirer la déclaration)`);
      failures++;
    } else console.log(`OK      ${path}`);
  } else if (deviation && deviation.manifestSha256 === sha256) {
    console.log(`DÉCLARÉ ${path} — ${deviation.reason}`);
  } else {
    console.log(`ÉCART   ${path} (non déclaré dans docs/implementation/spec-deviations.json)`);
    failures++;
  }
}
process.exit(failures === 0 ? 0 : 1);
