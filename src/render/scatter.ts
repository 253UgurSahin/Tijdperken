// Kleine dingen op de grond rond de camera: grasplukjes, bloemetjes en steentjes.
// Alleen dichtbij (verder weg zie je ze toch niet) en alleen op middel/hoog.
import * as T3 from 'three';
import { H, TAU, W } from '../config';
import { G } from '../game/state';
import { hash2 } from '../util/random';
import { camDist, s2t } from './camera';
import { WIND } from './nodes';
import { S3, VH, VW, cam } from './scene';
import { groundVersion } from './terrainlook';
import { BIOME, TER, biome, bmap, ground, node, road, ter } from '../world/world';
import { settled } from '../game/rivals';
import { SNOW_COVER, WIND_GUST } from './weather';

// Ligt er water direct naast deze tegel (boven, onder, links of rechts)?
function nextToWater(x: number, y: number): boolean {
  return (
    (x > 0 && ter[y * W + x - 1] === TER.WATER) ||
    (x < W - 1 && ter[y * W + x + 1] === TER.WATER) ||
    (y > 0 && ter[(y - 1) * W + x] === TER.WATER) ||
    (y < H - 1 && ter[(y + 1) * W + x] === TER.WATER)
  );
}

// Een plukje gras: een paar smalle sprieten in een waaier, onderaan donker en bovenaan licht.
// De normalen wijzen omhoog, zodat het gras even licht is als de grond eronder.
function tuftGeometry() {
  const pos = [],
    col = [],
    blades = 7;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * TAU + hash2(b, 3, 1) * 0.8,
      lean = 0.25 + hash2(b, 4, 1) * 0.5,
      h = 0.1 + hash2(b, 5, 1) * 0.1,
      w = 0.018,
      ox = Math.cos(a) * 0.035,
      oz = Math.sin(a) * 0.035;
    // Twee hoekpunten onderaan (dwars op de richting) en één punt bovenaan, naar buiten gebogen
    const sx = -Math.sin(a) * w,
      sz = Math.cos(a) * w;
    pos.push(
      ox - sx,
      0,
      oz - sz,
      ox + sx,
      0,
      oz + sz,
      ox + Math.cos(a) * h * lean,
      h,
      oz + Math.sin(a) * h * lean,
    );
    col.push(0.78, 0.78, 0.74, 0.78, 0.78, 0.74, 1.2, 1.22, 1.05);
  }
  const g = new T3.BufferGeometry();
  g.setAttribute('position', new T3.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new T3.Float32BufferAttribute(col, 3));
  g.setAttribute(
    'normal',
    new T3.Float32BufferAttribute(
      pos.map((_v, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  return g;
}
// Bloemetje: drie kleine blaadjes op een steeltje
function flowerGeometry() {
  const g = new T3.OctahedronGeometry(0.028, 0);
  g.scale(1, 0.55, 1);
  g.translate(0, 0.13, 0);
  return g;
}
function pebbleGeometry() {
  // Een platgedrukte achtvlak: van bovenaf een steentje, en maar 8 driehoekjes
  const g = new T3.OctahedronGeometry(0.05, 0);
  g.rotateY(0.4);
  g.scale(1, 0.45, 0.8);
  g.translate(0, 0.012, 0);
  return g;
}

// Gras wiegt mee met de wind (met vlagen), net als de bomen (zie nodes.ts). In de winter zakt het weg in de
// sneeuw: hoe meer sneeuw, hoe korter de sprieten (dan steken alleen de stroachtige puntjes er nog uit).
function swaying(m: T3.MeshLambertMaterial): T3.MeshLambertMaterial {
  m.onBeforeCompile = shader => {
    shader.uniforms.uWind = WIND;
    shader.uniforms.uSnow = SNOW_COVER;
    // Achterkant van een spriet niet donker maken: beide kanten krijgen licht van boven
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      T3.ShaderChunk.normal_fragment_begin.replace('normal = normal * faceDirection;', ''),
    );
    shader.vertexShader =
      'uniform float uWind;\nuniform float uSnow;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        float sink = 1.0 - uSnow * 0.8;
        transformed.y *= sink;
        float sway = (sin(uWind * 2.1 + ip.x * 0.9 + ip.z * 1.1) * 0.25 + sin(uWind * 4.3 + ip.x * 2.3) * 0.08) * ${WIND_GUST};
        transformed.x += sway * position.y * sink;
        transformed.z += sway * position.y * 0.5 * sink;`,
      );
  };
  m.customProgramCacheKey = () => 'grass-wind';
  return m;
}
const TUFT_MAT = swaying(new T3.MeshLambertMaterial({ vertexColors: true, side: T3.DoubleSide }));
const FLOWER_MAT = swaying(new T3.MeshLambertMaterial({ color: '#ffffff' }));
const PEBBLE_MAT = new T3.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.9 });

// Hoeveel van elk per tegel, per landschap
const PER_TILE: Record<number, Record<string, number>> = {
  [BIOME.GRASS]: { tuft: 6, flower: 0.9, pebble: 0.25 },
  [BIOME.FOREST]: { tuft: 3.5, flower: 0.25, pebble: 0.3 },
  [BIOME.HILLS]: { tuft: 4, flower: 0.4, pebble: 1.1 },
  [BIOME.BEACH]: { tuft: 0.3, flower: 0, pebble: 0.6 },
  [BIOME.DESERT]: { tuft: 0.25, flower: 0, pebble: 0.7 },
  [BIOME.SALT]: { tuft: 0, flower: 0, pebble: 0.3 },
  [BIOME.MOUNTAIN]: { tuft: 1, flower: 0.1, pebble: 1.5 },
};
const FLOWER_COLORS = ['#f4f0e6', '#f2d24a', '#b48ae0', '#e8606a', '#f29a3a'].map(c => new T3.Color(c));
// (bloemen: ruim genoeg voor de lente, met bijna twee keer zoveel; anders blijft er onderaan een strook leeg,
// want het strooisel wordt rij voor rij neergezet)
const MAX: Record<string, number> = { tuft: 14000, flower: 5000, pebble: 3500 };
const KINDS: Record<string, T3.InstancedMesh> = {
  tuft: new T3.InstancedMesh(tuftGeometry(), TUFT_MAT, MAX.tuft),
  flower: new T3.InstancedMesh(flowerGeometry(), FLOWER_MAT, MAX.flower),
  pebble: new T3.InstancedMesh(pebbleGeometry(), PEBBLE_MAT, MAX.pebble),
};
for (const m of Object.values(KINDS)) {
  m.count = 0;
  m.castShadow = false;
  m.receiveShadow = true;
  m.frustumCulled = false;
  m.instanceMatrix.setUsage(T3.DynamicDrawUsage);
  m.visible = false;
  S3.add(m);
}

let density = 0;
/** Hoeveel strooisel er mag zijn: 0 = niets (laag), 0.5 = half (middel), 1 = alles (hoog). */
export function setScatterDensity(d: number) {
  density = d || 0;
  placed.r = -1; // opnieuw neerzetten
  for (const m of Object.values(KINDS)) m.visible = density > 0;
}

// Het seizoen (zie seasons.ts): een kleurfilter over het gras, hoe strogeel de plukjes zijn (winter) en hoeveel
// bloemetjes er staan (lente meer, winter geen).
let flowersOn = true,
  flowerAmount = 1,
  straw = 0;
const STRAW = new T3.Color(0.55, 0.5, 0.38);
/**
 * Zet het seizoen van het strooisel. `tint` kleurt het gras (gratis, elk beeldje), `strawAmount` (0..1) maakt de
 * plukjes strogeel en `flowers` is hoeveel bloemetjes er staan (1 = gewoon, 0 = geen). Die twee zitten in de kleur
 * en het aantal per plukje: als ze veranderen, wordt het strooisel opnieuw neergezet. Daarom in stapjes.
 */
export function setScatterLook(tint: T3.Color, strawAmount: number, flowers: number): void {
  TUFT_MAT.color.copy(tint);
  const s = Math.round(strawAmount * 12) / 12;
  if (s === straw && flowers === flowerAmount) return;
  straw = s;
  flowerAmount = flowers;
  flowersOn = flowers > 0;
  placed.r = -1; // opnieuw neerzetten, met de nieuwe kleuren en het nieuwe aantal bloemen
}
// Oude manier, alleen nog voor applySeason in lighting.ts (die verdwijnt bij het samenvoegen: dan dit ook)
const OLD_TINT: Record<string, string> = { Zomer: '#f4f0d8', Herfst: '#e8cf8a' };
export function setScatterSeason(name: string) {
  setScatterLook(
    new T3.Color(OLD_TINT[name] || '#ffffff'),
    name === 'Winter' ? 1 : 0,
    name === 'Winter' ? 0 : 1,
  );
}

const placed = { x: 0, y: 0, r: -1, version: -1, age: -1 };
const _m = new T3.Matrix4(),
  _q = new T3.Quaternion(),
  _p = new T3.Vector3(),
  _s = new T3.Vector3(),
  _up = new T3.Vector3(0, 1, 0),
  _c = new T3.Color(),
  _straw = new T3.Color();

// De vier hoeken van het beeld, als deel van de breedte en de hoogte
const CORNERS: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
/** Elk beeldje: als de camera een eind verschoven of gezoomd is, het strooisel opnieuw neerzetten. */
export function updateScatter() {
  if (!density) return;
  // Tot de verste hoek van het beeld op de grond: een gekantelde camera kijkt ver vooruit, ook op een breed
  // scherm. Ver uitgezoomd: minder dicht (zie thin); nog verder: helemaal niets.
  let R = 0;
  for (const [sx, sy] of CORNERS) {
    const [x, y] = s2t(sx * VW, sy * VH);
    R = Math.max(R, Math.hypot(x - cam.x, y - cam.y));
  }
  R = Math.min(28, R);
  const d = camDist(),
    visible = d < 40;
  for (const m of Object.values(KINDS)) m.visible = visible && (m !== KINDS.flower || flowersOn);
  if (!visible) return;
  const moved = Math.hypot(cam.x - placed.x, cam.y - placed.y);
  if (
    moved < R * 0.2 &&
    Math.abs(R - placed.r) < R * 0.15 &&
    placed.version === groundVersion &&
    placed.age === G.age
  )
    return;
  placed.x = cam.x;
  placed.y = cam.y;
  placed.r = R;
  placed.version = groundVersion;
  placed.age = G.age;
  const thin = density * Math.min(1, 30 / d),
    n: Record<string, number> = { tuft: 0, flower: 0, pebble: 0 },
    x0 = Math.max(0, Math.floor(cam.x - R)),
    x1 = Math.min(W - 1, Math.ceil(cam.x + R)),
    y0 = Math.max(0, Math.floor(cam.y - R)),
    y1 = Math.min(H - 1, Math.ceil(cam.y + R));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dist = Math.hypot(x + 0.5 - cam.x, y + 0.5 - cam.y);
      if (dist > R) continue;
      const i = y * W + x,
        t = ter[i];
      if (t === TER.WATER || bmap[i] || road[i]) continue;
      // Naast water ligt het wateroppervlak deels over de tegel: daar geen gras, anders steekt het uit het water
      if (nextToWater(x, y)) continue;
      const per = PER_TILE[biome[i]];
      if (!per) continue;
      // Rand van het gebied: kleiner, zodat er geen harde grens te zien is
      const edge = Math.min(1, (R - dist) / (R * 0.25)),
        locked = !settled(x, y),
        busy = node[i] ? 0.5 : 1; // rond een boom of rots wat minder
      for (const kind of ['tuft', 'flower', 'pebble']) {
        let want = per[kind] * thin * busy;
        if (kind === 'tuft' && t === TER.ROCK) want *= 0.3;
        // In de winter ligt de helft onder de sneeuw: dan steken er maar een paar sprieten uit
        if (kind === 'tuft') want *= 1 - 0.5 * straw;
        if (kind === 'flower') want *= flowerAmount;
        let k = 0;
        for (; want > 0; want--, k++) {
          if (want < 1 && hash2(x, y, 101 + k) > want) break;
          if (n[kind] >= MAX[kind]) break;
          const h1 = hash2(x * 7 + k, y, 111),
            h2 = hash2(x, y * 7 + k, 112),
            h3 = hash2(x + k, y + k * 3, 113);
          _p.set(x + h1, 0, y + h2);
          _q.setFromAxisAngle(_up, h3 * TAU);
          const sc = (0.7 + h3 * 0.6) * edge;
          _s.set(sc, sc * (0.8 + h1 * 0.5), sc);
          _m.compose(_p, _q, _s);
          const m = KINDS[kind];
          m.setMatrixAt(n[kind], _m);
          // Kleur: gras en steentjes nemen de kleur van de grond eronder over, bloemen hebben eigen kleuren
          const g = i * 3;
          if (kind === 'flower') _c.copy(FLOWER_COLORS[(h1 * FLOWER_COLORS.length) | 0]);
          else if (kind === 'tuft') {
            _c.setRGB((ground[g] / 255) * 1.1, (ground[g + 1] / 255) * 1.12, (ground[g + 2] / 255) * 0.95);
            // Winter: dof strogele plukjes (elk net iets anders), die hier en daar uit de sneeuw steken
            if (straw) _c.lerp(_straw.copy(STRAW).multiplyScalar(0.9 + h2 * 0.2), straw);
          } else {
            const grey = 0.55 + h2 * 0.35;
            _c.setRGB(grey * 1.02, grey * 0.98, grey * 0.92);
          }
          if (locked) _c.multiplyScalar(0.72);
          m.setColorAt(n[kind], _c);
          n[kind]++;
        }
      }
    }
  for (const kind in KINDS) {
    const m = KINDS[kind];
    m.count = n[kind];
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}
