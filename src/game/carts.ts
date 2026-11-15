// Zichtbare karren: elke echte stroom van goederen krijgt een rit over de weg. Ze veranderen de voorraad niet.
import type { Building, Cost, GameState, Tile } from '../types';
import { B } from '../data/buildings';
import { CART_LOAD, CART_SPEED, cartKindFor, routeLength, shouldSend, type CartKind } from '../data/carts';
import { qualityCarts } from '../render/quality';
import { roadBoost } from '../world/pathfinding';
import { W } from '../config';
import { road } from '../world/world';
import { roadLinked, roadRoute } from './roads';
import { G, bById } from './state';

// Let op: dit bestand schrijft nooit in G.res, G.stats of een gebouw. De voorraad is al betaald en verdiend op
// het moment dat een fabriek iets maakt (zie buildings.ts); een kar is alleen een plaatje van wat er gebeurde.
// Daarom worden karren ook niet opgeslagen: na het laden komen ze vanzelf terug met de volgende ritten.

/** Eén rit over de weg. d = hoe ver hij is (tegels), prevD = waar hij de vorige speltik was (voor vloeiend tekenen). */
export interface Cart {
  id: number;
  kind: CartKind;
  res: string;
  amt: number;
  route: Tile[];
  len: number;
  d: number;
  prevD: number;
  spd: number;
  fly: boolean;
  from: number;
  to: number;
}

/** Alle karren die nu rijden. */
export const carts: Cart[] = [];

/** Per gebouw (op id): wat er nog gebracht (in) en weggehaald (out) moet worden, en wanneer de vorige rit was. */
const owed = new Map<number, { in: Cost; out: Cost; last: number }>();
let nextId = 1,
  sendTimer = 0,
  lastG: GameState | null = null,
  capOverride: number | null = null;

/** Per gebouw (op id): vanaf welke speltijd de deur weer vrij is voor de volgende kar. */
const doorFreeAt = new Map<number, number>();
// Zo veel tegels ruimte tussen twee karren die na elkaar uit hetzelfde gebouw komen
const DOOR_GAP = 1.1;
// Hooguit zo veel ritten tegelijk per richting en per gebouw (een mijnschacht maakt drie soorten erts)
const KEYS_PER_TRIP = 3;
// Een rit duurt minstens zo veel seconden, maar een kar gaat nooit trager dan MIN_SPEED tegels per seconde
const MIN_TRIP_TIME = 3.5;
const MIN_SPEED = 0.7;

// Een nieuw spel of een geladen spel: alles van het vorige spel weg
function checkGame(): void {
  if (lastG === G) return;
  lastG = G;
  carts.length = 0;
  owed.clear();
  doorFreeAt.clear();
  sendTimer = 0;
}

/** Hoeveel karren er nu tegelijk mogen rijden (volgt de beeldkwaliteit). */
export function cartCap(): number {
  return capOverride ?? qualityCarts();
}
/** Alleen om te testen: een vast maximum (0 = geen karren), of null voor weer de beeldkwaliteit. */
export function setCartCap(n: number | null): void {
  capOverride = n;
}

/** Een gebouw heeft iets verbruikt (input) of gemaakt (output): daar komt straks een rit voor. */
export function noteFlow(b: Building, input: Cost, output: Cost): void {
  checkGame();
  let o = owed.get(b.id);
  if (!o) {
    o = { in: {}, out: {}, last: G.t };
    owed.set(b.id, o);
  }
  for (const k in input) o.in[k] = (o.in[k] || 0) + input[k];
  for (const k in output) o.out[k] = (o.out[k] || 0) + output[k];
}

/** Hoeveel van wat dit gebouw maakte er nog klaarstaat (voor het stapeltje kratten ernaast). */
export function owedOutput(id: number): number {
  const o = owed.get(id);
  if (!o) return 0;
  let n = 0;
  for (const k in o.out) n += o.out[k];
  return n;
}

/** De opslag (of het stamhuis) die het dichtst bij ligt en aan de weg ligt. */
export function nearestLinkedDrop(x: number, y: number): Building | null {
  let best: Building | null = null,
    bestD = Infinity;
  for (const b of G.bs) {
    const d = B[b.type];
    if (!b.done || !d.drop || !roadLinked(b)) continue;
    const s = d.size / 2,
      dist = Math.hypot(b.x + s - x, b.y + s - y);
    if (dist < bestD) {
      bestD = dist;
      best = b;
    }
  }
  return best;
}

// De tegel binnen het gebouw die het dichtst bij tegel t ligt: daar komt de kar naar buiten of rijdt hij naar binnen
function doorTile(b: Building, t: Tile | undefined): Tile {
  const s = B[b.type].size;
  if (!t) return [b.x + (s >> 1), b.y + (s >> 1)];
  const clamp = (v: number, lo: number) => Math.max(lo, Math.min(lo + s - 1, v));
  return [clamp(t[0], b.x), clamp(t[1], b.y)];
}

/** De route van gebouw `from` naar `to`: over de weg, of recht door de lucht (drones). null = niet over de weg. */
function tripRoute(from: Building, to: Building, fly: boolean): Tile[] | null {
  if (fly) return [doorTile(from, undefined), doorTile(to, undefined)];
  const roadPart = roadRoute(from, to);
  if (!roadPart) return null;
  // Van binnen het ene gebouw, over de weg, tot binnen het andere: zo komt de kar echt uit de deur
  return [
    doorTile(from, roadPart[0] || doorTile(to, undefined)),
    ...roadPart,
    doorTile(to, roadPart[roadPart.length - 1]),
  ];
}

// Een nieuwe kar op pad sturen (als er plek is onder het maximum). Geeft false als dat niet kon.
function launch(from: Building, to: Building, res: string, amount: number): boolean {
  checkGame();
  if (carts.length >= cartCap()) return false;
  // Eén regel voor alles, ook voor drones (die de weg niet nodig hebben): alleen tussen gebouwen aan de weg
  if (!roadLinked(from) || !roadLinked(to)) return false;
  const kind = cartKindFor(G.age),
    fly = kind === 'drone',
    route = tripRoute(from, to, fly);
  if (!route) return false;
  // Eén kar tegelijk door de deur: de volgende wacht binnen (d < 0, niet getekend) tot er een tegel ruimte is
  // Een korte rit gaat wat trager, zodat je hem toch zo'n MIN_TRIP_TIME seconden ziet (alleen voor het beeld)
  const len = routeLength(route),
    spd = Math.max(MIN_SPEED, Math.min(CART_SPEED[kind], len / MIN_TRIP_TIME)),
    wait = Math.max(0, (doorFreeAt.get(from.id) ?? 0) - G.t);
  doorFreeAt.set(from.id, G.t + wait + DOOR_GAP / spd);
  carts.push({
    id: nextId++,
    kind,
    res,
    amt: amount,
    route,
    len,
    d: -wait * spd,
    prevD: -wait * spd,
    spd,
    fly,
    from: from.id,
    to: to.id,
  });
  return true;
}

// De soorten met het meeste eerst (hooguit KEYS_PER_TRIP), alleen wat er echt is
const topKeys = (c: Cost): string[] =>
  Object.keys(c)
    .filter(k => c[k] > 0)
    .sort((p, q) => c[q] - c[p])
    .slice(0, KEYS_PER_TRIP);

/** Een nieuwe bouwplaats: vanaf de dichtstbijzijnde opslag rijden er (hooguit drie) karren met bouwstof heen. */
export function noteSupply(site: Building, cost: Cost): void {
  if (!roadLinked(site)) return;
  const drop = nearestLinkedDrop(site.x, site.y);
  if (!drop || drop === site) return;
  const keys = topKeys(cost);
  if (!keys.length) return;
  let total = 0;
  for (const k of keys) total += cost[k];
  const load = CART_LOAD[cartKindFor(G.age)],
    trips = Math.min(3, Math.ceil(total / load));
  // Elke rit de volgende soort (hout, dan steen ...), zodat je ziet wat er nodig is
  for (let t = 0; t < trips; t++) {
    const k = keys[t % keys.length];
    if (!launch(drop, site, k, Math.min(load, cost[k]))) break;
  }
}

/** Elke speltik: karren rijden verder, en wie lang genoeg spaarde stuurt een nieuwe rit. */
export function updateCarts(dt: number): void {
  checkGame();
  // (a) karren waarvan een kant gesloopt of verwoest is, verdwijnen; (b) de rest rijdt verder
  for (let i = carts.length - 1; i >= 0; i--) {
    const c = carts[i];
    if (!bById.has(c.from) || !bById.has(c.to)) {
      carts.splice(i, 1);
      continue;
    }
    c.prevD = c.d;
    let boost = 1;
    if (!c.fly) {
      const r = c.route[Math.max(0, Math.min(c.route.length - 1, Math.round(c.d)))];
      // De weg onder de kar: klinkers en asfalt rijden sneller, net als voor dorpelingen
      if (r) boost = roadBoost(road[r[1] * W + r[0]]);
    }
    c.d += dt * c.spd * boost;
    if (c.d >= c.len) carts.splice(i, 1);
  }
  // (c) twee keer per seconde kijken welke gebouwen een rit hebben klaarstaan
  sendTimer += dt;
  if (sendTimer < 0.5) return;
  sendTimer = 0;
  for (const [id, t] of doorFreeAt) if (t < G.t) doorFreeAt.delete(id);
  const load = CART_LOAD[cartKindFor(G.age)];
  for (const [id, o] of owed) {
    const b = bById.get(id);
    if (!b) {
      owed.delete(id);
      continue;
    }
    let inSum = 0,
      outSum = 0;
    for (const k in o.in) inSum += o.in[k];
    for (const k in o.out) outSum += o.out[k];
    const since = G.t - o.last;
    if (!shouldSend(inSum, load, since) && !shouldSend(outSum, load, since)) continue;
    // Een rit of niet: wat klaarstond is daarna vergeten (de economie zelf merkt hier niets van)
    const ins = o.in,
      outs = o.out;
    o.in = {};
    o.out = {};
    o.last = G.t;
    const drop = nearestLinkedDrop(b.x + B[b.type].size / 2, b.y + B[b.type].size / 2);
    if (!drop || drop === b) continue;
    for (const k of topKeys(ins)) if (!launch(drop, b, k, Math.min(load, ins[k]))) break;
    for (const k of topKeys(outs)) if (!launch(b, drop, k, Math.min(load, outs[k]))) break;
  }
}

/** Waar de spullen van dit gebouw heen gaan en vandaan komen, en hoe ver (in tegels). null = niet aan de weg. */
export function flowRoute(b: Building): { drop: Building; tiles: number } | null {
  if (!roadLinked(b)) return null;
  const s = B[b.type].size / 2,
    drop = nearestLinkedDrop(b.x + s, b.y + s);
  if (!drop || drop === b) return null;
  const route = roadRoute(drop, b);
  if (!route) return null;
  return { drop, tiles: Math.max(1, Math.round(routeLength(route)) + 1) };
}

/** Alleen om te testen en te meten: n karren tussen willekeurige paren gebouwen aan de weg. Geeft hoeveel er rijden. */
export function cartStress(n: number): number {
  const linked = G.bs.filter(b => b.done && roadLinked(b));
  if (linked.length < 2) return 0;
  const keys = ['food', 'wood', 'stone', 'copper', 'tin', 'bronze', 'iron', 'gold'];
  for (let k = 0; k < n * 4 && carts.length < Math.min(n, cartCap()); k++) {
    const a = linked[Math.floor(Math.random() * linked.length)],
      z = linked[Math.floor(Math.random() * linked.length)];
    if (a === z) continue;
    if (launch(a, z, keys[k % keys.length], 5)) {
      // Verspreid over de route, en ze blijven langer rijden (heen en weer telt hier niet)
      const c = carts[carts.length - 1];
      c.d = c.prevD = Math.random() * c.len * 0.8;
    }
  }
  doorFreeAt.clear(); // (ze staan al verspreid over de weg: niemand hoeft bij de deur te wachten)
  return carts.length;
}
