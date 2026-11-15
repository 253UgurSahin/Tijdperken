// Het vak van de schaduwkaart passend maken om wat je op het scherm ziet: pure rekensom, zonder three.js.

type Vec3 = [number, number, number];

/** Instellingen voor het vak: kleinste en grootste halve maat, de stap waarop we afronden en de marge. */
export interface ShadowFitOptions {
  minHalf: number;
  maxHalf: number;
  step: number;
  margin: number;
}

/**
 * Het passende vak: het midden (cx, cy, cz, op de grond: y = 0), de halve breedte en hoogte gezien vanuit de zon,
 * en hoe ver het verste punt aan de zonkant boven dat midden ligt (langs de zonrichting).
 */
export interface ShadowBox {
  cx: number;
  cy: number;
  cz: number;
  halfW: number;
  halfH: number;
  depthBehind: number;
  /** Hoe ver het verste punt aan de andere kant ligt (weg van de zon). */
  depthFront: number;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (a: Vec3): Vec3 => {
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
};

/**
 * De assen zoals de schaduwcamera van three.js ze heeft: "rechts" en "omhoog" in het vlak dat de zon ziet.
 * (three.js kijkt vanaf de zon naar het doel, met de wereld-y als "omhoog"; dit zijn dezelfde assen.)
 */
export function lightBasis(sunDir: Vec3): { right: Vec3; up: Vec3 } {
  const dir = normalize(sunDir);
  let right = cross([0, 1, 0], dir);
  // Zon recht boven: dan is elke richting goed
  if (Math.hypot(right[0], right[1], right[2]) < 1e-6) right = [1, 0, 0];
  right = normalize(right);
  return { right, up: cross(dir, right) };
}

/** Rond af naar boven op een veelvoud van step, en houd het tussen min en max. */
const roundUp = (v: number, o: ShadowFitOptions) =>
  Math.min(o.maxHalf, Math.max(o.minHalf, Math.ceil(v / o.step - 1e-9) * o.step));

/**
 * Het kleinste vak (gezien vanuit de zon) waar alle punten in passen, plus een marge. De maten worden naar boven
 * afgerond op hele stappen: dan blijft een pixel van de schaduwkaart even groot als je het beeld een stukje
 * verschuift, en flikkeren de schaduwranden niet.
 */
export function fitShadowBox(points: Vec3[], sunDir: Vec3, opts: ShadowFitOptions): ShadowBox {
  const dir = normalize(sunDir);
  const { right, up } = lightBasis(dir);
  let minR = Infinity,
    maxR = -Infinity,
    minU = Infinity,
    maxU = -Infinity;
  for (const p of points) {
    const r = dot(p, right),
      u = dot(p, up);
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
  }
  if (!points.length) minR = maxR = minU = maxU = 0;
  const midR = (minR + maxR) / 2,
    midU = (minU + maxU) / 2;
  const halfW = roundUp((maxR - minR) / 2 + opts.margin, opts),
    halfH = roundUp((maxU - minU) / 2 + opts.margin, opts);
  // Het midden in de wereld: het punt midR·rechts + midU·omhoog, dan langs de zonstraal omlaag naar de grond.
  // (Langs de zonstraal schuiven verandert niets aan wat de zon ziet.)
  const m: Vec3 = [
    right[0] * midR + up[0] * midU,
    right[1] * midR + up[1] * midU,
    right[2] * midR + up[2] * midU,
  ];
  const t = Math.abs(dir[1]) > 1e-6 ? m[1] / dir[1] : 0;
  const centre: Vec3 = [m[0] - dir[0] * t, 0, m[2] - dir[2] * t];
  // Hoe ver het verste punt richting de zon ligt: zo ver moet de zon (de schaduwcamera) minstens terug staan
  let depthBehind = 0,
    depthFront = 0;
  for (const p of points) {
    const s = dot([p[0] - centre[0], p[1], p[2] - centre[2]], dir);
    depthBehind = Math.max(depthBehind, s);
    depthFront = Math.max(depthFront, -s);
  }
  return { cx: centre[0], cy: 0, cz: centre[2], halfW, halfH, depthBehind, depthFront };
}
