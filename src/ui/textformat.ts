// Getallen, lange namen en grondstof-fiches als tekst: puur (alleen speldata), zodat het te testen is.
import { RES } from '../data/resources';

/** Een getal zonder voorteken, met een komma als scheidingsteken en hoogstens één cijfer erachter. */
const oneDecimal = (n: number): string => n.toFixed(1).replace('.', ',');

/*
 * Een getal kort en op zijn Nederlands: 9.999, dan 10,0k tot 99,9k, dan 100k tot 999k en daarna 1,2M.
 * We ronden eerst af en kiezen daarna de vorm, zodat er nooit "100,0k" of "1000k" verschijnt.
 */
export const fmt = (n: number): string => {
  n = Math.floor(n);
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a < 10000) return n.toLocaleString('nl-NL');
  const k = Math.round(a / 100) / 10;
  if (k < 100) return sign + oneDecimal(k) + 'k';
  if (a < 999500) return sign + Math.round(a / 1000) + 'k';
  return sign + oneDecimal(Math.round(a / 100000) / 10) + 'M';
};

/** Een getal met hoogstens één cijfer achter de komma, op zijn Nederlands (6,5 in plaats van 6.5). */
export const fmtDec = (n: number): string => n.toLocaleString('nl-NL', { maximumFractionDigits: 1 });

// Kort getal voor op een kleine tegel: 1200 wordt "1,2k", 15000 wordt "15k", een miljoen "1M"
export const fmtShort = (n: number): string => {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  if (n < 9950) return oneDecimal(n / 1000).replace(/,0$/, '') + 'k';
  if (n < 999500) return Math.round(n / 1000) + 'k';
  return oneDecimal(n / 1000000).replace(/,0$/, '') + 'M';
};

/** De vorm van elk grondstof-fiche, zodat je ze ook zonder kleur uit elkaar houdt. */
export const SHAPE: Record<string, string> = {
  food: 'circle(50%)',
  wood: 'polygon(50% 0,100% 88%,0 88%)',
  stone: 'polygon(25% 6%,75% 6%,100% 50%,75% 94%,25% 94%,0 50%)',
  copper: 'polygon(50% 0,100% 50%,50% 100%,0 50%)',
  tin: 'inset(8% round 2px)',
  bronze: 'polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%)',
  iron: 'polygon(50% 0,100% 38%,82% 100%,18% 100%,0 38%)',
  gold: 'polygon(50% 0,62% 35%,100% 36%,69% 58%,80% 95%,50% 73%,20% 95%,31% 58%,0 36%,38% 35%)',
  // buskruit: een rond vaatje
  powder: 'ellipse(40% 50%)',
  coal: 'polygon(22% 0,100% 22%,78% 100%,0 78%)',
  steel: 'polygon(0 22%,100% 22%,100% 78%,0 78%)',
  oil: 'polygon(50% 0,86% 55%,78% 88%,50% 100%,22% 88%,14% 55%)',
  sand: 'polygon(18% 28%,82% 28%,100% 92%,0 92%)',
  fuel: 'polygon(0 8%,100% 8%,50% 100%)',
  silicon: 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)',
  lithium:
    'polygon(35% 0,65% 0,65% 35%,100% 35%,100% 65%,65% 65%,65% 100%,35% 100%,35% 65%,0 65%,0 35%,35% 35%)',
  chips: 'polygon(0 0,100% 0,100% 100%,0 100%,0 62%,22% 62%,22% 38%,0 38%)',
  battery: 'polygon(38% 0,62% 0,62% 14%,86% 14%,86% 100%,14% 100%,14% 14%,38% 14%)',
  // sterrenmetaal: een ster met vier punten
  starmetal: 'polygon(50% 0,63% 37%,100% 50%,63% 63%,50% 100%,37% 63%,0 50%,37% 37%)',
  // fusiecellen: een bliksemschicht
  fusion: 'polygon(62% 0,12% 58%,44% 58%,34% 100%,88% 40%,56% 40%)',
};

/** Een klein gekleurd fiche voor een grondstof. */
export const gem = (k: string): string =>
  `<i class="gem" style="--c:${RES[k].c};--clip:${SHAPE[k] || 'none'}"></i>`;

/** Zet een zacht afbreekstreepje voor het laatste deel van een lange naam (Steen-groeve, Mijn-schacht). */
export const hy = (s: string): string =>
  String(s).replace(
    /^(.{4,}?)(woning|menten|lantaarn|fabriek|batterij|centrum|gieterij|centrale|afweer|plaats|toren|koepel|schutter|drager|drone|hangar|punt|werker|pand|soldaat|werper|molen|poort|smidse|reactor|werf|fort|wagen|vechter|wapen|seum|station|werken|groeve|schacht|fontein|tuin|derij)$/i,
    '$1­$2',
  );
