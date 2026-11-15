// Camera: kijkhoek, verschuiven en zoomen, en scherm ↔ kaart omrekenen.
import * as T3 from 'three';
import { store } from '../core/store';
import { DEFAULT_YAW, viewYaw } from '../core/view';
import { H, TAU, W } from '../config';
import { CAM3, S3, SUN_DIR, VH, VW, cam, sun } from './scene';
import { clamp } from '../util/math';
import { fitShadowBox, type ShadowBox, type ShadowFitOptions } from '../util/shadowfit';

export const camDist = () => 27 / cam.z;
/**
 * Hoe ver de camera tot hier altijd hoogstens uitzoomde (zoom 0,35). Nog verder uitgezoomd tekenen we minder
 * details (zie isFar): schaduwen van bomen, kleine dingen en figuurtjes kosten dan veel en zie je nauwelijks.
 */
export const FAR_DIST = 27 / 0.35;
/** Zijn we verder uitgezoomd dan vroeger kon? Dan tekenen we eenvoudiger (minder schaduw, stippen voor figuren). */
export const isFar = () => camDist() > FAR_DIST * 1.05;
// Hoe de camera gedraaid staat (zie core/view.ts)
const YAW = viewYaw;
// Rustig op gang komen en rustig ophouden tussen a en b (0 ervoor, 1 erna)
const smoothstep = (a: number, b: number, v: number): number => {
  const k = clamp((v - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
/**
 * Hoe schuin de camera kijkt bij zoom z (radialen boven de grond). Bovenaanzicht (2D): bijna recht omlaag.
 * In 3D kantelt hij bij inzoomen naar de horizon, zodat je gevels en boomstammen ziet in plaats van daken.
 */
export function pitchAt(z: number): number {
  if (store.V2) return 1.5;
  const k = smoothstep(Math.log(1.05), Math.log(2.4), Math.log(z));
  return Math.max(0.6, 0.9 - 0.28 * k);
}
/**
 * De kanteling nu. Elke keer opnieuw uit cam.z berekend (niet bijgehouden): het zoomen rond de muis rekent
 * tussen twee beeldjes met s2t, en dan moet de kanteling al bij de nieuwe zoom horen.
 */
export const viewPitch = (): number => pitchAt(cam.z);
export function updateCamera() {
  const p = titleView ? titleView.pitch : viewPitch(),
    y = titleView ? titleView.yaw : YAW(),
    d = camDist();
  let tx = cam.x,
    tz = cam.y;
  if (store.shake > 0) {
    tx += (Math.random() - 0.5) * store.shake * 0.6;
    tz += (Math.random() - 0.5) * store.shake * 0.6;
  }
  CAM3.position.set(tx + Math.cos(p) * Math.sin(y) * d, Math.sin(p) * d, tz + Math.cos(p) * Math.cos(y) * d);
  CAM3.lookAt(tx, 0, tz);
  CAM3.updateMatrixWorld();
  // Ver uitgezoomd begint het beeld pas een eind voor de camera (near). Anders is de dieptebuffer daar te grof
  // en schemert het water door de oever heen (witte randen om elk meer). Dichtbij blijft het 0,5.
  const near = Math.max(0.5, d * 0.55 - 25);
  // En het beeld houdt op waar de mist alles verbergt: wat daarachter ligt, hoeft niet getekend te worden.
  // Op het titelscherm kijkt de camera laag over het land: daar eerder ophouden, anders is het veel zwaarder.
  const reach = d * (titleView ? titleView.reach : PLAY_REACH),
    far = reach + 2;
  if (CAM3.near !== near || CAM3.far !== far) {
    CAM3.near = near;
    CAM3.far = far;
    CAM3.updateProjectionMatrix();
  }
  // Schaduw: het vak van de schaduwkaart past precies om wat je ziet (zie fitShadowBox). Zo gaan alle pixels van
  // de kaart naar het beeld, en zijn de schaduwen scherper dan met een vast vierkant om het midden.
  const fit = fitShadowToView(reach, tx - cam.x, tz - cam.y);
  const sinEl = SUN_DIR.y;
  // De zon staat zo ver weg dat alles aan de zonkant van het vak (en wat erop staat) nog vóór de schaduwcamera
  // ligt; anders ontbreken daar schaduwen als je ver uitzoomt.
  const D = Math.max(55.6, fit.depthBehind + 20);
  const sh = sun.shadow.camera;
  sh.left = -fit.halfW;
  sh.right = fit.halfW;
  sh.top = fit.halfH;
  sh.bottom = -fit.halfH;
  sh.near = 1;
  sh.far = Math.max(2 * D + 20, D + fit.depthFront + 10);
  sh.updateProjectionMatrix();
  // De marge tegen strepen in de schaduw ("acne") is een deel van de diepte van het vak. We delen door die
  // diepte, zodat de marge in meters gelijk blijft als het vak dieper wordt. Een lage zon scheert over daken
  // en hellingen; die krijgt nog wat extra marge langs de vlakken.
  sun.shadow.bias = -0.13 / (sh.far - sh.near);
  sun.shadow.normalBias = 0.02 + 0.03 * Math.max(0, 1 - sinEl / 0.83);
  sun.position.set(fit.cx + SUN_DIR.x * D, SUN_DIR.y * D, fit.cz + SUN_DIR.z * D);
  sun.target.position.set(fit.cx, 0, fit.cz);
  sun.target.updateMatrixWorld();
  snapShadow(fit.halfW, fit.halfH);
  // Zachte nevel in de verte. Hoe lager de camera kijkt, hoe verder weg hij pas begint: anders wordt het
  // dorp zelf al wazig zodra je inzoomt.
  const fog = S3.fog as T3.Fog;
  fog.near = d * (0.95 + (0.9 - p) * 1.2);
  fog.far = reach;
}
// ---- Het vak van de schaduwkaart ----

/** Tot zo hoog (in tegels) moeten dingen aan de rand van het beeld nog schaduw krijgen: hoge torens en wonderen. */
const ROOF = 4.0;
const FLOOR_PLANE = new T3.Plane(new T3.Vector3(0, 1, 0), 0),
  ROOF_PLANE = new T3.Plane(new T3.Vector3(0, 1, 0), -ROOF),
  FIT_RAY = new T3.Raycaster(),
  FIT_NDC = new T3.Vector2(),
  FIT_HIT = new T3.Vector3();
const FIT_PLANES = [FLOOR_PLANE, ROOF_PLANE];
const SCREEN_CORNERS: [number, number][] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
// De 8 hoekpunten: 4 schermhoeken, elk op de grond en op dakhoogte (vooraf gemaakt: geen nieuw geheugen per beeldje)
const FIT_POINTS: [number, number, number][] = Array.from({ length: 8 }, () => [0, 0, 0]);
const FIT_SUN: [number, number, number] = [0, 1, 0];
// Een halve tegel marge is genoeg: de zachte schaduwrand is maar een paar pixels van de kaart breed
const FIT_FORWARD = new T3.Vector3();
const FIT_FOCUS: [number, number, number] = [0, 0, 0];
/** Zo ver buiten de kaart (in tegels) vallen nog schaduwen, op de zee langs de rand. */
const MAP_EDGE = 2;
const FIT_MAP: [number, number, number][] = Array.from({ length: 8 }, () => [0, 0, 0]);
const FIT_BOX: ShadowBox = { cx: 0, cz: 0, halfW: 0, halfH: 0, depthBehind: 0, depthFront: 0 };
const FIT_OPTS: ShadowFitOptions = {
  minHalf: 6,
  maxHalf: 69,
  step: 2,
  margin: 0.5,
  focus: FIT_FOCUS,
  bounds: FIT_MAP,
};
/**
 * Het vak om wat je nu ziet. reach: hoe ver het beeld reikt (tot de mist); ox, oz: de schok van het scherm, die we
 * eraf halen zodat een ontploffing het vak (en dus de schaduwen) niet laat trillen.
 */
function fitShadowToView(reach: number, ox: number, oz: number): ShadowBox {
  let n = 0;
  CAM3.getWorldDirection(FIT_FORWARD);
  for (const [sx, sy] of SCREEN_CORNERS) {
    FIT_NDC.set(sx, sy);
    FIT_RAY.setFromCamera(FIT_NDC, CAM3);
    const ray = FIT_RAY.ray;
    const maxT = reach / Math.max(0.1, ray.direction.dot(FIT_FORWARD));
    for (const plane of FIT_PLANES) {
      // Een straal boven in beeld kan bij een lage kijkhoek ver achter de mist de grond raken (of nooit):
      // dan nemen we het punt waar de mist alles verbergt, anders wordt het vak veel te groot
      // (De mist telt de diepte langs de kijkrichting, niet de afstand: in de schermhoeken reikt een straal dus verder.)
      const hit = ray.intersectPlane(plane, FIT_HIT);
      if (!hit || hit.distanceTo(ray.origin) > maxT) ray.at(maxT, FIT_HIT);
      const p = FIT_POINTS[n++];
      p[0] = FIT_HIT.x - ox;
      p[1] = FIT_HIT.y;
      p[2] = FIT_HIT.z - oz;
    }
  }
  FIT_SUN[0] = SUN_DIR.x;
  FIT_SUN[1] = SUN_DIR.y;
  FIT_SUN[2] = SUN_DIR.z;
  // Verder uitgezoomd dan vroeger kon, groeit het vak niet verder mee (net als vroeger het vierkant): zo blijft
  // de schaduw scherp en kost hij niet meer werk
  FIT_OPTS.maxHalf = FAR_DIST * 0.9 * Math.max(1, CAM3.aspect / 1.78);
  // Past het beeld niet in dat grootste vak, dan houdt het midden van het scherm (waar de camera naar kijkt) schaduw
  FIT_FOCUS[0] = cam.x;
  FIT_FOCUS[2] = cam.y;
  // De kaart kan van maat veranderen (een nieuw spel): de hoeken daarom elk beeldje opnieuw zetten
  for (let i = 0; i < 8; i++) {
    const p = FIT_MAP[i];
    p[0] = i & 1 ? W + MAP_EDGE : -MAP_EDGE;
    p[1] = i & 4 ? ROOF : 0;
    p[2] = i & 2 ? H + MAP_EDGE : -MAP_EDGE;
  }
  return fitShadowBox(FIT_POINTS, FIT_SUN, FIT_OPTS, FIT_BOX);
}

/**
 * De schaduwkaart schuift mee met de camera. Schuift hij een halve pixel (van de kaart) op, dan verspringen
 * alle schaduwranden een beetje: dat flikkert bij het verschuiven van het beeld. Daarom zetten we de zon zo
 * dat de kaart altijd met hele pixels opschuift; dan staan de schaduwen stil.
 */
const inLight = new T3.Vector3(),
  shift = new T3.Vector3();
function snapShadow(halfW: number, halfH: number) {
  const sh = sun.shadow;
  sun.updateMatrixWorld();
  sh.updateMatrices(sun); // zet de schaduwcamera op zijn plek
  const texelX = (2 * halfW) / sh.mapSize.x,
    texelY = (2 * halfH) / sh.mapSize.y;
  inLight.copy(sun.target.position).applyMatrix4(sh.camera.matrixWorldInverse);
  shift.set(
    Math.round(inLight.x / texelX) * texelX - inLight.x,
    Math.round(inLight.y / texelY) * texelY - inLight.y,
    0,
  );
  if (shift.x === 0 && shift.y === 0) return;
  // Terug naar de wereld: de verschuiving ligt in het vlak van de schaduwcamera
  shift.applyQuaternion(sh.camera.quaternion);
  sun.position.add(shift);
  sun.target.position.add(shift);
  sun.target.updateMatrixWorld();
}
const RAY = new T3.Raycaster(),
  NDC = new T3.Vector2(),
  GP = new T3.Plane(new T3.Vector3(0, 1, 0), 0),
  TV = new T3.Vector3(),
  TV2 = new T3.Vector3();
export function rayAt(sx: number, sy: number) {
  NDC.set((sx / VW) * 2 - 1, -(sy / VH) * 2 + 1);
  RAY.setFromCamera(NDC, CAM3);
  return RAY;
}
export function s2t(sx: number, sy: number): [number, number] {
  const r = rayAt(sx, sy),
    p = r.ray.intersectPlane(GP, TV);
  if (!p) {
    const d = r.ray.direction;
    return [cam.x + d.x * 400, cam.y + d.z * 400];
  }
  return [p.x, p.z];
}
export function s2iso(sx: number, sy: number): [number, number] {
  return [sx, sy];
}
export function proj(x: number, h: number, y: number): [number, number, number] {
  TV2.set(x, h, y).project(CAM3);
  return [((TV2.x + 1) / 2) * VW, ((1 - TV2.y) / 2) * VH, TV2.z];
}
export function t2s(x: number, y: number): [number, number] {
  const p = proj(x, 0, y);
  return [p[0], p[1]];
}
export const pxu = () => VH / (2 * camDist() * Math.tan((CAM3.fov * Math.PI) / 360));
export function centerOn(x: number, y: number, instant?: boolean) {
  if (instant) {
    cam.x = x;
    cam.y = y;
    cam.tx = null;
    return;
  }
  cam.tx = x;
  cam.ty = y;
}
export function clampCam() {
  cam.x = clamp(cam.x, 2, W - 2);
  cam.y = clamp(cam.y, 2, H - 2);
  if (cam.tx != null) {
    cam.tx = clamp(cam.tx, 2, W - 2);
    cam.ty = clamp(cam.ty!, 2, H - 2); // ty is altijd samen met tx gezet (zie centerOn)
  }
}
export function panScreen(dx: number, dy: number) {
  const y = YAW(),
    f = 1 / pxu();
  const rx = Math.cos(y),
    rz = -Math.sin(y),
    fx = -Math.sin(y),
    fz = -Math.cos(y),
    k = store.V2 ? 1 : 1 / Math.sin(viewPitch());
  cam.x += (-dx * rx + dy * fx * -k) * f;
  cam.y += (-dx * rz + dy * fz * -k) * f;
  cam.tx = null;
  clampCam();
}

// ---- Draaien (alleen in het 3D-aanzicht) ----

/** Zo snel draait het beeld als je een draaitoets ingedrukt houdt (radialen per seconde). */
export const TURN_SPEED = 1.6;
/** Zo ver draait het beeld per klik op een draaiknop: een achtste rondje. */
export const TURN_STEP = Math.PI / 4;
// Een draaiing tussen 0 en een heel rondje, zodat het getal niet blijft groeien
const wrapYaw = (a: number) => ((a % TAU) + TAU) % TAU;

/**
 * Draai het 3D-beeld meteen om het midden van het scherm. Positief: de wereld draait met de klok mee.
 * In het bovenaanzicht (2D) gebeurt er niets.
 */
export function turnCamera(delta: number) {
  if (store.V2) return;
  store.tyaw = null;
  store.yaw = wrapYaw(store.yaw + delta);
}
/** Draai vloeiend een stuk verder (de draaiknoppen). Telt op bij een draai die nog bezig is. */
export function turnCameraSmooth(delta: number) {
  if (store.V2) return;
  store.tyaw = (store.tyaw ?? store.yaw) + delta;
}
/** Vloeiend terug naar de standaard draaiing, langs de kortste weg. */
export function resetTurn() {
  const now = store.tyaw ?? store.yaw;
  // Het verschil tussen -180° en +180°: zo draait het nooit meer dan een half rondje terug
  const diff = wrapYaw(DEFAULT_YAW - now + Math.PI) - Math.PI;
  store.tyaw = now + diff;
}
/** Elk beeldje: een vloeiende draai een stukje verder. */
export function updateTurn(rdt: number) {
  if (store.tyaw == null) return;
  store.yaw += (store.tyaw - store.yaw) * (1 - Math.pow(0.0005, rdt));
  if (Math.abs(store.tyaw - store.yaw) < 0.001) {
    store.yaw = wrapYaw(store.tyaw);
    store.tyaw = null;
  }
}

// ---- Het titelscherm: een langzaam draaiend, laag shot van je dorp ----

/**
 * Hoe de camera op het titelscherm kijkt: kanteling, draaiing en hoe ver het beeld reikt (× de afstand,
 * tot de mist alles bedekt). Alleen voor het beeld, niet voor het spel.
 */
export interface TitleView {
  pitch: number;
  yaw: number;
  reach: number;
}
let titleView: TitleView | null = null;
export const TITLE_REACH = 2.6; // het titelshot kijkt laag over het land: eerder ophouden scheelt veel werk
export const PLAY_REACH = 3.3; // tijdens het spel
/**
 * Zet het titelbeeld (of null: weer het gewone beeld). Het verandert alleen hoe de camera kijkt;
 * store.yaw en de instellingen blijven zoals de speler ze had.
 */
export function setTitleView(view: TitleView | null): void {
  titleView = view;
}
/** Het titelbeeld nu (ook tijdens de overgang ervandaan naar het spel), of null. */
export const currentTitleView = (): TitleView | null => titleView;

/** Waar de speler keek voor het titelscherm openging: daar gaat "Verder spelen" weer heen. */
export interface PlayCamera {
  x: number;
  y: number;
  z: number;
}
let playCamera: PlayCamera | null = null;
/** Onthoud de camera van de speler (één keer, bij het openen van het titelscherm). */
export function rememberPlayCamera(): void {
  if (playCamera) return;
  // Glijdt de camera nog ergens heen, dan is dat doel de plek van de speler (cam.ty hoort alleen bij cam.tx)
  const gliding = cam.tx != null;
  playCamera = { x: gliding ? cam.tx! : cam.x, y: gliding ? cam.ty! : cam.y, z: cam.tz ?? cam.z };
}
/** De onthouden camera van de speler, of null. */
export const savedPlayCamera = (): PlayCamera | null => playCamera;
/** Vergeet de onthouden camera (na het laden of beginnen van een ander spel zet dat zelf de camera neer). */
export function forgetPlayCamera(): void {
  playCamera = null;
}
/**
 * Doe iets (zoals opslaan) met de camera van de speler in plaats van die van het titelscherm,
 * en zet daarna het titelbeeld terug. Zo bewaart een opslag nooit het draaiende titelshot.
 */
export function withPlayCamera<R>(job: () => R): R {
  if (!playCamera) return job();
  const now = { x: cam.x, y: cam.y, z: cam.z };
  cam.x = playCamera.x;
  cam.y = playCamera.y;
  cam.z = playCamera.z;
  try {
    return job();
  } finally {
    cam.x = now.x;
    cam.y = now.y;
    cam.z = now.z;
  }
}
