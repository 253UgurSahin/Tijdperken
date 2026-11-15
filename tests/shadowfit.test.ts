// Tests voor het passende vak van de schaduwkaart (util/shadowfit.ts).
import { describe, expect, it } from 'vitest';
import { fitShadowBox, lightBasis, type ShadowFitOptions } from '../src/util/shadowfit';
import { sunDirAt } from '../src/util/sunpath';

type Vec3 = [number, number, number];
const OPTS: ShadowFitOptions = { minHalf: 6, maxHalf: 69, step: 2, margin: 0.5 };
const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const MOON = norm([0.62, 0.72, -0.3]);
const SUNS: Vec3[] = [sunDirAt(7), sunDirAt(12), sunDirAt(18.8), MOON];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Een voorspelbare reeks "toevallige" getallen, zodat de test elke keer hetzelfde doet
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/**
 * De 8 hoekpunten van het beeld (4 schermhoeken op de grond en op hoogte 4), zoals camera.ts ze uitrekent:
 * een camera op afstand d, kanteling pitch, draaiing yaw, kijkhoek 30 graden en verhouding aspect.
 */
function viewCorners(d: number, pitch: number, yaw: number, aspect: number, cx = 50, cz = 50): Vec3[] {
  const eye: Vec3 = [
    cx + Math.cos(pitch) * Math.sin(yaw) * d,
    Math.sin(pitch) * d,
    cz + Math.cos(pitch) * Math.cos(yaw) * d,
  ];
  const fwd = norm([cx - eye[0], -eye[1], cz - eye[2]]);
  // rechts = vooruit × omhoog (de wereld-y)
  const right = norm([-fwd[2], 0, fwd[0]]);
  const up: Vec3 = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];
  const ty = Math.tan((15 * Math.PI) / 180),
    tx = ty * aspect;
  const out: Vec3[] = [];
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const dir = norm([
      fwd[0] + right[0] * sx * tx + up[0] * sy * ty,
      fwd[1] + right[1] * sx * tx + up[1] * sy * ty,
      fwd[2] + right[2] * sx * tx + up[2] * sy * ty,
    ]);
    for (const h of [0, 4]) {
      const t = (h - eye[1]) / dir[1];
      out.push([eye[0] + dir[0] * t, h, eye[2] + dir[2] * t]);
    }
  }
  return out;
}

describe('passend schaduwvak', () => {
  it('bevat altijd alle punten, voor ochtend, middag, avond en maan', () => {
    const rnd = seeded(7);
    for (const sun of SUNS) {
      const { right, up } = lightBasis(sun);
      for (let round = 0; round < 40; round++) {
        const pts: Vec3[] = [];
        const ox = rnd() * 100,
          oz = rnd() * 100,
          spread = 2 + rnd() * 40;
        for (let i = 0; i < 8; i++) pts.push([ox + rnd() * spread, rnd() * 4, oz + rnd() * spread]);
        const box = fitShadowBox(pts, sun, OPTS);
        const c: Vec3 = [box.cx, 0, box.cz];
        for (const p of pts) {
          const rel: Vec3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
          expect(Math.abs(dot(rel, right))).toBeLessThanOrEqual(box.halfW);
          expect(Math.abs(dot(rel, up))).toBeLessThanOrEqual(box.halfH);
          // En de zon staat ver genoeg terug, en het vak is diep genoeg aan de andere kant
          expect(dot(rel, sun)).toBeLessThanOrEqual(box.depthBehind + 1e-9);
          expect(-dot(rel, sun)).toBeLessThanOrEqual(box.depthFront + 1e-9);
        }
      }
    }
  });

  it('is bij zoom 0,9 op een scherm van 1440×900 veel kleiner dan het oude vierkant (27)', () => {
    const pts = viewCorners(27 / 0.9, 0.9, Math.PI / 4, 1440 / 900);
    const box = fitShadowBox(pts, sunDirAt(12), OPTS);
    expect(box.halfW).toBeLessThanOrEqual(19);
    expect(box.halfH).toBeLessThanOrEqual(19);
    // Ingezoomd (zoom 2,2, de camera kijkt dan lager): het oude vierkant was 14
    const z = 2.2,
      k = Math.min(1, Math.max(0, Math.log(z / 1.05) / Math.log(2.4 / 1.05))),
      pitch = Math.max(0.6, 0.9 - 0.28 * k * k * (3 - 2 * k));
    const near = fitShadowBox(viewCorners(27 / z, pitch, Math.PI / 4, 1440 / 900), sunDirAt(12), OPTS);
    expect(near.halfW).toBeLessThanOrEqual(11);
  });

  it('verandert niet van maat als je het beeld een klein stukje verschuift', () => {
    const sun = sunDirAt(12);
    const pts = viewCorners(27 / 0.9, 0.9, Math.PI / 4, 1440 / 900);
    const a = fitShadowBox(pts, sun, OPTS);
    const moved = pts.map(p => [p[0] + 0.3, p[1], p[2] + 0.3] as Vec3);
    const b = fitShadowBox(moved, sun, OPTS);
    expect(b.halfW).toBe(a.halfW);
    expect(b.halfH).toBe(a.halfH);
    // Altijd een veelvoud van de stap
    expect(a.halfW % OPTS.step).toBe(0);
    expect(a.halfH % OPTS.step).toBe(0);
  });

  it('blijft tussen de kleinste en grootste maat', () => {
    const sun = sunDirAt(12);
    const tiny = fitShadowBox([[10, 0, 10]], sun, OPTS);
    expect(tiny.halfW).toBe(OPTS.minHalf);
    expect(tiny.halfH).toBe(OPTS.minHalf);
    const huge = fitShadowBox(
      [
        [-500, 0, -500],
        [500, 0, 500],
        [500, 0, -500],
        [-500, 0, 500],
      ],
      sun,
      OPTS,
    );
    expect(huge.halfW).toBe(OPTS.maxHalf);
    expect(huge.halfH).toBe(OPTS.maxHalf);
  });
  it('schuift ver uitgezoomd naar het midden van het scherm, als niet alles in het grootste vak past', () => {
    const sun = sunDirAt(12);
    // Zoom 0,12: veel meer dan het grootste vak (69) kan dekken
    const pts = viewCorners(27 / 0.12, 0.9, Math.PI / 4, 1440 / 900, 128, 128);
    const focus: Vec3 = [128, 0, 128];
    const box = fitShadowBox(pts, sun, { ...OPTS, focus });
    expect(box.halfW).toBe(OPTS.maxHalf);
    const { right, up } = lightBasis(sun);
    const rel: Vec3 = [focus[0] - box.cx, 0, focus[2] - box.cz];
    // Het midden van het scherm ligt ruim binnen het vak (niet net op de rand)
    expect(Math.abs(dot(rel, right))).toBeLessThan(box.halfW * 0.5);
    expect(Math.abs(dot(rel, up))).toBeLessThan(box.halfH * 0.5);
    // En past alles wel, dan verandert focus niets
    const close = viewCorners(27 / 0.9, 0.9, Math.PI / 4, 1440 / 900);
    expect(fitShadowBox(close, sun, { ...OPTS, focus: [50, 0, 50] })).toEqual(fitShadowBox(close, sun, OPTS));
  });

  it('wordt kleiner aan de rand van de kaart, en schrijft in out als je die meegeeft', () => {
    const sun = sunDirAt(12);
    // Kijk naar de hoek (0, 0) van een kaart van 100 bij 100
    const pts = viewCorners(27 / 0.6, 0.9, Math.PI / 4, 1440 / 900, 0, 0);
    const bounds: Vec3[] = [];
    for (const x of [-2, 102]) for (const z of [-2, 102]) for (const y of [0, 4]) bounds.push([x, y, z]);
    const free = fitShadowBox(pts, sun, OPTS);
    const out = { cx: 0, cz: 0, halfW: 0, halfH: 0, depthBehind: 0, depthFront: 0 };
    const clipped = fitShadowBox(pts, sun, { ...OPTS, bounds }, out);
    expect(clipped).toBe(out);
    expect(clipped.halfW * clipped.halfH).toBeLessThan(free.halfW * free.halfH);
    // De hoek van de kaart (die in beeld is) zit er nog in
    const { right, up } = lightBasis(sun);
    const corner: Vec3 = [0, 0, 0];
    const rel: Vec3 = [corner[0] - clipped.cx, 0, corner[2] - clipped.cz];
    expect(Math.abs(dot(rel, right))).toBeLessThanOrEqual(clipped.halfW);
    expect(Math.abs(dot(rel, up))).toBeLessThanOrEqual(clipped.halfH);
  });
});
