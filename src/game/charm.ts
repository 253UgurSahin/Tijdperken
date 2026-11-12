// Houdt bij hoe gezellig elk huis is en welke akkers hulp krijgen van een waterput of molen (zie data/charm.ts).
import type { Building } from '../types';
import { B } from '../data/buildings';
import { charmFrom, charmOfHome, charmTier, farmBoostOf } from '../data/charm';
import type { CharmTier } from '../data/charm';
import { G } from './state';
import { markTip, tipSeen } from '../core/tips';
import { toast } from '../ui/hud';
import { floater } from './fx';

// Per gebouwnummer: de sfeer van een huis, en hoeveel sneller een akker oogst
const homeCharm = new Map<number, number>();
const farmBoost = new Map<number, number>();

/** Een afgebouwd gebouw dat sfeer geeft of neemt, of akkers helpt. */
const affects = (b: Building): boolean => b.done && (!!B[b.type].charm || !!B[b.type].aura);

/** Opnieuw uitrekenen; gebeurt een paar keer per seconde (zie computeCaches in game/caches.ts). */
export function updateCharm(): void {
  homeCharm.clear();
  farmBoost.clear();
  const sources = G.bs.filter(affects);
  for (const b of G.bs) {
    if (!b.done) continue;
    const d = B[b.type];
    if (d.pop) homeCharm.set(b.id, charmOfHome(B, b, sources));
    else if (d.work) farmBoost.set(b.id, farmBoostOf(B, b, sources));
  }
}

/** De sfeer van een huis (0 voor alles wat geen huis is, of nog niet berekend). */
export const charmOf = (b: Building): number => homeCharm.get(b.id) || 0;
/** De trede van een huis: Somber, Gewoon, Gezellig of Prachtig. */
export const tierOf = (b: Building): CharmTier => charmTier(charmOf(b));
/** Zoveel keer sneller oogst deze akker door hulp uit de buurt (1 = gewoon). */
export const farmBoostFor = (b: Building): number => farmBoost.get(b.id) || 1;

/** Hoeveel huizen er per trede zijn (voor het overzicht bij het stamhuis). */
export function charmSummary(): Record<CharmTier['k'], number> {
  const out = { grim: 0, plain: 0, cosy: 0, lovely: 0 };
  for (const b of G.bs) if (homeCharm.has(b.id)) out[tierOf(b).k]++;
  return out;
}

/**
 * Eén keer uitleggen hoe sfeer werkt: als je vierde huis klaar is en je nog geen versiering hebt. Daarna niet
 * meer (de uitleg staat ook bij elk huis in het infopaneel).
 */
export function charmTip(done: Building): void {
  if (tipSeen('charm') || !B[done.type].pop || done.type === 'townhall') return;
  const homes = G.bs.filter(b => b.done && B[b.type].pop && b.type !== 'townhall').length;
  if (homes < 4 || G.bs.some(b => B[b.type].cat === 'deco')) return;
  markTip('charm');
  toast(
    'Tip: zet een bloemperk of totempaal tussen je huizen (tabblad Sfeer, toets G). Gezellige huizen hebben plek voor meer mensen; fabrieken maken ze juist somber.',
    'good',
  );
}

/**
 * Versiering (of een fabriek) is net klaar: boven elk huis dat het merkt verschijnt even "+2 sfeer" (roze) of
 * "−3 sfeer" (grijs), zodat je meteen ziet wat het oplevert.
 */
export function showCharmEffect(src: Building): void {
  const d = B[src.type];
  if (!d.charm) return;
  for (const h of G.bs) {
    if (!h.done || !B[h.type].pop) continue;
    const v = charmFrom(B, src, h);
    if (!v) continue;
    const s = B[h.type].size / 2;
    floater(h.x + s, h.y + s, `${v > 0 ? '+' : '−'}${Math.abs(v)} sfeer`, v > 0 ? '#e0709a' : '#8a8f99');
  }
}
