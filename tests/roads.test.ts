// Tests voor het rekenwerk van het wegennet (src/data/roads.ts).
import { describe, expect, it } from 'vitest';
import { B } from '../src/data/buildings';
import {
  OFFROAD_RATE,
  floodRoads,
  linkPath,
  needsRoad,
  ringTiles,
  roadPathBetween,
  roadRateFor,
} from '../src/data/roads';

const W = 10,
  H = 10;
const at = (x: number, y: number) => y * W + x;
/** Een lege kaart met wegtegels op de gegeven plekken. */
function roads(tiles: [number, number][]): Uint8Array {
  const r = new Uint8Array(W * H);
  for (const [x, y] of tiles) r[at(x, y)] = 1;
  return r;
}

describe('welke gebouwen een weg nodig hebben', () => {
  it('woningen, akkers, opslag, fabrieken, markt, kazerne, pomp en centrale wel', () => {
    for (const k of [
      'hut',
      'house',
      'farm',
      'storage',
      'quarry',
      'foundry',
      'market',
      'barracks',
      'oilpump',
      'powerplant',
    ])
      expect(needsRoad(B[k]), k).toBe(true);
  });
  it('stamhuis, wegen, muren, versiering, lampen, losse torens en wonderen niet', () => {
    for (const k of [
      'townhall',
      'road',
      'palisade',
      'gate',
      'campfire',
      'lantern',
      'flowerbed',
      'well',
      'watchtower',
      'command',
      'dolmen',
      'stargate',
    ])
      expect(needsRoad(B[k]), k).toBe(false);
  });
});

describe('rekenwerk voor wegen', () => {
  it('de ring rond een gebouw: 8 tegels bij 1, 12 bij 2, minder aan de rand', () => {
    expect(ringTiles(4, 4, 1, W, H)).toHaveLength(8);
    expect(ringTiles(4, 4, 2, W, H)).toHaveLength(12);
    expect(ringTiles(0, 0, 1, W, H)).toHaveLength(3);
    expect(ringTiles(4, 4, 1, W, H)).not.toContain(at(4, 4));
  });
  it('het net loopt ook schuin door, en stopt bij een gat', () => {
    const r = roads([
      [1, 1],
      [2, 2],
      [3, 3],
      [5, 3],
    ]);
    const mark = new Int32Array(W * H);
    expect(floodRoads(r, W, H, [at(1, 1)], mark, 1)).toBe(3);
    expect(mark[at(3, 3)]).toBe(1);
    expect(mark[at(5, 3)]).toBe(0);
    // een begintegel zonder weg telt niet
    expect(floodRoads(r, W, H, [at(0, 0)], mark, 2)).toBe(0);
  });
  it('vindt de kortste route over de weg', () => {
    const tiles: [number, number][] = [];
    for (let x = 0; x < 8; x++) tiles.push([x, 0]);
    for (let y = 0; y < 4; y++) tiles.push([0, y], [7, y]);
    for (let x = 0; x < 8; x++) tiles.push([x, 3]);
    const r = roads(tiles);
    const path = roadPathBetween(r, W, H, [at(0, 1)], [at(7, 1)])!;
    expect(path[0]).toBe(at(0, 1));
    expect(path[path.length - 1]).toBe(at(7, 1));
    expect(path).toHaveLength(8); // schuin naar de rij boven, recht door, en schuin weer omlaag
    expect(roadPathBetween(r, W, H, [at(0, 1)], [at(9, 9)])).toBeNull();
  });
  it('legt nieuw pad over bestaande weg heen (gratis), om blokkades heen, en niet te lang', () => {
    const r = roads([
      [3, 5],
      [4, 5],
      [5, 5],
    ]);
    const blocked = new Set([at(2, 4), at(2, 5), at(2, 6)]);
    const cost = (i: number): -1 | 0 | 1 => (blocked.has(i) ? -1 : r[i] ? 0 : 1);
    const target = (i: number) => i === at(8, 5);
    // van (3,5) over de weg tot (5,5), dan drie nieuwe tegels naar het doel
    const path = linkPath(W, H, [at(3, 5)], cost, target, 10)!;
    expect(path).toEqual([at(6, 5), at(7, 5), at(8, 5)]);
    expect(linkPath(W, H, [at(3, 5)], cost, target, 2)).toBeNull();
    // vanaf (1,5) moet het om de muur heen: dat kost meer tegels dan recht
    const around = linkPath(W, H, [at(1, 5)], cost, i => i === at(3, 5), 10)!;
    expect(around.length).toBeGreaterThan(1);
    expect(around.some(i => blocked.has(i))).toBe(false);
  });
  it('geeft niets nieuws als het gebouw de weg al raakt', () => {
    const r = roads([[4, 4]]);
    const cost = (i: number): -1 | 0 | 1 => (r[i] ? 0 : 1);
    expect(linkPath(W, H, [at(4, 4), at(5, 4)], cost, i => i === at(4, 4), 5)).toEqual([]);
  });
  it('zonder weg werkt het op een derde, betere wegen helpen', () => {
    expect(roadRateFor(0)).toBe(OFFROAD_RATE);
    expect(roadRateFor(0)).toBe(0.35);
    expect(roadRateFor(1)).toBe(1);
    expect(roadRateFor(2)).toBeCloseTo(1.1);
    expect(roadRateFor(3)).toBeCloseTo(1.2);
  });
});
