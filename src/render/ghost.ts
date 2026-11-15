// Het doorzichtige voorbeeld als je een gebouw plaatst.
import * as T3 from 'three';
import { store } from '../core/store';
import { B } from '../data/buildings';
import { charmFrom, farmBoostOf } from '../data/charm';
import { buildCost, canPlace, ghostPos, lineTiles } from '../game/placement';
import { has } from '../game/economy';
import { G } from '../game/state';
import type { Tile } from '../types';
import { LINK_AUTO, needsRoad, ringTiles } from '../data/roads';
import { W, H } from '../config';
import { onRoadNet, planRoadLink, roadLinkCost, roadVersion, unlinkedBuildings } from '../game/roads';
import { drag, mouse } from '../input/input';
import { quadAt, rangeAt } from './decals';
import { isMesh } from './kit';
import { makeBuilding } from './models';
import { S3 } from './scene';

const ghostCache: Record<string, T3.Group> = {};
const GHOK = new T3.MeshStandardMaterial({
    color: '#6fe08a',
    transparent: true,
    opacity: 0.55,
    flatShading: true,
    depthWrite: false,
  }),
  GHBAD = new T3.MeshStandardMaterial({
    color: '#ff6a58',
    transparent: true,
    opacity: 0.55,
    flatShading: true,
    depthWrite: false,
  });
function ghost(type: string): T3.Group {
  if (ghostCache[type]) return ghostCache[type];
  const g = makeBuilding(type, G.age, null);
  g.traverse(o => {
    if (isMesh(o)) {
      o.castShadow = false;
      o.renderOrder = 4;
    }
  });
  S3.add(g);
  return (ghostCache[type] = g);
}
// Het pad dat bij het plaatsen vanzelf zou komen. Alleen opnieuw zoeken als de plek, de soort of het net verandert.
let planKey = '',
  planTiles: Tile[] | null = null;
/** Het geplande pad voor een gebouw van deze soort op deze plek ([] = ligt al aan de weg, null = te ver). */
export function ghostRoadPlan(type: string, x: number, y: number): Tile[] | null {
  const key = `${type}/${x}/${y}/${roadVersion()}`;
  if (key !== planKey) {
    planKey = key;
    planTiles = planRoadLink({ type, x, y });
  }
  return planTiles;
}
/**
 * Legt het spel dit pad vanzelf aan bij het plaatsen? Alleen als het kort genoeg is en je zowel het gebouw
 * als het pad kunt betalen (eerst wordt het gebouw betaald, dan het pad).
 */
export function roadPlanIsAuto(type: string, plan: Tile[]): boolean {
  if (plan.length > LINK_AUTO) return false;
  const total: Record<string, number> = { ...buildCost(type) };
  const link = roadLinkCost(plan);
  for (const k in link) total[k] = (total[k] || 0) + link[k];
  return has(total);
}
function hideGhosts(except?: string | null) {
  for (const k in ghostCache) if (k !== except) ghostCache[k].visible = false;
}
export function drawPlacement() {
  if (!store.placing || !mouse.in || mouse.touch) {
    hideGhosts();
    return;
  }
  const d = B[store.placing];
  // Een pad leggen: gebouwen die nog niet aan de weg liggen oranje, zodat je ziet waar je heen moet slepen
  if (d.road) showUnlinked();
  if (drag && drag.mode === 'line') {
    hideGhosts();
    const budget = { ...G.res };
    for (const [x, y] of lineTiles(drag.t0, drag.t1)) {
      const err = canPlace(store.placing, x, y, true);
      let ok = !err;
      if (ok) {
        for (const k in d.cost) if (budget[k] < d.cost[k]) ok = false;
        if (ok) for (const k in d.cost) budget[k] -= d.cost[k];
      }
      quadAt(x + 0.5, y + 0.5, 0.96, 0.96, ok ? '#59d27a' : '#e5584a', 0.55);
    }
    return;
  }
  const [gx, gy] = ghostPos(),
    err = canPlace(store.placing, gx, gy),
    s = d.size;
  hideGhosts(store.placing);
  if (!d.road) {
    const g = ghost(store.placing);
    g.visible = true;
    g.position.set(gx + s / 2, 0, gy + s / 2);
    g.traverse(o => {
      if (isMesh(o)) o.material = err ? GHBAD : GHOK;
    });
  }
  for (let dy = 0; dy < s; dy++)
    for (let dx = 0; dx < s; dx++)
      quadAt(gx + dx + 0.5, gy + dy + 0.5, 0.94, 0.94, err ? '#e5584a' : '#59d27a', 0.5);
  if (d.def || d.light) rangeAt(gx + s / 2, gy + s / 2, d.def ? d.def.r : d.light!, '#ffffff');
  showNeighbours(store.placing, gx, gy);
  if (needsRoad(d) && !canPlace(store.placing, gx, gy, true)) showRoadPlan(store.placing, gx, gy);
}

/**
 * Bij een gebouw dat een weg nodig heeft: de tegels pad die erbij komen (fel als het spel ze vanzelf legt, zacht
 * als je ze zelf moet slepen), en groen waar het gebouw de weg al raakt.
 */
function showRoadPlan(type: string, gx: number, gy: number) {
  const plan = ghostRoadPlan(type, gx, gy);
  if (!plan) return;
  const auto = roadPlanIsAuto(type, plan);
  for (const [x, y] of plan) quadAt(x + 0.5, y + 0.5, 0.9, 0.9, '#e0b04a', auto ? 0.55 : 0.25, 0.035);
  for (const i of ringTiles(gx, gy, B[type].size, W, H))
    if (onRoadNet(i)) quadAt((i % W) + 0.5, ((i / W) | 0) + 0.5, 0.9, 0.9, '#7fd65a', 0.35, 0.035);
}
function showUnlinked() {
  for (const b of unlinkedBuildings()) {
    const s = B[b.type].size;
    quadAt(b.x + s / 2, b.y + s / 2, s + 0.1, s + 0.1, '#e0a63a', 0.4, 0.04);
  }
}

/**
 * Versiering, fabrieken en waterputten raken hun buren (zie data/charm.ts). Bij het plaatsen zie je het bereik
 * en welke huizen (roze: gezelliger, grijs: somberder) of akkers (groen: sneller) er iets van merken.
 */
function showNeighbours(type: string, gx: number, gy: number) {
  const d = B[type];
  if (!d.charm && !d.aura) return;
  const s = d.size,
    here = { type, x: gx, y: gy };
  const r = d.charm ? d.charm.r : d.aura!.r;
  rangeAt(gx + s / 2, gy + s / 2, r, d.charm && d.charm.v < 0 ? '#8a8f99' : '#f08ab0');
  for (const b of G.bs) {
    if (!b.done) continue;
    const bd = B[b.type];
    let col = '';
    if (bd.pop && charmFrom(B, here, b) !== 0) col = d.charm!.v > 0 ? '#f08ab0' : '#6b6f78';
    else if (bd.work && d.aura && farmBoostOf(B, b, [here]) > 1) col = '#7fd65a';
    if (!col) continue;
    for (let dy = 0; dy < bd.size; dy++)
      for (let dx = 0; dx < bd.size; dx++) quadAt(b.x + dx + 0.5, b.y + dy + 0.5, 0.9, 0.9, col, 0.45);
  }
}
