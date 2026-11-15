// Platte vormen op de grond: lichtvlekken, selectiecirkels, bereik.
import * as T3 from 'three';
import { S3 } from './scene';

// Lichtvlekken op de grond. Ze worden gemengd met 'MAX': als lampen overlappen telt
// alleen de felste, dus veel kampvuren naast elkaar worden geen witte vlek.
// Alle vlekken samen zijn één vorm met veel plekken ("instanced"): één tekenopdracht, hoeveel lampen er ook zijn.
// Het plaatje is wit; de kleur (warm of koel, en hoe fel) zit per vlek in de instance-kleur.
function radialTex(): T3.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!,
    gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgb(255,255,255)');
  gr.addColorStop(0.45, 'rgb(140,140,140)');
  gr.addColorStop(1, 'rgb(0,0,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  return new T3.CanvasTexture(c);
}
/** Zoveel lichtvlekken hooguit: lampen (MAX_GLOWS in lighting.ts) plus het licht uit deuren. */
export const GLOW_CAP = 96 + 64;
const glowGeo = new T3.PlaneGeometry(2, 2);
glowGeo.rotateX(-Math.PI / 2);
export const GLOWS = new T3.InstancedMesh(
  glowGeo,
  new T3.MeshBasicMaterial({
    map: radialTex(),
    blending: T3.CustomBlending,
    blendEquation: T3.MaxEquation,
    depthWrite: false,
    fog: false,
  }),
  GLOW_CAP,
);
GLOWS.count = 0;
GLOWS.renderOrder = 2;
GLOWS.frustumCulled = false;
GLOWS.instanceMatrix.setUsage(T3.DynamicDrawUsage);
GLOWS.setColorAt(0, new T3.Color(0, 0, 0)); // (zo bestaat de kleurbuffer meteen, en kent de shader hem)
// (blijft altijd in de scène; zonder vlekken verborgen, zie glowsEnd en precompileNightShaders)
S3.add(GLOWS);
const glowM = new T3.Matrix4(),
  glowC = new T3.Color();
/** Begin van een beeldje: nog geen lichtvlekken. */
export function glowsBegin(): void {
  GLOWS.count = 0;
}
/** Een lichtvlek op (x, z) met straal r, in kleur colour en zo fel (0..1). */
export function glowAt(x: number, z: number, r: number, colour: T3.Color, strength: number): void {
  if (GLOWS.count >= GLOW_CAP) return;
  glowM.makeScale(r, 1, r).setPosition(x, 0.04, z);
  GLOWS.setMatrixAt(GLOWS.count, glowM);
  GLOWS.setColorAt(GLOWS.count, glowC.copy(colour).multiplyScalar(strength));
  GLOWS.count++;
}
/** Einde van een beeldje: de nieuwe plekken en kleuren naar de videokaart. */
export function glowsEnd(): void {
  // Geen vlekken (overdag): verborgen, dan slaat three.js hem helemaal over
  GLOWS.visible = GLOWS.count > 0;
  GLOWS.instanceMatrix.needsUpdate = true;
  GLOWS.instanceColor!.needsUpdate = true;
}
export const RINGG = new T3.RingGeometry(0.86, 1, 40);
RINGG.rotateX(-Math.PI / 2);
/** Een voorraad herbruikbare 3D-objecten van één soort; elk beeldje worden de eerste n gebruikt. */
interface Pool {
  list: T3.Object3D[];
  n: number;
  make: () => T3.Object3D;
}
const POOLS: Record<string, Pool> = {};
// Een voorraad bevat alleen objecten die door zijn eigen make() gemaakt zijn, dus van type T
export function pool<T extends T3.Object3D>(name: string, make: () => T): T {
  const P = POOLS[name] || (POOLS[name] = { list: [], n: 0, make });
  if (P.n >= P.list.length) {
    const o = make();
    S3.add(o);
    P.list.push(o);
  }
  const o = P.list[P.n++] as T;
  o.visible = true;
  return o;
}
export function poolsBegin() {
  for (const k in POOLS) POOLS[k].n = 0;
}
export function poolsEnd() {
  for (const k in POOLS) {
    const P = POOLS[k];
    for (let i = P.n; i < P.list.length; i++) P.list[i].visible = false;
  }
}
const ringMesh = () => {
  const m = new T3.Mesh(
    RINGG,
    new T3.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.9, depthWrite: false }),
  );
  m.renderOrder = 3;
  return m;
};
export const quadG = new T3.PlaneGeometry(1, 1);
quadG.rotateX(-Math.PI / 2);
const quadMesh = () => {
  const m = new T3.Mesh(
    quadG,
    new T3.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.4, depthWrite: false }),
  );
  m.renderOrder = 2;
  return m;
};
export function ringAt(x: number, y: number, r: number, col: string, op = 0.9, h = 0.04) {
  const m = pool('ring', ringMesh);
  m.position.set(x, h, y);
  m.scale.set(r, 1, r);
  m.material.color.set(col);
  m.material.opacity = op;
  return m;
}
export function quadAt(x: number, y: number, w: number, d: number, col: string, op = 0.4, h = 0.03) {
  const m = pool('quad', quadMesh);
  m.position.set(x, h, y);
  m.scale.set(w, 1, d);
  m.material.color.set(col);
  m.material.opacity = op;
  return m;
}
// Dunne cirkel die het bereik toont
const RANGEG = new T3.RingGeometry(0.985, 1, 72);
RANGEG.rotateX(-Math.PI / 2);
export function rangeAt(x: number, y: number, r: number, col: string) {
  const m = pool('range', () => {
    const o = new T3.Mesh(
      RANGEG,
      new T3.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.6, depthWrite: false }),
    );
    o.renderOrder = 3;
    return o;
  });
  m.position.set(x, 0.05, y);
  m.scale.set(r, 1, r);
  m.material.color.set(col);
  return m;
}
