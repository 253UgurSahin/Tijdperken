import type { Cost } from '../types';
// Hulpjes om getallen, kosten en pictogrammen als HTML te tonen.
import { AGES } from '../data/ages';
import { RES } from '../data/resources';
import { G } from '../game/state';
import { fmt, fmtShort, gem } from './textformat';

// De pure tekst-hulpjes staan in textformat.ts; hier opnieuw uitgevoerd zodat bestaande imports blijven werken.
export { fmt, fmtDec, fmtShort, gem, hy, SHAPE } from './textformat';

export const TOUCH = matchMedia('(pointer:coarse)').matches;
/** Een tijdperk met het goede lidwoord, voor midden in een zin: "de bronstijd", maar "het dronetijdperk". */
export const theAge = (i: number): string => {
  const name = AGES[i].n.toLowerCase();
  return (name.endsWith('tijdperk') ? 'het ' : 'de ') + name;
};
// Kosten als rijtje fiches. Met "tight" worden de getallen kort, zodat ze op een tegel passen.
export function costHTML(c: Cost, tight = false): string {
  return (
    `<span class="cost${tight ? ' tight' : ''}">` +
    Object.keys(c)
      .map(k => {
        const short = G && G.res[k] < c[k] ? 'no' : '';
        const label = `${RES[k].n}: ${c[k]}${short ? ' (te weinig)' : ''}`;
        return `<span class="${short}" title="${label}">${gem(k)}${tight ? fmtShort(c[k]) : fmt(c[k])}</span>`;
      })
      .join('') +
    '</span>'
  );
}
export const esc = (s: string | number): string =>
  String(s).replace(
    /[&<>"]/g,
    c => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }) as Record<string, string>)[c],
  );

// De tijdlijn: één kraal per tijdperk. Voorbij = gevuld, nu = groot, nog te komen = open.
export function ageTimeline(cur: number, big = false): string {
  const beads = AGES.map((a, i) => {
    const state = i < cur ? 'done' : i === cur ? 'now' : 'next';
    return `<li class="${state}" style="--c:${a.acc}" title="${a.n} · ${a.y}"><span>${big ? a.r : ''}</span></li>`;
  });
  return `<ol class="tl${big ? ' big' : ''}" aria-label="Tijdlijn van de tijdperken">${beads.join('')}</ol>`;
}

/** Eén regel van een vergelijking: [naam, nu, straks]. */
export type CompareRow = (string | number)[];

/*
 * Vergelijking "nu → straks" voor een verbetering, als tabelletje.
 * rows = [[naam, nu, straks], ...] (zie upgradeRows in game/upgrades.ts).
 */
export function compareHTML(rows: CompareRow[]): string {
  return (
    '<table class="cmp"><tbody>' +
    rows
      .map(
        ([n, a, b]) =>
          `<tr><th>${n}</th><td>${a}</td><td class="arr" aria-label="wordt">→</td><td class="nx">${b}</td></tr>`,
      )
      .join('') +
    '</tbody></table>'
  );
}
/** Dezelfde vergelijking als korte tekst, voor in een tooltip. */
export const compareText = (rows: CompareRow[]): string =>
  rows.map(([n, a, b]) => `${n}: ${a} → ${b}`).join(' · ');
