// Toont het bereik van voorzieningen als een zacht gekleurd vlak over de kaart.
import * as T3 from 'three';
import type { Building, GameState } from '../types';
import { H, W } from '../config';
import { store } from '../core/store';
import { B } from '../data/buildings';
import { SERVICE_BY_KEY, isServiceKey } from '../data/services';
import type { ServiceKey } from '../data/services';
import {
  coverGrid,
  coverTip,
  coverVersion,
  footprintInDisc,
  isHome,
  servesOfType,
  sourceActive,
} from '../game/coverage';
import { darkness } from '../game/time';
import { ghostPos } from '../game/placement';
import { G, bById, sel } from '../game/state';
import { mouse } from '../input/input';
import { quadAt, rangeAt, ringAt } from './decals';
import { CAM3, S3 } from './scene';

const COVERED = '#7fd65a',
  NOT_COVERED = '#5d626e';

// Eén plat vlak over de hele kaart met één beeldpunt per tegel (alleen de doorzichtigheid telt: 255 = in bereik)
let plane: T3.Mesh<T3.PlaneGeometry, T3.MeshBasicMaterial> | null = null,
  pixels = new Uint8Array(0),
  tex: T3.DataTexture | null = null;
// Wat er nu in het plaatje staat, zodat we het alleen opnieuw vullen als er iets veranderde
let shownKey: ServiceKey | null = null,
  shownVersion = -1;
/** Hoe vaak het plaatje opnieuw gevuld is (om te controleren dat dat niet elk beeldje gebeurt). */
export let coverRebuilds = 0;
let lastSel: number | null = null,
  lastG: GameState | null = null;

/**
 * Eén beeldpunt per tegel geeft van dichtbij trapjes. Het zachte mengen tussen tegels maakt van "binnen" (1) en
 * "buiten" (0) een glooiing; waar die door 0,5 gaat, ligt een vloeiende grens. Daar tekenen we een duidelijke
 * rand, en binnen de grens een zachte kleur.
 */
function smoothEdges(shader: T3.Shader): void {
  // (In onBeforeCompile staan de stukjes nog als #include: we vervangen het hele kaartstuk door onze eigen regels)
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <map_fragment>',
    `float cover = texture2D( map, vUv ).a;
    float inside = smoothstep( 0.44, 0.56, cover );
    float rim = inside * ( 1.0 - smoothstep( 0.58, 0.74, cover ) );
    diffuseColor.a *= inside * uFill + rim * 0.42;`,
  );
  // De vulling is onverlicht: 's nachts zachter, anders is het vlak het helderste van het beeld (de rand blijft)
  shader.fragmentShader = 'uniform float uFill;\n' + shader.fragmentShader;
  shader.uniforms.uFill = fillStrength;
}
const fillStrength = { value: 0.24 };

function makePlane(): void {
  if (plane) {
    S3.remove(plane);
    plane.geometry.dispose();
    plane.material.dispose();
    tex!.dispose();
  }
  // Wit met doorzichtigheid 0; fillTexture zet alleen de doorzichtigheid, de kleur komt uit het materiaal
  pixels = new Uint8Array(W * H * 4).fill(255);
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 0;
  tex = new T3.DataTexture(pixels, W, H, T3.RGBAFormat);
  tex.magFilter = T3.LinearFilter;
  tex.minFilter = T3.LinearFilter;
  const geo = new T3.PlaneGeometry(W, H);
  geo.rotateX(-Math.PI / 2);
  const material = new T3.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  material.onBeforeCompile = smoothEdges;
  material.customProgramCacheKey = () => 'coverage-area';
  plane = new T3.Mesh(geo, material);
  plane.position.set(W / 2, 0.035, H / 2);
  plane.renderOrder = 3;
  plane.frustumCulled = false;
  S3.add(plane);
  shownVersion = -1;
}

// Werkgeheugen voor het vervagen (per rij opgeteld), zodat er per keer niets nieuws gemaakt hoeft te worden
let rowSum = new Uint16Array(0);

/**
 * Het plaatje vullen: tegels binnen bereik ondoorzichtig, de rest doorzichtig. We vervagen het een beetje
 * (1-2-1 in beide richtingen): dan wordt de grens van een cirkel rond in plaats van hoekig.
 */
function fillTexture(k: ServiceKey): void {
  const grid = coverGrid(k);
  if (rowSum.length !== W * H) rowSum = new Uint16Array(W * H);
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x = 0; x < W; x++) {
      const left = grid[o + (x > 0 ? x - 1 : x)] ? 1 : 0,
        mid = grid[o + x] ? 2 : 0,
        right = grid[o + (x < W - 1 ? x + 1 : x)] ? 1 : 0;
      rowSum[o + x] = left + mid + right; // 0 tot 4
    }
  }
  // Rij y van de kaart staat in rij H-1-y van het plaatje, omdat het platte vlak andersom ligt
  for (let y = 0; y < H; y++) {
    const up = (y > 0 ? y - 1 : y) * W,
      here = y * W,
      down = (y < H - 1 ? y + 1 : y) * W,
      row = (H - 1 - y) * W;
    for (let x = 0; x < W; x++) {
      const sum = rowSum[up + x] + 2 * rowSum[here + x] + rowSum[down + x]; // 0 tot 16
      pixels[(row + x) * 4 + 3] = sum * 16 - (sum >> 4); // 16 → 255
    }
  }
  plane!.material.color.set(SERVICE_BY_KEY[k].c);
  tex!.needsUpdate = true;
  coverRebuilds++;
}

/** Welke voorziening we laten zien: de knop 'Toon bereik', anders wat je plaatst, anders wat je koos. */
function shownService(): ServiceKey | null {
  if (store.coverView && isServiceKey(store.coverView)) return store.coverView;
  if (store.placing && B[store.placing]) {
    const list = servesOfType(store.placing);
    if (list.length) return list[0].k;
  }
  const sb = sel.b ? bById.get(sel.b) : undefined;
  if (sb) {
    const list = servesOfType(sb.type);
    if (list.length) return list[0].k;
  }
  return null;
}

// Wat de camera ziet, om huizen buiten beeld over te slaan
const viewFrustum = new T3.Frustum(),
  viewMatrix = new T3.Matrix4(),
  viewPoint = new T3.Vector3();
function inView(b: Building): boolean {
  const s = B[b.type].size;
  viewPoint.set(b.x + s / 2, 0, b.y + s / 2);
  return viewFrustum.containsPoint(viewPoint);
}

/** Een gekleurd vlakje over de grond van een gebouw. */
function tint(b: Building, col: string, op: number): void {
  const s = B[b.type].size;
  // Iets groter dan het gebouw zelf: het huis staat erop, dus alleen de rand eromheen is te zien
  quadAt(b.x + s / 2, b.y + s / 2, s + 0.3, s + 0.3, col, op, 0.04);
}

/** Elk beeldje (zie render.ts): het vlak, de huizen erin en eruit, en de cirkels. */
export function drawCoverage(): void {
  // Een nieuw spel of een andere keuze: de knop 'Toon bereik' gaat weer uit
  if (lastG !== G) {
    lastG = G;
    store.coverView = null;
  }
  if (sel.b !== lastSel) {
    store.coverView = null;
    lastSel = sel.b;
    const sb = sel.b ? bById.get(sel.b) : undefined;
    if (sb && servesOfType(sb.type).length && sb.type !== 'townhall') coverTip();
  }
  drawSelectedHome();
  const k = shownService();
  if (!k) {
    if (plane) plane.visible = false;
    return;
  }
  if (!plane || pixels.length !== W * H * 4) makePlane();
  if (k !== shownKey || coverVersion() !== shownVersion) {
    fillTexture(k);
    shownKey = k;
    shownVersion = coverVersion();
  }
  plane!.visible = true;
  fillStrength.value = 0.24 - 0.09 * (darkness() / 0.78);
  const colour = SERVICE_BY_KEY[k].c,
    grid = coverGrid(k);

  // Plaats je een voorziening met de muis: de cirkel van het voorbeeld en welke huizen er nieuw bij komen
  let ghost: { cx: number; cy: number; r: number } | null = null;
  if (store.placing && mouse.in && !mouse.touch) {
    const d = B[store.placing],
      serves = servesOfType(store.placing);
    if (serves.length) {
      const [gx, gy] = ghostPos();
      for (const s of serves) rangeAt(gx + d.size / 2, gy + d.size / 2, s.r, SERVICE_BY_KEY[s.k].c);
      const mine = serves.find(s => s.k === k);
      if (mine) ghost = { cx: gx + d.size / 2, cy: gy + d.size / 2, r: mine.r };
    }
  }

  // Huizen: groen als ze erbij horen, grijs als niet, en in de kleur van de voorziening als het voorbeeld ze
  // erbij zou halen. Alleen huizen in beeld, en niet te veel (op Laag minder).
  viewMatrix.multiplyMatrices(CAM3.projectionMatrix, CAM3.matrixWorldInverse);
  viewFrustum.setFromProjectionMatrix(viewMatrix);
  let left = store.quality === 'low' ? 150 : 400;
  for (const b of G.bs) {
    if (left <= 0) break;
    if (!isHome(b) || !inView(b)) continue;
    const s = B[b.type].size;
    let covered = false;
    for (let dy = 0; dy < s && !covered; dy++)
      for (let dx = 0; dx < s && !covered; dx++) if (grid[(b.y + dy) * W + b.x + dx]) covered = true;
    // Huizen die het voorbeeld erbij haalt, knipperen zacht: zo zie je ze los van de huizen die het al hebben
    if (!covered && ghost && footprintInDisc(ghost.cx, ghost.cy, ghost.r, b.x, b.y, s))
      tint(b, colour, 0.5 + 0.3 * Math.sin(store.TM * 5));
    else tint(b, covered ? COVERED : NOT_COVERED, covered ? 0.45 : 0.35);
    left--;
  }

  // Een gekozen gebouw met een bereik: een scherpe cirkel om elke voorziening (de zachte rand van het vlak is
  // wat hoekig). Niet waar render.ts al de witte verdedigingscirkel even groot tekent: dat zou dubbel zijn.
  // Een gekozen huis: zie drawSelectedHome.
  const sb = sel.b ? bById.get(sel.b) : undefined;
  if (!sb || store.placing || isHome(sb)) return;
  const sd = B[sb.type];
  for (const s of servesOfType(sb.type)) {
    if (SERVICE_BY_KEY[s.k].age > G.age || (sd.def && s.r === sd.def.r)) continue;
    rangeAt(sb.x + sd.size / 2, sb.y + sd.size / 2, s.r, SERVICE_BY_KEY[s.k].c);
  }
}

/** Een gekozen huis: de cirkels van alles wat het bereikt, elk in de kleur van zijn voorziening. */
function drawSelectedHome(): void {
  const sb = sel.b ? bById.get(sel.b) : undefined;
  if (!sb || store.placing || !isHome(sb)) return;
  const size = B[sb.type].size;
  for (const src of G.bs) {
    if (!sourceActive(src)) continue;
    const d = B[src.type],
      cx = src.x + d.size / 2,
      cy = src.y + d.size / 2;
    for (const s of servesOfType(src.type)) {
      const def = SERVICE_BY_KEY[s.k];
      if (def.age > G.age || !footprintInDisc(cx, cy, s.r, sb.x, sb.y, size)) continue;
      rangeAt(cx, cy, s.r, def.c);
      ringAt(cx, cy, 0.5 + d.size * 0.35, def.c, 0.85); // en een ring om de bron zelf
    }
  }
}
