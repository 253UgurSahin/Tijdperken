// Toetst het rekenwerk voor de stad 's nachts: hoeveel ramen aan zijn, en wanneer elke lamp aangaat.
import { describe, expect, it } from 'vitest';
import { doorLight, lampSwitchAt, litShares, winHash } from '../src/render/nightclock';

describe('ramen in de nacht', () => {
  it('overdag en na zonsopkomst is geen raam aan', () => {
    expect(litShares(12)[0]).toBe(0);
    expect(litShares(6.5)[0]).toBe(0);
  });
  it('om 19:10 is ongeveer de helft aan, om 21:00 zo goed als alles', () => {
    expect(litShares(19 + 10 / 60)[0]).toBeGreaterThan(0.4);
    expect(litShares(19 + 10 / 60)[0]).toBeLessThan(0.6);
    expect(litShares(21)[0]).toBeCloseTo(0.85, 2);
    expect(litShares(21)[1]).toBe(1);
  });
  it('na middernacht gaan de ramen per raam uit, tegen de ochtend weer een paar aan', () => {
    const share = (clock: number) => litShares(clock)[0] * litShares(clock)[1];
    expect(share(23.5)).toBeCloseTo(0.85, 2);
    expect(share(2.5)).toBeGreaterThan(0.1);
    expect(share(2.5)).toBeLessThan(0.2);
    expect(share(5)).toBeGreaterThan(share(2.5));
  });
});

describe('lampen', () => {
  it('elke lamp gaat aan tussen donkerte 0.05 en 0.45, altijd op hetzelfde moment', () => {
    for (let x = 0; x < 40; x++)
      for (let y = 0; y < 40; y++) {
        const at = lampSwitchAt(x + 0.5, y + 0.5);
        expect(at).toBeGreaterThanOrEqual(0.05);
        expect(at).toBeLessThan(0.45);
        expect(lampSwitchAt(x + 0.1, y + 0.9)).toBe(at);
      }
  });
});

describe('licht bij de deur', () => {
  // Een rij huizen (middens op halve tegels, zoals een huis van 1 of 3 tegels breed)
  const houses: [number, number][] = [];
  for (let x = 0; x < 30; x++) for (let y = 0; y < 20; y++) houses.push([x * 3 + 1.5, y * 2 + 0.5]);
  const litPart = (clock: number) => {
    const [evening, night] = litShares(clock);
    return houses.filter(([x, z]) => doorLight(x, z, evening, night) > 0.5).length / houses.length;
  };
  it('het toevalsgetal van een huis ligt tussen 0 en 1 en is steeds hetzelfde', () => {
    for (const [x, z] of houses.slice(0, 50)) {
      const h = winHash(x * 2, z * 2, 0);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
      expect(winHash(x * 2, z * 2, 0)).toBe(h);
    }
  });
  it('overdag nergens licht, om half elf bij de meeste huizen, om half drie bij een paar', () => {
    expect(litPart(12)).toBe(0);
    expect(litPart(22.5)).toBeGreaterThan(0.7);
    expect(litPart(22.5)).toBeLessThan(0.95);
    expect(litPart(2.5)).toBeGreaterThan(0.03);
    expect(litPart(2.5)).toBeLessThan(0.3);
  });
});
