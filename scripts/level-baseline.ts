// Exact key count of the PREVIOUS placement scheme (P5 v1): on pick, the layer defaults to the
// lowest layer holding a compatible open target; the player then presses PageUp/PageDown once per
// layer step to reach the target layer. Usage: npx tsx scripts/level-baseline.ts <model.mpd>
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { candidates, createSession, placeExact, type BuildContext, type BuildMode } from '../src/domain/build/engine';
import { analyzeModel } from '../src/domain/import/analyze';

const file = process.argv[2]!;
const a = analyzeModel(readFileSync(file, 'utf8'), path.basename(file));
const ctx: BuildContext = { occurrences: a.model.occurrences, plan: a.plan };
const layers = [...new Set(a.model.occurrences.map((o) => Math.round(o.targetMatrix[13])))].sort((x, y) => y - x);

function run(mode: BuildMode, order: 'natural' | 'reverse'): number {
  let s = createSession(mode);
  let keys = 0;
  while (s.placed.length < ctx.occurrences.length) {
    const open = candidates(ctx, s);
    const target = order === 'natural' ? open[0]! : open[open.length - 1]!;
    const compatible = open.filter((o) => o.partKey === target.partKey && o.colorCode === target.colorCode);
    const start = Math.max(...compatible.map((o) => Math.round(o.targetMatrix[13])));
    keys += Math.abs(layers.indexOf(start) - layers.indexOf(Math.round(target.targetMatrix[13])));
    const r = placeExact(ctx, s, target.occurrenceId);
    if (!r.ok) throw new Error('unexpected');
    s = r.session;
  }
  return keys;
}
console.log(JSON.stringify({ file: path.basename(file), layers: layers.length, guided: run('guided', 'natural'), freeNatural: run('freeManual', 'natural'), freeReverse: run('freeManual', 'reverse') }));
