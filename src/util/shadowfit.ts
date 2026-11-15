// Het vak van de schaduwkaart passend maken om wat je op het scherm ziet: pure rekensom, zonder three.js.

type Vec3 = [number, number, number];

/** Instellingen voor het vak: kleinste en grootste halve maat, de stap waarop we afronden en de marge. */
export interface ShadowFitOptions {
  minHalf: number;
  maxHalf: number;
  step: number;
  margin: number;
  /**
   * Het punt waar de camera naar kijkt (op de grond). Past niet alles in het grootste vak, dan schuift het vak
   * naar dit punt toe: dan houdt het midden van het scherm altijd schaduw.
   */
  focus?: Vec3 | null;
  /** De hoekpunten van de kaart: wat daarbuiten ligt, hoeft geen schaduw. Zo wordt het vak aan de rand kleiner. */
  bounds?: Vec3[] | null;
}

/**
 * Het passende vak: het midden (cx, cz, op de grond: y = 0), de halve breedte en hoogte gezien vanuit de zon,
 * en hoe ver het verste punt aan de zonkant boven dat midden ligt (langs de zonrichting).
 */
export interface ShadowBox {
  cx: number;
  cz: number;
  halfW: number;
  halfH: number;
  depthBehind: number;
  /** Hoe ver het verste punt aan de andere kant ligt (weg van de zon). */
  depthFront: number;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// Schrijft a × b in out (geen nieuw geheugen: dit loopt elk beeldje)
function crossInto(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  const x = a[1] * b[2] - a[2] * b[1],
    y = a[2] * b[0] - a[0] * b[2],
    z = a[0] * b[1] - a[1] * b[0];
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}
function normalizeInto(out: Vec3, a: Vec3): Vec3 {
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  out[0] = a[0] / len;
  out[1] = a[1] / len;
  out[2] = a[2] / len;
  return out;
}
const WORLD_UP: Vec3 = [0, 1, 0];
// Kladblok voor fitShadowBox: vooraf gemaakt, zodat het per beeldje geen nieuw geheugen vraagt
const DIR: Vec3 = [0, 1, 0],
  RIGHT: Vec3 = [1, 0, 0],
  UP: Vec3 = [0, 0, 1];

function lightBasisInto(dir: Vec3, right: Vec3, up: Vec3) {
  crossInto(right, WORLD_UP, dir);
  // Zon recht boven: dan is elke richting goed
  if (Math.hypot(right[0], right[1], right[2]) < 1e-6) {
    right[0] = 1;
    right[1] = 0;
    right[2] = 0;
  }
  normalizeInto(right, right);
  crossInto(up, dir, right);
}

/**
 * De assen zoals de schaduwcamera van three.js ze heeft: "rechts" en "omhoog" in het vlak dat de zon ziet.
 * (three.js kijkt vanaf de zon naar het doel, met de wereld-y als "omhoog"; dit zijn dezelfde assen.)
 */
export function lightBasis(sunDir: Vec3): { right: Vec3; up: Vec3 } {
  const dir = normalizeInto([0, 0, 0], sunDir);
  const right: Vec3 = [0, 0, 0],
    up: Vec3 = [0, 0, 0];
  lightBasisInto(dir, right, up);
  return { right, up };
}

/** Rond af naar boven op een veelvoud van step, en houd het tussen min en max. */
const roundUp = (v: number, o: ShadowFitOptions) =>
  Math.min(o.maxHalf, Math.max(o.minHalf, Math.ceil(v / o.step - 1e-9) * o.step));

/**
 * Waar het midden van het vak komt langs één as. Past alles erin, dan het midden van de punten. Is het vak te
 * klein, dan zo dicht mogelijk bij focus, maar zonder dat het vak buiten de punten uitsteekt.
 */
function placeCentre(min: number, max: number, half: number, focus: number | null): number {
  const mid = (min + max) / 2;
  const spare = (max - min) / 2 - half;
  if (spare <= 0 || focus === null) return mid;
  return Math.min(mid + spare, Math.max(mid - spare, focus));
}

/**
 * Het kleinste vak (gezien vanuit de zon) waar alle punten in passen, plus een marge. De maten worden naar boven
 * afgerond op hele stappen: dan blijft een pixel van de schaduwkaart even groot als je het beeld een stukje
 * verschuift, en flikkeren de schaduwranden niet. Geef out mee om geen nieuw object te maken.
 */
export function fitShadowBox(
  points: Vec3[],
  sunDir: Vec3,
  opts: ShadowFitOptions,
  out?: ShadowBox,
): ShadowBox {
  const dir = normalizeInto(DIR, sunDir);
  lightBasisInto(dir, RIGHT, UP);
  let minR = Infinity,
    maxR = -Infinity,
    minU = Infinity,
    maxU = -Infinity;
  for (const p of points) {
    const r = dot(p, RIGHT),
      u = dot(p, UP);
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
  }
  if (!points.length) minR = maxR = minU = maxU = 0;
  // Alleen het stuk dat ook op de kaart ligt (zoals de zon het ziet). Valt het beeld helemaal naast de kaart,
  // dan houden we het beeld zelf.
  if (opts.bounds && opts.bounds.length) {
    let bMinR = Infinity,
      bMaxR = -Infinity,
      bMinU = Infinity,
      bMaxU = -Infinity;
    for (const p of opts.bounds) {
      const r = dot(p, RIGHT),
        u = dot(p, UP);
      bMinR = Math.min(bMinR, r);
      bMaxR = Math.max(bMaxR, r);
      bMinU = Math.min(bMinU, u);
      bMaxU = Math.max(bMaxU, u);
    }
    if (Math.max(minR, bMinR) < Math.min(maxR, bMaxR) && Math.max(minU, bMinU) < Math.min(maxU, bMaxU)) {
      minR = Math.max(minR, bMinR);
      maxR = Math.min(maxR, bMaxR);
      minU = Math.max(minU, bMinU);
      maxU = Math.min(maxU, bMaxU);
    }
  }
  const halfW = roundUp((maxR - minR) / 2 + opts.margin, opts),
    halfH = roundUp((maxU - minU) / 2 + opts.margin, opts);
  // Te groot voor het grootste vak: schuif naar het punt waar de camera naar kijkt (de marge telt mee)
  const focus = opts.focus;
  const midR = placeCentre(minR - opts.margin, maxR + opts.margin, halfW, focus ? dot(focus, RIGHT) : null),
    midU = placeCentre(minU - opts.margin, maxU + opts.margin, halfH, focus ? dot(focus, UP) : null);
  // Het midden in de wereld: het punt midR·rechts + midU·omhoog, dan langs de zonstraal omlaag naar de grond.
  // (Langs de zonstraal schuiven verandert niets aan wat de zon ziet.)
  const mx = RIGHT[0] * midR + UP[0] * midU,
    my = RIGHT[1] * midR + UP[1] * midU,
    mz = RIGHT[2] * midR + UP[2] * midU;
  const t = Math.abs(dir[1]) > 1e-6 ? my / dir[1] : 0;
  const cx = mx - dir[0] * t,
    cz = mz - dir[2] * t;
  // Hoe ver het verste punt richting de zon ligt: zo ver moet de zon (de schaduwcamera) minstens terug staan
  let depthBehind = 0,
    depthFront = 0;
  for (const p of points) {
    const s = (p[0] - cx) * dir[0] + p[1] * dir[1] + (p[2] - cz) * dir[2];
    depthBehind = Math.max(depthBehind, s);
    depthFront = Math.max(depthFront, -s);
  }
  const box = out ?? { cx: 0, cz: 0, halfW: 0, halfH: 0, depthBehind: 0, depthFront: 0 };
  box.cx = cx;
  box.cz = cz;
  box.halfW = halfW;
  box.halfH = halfH;
  box.depthBehind = depthBehind;
  box.depthFront = depthFront;
  return box;
}
