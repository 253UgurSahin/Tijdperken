// Test het rekenwerk van het instorten: de val, de puinhoop en de schadetrappen.
import { describe, expect, it } from 'vitest';
import { COLLAPSE_TIME, collapseAt, damageTier, rubbleLayout, tiltSign } from '../src/util/collapse';

describe('instorten', () => {
  it('begint heel en eindigt laag, gezakt en scheef', () => {
    expect(collapseAt(0)).toEqual({ scaleY: 1, sink: 0, tilt: 0 });
    const end = collapseAt(COLLAPSE_TIME);
    expect(end.scaleY).toBeCloseTo(0.15);
    expect(end.sink).toBeCloseTo(-0.1);
    expect(end.tilt).toBeCloseTo(0.15);
    // Daarna blijft het zo
    expect(collapseAt(5)).toEqual(end);
  });
  it('valt steeds verder (nooit terug omhoog)', () => {
    let prev = collapseAt(0);
    for (let t = 0.05; t <= COLLAPSE_TIME + 0.01; t += 0.05) {
      const p = collapseAt(t);
      expect(p.scaleY).toBeLessThanOrEqual(prev.scaleY);
      expect(p.sink).toBeLessThanOrEqual(prev.sink);
      expect(p.tilt).toBeGreaterThanOrEqual(prev.tilt);
      prev = p;
    }
  });
  it('valt per gebouw altijd naar dezelfde kant', () => {
    for (let id = 1; id < 50; id++) {
      expect(tiltSign(id)).toBe(tiltSign(id));
      expect([-1, 1]).toContain(tiltSign(id));
    }
    const sides = new Set(Array.from({ length: 50 }, (_, i) => tiltSign(i)));
    expect(sides.size).toBe(2);
  });
});

describe('puinhoop', () => {
  it('heeft 4 tot 7 brokken, allemaal binnen 0,9 maal de breedte', () => {
    for (const size of [1, 2, 3, 4])
      for (let seed = 1; seed < 80; seed++) {
        const chunks = rubbleLayout(size, seed);
        expect(chunks.length).toBeGreaterThanOrEqual(4);
        expect(chunks.length).toBeLessThanOrEqual(7);
        for (const c of chunks) {
          expect(c.s).toBeGreaterThan(0);
          expect(Math.abs(c.x) + c.s).toBeLessThanOrEqual(size * 0.45 + 1e-9);
          expect(Math.abs(c.z) + c.s).toBeLessThanOrEqual(size * 0.45 + 1e-9);
        }
      }
  });
  it('is voor hetzelfde gebouw altijd gelijk', () => {
    expect(rubbleLayout(2, 7)).toEqual(rubbleLayout(2, 7));
  });
});

describe('schade', () => {
  it('rookt onder de helft en brandt onder een kwart', () => {
    expect(damageTier(100, 100)).toBe(0);
    expect(damageTier(60, 100)).toBe(0);
    expect(damageTier(40, 100)).toBe(1);
    expect(damageTier(20, 100)).toBe(2);
    expect(damageTier(5, 0)).toBe(0);
  });
});
