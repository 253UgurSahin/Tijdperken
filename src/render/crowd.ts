// Figuren die ver weg als vast beeldje staan, per soort samen in één keer tekenen ("instanced").
// Elk beeldje was een eigen tekenopdracht; zo is het er één per soort figuur, hoeveel het er ook zijn.
import * as T3 from 'three';
import { store } from '../core/store';
import { S3 } from './scene';

/** Alle beeldjes van één soort figuur (zelfde entKey): één vorm, één materiaal, veel plekken. */
interface CrowdBatch {
  mesh: T3.InstancedMesh;
  count: number;
  /** Wanneer deze soort voor het laatst in beeld was (store.TM), om oude soorten op te ruimen. */
  usedT: number;
}
const batches = new Map<string, CrowdBatch>();
// Een soort die zo lang (seconden) niet meer getekend is, geven we vrij
const FORGET_AFTER = 30;

function makeBatch(statue: T3.Mesh, capacity: number, geo?: T3.BufferGeometry): T3.InstancedMesh {
  // Een eigen kopie van de vorm: het figuur zelf ruimt zijn eigen vorm op als het verdwijnt (disposeMerged)
  const mesh = new T3.InstancedMesh(geo || statue.geometry.clone(), statue.material, capacity);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = statue.castShadow;
  mesh.instanceMatrix.setUsage(T3.DynamicDrawUsage);
  S3.add(mesh);
  return mesh;
}

/** Begin van een beeldje: alle soorten weer leeg. */
export function crowdBegin(): void {
  for (const b of batches.values()) b.count = 0;
}

/** Eén beeldje van soort key op plek world (de hele wereldmatrix van het figuur). */
export function crowdAdd(key: string, statue: T3.Mesh, world: T3.Matrix4, castShadow: boolean): void {
  let b = batches.get(key);
  if (!b) {
    b = { mesh: makeBatch(statue, 16), count: 0, usedT: store.TM };
    batches.set(key, b);
  }
  if (b.count >= b.mesh.instanceMatrix.count) {
    // Vol: een grotere maken met dezelfde vorm, en de plekken die er al staan overnemen
    const old = b.mesh,
      bigger = makeBatch(statue, Math.ceil(b.count * 1.5), old.geometry);
    (bigger.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
    S3.remove(old);
    old.dispose(); // (de vorm niet: die gaat mee naar de nieuwe)
    b.mesh = bigger;
  }
  b.mesh.castShadow = castShadow;
  b.mesh.setMatrixAt(b.count++, world);
  b.usedT = store.TM;
}

/** Einde van een beeldje: aantallen bijwerken, lege soorten verbergen en lang ongebruikte opruimen. */
export function crowdEnd(): void {
  for (const [key, b] of batches) {
    b.mesh.count = b.count;
    b.mesh.visible = b.count > 0;
    if (b.count > 0) b.mesh.instanceMatrix.needsUpdate = true;
    else if (store.TM - b.usedT > FORGET_AFTER) {
      S3.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mesh.dispose();
      batches.delete(key);
    }
  }
}
