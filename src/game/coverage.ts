// Houdt per voorziening bij welke tegels binnen bereik liggen, en past dat alleen aan waar iets veranderde.
import type { Building, GameState } from '../types';
import { H, W, onMapSize } from '../config';
import { B } from '../data/buildings';
import { SERVICES, inDisc, maskAt, servicesOf, stampDisc } from '../data/services';
import type { ServiceKey, ServiceSource } from '../data/services';
import { G } from './state';
import { markTip, tipSeen } from '../core/tips';
import { toast } from '../ui/hud';

// Per voorziening een teller per tegel: hoeveel cirkels van die soort de tegel raken
let grids: Uint8Array[] = [];
/** Wat we per gebouw al getekend hebben: waar het stond en welke cirkels het gaf. */
interface Stamped {
  type: string;
  x: number;
  y: number;
  discs: ServiceSource[];
  /** De ronde waarin we het gebouw het laatst zagen (wat er niet meer is, halen we weg). */
  seen: number;
}
const stamped = new Map<number, Stamped>();
let round = 0,
  version = 0,
  lastG: GameState | null = null;

/** Alles leeg: bij een nieuwe kaartgrootte of een ander spel (nieuw of geladen). */
function resetGrids(): void {
  grids = SERVICES.map(() => new Uint8Array(W * H));
  stamped.clear();
  version++;
}
onMapSize(resetGrids);

/** Werkt dit gebouw als voorziening? (house-growth voegt hier `&& roadLinked(b)` aan toe.) */
export const sourceActive = (b: Building): boolean => b.done && b.on !== false && !b.dead;

const indexOf = (k: ServiceKey): number => SERVICES.findIndex(s => s.k === k);

// servicesOf per soort gebouw maar één keer uitrekenen: dit gebeurt elke halve seconde (en bij het tekenen elk beeldje) voor elk gebouw
const servesByType = new Map<string, { k: ServiceKey; r: number }[]>();
/** De voorzieningen van een soort gebouw (dezelfde lijst als servicesOf, maar onthouden: niet aanpassen). */
export function servesOfType(type: string): { k: ServiceKey; r: number }[] {
  let list = servesByType.get(type);
  if (!list) servesByType.set(type, (list = B[type] ? servicesOf(B[type]) : []));
  return list;
}

/** Eén keer uitleggen dat voorzieningen een bereik hebben (ook als je zo'n gebouw aanklikt, zie render/coverage.ts). */
export function coverTip(): void {
  if (tipSeen('cover')) return;
  markTip('cover');
  toast(
    "Voorzieningen hebben een bereik: huizen in de cirkel krijgen voedsel, veiligheid, geloof, water of een markt. Kies zo'n gebouw om zijn bereik te zien.",
    'good',
  );
}

/** De cirkels van één gebouw (leeg als het geen voorziening is). */
function discsOf(b: Building): ServiceSource[] {
  const d = B[b.type];
  return servesOfType(b.type).map(s => ({
    id: b.id,
    k: s.k,
    cx: b.x + d.size / 2,
    cy: b.y + d.size / 2,
    r: s.r,
  }));
}

/** Cirkels erbij tellen (+1) of eraf halen (-1). */
function stampAll(discs: ServiceSource[], delta: 1 | -1): void {
  for (const s of discs) stampDisc(grids[indexOf(s.k)], W, H, s.cx, s.cy, s.r, delta);
}

/**
 * Bijwerken; gebeurt elke halve seconde (zie computeCaches in game/caches.ts). Alleen gebouwen die verschenen,
 * verdwenen, uitgingen of verschoven (bijv. na vernieuwen) worden opnieuw getekend: zo blijft het snel, ook met
 * honderden gebouwen. Zonder verandering maakt dit niets nieuws aan.
 */
export function updateCoverage(): void {
  const fresh = lastG !== G || grids.length !== SERVICES.length || grids[0].length !== W * H;
  if (fresh) {
    lastG = G;
    resetGrids();
  }
  round++;
  let changed = false,
    newSource = false;
  for (const b of G.bs) {
    if (!servesOfType(b.type).length || !sourceActive(b)) continue;
    const old = stamped.get(b.id);
    if (old && old.type === b.type && old.x === b.x && old.y === b.y) {
      old.seen = round;
      continue;
    }
    if (old) stampAll(old.discs, -1);
    else if (b.type !== 'townhall') newSource = true;
    const discs = discsOf(b);
    stampAll(discs, 1);
    stamped.set(b.id, { type: b.type, x: b.x, y: b.y, discs, seen: round });
    changed = true;
  }
  // Wat we deze ronde niet zagen, is weg, uitgezet of afgebroken
  for (const [id, old] of stamped)
    if (old.seen !== round) {
      stampAll(old.discs, -1);
      stamped.delete(id);
      changed = true;
    }
  if (changed) version++;
  // Een nieuw gebouwde voorziening (niet het stamhuis, en niet alles wat er bij het laden al stond): de tip
  if (newSource && !fresh) coverTip();
}

/** De bits (zie SERVICE_BIT) van alle voorzieningen die dit stukje grond raken. */
export function serviceMask(p: { type: string; x: number; y: number }): number {
  if (!grids.length) return 0;
  return maskAt(grids, W, p.x, p.y, B[p.type].size);
}

/** De voorzieningen die dit stukje grond raken. */
export function servicesAt(p: { type: string; x: number; y: number }): ServiceKey[] {
  const mask = serviceMask(p);
  return SERVICES.filter((_, i) => mask & (1 << i)).map(s => s.k);
}

/** Ligt een stukje grond (x, y, size) met minstens één tegel in de cirkel? */
export function footprintInDisc(
  cx: number,
  cy: number,
  r: number,
  x: number,
  y: number,
  size: number,
): boolean {
  for (let dy = 0; dy < size; dy++)
    for (let dx = 0; dx < size; dx++) if (inDisc(cx, cy, r, x + dx, y + dy)) return true;
  return false;
}

/** Een afgebouwd huis (het stamhuis telt niet als huis). */
export const isHome = (b: Building): boolean => b.done && !!B[b.type].pop && b.type !== 'townhall';

/** Hoeveel huizen er in de cirkel van voorziening k van dit gebouw liggen (0 als het die niet geeft). */
export function homesInDisc(src: Building, k: ServiceKey): number {
  const disc = servesOfType(src.type).find(s => s.k === k);
  if (!disc) return 0;
  const d = B[src.type],
    cx = src.x + d.size / 2,
    cy = src.y + d.size / 2;
  let n = 0;
  for (const h of G.bs) if (isHome(h) && footprintInDisc(cx, cy, disc.r, h.x, h.y, B[h.type].size)) n++;
  return n;
}

/** Hoeveel huizen er in een van de cirkels van dit gebouw liggen. */
export function homesCoveredBy(src: Building): number {
  const d = B[src.type],
    cx = src.x + d.size / 2,
    cy = src.y + d.size / 2,
    discs = servesOfType(src.type);
  let n = 0;
  for (const h of G.bs) {
    if (!isHome(h)) continue;
    const size = B[h.type].size;
    if (discs.some(s => footprintInDisc(cx, cy, s.r, h.x, h.y, size))) n++;
  }
  return n;
}

/** De tellers per tegel van één voorziening (W × H). */
export function coverGrid(k: ServiceKey): Uint8Array {
  if (lastG !== G || !grids.length) updateCoverage();
  return grids[indexOf(k)];
}

/** Verandert zodra er ergens een tegel binnen of buiten bereik komt. */
export const coverVersion = (): number => version;

/**
 * Controle voor tests in de browser: rekent alles opnieuw uit en vergelijkt dat met de bijgehouden tellers.
 * Geeft het aantal tegels terug dat verschilt (0 = alles klopt).
 */
export function checkCoverage(): number {
  const fresh = SERVICES.map(() => new Uint8Array(W * H));
  for (const b of G.bs)
    if (sourceActive(b)) for (const s of discsOf(b)) stampDisc(fresh[indexOf(s.k)], W, H, s.cx, s.cy, s.r, 1);
  let wrong = 0;
  for (let k = 0; k < fresh.length; k++)
    for (let i = 0; i < fresh[k].length; i++) if (fresh[k][i] !== grids[k][i]) wrong++;
  return wrong;
}
