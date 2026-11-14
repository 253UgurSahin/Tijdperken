// Zon, maan, seizoenen en lampen bij nacht.
import * as T3 from 'three';
import { store } from '../core/store';
import { SET } from '../core/settings';
import { lights } from '../game/caches';
import { G } from '../game/state';
import { chargeFrac } from '../data/finale';
import { isCharging } from '../game/finale';
import { season } from '../game/time';
import { FAR_DIST, camDist, isFar } from './camera';
import { GLOWS, glow } from './decals';
import { GLASS, WIN } from './kit';
import { FOL } from './nodes';
import { CAM3, PL, R3, S3, SUN_DIR, cam, hemi, sun } from './scene';
import { TMAT } from './terrain';
import { SNOW_COVER } from './terrainlook';
import { setBloomDarkness, setGradeTime } from './post';
import { setScatterSeason } from './scatter';
import { dist } from '../util/math';
import { sunDirAt } from '../util/sunpath';

// Zonlicht: perzik bij zonsopkomst, warm wit rond 12 uur, goud en dan oranje bij zonsondergang.
// 's Nachts schijnt de maan (COLD).
const DAWN = new T3.Color('#ffcf9e'),
  NOON = new T3.Color('#fff4e2'),
  EVE = new T3.Color('#ffb066'),
  EVE_LATE = new T3.Color('#ff8a4a'),
  COLD = new T3.Color('#9fb4e6'),
  // Licht van de lucht: blauwig overdag, paarsig in de schemering, donkerblauw 's nachts
  SKYD = new T3.Color('#d6e4ff'),
  SKY_DUSK = new T3.Color('#b9a2c9'),
  SKYN = new T3.Color('#38466e'),
  // Licht dat van de grond terugkaatst op muren: groen van het gras overdag, donkerblauw 's nachts
  BOUNCE_DAY = new T3.Color('#3a4628'),
  BOUNCE_NIGHT = new T3.Color('#151b28'),
  // Nevel in de verte
  FOGD = new T3.Color('#b7c7cf'),
  FOGN = new T3.Color('#0c1220'),
  FOGDUSK = new T3.Color('#d9a07a'),
  // Bewolkt (regen of sneeuw): lucht en nevel trekken grijs
  OVERCAST = new T3.Color('#c3cad2');
// Sfeer per tijdperk, heel subtiel: Gouden Eeuw warm, industrie wat heiiger, sterrentijd koeler.
// [zonkleur, mistkleur, hoe sterk (0..1)]
const AGE_MOOD = (
  [
    null,
    null,
    null,
    null,
    ['#ffe0a8', '#b9b394', 0.35],
    ['#f2e8d8', '#a9a69c', 0.5],
    null,
    ['#eef4ff', '#9fb2bc', 0.3],
    ['#e2e4ff', '#9ea4c8', 0.4],
  ] as ([string, string, number] | null)[]
).map((m): [T3.Color, T3.Color, number] | null => m && [new T3.Color(m[0]), new T3.Color(m[1]), m[2]]);
// Zoveel lichtvlekken van lampen op de grond hooguit (de dichtstbijzijnde)
const MAX_GLOWS = 96;
// Hangen de lampen (PL) nu in de scène, en zijn we "ver" voor de lampen? (zie lighting)
let lampsIn = true,
  lampsFar = false;
/**
 * Lampen in of uit de scène halen betekent andere shaders (met of zonder puntlichten). Die van de nacht
 * maken we één keer vooraf klaar, bij het eerste beeldje: anders hapert het spel bij de eerste schemering.
 */
export function precompileNightShaders(): void {
  const hadLamps = lampsIn;
  if (!hadLamps) for (const p of PL) S3.add(p);
  try {
    R3.compile(S3, CAM3);
  } finally {
    if (!hadLamps) for (const p of PL) S3.remove(p);
  }
}
const moodSun = new T3.Color('#ffffff'),
  moodFog = FOGD.clone(),
  wantSun = new T3.Color(),
  wantFog = new T3.Color(),
  fogNow = new T3.Color(),
  sunTint = new T3.Color();
// Zachte overgang van 0 (bij a) naar 1 (bij b), zoals smoothstep in een shader (b mag kleiner zijn dan a)
function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
// Langzaam naar de sfeer van het huidige tijdperk schuiven, zodat een nieuw tijdperk zacht invalt.
// dt is echte tijd: zo gaat het bij 30 en bij 120 beeldjes per seconde even snel.
function updateMood(dt: number) {
  const m = AGE_MOOD[G.age];
  wantSun.setRGB(1, 1, 1);
  wantFog.copy(FOGD);
  if (m) {
    wantSun.lerp(m[0], m[2]);
    wantFog.lerp(m[1], m[2]);
  }
  const k = 1 - Math.exp(-dt / 0.8);
  moodSun.lerp(wantSun, k);
  moodFog.lerp(wantFog, k);
}
/** Hoe bewolkt het is (0..1): het trekt dicht als het gaat regenen of sneeuwen, en klaart daarna langzaam op. */
let wet = 0,
  lastGameHour = -1;
function updateOvercast(dt: number) {
  const want = G.rain ? 1 : 0;
  // Springt de speltijd (nieuw spel, opgeslagen spel geladen), dan meteen het goede weer: anders blijft
  // een droog nieuw spel na een regenachtig spel nog een minuut grijs
  const gameHour = G.day * 24 + G.clock,
    jumped = gameHour < lastGameHour || gameHour - lastGameHour > 1;
  lastGameHour = gameHour;
  if (jumped) wet = want;
  // In zo'n 15 tellen dicht, in ongeveer een minuut weer open
  wet += (want - wet) * (1 - Math.exp(-dt / (want > wet ? 5 : 20)));
}

// ---- De zon draait mee met de klok (de baan zelf staat in util/sunpath.ts) ----
// 's Nachts staat er een vaste maan, rechts in het standaardbeeld: zo licht de andere kant van de huizen koel op
const MOON_DIR = new T3.Vector3(0.62, 0.72, -0.3).normalize();
const sunNow = new T3.Vector3();
let lastTM = 0;
const AUT: Record<string, string> = { oak: '#c9772f', birch: '#d9a83a' },
  SUMMER: Record<string, string> = {
    oak: '#4f8a3c',
    birch: '#8fbf5a',
    pine: '#3f6b3f',
    pine2: '#4a7a45',
    bush: '#4d7d38',
  },
  WINTER: Record<string, string> = {
    oak: '#8a8f86',
    birch: '#b5b9ad',
    pine: '#4d6a5a',
    pine2: '#5b7868',
    bush: '#6b7a62',
  };
export function applySeason() {
  const sn = season().n;
  // Sneeuw op de grond: langzaam erbij in de winter, langzaam weg in de lente
  SNOW_COVER.value += ((sn === 'Winter' ? 1 : 0) - SNOW_COVER.value) * 0.004;
  if (sn === store.seasonSig) return;
  store.seasonSig = sn;
  setScatterSeason(sn);
  for (const k in SUMMER)
    FOL[k].color.set(sn === 'Herfst' && AUT[k] ? AUT[k] : sn === 'Winter' ? WINTER[k] : SUMMER[k]);
  TMAT.color.set(
    sn === 'Winter' ? '#e4ecf0' : sn === 'Herfst' ? '#f2e6cc' : sn === 'Zomer' ? '#fff6dc' : '#ffffff',
  );
}
// Tijdens de finale kleurt de lucht paars, sterker naarmate de sterrenpoort voller is.
// Bij het begin en bij het opengaan is er even een felle lichtflits (store.finaleFlash).
const VIOLET = new T3.Color('#a98bff'),
  VIOLET_FOG = new T3.Color('#4a3a7a');
function finaleSky() {
  if (isCharging()) {
    const k = 0.1 + chargeFrac(G.finale) * 0.3 + Math.sin(store.TM * 1.6) * 0.04;
    hemi.color.lerp(VIOLET, k);
    fogNow.lerp(VIOLET_FOG, k * 0.7);
  }
  // (met lichtflitsen uit blijft de flits van de finale een zacht oplichten)
  const flash = store.finaleFlash
    ? (1 - (performance.now() - store.finaleFlash) / 1600) * (SET.flash ? 1 : 0.25)
    : 0;
  if (flash > 0) {
    hemi.intensity += flash * 1.2;
    sun.intensity += flash * 0.6;
  }
}
export function lighting(dk: number) {
  const dusk =
    G.clock >= 16.5 && G.clock < 20.5
      ? Math.sin(((G.clock - 16.5) / 4) * Math.PI)
      : G.clock >= 4.5 && G.clock < 7.5
        ? Math.sin(((G.clock - 4.5) / 3) * Math.PI) * 0.8
        : 0;
  // Echte tijd sinds het vorige beeldje (het eerste beeldje springt meteen naar de goede stand)
  const dt = lastTM ? Math.max(0, store.TM - lastTM) : 1e3;
  lastTM = store.TM;
  updateMood(dt);
  updateOvercast(dt);
  // Richting van het licht (camera.ts zet daar de schaduwen mee neer). 's Nachts is het de maan. De wissel is
  // kort en valt als het al flink donker is; het licht zakt dan even bijna helemaal weg en de richting draait
  // pas als het het zwakst is, zodat je de schaduwen niet ziet ronddraaien.
  sunNow.set(...sunDirAt(G.clock));
  const toMoon = smooth(0.6, 0.72, dk);
  SUN_DIR.copy(sunNow)
    .lerp(MOON_DIR, smooth(0.35, 0.65, toMoon))
    .normalize();
  const sinEl = SUN_DIR.y;
  // Hoe laag de zon staat: 0 rond 12 uur, 1 vlak boven de horizon. Laag licht is warm.
  const low = smooth(0.83, 0.33, sunNow.y);
  sunTint.copy(G.clock < 12 ? DAWN : EVE);
  if (G.clock >= 12) sunTint.lerp(EVE_LATE, smooth(18.4, 19.8, G.clock));
  sun.color
    .copy(NOON)
    .multiply(moodSun)
    .lerp(sunTint, low * (1 - 0.7 * wet))
    .lerp(COLD, smooth(0.2, 0.78, dk));
  // Het licht neemt pas echt af als de zon ondergaat: rond half zeven is het nog gouden uur, om half negen
  // is het nacht (dk loopt van 0 overdag tot 0,78 midden in de nacht)
  const dim = 0.78 * smooth(0.1, 0.78, dk);
  // Een lage zon valt schuin op de grond, die daardoor donkerder wordt: dat maken we voor een deel goed.
  // Onder een grijze lucht is de zon veel zwakker en de lucht wat lichter: ongeveer even licht, maar zacht,
  // met vage schaduwen. 's Nachts is het maanlicht wat sterker dan het licht van de lucht, zodat de maan
  // echte schaduwen geeft.
  const lowLift = 1 + (0.83 / Math.max(sinEl, 0.4) - 1) * 0.45;
  sun.intensity =
    (0.95 * (1 - dim) + 0.24 * dim) * lowLift * (1 - 0.85 * Math.sin(Math.PI * toMoon)) * (1 - 0.6 * wet);
  hemi.color
    .copy(SKYD)
    .lerp(SKY_DUSK, dusk)
    .lerp(OVERCAST, wet * 0.6)
    .lerp(SKYN, dim);
  hemi.groundColor.copy(BOUNCE_DAY).lerp(BOUNCE_NIGHT, Math.min(1, dk / 0.78));
  // 's Ochtends wat extra licht uit de lucht: dan staat de zon laag achter de stad en zie je vooral de
  // schaduwkant van de huizen (zo begint een nieuw spel om 7 uur niet donker)
  const morning = G.clock < 12 ? low * (1 - Math.min(1, dk / 0.4)) : 0;
  hemi.intensity =
    (0.55 * (1 - dim * 0.7) + Math.max(0, 0.83 - sinEl) * 0.22) * (1 + 0.4 * wet) * (1 + 0.35 * morning);
  // Bij zonsopkomst en -ondergang kleurt de nevel aan de horizon warm; bij regen grijs
  fogNow
    .copy(moodFog)
    .lerp(FOGDUSK, dusk * 0.45 * (1 - wet))
    .lerp(OVERCAST, wet * 0.6)
    .lerp(FOGN, dk);
  finaleSky();
  setGradeTime(dusk * (1 - wet), wet);
  // (mist en achtergrondkleur zijn gezet in scene.ts)
  S3.fog!.color.copy(fogNow);
  (S3.background as T3.Color).copy(fogNow);
  WIN.emissiveIntensity = GLASS.emissiveIntensity = dk * 1.3;
  setBloomDarkness(dk);
  // Lampen rond het beeld, de dichtstbijzijnde eerst. Elk krijgt een lichtvlek op de grond (hooguit MAX_GLOWS:
  // ver uitgezoomd zijn het er soms heel veel) en de dichtstbijzijnde zes ook echt licht.
  const all = lights.filter(L => dist(L.x, L.y, cam.x, cam.y) < camDist() * 1.2);
  all.sort((a, b) => dist(a.x, a.y, cam.x, cam.y) - dist(b.x, b.y, cam.x, cam.y));
  let gi = 0;
  for (const L of all) {
    if (dk < 0.05 || gi >= MAX_GLOWS) break;
    const m = glow(gi++, L.warm);
    m.position.set(L.x, 0.04, L.y);
    m.scale.setScalar(L.r);
    m.material.color.setScalar(dk * (L.warm ? 0.42 : 0.32));
  }
  for (let i = gi; i < GLOWS.length; i++) GLOWS[i].visible = false;
  // Ver uitgezoomd geen echte lampen: die zouden maar een paar plekjes midden in beeld verlichten,
  // en alle andere lampen niet. De lichtvlekken op de grond zijn dan genoeg.
  const far = isFar();
  // Overdag (en van ver) halen we de lampen helemaal uit de scène: anders rekent de videokaart voor elk
  // pixel zes lampen door die toch uit staan
  // (met wat marge rond de grens van "ver", anders wisselen de lampen steeds heen en weer bij het zoomen)
  if (camDist() > FAR_DIST * 1.15) lampsFar = true;
  else if (camDist() < FAR_DIST * 0.95) lampsFar = false;
  const wantLamps = dk >= 0.05 && !lampsFar;
  if (wantLamps !== lampsIn) {
    lampsIn = wantLamps;
    for (const p of PL)
      if (wantLamps) S3.add(p);
      else S3.remove(p);
  }
  PL.forEach((p, i) => {
    const L = all[i];
    if (!L || dk < 0.05 || far) {
      p.intensity = 0;
      return;
    }
    p.position.set(L.x, 1.3, L.y);
    p.distance = L.r * 1.9;
    p.color.set(L.warm ? '#ffa95a' : '#dfe8ff');
    p.intensity = dk * (L.warm ? 0.95 : 1) * (1 + Math.sin(store.TM * 9 + i) * 0.05);
  });
}
