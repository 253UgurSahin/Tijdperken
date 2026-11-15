// Rekenwerk voor het instorten van een gebouw: hoe het valt, hoe de puinhoop eruitziet en hoe erg de schade is.
import { hash2 } from './random';

/** Zo lang (seconden) duurt het instorten, en zo lang blijft de puinhoop liggen. */
export const COLLAPSE_TIME = 0.7;
export const RUIN_LIFE = 25;

/** De houding van een instortend gebouw: hoe hoog nog (1 = heel), hoeveel het wegzakt en hoe schuin het hangt. */
export interface CollapsePose {
  scaleY: number;
  sink: number;
  tilt: number;
}

/**
 * De houding na t seconden instorten. Eerst langzaam, dan steeds sneller (zoals iets echt valt): daarom t * t.
 * De kanteling is altijd positief; vermenigvuldig hem met tiltSign() voor de kant waarop het gebouw valt.
 */
export function collapseAt(t: number): CollapsePose {
  const k = Math.min(1, Math.max(0, t / COLLAPSE_TIME)),
    fall = k * k;
  // (+ 0 maakt van -0 gewoon 0)
  return { scaleY: 1 - 0.85 * fall, sink: -0.1 * fall + 0, tilt: 0.15 * fall };
}

/** Naar welke kant een gebouw valt (-1 of 1): vast per gebouwnummer, dus elke keer hetzelfde. */
export const tiltSign = (id: number): number => (hash2(id, 17, 5) < 0.5 ? -1 : 1);

/** Eén brok puin: plek (vanaf het midden), grootte, draaiing en tint (0 = donkerste, 1 = lichtste kleur). */
export interface RubbleChunk {
  x: number;
  z: number;
  s: number;
  rot: number;
  shade: number;
}

/**
 * De brokken van een puinhoop voor een gebouw van `size` tegels breed. Altijd 4 tot 7 brokken, en elk brok
 * (met zijn grootte erbij) blijft binnen 0,9 maal de breedte van het gebouw.
 */
export function rubbleLayout(size: number, seed: number): RubbleChunk[] {
  const n = 4 + Math.floor(hash2(seed, 1, 9) * 4),
    half = size * 0.45,
    chunks: RubbleChunk[] = [];
  for (let i = 0; i < n; i++) {
    const s = size * (0.1 + hash2(seed, i, 11) * 0.11),
      room = Math.max(0, half - s);
    // Het eerste brok ligt in het midden (de hoogste berg), de rest eromheen
    const reach = i === 0 ? 0.15 : 0.4 + hash2(seed, i, 12) * 0.6,
      a = hash2(seed, i, 13) * Math.PI * 2;
    chunks.push({
      x: Math.cos(a) * room * reach,
      z: Math.sin(a) * room * reach,
      s: i === 0 ? s * 1.3 : s,
      rot: hash2(seed, i, 14) * Math.PI * 2,
      shade: hash2(seed, i, 15),
    });
  }
  // Het middelste brok is groter gemaakt: houd het toch binnen de rand
  chunks[0].s = Math.min(chunks[0].s, half - Math.hypot(chunks[0].x, chunks[0].z));
  return chunks;
}

/** Hoe erg een gebouw beschadigd is: 0 = gaat wel, 1 = rookt (onder de helft), 2 = rookt en brandt (onder een kwart). */
export function damageTier(hp: number, maxHp: number): 0 | 1 | 2 {
  if (maxHp <= 0) return 0;
  const f = hp / maxHp;
  return f < 0.25 ? 2 : f < 0.5 ? 1 : 0;
}
