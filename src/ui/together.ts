// Het scherm "Samen spelen" in het titelmenu: de ranglijst van de wereld van de dag, en de dorpen van anderen.
// Werkt alleen in de Claude-artifact (zie net/together.ts); daarbuiten staat de knop er niet.
import { sfx } from '../audio/sound';
import { AGES } from '../data/ages';
import { B } from '../data/buildings';
import { PEOPLE } from '../data/peoples';
import { dateKey } from '../data/scenarios';
import { leaderboard } from '../data/together';
import type { PlayerDoc, SharedVillage } from '../data/together';
import { popNow } from '../game/entities';
import { G, placeName } from '../game/state';
import { connect, villageBuildings } from '../net/together';
import type { Person, Together } from '../net/together';
import { medalHTML, scoreText } from './achievements';
import { esc } from './format';
import { ico } from './glyphs';
import { toast } from './hud';

type Tab = 'today' | 'villages';
interface TogetherOpts {
  onBack: () => void;
}

/** Een persoon met plaatje en naam (de naam van een ander altijd veilig gemaakt met esc). */
function personHTML(id: string, people: Record<string, Person>): string {
  const p = people[id];
  const name = p ? p.name || 'Iemand' : 'Iemand';
  const img = p ? `<img class="tgav" src="${esc(p.avatarUrl)}" alt="">` : '<span class="tgav"></span>';
  return `${img}<span class="tgname">${esc(name)}${p && p.isMe ? ' <em>(jij)</em>' : ''}</span>`;
}

/** Een gedeeld dorp als plattegrondje: elk gebouw een vakje in de kleur van zijn soort. */
function drawVillage(canvas: HTMLCanvasElement, v: SharedVillage): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const COL: Record<string, string> = {
    home: '#c4ad84',
    eco: '#8a7454',
    light: '#e0b240',
    mil: '#5f6672',
    deco: '#d77a9c',
    wonder: '#9b7bff',
  };
  let minX = 0,
    minY = 0,
    maxX = 2,
    maxY = 2;
  for (const [t, x, y] of v.bs) {
    const s = B[t].size;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + s);
    maxY = Math.max(maxY, y + s);
  }
  const ratio = devicePixelRatio || 1,
    w = canvas.clientWidth || 320,
    h = canvas.clientHeight || 320;
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  ctx.scale(ratio, ratio);
  ctx.fillStyle = '#7f9a4f';
  ctx.fillRect(0, 0, w, h);
  const span = Math.max(maxX - minX, maxY - minY) + 4,
    cell = Math.min(w, h) / span,
    ox = (w - (maxX - minX) * cell) / 2 - minX * cell,
    oy = (h - (maxY - minY) * cell) / 2 - minY * cell;
  for (const [t, x, y] of v.bs) {
    const d = B[t];
    ctx.fillStyle = t === 'townhall' ? '#b0453f' : d.wall ? '#8a8378' : COL[d.cat] || '#8a7454';
    const pad = d.wall ? 0 : Math.min(1.5, cell * 0.08);
    ctx.fillRect(ox + x * cell + pad, oy + y * cell + pad, d.size * cell - pad * 2, d.size * cell - pad * 2);
  }
}

/** Wat je nu deelt van je eigen spel. */
function myVillage(): SharedVillage | null {
  const hall = G && G.bs.find(b => b.type === 'townhall');
  if (!hall) return null;
  return {
    place: placeName(),
    people: G.people,
    age: G.age,
    day: G.day,
    pop: popNow(),
    bs: villageBuildings(G.bs, hall),
    at: Date.now(),
  };
}

/**
 * Laat het scherm "Samen spelen" zien in het titelscherm `el`. `onBack()`: terug naar het hoofdmenu.
 * Alles komt uit de gedeelde opslag; wat anderen delen is gecontroleerd (zie data/together.ts).
 */
export function showTogether(el: HTMLElement, { onBack }: TogetherOpts): void {
  let tab: Tab = 'today';
  let conn: Together | null = null;
  let players: { id: string; doc: PlayerDoc }[] = [];
  let people: Record<string, Person> = {};
  let status: 'loading' | 'ready' | 'error' = 'loading';
  let viewing: string | null = null; // het id van het dorp dat open staat
  let busy = false;

  const today = dateKey();
  const villageOf = (id: string) => players.find(p => p.id === id)?.doc.village || null;

  const todayHTML = () => {
    const rows = leaderboard(players, today);
    if (!rows.length)
      return '<p class="why">Nog niemand speelde de wereld van vandaag. Speel hem vanuit het hoofdmenu: je score komt hier vanzelf te staan.</p>';
    return `<ol class="tgrank">${rows
      .map(
        r =>
          `<li class="${r.id === conn?.me ? 'me' : ''}"><b class="tgpos">${r.rank}</b>${personHTML(r.id, people)}<span class="tgmedal">${r.entry.medal ? medalHTML(r.entry.medal, 'sm') : ''}</span><b class="tgscore">${scoreText(r.entry.score)}</b></li>`,
      )
      .join('')}</ol>`;
  };

  const villagesHTML = () => {
    const list = players
      .filter(p => p.doc.village)
      .sort((a, b) => (b.doc.village!.at || 0) - (a.doc.village!.at || 0));
    if (!list.length) return '<p class="why">Nog niemand heeft een dorp gedeeld. Wees de eerste!</p>';
    return `<div class="tggrid">${list
      .map(p => {
        const v = p.doc.village!;
        const folk = PEOPLE[v.people] ? PEOPLE[v.people].n : '';
        return `<button class="tgcard ${p.id === conn?.me ? 'me' : ''}" data-view="${esc(p.id)}"><span class="tgwho">${personHTML(p.id, people)}</span><b>${esc(v.place)}</b><small>${AGES[v.age].n} · dag ${v.day} · ${v.pop} inwoners${folk ? ' · ' + esc(folk) : ''}</small></button>`;
      })
      .join('')}</div>`;
  };

  const viewHTML = (id: string) => {
    const v = villageOf(id);
    if (!v) return '<p class="why">Dit dorp is er niet meer.</p>';
    const count = v.bs.length;
    return `<div class="tgview"><button class="quiet" data-tg="list">${ico('←')}Alle dorpen</button>
      <div class="tgwho">${personHTML(id, people)}</div>
      <h2>${esc(v.place)}</h2>
      <p class="small">${AGES[v.age].n} · dag ${v.day} · ${v.pop} inwoners · ${count} ${count === 1 ? 'gebouw' : 'gebouwen'}</p>
      <canvas class="tgmap" width="320" height="320" aria-label="Plattegrond van ${esc(v.place)}"></canvas>
      <p class="small tglegend"><i style="--c:#b0453f"></i>stamhuis <i style="--c:#c4ad84"></i>wonen <i style="--c:#8a7454"></i>economie <i style="--c:#5f6672"></i>leger <i style="--c:#d77a9c"></i>sfeer <i style="--c:#9b7bff"></i>wonder</p></div>`;
  };

  const shareHTML = () => {
    if (!conn) return '';
    if (!conn.canWrite)
      return '<p class="why tgnote">Je kunt hier kijken, maar niet zelf delen. Vraag de eigenaar van het spel om je rechten als bijdrager.</p>';
    const v = myVillage();
    return `<div class="tgshare"><div><b>Jouw dorp</b><small>${v ? `${esc(v.place)} · ${AGES[v.age].n} · ${v.bs.length} ${v.bs.length === 1 ? 'gebouw' : 'gebouwen'}` : 'Nog geen dorp'}</small></div><button class="primary" data-tg="share" ${v && !busy ? '' : 'disabled'}>${busy ? 'Bezig…' : 'Deel mijn dorp'}</button></div>`;
  };

  const draw = () => {
    const body =
      status === 'loading'
        ? '<p class="why">Even laden…</p>'
        : status === 'error'
          ? '<p class="why">De gedeelde opslag is nu niet bereikbaar. Probeer het straks nog eens.</p>'
          : viewing
            ? viewHTML(viewing)
            : tab === 'today'
              ? todayHTML()
              : villagesHTML();
    el.innerHTML = `<div class="tw ng tg">
      <div class="nghead"><button class="quiet ngback" data-tg="back">${ico('←')}Terug</button><div class="eyebrow">Samen spelen</div></div>
      <h1 class="ngtitle">Samen spelen</h1>
      <div class="tgtabs" role="tablist">
        <button role="tab" data-tab="today" aria-selected="${tab === 'today'}" class="${tab === 'today' ? 'on' : ''}">Ranglijst van vandaag</button>
        <button role="tab" data-tab="villages" aria-selected="${tab === 'villages'}" class="${tab === 'villages' ? 'on' : ''}">Dorpen</button>
      </div>
      <div class="tgbody">${body}</div>
      ${shareHTML()}
    </div>`;
    if (viewing) {
      const v = villageOf(viewing),
        canvas = el.querySelector<HTMLCanvasElement>('.tgmap');
      if (v && canvas) drawVillage(canvas, v);
    }
  };

  const load = async () => {
    status = 'loading';
    draw();
    // Niet eindeloos wachten als de opslag niet antwoordt
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('te traag')), 10000));
    try {
      conn = await connect();
      if (!conn) throw new Error('niet beschikbaar');
      players = await Promise.race([conn.players(), timeout]);
      people = await conn.people(players.map(p => p.id));
      status = 'ready';
    } catch (e) {
      status = 'error';
    }
    draw();
  };

  el.onclick = async e => {
    const t = (e.target as HTMLElement).closest('button');
    if (!t) return;
    sfx('tick');
    if (t.dataset.tg === 'back') onBack();
    else if (t.dataset.tab) {
      tab = t.dataset.tab as Tab;
      viewing = null;
      draw();
    } else if (t.dataset.view) {
      viewing = t.dataset.view;
      draw();
    } else if (t.dataset.tg === 'list') {
      viewing = null;
      draw();
    } else if (t.dataset.tg === 'share' && conn && !busy) {
      const v = myVillage();
      if (!v) return;
      busy = true;
      draw();
      try {
        await conn.shareVillage(v);
        toast(`${v.place} is gedeeld. Anderen zien het onder Dorpen.`, 'good');
        sfx('upgrade');
        busy = false;
        tab = 'villages';
        viewing = null;
        await load();
      } catch (err) {
        busy = false;
        toast('Delen lukte niet. Misschien mag je hier alleen kijken.', 'bad');
        draw();
      }
    }
  };
  el.oninput = el.onchange = el.onkeydown = null;
  load();
}

/**
 * Na een spel van de wereld van de dag: je score op de ranglijst zetten (alleen als dat kan; anders gebeurt er
 * stil niets). De beste score van de dag blijft staan.
 */
export async function shareDailyScore(
  date: string,
  score: number,
  medal: string,
  won: boolean,
): Promise<void> {
  const conn = await connect();
  if (!conn || !conn.canWrite) return;
  try {
    await conn.shareDaily(date, { score, medal, won });
    toast('Je score staat op de ranglijst van vandaag (Samen spelen).', 'good');
  } catch (e) {
    // Mag niet of lukt niet: geen probleem, het spel zelf gaat gewoon door
  }
}

/** Is samen spelen hier mogelijk? (Voor de knop in het hoofdmenu.) */
export async function togetherAvailable(): Promise<boolean> {
  return !!(await connect());
}
