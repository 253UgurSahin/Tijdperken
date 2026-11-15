// Platgelopen grond als rekenwerk (zonder three.js): aangestampte aarde rond gebouwen en paadjes waar vaak gelopen wordt.

/** Een raster over de kaart met `res` vakjes per tegel. Waarden van 0 (gras) tot 1 (helemaal kaal). */
export interface WearGrid {
  /** Kaartmaat in tegels. */
  w: number;
  h: number;
  /** Vakjes per tegel (in de breedte en in de hoogte). */
  res: number;
  /** Breedte en hoogte van het raster in vakjes. */
  gw: number;
  gh: number;
  /** Erven rond gebouwen: telkens opnieuw opgebouwd uit de gebouwen. */
  yard: Float32Array;
  /** Paadjes: groeien als er gelopen wordt en vervagen langzaam. */
  path: Float32Array;
}

/** Een leeg raster voor een kaart van w × h tegels. */
export function createWearGrid(w: number, h: number, res = 2): WearGrid {
  const gw = w * res,
    gh = h * res;
  return { w, h, res, gw, gh, yard: new Float32Array(gw * gh), path: new Float32Array(gw * gh) };
}

// Een vast toeval per vakje (0..1), zodat een erf niet overal even kaal is
function cellHash(x: number, y: number, seed: number): number {
  let n = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Wis de erven op de tegels (x0, y0) tot en met (x1, y1). */
export function clearYards(grid: WearGrid, x0: number, y0: number, x1: number, y1: number): void {
  const r = grid.res,
    cx0 = Math.max(0, x0 * r),
    cx1 = Math.min(grid.gw, (x1 + 1) * r);
  for (let cy = Math.max(0, y0 * r); cy < Math.min(grid.gh, (y1 + 1) * r); cy++)
    if (cx1 > cx0) grid.yard.fill(0, cy * grid.gw + cx0, cy * grid.gw + cx1);
}

/**
 * Zet een erf neer: het gebouw (bx, by, size × size tegels) plus `ring` tegels eromheen. Elk vakje krijgt
 * 0,45 tot 0,7 keer `strength` (met wat toeval); waar al meer lag blijft dat staan. Naar de buitenrand van de ring
 * toe wordt het minder (tot de helft), zodat een erf rafelig in het gras overgaat en niet als een strak vierkant.
 */
export function stampYard(
  grid: WearGrid,
  bx: number,
  by: number,
  size: number,
  ring: number,
  strength: number,
  seed: number,
): void {
  const r = grid.res,
    cx0 = Math.max(0, (bx - ring) * r),
    cy0 = Math.max(0, (by - ring) * r),
    cx1 = Math.min(grid.gw, (bx + size + ring) * r),
    cy1 = Math.min(grid.gh, (by + size + ring) * r);
  for (let cy = cy0; cy < cy1; cy++)
    for (let cx = cx0; cx < cx1; cx++) {
      // Hoe ver buiten het gebouw (in tegels, gemeten vanaf het midden van het vakje)
      const out = Math.max(
          bx - (cx + 0.5) / r,
          (cx + 0.5) / r - (bx + size),
          by - (cy + 0.5) / r,
          (cy + 0.5) / r - (by + size),
          0,
        ),
        fade = ring > 0 ? 1 - 0.5 * Math.min(1, out / ring) : 1,
        v = (0.45 + 0.25 * cellHash(cx, cy, seed)) * strength * fade,
        k = cy * grid.gw + cx;
      if (v > grid.yard[k]) grid.yard[k] = v;
    }
}

/** Een voetstap op plek (x, y) in tegels: verdeeld over de 2 × 2 dichtstbijzijnde vakjes, hoogstens 1. */
export function addStep(grid: WearGrid, x: number, y: number, amount: number): void {
  // Het midden van vakje c ligt op (c + 0,5) / res tegels
  const fx = x * grid.res - 0.5,
    fy = y * grid.res - 0.5,
    ix = Math.floor(fx),
    iy = Math.floor(fy),
    tx = fx - ix,
    ty = fy - iy;
  put(grid, ix, iy, amount * (1 - tx) * (1 - ty));
  put(grid, ix + 1, iy, amount * tx * (1 - ty));
  put(grid, ix, iy + 1, amount * (1 - tx) * ty);
  put(grid, ix + 1, iy + 1, amount * tx * ty);
}
function put(grid: WearGrid, cx: number, cy: number, v: number): void {
  if (cx < 0 || cy < 0 || cx >= grid.gw || cy >= grid.gh || v <= 0) return;
  const k = cy * grid.gw + cx;
  grid.path[k] = Math.min(1, grid.path[k] + v);
}

/** Een stuk van de kaart in tegels: van (x0, y0) tot en met (x1, y1). */
export interface TileBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
// Het stuk in vakjes (begin tot en met, eind tot niet meer), binnen de kaart
function cellsOf(grid: WearGrid, box?: TileBox) {
  const r = grid.res;
  return {
    cx0: Math.max(0, (box ? box.x0 : 0) * r),
    cy0: Math.max(0, (box ? box.y0 : 0) * r),
    cx1: Math.min(grid.gw, ((box ? box.x1 : grid.w - 1) + 1) * r),
    cy1: Math.min(grid.gh, ((box ? box.y1 : grid.h - 1) + 1) * r),
  };
}

/**
 * Laat de paadjes vervagen: alles keer `factor` (de erven blijven). Heel kleine restjes worden 0.
 * Met `box` alleen dat stuk (daarbuiten is toch niet gelopen): op een grote kaart scheelt dat veel werk.
 * Geeft het stuk terug (in tegels) waar nog een paadje ligt, of null als alles weg is.
 */
export function decayPaths(grid: WearGrid, factor: number, box?: TileBox): TileBox | null {
  const p = grid.path,
    r = grid.res,
    { cx0, cy0, cx1, cy1 } = cellsOf(grid, box);
  let left = grid.gw,
    right = -1,
    top = grid.gh,
    bottom = -1;
  for (let cy = cy0; cy < cy1; cy++)
    for (let cx = cx0, k = cy * grid.gw + cx0; cx < cx1; cx++, k++) {
      if (p[k] === 0) continue;
      const v = p[k] * factor;
      p[k] = v < 0.004 ? 0 : v;
      if (v < 0.004) continue;
      if (cx < left) left = cx;
      if (cx > right) right = cx;
      if (cy < top) top = cy;
      if (cy > bottom) bottom = cy;
    }
  if (right < 0) return null;
  return {
    x0: Math.floor(left / r),
    y0: Math.floor(top / r),
    x1: Math.floor(right / r),
    y1: Math.floor(bottom / r),
  };
}

/**
 * Schrijf het raster als bytes (0..255) voor de videokaart: het meeste van erf en pad. Op een weg (elke soort:
 * `road` per tegel, groter dan 0) altijd 0, zodat zand, klinkers en asfalt nooit vies worden. Met `box` alleen dat stuk.
 * Een pad telt met een macht 2,5: waar maar af en toe iemand liep blijft het gras dicht, alleen drukke routes
 * worden kaal (en dus smalle paadjes in plaats van brede kale velden).
 */
export function writeBytes(grid: WearGrid, out: Uint8Array, road: ArrayLike<number>, box?: TileBox): void {
  const r = grid.res,
    { cx0, cy0, cx1, cy1 } = cellsOf(grid, box);
  for (let cy = cy0; cy < cy1; cy++) {
    const roadRow = Math.floor(cy / r) * grid.w;
    for (let cx = cx0, k = cy * grid.gw + cx0; cx < cx1; cx++, k++) {
      const p = grid.path[k];
      out[k] =
        road[roadRow + Math.floor(cx / r)] > 0
          ? 0
          : Math.round(Math.max(grid.yard[k], p * p * Math.sqrt(p)) * 255);
    }
  }
}
