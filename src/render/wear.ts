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
// Stukken van 16 × 16 tegels: alleen waar iemand liep worden de bytes opnieuw geschreven
const CHUNK = 16,
  CHUNKS_PER_FRAME = 24;
let grid = createWearGrid(W, H, RES),
  bytes = new Uint8Array(grid.gw * grid.gh),
  // Per tegel: is hij nu kaal (zie wearAt), en was hij dat toen het gras voor het laatst werd neergezet?
  wornNow = new Uint8Array(W * H),
  wornSeen = new Uint8Array(W * H),
  chunksW = Math.ceil(W / CHUNK),
  dirtyChunk = new Uint8Array(chunksW * Math.ceil(H / CHUNK));
// Hoeveel tegels anders zijn dan bij het laatste neerzetten van het gras, en welke stukken nog geschreven moeten
let flipsPending = 0;
const dirtyList: number[] = [];
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
// Waar paadjes kunnen liggen, en welk stuk erf nog geschreven moet; leeg als x1 < x0
const walked: TileBox = { x0: 0, y0: 0, x1: -1, y1: -1 },
  yardTodo: TileBox = { x0: 0, y0: 0, x1: -1, y1: -1 };
// Vervagen gaat in een veeg over een paar beeldjes (een band rijen per beeldje), zodat er geen hapering komt.
// `pending` is het vervagen dat nog moet; `found` is waar na de veeg nog een pad ligt, `fresh` waar intussen
// gelopen is: samen worden ze het nieuwe `walked` (zo krimpt dat weer als paden verdwijnen).
const SWEEP_ROWS = 24;
const sweep = {
  active: false,
  row: 0,
  factor: 1,
  pending: 1,
  box: { x0: 0, y0: 0, x1: -1, y1: -1 } as TileBox,
  found: { x0: 0, y0: 0, x1: -1, y1: -1 } as TileBox,
  fresh: { x0: 0, y0: 0, x1: -1, y1: -1 } as TileBox,
};
let pathsDirty = false;

onMapSize(() => {
  grid = createWearGrid(W, H, RES);
  bytes = new Uint8Array(grid.gw * grid.gh);
  wornNow = new Uint8Array(W * H);
  wornSeen = new Uint8Array(W * H);
  chunksW = Math.ceil(W / CHUNK);
  dirtyChunk = new Uint8Array(chunksW * Math.ceil(H / CHUNK));
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

// Onthoud dat het stuk rond tegel (tx, ty) opnieuw geschreven moet worden
function markChunk(tx: number, ty: number): void {
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return;
  const c = Math.floor(ty / CHUNK) * chunksW + Math.floor(tx / CHUNK);
  if (dirtyChunk[c]) return;
  dirtyChunk[c] = 1;
  dirtyList.push(c);
}

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
      if (sweep.active) grow(sweep.fresh, tx - 1, ty - 1, tx + 1, ty + 1);
      // Een stap raakt ook de buurtegels (zachte rand): die kunnen in een ander stuk liggen
      markChunk(tx - 1, ty - 1);
      markChunk(tx + 1, ty - 1);
      markChunk(tx - 1, ty + 1);
      markChunk(tx + 1, ty + 1);
      pathsDirty = true;
    }
  }
}

// Schrijf een stuk naar de bytes en houd bij welke tegels van kaal naar begroeid gingen (of andersom)
function writeAndCount(box: TileBox): void {
  const x0 = Math.max(0, box.x0),
    y0 = Math.max(0, box.y0),
    x1 = Math.min(W - 1, box.x1),
    y1 = Math.min(H - 1, box.y1);
  if (x1 < x0 || y1 < y0) return;
  writeBytes(grid, bytes, road, { x0, y0, x1, y1 });
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x,
        now = wearAt(x, y) > WORN ? 1 : 0;
      if (now === wornNow[i]) continue;
      wornNow[i] = now;
      flipsPending += now === wornSeen[i] ? -1 : 1;
    }
}
// Het gras opnieuw laten neerzetten, en onthouden welke tegels nu kaal zijn
function bumpScatter(now: number): void {
  wornSeen.set(wornNow);
  flipsPending = 0;
  wearVersion++;
  lastScatterBump = now;
}

// Eén band van de vervaag-veeg: rijen vervagen, opnieuw schrijven en onthouden waar nog een pad ligt
function sweepBand(): void {
  const b = sweep.box,
    band: TileBox = { x0: b.x0, y0: sweep.row, x1: b.x1, y1: Math.min(b.y1, sweep.row + SWEEP_ROWS - 1) },
    left = decayPaths(grid, sweep.factor, band);
  if (left) grow(sweep.found, left.x0 - 1, left.y0 - 1, left.x1 + 1, left.y1 + 1);
  writeAndCount(band);
  pathsDirty = true;
  sweep.row = band.y1 + 1;
  if (sweep.row <= b.y1) return;
  // Klaar: `walked` krimpt tot waar nog paden liggen plus waar intussen gelopen is
  sweep.active = false;
  walked.x1 = -1;
  const f = sweep.found,
    n = sweep.fresh;
  if (f.x1 >= f.x0) grow(walked, f.x0, f.y0, f.x1, f.y1);
  if (n.x1 >= n.x0) grow(walked, n.x0, n.y0, n.x1, n.y1);
}

/** Elk beeldje (echte tijd `now`): voetstappen tellen, paadjes laten vervagen en het plaatje bijwerken. */
export function stepWear(now: number): void {
  const t0 = performance.now();
  // Een nieuw of geladen spel: alles leeg, de erven opnieuw uit de gebouwen (paadjes worden niet bewaard)
  if (G !== lastGame) {
    lastGame = G;
    grid.path.fill(0);
    grid.yard.fill(0);
    wornNow.fill(0);
    wornSeen.fill(0);
    flipsPending = 0;
    for (const c of dirtyList) dirtyChunk[c] = 0;
    dirtyList.length = 0;
    walked.x1 = -1;
    sweep.active = false;
    sweep.pending = 1;
    lastSample = lastDecay = G.t;
    rebuildYards(0, 0, W - 1, H - 1);
    pathsDirty = false;
    lastYardUpload = -9;
  }
  // Elke halve seconde speltijd een voetstap; bij hoge snelheid of weinig beeldjes meerdere per beeldje,
  // zodat paden even snel groeien, hoe snel het spel ook loopt (hoogstens 4 keer inhalen, de rest vervalt)
  if (G.speed > 0) {
    for (let n = 0; G.t - lastSample >= 0.5; n++) {
      if (n >= 4) {
        lastSample = G.t;
        break;
      }
      lastSample += 0.5;
      sampleSteps();
    }
  } else lastSample = G.t;
  // Elke 10 seconden speltijd 1% minder: een pad waar niemand meer loopt is na zo'n 10 minuten bijna weg.
  // (Na een grote sprong in de tijd hoogstens 60 keer inhalen, dat is genoeg om alles te laten vervagen.)
  for (let n = 0; G.t - lastDecay >= 10; n++) {
    if (n >= 60) {
      lastDecay = G.t;
      break;
    }
    lastDecay += 10;
    sweep.pending *= 0.99;
  }
  if (!sweep.active && sweep.pending < 1) {
    if (walked.x1 >= walked.x0) {
      sweep.active = true;
      sweep.factor = sweep.pending;
      sweep.row = Math.max(0, walked.y0);
      sweep.box = { x0: walked.x0, y0: walked.y0, x1: walked.x1, y1: walked.y1 };
      sweep.found = { x0: 0, y0: 0, x1: -1, y1: -1 };
      sweep.fresh = { x0: 0, y0: 0, x1: -1, y1: -1 };
    }
    sweep.pending = 1;
  }
  if (sweep.active) sweepBand();
  let upload = false;
  if (yardTodo.x1 >= yardTodo.x0 && now - lastYardUpload >= 0.3) {
    // Een nieuw gebouw: het erf meteen (en het gras daar ook meteen weg)
    lastYardUpload = now;
    writeAndCount(yardTodo);
    if (flipsPending > 0) bumpScatter(now);
    yardTodo.x1 = -1;
    upload = true;
  }
  // Stukken waar gelopen is opnieuw schrijven: hooguit 24 per beeldje, zodat een grote kaart vol lopers niet
  // hapert (de rest volgt in de beeldjes daarna)
  for (let n = 0; n < CHUNKS_PER_FRAME && dirtyList.length > 0; n++) {
    const c = dirtyList.pop()!; // (de lijst is niet leeg, zie de lus)
    dirtyChunk[c] = 0;
    const cx = (c % chunksW) * CHUNK,
      cy = Math.floor(c / chunksW) * CHUNK;
    writeAndCount({ x0: cx, y0: cy, x1: cx + CHUNK - 1, y1: cy + CHUNK - 1 });
  }
  if (pathsDirty && !sweep.active && now - lastPathUpload >= 2) {
    // Paadjes hooguit eens per 2 seconden versturen; het gras pas opnieuw als er genoeg veranderd is
    lastPathUpload = now;
    pathsDirty = false;
    if (flipsPending > 20 && now - lastScatterBump >= 10) bumpScatter(now);
    upload = true;
  }
  if (upload) {
    WEAR.value.needsUpdate = true;
    wearStats.uploads++;
  }
  wearStats.lastMs = performance.now() - t0;
  wearStats.maxMs = Math.max(wearStats.maxMs, wearStats.lastMs);
}
