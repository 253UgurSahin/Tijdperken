// Figuren per soort samen in één keer tekenen ("instanced"): elk bewegend deel (romp, arm, been) van alle
// figuren van één soort is één tekenopdracht, hoeveel figuren er ook rondlopen. Armen en benen bewegen gewoon.
import * as T3 from 'three';
import { store } from '../core/store';
import { G } from '../game/state';
import { mat, VCMAT } from './kit';
import { S3 } from './scene';

/** Eén deel van één soort figuur (zelfde vorm, zelfde materiaal) op veel plekken tegelijk. */
interface CrowdBatch {
  mesh: T3.InstancedMesh;
  count: number;
  /** Het materiaal en de schaduw waarmee deze groep gemaakt is (een vracht wisselt van kleur). */
  material: T3.Material;
  castShadow: boolean;
}
/** Alle groepen van één soort figuur: per deelnummer (volgorde in het figuur) een paar groepen. */
interface CrowdKind {
  parts: CrowdBatch[][];
  /** Wanneer deze soort voor het laatst in beeld was (store.TM), om oude soorten op te ruimen. */
  usedT: number;
}
// Twee lijsten: een figuur als vast beeldje heeft andere delen dan een bewegend figuur van dezelfde soort
const moving = new Map<string, CrowdKind>(),
  still = new Map<string, CrowdKind>();
// Een soort die zo lang (seconden) niet meer getekend is, geven we vrij
const FORGET_AFTER = 30;
// Bij welk spel de groepen horen: een nieuw spel kan dezelfde sleutel met een ander uiterlijk hebben
// (bijv. rivaal 1 met een andere kleur), dus dan beginnen we opnieuw
let batchGame: unknown = null;

function makeBatch(source: T3.Mesh, capacity: number, geo?: T3.BufferGeometry): T3.InstancedMesh {
  // Een eigen kopie van de vorm: het figuur zelf ruimt zijn eigen vorm op als het verdwijnt (disposeMerged)
  const mesh = new T3.InstancedMesh(geo || source.geometry.clone(), source.material, capacity);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.receiveShadow = source.receiveShadow;
  mesh.castShadow = source.castShadow;
  mesh.instanceMatrix.setUsage(T3.DynamicDrawUsage);
  S3.add(mesh);
  return mesh;
}

// Alle groepen van een soort langs (forEach slaat de lege nummers over: delen die nooit zichtbaar waren)
function eachBatch(kind: CrowdKind, fn: (b: CrowdBatch) => void): void {
  kind.parts.forEach(slot => slot.forEach(fn));
}

function freeKind(kind: CrowdKind): void {
  eachBatch(kind, b => {
    S3.remove(b.mesh);
    b.mesh.geometry.dispose();
    b.mesh.dispose();
  });
}

/*
 * Eén keer bij het begin: een onzichtbaar klein groepje van een paar delen (met en zonder kleuren per
 * hoekpunt, met schaduw) een paar beeldjes lang laten tekenen. Zo maakt three.js de shaders voor figuren in
 * groepen meteen klaar (ook die voor de schaduw), en niet pas midden in het spel bij de eerste figuur.
 */
const WARMUP_FRAMES = 3;
let warmup: T3.InstancedMesh[] | null = null,
  warmupLeft = WARMUP_FRAMES;
function stepWarmup(): void {
  if (!warmup) {
    const flat = new T3.BufferGeometry();
    flat.setAttribute('position', new T3.Float32BufferAttribute(new Float32Array(9), 3));
    flat.setAttribute('color', new T3.Float32BufferAttribute(new Float32Array(9), 3));
    flat.computeVertexNormals();
    // (een matrix met grootte 0: er komt niets op het scherm, maar de shader wordt wel gebruikt)
    const nothing = new T3.Matrix4().makeScale(0, 0, 0);
    warmup = [VCMAT, mat('#808080')].map(m => {
      const mesh = new T3.InstancedMesh(flat, m, 1);
      mesh.setMatrixAt(0, nothing);
      mesh.frustumCulled = false;
      mesh.castShadow = mesh.receiveShadow = true;
      S3.add(mesh);
      return mesh;
    });
  }
  if (warmupLeft > 0 && --warmupLeft === 0) for (const m of warmup) m.visible = false;
}

/** Begin van een beeldje: alle groepen weer leeg (en alles weg bij een nieuw spel). */
export function crowdBegin(): void {
  stepWarmup();
  if (G !== batchGame) {
    batchGame = G;
    for (const list of [moving, still]) {
      for (const kind of list.values()) freeKind(kind);
      list.clear();
    }
  }
  for (const list of [moving, still])
    for (const kind of list.values())
      eachBatch(kind, b => {
        b.count = 0;
      });
}

/** De groep voor dit deel van deze soort, met dit materiaal en deze schaduw (zo nodig nieuw). */
function batchFor(kind: CrowdKind, index: number, mesh: T3.Mesh): CrowdBatch {
  const slot = kind.parts[index] || (kind.parts[index] = []);
  const material = mesh.material as T3.Material;
  for (const b of slot) if (b.material === material && b.castShadow === mesh.castShadow) return b;
  const b = { mesh: makeBatch(mesh, 16), count: 0, material, castShadow: mesh.castShadow };
  slot.push(b);
  return b;
}

function addTo(b: CrowdBatch, source: T3.Mesh, world: T3.Matrix4): void {
  if (b.count >= b.mesh.instanceMatrix.count) {
    // Vol: een grotere maken met dezelfde vorm, en de plekken die er al staan overnemen
    const old = b.mesh,
      bigger = makeBatch(source, Math.ceil(b.count * 1.5), old.geometry);
    (bigger.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
    S3.remove(old);
    old.dispose(); // (de vorm niet: die gaat mee naar de nieuwe)
    b.mesh = bigger;
  }
  b.mesh.setMatrixAt(b.count++, world);
}

// Wereldmatrices per diepte in het figuur (hergebruikt: geen nieuwe objecten per beeldje)
const depthMatrices: T3.Matrix4[] = [];
let meshIndex = 0;
function walk(o: T3.Object3D, parent: T3.Matrix4, depth: number, kind: CrowdKind): void {
  o.updateMatrix();
  const world = depthMatrices[depth] || (depthMatrices[depth] = new T3.Matrix4());
  world.multiplyMatrices(parent, o.matrix);
  // Elk deel heeft een vast nummer in het figuur, ook als het nu onzichtbaar is (zoals een lege vracht)
  const isMesh = (o as T3.Mesh).isMesh,
    index = isMesh ? meshIndex++ : -1;
  if (!o.visible) {
    // (de nummers van de delen hieronder overslaan, zodat de volgende delen hun eigen nummer houden)
    o.traverse(c => {
      if (c !== o && (c as T3.Mesh).isMesh) meshIndex++;
    });
    return;
  }
  if (isMesh) addTo(batchFor(kind, index, o as T3.Mesh), o as T3.Mesh, world);
  for (const c of o.children) walk(c, world, depth + 1, kind);
}

/**
 * Eén figuur van soort key in de groepen zetten. body = het figuur zelf (niet in de scène gehangen),
 * holder = de matrix van zijn houder (plek en draaiing), asStatue = het staat er als vast beeldje.
 */
export function crowdFigure(key: string, body: T3.Object3D, holder: T3.Matrix4, asStatue: boolean): void {
  const list = asStatue ? still : moving;
  let kind = list.get(key);
  if (!kind) {
    kind = { parts: [], usedT: store.TM };
    list.set(key, kind);
  }
  kind.usedT = store.TM;
  meshIndex = 0;
  walk(body, holder, 0, kind);
}

/** Einde van een beeldje: aantallen bijwerken, lege groepen verbergen en lang ongebruikte soorten opruimen. */
export function crowdEnd(): void {
  for (const list of [moving, still])
    for (const [key, kind] of list) {
      if (store.TM - kind.usedT > FORGET_AFTER) {
        freeKind(kind);
        list.delete(key);
        continue;
      }
      eachBatch(kind, b => {
        b.mesh.count = b.count;
        b.mesh.visible = b.count > 0;
        if (b.count > 0) b.mesh.instanceMatrix.needsUpdate = true;
      });
    }
}
