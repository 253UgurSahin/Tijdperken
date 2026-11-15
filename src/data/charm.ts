// Sfeer in je dorp: versiering maakt huizen gezelliger, fabrieken maken ze somber. Puur rekenwerk, zonder spelstand.
import type { BuildingDef } from '../types';

/** Hoe gezellig een huis is. */
export interface CharmTier {
  /** Sleutel, voor de opmaak. */
  k: 'grim' | 'plain' | 'cosy' | 'lovely';
  /** Naam voor de speler. */
  n: string;
  /** Vanaf hoeveel sfeer (de eerste geldt voor alles daaronder). */
  min: number;
}

/**
 * Van somber naar prachtig. Sfeer is één van de dingen waardoor een huis groeit (zie data/houses.ts): de
 * welvaart bepaalt hoeveel mensen er wonen, niet de sfeer alleen.
 */
export const CHARM_TIERS: CharmTier[] = [
  { k: 'grim', n: 'Somber', min: -Infinity },
  { k: 'plain', n: 'Gewoon', min: 0 },
  { k: 'cosy', n: 'Gezellig', min: 3 },
  { k: 'lovely', n: 'Prachtig', min: 6 },
];

/** Meer dan dit telt niet mee: tien beelden naast één hut maken hem niet nog mooier. */
export const CHARM_MAX = 10;
/** Minder dan dit ook niet: één huis tussen de fabrieken is somber, niet nog somberder. */
export const CHARM_MIN = -6;

/** De trede van een huis met zoveel sfeer. */
export function charmTier(value: number): CharmTier {
  let tier = CHARM_TIERS[0];
  for (const t of CHARM_TIERS) if (value >= t.min) tier = t;
  return tier;
}

/** Sfeer begrensd tussen CHARM_MIN en CHARM_MAX. */
export const clampCharm = (value: number): number => Math.max(CHARM_MIN, Math.min(CHARM_MAX, value));

/** Iets op de kaart met een plek en een maat (een gebouw van jou, of een voorbeeld bij het plaatsen). */
export interface Placed {
  type: string;
  x: number;
  y: number;
}

/** Afstand tussen de middens van twee gebouwen, in tegels. */
export function centreDistance(a: Placed, sizeA: number, b: Placed, sizeB: number): number {
  const dx = a.x + sizeA / 2 - (b.x + sizeB / 2),
    dy = a.y + sizeA / 2 - (b.y + sizeB / 2);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Hoeveel sfeer een gebouw `src` geeft aan een huis `home`: zijn waarde als het huis binnen het bereik staat,
 * anders 0. Het bereik telt vanaf de rand van het huis, zodat een groot huis niet slechter uitkomt.
 */
export function charmFrom(defs: Record<string, BuildingDef>, src: Placed, home: Placed): number {
  const s = defs[src.type],
    h = defs[home.type];
  if (!s || !h || !s.charm) return 0;
  const d = centreDistance(src, s.size, home, h.size) - (h.size - 1) / 2;
  return d <= s.charm.r ? s.charm.v : 0;
}

/** De sfeer van één huis: alles in de buurt bij elkaar, begrensd. */
export function charmOfHome(defs: Record<string, BuildingDef>, home: Placed, around: Placed[]): number {
  let sum = 0;
  for (const src of around) if (src !== home) sum += charmFrom(defs, src, home);
  return clampCharm(sum);
}

/**
 * Hoeveel sneller een akker oogst door een waterput of molen in de buurt (1 = gewoon). Meerdere helpers tellen
 * op, maar samen nooit meer dan +40%.
 */
export function farmBoostOf(defs: Record<string, BuildingDef>, farm: Placed, around: Placed[]): number {
  const f = defs[farm.type];
  if (!f || !f.work) return 1;
  let extra = 0;
  for (const src of around) {
    const s = defs[src.type];
    if (src === farm || !s || !s.aura) continue;
    if (centreDistance(src, s.size, farm, f.size) <= s.aura.r) extra += s.aura.farm;
  }
  return 1 + Math.min(0.4, extra);
}
