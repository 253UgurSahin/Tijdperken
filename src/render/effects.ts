// Projectielen, explosies en regen.
import type { Fx, Projectile } from '../types';
import * as T3 from 'three';
import { store } from '../core/store';
import { G } from '../game/state';
import { camDist, pxu } from './camera';
import { pool, ringAt } from './decals';
import { GB, gIco, mat } from './kit';
import { CAM3, R3, S3, cam } from './scene';
import { hash2 } from '../util/random';
import { meteorPosition } from '../game/meteors';
import { smoothPos } from './sync';
import { LAYER, SMOKE_LIGHT, emit, puff, updateSmokeLight } from './particles';
import { season } from '../game/time';

/** Een projectiel zoals het hier getekend wordt: sx, sy = waar het voor het eerst te zien was. */
type DrawnProjectile = Projectile & { sx?: number; sy?: number };
/** Een effect; seen3 = 1 zodra het voor het eerst getekend is (zie firstSight). */
type DrawnFx = Fx & { seen3?: number };

const sphM = () =>
  new T3.Mesh(gIco(0), new T3.MeshBasicMaterial({ color: '#fff', transparent: true, depthWrite: false }));
// Meteoriet: een rode cirkel op de inslagplek en een vuurbal met staart die naar beneden komt
function drawMeteor() {
  const m = G.meteor;
  if (!m) return;
  const pulse = 0.5 + Math.sin(store.TM * 8) * 0.5;
  ringAt(m.x, m.y, 2.6 + pulse * 0.4, '#ff5a3a', 0.5 + pulse * 0.4, 0.07);
  ringAt(m.x, m.y, 1.2, '#ffb27a', 0.6, 0.07);
  const p = meteorPosition();
  if (!p) return;
  const ball = pool('meteor', () => {
    const o = sphM();
    o.material.blending = T3.AdditiveBlending;
    return o;
  });
  ball.material.color.set('#ffd08a');
  ball.material.opacity = 1;
  ball.position.set(p.x, p.h + 0.5, p.y);
  ball.scale.setScalar(0.9);
  // Staart: een rij steeds kleinere, rodere bolletjes langs de baan omhoog
  for (let k = 1; k <= 10; k++) {
    const t = pool('meteortrail', () => {
      const o = sphM();
      o.material.blending = T3.AdditiveBlending;
      return o;
    });
    t.material.color.set(k < 4 ? '#ff9a3a' : '#c8452a');
    t.material.opacity = 0.75 * (1 - k / 11);
    t.position.set(p.x + k * 0.5, p.h + 0.5 + k * 1, p.y - k * 0.5);
    t.scale.setScalar(0.85 - k * 0.06);
  }
}

// Looporder-markeringen: een pijltje dat op de bestemming neerploft, met een uitdijende ring
/** Een markering: plek, wanneer gezet, hoeveel eenheden samen, en of het een aanval is. */
interface Mark {
  x: number;
  y: number;
  t: number;
  n: number;
  foe: boolean;
}
const MARKS: Mark[] = [];
for (let i = 0; i < 6; i++) MARKS.push({ x: 0, y: 0, t: -9, n: 0, foe: false });
const PING = new T3.ConeGeometry(0.12, 0.3, 4).rotateX(Math.PI).translate(0, 0.15, 0);
/** Markering zetten. Meerdere eenheden met hetzelfde bevel krijgen samen één markering (in het midden). */
export function markOrder(x: number, y: number, attack: boolean) {
  const now = store.TM;
  for (const m of MARKS)
    if (now - m.t < 0.15 && Math.hypot(m.x - x, m.y - y) < 3) {
      m.n++;
      m.x += (x - m.x) / m.n;
      m.y += (y - m.y) / m.n;
      return;
    }
  let old = MARKS[0];
  for (const m of MARKS) if (m.t < old.t) old = m;
  old.x = x;
  old.y = y;
  old.t = now;
  old.n = 1;
  old.foe = attack;
}
function drawMarks() {
  for (const m of MARKS) {
    const a = store.TM - m.t;
    if (a > 1.1) continue;
    const col = m.foe ? '#ff6a4a' : '#9fe28a';
    // Twee ringen die uitdijen en vervagen
    ringAt(m.x, m.y, 0.2 + a * 0.9, col, Math.max(0, 0.9 - a * 0.85), 0.05);
    if (a > 0.15) ringAt(m.x, m.y, 0.15 + (a - 0.15) * 0.6, col, Math.max(0, 0.7 - a * 0.7), 0.05);
    const pin = pool('pin', () => {
      const o = new T3.Mesh(
        PING,
        new T3.MeshBasicMaterial({ color: '#fff', transparent: true, depthWrite: false }),
      );
      o.renderOrder = 4;
      return o;
    });
    // Valt naar beneden en stuitert even, daarna krimpt hij weg
    const drop = a < 0.25 ? 1 - a / 0.25 : 0,
      bounce = a >= 0.25 && a < 0.5 ? Math.sin(((a - 0.25) / 0.25) * Math.PI) * 0.12 : 0;
    pin.position.set(m.x, 0.06 + drop * drop * 1.4 + bounce, m.y);
    pin.rotation.y = a * 4;
    pin.scale.setScalar(a > 0.8 ? Math.max(0.01, 1 - (a - 0.8) / 0.3) : 1);
    pin.material.color.set(col);
    pin.material.opacity = 0.95;
  }
}

const smokeColor = new T3.Color();
// Eenmalig als een effect voor het eerst getekend wordt: stof, vonken, lichtflitsen en rook
function firstSight(e: Fx) {
  if (e.type === 'boom') {
    const big = (e.r || 0.5) >= 2;
    // Inslag: een gloeiende flits, rondvliegend puin en een stofwolk die blijft hangen
    emit(LAYER.glow, e.x, 0.3, e.y, 0, 0.3, 0, 0.25, 0.2, big ? 1.8 : 0.5, 0xffd08a, 0.8);
    puff(
      LAYER.glow,
      big ? 18 : 7,
      e.x,
      0.25,
      e.y,
      big ? 5 : 2.5,
      big ? 4 : 2.5,
      0.5,
      0.05,
      0.015,
      0xffb050,
      1,
      -9,
    );
    puff(
      LAYER.soft,
      big ? 26 : 8,
      e.x,
      0.15,
      e.y,
      big ? 3 : 1.2,
      big ? 1.4 : 0.6,
      big ? 3.2 : 1.6,
      big ? 0.25 : 0.1,
      big ? 1.1 : 0.42,
      0x8a7a66,
      0.7,
    );
    puff(
      LAYER.soft,
      big ? 10 : 4,
      e.x,
      0.2,
      e.y,
      big ? 4 : 1.8,
      big ? 3 : 1.8,
      0.7,
      0.04,
      0.03,
      0x4a3e32,
      1,
      -7,
    );
  } else if (e.type === 'beam') {
    emit(LAYER.glow, e.x2, 0.45, e.y2, 0, 0, 0, 0.18, 0.12, 0.3, 0xffffff, 1);
    puff(LAYER.glow, 4, e.x2, 0.45, e.y2, 1.6, 1.4, 0.3, 0.03, 0.01, 0x7ff7ff, 1, -5);
  } else if (e.type === 'smoke') {
    // Rookwolkje uit de spelstand (sneuvelen, slopen): één zacht deeltje dat opstijgt en meewaait, net zoals
    // de spelstand het laat bewegen (z en vz zijn in 32ste delen van een tegel). Deeltjes lopen in echte
    // seconden en het spel in speltijd: op 2x of 4x leeft het wolkje daarom korter en stijgt het sneller, anders
    // staan er bij een snel spel veel te veel tegelijk.
    const color = smokeColor.set(e.col || '#e9ebe4').getHex(),
      pace = Math.max(1, G.speed || 1);
    emit(
      LAYER.soft,
      e.x,
      0.2 + e.z / 32,
      e.y,
      0.12 * pace,
      (e.vz / 32) * pace,
      -0.12 * pace,
      e.max / pace,
      0.12,
      0.47,
      color,
      0.5,
    );
  }
}

const beamM = () => {
  const o = new T3.Mesh(
    GB,
    new T3.MeshBasicMaterial({
      color: '#5ff',
      transparent: true,
      depthWrite: false,
      blending: T3.AdditiveBlending,
    }),
  );
  o.geometry = BEAMG;
  return o;
};
// Balk zonder verschuiving: het midden ligt in het midden (voor lasers)
const BEAMG = new T3.BoxGeometry(1, 1, 1);
const tmpTarget = new T3.Vector3();

/**
 * Splinters (hout, steen, voedsel) die van een dorpeling aan het werk afspringen. Het zijn er vaak honderd of
 * meer tegelijk: daarom allemaal in één keer getekend (één vorm, elk met een eigen plek en kleur). Ver
 * uitgezoomd zijn ze kleiner dan een pixel: dan slaan we ze over.
 */
let chips: T3.InstancedMesh<T3.BufferGeometry, T3.MeshStandardMaterial> | null = null;
const chipM = new T3.Matrix4(),
  chipC = new T3.Color(),
  chipP = new T3.Vector3(),
  chipQ = new T3.Quaternion(),
  chipS = new T3.Vector3(0.06, 0.06, 0.06);
let chipShow = true;
function addChip(x: number, y: number, z: number, col: string) {
  if (!chipShow) return;
  if (!chips || chips.count >= chips.instanceMatrix.count) {
    // Eerste keer, of te weinig plek: een grotere laag (de oude geven we vrij)
    const size = chips ? chips.instanceMatrix.count * 2 : 128;
    if (chips) {
      S3.remove(chips);
      chips.dispose();
    }
    chips = new T3.InstancedMesh(
      GB,
      new T3.MeshStandardMaterial({ flatShading: true, roughness: 0.88 }),
      size,
    );
    // Overal in de wereld: niet als één geheel wegsnijden buiten beeld
    chips.frustumCulled = false;
    chips.count = 0;
    S3.add(chips);
  }
  const i = chips.count++;
  chipM.compose(chipP.set(x, y, z), chipQ, chipS);
  chips.setMatrixAt(i, chipM);
  chips.setColorAt(i, chipC.set(col));
}

// Pijlen: een houten schacht (een lichte streep las als een bleek blokje). Een pijl met een eigen kleur (zoals
// die van de vijand) krijgt een tint daarvan, zodat je nog ziet wie er schiet.
const ARROW_WOOD = '#7a5f3e',
  PLAIN_ARROW = '#fff3c4',
  arrowTint = new T3.Color(),
  tintCol = new T3.Color();
function arrowColour(col: string | undefined): T3.Color {
  arrowTint.set(ARROW_WOOD);
  return col && col !== PLAIN_ARROW ? arrowTint.lerp(tintCol.set(col), 0.55) : arrowTint;
}
// Lichtspoor: een blokje dat vanaf de kogel naar achteren loopt (lengte 1, dus schaal z = lengte)
const TRACER_G = new T3.BoxGeometry(1, 1, 1).translate(0, 0, -0.5);
function tracerMesh() {
  const m = new T3.Mesh(
    TRACER_G,
    new T3.MeshBasicMaterial({
      color: '#fff3c4',
      transparent: true,
      blending: T3.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  m.renderOrder = 5;
  return m;
}
// Hoogstens zoveel vonkjes achter lichtsporen per beeldje, en dertig keer per seconde (op elke framerate even veel)
const MAX_TRACER_EMBERS = 24;
let emberT = 0;

let lastFxT = 0,
  smokeT = 0; // tijd sinds het laatste rookpluimpje van een kanonskogel
export function drawFx() {
  chipShow = pxu() > 20;
  if (chips) chips.count = 0;
  // Hoe lang het vorige beeldje duurde; tijdens pauze staat alles stil (dan geen rook laten uitstoten)
  const dt = lastFxT ? Math.min(0.1, store.TM - lastFxT) : 0;
  lastFxT = store.TM;
  smokeT += G.speed ? dt : 0;
  drawMeteor();
  drawMarks();
  // Vanaf het buskruit zijn kogels lichtsporen; daarvoor pijlen van hout
  const tracers = G.age >= 4;
  let embers = MAX_TRACER_EMBERS;
  emberT += G.speed ? dt : 0;
  const emberNow = emberT >= 1 / 30;
  if (emberNow) emberT = 0;
  for (const p of G.proj as DrawnProjectile[]) {
    const m = p.big
      ? pool('shell', () => new T3.Mesh(gIco(0), mat('#2a2a2a')))
      : tracers
        ? pool('tracer', tracerMesh)
        : pool('arrow', () => new T3.Mesh(GB, new T3.MeshBasicMaterial({ color: ARROW_WOOD })));
    const [px, py] = smoothPos(p);
    if (p.sx == null) {
      p.sx = px;
      p.sy = py;
    }
    // Hoe ver het projectiel al is (0..1): daarmee tekenen we een boog
    // (sx en sy worden altijd samen gezet, hierboven)
    const total = Math.hypot(p.lx - p.sx, p.ly - p.sy!) || 1,
      f = Math.min(1, Math.max(0, 1 - Math.hypot(p.lx - px, p.ly - py) / total)),
      arc = p.big ? Math.min(2.4, total * 0.28) : G.age < 4 ? Math.min(1.1, total * 0.14) : 0,
      y = 0.6 - f * 0.2 + arc * 4 * f * (1 - f),
      slope = (arc * 4 * (1 - 2 * f) - 0.2) / total;
    m.position.set(px, y, py);
    if (p.big) {
      m.scale.setScalar(0.08);
      // Kanonskogels laten een sliertje rook achter: zestig pluimpjes per seconde, op elke framerate
      if (smokeT >= 1 / 60) emit(LAYER.soft, px, y, py, 0, 0.1, 0, 0.6, 0.04, 0.12, 0xbab4aa, 0.45);
    } else {
      // Pijlen en kogels wijzen in de richting van hun baan
      m.rotation.order = 'YXZ';
      m.rotation.set(-Math.atan(slope), Math.atan2(p.lx - px, p.ly - py), 0);
      if (tracers) {
        // Een dun, fel streepje dat achter de kogel aan hangt, met af en toe een gloeiend vonkje erachter
        // (niet langer dan het al gevlogen is, anders steekt het streepje achter de schutter uit)
        m.scale.set(0.022, 0.022, Math.max(0.05, Math.min(0.7, Math.hypot(px - p.sx, py - p.sy!))));
        m.material.color.set(p.col || PLAIN_ARROW);
        if (emberNow && embers > 0 && G.speed) {
          embers--;
          const back = 0.35 / Math.max(0.01, Math.hypot(p.lx - px, p.ly - py));
          emit(
            LAYER.glow,
            px - (p.lx - px) * back,
            y,
            py - (p.ly - py) * back,
            0,
            0,
            0,
            0.16,
            0.05,
            0.01,
            0xffd890,
            0.7,
          );
        }
      } else {
        m.scale.set(0.035, 0.035, arc ? 0.38 : 0.5);
        m.material.color.copy(arrowColour(p.col));
      }
    }
  }
  if (smokeT >= 1 / 60) smokeT = 0;
  // Zonder deeltjes ('Laag') tekenen we rook als bolletjes, getint met het licht van het vorige beeldje
  if (store.noParticles) updateSmokeLight();
  for (const e of G.fx as DrawnFx[]) {
    if (!e.seen3) {
      e.seen3 = 1;
      firstSight(e);
    }
    // Hoeveel er nog over is (1 = net begonnen, 0 = voorbij); alleen gebruikt bij effecten met een max
    const k = e.life / (e as { max: number }).max;
    if (e.type === 'smoke') {
      // Rook is een deeltje (zie firstSight). Alleen zonder deeltjes een eenvoudig bolletje, zodat sneuvelen en
      // slopen ook op 'Laag' een wolkje geven
      if (!store.noParticles) continue;
      const m = pool('smoke', sphM);
      m.material.color.set(e.col || '#e9ebe4').multiply(SMOKE_LIGHT.value);
      m.material.opacity = k * 0.5;
      m.position.set(e.x, 0.2 + (e.z || 0) / 32, e.y);
      m.scale.setScalar(0.12 + (1 - k) * 0.35);
    } else if (e.type === 'chip') addChip(e.x, (e.z || 0) / 32, e.y, e.col || '#bbb');
    else if (e.type === 'ring') ringAt(e.x, e.y, 0.3 + (1 - k) * 1.2, e.col || '#fff', k * 0.9, 0.06);
    else if (e.type === 'boom') {
      // Vuurbal: groeit snel, kleurt van wit-geel naar oranje en dooft uit
      const m = pool('boom', () => {
        const o = new T3.Mesh(
          gIco(2),
          new T3.MeshBasicMaterial({ color: '#fff', transparent: true, depthWrite: false }),
        );
        o.material.blending = T3.AdditiveBlending;
        return o;
      });
      const kk = Math.min(1, Math.max(0, e.life / (e.max || 0.35))),
        r = (e.r || 0.5) * 0.75;
      m.material.color.setRGB(1, 0.55 + kk * 0.4, 0.2 + kk * 0.5);
      m.material.opacity = kk * kk * 0.85;
      m.position.set(e.x, 0.15, e.y);
      m.scale.set(r * (1 - kk * 0.6), r * (1 - kk * 0.6) * 0.7, r * (1 - kk * 0.6));
    } else if (e.type === 'beam') {
      // Laser: een gekleurde gloed met een witte kern, van de toren naar het doel
      const fade = Math.max(0, e.life / 0.12),
        l = Math.hypot(e.x2 - e.x, e.y2 - e.y) || 1;
      tmpTarget.set(e.x2, 0.45, e.y2);
      for (const [name, w, col, op] of BEAM_LAYERS) {
        const m = pool(name, beamM);
        m.material.color.set(col === 0 ? e.col || '#5ff' : col);
        m.material.opacity = fade * op;
        m.position.set((e.x + e.x2) / 2, (1.1 + 0.45) / 2, (e.y + e.y2) / 2);
        m.lookAt(tmpTarget);
        m.scale.set(w, w, Math.hypot(l, 0.65));
      }
    }
  }
  if (chips) {
    chips.instanceMatrix.needsUpdate = true;
    if (chips.instanceColor) chips.instanceColor.needsUpdate = true;
  }
}
// Twee lagen voor een laserstraal: brede gekleurde gloed en een smalle witte kern.
// Per laag: naam, breedte, kleur (0 = de kleur van de laser zelf) en dekking.
const BEAM_LAYERS: [string, number, string | 0, number][] = [
  ['beam', 0.09, 0, 0.55],
  ['beamcore', 0.03, '#ffffff', 1],
];

// Regen en sneeuw rekent de videokaart uit. Elke druppel of vlok heeft vaste toevalsgetallen (seed); de shader
// berekent zelf waar hij nu is, uit de tijd en de plek van de camera. Zo kost het per beeldje geen rekenwerk
// en hoeft er niets nieuws naar de videokaart: alleen een paar getallen (uniforms) hieronder.
/** Hoeveel druppels en vlokken per kwaliteitsstand (een eigen stand telt als 'Hoog'). */
const RAIN_DROPS: Record<string, number> = { low: 600, mid: 900, high: 1500 },
  SNOW_FLAKES: Record<string, number> = { low: 600, mid: 1000, high: 1400 };
const countFor = (table: Record<string, number>) => table[store.quality || 'high'] ?? table.high;
/** Getallen die regen en sneeuw delen; drawRain zet ze elk beeldje. */
const WEATHER = {
  // Het gebied met regen: een rechthoek recht voor de camera (midden, halve breedte en halve diepte als
  // richting). Alleen wat daar valt komt in beeld; een vierkant rond het midden liet 9 op de 10 druppels
  // buiten beeld vallen.
  uCenter: { value: new T3.Vector2() },
  uSide: { value: new T3.Vector2() },
  uFwd: { value: new T3.Vector2() },
  // Hoogste punt van een val: de helft van de camerahoogte, zodat er niets door de lens valt
  uTop: { value: 10 },
  // Dichter bij de camera dan dit vervagen ze (van heel dichtbij zou een druppel een lange streep worden)
  uNear: { value: 1 },
  // Hoe ver de camera weg is vergeleken met zoom 1: alles groeit mee, zodat regen er bij elke zoom hetzelfde uitziet
  uScale: { value: 1 },
  uTime: { value: 0 },
  // Grootte van de tekenbuffer in pixels, en hoe breed een regenstreep daarin is (zie updateWeather)
  uRes: { value: new T3.Vector2(1, 1) },
  uWidth: { value: 1.5 },
  // Het licht van nu, zodat regen en sneeuw 's nachts niet oplichten (zie particles.ts)
  uLight: SMOKE_LIGHT,
};
// Gedeelde shadercode: waar een druppel of vlok nu is. 'rate' is hoe vaak per seconde hij helemaal valt; 'fall'
// loopt van 1 (bovenaan) naar 0 (op de grond). Bij elke nieuwe val schuift hij naar een andere plek (een hash
// zonder sinus, die op elke videokaart hetzelfde werkt): anders valt dezelfde druppel steeds op hetzelfde plekje.
const WEATHER_GLSL = `attribute vec4 seed;
uniform vec2 uCenter, uSide, uFwd;
uniform float uTop, uNear, uScale, uTime;
vec2 weatherHash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.xx + p3.yz ) * p3.zy );
}
vec3 weatherSpot( float rate, out float fall ) {
  float phase = seed.z - uTime * rate;
  fall = fract( phase );
  vec2 pick = fract( seed.xy + weatherHash( vec2( floor( phase ), seed.w * 997.0 ) ) );
  vec2 xz = uCenter + uSide * ( pick.x * 2.0 - 1.0 ) + uFwd * ( pick.y * 2.0 - 1.0 );
  return vec3( xz.x, fall * uTop, xz.y );
}`;

/** Per druppel of vlok vier vaste toevalsgetallen tussen 0 en 1: plek (twee), begin van de val en snelheid. */
function weatherSeeds(n: number): Float32Array {
  const s = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    s[i * 4] = hash2(i, 1, 2);
    s[i * 4 + 1] = hash2(i, 3, 4);
    s[i * 4 + 2] = hash2(i, 5, 6);
    s[i * 4 + 3] = hash2(i, 7, 8);
  }
  return s;
}

// Regen: elke druppel is een smal streepje (twee driehoeken), allemaal in één keer getekend (instancing)
function makeRain() {
  const n = RAIN_DROPS.high;
  const g = new T3.InstancedBufferGeometry();
  // Eén streep: x gaat dwars (-0.5 tot 0.5), y van de kop (0, onderaan) naar de staart (1, bovenaan)
  g.setAttribute(
    'position',
    new T3.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3),
  );
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('seed', new T3.InstancedBufferAttribute(weatherSeeds(n), 4));
  const m = new T3.MeshBasicMaterial({
    color: '#d6e4f0',
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, WEATHER);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\n${WEATHER_GLSL}\nuniform vec2 uRes;\nuniform float uWidth;\nvarying vec2 vRain;\nvarying float vRainFade;`,
      )
      // De streep: de kop valt ruim één keer per seconde, een beetje schuin door de wind, en de staart ligt
      // erachter langs die richting. Daarna maken we hem dwars op het scherm een vast aantal pixels breed: een
      // gewone lijn is maar 1 pixel en op een scherp scherm bijna onzichtbaar. 'across' wijst rechts van de
      // streep: zo staan de hoeken tegen de klok in en is de voorkant te zien (de achterkant tekent three.js
      // niet). (mvPosition heet zo voor fog_vertex: nevel maakt verre regen vaag.)
      .replace(
        '#include <project_vertex>',
        `float fall;
        vec3 head = weatherSpot( 1.3 * ( 1.0 + seed.w * 0.3 ), fall );
        vec3 wind = vec3( -0.16, 1.0, 0.16 );
        head.xz += wind.xz * head.y;
        vec3 tail = head + wind * 0.68 * uScale;
        vec4 mvHead = modelViewMatrix * vec4( head, 1.0 );
        vec4 mvTail = modelViewMatrix * vec4( tail, 1.0 );
        vec4 mvPosition = mix( mvHead, mvTail, position.y );
        vec4 clipHead = projectionMatrix * mvHead;
        vec4 clipTail = projectionMatrix * mvTail;
        gl_Position = mix( clipHead, clipTail, position.y );
        vec2 along = ( clipTail.xy / max( clipTail.w, 0.001 ) - clipHead.xy / max( clipHead.w, 0.001 ) ) * uRes;
        vec2 across = normalize( vec2( along.y, -along.x ) + vec2( 0.0001, 0.0 ) );
        gl_Position.xy += across * position.x * uWidth * 2.0 / uRes * gl_Position.w;
        vRain = position.xy;
        vRainFade = smoothstep( uNear * 0.6, uNear, -mvPosition.z ) * smoothstep( 1.0, 0.85, fall );`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uLight;\nvarying vec2 vRain;\nvarying float vRainFade;',
      )
      // Zacht begin bij de kop en een staart die uitloopt; de kleur maal het licht van nu
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float streak = smoothstep( 0.0, 0.15, vRain.y ) * ( 1.0 - smoothstep( 0.3, 1.0, vRain.y ) );
        vec4 diffuseColor = vec4( diffuse * uLight, opacity * streak * vRainFade );`,
      );
  };
  m.customProgramCacheKey = () => 'tp-rain';
  const mesh = new T3.Mesh(g, m);
  // De plekken bestaan alleen in de shader: three.js kan niet zien of de regen in beeld is
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.onBeforeRender = updateSmokeLight;
  S3.add(mesh);
  return mesh;
}

// Sneeuw: in de winter valt er sneeuw in plaats van regen. Zachte ronde vlokjes die langzaam dwarrelen.
function makeSnow() {
  const n = SNOW_FLAKES.high;
  const g = new T3.BufferGeometry();
  // De plek rekent de shader uit; position is er alleen zodat three.js weet hoeveel vlokken er zijn
  g.setAttribute('position', new T3.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('seed', new T3.BufferAttribute(weatherSeeds(n), 4));
  const m = new T3.PointsMaterial({
    color: '#ffffff',
    size: 0.24,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, WEATHER);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${WEATHER_GLSL}\nvarying float vSnowFade;`)
      // Langzaam vallen (één val duurt 9 tot 15 seconden) en zacht heen en weer dwarrelen
      .replace(
        '#include <begin_vertex>',
        `float fall;
        vec3 transformed = weatherSpot( 0.066 * ( 1.0 + seed.w * 0.7 ), fall );
        transformed.x += sin( uTime * 0.8 + seed.w * 40.0 ) * 0.3 * uScale;
        transformed.z += cos( uTime * 0.6 + seed.z * 50.0 ) * 0.3 * uScale;`,
      )
      // Minstens 2 pixels, anders is er geen ronde vlok te tekenen; te dichtbij en bovenaan zacht vervagen
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        gl_PointSize = max( gl_PointSize, 2.0 );
        vSnowFade = smoothstep( uNear * 0.6, uNear, -mvPosition.z ) * smoothstep( 1.0, 0.9, fall );`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uLight;\nvarying float vSnowFade;')
      // Een zachte ronde vlok in plaats van een vierkantje, maal het licht van nu
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec2 pc = gl_PointCoord * 2.0 - 1.0;
        float flake = pow( max( 0.0, 1.0 - dot( pc, pc ) ), 1.5 );
        vec4 diffuseColor = vec4( diffuse * uLight, opacity * flake * vSnowFade );`,
      );
  };
  m.customProgramCacheKey = () => 'tp-snow';
  const points = new T3.Points(g, m);
  points.frustumCulled = false;
  points.renderOrder = 6;
  points.onBeforeRender = updateSmokeLight;
  S3.add(points);
  return points;
}

let RAIN: T3.Mesh<T3.InstancedBufferGeometry, T3.MeshBasicMaterial> | null = null,
  SNOW: T3.Points<T3.BufferGeometry, T3.PointsMaterial> | null = null;
// Het gebied met regen, recht voor de camera: in kijkrichting een halve diepte van 0.45 keer de afstand tot de
// camera, opzij afhankelijk van hoe breed het beeld is (gemeten voor de schuine camera van het spel)
function updateWeather() {
  const d = camDist(),
    fx = cam.x - CAM3.position.x,
    fz = cam.y - CAM3.position.z,
    fl = Math.hypot(fx, fz);
  if (fl < 0.5) {
    // Recht van boven (2D-aanzicht) is er geen kijkrichting: dan een vast rechthoekig gebied zo groot als het beeld
    WEATHER.uFwd.value.set(0, d * 0.42);
    WEATHER.uSide.value.set(d * 0.42 * CAM3.aspect, 0);
  } else {
    WEATHER.uFwd.value.set((fx / fl) * d * 0.45, (fz / fl) * d * 0.45);
    WEATHER.uSide.value.set((-fz / fl) * d * 0.36 * CAM3.aspect, (fx / fl) * d * 0.36 * CAM3.aspect);
  }
  WEATHER.uCenter.value.set(cam.x, cam.y);
  WEATHER.uTop.value = CAM3.position.y * 0.5;
  WEATHER.uNear.value = d * 0.3;
  WEATHER.uScale.value = d / 27;
  // De tijd loopt rond na een uur: met heel grote getallen gaat de shader schokkerig rekenen
  WEATHER.uTime.value = store.TM % 3600;
  R3.getDrawingBufferSize(WEATHER.uRes.value);
  // Een streep is 1.5 pixel van de tekenbuffer breed, en op een scherp scherm minstens 1.1 schermpixel. Met het
  // maximum aantal pixels per kwaliteitsstand (zie scene.ts) blijft dat ook op een 5K-scherm goedkoop.
  WEATHER.uWidth.value = Math.max(1.5, 1.1 * R3.getPixelRatio());
}
export function drawRain() {
  const snow = !!G.rain && season().n === 'Winter',
    rain = !!G.rain && !snow;
  if (rain || snow) updateWeather();
  if (rain) {
    if (!RAIN) RAIN = makeRain();
    // Hoeveel druppels (de rest van de lijst wordt niet getekend)
    RAIN.geometry.instanceCount = countFor(RAIN_DROPS);
  }
  if (RAIN) RAIN.visible = rain;
  if (snow) {
    if (!SNOW) SNOW = makeSnow();
    SNOW.geometry.setDrawRange(0, countFor(SNOW_FLAKES));
  }
  if (SNOW) SNOW.visible = snow;
}
