// Welvaart van huizen: van vervallen tot prachtig, door een weg, voorzieningen en sfeer. Puur.
import { SERVICE_BY_KEY } from './services';
import type { ServiceKey } from './services';

/** Eén trede van welvaart: sleutel, naam, zoveel keer de gewone plek voor inwoners, en een kleur. */
export interface HouseGrade {
  k: 'poor' | 'basic' | 'neat' | 'well' | 'rich';
  n: string;
  popMul: number;
  c: string;
}

/** Van vervallen (0) tot prachtig (4). Een huis met meer welvaart heeft plek voor meer mensen. */
export const HOUSE_GRADES: HouseGrade[] = [
  { k: 'poor', n: 'Vervallen', popMul: 0.8, c: '#8a8f99' },
  { k: 'basic', n: 'Eenvoudig', popMul: 1, c: '#cfc6b0' },
  { k: 'neat', n: 'Net', popMul: 1.1, c: '#9fe28a' },
  { k: 'well', n: 'Welvarend', popMul: 1.2, c: '#f2c94c' },
  { k: 'rich', n: 'Prachtig', popMul: 1.35, c: '#f08ab0' },
];

/** Zoveel seconden duurt het voor een huis een trede groeit, en zoveel voor het een trede vervalt. */
export const GROW_AFTER = 20,
  DECLINE_AFTER = 30;

/** Zoveel sfeer is nodig voor Welvarend, en zoveel voor Prachtig. */
export const CHARM_WELL = 3,
  CHARM_RICH = 6;

/** Wat een huis nu heeft: een weg, hoeveel van de voorzieningen van dit tijdperk, en zijn sfeer. */
export interface HomeState {
  /** Ligt het aan de weg naar het stamhuis? */
  linked: boolean;
  /** Hoeveel voorzieningen van dit tijdperk het bereiken. */
  covered: number;
  /** Hoeveel voorzieningen er in dit tijdperk meetellen (Steentijd 3, later 4 en 5). */
  unlocked: number;
  /** De sfeer rond het huis (zie data/charm.ts). */
  charm: number;
  /** Welke voorzieningen van dit tijdperk het huis mist, in de vaste volgorde (voor de uitleg). */
  missing: ServiceKey[];
}

/** De welvaart waar een huis naartoe groeit (of vervalt). */
export function targetGrade(s: HomeState): number {
  if (!s.linked) return 0;
  let grade = 1;
  if (s.covered >= s.unlocked && s.charm >= CHARM_RICH) grade = 4;
  else if (s.covered >= 3 && s.charm >= CHARM_WELL) grade = 3;
  else if (s.covered >= 2) grade = 2;
  // Fabrieken naast huizen houden ze eenvoudig, hoe goed de rest ook is
  return s.charm < 0 ? Math.min(1, grade) : grade;
}

/**
 * Eén stapje tijd voor de welvaart van een huis. Het klokje telt omhoog als het huis groeit en omlaag
 * (negatief) als het vervalt: zo begint het opnieuw zodra de richting omdraait. Hoogstens één trede per keer.
 */
export function stepGrade(
  grade: number,
  target: number,
  timer: number,
  dt: number,
): { grade: number; timer: number } {
  if (target > grade) {
    const t = Math.max(0, timer) + dt;
    return t >= GROW_AFTER ? { grade: grade + 1, timer: 0 } : { grade, timer: t };
  }
  if (target < grade) {
    const t = Math.min(0, timer) - dt;
    return t <= -DECLINE_AFTER ? { grade: grade - 1, timer: 0 } : { grade, timer: t };
  }
  return { grade, timer: 0 };
}

/** Hoeveel inwoners de welvaart erbij geeft (of afhaalt). Altijd minstens één, ook bij een kleine hut. */
export function gradePopBonus(basePop: number, grade: number): number {
  const g = HOUSE_GRADES[Math.max(0, Math.min(HOUSE_GRADES.length - 1, grade))];
  const change = g.popMul - 1;
  if (!change || !basePop) return 0;
  return Math.sign(change) * Math.max(1, Math.round(basePop * Math.abs(change)));
}

/** Goud per minuut van één huis: pas vanaf de Middeleeuwen, en alleen bij Welvarend en Prachtig. */
export function taxPerMinute(grade: number, age: number): number {
  if (age < 3 || grade < 3) return 0;
  return (grade >= 4 ? 1 : 0.5) * (1 + 0.1 * (age - 3));
}

/** Wat een huis nog mist voor de volgende trede, in gewone woorden ('een weg', 'water', 'sfeer 3'). */
export function nextNeeds(s: HomeState, grade: number): string[] {
  const next = grade + 1;
  if (next > 4) return [];
  if (!s.linked) return ['een weg'];
  // Eenvoudig is er voor elk huis aan de weg
  if (next <= 1) return [];
  const out: string[] = [];
  const name = (k: ServiceKey) => SERVICE_BY_KEY[k].n.toLowerCase();
  // Hoeveel voorzieningen er minstens nodig zijn, en hoeveel sfeer
  const needCovered = next === 2 ? 2 : next === 3 ? 3 : s.unlocked;
  const needCharm = next === 2 ? 0 : next === 3 ? CHARM_WELL : CHARM_RICH;
  const short = Math.max(0, needCovered - s.covered);
  for (const k of s.missing.slice(0, short)) out.push(name(k));
  // Een fabriek vlak naast het huis (sfeer onder nul) houdt het eenvoudig
  if (s.charm < 0) out.push('rust (geen fabriek ernaast)');
  else if (s.charm < needCharm) out.push(`sfeer ${needCharm}`);
  return out;
}

/** Een lijstje als gewone zin: 'water', 'water en sfeer 3', 'water, geloof en sfeer 6'. */
export function joinNeeds(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return parts.slice(0, -1).join(', ') + ' en ' + parts[parts.length - 1];
}
