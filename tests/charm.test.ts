import { describe, expect, it } from 'vitest';
import { B, CATS } from '../src/data/buildings';
import { CHARM_MAX, CHARM_MIN, charmFrom, charmOfHome, charmTier, farmBoostOf } from '../src/data/charm';

describe('sfeer', () => {
  it('de treden lopen van somber naar prachtig', () => {
    expect(charmTier(-1).k).toBe('grim');
    expect(charmTier(0).k).toBe('plain');
    expect(charmTier(3).k).toBe('cosy');
    expect(charmTier(6).k).toBe('lovely');
  });

  it('versiering in de buurt telt mee, verder weg niet', () => {
    const hut = { type: 'hut', x: 10, y: 10 };
    expect(charmFrom(B, { type: 'totem', x: 12, y: 10 }, hut)).toBe(2);
    expect(charmFrom(B, { type: 'totem', x: 20, y: 10 }, hut)).toBe(0);
  });

  it('een fabriek maakt huizen in de buurt somber', () => {
    const home = { type: 'rowhouse', x: 10, y: 10 };
    expect(charmOfHome(B, home, [{ type: 'blastfurnace', x: 11, y: 11 }])).toBeLessThan(0);
  });

  it('veel versiering stapelt op, maar niet verder dan het maximum', () => {
    const home = { type: 'hut', x: 10, y: 10 };
    const statues = Array.from({ length: 12 }, (_, k) => ({
      type: 'statue',
      x: 9 + (k % 3),
      y: 11 + (k % 2),
    }));
    expect(charmOfHome(B, home, statues)).toBe(CHARM_MAX);
    const smoke = Array.from({ length: 6 }, () => ({ type: 'powerplant', x: 11, y: 10 }));
    expect(charmOfHome(B, home, smoke)).toBe(CHARM_MIN);
  });

  it('een waterput helpt akkers in de buurt, samen hoogstens +40%', () => {
    const farm = { type: 'farm', x: 10, y: 10 };
    expect(farmBoostOf(B, farm, [{ type: 'well', x: 12, y: 10 }])).toBeCloseTo(1.2);
    expect(farmBoostOf(B, farm, [{ type: 'well', x: 30, y: 10 }])).toBe(1);
    const many = Array.from({ length: 5 }, () => ({ type: 'well', x: 12, y: 10 }));
    expect(farmBoostOf(B, farm, many)).toBeCloseTo(1.4);
    // Een huis is geen akker: daar doet een waterput niets voor de oogst
    expect(farmBoostOf(B, { type: 'hut', x: 10, y: 10 }, [{ type: 'well', x: 11, y: 10 }])).toBe(1);
  });

  it('elk tijdperk heeft versiering, en elke versiering geeft sfeer', () => {
    expect(CATS.deco).toBeTruthy();
    const deco = Object.values(B).filter(d => d.cat === 'deco');
    for (let age = 0; age <= 8; age++)
      expect(
        deco.some(d => d.age === age),
        `tijdperk ${age}`,
      ).toBe(true);
    for (const d of deco) expect(d.charm && d.charm.v > 0, d.n).toBe(true);
  });
});
