// Samen spelen via de gedeelde opslag van de Claude-artifact: je dorp delen, de ranglijst van de wereld van de dag,
// en de dorpen van anderen bekijken. Buiten de artifact (GitHub Pages, een los bestand) bestaat dit niet en blijft
// het onderdeel verborgen. Wie alleen mag kijken, ziet de ranglijst en dorpen maar kan zelf niets delen.
import { B } from '../data/buildings';
import { cleanPlayer, mergeDaily, MAX_SHARED_BUILDINGS } from '../data/together';
import type { DailyEntry, PlayerDoc, SharedBuilding, SharedVillage } from '../data/together';

// ---- Het stukje van de artifact-API dat we gebruiken (zie de capability-types van claude.ai) ----
interface Snapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
interface DocRef {
  get(): Promise<Snapshot>;
  set(data: Record<string, unknown>): Promise<void>;
}
interface QueryRef {
  get(): Promise<{ docs: Snapshot[] }>;
}
interface CollectionRef {
  doc(id: string): DocRef;
  limit(n: number): QueryRef;
}
interface SharedDb {
  collection(path: string): CollectionRef;
}
/** Hoe een ander er voor deze kijker uitziet. Namen bewaren we nooit: alleen het id. */
export interface Person {
  name: string;
  avatarUrl: string;
  isMe: boolean;
}
interface UserApi {
  id(): Promise<string | null>;
  can(what: string): Promise<boolean | null>;
  profiles(ids: readonly string[]): Promise<Record<string, Person>>;
}
interface ClaudeHost {
  use(name: string): Promise<unknown>;
}

/** Wat een verbinding kan: lezen kan altijd, schrijven alleen als `canWrite`. */
export interface Together {
  /** Jouw id (null: je bent hier anoniem en kunt niets delen). */
  me: string | null;
  canWrite: boolean;
  players(): Promise<{ id: string; doc: PlayerDoc }[]>;
  people(ids: string[]): Promise<Record<string, Person>>;
  shareVillage(v: SharedVillage): Promise<void>;
  shareDaily(date: string, entry: DailyEntry): Promise<void>;
}

const PLAYERS = 'players';
const known = (type: string): boolean => !!B[type];
let connecting: Promise<Together | null> | null = null;

/** Verbinden met de gedeelde opslag (één keer; daarna steeds hetzelfde antwoord). Null = niet beschikbaar. */
export function connect(): Promise<Together | null> {
  if (!connecting) connecting = open().catch(() => null);
  return connecting;
}

async function open(): Promise<Together | null> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (!host || typeof host.use !== 'function') return null;
  const [db, user] = (await Promise.all([host.use('db'), host.use('user')])) as [
    SharedDb | null,
    UserApi | null,
  ];
  if (!db || !user) return null;
  const me = await user.id();
  // null = het platform zegt niets: dan proberen we het, en een geweigerde schrijfactie beslist
  const may = me ? await user.can('data.write') : false;
  const players = db.collection(PLAYERS);
  // Eén schrijfactie tegelijk op je eigen document (zo vraagt de opslag het)
  let queue: Promise<void> = Promise.resolve();
  const write = (change: (old: PlayerDoc) => PlayerDoc): Promise<void> => {
    const run = queue.then(async () => {
      if (!me) throw new Error('Geen id');
      const ref = players.doc(me);
      const snap = await ref.get();
      const old = (snap.exists && cleanPlayer(snap.data(), known)) || { v: 1, daily: {}, village: null };
      await ref.set(change(old) as unknown as Record<string, unknown>);
    });
    queue = run.catch(() => {});
    return run;
  };
  const together: Together = {
    me,
    canWrite: !!me && may !== false,
    async players() {
      const snap = await players.limit(200).get();
      const out: { id: string; doc: PlayerDoc }[] = [];
      for (const d of snap.docs) {
        const doc = cleanPlayer(d.data(), known);
        if (doc) out.push({ id: d.id, doc });
      }
      return out;
    },
    people: ids => (ids.length ? user.profiles(ids) : Promise.resolve({})),
    async shareVillage(village) {
      await write(old => ({ ...old, village }));
    },
    async shareDaily(date, entry) {
      await write(old => ({ ...old, daily: mergeDaily(old.daily, date, entry) }));
    },
  };
  return together;
}

/** Een gebouwenlijst klaarmaken om te delen: plekken ten opzichte van het stamhuis, en niet te veel. */
export function villageBuildings(
  list: { type: string; x: number; y: number; done: boolean }[],
  hall: { x: number; y: number },
): SharedBuilding[] {
  return list
    .filter(b => b.done)
    .slice(0, MAX_SHARED_BUILDINGS)
    .map(b => [b.type, b.x - hall.x, b.y - hall.y] as SharedBuilding);
}
