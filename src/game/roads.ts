// Het wegennet: welke gebouwen aan een weg naar het stamhuis liggen, en paden vanzelf aanleggen.
import type { Building, Cost, Tile } from '../types';
import { H, W } from '../config';
import { B } from '../data/buildings';
import { NODES } from '../data/nodes';
import {
  LINK_MAX,
  START_STUB,
  floodRoads,
  linkPath,
  needsRoad,
  ringTiles,
  roadPathBetween,
  roadRateFor,
} from '../data/roads';
import { has, pay } from './economy';
import { buildCost, layRoadTile } from './placement';
import { G } from './state';
import { roadTier } from './upgrades';
import { TER, amt, blk, bmap, buildLists, isUnl, node, road, ter } from '../world/world';

// Bomen, struiken, losse stenen en zand gaan weg voor een weg; ertsaders niet (net als in placement.ts)
const CLEAR = new Set(['tree', 'bush', 'rock', 'sand']);

let netMark = new Int32Array(0),
  netStamp = 0,
  version = 0,
  dirty = true,
  lastRoadArray: Uint8Array | null = null,
  lastHallId = -1;
/** Beste wegsoort rond elk gebouw (op id), bijgehouden zolang het net niet verandert. */
const linkTier = new Map<number, number>();
/** Routes tussen twee gebouwen over de weg (voor karren), bijgehouden zolang het net niet verandert. */
const routeCache = new Map<string, Tile[] | null>();

const hallOf = (): Building | undefined => G.bs.find(b => b.type === 'townhall');

/** Iets heeft de wegen veranderd (aangelegd, weggehaald, vernieuwd, geladen): het net opnieuw uitrekenen. */
export function markRoadsChanged(): void {
  dirty = true;
}
/** Gaat 1 omhoog elke keer dat het wegennet opnieuw is uitgerekend. */
export const roadVersion = (): number => version;

/** Reken uit welke wegtegels met het stamhuis verbonden zijn. Snel als er niets veranderd is. */
export function updateRoadNet(): void {
  const hall = hallOf();
  const hallId = hall ? hall.id : -1;
  // genWorld maakt een nieuwe rij voor de wegen: dat is ook een verandering
  if (!dirty && road === lastRoadArray && hallId === lastHallId) return;
  dirty = false;
  lastRoadArray = road;
  lastHallId = hallId;
  if (netMark.length !== W * H) {
    netMark = new Int32Array(W * H);
    netStamp = 0;
  }
  netStamp++;
  if (hall) floodRoads(road, W, H, ringTiles(hall.x, hall.y, B[hall.type].size, W, H), netMark, netStamp);
  version++;
  linkTier.clear();
  routeCache.clear();
}

/** Ligt tegel i aan het wegennet van het stamhuis? */
export function onRoadNet(i: number): boolean {
  updateRoadNet();
  return road[i] > 0 && netMark[i] === netStamp;
}

/** De beste wegsoort aan het net rond dit gebouw (0 = niet verbonden). Rekent zelf, zonder uitzonderingen. */
function netTierAround(b: Building): number {
  updateRoadNet();
  const known = linkTier.get(b.id);
  if (known !== undefined) return known;
  let best = 0;
  for (const i of ringTiles(b.x, b.y, B[b.type].size, W, H))
    if (netMark[i] === netStamp && road[i] > best) best = road[i];
  linkTier.set(b.id, best);
  return best;
}

/** Beste wegsoort (1-3) aan het net rond dit gebouw; 0 = niet verbonden; 1 voor gebouwen zonder wegnood. */
export function roadTierOf(b: Building): number {
  if (!needsRoad(B[b.type])) return 1;
  const tier = netTierAround(b);
  return b.roadFree ? Math.max(1, tier) : tier;
}
/** Ligt dit gebouw aan de weg (of heeft het geen weg nodig)? Werkt ook voor een bouwplaats. */
export function roadLinked(b: Building): boolean {
  return b.type === 'townhall' || !!b.roadFree || roadTierOf(b) > 0;
}
/** Hoe snel dit gebouw werkt door de weg: 0,35 zonder weg, 1 aan een pad, 1,1 aan klinkers, 1,2 aan asfalt. */
export function roadRate(b: Building): number {
  if (b.roadFree || !needsRoad(B[b.type])) return 1;
  return roadRateFor(roadTierOf(b));
}

// Kan er op tegel i een nieuw stuk pad komen? -1 = nee, 0 = er ligt al een weg, 1 = ja (nieuw)
function linkCost(i: number, footprint: Set<number>): -1 | 0 | 1 {
  if (footprint.has(i)) return -1;
  if (road[i]) return 0;
  const x = i % W,
    y = (i / W) | 0;
  if (!isUnl(x, y) || ter[i] === TER.WATER || ter[i] === TER.ROCK || bmap[i] || blk[i]) return -1;
  if (node[i] && !CLEAR.has(NODES[node[i]].k)) return -1;
  return 1;
}

/**
 * Welke nieuwe tegels pad zijn nodig om dit gebouw (of deze plek) aan het net te leggen? [] als het er al aan
 * ligt, null als dat niet lukt met hooguit maxNew tegels.
 */
export function planRoadLink(p: { type: string; x: number; y: number }, maxNew = LINK_MAX): Tile[] | null {
  updateRoadNet();
  const s = B[p.type].size,
    footprint = new Set<number>();
  for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) footprint.add((p.y + dy) * W + p.x + dx);
  const path = linkPath(
    W,
    H,
    ringTiles(p.x, p.y, s, W, H),
    i => linkCost(i, footprint),
    i => road[i] > 0 && netMark[i] === netStamp,
    maxNew,
  );
  return path && path.map(i => [i % W, (i / W) | 0] as Tile);
}

/** Wat deze tegels pad samen kosten. */
export function roadLinkCost(tiles: Tile[]): Cost {
  const per = buildCost('road'),
    out: Cost = {};
  for (const k in per) out[k] = per[k] * tiles.length;
  return out;
}

/**
 * Leg het pad aan dat dit gebouw met het net verbindt, en betaal het (free: gratis). Geeft hoeveel tegels er
 * nieuw zijn; 0 als het niet lukte of het gebouw er al aan lag.
 */
export function buildRoadLink(b: Building, free = false, maxNew = LINK_MAX): number {
  const plan = planRoadLink(b, maxNew);
  if (!plan || !plan.length) return 0;
  const cost = roadLinkCost(plan);
  if (!free && !has(cost)) return 0;
  if (!free) pay(cost);
  for (const [x, y] of plan) layRoadTile(y * W + x, !free);
  markRoadsChanged();
  updateRoadNet();
  return plan.length;
}

/**
 * De tegels over de weg van een nettegel bij `from` naar een nettegel bij `to` ([] als ze er een delen).
 * null als een van beide niet aan het net ligt.
 */
export function roadRoute(from: Building, to: Building): Tile[] | null {
  updateRoadNet();
  const key = from.id + '-' + to.id;
  const cached = routeCache.get(key);
  if (cached !== undefined) return cached;
  const onNet = (b: Building) => ringTiles(b.x, b.y, B[b.type].size, W, H).filter(i => onRoadNet(i));
  const a = onNet(from),
    z = onNet(to);
  let route: Tile[] | null = null;
  if (a.length && z.length) {
    const shared = a.some(i => z.includes(i));
    const path = shared ? [] : roadPathBetween(road, W, H, a, z);
    route = path && path.map(i => [i % W, (i / W) | 0] as Tile);
  }
  if (routeCache.size >= 256) routeCache.clear();
  routeCache.set(key, route);
  return route;
}

// Eerst wat het meest uitmaakt: woningen, akkers en opslag, daarna de rest
const linkOrder = (b: Building): number => {
  const d = B[b.type];
  return d.pop ? 0 : d.work ? 1 : d.drop ? 2 : 3;
};
/** Gebouwen (ook bouwplaatsen) die een weg nodig hebben maar er niet aan liggen. */
export function unlinkedBuildings(): Building[] {
  return G.bs
    .filter(b => needsRoad(B[b.type]) && !b.roadFree && !roadLinked(b))
    .sort((p, q) => linkOrder(p) - linkOrder(q));
}

// Kan de startweg over deze tegel? Niet over water, bergen, gebouwen of ertsaders (bomen en stenen gaan weg)
function startTileOk(x: number, y: number): boolean {
  if (!isUnl(x, y)) return false;
  const i = y * W + x;
  if (ter[i] === TER.WATER || ter[i] === TER.ROCK || bmap[i]) return false;
  return !node[i] || CLEAR.has(NODES[node[i]].k);
}

/** Gratis paden rond het stamhuis: een ring en vier korte stukjes naar buiten. Geeft hoeveel tegels er nieuw zijn. */
export function layStartRoads(hall: Building): number {
  const s = B[hall.type].size,
    x0 = hall.x,
    y0 = hall.y;
  const t = roadTier();
  let n = 0;
  const lay = (x: number, y: number) => {
    const i = y * W + x;
    if (road[i]) return;
    // Een boom of steen op de plek gaat weg, zonder hout terug (het pad is een cadeautje)
    node[i] = 0;
    amt[i] = 0;
    road[i] = t;
    n++;
  };
  for (const i of ringTiles(x0, y0, s, W, H)) if (startTileOk(i % W, (i / W) | 0)) lay(i % W, (i / W) | 0);
  // Vier stukjes als een molentje, één per kant: boven, rechts, onder en links. Een stukje stopt bij de eerste
  // boom, struik of steen: de dichtstbijzijnde bomen zijn juist het hout voor het begin.
  const stubs = [
    [x0, y0 - 1, 0, -1],
    [x0 + s, y0, 1, 0],
    [x0 + s - 1, y0 + s, 0, 1],
    [x0 - 1, y0 + s - 1, -1, 0],
  ];
  for (const [sx, sy, dx, dy] of stubs)
    for (let k = 1; k <= START_STUB; k++) {
      const x = sx + dx * k,
        y = sy + dy * k;
      if (!startTileOk(x, y) || node[y * W + x]) break;
      lay(x, y);
    }
  if (n) {
    buildLists(); // de weggehaalde bomen en stenen ook uit de lijsten van wat er te halen is
    markRoadsChanged();
  }
  return n;
}

/**
 * Een opslag van vóór de wegen: het stamhuis krijgt zijn startpaden, elk gebouw een gratis pad naar het net.
 * Lukt dat niet (te ver, iets in de weg), dan hoeft dat gebouw geen weg (roadFree). Zo werkt alles als vroeger.
 */
export function migrateOldTown(): { linked: number; exempt: number } {
  const hall = hallOf();
  let linked = 0,
    exempt = 0;
  if (hall) layStartRoads(hall);
  updateRoadNet();
  for (const b of unlinkedBuildings()) {
    if (hall && buildRoadLink(b, true, LINK_MAX)) linked++;
    else {
      b.roadFree = true;
      exempt++;
    }
  }
  return { linked, exempt };
}

// Het stuk weg waar een tegel bij hoort (voor het infopaneel en de markering), bewaard tot er iets verandert
const stretchCache = new Map<string, number[]>();
let stretchVersion = -1;
/** De wegtegels die met tegel i verbonden zijn (hooguit max), de dichtstbijzijnde eerst. */
export function roadStretch(i: number, max = 400): number[] {
  updateRoadNet();
  if (stretchVersion !== version) {
    stretchCache.clear();
    stretchVersion = version;
  }
  const key = i + '/' + max;
  const known = stretchCache.get(key);
  if (known) return known;
  const out: number[] = [];
  if (road[i]) {
    const seenHere = new Set([i]);
    out.push(i);
    for (let head = 0; head < out.length && out.length < max; head++) {
      const x = out[head] % W,
        y = (out[head] / W) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy,
            j = ny * W + nx;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || !road[j] || seenHere.has(j)) continue;
          seenHere.add(j);
          if (out.length < max) out.push(j);
        }
    }
  }
  if (stretchCache.size > 16) stretchCache.clear();
  stretchCache.set(key, out);
  return out;
}
/** Hoeveel gebouwen met wegnood aan het stuk weg van tegel i liggen. */
export function buildingsOnStretch(i: number): number {
  const tiles = new Set(roadStretch(i, W * H));
  return G.bs.filter(
    b => needsRoad(B[b.type]) && ringTiles(b.x, b.y, B[b.type].size, W, H).some(t => tiles.has(t)),
  ).length;
}
