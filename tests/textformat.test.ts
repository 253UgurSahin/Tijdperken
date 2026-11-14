// Tests voor de tekst-hulpjes: lange gebouwnamen breken netjes af en getallen staan er op zijn Nederlands.
import { describe, expect, it } from 'vitest';
import { B } from '../src/data/buildings';
import { RES } from '../src/data/resources';
import { SHAPE, fmt, fmtShort, hy } from '../src/ui/textformat';

describe('hy: lange namen', () => {
  it('geeft elk woord van 11 letters of meer een afbreekstreepje', () => {
    const missing: string[] = [];
    for (const k in B) {
      for (const word of B[k].n.split(/[ -]/)) {
        if (word.length >= 11 && !hy(word).includes('­')) missing.push(word);
      }
    }
    expect(missing).toEqual([]);
  });
  it('breekt op de goede plek', () => {
    expect(hy('Steengroeve')).toBe('Steen­groeve');
    expect(hy('Mijnschacht')).toBe('Mijn­schacht');
    expect(hy('Raffinaderij')).toBe('Raffina­derij');
  });
});

describe('fmt: getallen', () => {
  it('schrijft getallen op zijn Nederlands', () => {
    expect(fmt(9999)).toBe('9.999');
    expect(fmt(10000)).toBe('10,0k');
    expect(fmt(99940)).toBe('99,9k');
    expect(fmt(99960)).toBe('100k');
    expect(fmt(100000)).toBe('100k');
    expect(fmt(999600)).toBe('1,0M');
    expect(fmt(1234567)).toBe('1,2M');
  });
  it('rondt nooit af naar "100,0k" of "1000k"', () => {
    for (let n = 99000; n < 1001000; n += 37) {
      const s = fmt(n);
      expect(s).not.toMatch(/^100,\dk$|^1000k$/);
    }
  });
  it('maakt korte getallen voor op een tegel', () => {
    expect(fmtShort(950)).toBe('950');
    expect(fmtShort(1200)).toBe('1,2k');
    expect(fmtShort(2000)).toBe('2k');
    expect(fmtShort(15000)).toBe('15k');
    expect(fmtShort(999600)).toBe('1M');
  });
});

describe('SHAPE: grondstof-fiches', () => {
  it('heeft een vorm voor elke grondstof', () => {
    expect(Object.keys(RES).filter(k => !SHAPE[k])).toEqual([]);
  });
});
