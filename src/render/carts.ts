// Tekent alle karren in een paar InstancedMeshes, en de voorraadkratten bij opslag en fabrieken.
import * as T3 from 'three';
import { store } from '../core/store';
import { B } from '../data/buildings';
import { CART_CAP, CART_LOAD, LANE_OFFSET, cartKindFor, pointOnRoute, type CartKind } from '../data/carts';
import { RES } from '../data/resources';
import { carts, owedOutput, type Cart } from '../game/carts';
import { G } from '../game/state';
import { camDist } from './camera';
import { C, bx, cn, cy, mergeWhole, sp } from './kit';
import { makeVillager, type Limbs } from './people';
import { S3, sun } from './scene';
import { H, W } from '../config';
import { TER, bmap, node, road, ter } from '../world/world';
import { ringTiles } from '../data/roads';

// Zo ver uitgezoomd worden figuurtjes stippen (gelijk aan DOT_DIST in sync.ts): karren tekenen we dan niet meer
const CART_HIDE_DIST = 27 / 0.22;
// Zo hoog vliegen drones (tegels), en zo vaak per seconde zetten we de voorraadkratten opnieuw neer
const DRONE_HEIGHT = 1.4,
  STOCK_EVERY = 0.5,
  STOCK_CAP = 400;

// ---------- de modellen (één keer gemaakt, daarna als één vorm met kleuren per hoekpunt) ----------

// Een wiel dwars op de rijrichting (de cilinder ligt langs x)
function wheel(g: T3.Object3D, r: number, x: number, y: number, z: number, c: string) {
  const w = cy(g, r, 0.035, c, 0, y, z, 10);
  w.rotation.z = Math.PI / 2;
  w.position.x = x + (x > 0 ? 0.035 : 0);
}
// Een drager met een mand op het hoofd; step = 1 of -1 zet de benen in een andere pas (twee houdingen om te lopen)
function porterModel(step: number): T3.Group {
  const g = makeVillager('auto');
  const limbs = g.userData.limbs as Limbs; // (makeVillager zet altijd armen en benen)
  limbs.lL.rotation.x = 0.45 * step;
  limbs.lR.rotation.x = -0.45 * step;
  // De rechterhand houdt de mand vast, de linker zwaait mee met de pas
  limbs.aR.rotation.z = 2.6;
  limbs.aL.rotation.x = -0.35 * step;
  // De mand zelf: een open kom van riet (de lading ligt erin, met de kleur van de grondstof)
  cy(g, 0.11, 0.08, C.thatch, 0, 0.62, 0, 9, 0.14);
  // In een lege groep: mergeWhole neemt dan de schaal van de dorpeling mee (die zit op g zelf)
  const outer = new T3.Group();
  outer.add(g);
  return outer;
}
// Een os (lijf, vier poten, kop met hoorns): breder en zwaarder dan een paard
function ox(g: T3.Object3D, z: number) {
  const hide = '#7a5536',
    dark = '#4a3222';
  bx(g, 0.2, 0.18, 0.4, hide, 0, 0.16, z);
  for (const [x, dz] of [
    [-0.07, -0.14],
    [0.07, -0.14],
    [-0.07, 0.14],
    [0.07, 0.14],
  ])
    bx(g, 0.06, 0.17, 0.06, dark, x, 0, z + dz);
  bx(g, 0.12, 0.12, 0.12, hide, 0, 0.22, z + 0.24);
  bx(g, 0.08, 0.06, 0.05, '#c9a98a', 0, 0.22, z + 0.31); // snuit
  for (const s of [-1, 1]) {
    const h = cn(g, 0.016, 0.1, '#e8dcc0', s * 0.08, 0.31, z + 0.22, 5);
    h.rotation.z = -s * 1.1;
  }
  bx(g, 0.26, 0.04, 0.04, C.woodd, 0, 0.36, z + 0.16); // juk
}
// Een paard (net als bij de ridders, maar zonder zadel)
function horse(g: T3.Object3D, z: number) {
  const c = '#8a5a3a',
    cd = '#4a3022';
  bx(g, 0.15, 0.18, 0.42, c, 0, 0.24, z);
  for (const [x, dz] of [
    [-0.05, -0.15],
    [0.05, -0.15],
    [-0.05, 0.15],
    [0.05, 0.15],
  ])
    bx(g, 0.045, 0.25, 0.045, cd, x, 0, z + dz);
  bx(g, 0.08, 0.18, 0.1, c, 0, 0.36, z + 0.21);
  bx(g, 0.03, 0.12, 0.08, cd, 0, 0.4, z + 0.15);
  bx(g, 0.03, 0.14, 0.04, cd, 0, 0.2, z - 0.23);
}
function oxcartModel(): T3.Group {
  const g = new T3.Group();
  ox(g, 0.2);
  // Twee wielen onder een open bak, met een dissel naar de os
  bx(g, 0.26, 0.06, 0.36, C.wood, 0, 0.14, -0.22);
  for (const x of [-0.13, 0.13]) bx(g, 0.02, 0.07, 0.36, C.woodd, x, 0.2, -0.22);
  bx(g, 0.03, 0.03, 0.28, C.woodd, 0, 0.15, 0.04);
  for (const x of [-0.15, 0.15]) wheel(g, 0.11, x, 0.11, -0.22, C.woodd);
  return g;
}
function wagonModel(): T3.Group {
  const g = new T3.Group();
  horse(g, 0.3);
  // Vier wielen, een lange bak en een bok voor de voerman
  bx(g, 0.26, 0.07, 0.5, '#7b5a3c', 0, 0.16, -0.2);
  for (const x of [-0.13, 0.13]) bx(g, 0.02, 0.08, 0.5, '#5a3e28', x, 0.23, -0.2);
  bx(g, 0.24, 0.1, 0.06, '#5a3e28', 0, 0.23, 0.06);
  for (const z of [-0.38, -0.04]) for (const x of [-0.15, 0.15]) wheel(g, 0.09, x, 0.09, z, '#3a2a1c');
  bx(g, 0.03, 0.03, 0.2, '#5a3e28', 0, 0.18, 0.12);
  return g;
}
function truckModel(): T3.Group {
  const g = new T3.Group();
  const paintCol = '#c4452f',
    tyre = '#26282b';
  bx(g, 0.26, 0.04, 0.66, '#3a3d42', 0, 0.07, 0); // chassis
  bx(g, 0.26, 0.2, 0.2, paintCol, 0, 0.11, 0.22); // cabine
  bx(g, 0.24, 0.08, 0.02, '#9fc6dd', 0, 0.22, 0.32); // voorruit
  bx(g, 0.27, 0.03, 0.08, '#d8d8d0', 0, 0.12, 0.32); // bumper en lampen
  bx(g, 0.27, 0.05, 0.42, '#6d7378', 0, 0.11, -0.1); // laadbak
  for (const x of [-0.13, 0.13]) bx(g, 0.02, 0.08, 0.42, '#6d7378', x, 0.16, -0.1);
  for (const z of [-0.22, 0.2]) for (const x of [-0.15, 0.15]) wheel(g, 0.065, x, 0.065, z, tyre);
  return g;
}
function droneModel(): T3.Group {
  const g = new T3.Group();
  bx(g, 0.16, 0.06, 0.16, '#e9ecee', 0, 0, 0);
  bx(g, 0.1, 0.03, 0.1, '#2fa8d8', 0, 0.06, 0); // bovenkant met licht
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    bx(g, 0.03, 0.02, 0.17, '#3a3d42', x * 0.07, 0.03, z * 0.07, Math.atan2(x, z));
    cy(g, 0.075, 0.012, '#4c5359', x * 0.14, 0.05, z * 0.14, 10);
    sp(g, 0.02, '#26282b', x * 0.14, 0.05, z * 0.14);
  }
  // De haak waar de krat onder hangt
  bx(g, 0.01, 0.1, 0.01, '#3a3d42', 0, -0.1, 0);
  return g;
}
// Een krat: wit met donkere randen; de kleur van de grondstof komt er per stuk overheen (instanceColor)
function crateModel(): T3.Group {
  const g = new T3.Group();
  bx(g, 1, 1, 1, '#f2f0ea', 0, 0, 0);
  for (const y of [0, 0.88]) {
    bx(g, 1.04, 0.12, 0.12, '#8a8a84', 0, y, -0.46);
    bx(g, 1.04, 0.12, 0.12, '#8a8a84', 0, y, 0.46);
    bx(g, 0.12, 0.12, 1.04, '#8a8a84', -0.46, y, 0);
    bx(g, 0.12, 0.12, 1.04, '#8a8a84', 0.46, y, 0);
  }
  return g;
}

/** Waar de lading ligt bij elk voertuig (vanuit het midden, voor = +z) en hoe groot de krat is. */
const CARGO: Record<CartKind, { y: number; z: number; sx: number; sy: number; sz: number }> = {
  porter: { y: 0.69 * 1.12, z: 0, sx: 0.17, sy: 0.08, sz: 0.17 },
  oxcart: { y: 0.2, z: -0.22, sx: 0.22, sy: 0.14, sz: 0.28 },
  wagon: { y: 0.23, z: -0.2, sx: 0.22, sy: 0.16, sz: 0.4 },
  truck: { y: 0.16, z: -0.1, sx: 0.22, sy: 0.18, sz: 0.36 },
  drone: { y: -0.28, z: 0, sx: 0.16, sy: 0.14, sz: 0.16 },
};

// ---------- de InstancedMeshes ----------

/** Eén lichaam per soort voertuig; de drager heeft er twee (twee standen van de benen, zodat hij loopt). */
interface BodyMesh {
  kind: CartKind;
  step: number;
  mesh: T3.InstancedMesh;
}
let bodies: BodyMesh[] = [],
  cargo: T3.InstancedMesh | null = null,
  stock: T3.InstancedMesh | null = null,
  stockAt = -1,
  shadowsOn = false;

// Van een los model één vorm met kleuren per hoekpunt maken, en die honderden keren tekenen
// Eigen materialen (kopieën van het gewone): three.js r149 kiest de shader per materiaal en kijkt daarbij niet
// of er een kleur per stuk is. Met één gedeeld materiaal zouden de kratten dus allemaal wit worden.
const materials = new Map<boolean, T3.Material>();
function instanced(model: T3.Group, cap: number, colour: boolean): T3.InstancedMesh {
  const merged = mergeWhole(model)!; // (elk model hierboven heeft meer dan twee delen)
  let material = materials.get(colour);
  if (!material) {
    material = (merged.material as T3.Material).clone();
    materials.set(colour, material);
  }
  const m = new T3.InstancedMesh(merged.geometry, material, cap);
  m.count = 0;
  m.visible = false;
  // De plekken veranderen elk beeldje: three.js hoeft niet te kijken of ze in beeld zijn
  m.frustumCulled = false;
  m.castShadow = false;
  m.receiveShadow = true;
  m.instanceMatrix.setUsage(T3.DynamicDrawUsage);
  if (colour) {
    m.instanceColor = new T3.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    m.instanceColor.setUsage(T3.DynamicDrawUsage);
  }
  S3.add(m);
  return m;
}
function build() {
  const cap = CART_CAP.high;
  bodies = [
    { kind: 'porter', step: 1, mesh: instanced(porterModel(1), cap, false) },
    { kind: 'porter', step: -1, mesh: instanced(porterModel(-1), cap, false) },
    { kind: 'oxcart', step: 0, mesh: instanced(oxcartModel(), cap, false) },
    { kind: 'wagon', step: 0, mesh: instanced(wagonModel(), cap, false) },
    { kind: 'truck', step: 0, mesh: instanced(truckModel(), cap, false) },
    { kind: 'drone', step: 0, mesh: instanced(droneModel(), cap, false) },
  ];
  cargo = instanced(crateModel(), cap, true);
  stock = instanced(crateModel(), STOCK_CAP, true);
}

const mtx = new T3.Matrix4(),
  local = new T3.Matrix4(),
  tmpCol = new T3.Color();

// De kleur van een grondstof (onbekend: hout)
const resColour = (res: string) => tmpCol.set(RES[res] ? RES[res].c : RES.wood.c);

// Welk lichaam deze kar krijgt: een drager wisselt van pas, de rest heeft er maar één
function bodyFor(c: Cart, d: number): BodyMesh {
  if (c.kind === 'porter') return bodies[Math.floor(d * 3.2) % 2 ? 0 : 1];
  return bodies.find(b => b.kind === c.kind)!; // (elke soort staat in de lijst)
}

/** Elk beeldje: alle karren neerzetten, en twee keer per seconde de voorraadkratten. */
export function syncCarts(): void {
  if (!bodies.length) build();
  const far = camDist() > CART_HIDE_DIST;
  // Schaduwen alleen als de zon schaduw geeft en niet op Middel: daar kost elke schaduw een extra tekenbeurt per
  // voertuigsoort (zo doen 'Hoog' en een eigen instelling met schaduwen ook karschaduwen)
  const shadows = sun.castShadow && store.quality !== 'mid' && store.quality !== 'low';
  if (shadows !== shadowsOn) {
    shadowsOn = shadows;
    for (const b of bodies) b.mesh.castShadow = shadows;
    cargo!.castShadow = stock!.castShadow = shadows;
  }
  for (const b of bodies) b.mesh.count = 0;
  let nCargo = 0;
  if (!far)
    for (const c of carts) {
      // Tussen de vorige en de huidige speltik in (zie store.alpha), voor vloeiende beweging
      const d = c.prevD + (c.d - c.prevD) * store.alpha;
      if (d < 0) continue; // wacht nog binnen tot de deur vrij is
      const p = pointOnRoute(c.route, d, c.fly ? 0 : LANE_OFFSET);
      let y = 0;
      if (c.fly) y = DRONE_HEIGHT + Math.sin(G.t * 2 + c.id) * 0.05;
      else if (c.kind === 'porter') y = Math.abs(Math.sin(d * 3.2 * Math.PI)) * 0.025;
      const body = bodyFor(c, Math.max(0, d)),
        m = body.mesh;
      mtx.makeRotationY(p.a);
      mtx.setPosition(p.x, y, p.y);
      m.setMatrixAt(m.count++, mtx);
      const o = CARGO[c.kind];
      local.makeScale(o.sx, o.sy, o.sz);
      local.setPosition(0, o.y, o.z);
      local.premultiply(mtx);
      cargo!.setMatrixAt(nCargo, local);
      cargo!.setColorAt(nCargo++, resColour(c.res));
    }
  for (const b of bodies) {
    b.mesh.visible = b.mesh.count > 0;
    if (b.mesh.visible) b.mesh.instanceMatrix.needsUpdate = true;
  }
  cargo!.count = nCargo;
  cargo!.visible = nCargo > 0;
  if (nCargo) {
    cargo!.instanceMatrix.needsUpdate = true;
    cargo!.instanceColor!.needsUpdate = true;
  }
  stock!.visible = !far && stock!.count > 0;
  if (!far && (store.TM - stockAt > STOCK_EVERY || store.TM < stockAt)) {
    stockAt = store.TM;
    placeStock();
  }
}

// Een stapel van n kratten (de bovenste kan kleiner zijn: fill 0..1) op de plek x, y van de kaart
function crateStack(n: number, x: number, y: number, res: string, size: number, topFill = 1): void {
  const s = stock!;
  resColour(res);
  for (let k = 0; k < n && s.count < STOCK_CAP; k++) {
    const h = k === n - 1 ? Math.max(0.25, topFill) : 1;
    // Elke krat een tikje gedraaid, zodat het een stapel lijkt en geen blok
    mtx.makeRotationY(((k * 7 + Math.floor(x * 3 + y * 5)) % 5) * 0.12 - 0.24);
    local.makeScale(size, size * h, size);
    mtx.multiply(local);
    mtx.setPosition(x, k * size, y);
    s.setMatrixAt(s.count, mtx);
    s.setColorAt(s.count++, tmpCol);
  }
}
// Hoeveel kratten bij deze voorraad: 1 vanaf een paar stuks, 2 vanaf 100, 3 vanaf 1000, 4 vanaf 10.000
const stackHeight = (amount: number) =>
  amount < 5 ? 0 : Math.max(1, Math.min(4, Math.floor(Math.log10(amount))));

// Vrije plekjes vlak naast een gebouw: eerst de hoeken (daar loopt zelden een weg), dan de zijkanten. Een plek ligt
// tegen het gebouw aan geschoven, zodat de kratten er duidelijk bij horen.
function freeSpots(x: number, y: number, size: number, want: number): [number, number][] {
  const out: [number, number][] = [];
  if (!want) return out;
  const isCorner = (i: number) => {
    const tx = i % W,
      ty = (i / W) | 0;
    return (tx < x || tx >= x + size) && (ty < y || ty >= y + size);
  };
  const ring = ringTiles(x, y, size, W, H);
  // Hoeken vooraan (verst naar onder en rechts) eerst: die staan het best in beeld
  const order = [...ring.filter(isCorner).reverse(), ...ring.filter(i => !isCorner(i)).reverse()];
  for (const i of order) {
    // Niet op een weg, gebouw of grondstof, en niet in het water of op een rots
    if (road[i] || bmap[i] || node[i] || ter[i] === TER.WATER || ter[i] === TER.ROCK) continue;
    const tx = i % W,
      ty = (i / W) | 0;
    const toward = (t: number, lo: number) => (t < lo ? 0.22 : t >= lo + size ? -0.22 : 0);
    out.push([tx + 0.5 + toward(tx, x), ty + 0.5 + toward(ty, y)]);
    if (out.length >= want) break;
  }
  return out;
}

/** De kratten bij opslag (wat je het meest hebt) en bij fabrieken (wat er klaarstaat voor de kar). */
function placeStock(): void {
  const s = stock!;
  s.count = 0;
  // De drie grondstoffen waar je het meest van hebt (de opslag toont wat het dorp heeft)
  const top = Object.keys(G.res)
    .filter(k => RES[k] && G.res[k] >= 5)
    .sort((p, q) => G.res[q] - G.res[p])
    .slice(0, 3);
  const load = CART_LOAD[cartKindFor(G.age)];
  for (const b of G.bs) {
    if (!b.done) continue;
    const d = B[b.type];
    if (d.drop) {
      // Naast het gebouw, op vrije hoeken van het erf: elke grondstof een eigen stapel
      const spots = freeSpots(b.x, b.y, d.size, top.length);
      top.forEach((k, i) => {
        if (spots[i]) crateStack(stackHeight(G.res[k]), spots[i][0], spots[i][1], k, 0.2);
      });
    } else if (d.conv) {
      // Wat de fabriek gemaakt heeft en nog niet is opgehaald: een stapel die groeit tot de kar komt
      const out = Object.keys(d.conv.out)[0],
        ready = owedOutput(b.id) + Math.min(1, b.ct / d.conv.t);
      // Een volle stapel (drie kratten) bij een halve kar of zes stuks: zo zie je hem ook bij een grote kar groeien
      const fill = Math.min(1, ready / Math.min(load, 6)) * 3,
        n = Math.ceil(fill),
        spot = freeSpots(b.x, b.y, d.size, 1)[0];
      if (out && n > 0 && spot) crateStack(n, spot[0], spot[1], out, 0.18, fill - (n - 1));
    }
  }
  s.visible = s.count > 0;
  if (s.count) {
    s.instanceMatrix.needsUpdate = true;
    s.instanceColor!.needsUpdate = true;
  }
}
