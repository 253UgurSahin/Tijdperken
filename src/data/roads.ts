// Wegen: welk gebouw een weg nodig heeft, en het rekenwerk voor het wegennet. Puur, dus te testen.
import type { BuildingDef } from '../types';

/** Zo snel werkt een gebouw dat niet aan de weg ligt (0,35 = 35%): zacht, nooit helemaal stil. */
export const OFFROAD_RATE = 0.35,
  /** Elke betere wegsoort (klinkers, asfalt) laat een gebouw aan die weg 10% sneller werken. */
  TIER_BONUS = 0.1,
  /** Zo veel tegels pad legt het spel vanzelf aan als je een gebouw neerzet. */
  LINK_AUTO = 8,
  /** Langer zoekt het spel niet naar een pad (knop 'Pad aanleggen' en de coach). */
  LINK_MAX = 40,
  /** Zo lang zijn de vier stukjes pad die bij het begin uit het stamhuis steken. */
  START_STUB = 4;

/**
 * Heeft dit gebouw een weg naar het stamhuis nodig om goed te werken? Woningen, akkers, opslag, fabrieken,
 * pompen, centrales, kazernes en de markt wel. Het stamhuis is zelf het begin van het net. Muren, wegen,
 * wonderen, versiering, lampen en losse torens niet: verdediging zet je overal neer. Rivalen hebben hun eigen
 * gebouwen (RivalBuilding, niet in G.bs), dus voor hen telt dit niet; een veroverd wonder ook niet.
 */
export function needsRoad(d: BuildingDef): boolean {
  if (d.nobuild || d.wall || d.road || d.wonder || d.win || d.cat === 'deco') return false;
  return !!(d.pop || d.drop || d.work || d.conv || d.gen || d.pump || d.train || d.market);
}

/** Hoe snel een gebouw werkt bij deze wegsoort: 0 = geen weg (35%), 1 = pad, 2 = klinkers, 3 = asfalt. */
export function roadRateFor(tier: number): number {
  if (tier <= 0) return OFFROAD_RATE;
  return 1 + TIER_BONUS * (tier - 1);
}

/** Wat er misgaat als dit gebouw niet aan de weg ligt, in gewone woorden (voor het infopaneel en de coach). */
export function offRoadEffect(d: BuildingDef): string {
  if (d.drop) return 'dorpelingen brengen hier niets heen';
  if (d.conv || d.pump || d.gen || d.train || d.work) return 'werkt maar op een derde';
  return 'ligt los van het dorp';
}

/** De tegels rondom een gebouw van size bij size, met de hoeken erbij (8 bij 1 tegel, 12 bij 2), op de kaart. */
export function ringTiles(x: number, y: number, size: number, W: number, H: number): number[] {
  const out: number[] = [];
  for (let yy = y - 1; yy <= y + size; yy++)
    for (let xx = x - 1; xx <= x + size; xx++) {
      const inside = xx >= x && xx < x + size && yy >= y && yy < y + size;
      if (inside || xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      out.push(yy * W + xx);
    }
  return out;
}

// De acht buren van een tegel. De eerste vier zijn recht (boven, onder, links, rechts), de rest schuin.
const DX = [0, 0, -1, 1, -1, 1, -1, 1],
  DY = [-1, 1, 0, 0, -1, -1, 1, 1];

// Hulprijen ter grootte van de kaart, één keer gemaakt (zoeken gebeurt vaak, steeds nieuwe rijen is traag)
let scratchSize = 0,
  queue = new Int32Array(0),
  seen = new Int32Array(0),
  prev = new Int32Array(0),
  cost = new Int32Array(0),
  seenStamp = 0;
function scratch(n: number): void {
  if (scratchSize === n) return;
  scratchSize = n;
  queue = new Int32Array(n * 2); // twee keer: de 0-1-zoektocht zet tegels vooraan én achteraan
  seen = new Int32Array(n);
  prev = new Int32Array(n);
  cost = new Int32Array(n);
  seenStamp = 0;
}
function nextStamp(): number {
  seenStamp++;
  if (seenStamp > 2e9) {
    seen.fill(0);
    seenStamp = 1;
  }
  return seenStamp;
}

/**
 * Kleur alle wegtegels die met de begintegels verbonden zijn: mark[i] = stamp. Schuin telt ook (de weg wordt
 * dan ook aan elkaar getekend). Begintegels zonder weg tellen niet. Geeft hoeveel tegels er gekleurd zijn.
 */
export function floodRoads(
  road: Uint8Array,
  W: number,
  H: number,
  seeds: number[],
  mark: Int32Array,
  stamp: number,
): number {
  scratch(W * H);
  let head = 0,
    tail = 0;
  for (const s of seeds)
    if (road[s] && mark[s] !== stamp) {
      mark[s] = stamp;
      queue[tail++] = s;
    }
  while (head < tail) {
    const i = queue[head++],
      x = i % W,
      y = (i / W) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k],
        ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (!road[j] || mark[j] === stamp) continue;
      mark[j] = stamp;
      queue[tail++] = j;
    }
  }
  return tail;
}

/**
 * De kortste route over wegtegels van een van de `from`-tegels naar een van de `to`-tegels (schuin mag).
 * Geeft de tegels van begin tot eind, of null als ze niet over de weg verbonden zijn.
 */
export function roadPathBetween(
  road: Uint8Array,
  W: number,
  H: number,
  from: number[],
  to: number[],
  maxSteps = 20000,
): number[] | null {
  scratch(W * H);
  const stamp = nextStamp(),
    goal = new Set(to.filter(i => road[i]));
  if (!goal.size) return null;
  let head = 0,
    tail = 0;
  for (const s of from)
    if (road[s] && seen[s] !== stamp) {
      seen[s] = stamp;
      prev[s] = -1;
      queue[tail++] = s;
    }
  while (head < tail && head < maxSteps) {
    const i = queue[head++];
    if (goal.has(i)) {
      const path: number[] = [];
      for (let c = i; c >= 0; c = prev[c]) path.push(c);
      return path.reverse();
    }
    const x = i % W,
      y = (i / W) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k],
        ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (!road[j] || seen[j] === stamp) continue;
      seen[j] = stamp;
      prev[j] = i;
      queue[tail++] = j;
    }
  }
  return null;
}

/**
 * Zoek het kortste stuk nieuw pad van een begintegel naar een doeltegel. cost(i): -1 = kan niet, 0 = ligt al een
 * weg (gratis), 1 = nieuwe tegel. Nieuwe tegels gaan alleen recht (dan lijkt het op een gesleept pad); over een
 * bestaande weg mag het ook schuin. Geeft alleen de tegels die nieuw moeten, in volgorde; [] als een begintegel
 * al een doel is; null als het niet lukt met hooguit maxNew nieuwe tegels.
 */
export function linkPath(
  W: number,
  H: number,
  start: number[],
  costOf: (i: number) => -1 | 0 | 1,
  isTarget: (i: number) => boolean,
  maxNew: number,
): number[] | null {
  scratch(W * H);
  const stamp = nextStamp(),
    n = W * H;
  // 0-1-zoektocht met een rij van twee kanten: gratis stappen vooraan, nieuwe tegels achteraan
  let head = n,
    tail = n;
  const push = (j: number, c: number, from: number, front: boolean) => {
    seen[j] = stamp;
    cost[j] = c;
    prev[j] = from;
    if (front) queue[--head] = j;
    else queue[tail++] = j;
  };
  for (const s of start) {
    const c = costOf(s);
    if (c < 0) continue;
    if (seen[s] === stamp && cost[s] <= c) continue;
    push(s, c, -1, c === 0);
  }
  while (head < tail) {
    const i = queue[head++],
      ci = cost[i];
    if (ci > maxNew) continue;
    if (isTarget(i)) {
      const out: number[] = [];
      for (let c = i; c >= 0; c = prev[c]) if (costOf(c) === 1) out.push(c);
      return out.reverse();
    }
    const x = i % W,
      y = (i / W) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k],
        ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx,
        step = costOf(j);
      if (step < 0 || (k >= 4 && step !== 0)) continue; // schuin alleen naar een bestaande weg
      const c = ci + step;
      if (c > maxNew || (seen[j] === stamp && cost[j] <= c)) continue;
      push(j, c, i, step === 0);
    }
  }
  return null;
}
