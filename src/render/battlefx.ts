// Gevechten leesbaar maken: beschadigde gebouwen roken en branden, verwoeste gebouwen storten in tot puin.
import * as T3 from 'three';
import { store } from '../core/store';
import { W } from '../config';
import { B } from '../data/buildings';
import { G } from '../game/state';
import { bMaxHp } from '../game/upgrades';
import { bmap } from '../world/world';
import { COLLAPSE_TIME, RUIN_LIFE, collapseAt, damageTier, rubbleLayout, tiltSign } from '../util/collapse';
import { hash2 } from '../util/random';
import { GB, disposeMerged, gDod, mat, mergeStatic, mk } from './kit';
import { LAYER, emit, puff } from './particles';
import { camDist } from './camera';
import { S3, cam } from './scene';
import { bRec } from './sync';

/** Wat we van een gebouw in de 3D-wereld nodig hebben (een deel van BuildingRec in sync.ts). */
interface CollapsingModel {
  g: T3.Group;
  key: string;
  done: boolean;
  x: number;
  y: number;
  s: number;
  h: number;
}
/** Een gebouw dat instort en daarna als puinhoop blijft liggen. */
interface Ruin {
  id: number;
  /** Het instortende model, tot het puin er ligt (dan null). */
  model: T3.Group | null;
  rubble: T3.Group | null;
  /** Wanneer het instorten begon (store.TM) en hoe lang het puin al ligt (speltijd). */
  t0: number;
  age: number;
  x: number;
  y: number;
  s: number;
  h: number;
  /** Naar welke kant (-1 of 1) en om welke as het valt. */
  sign: number;
  axis: 'x' | 'z';
  /** Het tijdperk toen het viel: bepaalt de kleuren van het puin. */
  era: number;
}

// Hier hangen de instortende modellen en het puin (los van de gebouwen: dus niet aan te klikken)
const FX3 = new T3.Group();
S3.add(FX3);
const ruins: Ruin[] = [];
// Nooit meer dan zoveel tegelijk: het oudste puin gaat eerst
const MAX_RUINS = 12;
// Zo lang (seconden) zakt het puin aan het eind weg in de grond
const RUIN_FADE = 1.5;

/**
 * Een gebouw verdwijnt uit de spelstand (verwoest of afgebroken). Alleen een af gebouw dat geen muur is stort
 * in: dan nemen we het model over en geven true. Anders false, en ruimt sync.ts het meteen op zoals altijd.
 * (Een nieuw model door een andere sleutel, zoals een nieuw tijdperk of vernieuwen, komt hier nooit langs.)
 */
export function collapseBuilding(id: number, r: CollapsingModel): boolean {
  const d = B[r.key.split('|')[0]];
  if (!r.done || !d || d.wall) return false;
  while (ruins.length >= MAX_RUINS) removeRuin(0);
  // (attach houdt de plek in de wereld hetzelfde, ook al hangt het model nu ergens anders)
  FX3.attach(r.g);
  ruins.push({
    id,
    model: r.g,
    rubble: null,
    t0: store.TM,
    age: 0,
    x: r.x,
    y: r.y,
    s: r.s,
    h: r.h,
    sign: tiltSign(id),
    axis: hash2(id, 4, 5) < 0.5 ? 'x' : 'z',
    era: G.age,
  });
  dustRing(r.g.position.x, r.g.position.z, r.s, 0.6);
  return true;
}

// Stof dat bij het instorten in een ring over de grond wegrolt, in de kleur van het puin
function dustRing(x: number, z: number, s: number, strength: number) {
  const n = Math.round((10 + s * 5) * strength),
    speed = 0.9 + s * 0.35;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + Math.random() * 0.3;
    emit(
      LAYER.soft,
      x + Math.sin(a) * s * 0.45,
      0.1,
      z + Math.cos(a) * s * 0.45,
      Math.sin(a) * speed,
      0.12 + Math.random() * 0.15,
      Math.cos(a) * speed,
      1.6 + Math.random() * 0.6,
      0.12,
      0.45 + s * 0.08,
      0x9c8f7c,
      0.55,
    );
  }
  // Een wolk die opwaait, en een paar vonken
  puff(LAYER.soft, 3 + s * 2, x, 0.4, z, 0.5, 0.7, 2.2, 0.2, 0.7 + s * 0.1, 0x8a8074, 0.45);
  puff(LAYER.glow, 4 + s * 2, x, 0.5, z, 1.4, 1.6, 0.6, 0.04, 0.01, 0xffb860, 0.9, -3);
}

// Kleuren van het puin per tijdperk: hout en steen, dan baksteen, dan beton en staal (laatste = balken)
const RUBBLE_COLOURS = [
  ['#6e5a44', '#857055', '#8a857e', '#5c534a', '#4a3626'],
  ['#8a4a3a', '#6f6a64', '#9a948c', '#a0583f', '#4a3626'],
  ['#9a9894', '#7f7d7a', '#5f666c', '#b0aea8', '#53585e'],
];
const eraColours = (era: number) => RUBBLE_COLOURS[era <= 3 ? 0 : era <= 6 ? 1 : 2];

/**
 * De puinhoop: een donkere, onregelmatige vlek (twee gedraaide platen) met brokken, gruis en een paar balken
 * erop. Alles samen één vorm, dus één keer tekenen.
 */
function makeRubble(ru: Ruin): T3.Group {
  const g = new T3.Group(),
    s = ru.s,
    colours = eraColours(ru.era),
    id = ru.id;
  g.position.set(ru.x + s / 2, 0, ru.y + s / 2);
  const scorch = mat('#3b342d');
  mk(GB, scorch, g, 0, 0, 0, s * 0.82, 0.03, s * 0.7, hash2(id, 1, 20) * 0.5);
  mk(GB, scorch, g, 0, 0, 0, s * 0.6, 0.035, s * 0.8, 0.8 + hash2(id, 2, 20) * 0.5);
  for (const c of rubbleLayout(s, id)) {
    const colour = colours[Math.min(3, Math.floor(c.shade * 4))];
    mk(gDod(), mat(colour), g, c.x, c.s * 0.25, c.z, c.s, c.s * 0.6, c.s, c.rot);
  }
  // Gruis: kleine stukjes los over de vlek
  for (let k = 0; k < 7; k++) {
    const a = hash2(id, k, 23) * Math.PI * 2,
      d = s * (0.12 + hash2(id, k, 24) * 0.26),
      bit = s * (0.03 + hash2(id, k, 25) * 0.03);
    mk(GB, mat(colours[k % 4]), g, Math.cos(a) * d, 0.02, Math.sin(a) * d, bit, bit * 0.8, bit * 1.3, a);
  }
  // Twee schuin liggende balken (hout, of staal in de laatste tijdperken)
  for (let k = 0; k < 2; k++) {
    const a = hash2(id, k, 21) * Math.PI,
      len = s * (0.4 + hash2(id, k, 22) * 0.25);
    const beam = mk(GB, mat(colours[4]), g, (k - 0.5) * s * 0.25, 0.04, 0, len, 0.05, 0.06, a);
    beam.rotation.z = (k ? 1 : -1) * 0.25;
  }
  return mergeStatic(g);
}

function removeRuin(i: number) {
  const ru = ruins[i];
  for (const o of [ru.model, ru.rubble])
    if (o) {
      FX3.remove(o);
      disposeMerged(o);
    }
  ruins.splice(i, 1);
}

// De instortende gebouwen een stapje verder, en het puin na een tijdje weer weg
function stepRuins(dt: number) {
  for (let i = ruins.length - 1; i >= 0; i--) {
    const ru = ruins[i];
    // Staat er (weer) iets gebouwd op deze plek? Dan meteen weg met het puin
    const centre = (ru.y + Math.floor(ru.s / 2)) * W + ru.x + Math.floor(ru.s / 2);
    if (bmap[centre]) {
      removeRuin(i);
      continue;
    }
    if (ru.model) {
      const t = store.TM - ru.t0,
        pose = collapseAt(t),
        g = ru.model;
      g.scale.y = pose.scaleY;
      g.position.y = pose.sink * ru.s;
      g.rotation[ru.axis] = pose.tilt * ru.sign;
      if (t < COLLAPSE_TIME) continue;
      // Neergekomen: een tweede stofwolk, en het model wordt een puinhoop
      FX3.remove(g);
      disposeMerged(g);
      ru.model = null;
      ru.rubble = makeRubble(ru);
      FX3.add(ru.rubble);
      dustRing(ru.rubble.position.x, ru.rubble.position.z, ru.s, 1);
      continue;
    }
    ru.age += dt;
    if (ru.age >= RUIN_LIFE) removeRuin(i);
    else if (ru.rubble && ru.age > RUIN_LIFE - RUIN_FADE)
      ru.rubble.position.y = -0.35 * ((ru.age - (RUIN_LIFE - RUIN_FADE)) / RUIN_FADE);
  }
}

/** Een beschadigd gebouw dat nu rookt: waar de rook uit het dak komt, en de klokjes tot het volgende wolkje. */
interface Smoker {
  id: number;
  x: number;
  y: number;
  z: number;
  s: number;
  tier: 1 | 2;
  smoke: number;
  flame: number;
  ember: number;
}
// Hoogstens zoveel gebouwen roken tegelijk (de dichtstbijzijnde), en zo vaak kiezen we ze opnieuw
const MAX_SMOKERS = 12,
  PICK_EVERY = 0.35;
// Nooit meer dan zoveel deeltjes per beeldje uit alle schade samen: de deeltjes zijn gedeeld met schoorstenen en vuur
const BUDGET = 16;
let smokers: Smoker[] = [],
  pickT = 0;
const nearby: [number, Smoker][] = [];
const timers = new Map<number, Smoker>();

/** Kies de beschadigde gebouwen die het dichtst bij het midden van het beeld staan. */
function pickSmokers() {
  const range = camDist() * 1.2;
  nearby.length = 0;
  for (const b of G.bs) {
    if (!b.done || B[b.type].wall) continue;
    const tier = damageTier(b.hp, bMaxHp(b));
    if (!tier) continue;
    const s = B[b.type].size,
      cx = b.x + s / 2,
      cz = b.y + s / 2,
      dist = Math.hypot(cx - cam.x, cz - cam.y);
    if (dist > range) continue;
    const r = bRec.get(b.id);
    if (!r) continue;
    // Een vaste plek op het dak, per gebouw anders
    const old = timers.get(b.id);
    const sm: Smoker = old || {
      id: b.id,
      x: cx + (hash2(b.id, 1, 31) - 0.5) * s * 0.45,
      y: 0,
      z: cz + (hash2(b.id, 2, 31) - 0.5) * s * 0.45,
      s,
      tier,
      smoke: Math.random() * 0.2,
      flame: 0,
      ember: 0,
    };
    sm.y = r.h * 0.85;
    sm.tier = tier;
    nearby.push([dist, sm]);
  }
  nearby.sort((a, b) => a[0] - b[0]);
  smokers = nearby.slice(0, MAX_SMOKERS).map(n => n[1]);
  timers.clear();
  for (const sm of smokers) timers.set(sm.id, sm);
}

// Rook (en bij zware schade vuur) uit de daken van beschadigde gebouwen
function stepDamage(dt: number) {
  pickT -= dt;
  if (pickT <= 0) {
    pickT = PICK_EVERY;
    pickSmokers();
  }
  let budget = BUDGET;
  for (const sm of smokers) {
    const k = 0.7 + sm.s * 0.15; // grotere gebouwen: dikkere rook
    // (de klokjes lopen hoogstens één keer terug: geen inhaalgolf als het budget even op was)
    sm.smoke = Math.max(-0.2, sm.smoke - dt);
    if (sm.smoke <= 0 && budget > 0) {
      sm.smoke += sm.tier === 2 ? 0.16 : 0.24;
      budget--;
      emit(
        LAYER.soft,
        sm.x + (Math.random() - 0.5) * 0.15 * k,
        sm.y,
        sm.z + (Math.random() - 0.5) * 0.15 * k,
        0.14 + (Math.random() - 0.5) * 0.08,
        0.5 + Math.random() * 0.2,
        -0.05 + (Math.random() - 0.5) * 0.08,
        3 + Math.random(),
        0.12 * k,
        (sm.tier === 2 ? 0.85 : 0.7) * k,
        sm.tier === 2 ? 0x2e2a27 : 0x3a3632,
        0.5,
      );
    }
    if (sm.tier < 2) continue;
    // Vlammen: kort, fel en een beetje opzij springend
    sm.flame = Math.max(-0.1, sm.flame - dt);
    if (sm.flame <= 0 && budget > 0) {
      sm.flame += 0.05;
      budget--;
      emit(
        LAYER.glow,
        sm.x + (Math.random() - 0.5) * 0.3 * k,
        sm.y - 0.05,
        sm.z + (Math.random() - 0.5) * 0.3 * k,
        (Math.random() - 0.5) * 0.2,
        0.7 + Math.random() * 0.4,
        (Math.random() - 0.5) * 0.2,
        0.5 + Math.random() * 0.25,
        0.2 * k,
        0.04,
        Math.random() < 0.5 ? 0xff8a30 : 0xffb040,
        0.95,
      );
    }
    // Gloeiende sintels die opstijgen en uitdoven
    sm.ember = Math.max(-0.3, sm.ember - dt);
    if (sm.ember <= 0 && budget > 0) {
      sm.ember += 0.3;
      budget--;
      emit(
        LAYER.glow,
        sm.x,
        sm.y + 0.1,
        sm.z,
        (Math.random() - 0.5) * 0.6,
        0.8 + Math.random() * 0.5,
        (Math.random() - 0.5) * 0.6,
        1.2 + Math.random() * 0.6,
        0.035,
        0.01,
        0xffc060,
        1,
        0.2,
      );
    }
  }
}

let lastT = 0;
/** Elk beeldje (na stepDying in render.ts): instorten, puin en rook bij schade. */
export function stepBattleFx(): void {
  const realDt = lastT ? store.TM - lastT : 0,
    dt = Math.min(0.1, realDt);
  lastT = store.TM;
  // Tijdens pauze ligt het puin stil (het verdwijnt niet), en komt er geen nieuwe rook. Het puin telt de
  // echte tijd (niet afgekapt), zodat het ook bij een haperend beeld na 25 seconden weg is.
  stepRuins(G.speed ? Math.min(1, realDt) : 0);
  if (store.noParticles || !G.speed) {
    smokers = [];
    timers.clear();
    return;
  }
  stepDamage(dt);
}

/** Nieuw spel of geladen spel: al het puin en alle instortende modellen weg. */
export function clearBattleFx(): void {
  while (ruins.length) removeRuin(ruins.length - 1);
  smokers = [];
  timers.clear();
  pickT = 0;
}

/** Hoeveel gebouwen er nu instorten of als puin liggen (voor tests in de browser). */
export const ruinCount = (): number => ruins.length;
