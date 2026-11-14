// Kampioenen: na elk nieuw tijdperk leidt een sterke aanvoerder met een eigen naam een aanval (na een rustnacht). Puur.
import type { PendingBoss } from '../types';

/** Zoveel keer meer levens dan een gewone aanvaller van zijn soort. */
export const BOSS_HP = 6;
/** Zoveel keer meer schade. */
export const BOSS_DMG = 2;
/** Zoveel keer groter getekend, zodat je hem meteen ziet tussen de rest. */
export const BOSS_SCALE = 1.7;

/*
 * Elke kampioen hoort bij één tijdperk (de Steentijd heeft er geen: daar begint het spel).
 * - age: na dit nieuwe tijdperk komt hij, n: naam, title: bijnaam ("de Verscheurder")
 * - role: wie hij is, in een paar woorden
 * - foe: welk soort vijand hij is (nummer in FOES; meestal de vijanden van zijn eigen tijdperk)
 */
/** Een kampioen (zie de uitleg hierboven). */
export interface BossDef {
  age: number;
  n: string;
  title: string;
  role: string;
  foe: number;
}

export const BOSSES: BossDef[] = [
  { age: 1, n: 'Grimnar', title: 'de Verscheurder', role: 'Aanvoerder van de plunderaars', foe: 1 },
  { age: 2, n: 'Brennos', title: 'IJzervuist', role: 'Koning van de barbaren', foe: 2 },
  { age: 3, n: 'Roderik', title: 'de Zwarte Ridder', role: 'Heer van de roofridders', foe: 3 },
  { age: 4, n: 'Kaptein Roodbaard', title: 'de Schrik der Zeeën', role: 'Leider van de kapers', foe: 4 },
  { age: 5, n: 'Kolonel Kruyt', title: 'de Ongenadige', role: 'Baas van de huurlingen', foe: 5 },
  { age: 6, n: 'Behemoth', title: 'de Stalen Muur', role: 'Het grootste pantser van het leger', foe: 6 },
  { age: 7, n: 'Argus', title: 'het Moederschip', role: 'Stuurt de vijandelijke zwerm aan', foe: 7 },
  { age: 8, n: 'Vex', title: 'de Sterrenvreter', role: 'Koning van de ruimtepiraten', foe: 8 },
];

/** De kampioen van een tijdperk, of null (de Steentijd, of een nummer dat niet bestaat). */
export const bossForAge = (age: number | undefined): BossDef | null =>
  BOSSES.find(b => b.age === age) || null;

/** Zijn hele naam: "Grimnar de Verscheurder". */
export const bossName = (boss: BossDef): string => `${boss.n} ${boss.title}`;

/** Een kampioen valt nooit aan voor deze dag: de eerste nachten zijn om te leren. */
export const BOSS_FIRST_DAY = 4;
/** Zoveel dagen na het nieuwe tijdperk komt hij op zijn vroegst: eerst een rustige nacht om je voor te bereiden. */
export const BOSS_GRACE_DAYS = 2;

/**
 * Welke dag telt als de dag van het nieuwe tijdperk. Na 21 uur (en voor 6 uur, als de dag nog niet verder telt)
 * is de aanval van die dag al begonnen: die nacht was dan geen rustnacht, dus telt de volgende dag.
 */
export const bossStartDay = (day: number, clock: number): number =>
  clock >= 21 || clock < 6 ? day + 1 : day;

/**
 * Komt de kampioen mee met de aanval van dag `raidDay`? Niet op de oefennacht, niet voor dag 4, en niet
 * vlak na het nieuwe tijdperk. Bij day 0 (een oude opslag of de testhulp) telt alleen de oefennacht.
 */
export function bossReady(pending: PendingBoss, raidDay: number, practice: boolean): boolean {
  if (practice) return false;
  if (pending.day <= 0) return true;
  return raidDay >= BOSS_FIRST_DAY && raidDay >= pending.day + BOSS_GRACE_DAYS;
}

/**
 * De kampioen die nog moet komen, netjes voor de opslag: { age, day } of null.
 * Opslag van daarvóór (of een tijdperk zonder kampioen) geeft null: dan komt er geen.
 * Opslag zonder dag krijgt dag 0: die kampioen is dan meteen klaar.
 */
export function cleanPendingBoss(o: unknown): PendingBoss | null {
  if (!o || typeof o !== 'object') return null;
  // o is nu een object, maar age en day kunnen nog van alles zijn: bossForAge vindt alleen iets bij een echt tijdperk
  const { age, day } = o as Partial<PendingBoss>;
  if (!bossForAge(age)) return null;
  return { age: age!, day: typeof day === 'number' && Number.isFinite(day) ? day : 0 };
}
