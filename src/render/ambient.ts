// Leven in de wereld: vogels die rondcirkelen, vuurvliegjes 's nachts en vallende bladeren in de herfst.
import * as T3 from 'three';
import { store } from '../core/store';
import { W, H } from '../config';
import { G } from '../game/state';
import { season } from '../game/time';
import { BIOME, biome, node } from '../world/world';
import { camDist, pxu } from './camera';
import { LAYER, emit } from './particles';
import { S3, cam } from './scene';

// Vogel: een lijfje met een lichte buik, een staartje en twee vleugels (spanwijdte 1). aWing zegt hoe ver een
// punt op de vleugel ligt (0 = aan het lijf, ±1 = de punt): daarmee klappen de vleugels in de shader.
const BIRDG = (() => {
  const pos: number[] = [],
    col: number[] = [],
    wing: number[] = [];
  const BACK = [0.2, 0.19, 0.22],
    BELLY = [0.72, 0.68, 0.62],
    WING = [0.27, 0.25, 0.28];
  type Pt = [number, number, number];
  const tri = (a: Pt, b: Pt, c: Pt, colour: number[], w: [number, number, number] = [0, 0, 0]) => {
    for (const p of [a, b, c]) pos.push(...p);
    for (let k = 0; k < 3; k++) col.push(...colour);
    wing.push(...w);
  };
  // Lijf: een spoel van neus naar staart, met een ring van vier punten in het midden
  const nose: Pt = [0, 0.01, 0.28],
    tail: Pt = [0, 0, -0.2],
    up: Pt = [0, 0.045, 0.03],
    down: Pt = [0, -0.05, 0.03],
    left: Pt = [-0.055, 0, 0.03],
    right: Pt = [0.055, 0, 0.03];
  tri(nose, right, up, BACK);
  tri(nose, up, left, BACK);
  tri(nose, down, right, BELLY);
  tri(nose, left, down, BELLY);
  tri(tail, up, right, BACK);
  tri(tail, left, up, BACK);
  tri(tail, right, down, BELLY);
  tri(tail, down, left, BELLY);
  // Staart: een klein waaiertje
  tri([0, 0, -0.16], [-0.09, 0, -0.33], [0.09, 0, -0.33], BACK);
  // Vleugels: breed bij het lijf, puntig naar buiten en iets naar achteren
  for (const s of [1, -1]) {
    const rootFront: Pt = [0.03 * s, 0.01, 0.1],
      rootBack: Pt = [0.03 * s, 0.01, -0.07],
      mid: Pt = [0.26 * s, 0.01, 0.05],
      tip: Pt = [0.5 * s, 0.01, -0.1];
    tri(rootFront, rootBack, mid, WING, [0, 0, 0.5]);
    tri(mid, rootBack, tip, WING, [0.5, 0, 1]);
  }
  const g = new T3.BufferGeometry();
  g.setAttribute('position', new T3.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new T3.Float32BufferAttribute(col, 3));
  g.setAttribute('aWing', new T3.Float32BufferAttribute(wing, 1));
  g.computeVertexNormals();
  return g;
})();
const FLOCKS = 2,
  PER = 5,
  BIRDS = FLOCKS * PER;
// Per vogel hoe ver de vleugels nu omhoog (1) of omlaag (-1) staan
const FLAP = new T3.InstancedBufferAttribute(new Float32Array(BIRDS), 1);
FLAP.setUsage(T3.DynamicDrawUsage);
BIRDG.setAttribute('aFlap', FLAP);
// Lambert: dan kleurt het avondlicht ze mee, en een lijfje met een lichte buik leest als vogel
const BIRDM = new T3.MeshLambertMaterial({ vertexColors: true, side: T3.DoubleSide });
BIRDM.onBeforeCompile = shader => {
  // Klapperen: hoe verder naar de vleugelpunt, hoe hoger of lager; de vleugel wordt dan ook iets korter
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aWing;\nattribute float aFlap;')
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      transformed.y += aWing * 0.36 * aFlap;
      transformed.x *= 1.0 - 0.18 * aWing * aFlap * aFlap;`,
    );
};
BIRDM.customProgramCacheKey = () => 'bird-flap';
// Alle tien vogels in één tekenopdracht, zonder schaduw: de lage avondzon zou die over de hele kaart trekken
const BIRDS_MESH = new T3.InstancedMesh(BIRDG, BIRDM, BIRDS);
BIRDS_MESH.instanceMatrix.setUsage(T3.DynamicDrawUsage);
BIRDS_MESH.castShadow = false;
BIRDS_MESH.frustumCulled = false; // ze vliegen rond de camera; de bol van één vogel klopt niet voor de zwerm
BIRDS_MESH.visible = false;
S3.add(BIRDS_MESH);
const _bird = new T3.Object3D();

function drawBirds(show: boolean) {
  BIRDS_MESH.visible = show;
  if (!show) return;
  // Zo groot dat een vogel op het scherm ongeveer 13 pixels breed is, maar nooit enorm als je ver uitzoomt
  const size = Math.max(0.25, Math.min(1.4, 13 / pxu()));
  const t = store.TM;
  for (let i = 0; i < BIRDS; i++) {
    const f = (i / PER) | 0,
      k = i % PER;
    // Elke zwerm draait langzaam rondjes rond een punt dat zelf ook rondzwerft
    const cx = cam.x + Math.sin(t * 0.031 + f * 3) * 12,
      cz = cam.y + Math.cos(t * 0.023 + f * 2) * 12,
      R = 7 + f * 3 + k * 0.5,
      dir = f ? -1 : 1,
      a = t * (0.22 - f * 0.05) * dir + k * 0.16,
      x = cx + Math.cos(a) * R,
      z = cz + Math.sin(a) * R;
    _bird.position.set(x, 9 + f * 0.8 + Math.sin(t * 0.7 + k) * 0.3, z);
    // Vliegrichting = raaklijn van de cirkel, en een beetje schuin in de bocht
    _bird.rotation.set(0, Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir), 0.25 * dir);
    _bird.scale.setScalar(size);
    _bird.updateMatrix();
    BIRDS_MESH.setMatrixAt(i, _bird.matrix);
    // Klapperen, af en toe even zweven (vleugels dan iets omhoog)
    const glide = Math.sin(t * 0.5 + i) > 0.4;
    FLAP.setX(i, glide ? 0.25 : Math.sin(t * 13 + i * 1.7));
  }
  BIRDS_MESH.instanceMatrix.needsUpdate = true;
  FLAP.needsUpdate = true;
}

let flyAcc = 0,
  leafAcc = 0,
  lastT = 0;
const SPOT = [0, 0];
// Zoek een willekeurige tegel dicht bij de camera die aan de voorwaarde voldoet (ok geeft dan iets waars)
function spotNear(R: number, ok: (i: number) => unknown) {
  for (let k = 0; k < 6; k++) {
    const x = cam.x + (Math.random() - 0.5) * R * 2,
      y = cam.y + (Math.random() - 0.5) * R * 2;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = (y | 0) * W + (x | 0);
    if (ok(i)) {
      SPOT[0] = x;
      SPOT[1] = y;
      return SPOT;
    }
  }
  return null;
}
const isGreen = (i: number) => biome[i] === BIOME.GRASS || biome[i] === BIOME.FOREST;
const isTree = (i: number) => biome[i] === BIOME.FOREST && node[i];

/** Elk beeldje: vogels bijwerken en af en toe een vuurvliegje of blaadje loslaten. */
export function drawAmbient(dk: number) {
  const dt = lastT ? Math.min(0.1, store.TM - lastT) : 0;
  lastT = store.TM;
  const sn = season().n,
    R = camDist() * 0.7;
  // Vogels alleen als je wat verder uitgezoomd bent; van dichtbij zouden ze voor de camera fladderen
  drawBirds(dk < 0.4 && !G.rain && sn !== 'Winter' && !!biome && camDist() > 16 && !store.V2);
  if (!biome) return;
  // Vuurvliegjes: warme nachten, boven gras en bos
  if (dk > 0.45 && sn !== 'Winter' && !G.rain) {
    flyAcc += dt * 30;
    while (flyAcc >= 1) {
      flyAcc--;
      const p = spotNear(R, isGreen);
      if (p)
        emit(
          LAYER.glow,
          p[0],
          0.25 + Math.random() * 0.6,
          p[1],
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.15,
          (Math.random() - 0.5) * 0.4,
          2.5 + Math.random() * 2,
          0.05,
          0.04,
          Math.random() < 0.5 ? 0xd8ff6a : 0xfff08a,
          0.95,
        );
    }
  }
  // Herfstblaadjes dwarrelen uit de bomen
  if (sn === 'Herfst' && dk < 0.6) {
    leafAcc += dt * 14;
    while (leafAcc >= 1) {
      leafAcc--;
      const p = spotNear(R, isTree);
      if (p)
        emit(
          LAYER.soft,
          p[0],
          1.2 + Math.random() * 0.6,
          p[1],
          0.25 + Math.random() * 0.2,
          -0.25,
          (Math.random() - 0.5) * 0.3,
          5,
          0.05,
          0.045,
          [0xd9822f, 0xe3a63a, 0xb5532a][(Math.random() * 3) | 0],
          0.95,
          -0.08,
        );
    }
  }
}
