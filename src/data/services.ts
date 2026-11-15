// Voorzieningen: wat een gebouw de huizen in zijn cirkel geeft (voedsel, veiligheid, geloof, water, markt). Puur.
import type { BuildingDef } from '../types';

/** De vijf voorzieningen. */
export type ServiceKey = 'food' | 'safety' | 'faith' | 'water' | 'market';

/** Eén voorziening: naam, pictogram (zie ui/glyphs.ts), kleur, vanaf welk tijdperk, en wat je ervoor bouwt. */
export interface ServiceDef {
  k: ServiceKey;
  n: string;
  g: string;
  c: string;
  age: number;
  need: string;
}

/** Alle voorzieningen. De volgorde is ook de volgorde van de bits in een masker (zie SERVICE_BIT). */
export const SERVICES: ServiceDef[] = [
  { k: 'food', n: 'Voedsel', g: '⛁', c: '#d9a640', age: 0, need: 'een opslagplaats of het stamhuis' },
  { k: 'safety', n: 'Veiligheid', g: '⛨', c: '#6fa8ff', age: 0, need: 'een toren of het stamhuis' },
  { k: 'faith', n: 'Geloof', g: '★', c: '#c79bff', age: 0, need: 'een totempaal of tempel' },
  { k: 'water', n: 'Water', g: '≈', c: '#4fc3f7', age: 1, need: 'een waterput of fontein' },
  { k: 'market', n: 'Markt', g: '⚖', c: '#e2b92c', age: 3, need: 'een markt' },
];

/** Het bit van elke voorziening in een masker: voedsel 1, veiligheid 2, geloof 4, water 8, markt 16. */
export const SERVICE_BIT = Object.fromEntries(SERVICES.map((s, i) => [s.k, 1 << i])) as Record<
  ServiceKey,
  number
>;

/** Elke voorziening op sleutel, zodat je niet steeds in de lijst hoeft te zoeken (bijv. bij het tekenen). */
export const SERVICE_BY_KEY = Object.fromEntries(SERVICES.map(s => [s.k, s])) as Record<
  ServiceKey,
  ServiceDef
>;

/** Is dit de sleutel van een voorziening? */
export function isServiceKey(k: string): k is ServiceKey {
  return SERVICES.some(s => s.k === k);
}

/**
 * Welke voorzieningen een gebouw geeft, met het bereik in tegels. Elk gebouw met verdediging (behalve een muur)
 * geeft veiligheid. We nemen het gewone bereik uit de gegevens, niet het verbeterde: zo blijft de cirkel rustig.
 */
export function servicesOf(d: BuildingDef): { k: ServiceKey; r: number }[] {
  const out: { k: ServiceKey; r: number }[] = [];
  if (d.serve && isServiceKey(d.serve.k)) out.push({ k: d.serve.k, r: d.serve.r });
  if (d.def && !d.wall && !out.some(s => s.k === 'safety')) out.push({ k: 'safety', r: d.def.r });
  return out;
}

/** De voorzieningen die in dit tijdperk al meetellen. */
export function servicesUnlocked(age: number): ServiceKey[] {
  return SERVICES.filter(s => s.age <= age).map(s => s.k);
}

/** Ligt het midden van tegel (tx, ty) binnen r tegels van punt (cx, cy)? */
export function inDisc(cx: number, cy: number, r: number, tx: number, ty: number): boolean {
  const dx = tx + 0.5 - cx,
    dy = ty + 0.5 - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Tel 1 op (of trek 1 af) bij elke tegel in de cirkel. We lopen alleen over het vierkant om de cirkel heen,
 * en de tellers blijven tussen 0 en 255.
 */
export function stampDisc(
  grid: Uint8Array,
  W: number,
  H: number,
  cx: number,
  cy: number,
  r: number,
  delta: 1 | -1,
): void {
  const x0 = Math.max(0, Math.floor(cx - r)),
    x1 = Math.min(W - 1, Math.ceil(cx + r)),
    y0 = Math.max(0, Math.floor(cy - r)),
    y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!inDisc(cx, cy, r, x, y)) continue;
      const i = y * W + x,
        v = grid[i] + delta;
      grid[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
}

/** Het masker van alle voorzieningen die een stukje (x, y, size bij size) raken: één tegel is genoeg. */
export function maskAt(grids: Uint8Array[], W: number, x: number, y: number, size: number): number {
  let mask = 0;
  for (let k = 0; k < grids.length; k++) {
    const grid = grids[k];
    let hit = false;
    for (let dy = 0; dy < size && !hit; dy++)
      for (let dx = 0; dx < size && !hit; dx++) {
        const i = (y + dy) * W + x + dx;
        if (i >= 0 && i < grid.length && grid[i] > 0) hit = true;
      }
    if (hit) mask |= 1 << k;
  }
  return mask;
}

/** Eén cirkel van één gebouw: welk gebouw, welke voorziening, het midden en het bereik. */
export interface ServiceSource {
  id: number;
  k: ServiceKey;
  cx: number;
  cy: number;
  r: number;
}

/** Een sleutel die verandert zodra de cirkel ergens anders ligt of groter wordt (bijv. na vernieuwen). */
export function sourceKey(s: ServiceSource): string {
  return `${s.id}:${s.k}:${s.cx}:${s.cy}:${s.r}`;
}

/** Wat er tussen twee lijsten met cirkels veranderde: welke er weg zijn en welke er nieuw zijn. */
export function diffSources(
  prev: Map<string, ServiceSource>,
  next: Map<string, ServiceSource>,
): { added: ServiceSource[]; removed: ServiceSource[] } {
  const added: ServiceSource[] = [],
    removed: ServiceSource[] = [];
  for (const [key, s] of prev) if (!next.has(key)) removed.push(s);
  for (const [key, s] of next) if (!prev.has(key)) added.push(s);
  return { added, removed };
}
