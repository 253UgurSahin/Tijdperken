// Goedkope deeltjes (rook, stof, vonken, vuurvliegjes): alles in twee getekende "stapels" (instancing).
import { store } from '../core/store';
import * as T3 from 'three';
import { S3, hemi, sun } from './scene';

// Vaste ruimte per laag; als hij vol is, wordt het oudste deeltje overschreven.
const MAX = 700;

/**
 * Het licht dat op rook, regen en sneeuw valt: de lucht plus een deel van de zon. Overdag bijna wit, 's nachts
 * gedimd blauwgrijs. Zonder dit licht gloeit witte rook 's nachts als een lampje. We lezen zon en lucht uit
 * scene.ts (niet uit lighting.ts): zo volgt de rook vanzelf elke verandering in het licht.
 */
export const SMOKE_LIGHT = { value: new T3.Color(1, 1, 1) };
// Nooit donkerder dan maanlicht: met alleen zon en lucht verdween rook 's nachts helemaal tegen de donkere grond
const MOONLIGHT = new T3.Color(0.36, 0.4, 0.5);
const sunShare = new T3.Color();
/** SMOKE_LIGHT bijwerken. Vlak voor het tekenen: dan heeft lighting() zon en lucht voor dit beeldje al gezet. */
export function updateSmokeLight(): void {
  const c = SMOKE_LIGHT.value.copy(hemi.color).multiplyScalar(hemi.intensity * 0.9);
  c.add(sunShare.copy(sun.color).multiplyScalar(sun.intensity * 0.55));
  c.r = Math.max(MOONLIGHT.r, c.r);
  c.g = Math.max(MOONLIGHT.g, c.g);
  c.b = Math.max(MOONLIGHT.b, c.b);
}

/**
 * Het materiaal van een laag. Elk deeltje is een plat vierkantje dat altijd recht naar de camera kijkt (een
 * "billboard") met een zachte ronde vlek erop: dat oogt als een wolkje en kost 2 driehoeken in plaats van de 80
 * van een bol (die van dichtbij hoekig werd). Per deeltje een eigen doorzichtigheid (instAlpha).
 * Zachte laag (rook, stof): kleur maal SMOKE_LIGHT, dus 's nachts donker. Gloeilaag (vuur, vonken): telt licht
 * op en gloeit dus altijd.
 */
function fadeMaterial(additive: boolean) {
  const m = new T3.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    depthWrite: false,
    blending: additive ? T3.AdditiveBlending : T3.NormalBlending,
  });
  m.onBeforeCompile = sh => {
    if (!additive) sh.uniforms.uLight = SMOKE_LIGHT;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float instAlpha;\nvarying float vInstAlpha;\nvarying vec2 vQuad;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvInstAlpha = instAlpha;\nvQuad = position.xy;',
      )
      // Billboard: het midden van het deeltje naar camera-ruimte, en daar het vierkantje plat voor de camera
      // zetten. De matrix uit stepLayer heeft alleen schaal en plek: de lengte van de eerste kolom is dus precies
      // de grootte. Het vierkantje schuift ook zijn grootte naar de camera toe, zoals de voorkant van een bol:
      // anders snijdt de grond een harde rechte rand uit laag stof. (mvPosition heet zo voor fog_vertex.)
      .replace(
        '#include <project_vertex>',
        `float pSize = length( instanceMatrix[ 0 ].xyz );
        vec4 mvPosition = modelViewMatrix * vec4( instanceMatrix[ 3 ].xyz, 1.0 );
        mvPosition.xy += position.xy * pSize * 2.0;
        mvPosition.z += pSize;
        gl_Position = projectionMatrix * mvPosition;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vInstAlpha;\nvarying vec2 vQuad;' +
          (additive ? '' : '\nuniform vec3 uLight;'),
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        additive
          ? // Gloed: fel in het midden en snel zwakker naar de rand (de 1.8 maakt goed dat de rand nu zacht is)
            `float r = length( vQuad ) * 2.0;
            vec4 diffuseColor = vec4( diffuse, opacity * vInstAlpha * 1.8 * pow( max( 0.0, 1.0 - r ), 1.6 ) );`
          : // Rook: een zachte ronde vlek, linksboven iets lichter (alsof de zon erop schijnt), maal het licht van
            // nu. Een zachte rand laat minder zien dan een volle bol; 1.8 maakt dat goed, zodat alle emit()-
            // aanroepen ongeveer hun oude sterkte houden. Nooit boven 1, anders geeft het mengen vreemde randen.
            `float r2 = dot( vQuad, vQuad ) * 4.0;
            float soft = pow( max( 0.0, 1.0 - r2 ), 1.5 );
            float shade = 0.88 + 0.4 * dot( vQuad, vec2( -0.45, 0.55 ) );
            vec4 diffuseColor = vec4( diffuse * uLight * shade, min( 1.0, opacity * vInstAlpha * 1.8 * soft ) );`,
      );
  };
  // Beide lagen hebben dezelfde onBeforeCompile-tekst, en three.js kiest het programma op die tekst: zonder een
  // eigen naam per laag zouden ze stilletjes één shader delen (dan gloeit de rook, of de vonken niet).
  m.customProgramCacheKey = () => (additive ? 'tp-glow' : 'tp-smoke');
  return m;
}

/**
 * Eén laag deeltjes: de getekende stapel (mesh), de doorzichtigheid per deeltje (alpha), de plek voor het
 * volgende deeltje (next) en per deeltje plek, snelheid, kleur, levensduur, grootte en zwaartekracht.
 */
interface Layer {
  mesh: T3.InstancedMesh;
  alpha: T3.InstancedBufferAttribute;
  next: number;
  pos: Float32Array;
  vel: Float32Array;
  col: Float32Array;
  life: Float32Array;
  max: Float32Array;
  size: Float32Array;
  a0: Float32Array;
  grav: Float32Array;
}
function makeLayer(additive: boolean): Layer {
  // Een vierkantje van 1 bij 1 in het xy-vlak (eigen exemplaar per laag, met instAlpha erbij)
  const geometry = new T3.PlaneGeometry(1, 1);
  const mesh = new T3.InstancedMesh(geometry, fadeMaterial(additive), MAX);
  mesh.instanceMatrix.setUsage(T3.DynamicDrawUsage);
  mesh.instanceColor = new T3.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  mesh.instanceColor.setUsage(T3.DynamicDrawUsage);
  const alpha = new T3.InstancedBufferAttribute(new Float32Array(MAX), 1);
  alpha.setUsage(T3.DynamicDrawUsage);
  geometry.setAttribute('instAlpha', alpha);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = additive ? 5 : 4;
  S3.add(mesh);
  // Toestand per deeltje in vaste rijen getallen: zo maken we per beeldje niets nieuws aan
  return {
    mesh,
    alpha,
    next: 0,
    pos: new Float32Array(MAX * 3),
    vel: new Float32Array(MAX * 3),
    col: new Float32Array(MAX * 3),
    life: new Float32Array(MAX),
    max: new Float32Array(MAX),
    size: new Float32Array(MAX * 2),
    a0: new Float32Array(MAX),
    grav: new Float32Array(MAX),
  };
}
const SOFT = makeLayer(false),
  GLOW = makeLayer(true);
// Het licht op de rook bijwerken vlak voordat die getekend wordt
SOFT.mesh.onBeforeRender = updateSmokeLight;

/** Laag kiezen: 'soft' (rook, stof) of 'glow' (vuur, vonken, lichtjes). */
export const LAYER = { soft: SOFT, glow: GLOW };

/**
 * Eén deeltje loslaten. Kleur als getal (0xffaa33), grootte groeit van s0 naar s1,
 * doorzichtigheid zakt van a naar 0. grav < 0 laat het vallen, > 0 laat het opstijgen.
 */
export function emit(
  L: Layer,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  life: number,
  s0: number,
  s1: number,
  color: number,
  a = 1,
  grav = 0,
) {
  if (store.noParticles) return; // effecten uitgezet (instellingen of lage kwaliteit)
  const i = L.next;
  L.next = (i + 1) % MAX;
  L.pos[i * 3] = x;
  L.pos[i * 3 + 1] = y;
  L.pos[i * 3 + 2] = z;
  L.vel[i * 3] = vx;
  L.vel[i * 3 + 1] = vy;
  L.vel[i * 3 + 2] = vz;
  L.col[i * 3] = ((color >> 16) & 255) / 255;
  L.col[i * 3 + 1] = ((color >> 8) & 255) / 255;
  L.col[i * 3 + 2] = (color & 255) / 255;
  L.life[i] = life;
  L.max[i] = life;
  L.size[i * 2] = s0;
  L.size[i * 2 + 1] = s1;
  L.a0[i] = a;
  L.grav[i] = grav;
}

/** Een wolkje van n deeltjes in alle richtingen (stof bij een inslag, vonken bij een treffer). */
export function puff(
  L: Layer,
  n: number,
  x: number,
  y: number,
  z: number,
  speed: number,
  up: number,
  life: number,
  s0: number,
  s1: number,
  color: number,
  a = 1,
  grav = 0,
) {
  for (let k = 0; k < n; k++) {
    const ang = Math.random() * 6.283,
      sp = speed * (0.4 + Math.random() * 0.6);
    emit(
      L,
      x,
      y,
      z,
      Math.sin(ang) * sp,
      up * (0.5 + Math.random() * 0.5),
      Math.cos(ang) * sp,
      life * (0.7 + Math.random() * 0.5),
      s0,
      s1,
      color,
      a,
      grav,
    );
  }
}

function stepLayer(L: Layer, dt: number) {
  // Alle drie zijn Float32Array-rijen (instanceColor is gezet in makeLayer)
  const m = L.mesh.instanceMatrix.array as Float32Array,
    c = L.mesh.instanceColor!.array as Float32Array,
    al = L.alpha.array as Float32Array;
  let n = 0;
  for (let i = 0; i < MAX; i++) {
    if (L.life[i] <= 0) continue;
    L.life[i] -= dt;
    if (L.life[i] <= 0) continue;
    const k = 1 - L.life[i] / L.max[i]; // 0 bij de start, 1 aan het eind
    L.vel[i * 3 + 1] += L.grav[i] * dt;
    // Langzaam afremmen, zodat rook blijft hangen in plaats van weg te schieten
    const drag = 1 - Math.min(1, dt * 1.6);
    L.vel[i * 3] *= drag;
    L.vel[i * 3 + 2] *= drag;
    let y = L.pos[i * 3 + 1] + L.vel[i * 3 + 1] * dt;
    if (y < 0.02 && L.grav[i] < 0) {
      // Vallende deeltjes blijven op de grond liggen
      y = 0.02;
      L.vel[i * 3] = L.vel[i * 3 + 1] = L.vel[i * 3 + 2] = 0;
    }
    L.pos[i * 3] += L.vel[i * 3] * dt;
    L.pos[i * 3 + 1] = y;
    L.pos[i * 3 + 2] += L.vel[i * 3 + 2] * dt;
    const s = L.size[i * 2] + (L.size[i * 2 + 1] - L.size[i * 2]) * k;
    // Matrix zonder draaiing: alleen schaal en plek
    const o = n * 16;
    m[o] = s;
    m[o + 1] = m[o + 2] = m[o + 3] = m[o + 4] = 0;
    m[o + 5] = s;
    m[o + 6] = m[o + 7] = m[o + 8] = m[o + 9] = 0;
    m[o + 10] = s;
    m[o + 11] = 0;
    m[o + 12] = L.pos[i * 3];
    m[o + 13] = y;
    m[o + 14] = L.pos[i * 3 + 2];
    m[o + 15] = 1;
    c[n * 3] = L.col[i * 3];
    c[n * 3 + 1] = L.col[i * 3 + 1];
    c[n * 3 + 2] = L.col[i * 3 + 2];
    // Zacht invloeien en uitdoven
    al[n] = L.a0[i] * Math.min(1, k * 8) * (1 - k);
    n++;
  }
  L.mesh.count = n;
  L.mesh.visible = n > 0;
  if (n) {
    L.mesh.instanceMatrix.needsUpdate = true;
    L.mesh.instanceColor!.needsUpdate = true;
    L.alpha.needsUpdate = true;
  }
}

let lastT = 0;
/** Elk beeldje: alle deeltjes een stapje verder. */
export function stepParticles(now: number) {
  const dt = lastT ? Math.min(0.1, now - lastT) : 0;
  lastT = now;
  stepLayer(SOFT, dt);
  stepLayer(GLOW, dt);
}

/** Alles weg (nieuw spel). */
export function clearParticles() {
  SOFT.life.fill(0);
  GLOW.life.fill(0);
}
