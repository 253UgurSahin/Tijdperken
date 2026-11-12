// Samen spelen: hoe een gedeeld dorp en een dagscore eruitzien, en hoe we wat anderen delen controleren.
// Puur rekenwerk: de verbinding met de gedeelde opslag staat in net/together.ts.

/** Eén gebouw in een gedeeld dorp: soort, en plek ten opzichte van het stamhuis. */
export type SharedBuilding = [type: string, x: number, y: number];

/** Een gedeeld dorp: een momentopname, om te bekijken (niet om mee verder te spelen). */
export interface SharedVillage {
  /** Naam van de stad (door het spel bedacht, zoals "Eikendal"). */
  place: string;
  people: string;
  age: number;
  day: number;
  pop: number;
  /** De gebouwen, met het stamhuis op (0, 0). */
  bs: SharedBuilding[];
  /** Wanneer gedeeld (ms sinds 1970). */
  at: number;
}

/** Je beste resultaat in de wereld van één dag. */
export interface DailyEntry {
  score: number;
  medal: string;
  won: boolean;
}

/** Wat één speler deelt (één document per speler, op zijn eigen id). */
export interface PlayerDoc {
  v: 1;
  /** Datum ("2026-11-12") → beste resultaat van die dag. */
  daily: Record<string, DailyEntry>;
  village: SharedVillage | null;
}

/** Zoveel dagen bewaren we per speler: de ranglijst gaat alleen over vandaag. */
export const DAILY_KEEP = 14;
/** Zoveel gebouwen per gedeeld dorp (genoeg voor een grote stad, en het document blijft klein). */
export const MAX_SHARED_BUILDINGS = 900;
const MEDAL_KEYS = ['goud', 'zilver', 'brons', ''];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isDate = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v);
/** Een stukje tekst van een ander: alleen gewone tekens, en niet te lang. */
const cleanText = (v: unknown, max: number): string =>
  typeof v === 'string'
    ? [...v]
        .filter(ch => ch.charCodeAt(0) >= 32 && ch !== '<' && ch !== '>')
        .join('')
        .slice(0, max)
    : '';

/**
 * Wat een andere speler deelde, gecontroleerd: alles wat niet klopt (verkeerde soort, onbekend gebouw, rare
 * getallen) valt weg. `known` zegt welke soorten gebouwen bestaan. Null als er niets bruikbaars in staat.
 */
export function cleanPlayer(raw: unknown, known: (type: string) => boolean): PlayerDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const daily: Record<string, DailyEntry> = {};
  if (o.daily && typeof o.daily === 'object')
    for (const [date, e] of Object.entries(o.daily as Record<string, unknown>)) {
      if (!isDate(date) || !e || typeof e !== 'object') continue;
      const d = e as Record<string, unknown>;
      if (!isNum(d.score) || d.score < 0) continue;
      daily[date] = {
        score: Math.round(d.score),
        medal: MEDAL_KEYS.includes(d.medal as string) ? (d.medal as string) : '',
        won: d.won === true,
      };
    }
  let village: SharedVillage | null = null;
  if (o.village && typeof o.village === 'object') {
    const v = o.village as Record<string, unknown>;
    const bs: SharedBuilding[] = [];
    if (Array.isArray(v.bs))
      for (const b of v.bs.slice(0, MAX_SHARED_BUILDINGS)) {
        if (!Array.isArray(b) || typeof b[0] !== 'string' || !known(b[0])) continue;
        if (
          !Number.isInteger(b[1]) ||
          !Number.isInteger(b[2]) ||
          Math.abs(b[1]) > 600 ||
          Math.abs(b[2]) > 600
        )
          continue;
        bs.push([b[0], b[1], b[2]]);
      }
    if (bs.length)
      village = {
        place: cleanText(v.place, 40) || 'Een dorp',
        people: cleanText(v.people, 20),
        age: isNum(v.age) ? Math.max(0, Math.min(8, Math.round(v.age))) : 0,
        day: isNum(v.day) ? Math.max(1, Math.round(v.day)) : 1,
        pop: isNum(v.pop) ? Math.max(0, Math.round(v.pop)) : 0,
        bs,
        at: isNum(v.at) ? v.at : 0,
      };
  }
  if (!village && !Object.keys(daily).length) return null;
  return { v: 1, daily, village };
}

/**
 * Een nieuwe dagscore erbij: de beste van die dag blijft staan (een medaille gaat nooit verloren), en oude
 * dagen vallen weg zodat het document klein blijft.
 */
export function mergeDaily(
  old: Record<string, DailyEntry>,
  date: string,
  entry: DailyEntry,
): Record<string, DailyEntry> {
  const out: Record<string, DailyEntry> = { ...old };
  const prev = out[date];
  out[date] = prev
    ? {
        score: Math.max(prev.score, entry.score),
        medal: betterMedal(prev.medal, entry.medal),
        won: prev.won || entry.won,
      }
    : entry;
  for (const d of Object.keys(out).sort().reverse().slice(DAILY_KEEP)) delete out[d];
  return out;
}

/** De beste van twee medailles ('' = geen). */
export function betterMedal(a: string, b: string): string {
  const rank = (m: string) => (MEDAL_KEYS.includes(m) ? MEDAL_KEYS.indexOf(m) : MEDAL_KEYS.length);
  return rank(a) <= rank(b) ? a : b;
}

/** Eén regel op de ranglijst. */
export interface Ranked {
  id: string;
  entry: DailyEntry;
  rank: number;
}

/** De ranglijst van één dag: hoogste score eerst; gelijke scores delen een plaats. */
export function leaderboard(players: { id: string; doc: PlayerDoc }[], date: string): Ranked[] {
  const rows = players
    .filter(p => p.doc.daily[date])
    .map(p => ({ id: p.id, entry: p.doc.daily[date], rank: 0 }))
    .sort((a, b) => b.entry.score - a.entry.score || a.id.localeCompare(b.id));
  rows.forEach(
    (r, i) => (r.rank = i > 0 && rows[i - 1].entry.score === r.entry.score ? rows[i - 1].rank : i + 1),
  );
  return rows;
}
