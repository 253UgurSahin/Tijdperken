// Tests voor mergeByMaterial: per materiaal één vorm, met precies de onderdelen die erbij horen.
import * as T3 from 'three';
import { describe, expect, it } from 'vitest';
import { mergeByMaterial, type NodePart } from '../src/render/nodemerge';

const red = new T3.MeshBasicMaterial({ color: 'red' }),
  green = new T3.MeshBasicMaterial({ color: 'green' });
// Een kubus heeft 36 hoekpunten zonder index, een tetraëder 12
const parts: NodePart[] = [
  { geo: new T3.BoxGeometry(1, 1, 1), mat: green },
  { geo: new T3.TetrahedronGeometry(1), mat: red },
  { geo: new T3.BoxGeometry(1, 1, 1).translate(0, 2, 0), mat: green },
  { geo: new T3.TetrahedronGeometry(0.5), mat: red },
];
const count = (p: NodePart) => p.geo.getAttribute('position').count;

describe('mergeByMaterial', () => {
  it('maakt één vorm per materiaal, in de volgorde van eerste keer', () => {
    const merged = mergeByMaterial(parts);
    expect(merged.map(p => p.mat)).toEqual([green, red]);
  });
  it('telt alle hoekpunten van de onderdelen per materiaal op', () => {
    const merged = mergeByMaterial(parts);
    expect(count(merged[0])).toBe(72);
    expect(count(merged[1])).toBe(24);
    expect(merged[0].geo.index).toBeNull();
    expect(Object.keys(merged[0].geo.attributes).sort()).toEqual(['normal', 'position']);
  });
  it('slaat de onderdelen in skip over', () => {
    const merged = mergeByMaterial(parts, [2, 3]);
    expect(count(merged[0])).toBe(36);
    expect(count(merged[1])).toBe(12);
    // Alles van één materiaal overgeslagen: dat materiaal valt weg
    expect(mergeByMaterial(parts, [1, 3]).map(p => p.mat)).toEqual([green]);
  });
  it('houdt de plek van de onderdelen', () => {
    const merged = mergeByMaterial(parts);
    merged[0].geo.computeBoundingBox();
    expect(merged[0].geo.boundingBox!.max.y).toBeCloseTo(2.5);
  });
});
