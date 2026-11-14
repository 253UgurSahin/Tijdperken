import { describe, expect, it } from 'vitest';
import { SUN_MIN_EL, SUN_NOON, sunDirAt } from '../src/util/sunpath';

describe('zonnebaan', () => {
  it('staat om 12 uur precies waar de zon altijd stond', () => {
    const d = sunDirAt(12);
    for (let i = 0; i < 3; i++) expect(d[i]).toBeCloseTo(SUN_NOON[i], 6);
  });
  it('komt nooit lager dan 19 graden en heeft altijd lengte 1', () => {
    for (let h = 0; h < 24; h += 0.25) {
      const d = sunDirAt(h);
      expect(Math.asin(d[1])).toBeGreaterThanOrEqual(SUN_MIN_EL - 1e-9);
      expect(Math.hypot(...d)).toBeCloseTo(1, 9);
    }
  });
  it("draait 's ochtends minder ver weg dan 's avonds", () => {
    // Hoek tussen de zonrichting op de grond om 12 uur en op een ander uur
    const turn = (h: number) => {
      const a = sunDirAt(h),
        b = SUN_NOON;
      return Math.acos((a[0] * b[0] + a[2] * b[2]) / Math.hypot(a[0], a[2]) / Math.hypot(b[0], b[2]));
    };
    expect(turn(5.5)).toBeCloseTo((32 * Math.PI) / 180, 6);
    expect(turn(20)).toBeCloseTo((65 * Math.PI) / 180, 6);
  });
  it('de vaste middagrichting kan niet veranderen', () => {
    expect(Object.isFrozen(SUN_NOON)).toBe(true);
  });
});
