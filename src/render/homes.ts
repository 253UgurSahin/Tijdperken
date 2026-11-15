// Extra's aan huizen per welvaart: bloembakken, een aanbouw, een extra verdieping, of juist verval.
import type { Building, RivalBuilding } from '../types';
import * as T3 from 'three';
import { B } from '../data/buildings';
import {
  C,
  CYANM,
  GLASS,
  GB,
  VIOLETM,
  WIN,
  bx,
  cn,
  cy,
  detail,
  gTorus,
  gr,
  isMesh,
  mat,
  mk,
  sp,
} from './kit';

/** De welvaart om te tekenen: die van je eigen huis, anders Eenvoudig (rivalen, pictogrammen, het voorbeeld). */
export function homeGradeOf(b?: Building | RivalBuilding | null): number {
  return b && b.kind === 'b' && typeof b.grade === 'number' && b.grade >= 0 ? b.grade : 1;
}

/** Hoe hoog een huis is per welvaart: een vervallen huis zakt iets in, een prachtig huis is hoger en breder. */
export function gradeScale(grade: number): number {
  return grade <= 0 ? 0.97 : grade === 3 ? 1.05 : grade >= 4 ? 1.12 : 1;
}

/** Bouwstijl van de extra's: hout en riet, baksteen, ijzer, of glas en neon. */
type Era = 'wood' | 'brick' | 'iron' | 'glass';
const eraOf = (age: number): Era => (age <= 2 ? 'wood' : age <= 4 ? 'brick' : age <= 6 ? 'iron' : 'glass');

/** Een stukje schuin dak: waar het ligt, welke kant het op kijkt (hoek om de y-as) en hoe steil. */
interface Slope {
  x: number;
  y: number;
  z: number;
  /** Hoek om de y-as: 0 = naar voren (+z), PI/2 = naar rechts (+x). */
  face: number;
  tilt: number;
}

/**
 * De maten van één huismodel (zie render/models.ts), zodat de extra's tegen de muren en op het dak passen.
 * Voor = +z, rechts = +x: de twee kanten die je met de gewone camera ziet.
 */
interface HomeShape {
  /** Muur- en dakkleur (voor de aanbouw). */
  wall: string;
  roof: string;
  /** Hoogte van de muur (dakrand) en het hoogste punt. */
  eave: number;
  top: number;
  /** Plat dak (flat: een dakterras of koepel bovenop), anders een schuin dak. */
  flat: boolean;
  /** Voorgevel (z) en rechtergevel (x). */
  front: number;
  side: number;
  /** Bloembakken onder ramen aan de voorkant (y = 0: potten op de grond). */
  boxes: [number, number][];
  /** Hekje of haag: punten op de grond, met een lijn ertussen. */
  fence: [number, number][];
  /** Plek voor een lantaarn of straatlamp bij de deur. */
  lamp: [number, number];
  /** Een boompje of struik in een vrije hoek (welvarend). */
  tree: [number, number] | null;
  /** Gat in het dak of een vlek op de gevel (vervallen). */
  patch: Slope | null;
  /** Dichtgetimmerd raam (vervallen): midden van een raam aan de voorkant. */
  board: [number, number] | null;
  /** Hoe hoog de voorgevel recht doorloopt (voor vochtplekken); anders tot de dakrand. */
  wallH?: number;
}

const T = (h: number, run: number) => Math.atan2(h, run);

const SHAPES: Record<string, HomeShape> = {
  hut: {
    wall: '#a9845a',
    roof: C.thatch,
    eave: 0.42,
    top: 0.95,
    flat: false,
    front: 0.36,
    side: 0.36,
    boxes: [
      [-0.2, 0],
      [0.2, 0],
    ],
    fence: [
      [0.46, 0.05],
      [0.46, 0.46],
      [0.12, 0.46],
    ],
    lamp: [0.27, 0.42],
    tree: [0.36, -0.36],
    patch: { x: 0.21, y: 0.6, z: 0.21, face: Math.PI / 4, tilt: T(0.55, 0.47) },
    board: null,
  },
  house: {
    wall: C.clay,
    roof: C.thatch,
    eave: 0.48,
    top: 0.86,
    flat: false,
    front: 0.31,
    side: 0.37,
    boxes: [[0.18, 0.13]],
    fence: [
      [0.46, 0.0],
      [0.46, 0.46],
      [0.22, 0.46],
    ],
    lamp: [0.06, 0.42],
    tree: [0.38, -0.38],
    patch: { x: 0.12, y: 0.62, z: 0.2, face: 0, tilt: T(0.38, 0.39) },
    board: [0.18, 0.28],
  },
  stonehouse: {
    wall: C.stone,
    roof: C.slate,
    eave: 0.62,
    top: 1.02,
    flat: false,
    front: 0.35,
    side: 0.4,
    boxes: [[0.2, 0.26]],
    fence: [
      [0.46, 0.1],
      [0.46, 0.46],
      [0.26, 0.46],
    ],
    lamp: [0.06, 0.44],
    tree: [0.4, -0.4],
    patch: { x: 0.18, y: 0.8, z: 0.21, face: 0, tilt: T(0.4, 0.42) },
    board: [0.2, 0.38],
  },
  canalhouse: {
    wall: C.brick,
    roof: C.slate,
    eave: 1.45,
    top: 2.0,
    flat: false,
    front: 0.33,
    side: 0.29,
    boxes: [
      [-0.14, 0.64],
      [0.14, 0.64],
    ],
    // Grachtenpaaltjes langs de stoep
    fence: [
      [0.08, 0.46],
      [0.26, 0.46],
      [0.44, 0.46],
    ],
    lamp: [-0.32, 0.36],
    tree: [0.4, -0.42],
    patch: { x: 0.15, y: 1.7, z: -0.25, face: Math.PI / 2, tilt: T(0.5, 0.28) },
    board: [0.14, 0.49],
  },
  rowhouse: {
    wall: C.brick,
    roof: C.slate,
    eave: 0.82,
    top: 1.14,
    flat: false,
    front: 0.31,
    side: 0.45,
    boxes: [
      [-0.3, 0.42],
      [0.3, 0.42],
    ],
    fence: [
      [-0.46, 0.46],
      [-0.33, 0.46],
    ],
    lamp: [0.42, 0.44],
    tree: [0.4, -0.42],
    patch: { x: -0.2, y: 0.93, z: 0.18, face: 0, tilt: T(0.32, 0.37) },
    board: [0.3, 0.55],
  },
  apartment: {
    wall: '#cfc5b2',
    roof: '#9a9d97',
    eave: 1.85,
    top: 1.89,
    flat: true,
    front: 0.43,
    side: 0.43,
    boxes: [],
    fence: [
      [0.34, 0.47],
      [0.47, 0.47],
      [0.47, 0.3],
    ],
    lamp: [-0.38, 0.46],
    tree: null,
    patch: null,
    board: [-0.25, 0.48],
  },
  towerblock: {
    wall: '#e8edf0',
    roof: C.white,
    eave: 3,
    top: 3.1,
    flat: true,
    front: 0.6,
    side: 0.6,
    boxes: [],
    fence: [
      [-0.94, 0.94],
      [-0.4, 0.94],
    ],
    lamp: [0.45, 0.9],
    tree: [-0.75, 0.72],
    patch: null,
    board: [-0.25, 0.4],
  },
  arcology: {
    wall: '#e8edf0',
    roof: '#6fae58',
    eave: 2.4,
    top: 2.44,
    flat: true,
    front: 0.85,
    side: 0.85,
    boxes: [],
    fence: [],
    lamp: [0.92, 0.92],
    tree: null,
    patch: null,
    board: [-0.4, 0.4],
    // Alleen de onderste laag staat vooraan; de lagen erboven liggen naar achteren
    wallH: 0.6,
  },
};

// Kleuren van bloemen en groen (dezelfde als bij het bloemperk)
const FLOWERS = ['#e2574c', '#f2c94c', '#f4f1e8', '#c46bd1'];
// Alleen de bonte bloemkleuren (geen wit): die vallen van ver nog op
const BRIGHT = [FLOWERS[0], FLOWERS[1], FLOWERS[3]];
const LEAF = '#4f8a3c',
  LEAF_DARK = '#3f6f30',
  WEED = '#6d7438',
  ROT = '#4a4038';

/** Een dun plaatje dat schuin op een dakvlak ligt (gat in het riet, een zeil, nieuwe pannen). */
function slab(g: T3.Object3D, w: number, d: number, c: string, s: Slope, sy: number): void {
  const o = mk(GB, mat(c), g, s.x, s.y * sy, s.z, w, 0.025, d);
  o.rotation.set(s.tilt, s.face, 0, 'YXZ');
}

/**
 * Het hele huis een stukje hoger (en bij prachtig iets breder) maken. Het model is al samengesteld uit losse
 * blokjes; we schalen hun plek en hoogte. Schuin gedraaide stukjes (latjes, liggende stammen) houden hun
 * eigen maat: die zie je toch niet groeien, en zo blijven ze recht. De grondplaat en stoeprand blijven plat.
 */
function stretch(g: T3.Group, sy: number, sxz: number): void {
  if (sy === 1 && sxz === 1) return;
  for (const o of g.children) {
    const flat = o.position.y < 0.001 && o.scale.y <= 0.05;
    if (flat) continue;
    o.position.y *= sy;
    o.position.x *= sxz;
    o.position.z *= sxz;
    // Alleen een rechtop staand blok mag zelf langer worden (draaien om de y-as maakt niet uit)
    if (isMesh(o) && Math.abs(o.rotation.x) < 0.01 && Math.abs(o.rotation.z) < 0.01) {
      o.scale.y *= sy;
      o.scale.x *= sxz;
      o.scale.z *= sxz;
    }
  }
}

/** Een vervallen huis is grauwer: alle gewone kleuren een stuk doffer en donkerder. */
function weather(g: T3.Group): void {
  const grime = new T3.Color('#6f6658');
  for (const o of g.children) {
    if (!isMesh(o)) continue;
    const m = o.material as T3.MeshStandardMaterial;
    if (!m.userData || !m.userData.vc) continue;
    const c = m.color.clone().lerp(grime, 0.35).multiplyScalar(0.86);
    o.material = mat('#' + c.getHexString());
  }
}

/** Bloembak onder een raam (of twee potten naast de deur bij een hut). */
function flowerBox(g: T3.Object3D, x: number, y: number, z: number, era: Era, seed: number): void {
  if (y === 0) {
    cy(g, 0.06, 0.1, C.clay, x, 0.03, z, 8, 0.08);
    sp(g, 0.07, LEAF, x, 0.16, z, 0, 0.8);
    sp(g, 0.03, FLOWERS[seed % 4], x + 0.03, 0.21, z + 0.03);
    return;
  }
  const box = era === 'wood' ? C.woodd : era === 'brick' ? '#7a4a32' : era === 'iron' ? C.dmetal : C.white;
  // Iets groter dan echt: anders zie je van de gewone afstand niet dat een huis Net is geworden
  bx(g, 0.25, 0.06, 0.08, box, x, y, z + 0.045);
  bx(g, 0.23, 0.04, 0.07, LEAF_DARK, x, y + 0.06, z + 0.045);
  for (let k = 0; k < 4; k++)
    sp(g, 0.034, BRIGHT[(seed + k) % BRIGHT.length], x - 0.09 + k * 0.06, y + 0.105, z + 0.05);
}

/** Een hekje (hout of ijzer), een lage haag of grachtenpaaltjes langs de gegeven punten. */
function fence(g: T3.Object3D, pts: [number, number][], era: Era, type: string): void {
  if (pts.length < 2) return;
  if (type === 'canalhouse') {
    // Losse paaltjes met een witte kop, zoals langs een Amsterdamse gracht
    for (const [x, z] of pts) {
      cy(g, 0.025, 0.2, '#4a2a22', x, 0.03, z, 6);
      sp(g, 0.03, '#f1ece0', x, 0.23, z);
    }
    return;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i],
      [x1, z1] = pts[i + 1],
      len = Math.hypot(x1 - x0, z1 - z0),
      ang = Math.atan2(x1 - x0, z1 - z0),
      mx = (x0 + x1) / 2,
      mz = (z0 + z1) / 2;
    if (era === 'brick' || era === 'glass') {
      // Een lage geschoren haag (bij glas in een witte bak)
      if (era === 'glass') bx(g, 0.1, 0.06, len + 0.06, C.white, mx, 0.03, mz, ang);
      bx(g, 0.08, 0.14, len + 0.04, LEAF_DARK, mx, era === 'glass' ? 0.09 : 0.03, mz, ang);
    } else {
      const c = era === 'wood' ? C.wood : C.dmetal;
      for (const y of [0.09, 0.17]) bx(g, 0.02, 0.025, len, c, mx, y, mz, ang);
    }
  }
  if (era === 'wood' || era === 'iron')
    for (const [x, z] of pts) bx(g, 0.035, 0.24, 0.035, era === 'wood' ? C.woodd : '#2e3236', x, 0.03, z);
}

/** Een lantaarn aan een paaltje (een straatlamp vanaf de Industriële tijd). 's Avonds gaat het licht aan. */
function lamp(g: T3.Object3D, x: number, z: number, era: Era): void {
  const pole = era === 'wood' ? C.woodd : '#2e3236',
    h = era === 'wood' || era === 'brick' ? 0.42 : 0.6;
  cy(g, 0.018, h, pole, x, 0.03, z, 6);
  bx(g, 0.08, 0.1, 0.08, WIN, x, h, z);
  bx(g, 0.1, 0.025, 0.1, pole, x, h + 0.1, z);
}

/** Een boompje of struik in een vrije hoek. */
function tree(g: T3.Object3D, x: number, z: number, era: Era): void {
  if (era === 'glass') {
    bx(g, 0.2, 0.1, 0.2, C.white, x, 0.03, z);
    sp(g, 0.12, LEAF, x, 0.24, z, 1);
    return;
  }
  cy(g, 0.03, 0.24, C.woodd, x, 0.03, z, 6);
  sp(g, 0.14, LEAF, x, 0.34, z, 0, 1.1);
  if (detail) sp(g, 0.09, LEAF_DARK, x + 0.06, 0.25, z + 0.04);
}

/** Een dakkapel op een schuin dakvlak: blokje met een raam en een eigen puntdakje. */
function dormer(
  g: T3.Object3D,
  x: number,
  y: number,
  z: number,
  wall: string,
  roof: string,
  side: boolean,
): void {
  const w = 0.2,
    h = 0.16;
  bx(g, w, h, w, wall, x, y, z);
  if (side) {
    bx(g, 0.012, 0.09, 0.1, WIN, x + w / 2 + 0.004, y + 0.04, z);
    gr(g, w + 0.06, 0.1, w + 0.06, roof, x, y + h, z);
  } else {
    bx(g, 0.1, 0.09, 0.012, WIN, x, y + 0.04, z + w / 2 + 0.004);
    gr(g, w + 0.06, 0.1, w + 0.06, roof, x, y + h, z, Math.PI / 2);
  }
}

/** Planten op balkons en terrassen van de hoge huizen (die hebben geen ramen voor een bloembak). */
function greenery(g: T3.Object3D, type: string, sy: number): void {
  if (type === 'apartment')
    for (let i = 1; i < 6; i += 2) {
      const y = (0.14 + i * 0.28) * sy + 0.03;
      sp(g, 0.05, LEAF, 0.1, y + 0.04, 0.49);
      sp(g, 0.03, FLOWERS[i % 4], 0.28, y + 0.05, 0.5);
    }
  else if (type === 'arcology')
    for (let i = 0; i < 3; i++) {
      const edge = (1.7 - i * 0.34) / 2 - 0.07,
        y = (i + 1) * 0.6 * sy + 0.06;
      for (const u of [-0.35, 0, 0.35]) {
        sp(g, 0.04, FLOWERS[(i + Math.round(u * 4) + 4) % 4], u * (1 - i * 0.2), y, edge);
        sp(g, 0.04, FLOWERS[(i + 1) % 4], edge, y, u * (1 - i * 0.2));
      }
    }
}

/**
 * Net in het grove model (ver weg, of op Laag): een paar grote, bonte blokjes in plaats van losse bloemen en
 * paaltjes. Anders zie je van ver geen verschil tussen Eenvoudig en Net, de trede die de meeste huizen hebben.
 */
function coarseNeat(g: T3.Object3D, type: string, s: HomeShape, era: Era, sy: number): void {
  s.boxes.forEach(([x, y], k) => {
    const c = BRIGHT[(k + type.length) % BRIGHT.length];
    if (y === 0) bx(g, 0.14, 0.16, 0.14, c, x, 0.03, s.front + 0.04);
    else {
      bx(g, 0.24, 0.06, 0.08, LEAF_DARK, x, y * sy, s.front + 0.04);
      bx(g, 0.22, 0.05, 0.07, c, x, y * sy + 0.06, s.front + 0.045);
    }
  });
  // Het hekje of de haag als één blok per stuk (grachtenpaaltjes als losse blokjes)
  const pts = s.fence;
  if (type === 'canalhouse') for (const [x, z] of pts) bx(g, 0.05, 0.22, 0.05, '#4a2a22', x, 0.03, z);
  else
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i],
        [x1, z1] = pts[i + 1],
        c = era === 'wood' ? C.wood : era === 'iron' ? C.dmetal : LEAF_DARK;
      bx(
        g,
        0.07,
        era === 'wood' || era === 'iron' ? 0.16 : 0.15,
        Math.hypot(x1 - x0, z1 - z0) + 0.05,
        c,
        (x0 + x1) / 2,
        0.03,
        (z0 + z1) / 2,
        Math.atan2(x1 - x0, z1 - z0),
      );
    }
  // Groen op de balkons en terrassen van de hoge huizen: één strook per balkon
  if (type === 'apartment')
    for (let i = 1; i < 6; i += 2) bx(g, 0.3, 0.07, 0.05, LEAF, 0.18, (0.14 + i * 0.28) * sy + 0.05, 0.49);
  else if (type === 'arcology')
    for (let i = 0; i < 3; i++) {
      const edge = (1.7 - i * 0.34) / 2 - 0.07,
        len = (1.7 - i * 0.34) * 0.8,
        y = (i + 1) * 0.6 * sy + 0.04;
      bx(g, len, 0.07, 0.07, i % 2 ? FLOWERS[0] : LEAF, 0, y, edge);
      bx(g, 0.07, 0.07, len, i % 2 ? FLOWERS[0] : LEAF, edge, y, 0);
    }
}

/** Aanbouw (welvarend): per huis een eigen soort, ook in de grove versie zodat je het van ver ziet. */
function annex(g: T3.Object3D, type: string, s: HomeShape, sy: number): void {
  switch (type) {
    case 'hut': {
      // Een rond voorraadhutje naast de hut
      cy(g, 0.13, 0.26, s.wall, -0.3, 0, 0.3, 8);
      cn(g, 0.18, 0.2, s.roof, -0.3, 0.25, 0.3, 8);
      break;
    }
    case 'house':
    case 'stonehouse': {
      // Een veranda over de deur: twee palen en een schuin afdakje
      const z = s.front + 0.15,
        y = s.eave * sy * 0.72;
      for (const x of [-0.36, 0.02]) bx(g, 0.035, y, 0.035, C.woodd, x, 0, z);
      const roof = mk(GB, mat(s.roof), g, -0.17, y, s.front + 0.08, 0.46, 0.035, 0.22);
      roof.rotation.x = 0.35;
      break;
    }
    case 'canalhouse': {
      // Een aanbouw aan de zijkant, met een eigen raam en een schuin dakje
      const h = 0.85 * sy;
      bx(g, 0.17, h, 0.58, s.wall, 0.37, 0, -0.12);
      bx(g, 0.012, 0.17, 0.12, WIN, 0.457, h * 0.45, 0.02);
      const roof = mk(GB, mat(s.roof), g, 0.37, h, -0.12, 0.22, 0.04, 0.64);
      roof.rotation.z = -0.35;
      break;
    }
    case 'rowhouse': {
      // Een erker: een uitbouw met grote ramen in het midden van de gevel
      bx(g, 0.3, 0.56 * sy, 0.13, s.wall, 0, 0, s.front + 0.06);
      bx(g, 0.22, 0.24 * sy, 0.012, WIN, 0, 0.22 * sy, s.front + 0.13);
      bx(g, 0.34, 0.035, 0.17, '#3e4652', 0, 0.56 * sy, s.front + 0.06);
      break;
    }
    case 'apartment': {
      // Een penthouse: een extra (kleinere) verdieping bovenop, in de kleur van de gevel met een glazen band
      // en een donkere dakrand (zoals de extra laag van de arcologie), zodat hij bij het huis hoort
      const y = s.eave * sy;
      bx(g, 0.5, 0.34, 0.46, s.wall, -0.14, y, 0.12);
      bx(g, 0.52, 0.16, 0.48, GLASS, -0.14, y + 0.1, 0.12);
      bx(g, 0.56, 0.04, 0.52, '#4a4f57', -0.14, y + 0.34, 0.12);
      bx(g, 0.48, 0.02, 0.44, s.roof, -0.14, y + 0.375, 0.12);
      break;
    }
    case 'towerblock': {
      // Een glazen paviljoen (een café) aan de voet van de toren
      bx(g, 0.3, 0.42, 0.95, s.wall, 0.8, 0, 0.05);
      bx(g, 0.32, 0.22, 0.97, GLASS, 0.8, 0.1, 0.05);
      bx(g, 0.36, 0.04, 1.0, C.white, 0.8, 0.42, 0.05);
      break;
    }
    case 'arcology': {
      // Een extra woonlaag bovenop, met een glazen band
      const y = s.eave * sy;
      bx(g, 0.44, 0.36, 0.44, s.wall, 0, y, 0);
      bx(g, 0.46, 0.14, 0.46, GLASS, 0, y + 0.13, 0);
      bx(g, 0.4, 0.04, 0.4, s.roof, 0, y + 0.36, 0);
      break;
    }
  }
}

/** Iets bijzonders op het dak (prachtig): dakkapel, dakterras, antenne of glazen koepel, per bouwstijl. */
function rooftop(g: T3.Object3D, type: string, s: HomeShape, sy: number): void {
  switch (type) {
    case 'hut': {
      // Een hoge paal met een wimpel bovenop het rieten dak, en een geverfde rand onder het riet
      cy(g, 0.02, 0.4, C.woodd, 0, 0.9 * sy, 0, 5);
      bx(g, 0.22, 0.12, 0.012, '#c0453a', 0.11, 0.9 * sy + 0.25, 0);
      sp(g, 0.035, C.bronze, 0, 0.9 * sy + 0.41, 0);
      cy(g, 0.485, 0.03, '#9c4a36', 0, 0.4 * sy + 0.015, 0, 8);
      // Een slinger van gekleurde kralen langs de dakrand (alleen dichtbij)
      if (detail)
        for (let k = 0; k < 8; k++) {
          const a = ((k + 0.5) / 8) * Math.PI * 2;
          sp(g, 0.03, FLOWERS[k % 4], Math.sin(a) * 0.49, 0.4 * sy + 0.01, Math.cos(a) * 0.49);
        }
      break;
    }
    case 'house':
      dormer(g, -0.1, 0.57 * sy, 0.17, s.wall, s.roof, false);
      break;
    case 'stonehouse':
      dormer(g, -0.12, 0.72 * sy, 0.2, s.wall, s.roof, false);
      break;
    case 'canalhouse': {
      dormer(g, 0.12, 1.55 * sy, -0.18, s.wall, s.roof, true);
      // Een gouden windvaan bovenop de trapgevel
      cy(g, 0.012, 0.22, C.dmetal, 0, 2.0 * sy, 0.29, 4);
      bx(g, 0.16, 0.04, 0.012, '#d9a640', 0.03, 2.0 * sy + 0.17, 0.29);
      break;
    }
    case 'rowhouse':
      for (const x of [-0.17, 0.17]) dormer(g, x, 0.88 * sy, 0.19, s.wall, s.roof, false);
      break;
    case 'apartment': {
      // Dakterras met een reling, planten en een parasol, en een antenne
      const y = s.eave * sy + 0.04,
        half = 0.42;
      for (const [x, z, w, d] of [
        [0, half, 0.84, 0.02],
        [half, 0, 0.02, 0.84],
        [0, -half, 0.84, 0.02],
        [-half, 0, 0.02, 0.84],
      ])
        bx(g, w, 0.02, d, C.dmetal, x, y + 0.12, z);
      bx(g, 0.28, 0.03, 0.8, '#6fae58', 0.27, y - 0.04, 0); // daktuin
      cy(g, 0.012, 0.3, C.dmetal, 0.25, y, 0.28, 4);
      cn(g, 0.17, 0.08, '#e2574c', 0.25, y + 0.28, 0.28, 8);
      for (const [x, z] of [
        [0.33, -0.05],
        [0.12, 0.34],
      ])
        sp(g, 0.07, LEAF, x, y + 0.05, z);
      cy(g, 0.012, 0.45, C.metal, 0.3, y, -0.3, 4);
      bx(g, 0.2, 0.015, 0.015, C.metal, 0.3, y + 0.38, -0.3);
      break;
    }
    case 'towerblock': {
      // Een glazen koepel met een gloeiende ring, en een daktuin
      const y = s.eave * sy + 0.1;
      sp(g, 0.34, GLASS, -0.15, y, -0.12, 1, 0.75);
      mk(gTorus(0.35, 0.025, 4, 24), CYANM, g, -0.15, y + 0.02, -0.12, 1, 1, 1).rotation.x = Math.PI / 2;
      for (const [x, z] of [
        [0.38, 0.35],
        [0.42, -0.3],
      ])
        sp(g, 0.13, LEAF, x, y + 0.06, z, 0, 0.8);
      break;
    }
    case 'arcology': {
      // Een glazen koepel op de bovenste laag, met een paarse ring
      const y = s.eave * sy + 0.4;
      sp(g, 0.24, GLASS, 0, y, 0, 1, 0.8);
      mk(gTorus(0.24, 0.02, 4, 24), VIOLETM, g, 0, y + 0.02, 0, 1, 1, 1).rotation.x = Math.PI / 2;
      break;
    }
  }
}

/** Verval: gat in het dak (of vlekken op de gevel), een losse plank, onkruid en een dichtgetimmerd raam. */
function decay(g: T3.Object3D, type: string, s: HomeShape, sy: number, size: number): void {
  if (s.patch) {
    // Een rafelig gat: een donkere plek met een scheve, nog donkerdere kern
    slab(g, 0.24, 0.17, ROT, s.patch, sy);
    if (detail) {
      slab(g, 0.12, 0.08, '#3a3129', { ...s.patch, face: s.patch.face + 0.35 }, sy);
      slab(g, 0.08, 0.1, '#5b4c38', { ...s.patch, x: s.patch.x * 1.1, face: s.patch.face - 0.5 }, sy);
    }
  } else {
    // Plat dak: donkere strepen van vocht op de voorgevel
    const h = (s.wallH ?? s.eave) * sy;
    for (const x of [-0.18, 0.12, 0.3])
      bx(g, 0.07, h * 0.55, 0.01, '#5e5a52', x * size, h * 0.35, s.front + 0.013);
  }
  if (!detail) return;
  if (s.board) {
    const [x, y] = s.board;
    for (const r of [0.6, -0.6]) {
      const o = bx(g, 0.2, 0.03, 0.015, '#7a6448', x, y * sy - 0.015, s.front + 0.03);
      o.rotation.z = r;
    }
  }
  // Een losse plank tegen de rechtermuur
  const plank = bx(g, 0.05, 0.4, 0.02, '#6f5b40', Math.min(s.side + 0.05, size * 0.46), 0.02, 0.05 * size);
  plank.rotation.set(0, 0, 0.28);
  // Onkruid langs de muren
  const half = size * 0.44;
  for (const [x, z] of [
    [s.side + 0.06, -0.15 * size],
    [-half * 0.7, s.front + 0.07],
    [half * 0.9, half * 0.85],
  ])
    cn(g, 0.06, 0.12, WEED, Math.min(half, x), 0.03, Math.min(half, z), 5);
  if (type === 'hut') sp(g, 0.05, '#7a6448', -0.32, 0.05, 0.28, 0, 0.5); // omgevallen stok
}

/**
 * Wat er bij een huis bij komt per welvaart. 0: grauw, gat in het dak, onkruid. 2: bloembakken en een hekje.
 * 3: een aanbouw (of extra verdieping) en een boompje. 4: iets bijzonders op het dak en een lantaarn. Kleine
 * dingen alleen in het fijne model; de aanbouw en het dak ook in het grove, zodat je het van ver ziet.
 */
export function homeExtras(g: T3.Group, type: string, grade: number, size: number): void {
  const s = SHAPES[type];
  if (!s) return;
  const sy = gradeScale(grade);
  stretch(g, sy, grade >= 4 ? 1.03 : 1);
  const era = eraOf(B[type].age);
  if (grade <= 0) {
    weather(g);
    decay(g, type, s, sy, size);
    return;
  }
  if (grade >= 2 && detail) {
    s.boxes.forEach(([x, y], k) => flowerBox(g, x, y * sy, s.front, era, k + type.length));
    fence(g, s.fence, era, type);
    greenery(g, type, sy);
  } else if (grade >= 2) coarseNeat(g, type, s, era, sy);
  if (grade >= 3) {
    annex(g, type, s, sy);
    if (s.tree && detail) tree(g, s.tree[0], s.tree[1], era);
  }
  if (grade >= 4) {
    rooftop(g, type, s, sy);
    if (detail) lamp(g, s.lamp[0], s.lamp[1], era);
  }
}
