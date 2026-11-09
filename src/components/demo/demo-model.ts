/**
 * Demo model of the first launch (« Essayer la démo ») : fixtures/mini-4-pieces.mpd, an original
 * CC0 model of the project, embedded so that the demo needs no file and no request. Kept identical
 * to the fixture by tests/unit/demo-model.test.ts.
 */
export const DEMO_ID = 'mini-4';
export const DEMO_MODEL = {
  fileName: 'mini-4-pieces.mpd',
  text: "0 FILE mini-4-pieces.mpd\n0 Miniature de test — 4 briques, 2 étapes\n0 Name: mini-4-pieces.mpd\n0 Author: Brick Lab Local - test original\n0 !LICENSE CC0-1.0\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n1 1 80 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n0 STEP\n1 2 0 -24 0 1 0 0 0 1 0 0 0 1 3001.dat\n1 14 80 -24 0 1 0 0 0 1 0 0 0 1 3001.dat\n0 STEP\n0 NOFILE\n",
} as const;
