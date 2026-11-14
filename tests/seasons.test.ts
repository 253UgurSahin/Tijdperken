// Tests voor de seizoenswissel: de overgang loopt alleen in de laatste nacht van een seizoen op.
import { describe, expect, it } from 'vitest';
import { seasonBlend, seasonDays, seasonIndex } from '../src/data/modifiers';

// Klokstanden door de nacht, van 22 uur tot vlak voor 6 uur (de dag telt om 6 uur verder)
const NIGHT = [22, 22.5, 23, 23.5, 23.99, 0, 0.5, 1, 2, 3, 4, 5, 5.5, 5.99];
// Klokstanden overdag en 's avonds
const DAYTIME = [6, 7, 9.5, 12, 15, 18, 20, 21, 21.99];

/** De laatste dag van elk seizoen in het eerste jaar (dag 1 is de eerste lentedag). */
function lastDays(longWinter: boolean): number[] {
  const out: number[] = [];
  let day = 0;
  for (const n of seasonDays(longWinter)) {
    day += n;
    out.push(day);
  }
  return out;
}

describe('seizoenswissel', () => {
  it('is 0 buiten de laatste nacht van een seizoen', () => {
    for (const longWinter of [false, true]) {
      const last = lastDays(longWinter);
      for (let day = 1; day <= 40; day++) {
        for (const clock of DAYTIME)
          expect(seasonBlend(day, clock, longWinter), `dag ${day} ${clock}u`).toBe(0);
        const year = last[last.length - 1];
        const isLast = last.includes(((day - 1) % year) + 1);
        if (!isLast)
          for (const clock of NIGHT)
            expect(seasonBlend(day, clock, longWinter), `dag ${day} ${clock}u`).toBe(0);
      }
    }
  });

  it('loopt in de laatste nacht steeds verder op, van 0 om 22 uur tot 1 om 6 uur', () => {
    for (const day of lastDays(false)) {
      expect(seasonBlend(day, 22)).toBe(0);
      let before = -1;
      for (const clock of NIGHT) {
        const t = seasonBlend(day, clock);
        if (clock !== 22) expect(t, `dag ${day} ${clock}u`).toBeGreaterThan(before);
        before = t;
      }
      expect(seasonBlend(day, 6 - 1e-9)).toBeCloseTo(1, 6);
      // Halverwege de nacht (2 uur) is de overgang half klaar
      expect(seasonBlend(day, 2)).toBeCloseTo(0.5, 6);
      // Om 6 uur is het de volgende dag: dan is dat seizoen er helemaal, zonder overgang
      expect(seasonBlend(day + 1, 6)).toBe(0);
      expect(seasonIndex(day + 1)).not.toBe(seasonIndex(day));
    }
  });

  it('volgt de seizoenslengtes van Lange winter', () => {
    // Lange winter: lente, zomer en herfst 2 dagen, winter 6 dagen
    expect(lastDays(true)).toEqual([2, 4, 6, 12]);
    for (const day of [2, 4, 6, 12, 14, 24])
      expect(seasonBlend(day, 2, true), `dag ${day}`).toBeCloseTo(0.5, 6);
    // Dag 8 is zonder Lange winter de laatste zomerdag, met Lange winter gewoon een winterdag
    expect(seasonBlend(8, 2, true)).toBe(0);
    expect(seasonBlend(8, 2, false)).toBeCloseTo(0.5, 6);
    // En andersom: dag 2 is met Lange winter de laatste lentedag, zonder gewoon de tweede
    expect(seasonBlend(2, 2, false)).toBe(0);
    // Midden in de lange winter: geen overgang
    for (const day of [7, 8, 9, 10, 11]) expect(seasonBlend(day, 3, true), `dag ${day}`).toBe(0);
  });
});
