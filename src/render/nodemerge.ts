// Onderdelen van een boom of rots met hetzelfde materiaal samenvoegen tot één vorm: minder tekenwerk.
import * as T3 from 'three';
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Eén onderdeel van een boom of rots: een vorm (al op zijn plek gezet) en het materiaal. */
export interface NodePart {
  geo: T3.BufferGeometry;
  mat: T3.Material;
}

/**
 * Per materiaal één vorm: alle onderdelen met dat materiaal (behalve de nummers in skip) samen. De volgorde
 * van de materialen blijft zoals ze voor het eerst voorkomen. Alleen plek en richting van de vlakjes gaan mee:
 * alle materialen van bomen en rotsen zijn hoekig (flatShading) en gebruiken geen plaatjes.
 */
export function mergeByMaterial(parts: NodePart[], skip: number[] = []): NodePart[] {
  const byMat = new Map<T3.Material, T3.BufferGeometry[]>();
  parts.forEach((part, index) => {
    if (skip.includes(index)) return;
    const flat = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
    const clean = new T3.BufferGeometry();
    clean.setAttribute('position', flat.getAttribute('position'));
    if (flat.getAttribute('normal')) clean.setAttribute('normal', flat.getAttribute('normal'));
    else clean.computeVertexNormals();
    const list = byMat.get(part.mat);
    if (list) list.push(clean);
    else byMat.set(part.mat, [clean]);
  });
  const merged: NodePart[] = [];
  for (const [material, list] of byMat) {
    // (alle vormen hebben dezelfde twee kenmerken, dus samenvoegen lukt altijd)
    const geo = list.length === 1 ? list[0] : mergeBufferGeometries(list)!;
    geo.computeBoundingSphere();
    merged.push({ geo, mat: material });
  }
  return merged;
}
