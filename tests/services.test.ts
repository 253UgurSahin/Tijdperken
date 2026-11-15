// Toetst de voorzieningen: welke gebouwen wat geven, en het rekenwerk met de cirkels.
import { describe, expect, it } from 'vitest';
import { B } from '../src/data/buildings';
import { canMake } from '../src/data/succession';
import {
  SERVICES,
  SERVICE_BIT,
  diffSources,
  inDisc,
  isServiceKey,
  maskAt,
  servicesOf,
  servicesUnlocked,
  sourceKey,
  stampDisc,
} from '../src/data/services';
import type { ServiceSource } from '../src/data/services';

describe('voorzieningen', () => {
  it('elke voorziening heeft een eigen sleutel en een eigen bit', () => {
    const keys = SERVICES.map(s => s.k);
    expect(new Set(keys).size).toBe(keys.length);
    const bits = keys.map(k => SERVICE_BIT[k]);
    expect(new Set(bits).size).toBe(bits.length);
    for (const bit of bits) expect(bit > 0 && (bit & (bit - 1)) === 0).toBe(true);
  });

  it('elk gebouw met serve noemt een bestaande voorziening', () => {
    for (const [k, d] of Object.entries(B)) if (d.serve) expect(isServiceKey(d.serve.k), k).toBe(true);
  });

  it('elke voorziening kun je bouwen in het tijdperk waarin hij meetelt', () => {
    for (const s of SERVICES) {
      const makers = Object.keys(B).filter(
        k => servicesOf(B[k]).some(x => x.k === s.k) && !B[k].nobuild && canMake(k, s.age),
      );
      expect(makers.length, s.n).toBeGreaterThan(0);
    }
  });

  it('een toren geeft veiligheid met zijn gewone bereik, een muur niet', () => {
    const tower = servicesOf(B.watchtower);
    expect(tower).toContainEqual({ k: 'safety', r: B.watchtower.def!.r });
    expect(servicesOf(B.palisade)).toEqual([]);
    // Het stamhuis geeft voedsel en veiligheid
    expect(servicesOf(B.townhall).map(s => s.k)).toEqual(['food', 'safety']);
  });

  it('de voorzieningen komen er per tijdperk bij', () => {
    expect(servicesUnlocked(0)).toEqual(['food', 'safety', 'faith']);
    expect(servicesUnlocked(1)).toEqual(['food', 'safety', 'faith', 'water']);
    expect(servicesUnlocked(2)).toEqual(['food', 'safety', 'faith', 'water']);
    expect(servicesUnlocked(3)).toEqual(['food', 'safety', 'faith', 'water', 'market']);
  });

  it('een cirkel kijkt naar het midden van de tegel', () => {
    expect(inDisc(5, 5, 2, 4, 4)).toBe(true);
    expect(inDisc(5, 5, 2, 7, 5)).toBe(false);
  });

  it('een cirkel erbij en weer eraf laat alles leeg, twee cirkels tellen dubbel waar ze overlappen', () => {
    const W = 20,
      H = 20,
      grid = new Uint8Array(W * H);
    stampDisc(grid, W, H, 10, 10, 4, 1);
    stampDisc(grid, W, H, 10, 10, 4, -1);
    expect(grid.every(v => v === 0)).toBe(true);
    stampDisc(grid, W, H, 8, 10, 4, 1);
    stampDisc(grid, W, H, 12, 10, 4, 1);
    expect(grid[10 * W + 10]).toBe(2);
    expect(grid[10 * W + 5]).toBe(1);
    expect(grid[10 * W + 15]).toBe(1);
    expect(grid[0]).toBe(0);
    // Een cirkel aan de rand van de kaart geeft geen fout
    stampDisc(grid, W, H, 0, 0, 5, 1);
    expect(grid[0]).toBe(1);
  });

  it('een huis van 2 bij 2 telt als bereikt als één van zijn tegels in een cirkel ligt', () => {
    const W = 10,
      food = new Uint8Array(W * W),
      water = new Uint8Array(W * W);
    food[3 * W + 4] = 1; // rechtsonder in het huis op (3, 2)
    water[0] = 1; // ver weg
    expect(maskAt([food, water], W, 3, 2, 2)).toBe(1);
    expect(maskAt([food, water], W, 0, 0, 1)).toBe(2);
    expect(maskAt([food, water], W, 6, 6, 2)).toBe(0);
  });

  it('een verplaatste cirkel is één weg en één nieuw', () => {
    const a: ServiceSource = { id: 1, k: 'water', cx: 5.5, cy: 5.5, r: 6 },
      moved: ServiceSource = { ...a, cx: 6, cy: 6 },
      b: ServiceSource = { id: 2, k: 'food', cx: 9.5, cy: 9.5, r: 7 };
    const prev = new Map([a, b].map(s => [sourceKey(s), s]));
    const next = new Map([moved, b].map(s => [sourceKey(s), s]));
    const { added, removed } = diffSources(prev, next);
    expect(removed).toEqual([a]);
    expect(added).toEqual([moved]);
    expect(diffSources(next, next)).toEqual({ added: [], removed: [] });
  });

  it('de tempel staat bij de versiering, vanaf de Bronstijd', () => {
    expect(B.temple.cat).toBe('deco');
    expect(B.temple.age).toBe(1);
    expect(servicesOf(B.temple)).toEqual([{ k: 'faith', r: 9 }]);
  });
});
