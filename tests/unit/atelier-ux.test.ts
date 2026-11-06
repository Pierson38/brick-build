import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  clampSide, DEFAULT_SIDE, keyResize, MIN_SIDE, MIN_VIEW, parseLayout, ratioOf, sideBounds, sideWidth, SPLITTER,
} from '@/domain/ui/panel-layout';
import { framing } from '@/infra/ldraw/part-thumbnails';

describe('atelier separator: widths', () => {
  it('keeps the default widths of P5–P7 until the user moves the separator', () => {
    expect(sideWidth(null, 1280, 'atelier')).toBe(DEFAULT_SIDE.atelier);
    expect(sideWidth(null, 1280, 'editor')).toBe(DEFAULT_SIDE.editor);
  });

  it.each([1280, 1440, 1512, 1728, 1920])('on a %i px window both panels keep a usable width', (w) => {
    const b = sideBounds(w);
    expect(b.min).toBe(MIN_SIDE);
    expect(w - SPLITTER - b.max).toBe(MIN_VIEW);
    expect(clampSide(10_000, w)).toBe(b.max);
    expect(clampSide(0, w)).toBe(MIN_SIDE);
  });

  it('narrow windows: the 3D view keeps priority, nothing becomes negative or crossed', () => {
    for (const w of [0, 100, 400, 600, 700, 900]) {
      const b = sideBounds(w);
      expect(b.min).toBeGreaterThanOrEqual(0);
      expect(b.max).toBeGreaterThanOrEqual(b.min);
      expect(clampSide(400, w) + SPLITTER).toBeLessThanOrEqual(Math.max(w, SPLITTER + b.min));
    }
    expect(sideBounds(600).max).toBe(600 - SPLITTER - MIN_VIEW);
  });

  it('the choice is kept as a proportion and follows a window resize', () => {
    const r = ratioOf(600, 1280);
    expect(sideWidth(r, 1280, 'atelier')).toBe(600);
    expect(sideWidth(r, 1920, 'atelier')).toBe(Math.round(600 * (1920 - SPLITTER) / (1280 - SPLITTER)));
    // a wide notice on a large screen stays within bounds on a smaller one
    expect(sideWidth(ratioOf(1500, 1920), 1280, 'atelier')).toBe(1280 - SPLITTER - MIN_VIEW);
  });

  it('keyboard: arrows move the separator (the side panel is on the right), Shift goes faster, Home/End, Enter = default', () => {
    expect(keyResize('ArrowLeft', false, 400, 1280, 'atelier')).toBe(416);
    expect(keyResize('ArrowRight', false, 400, 1280, 'atelier')).toBe(384);
    expect(keyResize('ArrowLeft', true, 400, 1280, 'atelier')).toBe(480);
    expect(keyResize('Home', false, 400, 1280, 'atelier')).toBe(sideBounds(1280).max);
    expect(keyResize('End', false, 400, 1280, 'atelier')).toBe(MIN_SIDE);
    expect(keyResize('Enter', false, 700, 1280, 'editor')).toBe(DEFAULT_SIDE.editor);
    expect(keyResize('ArrowRight', false, MIN_SIDE, 1280, 'atelier')).toBe(MIN_SIDE);
    expect(keyResize('r', false, 400, 1280, 'atelier')).toBeNull(); // atelier shortcuts are untouched
    expect(keyResize('PageUp', false, 400, 1280, 'atelier')).toBeNull();
  });

  it('stored preference is untrusted: anything odd falls back to the defaults', () => {
    expect(parseLayout(null)).toEqual({ atelier: null, editor: null });
    expect(parseLayout('{"atelier":0.4,"editor":0.5}')).toEqual({ atelier: 0.4, editor: 0.5 });
    for (const bad of ['not json', '[]', '{"atelier":2}', '{"atelier":-1,"editor":"0.5"}', '{"atelier":null}', 'x'.repeat(2000), '{"__proto__":{"atelier":0.4}}']) {
      expect(parseLayout(bad)).toEqual({ atelier: null, editor: null });
    }
  });
});

describe('part thumbnails: isometric framing', () => {
  it.each([
    ['brick 2×4', new Box3(new Vector3(-40, 0, -20), new Vector3(40, 28, 20))],
    ['plate 16×16', new Box3(new Vector3(-160, 0, -160), new Vector3(160, 8, 160))],
    ['round 1×1', new Box3(new Vector3(-10, 0, -10), new Vector3(10, 8, 10))],
    ['antenna', new Box3(new Vector3(-2, -100, -2), new Vector3(2, 0, 2))],
  ])('%s: the whole part is inside the square view, whatever the direction', (_name, box) => {
    const f = framing(box);
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
    // orthographic projection on any plane through the centre stays within the bounding sphere
    for (const c of corners) expect(c.distanceTo(f.center)).toBeLessThanOrEqual(f.half);
    expect(f.distance).toBeGreaterThan(f.half * 2); // the camera is outside the part
  });
});
