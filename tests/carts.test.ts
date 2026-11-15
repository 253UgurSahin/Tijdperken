// Tests voor de karren: welk voertuig per tijdperk, en waar een kar op de weg rijdt (src/data/carts.ts).
import { describe, expect, it } from 'vitest';
import type { Tile } from '../src/types';
import {
  CART_CAP,
  CART_LOAD,
  CART_SPEED,
  TRIP_MIN_GAP,
  cartKindFor,
  pointOnRoute,
  routeLength,
  shouldSend,
} from '../src/data/carts';

describe('voertuig per tijdperk', () => {
  it('dragers, ossenkar, wagen, vrachtwagen en drone', () => {
    const kinds = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(cartKindFor);
    expect(kinds).toEqual([
      'porter',
      'porter',
      'oxcart',
      'oxcart',
      'wagon',
      'truck',
      'truck',
      'drone',
      'drone',
    ]);
  });
  it('elk voertuig heeft een snelheid en een lading', () => {
    for (const k of ['porter', 'oxcart', 'wagon', 'truck', 'drone'] as const) {
      expect(CART_SPEED[k]).toBeGreaterThan(0);
      expect(CART_LOAD[k]).toBeGreaterThan(0);
    }
  });
  it('meer karren bij een hogere beeldkwaliteit', () => {
    expect(CART_CAP.low).toBeLessThan(CART_CAP.mid);
    expect(CART_CAP.mid).toBeLessThan(CART_CAP.high);
  });
});

describe('route over de weg', () => {
  // Een L: drie tegels naar rechts, dan twee naar beneden
  const L: Tile[] = [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [3, 1],
    [3, 2],
  ];
  it('de lengte van een L is de som van de stukken; schuin telt als wortel 2', () => {
    expect(routeLength(L)).toBeCloseTo(5);
    expect(
      routeLength([
        [0, 0],
        [1, 1],
      ]),
    ).toBeCloseTo(Math.SQRT2);
    expect(routeLength([[4, 4]])).toBe(0);
  });
  it('begin en eind zijn het midden van de eerste en laatste tegel', () => {
    const a = pointOnRoute(L, 0, 0),
      z = pointOnRoute(L, routeLength(L), 0);
    expect([a.x, a.y]).toEqual([0.5, 0.5]);
    expect([z.x, z.y]).toEqual([3.5, 2.5]);
    // Verder dan het eind of vóór het begin: blijft aan het eind of het begin staan
    const past = pointOnRoute(L, 99, 0),
      before = pointOnRoute(L, -3, 0);
    expect([past.x, past.y]).toEqual([3.5, 2.5]);
    expect([before.x, before.y]).toEqual([0.5, 0.5]);
  });
  it('halverwege een stuk: de juiste plek en richting', () => {
    const p = pointOnRoute(L, 1.5, 0);
    expect(p.x).toBeCloseTo(2);
    expect(p.y).toBeCloseTo(0.5);
    // Naar rechts (+x) rijden: atan2(1, 0) = 90 graden, zoals sync.ts de figuren draait
    expect(p.a).toBeCloseTo(Math.PI / 2);
    const q = pointOnRoute(L, 4, 0);
    expect(q.x).toBeCloseTo(3.5);
    expect(q.y).toBeCloseTo(1.5);
    expect(q.a).toBeCloseTo(0); // naar beneden (+y)
  });
  it('opzij schuiven gaat dwars op de rijrichting, naar rechts', () => {
    const side = 0.18;
    // Naar rechts (oost) rijden: rechts is het zuiden (+y)
    const east = pointOnRoute(L, 1.5, side),
      mid = pointOnRoute(L, 1.5, 0);
    expect(east.x).toBeCloseTo(mid.x);
    expect(east.y - mid.y).toBeCloseTo(side);
    // Naar beneden (zuid) rijden: rechts is het westen (-x)
    const south = pointOnRoute(L, 4, side),
      mid2 = pointOnRoute(L, 4, 0);
    expect(south.y).toBeCloseTo(mid2.y);
    expect(south.x - mid2.x).toBeCloseTo(-side);
    // Tegenliggers op dezelfde plek rijden aan de andere kant
    const back = pointOnRoute([...L].reverse(), routeLength(L) - 1.5, side);
    expect(back.y - mid.y).toBeCloseTo(-side);
  });
});

describe('wanneer een kar vertrekt', () => {
  it('een volle lading gaat meteen', () => {
    expect(shouldSend(5, 5, 0)).toBe(true);
    expect(shouldSend(8, 5, 1)).toBe(true);
  });
  it('een halve lading wacht tot de vorige rit lang genoeg geleden is', () => {
    expect(shouldSend(2, 5, TRIP_MIN_GAP - 0.1)).toBe(false);
    expect(shouldSend(2, 5, TRIP_MIN_GAP)).toBe(true);
  });
  it('niets klaar: geen kar', () => {
    expect(shouldSend(0, 5, 100)).toBe(false);
  });
});
