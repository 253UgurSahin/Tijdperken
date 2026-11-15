// Tests voor nearestK: kiest het de dichtstbijzijnde dingen, op volgorde, zonder nieuwe lijst?
import { describe, expect, it } from 'vitest';
import { nearestK } from '../src/util/nearest';

const spots = [
  { x: 5, y: 0, id: 'e' },
  { x: 1, y: 0, id: 'a' },
  { x: 0, y: 3, id: 'c' },
  { x: 2, y: 0, id: 'b' },
  { x: 4, y: 0, id: 'd' },
  { x: 50, y: 0, id: 'ver' },
];

describe('nearestK', () => {
  it('geeft de dichtstbijzijnde eerst', () => {
    const out = nearestK(spots, 0, 0, 100, 10, []);
    expect(out.map(s => s.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'ver']);
  });
  it('houdt er hooguit k', () => {
    expect(nearestK(spots, 0, 0, 100, 3, []).map(s => s.id)).toEqual(['a', 'b', 'c']);
    expect(nearestK(spots, 0, 0, 100, 0, [])).toEqual([]);
  });
  it('laat dingen te ver weg weg', () => {
    expect(nearestK(spots, 0, 0, 4, 10, []).map(s => s.id)).toEqual(['a', 'b', 'c']);
  });
  it('vraagt accept om goedkeuring', () => {
    const out = nearestK(spots, 0, 0, 100, 2, [], s => s.id !== 'a');
    expect(out.map(s => s.id)).toEqual(['b', 'c']);
  });
  it('gebruikt de meegegeven lijst opnieuw', () => {
    const out: typeof spots = [spots[5], spots[5], spots[5], spots[5]];
    const res = nearestK(spots, 4.4, 0, 100, 2, out);
    expect(res).toBe(out);
    expect(res.map(s => s.id)).toEqual(['d', 'e']);
  });
});
