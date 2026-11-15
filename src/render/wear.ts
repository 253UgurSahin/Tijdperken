// Platgelopen grond in de videokaart: aangestampte aarde rond gebouwen en paadjes waar dorpelingen vaak lopen.
// De grond (terrainlook.ts) leest dit plaatje; het gras (scatter.ts) groeit niet op kale plekken.
import * as T3 from 'three';
import { H, W, onMapSize } from '../config';
import { B } from '../data/buildings';
import { G } from '../game/state';
import {
  addStep,
  clearYards,
  createWearGrid,
  decayPaths,
  stampYard,
  writeBytes,
  type TileBox,
} from '../util/weargrid';
import { TER, bmap, road, ter } from '../world/world';
import { R3 } from './scene';

// 2 vakjes per tegel, net als de schaduwkaart: een smal paadje blijft smal, met een zachte rand
const RES = 2;
let grid = createWearGrid(W, H, RES),
  bytes = new Uint8Array(grid.gw * grid.gh),
  // Per tegel: was hij kaal (zie wearAt) toen het gras voor het laatst werd neergezet?
  wornSeen = new Uint8Array(W * H);
function makeWear(): T3.DataTexture {
  const t = new T3.DataTexture(
    bytes,
    grid.gw,
    grid.gh,
    R3.capabilities.isWebGL2 ? T3.RedFormat : T3.LuminanceFormat, // (oudere browsers kennen geen 'rood')
  );
  t.magFilter = T3.LinearFilter;
  t.minFilter = T3.LinearFilter;
  t.needsUpdate = true;
  return t;
}
/** Het plaatje met platgelopen grond voor de shader (gedeeld object: bij een andere kaartmaat een nieuw plaatje). */
export const WEAR = { value: makeWear() };
/** Telt op als het gras opnieuw neergezet moet worden omdat er kale plekken bij of af zijn (zie scatter.ts). */
export let wearVersion = 0;
/** Voor tests (dev): hoe vaak het plaatje naar de videokaart ging en hoelang stepWear duurde. */
export const wearStats = { uploads: 0, lastMs: 0, maxMs: 0 };
/** Voor tests (dev): het raster zelf, om de paadjes en erven na te tellen. */
export const wearGrid = () => grid;

// Speltijd van de laatste voetstappen en van het laatste vervagen; echte tijd van de laatste keer versturen
let lastGame: unknown = null,
  lastSample = 0,
  lastDecay = 0,
  lastPathUpload = -9,
  lastYardUpload = -9,
  lastScatterBump = -99;
// Waar ooit gelopen is (alleen daar vervagen en versturen) en welk stuk erf nog verstuurd moet; leeg als x1 < x0
const walked: TileBox = { x0: 0, y0: 0, x1: -1, y1: -1 },
  yardTodo: TileBox = { x0: 0, y0: 0, x1: -1, y1: -1 };
let pathsDirty = false;

onMapSize(() => {
  grid = createWearGrid(W, H, RES);
  bytes = new Uint8Array(grid.gw * grid.gh);
  wornSeen = new Uint8Array(W * H);
  WEAR.value.dispose();
  WEAR.value = makeWear();
  lastGame = null; // bij het volgende beeldje alles opnieuw
});

// Maak een stuk groter zodat (x0, y0)-(x1, y1) er ook in valt
function grow(box: TileBox, x0: number, y0: number, x1: number, y1: number): void {
  const empty = box.x1 < box.x0;
  box.x0 = empty ? x0 : Math.min(box.x0, x0);
  box.y0 = empty ? y0 : Math.min(box.y0, y0);
  box.x1 = empty ? x1 : Math.max(box.x1, x1);
  box.y1 = empty ? y1 : Math.max(box.y1, y1);
}

/** Zet de erven opnieuw neer op de tegels (x0, y0) tot en met (x1, y1): daar is gebouwd, gesloopt of een weg gelegd. */
export function rebuildYards(x0: number, y0: number, x1: number, y1: number): void {
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(W - 1, x1);
  y1 = Math.min(H - 1, y1);
  if (x1 < x0 || y1 < y0) return;
  clearYards(grid, x0, y0, x1, y1);
  for (const b of G.bs) {
    const d = B[b.type];
    // Akkers, muren, wegen, sfeer en lantaarns krijgen geen erf (een akker is zelf al aarde)
    if (b.type === 'farm' || d.wall || d.road || d.cat === 'deco' || d.cat === 'light') continue;
    const ring = b.type === 'townhall' ? 2 : 1;
    // Alleen gebouwen waarvan het erf in dit stuk valt (het erf reikt `ring` tegels buiten het gebouw)
    if (b.x - ring > x1 || b.y - ring > y1 || b.x + d.size - 1 + ring < x0 || b.y + d.size - 1 + ring < y0)
      continue;
    stampYard(grid, b.x, b.y, d.size, ring, b.done ? 1 : 0.85, b.id);
  }
  grow(yardTodo, x0 - 2, y0 - 2, x1 + 2, y1 + 2);
}

/** Hoe kaal tegel (x, y) is (0..1), van de vakjes het meest. Voor het gras (scatter.ts). */
export function wearAt(x: number, y: number): number {
  let m = 0;
  for (let sy = 0; sy < RES; sy++) {
    const row = (y * RES + sy) * grid.gw + x * RES;
    for (let sx = 0; sx < RES; sx++) m = Math.max(m, bytes[row + sx]);
  }
  return m / 255;
}
const WORN = 0.45;

// Voetstappen van iedereen die nu loopt (alleen op gewone grond: niet in water, gebouwen of op de weg)
function sampleSteps(): void {
  for (const list of [G.vs, G.us]) {
    const amount = list === G.vs ? 0.06 : 0.03;
    for (const e of list) {
      if (e.hidden || (e.x === e.prevX && e.y === e.prevY)) continue;
      const tx = Math.floor(e.x),
        ty = Math.floor(e.y);
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const i = ty * W + tx;
      if (ter[i] === TER.WATER || bmap[i] || road[i]) continue;
      addStep(grid, e.x, e.y, amount);
      grow(walked, tx - 1, ty - 1, tx + 1, ty + 1);
      pathsDirty = true;
    }
  }
}

// Schrijf een stuk naar de bytes en tel hoeveel tegels van kaal naar begroeid gingen (of andersom)
function writeAndCount(box: TileBox): number {
  if (box.x1 < box.x0) return 0;
  writeBytes(grid, bytes, (tx, ty) => road[ty * W + tx] === 1, box);
  let flips = 0;
  for (let y = Math.max(0, box.y0); y <= Math.min(H - 1, box.y1); y++)
    for (let x = Math.max(0, box.x0); x <= Math.min(W - 1, box.x1); x++)
      if (wearAt(x, y) > WORN !== (wornSeen[y * W + x] === 1)) flips++;
  return flips;
}
// Het gras opnieuw laten neerzetten, en onthouden welke tegels in dit stuk nu kaal zijn
function bumpScatter(box: TileBox, now: number): void {
  for (let y = Math.max(0, box.y0); y <= Math.min(H - 1, box.y1); y++)
    for (let x = Math.max(0, box.x0); x <= Math.min(W - 1, box.x1); x++)
      wornSeen[y * W + x] = wearAt(x, y) > WORN ? 1 : 0;
  wearVersion++;
  lastScatterBump = now;
}

/** Elk beeldje (echte tijd `now`): voetstappen tellen, paadjes laten vervagen en het plaatje bijwerken. */
export function stepWear(now: number): void {
  const t0 = performance.now();
  // Een nieuw of geladen spel: alles leeg, de erven opnieuw uit de gebouwen (paadjes worden niet bewaard)
  if (G !== lastGame) {
    lastGame = G;
    grid.path.fill(0);
    grid.yard.fill(0);
    walked.x1 = -1;
    lastSample = lastDecay = G.t;
    rebuildYards(0, 0, W - 1, H - 1);
    pathsDirty = false;
    lastYardUpload = -9;
  }
  if (G.speed > 0 && G.t - lastSample >= 0.5) {
    lastSample = G.t;
    sampleSteps();
  }
  // Elke 10 seconden speltijd 1% minder: een pad waar niemand meer loopt is na zo'n 10 minuten bijna weg.
  // (Na een grote sprong in de tijd hoogstens 60 keer inhalen, dat is genoeg om alles te laten vervagen.)
  for (let n = 0; G.t - lastDecay >= 10; n++) {
    if (n >= 60) {
      lastDecay = G.t;
      break;
    }
    lastDecay += 10;
    if (walked.x1 >= walked.x0) decayPaths(grid, 0.99, walked);
    pathsDirty = true;
  }
  let flips = -1;
  if (yardTodo.x1 >= yardTodo.x0 && now - lastYardUpload >= 0.3) {
    // Een nieuw gebouw: het erf meteen (en het gras daar ook meteen weg)
    lastYardUpload = now;
    flips = writeAndCount(yardTodo);
    if (flips > 0) bumpScatter(yardTodo, now);
    yardTodo.x1 = -1;
  }
  if (pathsDirty && now - lastPathUpload >= 2) {
    // Paadjes hooguit eens per 2 seconden versturen; het gras pas opnieuw als er genoeg veranderd is
    lastPathUpload = now;
    pathsDirty = false;
    const pathFlips = writeAndCount(walked);
    if (pathFlips > 20 && now - lastScatterBump >= 10) bumpScatter(walked, now);
    flips = Math.max(flips, 0);
  }
  if (flips >= 0) {
    WEAR.value.needsUpdate = true;
    wearStats.uploads++;
  }
  wearStats.lastMs = performance.now() - t0;
  wearStats.maxMs = Math.max(wearStats.maxMs, wearStats.lastMs);
}
