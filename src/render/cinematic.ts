// Filmisch moment bij een nieuw tijdperk: de camera zweeft rustig uit boven je stad en daarna terug.
// Beweeg je zelf de camera (slepen, zoomen, minikaart), dan stopt het meteen; na schuiven glijdt je eigen
// zoom vanzelf terug. Een klik of toets laat hem snel terugkeren naar waar je was. Met "Animaties" uit
// (instellingen) gebeurt er niets. Hoe het 3D-beeld gedraaid staat (store.yaw) verandert het nooit.
// Ook hier: de vlucht van het titelscherm naar het spel ("Verder spelen", zie startGlide).
import type { GameState } from '../types';
import { SET } from '../core/settings';
import { G } from '../game/state';
import { ZOOM_MIN } from '../input/input';
import { PLAY_REACH, clampCam, pitchAt, setTitleView } from './camera';
import type { PlayCamera, TitleView } from './camera';
import { viewYaw } from '../core/view';
import { TAU } from '../config';
import { cam } from './scene';

const OUT = 1.4, // seconden: uitzoomen naar het stamhuis
  HOLD = 1.7, // even boven de stad blijven hangen (en nog een klein beetje verder uitzoomen)
  BACK = 1.4, // terug naar waar je was
  QUICK = 0.5; // sneller terug na een klik of toets
const FAR_ZOOM = 0.42; // zo ver uitgezoomd dat de stad in beeld past (zelf kun je nog veel verder uitzoomen)
const DRIFT = 0.08; // tijdens het hangen nog 8% verder weg

/** Een stand van de camera: waar hij naar kijkt (x, y) en hoe ver weg hij is (d = 1 / zoom). */
interface Pose {
  x: number;
  y: number;
  d: number;
}
/**
 * Het lopende moment: bij welk spel, wanneer het begon, waar je was (from), waar we heen gaan (over),
 * de snelle terugweg na een klik of toets (quick), en wat we het vorige beeldje zelf zetten (set).
 */
interface Shot {
  game: GameState;
  start: number;
  from: Pose;
  over: Pose;
  quick: { start: number; from: Pose } | null;
  set: { x: number; y: number; z: number } | null;
}
let shot: Shot | null = null;

// Rustig op gang komen en rustig afremmen
const smooth = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// Afstand (d = 1 / zoom) mengen in plaats van de zoom zelf: zo voelt uitzoomen gelijkmatig
const mixPose = (a: Pose, b: Pose, k: number): Pose => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
  d: a.d + (b.d - a.d) * k,
});

/** Het moment begint (bij een nieuw tijdperk). */
export function startAgeCinematic(): void {
  if (!SET.motion || !G) return;
  const hall = G.bs.find(b => b.type === 'townhall');
  const zoom = cam.tz ?? cam.z;
  // Glijdt de camera nog ergens heen, dan is dat doel de plek om naar terug te keren. Let op: cam.ty blijft
  // na zo'n glijden staan (alleen cam.tx wordt leeg), dus die alleen gebruiken zolang cam.tx er is.
  const gliding = cam.tx != null;
  const from = { x: gliding ? cam.tx! : cam.x, y: gliding ? cam.ty! : cam.y, d: 1 / zoom };
  const over = {
    x: hall ? hall.x + 1 : from.x,
    y: hall ? hall.y + 1 : from.y,
    d: 1 / Math.min(zoom, FAR_ZOOM),
  };
  cam.tx = cam.ty = cam.tz = null;
  shot = { game: G, start: performance.now() / 1000, from, over, quick: null, set: null };
}

/** Een klik of toets tijdens het moment: snel terug naar waar je was. */
function hurryBack(): void {
  hurryGlide();
  if (!shot || shot.quick || !shot.set) return;
  shot.quick = { start: performance.now() / 1000, from: { x: cam.x, y: cam.y, d: 1 / cam.z } };
}
for (const type of ['pointerdown', 'keydown']) addEventListener(type, hurryBack, true);

/**
 * Heeft iets anders de camera verplaatst sinds het vorige beeldje? Dan is de camera weer van de speler.
 * 'zoom': de speler zoomde zelf. 'move': hij schoof of sprong naar een plek (minikaart). '': niets.
 */
function playerTookOver(s: { set: { x: number; y: number; z: number } | null }): 'zoom' | 'move' | '' {
  const set = s.set;
  if (!set) return '';
  if (cam.tz != null || Math.abs(cam.z - set.z) > 1e-4) return 'zoom';
  if (cam.tx != null || Math.abs(cam.x - set.x) > 1e-3 || Math.abs(cam.y - set.y) > 1e-3) return 'move';
  return '';
}

/** Elk beeldje, vóór de camera wordt neergezet. `now` in seconden. */
export function stepCinematic(now: number): void {
  stepGlide(now);
  if (!shot) return;
  // Een ander spel geladen of begonnen: dat zet de camera zelf goed neer
  if (shot.game !== G) {
    shot = null;
    return;
  }
  const took = playerTookOver(shot);
  if (took) {
    // Alleen geschoven? Dan glijdt de zoom vanzelf terug naar die van de speler. Zelf gezoomd: zo laten.
    if (took === 'move') {
      cam.tz = 1 / shot.from.d;
      cam.anchor = null;
    }
    shot = null;
    return;
  }
  const { from, over } = shot;
  // Tijdens het hangen nog iets verder weg, maar nooit verder dan je zelf kunt uitzoomen
  const high = { ...over, d: Math.min(over.d * (1 + DRIFT), 1 / ZOOM_MIN) };
  const t = now - shot.start;
  let pose: Pose,
    done = false;
  if (shot.quick) {
    const k = Math.min(1, (now - shot.quick.start) / QUICK);
    pose = mixPose(shot.quick.from, from, smooth(k));
    done = k >= 1;
  } else if (t < OUT) pose = mixPose(from, over, smooth(t / OUT));
  else if (t < OUT + HOLD) pose = mixPose(over, high, smooth((t - OUT) / HOLD));
  else {
    const k = Math.min(1, (t - OUT - HOLD) / BACK);
    pose = mixPose(high, from, smooth(k));
    done = k >= 1;
  }
  cam.x = pose.x;
  cam.y = pose.y;
  cam.z = 1 / pose.d;
  clampCam();
  shot.set = { x: cam.x, y: cam.y, z: cam.z };
  if (done) shot = null;
}

/**
 * Stop het moment meteen, met de camera weer waar de speler was (het titelscherm gaat open).
 * Ook een lopende vlucht naar het spel springt dan meteen naar zijn doel.
 */
export function stopCinematic(): void {
  if (glide) finish(glide.to);
  if (!shot) return;
  cam.x = shot.from.x;
  cam.y = shot.from.y;
  cam.z = 1 / shot.from.d;
  shot = null;
}

/** Loopt het moment nog? */
export const inCinematic = (): boolean => !!shot;

// ---- Glijden van het titelshot naar het spel ("Verder spelen") ----

/** Een stand met ook de draaiing (yaw) en hoe schuin de camera kijkt (pitch). */
interface ViewPose extends Pose {
  yaw: number;
  pitch: number;
  reach: number;
}
/**
 * De lopende glijvlucht: van waar, naar waar, hoe lang, en wat we het vorige beeldje zelf zetten.
 * `viewOnly`: de speler nam het over; dan draaien en kantelen we alleen nog bij, de plek is van hem.
 */
interface Glide {
  start: number;
  dur: number;
  from: ViewPose;
  to: ViewPose;
  set: { x: number; y: number; z: number } | null;
  viewOnly: boolean;
}
let glide: Glide | null = null;
const HURRY = 0.4; // seconden: de rest van de vlucht na een klik of toets

/**
 * Glijd in `dur` seconden van het titelshot (`from`) naar de camera van de speler (`to`).
 * Aan het eind staat de camera precies op `to`, met de gewone kanteling en draaiing van het spel.
 * Met "Animaties" uit springt hij meteen.
 */
export function startGlide(from: TitleView, to: PlayCamera, dur = 1.2): void {
  shot = null;
  const end: ViewPose = {
    x: to.x,
    y: to.y,
    d: 1 / to.z,
    yaw: viewYaw(),
    pitch: pitchAt(to.z),
    reach: PLAY_REACH,
  };
  if (!SET.motion) {
    finish(end);
    return;
  }
  // Langs de kortste weg draaien: het verschil tussen -180° en +180°
  const turn = ((((end.yaw - from.yaw + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  glide = {
    start: performance.now() / 1000,
    dur,
    from: { x: cam.x, y: cam.y, d: 1 / cam.z, yaw: end.yaw - turn, pitch: from.pitch, reach: from.reach },
    to: end,
    set: null,
    viewOnly: false,
  };
  cam.tx = cam.ty = cam.tz = null;
  setTitleView({ pitch: from.pitch, yaw: end.yaw - turn, reach: from.reach });
}
// Klaar (of afgebroken): de camera precies op het doel en het gewone beeld weer aan
function finish(end: Pose): void {
  glide = null;
  setTitleView(null);
  cam.x = end.x;
  cam.y = end.y;
  cam.z = 1 / end.d;
  cam.tx = cam.tz = null;
  clampCam();
}
// Een klik of toets tijdens de vlucht: de rest gaat snel
function hurryGlide(): void {
  if (!glide || !glide.set || glide.viewOnly) return;
  const now = performance.now() / 1000,
    k = smooth(Math.min(1, (now - glide.start) / glide.dur));
  glide.from = mixView(glide.from, glide.to, k);
  glide.start = now;
  glide.dur = Math.min(HURRY, glide.dur);
}
const mixView = (a: ViewPose, b: ViewPose, k: number): ViewPose => ({
  ...mixPose(a, b, k),
  yaw: a.yaw + (b.yaw - a.yaw) * k,
  pitch: a.pitch + (b.pitch - a.pitch) * k,
  // Ook hoe ver het beeld reikt: anders verspringt de mist bovenin op het laatste beeldje van de vlucht
  reach: a.reach + (b.reach - a.reach) * k,
});
function stepGlide(now: number): void {
  if (!glide) return;
  // Zoomt of schuift de speler zelf, dan is de plek meteen van hem. Draaiing en kanteling springen niet
  // (de titeldraaiing kan een halve slag verschillen): die draaien we nog snel bij.
  if (!glide.viewOnly && playerTookOver(glide)) {
    const k = smooth(Math.min(1, (now - glide.start) / glide.dur));
    glide.from = mixView(glide.from, glide.to, k);
    glide.start = now;
    glide.dur = Math.min(HURRY, glide.dur);
    glide.viewOnly = true;
  }
  const k = Math.min(1, (now - glide.start) / glide.dur);
  if (glide.viewOnly) {
    // Het doel van de kanteling hoort bij de zoom die de speler nu heeft
    const to = { ...glide.to, pitch: pitchAt(cam.z) },
      pose = mixView(glide.from, to, smooth(k));
    if (k >= 1) {
      glide = null;
      setTitleView(null);
    } else setTitleView({ pitch: pose.pitch, yaw: pose.yaw, reach: pose.reach });
    return;
  }
  if (k >= 1) {
    finish(glide.to);
    return;
  }
  const pose = mixView(glide.from, glide.to, smooth(k));
  cam.x = pose.x;
  cam.y = pose.y;
  cam.z = 1 / pose.d;
  setTitleView({ pitch: pose.pitch, yaw: pose.yaw, reach: pose.reach });
  glide.set = { x: cam.x, y: cam.y, z: cam.z };
}
/** Loopt de vlucht van het titelscherm naar het spel nog? */
export const inGlide = (): boolean => !!glide;
