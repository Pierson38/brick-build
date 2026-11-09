import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEMO_MODEL } from '../../src/components/demo/demo-model';

describe('demo model', () => {
  it('is byte for byte the CC0 fixture mini-4-pieces.mpd', () => {
    const fixture = readFileSync(fileURLToPath(new URL('../../fixtures/mini-4-pieces.mpd', import.meta.url)), 'utf8');
    expect(DEMO_MODEL.fileName).toBe('mini-4-pieces.mpd');
    expect(DEMO_MODEL.text).toBe(fixture);
    expect(fixture).toMatch(/CC0/);
  });
});
