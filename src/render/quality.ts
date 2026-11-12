// Beeldkwaliteit. Vast (laag / middel / hoog) of automatisch: automatisch begint hoog en zet
// zelf de resolutie en zware effecten lager als het spel hapert, en weer hoger als er ruimte is.
// Zo blijft het op elk apparaat vloeiend.
import type * as T3 from 'three';
import { store } from '../core/store';
import { SET, saveSet } from '../core/settings';
import { configurePost, type PostSettings } from './post';
import { PL, requestResize, resize, sun } from './scene';
import { setScatterDensity } from './scatter';
import { setFineDetail } from './terrainlook';
import { setNodeDetail } from './nodes';
import { precompileNightShaders } from './lighting';

/** Eén kwaliteitsstand: naam, resolutie-factor, maximum aantal pixels, schaduwen en nabewerking. */
interface QualityLevel extends PostSettings {
  name: string;
  scale: number;
  pixels: number;
  shadows: boolean;
  shadowMap: number;
  /** false: geen deeltjes (rook, stof, vonken). */
  particles?: boolean;
  /** Hoeveel grassprieten en steentjes (0-1), en of grond, water, bomen en bergen fijn getekend worden. */
  scatter: number;
  fine: boolean;
  /** Hoeveel lampen 's nachts echt licht geven (de lichtvlekken op de grond zijn er altijd). */
  lamps: number;
}
export const LEVELS: Record<string, QualityLevel> = {
  low: {
    name: 'Laag',
    scale: 0.7,
    pixels: 2.2e6,
    shadows: false,
    shadowMap: 1024,
    post: false,
    bloom: false,
    outline: true, // de omlijning kost bijna niets (zie outline.ts)
    particles: false,
    scatter: 0, // geen grassprieten en steentjes
    fine: false, // eenvoudiger grond, water, bomen en bergen
    lamps: 0, // een nacht kost dan net zoveel als een dag
  },
  mid: {
    name: 'Middel',
    scale: 0.85,
    pixels: 3.8e6,
    shadows: true,
    shadowMap: 1024,
    post: true,
    bloom: false,
    outline: true,
    scatter: 0.5,
    fine: true,
    lamps: 3,
  },
  high: {
    name: 'Hoog',
    scale: 1,
    // Ongeveer 1440p-ultrawide. Een 4K- of 5K2K-scherm rekent met minder pixels en wordt verscherpt opgeschaald:
    // het verschil zie je nauwelijks, de videokaart wel (dat was de grootste oorzaak van haperen)
    pixels: 6e6,
    shadows: true,
    shadowMap: 2048,
    post: true,
    bloom: true,
    outline: true,
    sharpen: 0.22,
    hdr: true, // felle kleuren: alleen echte lichten gloeien
    scatter: 1,
    fine: true,
    lamps: 6,
  },
};
const ORDER = ['low', 'mid', 'high'];
const COARSE = matchMedia('(pointer:coarse)').matches; // telefoon/tablet: start een stapje lager

let tooHeavy = '',
  tooHeavyAt = 0;
let level: string = 'high',
  frames: number = 0,
  time: number = 0,
  slow: number = 0,
  fast: number = 0;
// Hoeveel lampen er nu licht geven (-1: nog niet ingesteld, bij het opstarten)
let lampCount = -1;
/**
 * Een stap omlaag die we nog beoordelen: hoe vloeiend het ervoor liep, de stand en resolutie van daarvoor (om
 * terug te kunnen) en hoeveel metingen van een seconde er sindsdien zijn geweest.
 */
interface StepTrial {
  fps: number;
  level: string;
  scale: number;
  tooHeavy: string;
  tooHeavyAt: number;
  windows: number;
}
let trial: StepTrial | null = null;
/**
 * Het plafond van dit apparaat (beeldjes per seconde), als we dat kennen: een telefoon die stroom spaart of een
 * laptop op de accu tekent vaak hooguit 30 beeldjes per seconde, hoe licht het beeld ook is. Een stap omlaag
 * maakt het dan niet vloeiender, alleen lelijker. 0 = geen plafond bekend.
 */
let capFps = 0;
// De stappen (stand en resolutie) die we bij dit plafond al eens hebben teruggedraaid: dat doen we maar één keer
const undoneSteps = new Set<string>();

/** Eigen keuze uit de instellingen: schaduwen, gloed, omlijning en resolutie los aan of uit. */
function customLevel(): QualityLevel {
  const g = SET.gfx || {};
  return {
    name: 'Aangepast',
    scale: g.scale || 1,
    pixels: 14e6,
    shadows: !!g.shadows,
    shadowMap: 2048,
    post: !!(g.bloom || g.outline),
    bloom: !!g.bloom,
    outline: !!g.outline,
    particles: g.particles !== false,
    sharpen: g.bloom ? 0.22 : 0,
    hdr: !!g.bloom,
    scatter: g.shadows ? 1 : 0.5,
    fine: (g.scale || 1) >= 0.8,
    lamps: g.shadows ? 6 : 3,
  };
}

// later = true: de nieuwe resolutie pas vlak vóór het volgende beeldje instellen. Een canvas
// van grootte veranderen maakt het leeg; midden in een beeldje gaf dat een kort zwart beeld.
function apply(name: string, later?: boolean) {
  level = name;
  const L = name === 'custom' ? customLevel() : LEVELS[name];
  store.resScale = L.scale;
  store.pixelBudget = L.pixels; // maximaal aantal pixels voor de 3D-wereld
  store.quality = name;
  store.noParticles = L.particles === false;
  sun.castShadow = L.shadows;
  if (sun.shadow.mapSize.x !== L.shadowMap) {
    sun.shadow.mapSize.set(L.shadowMap, L.shadowMap);
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      // Leeg maken: three.js maakt dan een nieuwe in het juiste formaat (de types kennen deze lege stand niet)
      (sun.shadow as { map: T3.WebGLRenderTarget | null }).map = null;
    }
  }
  configurePost(L);
  setScatterDensity(L.scatter);
  setFineDetail(L.fine);
  setNodeDetail(L.fine);
  // Lampen die uit staan doen niet mee in de shaders: op Laag kost een nacht zo net zoveel als een dag
  PL.forEach((p, i) => (p.visible = i < L.lamps));
  // Een ander aantal lampen geeft andere nachtshaders: die maken we nu klaar, anders hapert de eerste
  // schemering. (Bij het opstarten doet main.ts dat na het eerste beeldje.)
  if (lampCount >= 0 && L.lamps !== lampCount && L.lamps > 0) precompileNightShaders();
  lampCount = L.lamps;
  if (later) requestResize();
  else resize();
}

/** Kies de kwaliteit uit de instelling (bij opstarten en als de speler hem verandert). */
export function initQuality() {
  if (!SET.quality) SET.quality = 'auto';
  trial = null;
  capFps = 0;
  undoneSteps.clear();
  apply(SET.quality === 'auto' ? (COARSE ? 'mid' : 'high') : SET.quality);
}

export function setQuality(q: string) {
  SET.quality = q;
  saveSet();
  initQuality();
}

/**
 * Na een stap omlaag: liep het daarna minstens 10% vloeiender? Zo niet, dan zat het apparaat aan een plafond
 * (of lag het niet aan het tekenen) en draaien we de stap terug. De eerste seconde na de stap tellen we niet
 * mee: daarin zit de hapering van het omschakelen zelf.
 */
function judgeStep(t: StepTrial, fps: number) {
  t.windows++;
  if (t.windows === 1) return;
  if (fps >= t.fps * 1.1) {
    trial = null; // het hielp: de stap blijft
    return;
  }
  if (t.windows < 3) return; // nog een seconde afwachten
  trial = null;
  const step = t.level + '@' + t.scale;
  if (undoneSteps.has(step)) return; // deze stap draaiden we al eens terug: nu laten we hem staan
  undoneSteps.add(step);
  capFps = t.fps;
  // Terug naar de stand en resolutie van vóór de stap; die stand was dus niet "te zwaar"
  tooHeavy = t.tooHeavy;
  tooHeavyAt = t.tooHeavyAt;
  if (level !== t.level) apply(t.level, true);
  store.resScale = t.scale;
  requestResize();
  slow = fast = 0;
}

/**
 * Elk beeldje: bij "automatisch" meten we per seconde hoe vloeiend het loopt.
 * Twee seconden onder ~45 beeldjes/s: een stap omlaag. Vijf seconden ruim boven ~57: een stap omhoog.
 * Tussen de stappen schuift ook de resolutie mee, zodat het niet ineens veel lelijker wordt.
 */
export function tickQuality(rdt: number) {
  if (SET.quality !== 'auto' || document.hidden) return;
  // Eén traag beeldje na terugkomen op het tabblad (of na een hapering van de browser) zegt niets
  if (rdt > 0.25) return;
  frames++;
  time += rdt;
  if (time < 1) return;
  const fps = frames / time;
  frames = 0;
  time = 0;
  if (trial) {
    judgeStep(trial, fps);
    return;
  }
  // Duidelijk sneller dan het plafond: dat is er niet meer (bijv. de telefoon spaart geen stroom meer)
  if (capFps && fps > capFps * 1.15) {
    capFps = 0;
    undoneSteps.clear();
  }
  if (fps < 35) {
    // Flink haperen: niet wachten, meteen een stap omlaag
    slow = 2;
    fast = 0;
  } else if (fps < 45) {
    slow++;
    fast = 0;
  } else if (fps > 57) {
    fast++;
    slow = 0;
  } else slow = fast = 0;
  // Op het plafond (tot 5% eronder): een stap omlaag maakt het niet vloeiender, dus die zetten we niet
  if (capFps && fps >= capFps * 0.95) slow = 0;
  const L = LEVELS[level];
  // store.resScale is gezet door apply() (via initQuality bij het opstarten)
  if (slow >= 2) {
    slow = 0;
    const before: StepTrial = { fps, level, scale: store.resScale!, tooHeavy, tooHeavyAt, windows: 0 };
    // Onthoud dat deze stand te zwaar was: daar gaan we de eerste anderhalve minuut niet naar terug
    // (anders springt het elke tien seconden heen en weer, en elke wissel geeft zelf een hapering)
    tooHeavy = level;
    tooHeavyAt = performance.now();
    if (store.resScale! > L.scale - 0.2 + 0.01) {
      store.resScale = Math.max(0.5, store.resScale! - (fps < 35 ? 0.2 : 0.1));
      requestResize();
    } else if (ORDER.indexOf(level) > 0) apply(ORDER[ORDER.indexOf(level) - 1], true);
    else if (store.resScale! > 0.5) {
      store.resScale = Math.max(0.5, store.resScale! - 0.1);
      requestResize();
    }
    // Hielp de stap? Dat zien we in de seconden hierna (zie judgeStep)
    if (level !== before.level || store.resScale !== before.scale) trial = before;
  } else if (fast >= 5) {
    fast = 0;
    if (store.resScale! < L.scale - 0.01) {
      store.resScale = Math.min(L.scale, store.resScale! + 0.1);
      requestResize();
    } else if (ORDER.indexOf(level) < ORDER.length - 1) {
      const up = ORDER[ORDER.indexOf(level) + 1];
      if (up !== tooHeavy || performance.now() - tooHeavyAt > 90000) apply(up, true);
    }
  }
}
