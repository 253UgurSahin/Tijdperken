// Karren en dragers: welk voertuig per tijdperk, hoe snel, hoeveel ze meenemen, en waar ze op de weg rijden. Puur.
import type { Tile } from '../types';

/** Het voertuig van een tijdperk: drager met mand, ossenkar, paard en wagen, vrachtwagen of drone. */
export type CartKind = 'porter' | 'oxcart' | 'wagon' | 'truck' | 'drone';

/** Welk voertuig er rijdt in dit tijdperk (0 = Steentijd ... 8 = Sterrentijdperk). */
export function cartKindFor(age: number): CartKind {
  if (age <= 1) return 'porter';
  if (age <= 3) return 'oxcart';
  if (age === 4) return 'wagon';
  if (age <= 6) return 'truck';
  return 'drone';
}

/** Tegels per spelseconde, vóór de bonus van de weg zelf (klinkers en asfalt rijden sneller). */
export const CART_SPEED: Record<CartKind, number> = {
  porter: 1.6,
  oxcart: 1.4,
  wagon: 2.2,
  truck: 3.4,
  drone: 4.5,
};

/** Zo veel goederen neemt één rit mee. */
export const CART_LOAD: Record<CartKind, number> = {
  porter: 5,
  oxcart: 10,
  wagon: 15,
  truck: 25,
  drone: 20,
};

/** Hooguit zo veel karren tegelijk per beeldkwaliteit (Laag, Middel, Hoog). */
export const CART_CAP: Record<'low' | 'mid' | 'high', number> = { low: 40, mid: 120, high: 300 };

/** Zo veel seconden zitten er minstens tussen twee ritten van hetzelfde gebouw (tenzij een kar vol is). */
export const TRIP_MIN_GAP = 6;

/** Zo ver rijdt een kar rechts van het midden van de weg (in tegels): tegenliggers rijden zo langs elkaar. */
export const LANE_OFFSET = 0.18;

/** Hoe lang een route is in tegels (schuine stappen tellen als 1,41). */
export function routeLength(route: Tile[]): number {
  let len = 0;
  for (let i = 1; i < route.length; i++)
    len += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
  return len;
}

/**
 * Waar een kar staat na d tegels over de route (van tegelmidden naar tegelmidden). side schuift hem dwars op de
 * rijrichting opzij: positief is rechts. a is de richting voor het draaien van het model (zoals in sync.ts:
 * atan2 van de stap in x en de stap in y).
 */
export function pointOnRoute(route: Tile[], d: number, side: number): { x: number; y: number; a: number } {
  if (!route.length) return { x: 0, y: 0, a: 0 };
  if (route.length === 1) return { x: route[0][0] + 0.5, y: route[0][1] + 0.5, a: 0 };
  let left = Math.max(0, d);
  for (let i = 1; i < route.length; i++) {
    const dx = route[i][0] - route[i - 1][0],
      dy = route[i][1] - route[i - 1][1],
      step = Math.hypot(dx, dy);
    // Op het laatste stuk blijft hij staan aan het eind (d groter dan de route)
    if (left <= step || i === route.length - 1) {
      const t = step > 0 ? Math.min(1, left / step) : 0,
        nx = step > 0 ? dx / step : 0,
        ny = step > 0 ? dy / step : 0;
      // Rechts van de rijrichting (x, y) is (-y, x): de kaart heeft y naar het zuiden, net als z in de 3D-wereld
      return {
        x: route[i - 1][0] + 0.5 + dx * t - ny * side,
        y: route[i - 1][1] + 0.5 + dy * t + nx * side,
        a: Math.atan2(dx, dy),
      };
    }
    left -= step;
  }
  // (hier komt hij niet: de lus geeft altijd iets terug op het laatste stuk)
  const last = route[route.length - 1];
  return { x: last[0] + 0.5, y: last[1] + 0.5, a: 0 };
}

/** Moet er nu een kar rijden? Als er een volle lading klaarstaat, of iets en de vorige rit lang genoeg geleden is. */
export function shouldSend(owed: number, load: number, sinceLast: number): boolean {
  return owed >= load || (owed > 0 && sinceLast >= TRIP_MIN_GAP);
}
