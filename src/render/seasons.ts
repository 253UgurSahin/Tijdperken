// De seizoenen in beeld: de kleur van bomen, gras en grond, sneeuw, lentebloesem en gevallen blad. Een nieuw
// seizoen komt niet ineens: het loopt zacht in tijdens de laatste nacht van het oude (zie seasonBlend).
import * as T3 from 'three';
import { store } from '../core/store';
import { seasonBlend, seasonIndex } from '../data/modifiers';
import { hasRule } from '../game/mods';
import { G } from '../game/state';
import { BLOSSOM, FOL } from './nodes';
import { setScatterLook } from './scatter';
import { TMAT } from './terrain';
import { LEAF_LITTER, SNOW_COVER } from './weather';

/** Hoe één seizoen eruitziet. */
interface SeasonLook {
  /** Kleur van het blad per soort boom (zie FOL in nodes.ts). */
  leaves: Record<string, string>;
  /** Kleurfilter over de grond en over de grasplukjes. */
  ground: string;
  grass: string;
  /** Hoe strogeel de grasplukjes zijn (0..1). */
  straw: number;
  /** Hoeveel bloemetjes er staan (1 = gewoon, 0 = geen). */
  flowers: number;
  /** Hoeveel sneeuw en hoeveel gevallen blad er ligt (0..1). */
  snow: number;
  litter: number;
}
const GREEN = { oak: '#4f8a3c', birch: '#8fbf5a', pine: '#3f6b3f', pine2: '#4a7a45', bush: '#4d7d38' };
// Lente, zomer, herfst en winter (in de volgorde van seasonIndex)
const SPRING = 0;
const LOOKS: SeasonLook[] = [
  { leaves: GREEN, ground: '#ffffff', grass: '#ffffff', straw: 0, flowers: 1.8, snow: 0, litter: 0 },
  { leaves: GREEN, ground: '#fff6dc', grass: '#f4f0d8', straw: 0, flowers: 1, snow: 0, litter: 0 },
  {
    leaves: { ...GREEN, oak: '#c9772f', birch: '#d9a83a' },
    ground: '#f2e6cc',
    grass: '#e8cf8a',
    straw: 0,
    flowers: 1,
    snow: 0,
    litter: 1,
  },
  // Winter: kale eiken, berken en struiken (de kleur van hout, met sneeuw erop) en donkere naaldbomen
  {
    leaves: { oak: '#6b5d52', birch: '#8c8277', pine: '#4d6a5a', pine2: '#5b7868', bush: '#55604d' },
    ground: '#e4ecf0',
    grass: '#ffffff',
    straw: 1,
    flowers: 0,
    snow: 1,
    litter: 0,
  },
];
// Dezelfde kleuren als three.js-kleuren, één keer omgezet (om elk beeldje te mengen)
const PALETTES = LOOKS.map(look => ({
  leaves: Object.fromEntries(Object.entries(look.leaves).map(([k, c]) => [k, new T3.Color(c)])),
  ground: new T3.Color(look.ground),
  grass: new T3.Color(look.grass),
}));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Sneeuw en blad volgen het seizoen met wat vertraging: na EASE_TIME seconden (bij snelheid 1) is ongeveer twee
// derde van het verschil weg. Echte tijd keer de spelsnelheid: zo oogt het bij elke snelheid even vlot.
const EASE_TIME = 7;
let lastGame: unknown = null,
  lastTM = 0,
  lastHours = 0;
const grassTint = new T3.Color();

/** Hoeveel bloesem er is: komt op in de laatste winternacht, staat de hele lente en verwelkt op de laatste dag. */
function blossomAt(now: number, next: number, t: number): number {
  if (now !== SPRING) return next === SPRING ? t : 0;
  if (next === SPRING) return 1;
  return 1 - ((G.clock - 6 + 24) % 24) / 24; // de dag loopt van 6 uur tot 6 uur
}

/** Elk beeldje: kleuren, sneeuw, bloesem en blad bij het seizoen (en de overgang naar het volgende). */
export function applySeason(): void {
  const longWinter = hasRule('longWinter'),
    now = seasonIndex(G.day, longWinter),
    next = seasonIndex(G.day + 1, longWinter),
    t = seasonBlend(G.day, G.clock, longWinter),
    a = LOOKS[now],
    b = LOOKS[next],
    pa = PALETTES[now],
    pb = PALETTES[next];
  // Kleuren: een mengsel van het seizoen van nu en dat van morgen (meestal t = 0: alleen dat van nu)
  for (const k in FOL) FOL[k].color.copy(pa.leaves[k]).lerp(pb.leaves[k], t);
  TMAT.color.copy(pa.ground).lerp(pb.ground, t);
  // De bloemetjes wisselen halverwege de nacht (hun aantal zit in het neerzetten, zie scatter.ts)
  setScatterLook(
    grassTint.copy(pa.grass).lerp(pb.grass, t),
    lerp(a.straw, b.straw, t),
    (t > 0.5 ? b : a).flowers,
  );
  BLOSSOM.value = blossomAt(now, next, t);
  // Sneeuw valt in de nacht en ligt er helemaal als het licht wordt (daarom loopt hij voor op t); bij dooi
  // smelten de laatste plekjes pas in de eerste ochtend van de lente
  const snowWant = lerp(a.snow, b.snow, b.snow > a.snow ? Math.min(1, t * 1.25) : t),
    litterWant = lerp(a.litter, b.litter, t);
  // Speluren sinds het begin (de dag telt om 6 uur verder, dus vanaf 6 uur gerekend loopt dit gelijkmatig door)
  const hours = (G.day - 1) * 24 + ((G.clock - 6 + 24) % 24),
    dt = Math.max(0, store.TM - lastTM),
    // Een nieuw of geladen spel, of een sprong in de tijd: meteen goed, zonder overgang
    jump = G !== lastGame || Math.abs(hours - lastHours) > 1.5;
  lastGame = G;
  lastTM = store.TM;
  lastHours = hours;
  if (jump) {
    SNOW_COVER.value = snowWant;
    LEAF_LITTER.value = litterWant;
    return;
  }
  // (1 - e^(-dt/tijd): even snel bij 30 en bij 120 beeldjes per seconde)
  const k = 1 - Math.exp((-dt * Math.max(1, G.speed)) / EASE_TIME);
  SNOW_COVER.value += (snowWant - SNOW_COVER.value) * k;
  LEAF_LITTER.value += (litterWant - LEAF_LITTER.value) * k;
}
