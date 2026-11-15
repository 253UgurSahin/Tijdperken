// Laat huizen langzaam groeien of vervallen, en int een beetje belasting bij welvarende huizen.
import type { Building } from '../types';
import { B } from '../data/buildings';
import {
  HOUSE_GRADES,
  joinNeeds,
  loadedGrade,
  nextNeeds,
  stepGrade,
  targetGrade,
  taxPerMinute,
} from '../data/houses';
import type { HomeState, HouseGrade } from '../data/houses';
import { SERVICE_BIT, SERVICE_BY_KEY, servicesUnlocked } from '../data/services';
import type { ServiceKey } from '../data/services';
import { markTip, tipSeen } from '../core/tips';
import { toast } from '../ui/hud';
import { charmOf } from './charm';
import { isHome, serviceMask } from './coverage';
import { floater } from './fx';
import { roadLinked } from './roads';
import { G } from './state';

// De voorzieningen van dit tijdperk, maar één keer per tijdperk uitgerekend (dit gebeurt elke halve seconde)
let unlockedAge = -1,
  unlockedKeys: ServiceKey[] = [];
function unlockedNow(): ServiceKey[] {
  if (unlockedAge !== G.age) {
    unlockedAge = G.age;
    unlockedKeys = servicesUnlocked(G.age);
  }
  return unlockedKeys;
}

/** Belasting aan of uit (alleen voor tests: zo meet je hoeveel goud de huizen opleveren). */
let taxOn = true;
export function setTaxOn(on: boolean): void {
  taxOn = on;
}

/** Wat een huis nu heeft: weg, voorzieningen van dit tijdperk en sfeer. */
export function homeState(b: Building): HomeState {
  const mask = serviceMask(b),
    keys = unlockedNow(),
    missing: ServiceKey[] = [];
  for (const k of keys) if (!(mask & SERVICE_BIT[k])) missing.push(k);
  return {
    linked: roadLinked(b),
    covered: keys.length - missing.length,
    unlocked: keys.length,
    charm: charmOf(b),
    missing,
  };
}

/** De welvaart van een huis (Eenvoudig als die nog niet bekend is); 1 voor alles wat geen huis is. */
export function gradeOf(b: Building): number {
  if (!B[b.type].pop || b.type === 'townhall') return 1;
  return typeof b.grade === 'number' && b.grade >= 0 ? b.grade : 1;
}

// Een vast klein voorsprongetje per huis (0 tot 4 s): als een nieuwe markt veertig huizen raakt, groeien ze
// niet allemaal in dezelfde tel (en wordt niet elk model in één beeldje opnieuw gebouwd)
const headStart = (b: Building): number => ((b.id * 0.6180339) % 1) * 4;

/** Bijwerken; gebeurt elke halve seconde in speltijd (zie game/update.ts), dus ook bij hogere snelheid. */
export function updateGrades(dt: number): void {
  for (const b of G.bs) {
    if (!isHome(b)) continue;
    const s = homeState(b),
      target = targetGrade(s);
    // Nieuw huis: hoogstens Eenvoudig. Uit een oude opslag: meteen goed, zonder iets te laten zien.
    if (b.grade === undefined) {
      b.grade = Math.min(target, 1);
      b.gradeT = 0;
      continue;
    }
    if (b.grade < 0) {
      b.grade = loadedGrade(target, s.charm);
      b.gradeT = 0;
      continue;
    }
    let timer = b.gradeT || 0;
    if (timer === 0 && target !== b.grade) timer = target > b.grade ? headStart(b) : -headStart(b);
    const step = stepGrade(b.grade, target, timer, dt);
    b.gradeT = step.timer;
    if (step.grade !== b.grade) {
      const up = step.grade > b.grade;
      b.grade = step.grade;
      gradeChanged(b, up, s, target);
    }
  }
  if (taxOn) {
    const perMinute = taxNow();
    if (perMinute > 0) G.res.gold += (perMinute / 60) * dt;
  }
}

/**
 * Na het laden: huizen uit een oude opslag (trede -1) meteen hun trede geven, vóór er iets getekend wordt.
 * Anders bouwt render/sync.ts ze eerst als Eenvoudig en een halve seconde later opnieuw.
 */
export function settleLoadedGrades(): void {
  for (const b of G.bs) {
    if (!isHome(b) || b.grade === undefined || b.grade >= 0) continue;
    const s = homeState(b);
    b.grade = loadedGrade(targetGrade(s), s.charm);
    b.gradeT = 0;
  }
}

// Een huis is een trede gegroeid of vervallen: het veert op (zie render/sync.ts) en er komt even een tekstje boven
function gradeChanged(b: Building, up: boolean, s: HomeState, target: number): void {
  const grade = HOUSE_GRADES[b.grade!],
    half = B[b.type].size / 2,
    name = B[b.type].n.toLowerCase();
  b.pop_t = G.t;
  floater(b.x + half, b.y + half, `${up ? '↑' : '↓'} ${grade.n}`, up ? grade.c : '#8a8f99');
  if (up && !tipSeen('grow')) {
    markTip('grow');
    const have = unlockedNow()
      .filter(k => !s.missing.includes(k))
      .map(k => SERVICE_BY_KEY[k].n.toLowerCase());
    toast(
      `Je ${name} groeit: hij ligt aan de weg en heeft ${joinNeeds(have) || 'wat hij nodig heeft'}. Met meer voorzieningen en sfeer wordt hij nog mooier (en voller).`,
      'good',
    );
  } else if (!up && !tipSeen('decline')) {
    markTip('decline');
    const why = nextNeeds(s, target);
    toast(
      `Een ${name} vervalt${why.length ? `: hij mist ${joinNeeds(why)}` : ''}. Een vervallen huis heeft minder plek voor inwoners.`,
    );
  }
}

/** Hoeveel huizen er per trede zijn (voor de balk in het paneel Dorp). */
export function gradeSummary(): Record<HouseGrade['k'], number> {
  const out = { poor: 0, basic: 0, neat: 0, well: 0, rich: 0 };
  for (const b of G.bs) if (isHome(b)) out[HOUSE_GRADES[gradeOf(b)].k]++;
  return out;
}

/** Goud per minuut van alle huizen samen. */
export function taxNow(): number {
  if (G.age < 3) return 0;
  let sum = 0;
  for (const b of G.bs) if (isHome(b)) sum += taxPerMinute(gradeOf(b), G.age);
  return sum;
}

/**
 * De voorziening die de meeste huizen missen (die nog niet prachtig zijn), met hoeveel huizen dat zijn en
 * hoeveel huizen je in totaal hebt. Leeg als geen enkel huis iets mist.
 */
export function commonMissing(): { k: ServiceKey; homes: number; total: number } | null {
  const count = new Map<ServiceKey, number>();
  let total = 0;
  for (const b of G.bs) {
    if (!isHome(b)) continue;
    total++;
    if (gradeOf(b) >= 4) continue;
    for (const k of homeState(b).missing) count.set(k, (count.get(k) || 0) + 1);
  }
  let best: ServiceKey | null = null,
    homes = 0;
  for (const [k, n] of count) if (n > homes) [best, homes] = [k, n];
  return best ? { k: best, homes, total } : null;
}

/** Hoeveel huizen niet aan de weg liggen. */
export const unlinkedHomes = (): number => G.bs.filter(b => isHome(b) && !roadLinked(b)).length;
