import type { AgeUpDef, CoachAct, Foe } from '../types';
// De "coach": kiest steeds één duidelijke volgende stap voor de speler.
import { AGE_UP } from '../data/ages';
import { B, BKEYS } from '../data/buildings';
import { GATHER, MARKET_RES, RES } from '../data/resources';
import { marketFixFor } from '../data/economy';
import { CN } from '../config';
import { avail } from '../game/caches';
import { has, missingResources, waitReason } from '../game/economy';
import { buildCost, canBuyChunk, chunkCost, lackText } from '../game/placement';
import { built } from '../game/chapters';
import { popCap, popNow } from '../game/entities';
import { compass, isMarching, isRaider } from '../game/military';
import { arrivalHour, clockText, rivalById } from '../game/rivals';
import { RIVAL, verb } from '../data/rivals';
import { ruleAllowsBuilding } from '../game/mods';
import { marketPrices } from '../game/upgrades';
import { G } from '../game/state';
import { hoursUntilRaid, isNight, raidNight } from '../game/time';
import { fmt, theAge } from './format';
import { costText } from './buildmenu';
import { VICTORY } from '../data/victories';
import { victoryGoals } from '../game/victory';
import { canMake } from '../data/succession';
import { UNITS } from '../data/units';
import { BOSS_DMG, BOSS_HP, bossForAge, bossName } from '../data/bosses';
import { chargeFrac, chargePercent, nightsLeft } from '../data/finale';
import { bossComesTonight, liveBoss } from '../game/bosses';
import { finishedGate, gateHealth, isCharging } from '../game/finale';
import { planRoadLink, roadLinkCost, unlinkedBuildings } from '../game/roads';
import { LINK_MAX, offRoadEffect } from '../data/roads';
import { commonMissing } from '../game/houses';
import { servesOfType } from '../game/coverage';
import { SERVICE_BY_KEY } from '../data/services';

export const placed = (k: string): boolean => G.bs.some(b => b.type === k);
function bestHouse() {
  return BKEYS.filter(k => B[k].pop && k !== 'townhall' && !B[k].nobuild && canMake(k, G.age)).sort(
    (a, b) => B[b].age - B[a].age,
  )[0];
}
export function lackList(nx: AgeUpDef): string[] {
  const out: string[] = [];
  for (const k in nx.cost)
    if (G.res[k] < nx.cost[k]) out.push(`${fmt(Math.ceil(nx.cost[k] - G.res[k]))} ${RES[k].n.toLowerCase()}`);
  for (const n of nx.need) if (!built(n)) out.push(`een ${B[n].n.toLowerCase()}`);
  if (popNow() < nx.pop) out.push(`${nx.pop - popNow()} inwoners`);
  return out;
}
export const andJoin = (a: string[]): string =>
  a.length > 2 ? a.slice(0, 2).join(', ') + ' en meer' : a.length === 2 ? a[0] + ' en ' + a[1] : a[0] || '';
const bAct = (k: string): CoachAct => ({ l: 'Bouw ' + B[k].n.toLowerCase(), b: k });
const expandAct = (r: string): CoachAct => ({ l: 'Uitbreiden', k: 'expand', r });

// Is er iets op in je gebied dat je nodig hebt (zie missingResources in game/economy.ts)? Dan uitbreiden,
// tenminste als er nog land te koop is.
function goneStep(): CoachStep | null {
  const gone = missingResources();
  if (!gone.length) return null;
  let canGrow = false;
  for (let cy = 0; cy < CN && !canGrow; cy++)
    for (let cx = 0; cx < CN && !canGrow; cx++) canGrow = canBuyChunk(cx, cy);
  // Geen land meer te koop: dan is er een gebouw dat de grondstof uit het niets maakt (of de markt)
  if (!canGrow) return backupSourceStep(gone);
  const names = andJoin(gone.map(k => RES[k].n.toLowerCase()));
  const short = chunkShortStep(names);
  if (short) return short;
  return {
    t: 'Breid je gebied uit.',
    h: `Er is geen ${names} meer in je gebied, en je hebt het nodig. Verderop ligt meer.`,
    act: expandAct(gone[0]),
  };
}

// Welk gebouw een opgeraakte grondstof toch nog levert: de steengroeve (steen), de mijnschacht (koper, tin,
// ijzer) of de markt (alles, tegen goud). Alleen als dat gebouw er nog niet staat en al te bouwen is.
const BACKUP: [string[], string][] = [
  [['stone'], 'quarry'],
  [['copper', 'tin', 'iron'], 'mineshaft'],
];
function backupSourceStep(gone: string[]): CoachStep | null {
  for (const [list, bld] of BACKUP) {
    const r = gone.find(k => list.includes(k));
    if (!r || placed(bld) || !canMake(bld, G.age) || !ruleAllowsBuilding(bld)) continue;
    return {
      t: `Bouw een ${B[bld].n.toLowerCase()}.`,
      h: `Er is geen ${RES[r].n.toLowerCase()} meer in je gebied en er is geen land meer te koop. ${B[bld].desc}`,
      act: bAct(bld),
    };
  }
  if (!placed('market') && canMake('market', G.age) && ruleAllowsBuilding('market'))
    return {
      t: 'Bouw een markt.',
      h: `Er is geen ${RES[gone[0]].n.toLowerCase()} meer in je gebied. Op de markt koop je het voor goud.`,
      act: bAct('market'),
    };
  return null;
}

/**
 * Kun je het volgende stuk land nog niet betalen? Dan zegt deze stap waar je het tekort vandaan haalt,
 * zodat "Breid je gebied uit" nooit een knop is die niets doet. `want`: wat je verderop zoekt ("kolen").
 * Geeft null als uitbreiden nu kan.
 */
export function chunkShortStep(want: string): CoachStep | null {
  const cost = chunkCost();
  if (has(cost)) return null;
  const short = Object.keys(cost).filter(k => G.res[k] < cost[k]);
  const why = `Uitbreiden (voor ${want}) kost ${costText(cost)}.`;
  const market = G.bs.find(b => b.type === 'market' && b.done);
  // Alleen een handel die nu echt lukt: genoeg goud om te kopen, of genoeg over om te verkopen
  // (goud dat het volgende tijdperk nodig heeft, houdt hij apart: anders schuift het tekort alleen op)
  const ageGold = AGE_UP[G.age + 1]?.cost.gold ?? 0;
  const fix = market && marketFixFor(G.res, cost, MARKET_RES, r => marketPrices(market, r).buy, ageGold);
  if (market && fix) {
    const toMarket: CoachAct = { l: 'Naar de markt', k: 'sel', id: market.id };
    const name = RES[fix.r].n.toLowerCase();
    if (fix.kind === 'sell')
      return {
        t: `Verkoop ${name} voor goud.`,
        h: `${why} Je mist nog ${fmt(Math.ceil(cost.gold - G.res.gold))} goud. Op de markt verkoop je ${name} voor goud.`,
        act: toMarket,
      };
    return {
      t: `Koop ${name} op de markt.`,
      h: `${why} Je mist nog ${fmt(Math.ceil(cost[fix.r] - G.res[fix.r]))} ${name}.`,
      act: toMarket,
    };
  }
  // Een steengroeve (of mijnschacht) die je nu kunt betalen, maakt het tekort er vanzelf bij.
  // Geen backupSourceStep: hier is de grondstof niet op, het land is alleen nog te duur.
  for (const [list, bld] of BACKUP) {
    const r = short.find(k => list.includes(k));
    if (!r || placed(bld) || !canMake(bld, G.age) || !ruleAllowsBuilding(bld) || !has(buildCost(bld)))
      continue;
    return {
      t: `Bouw een ${B[bld].n.toLowerCase()}.`,
      h: `${why} Een ${B[bld].n.toLowerCase()} maakt er vanzelf ${RES[r].n.toLowerCase()} bij.`,
      tile: bld,
      act: bAct(bld),
    };
  }
  const names = andJoin(short.map(k => RES[k].n.toLowerCase()));
  return {
    t: `Verzamel meer ${names}.`,
    h: `${why} Daarna kun je verderop zoeken.`,
    wait: true,
  };
}

/** Eén stap van de coach: titel, uitleg, eventueel een gebouw om aan te wijzen, een knop en alarm. */
interface CoachStep {
  t: string;
  h: string;
  tile?: string;
  /** De knop; leeg (of null) = geen knop. */
  act?: CoachAct | null;
  alarm?: boolean;
  /** Echt even wachten (tot er genoeg verzameld is): alleen dan zet coach() er een tip bij. */
  wait?: boolean;
}

// Waar komt grondstof k vandaan? Geeft een stap terug als de speler er iets voor moet doen.
// `left` is hoeveel er nog nodig is, `goal` waarvoor (bijv. "de bronstijd").
function sourceStep(k: string, left: string, goal: string, depth = 0): CoachStep | null {
  const name = RES[k].n.toLowerCase();
  // Sterrenmetaal kun je niet zomaar vinden: het valt als meteoriet uit de lucht
  if (k === 'starmetal' && !avail.starmetal)
    return {
      t: 'Wacht op een meteoriet.',
      h: `Sterrenmetaal komt uit meteorieten: na een inslag ligt het rond de krater. Verderop liggen ook oude inslagen; breid uit om erbij te kunnen. Nog ${left} nodig voor ${goal}.`,
      act: expandAct(k),
    };
  if (GATHER.includes(k) && !avail[k])
    return (
      chunkShortStep(name) || {
        t: 'Breid je gebied uit.',
        h: `Er ligt nog geen ${name} binnen je grenzen. Je hebt er nog ${left} nodig voor ${goal}.`,
        act: expandAct(k),
      }
    );
  // Olie verzamel je niet met de hand: daar is een oliepomp op een oliebron voor
  if (k === 'oil') {
    if (!avail.oil)
      return (
        chunkShortStep('olie') || {
          t: 'Zoek een oliebron.',
          h: 'Olie zit onder woestijnen en kusten. Breid je gebied uit tot er een oliebron in ligt.',
          act: expandAct(k),
        }
      );
    if (!placed('oilpump'))
      return {
        t: 'Plaats een oliepomp.',
        h: `${B.oilpump.desc} De raffinaderij maakt er brandstof van.`,
        tile: 'oilpump',
        act: bAct('oilpump'),
      };
    return null;
  }
  if (!RES[k].cr || depth > 2) return null;
  const mk = BKEYS.find(b => B[b].conv && B[b].conv.out[k]);
  if (!mk) return null;
  if (!placed(mk))
    return {
      t: `Bouw een ${B[mk].n.toLowerCase()}.`,
      h: `Daar maak je ${name}, nodig voor ${goal}.${B[mk].desc ? ' ' + B[mk].desc : ''}`,
      tile: mk,
      act: bAct(mk),
    };
  // Wacht de fabriek op iets dat je eerst moet regelen? Dan dát als stap.
  // (mk is hierboven gevonden omdat hij iets maakt, dus conv bestaat zeker)
  const inp = Object.keys(B[mk].conv!.in).filter(r => G.res[r] < 5);
  for (const r of inp) {
    const step = sourceStep(r, 'wat', goal, depth + 1);
    if (step) return step;
  }
  return factoryStep(mk, k, left, goal);
}

/** Zoveel fabrieken van één soort raadt de coach hooguit aan. */
const MAX_FACTORIES = 6;
/** Een extra fabriek raadt hij pas aan als er voor zoveel rondes van elke grondstof die erin gaat op voorraad is. */
const INPUT_STOCK = 30;

// De fabriek voor grondstof k staat er al, maar er is nog te weinig. Wat houdt hem tegen? Zeg dát, en
// bied alleen een tweede fabriek aan als de eerste echt draait (anders helpt een tweede niets).
function factoryStep(mk: string, k: string, left: string, goal: string): CoachStep {
  const name = RES[k].n.toLowerCase(),
    factory = B[mk].n.toLowerCase(),
    title = `Nog ${left} ${name} nodig.`;
  const mine = G.bs.filter(b => b.type === mk);
  const working = mine.find(b => b.done);
  if (!working)
    return { t: title, h: `De ${factory} wordt nog gebouwd. Daarna maakt hij ${name}.`, wait: true };
  // Spaart hij een grondstof voor het volgende tijdperk (zie keptForGoal in game/buildings.ts)?
  if (working.saving) {
    const kept = RES[working.saving].n.toLowerCase();
    return {
      t: `Verzamel meer ${kept}.`,
      h: `De ${factory} bewaart ${kept} voor ${goal}. Met meer ${kept} maakt hij weer ${name} (nog ${left} nodig).`,
      wait: true,
    };
  }
  // (mk is gevonden omdat hij iets maakt, dus conv bestaat zeker)
  const need = B[mk].conv!.in;
  const missing = Object.keys(need).filter(r => G.res[r] < need[r]);
  if (working.starved && missing.length) {
    const names = andJoin(missing.map(r => RES[r].n.toLowerCase()));
    return {
      t: `Verzamel meer ${names}.`,
      h: `De ${factory} wacht op ${names}. Daarmee maakt hij ${name} (nog ${left} nodig voor ${goal}).`,
      wait: true,
    };
  }
  const why = waitReason(working);
  if (why && !working.plenty)
    return {
      t: title,
      h: `De ${factory} staat stil: ${why.toLowerCase()}.`,
      act: { l: `Bekijk de ${factory}`, k: 'sel', id: working.id },
    };
  // Een extra fabriek helpt alleen als er genoeg ingaat: anders is die grondstof de rem, niet de fabriek
  const plentyIn = Object.keys(need).every(r => G.res[r] >= need[r] * INPUT_STOCK);
  const offerMore = plentyIn && mine.length < MAX_FACTORIES && canMake(mk, G.age) && ruleAllowsBuilding(mk);
  const more = mine.length > 1 ? 'Nog een' : 'Een tweede';
  const inputs = andJoin(Object.keys(need).map(r => RES[r].n.toLowerCase())),
    comes = Object.keys(need).length > 1 ? 'binnenkomen' : 'binnenkomt';
  return {
    t: title,
    h: offerMore
      ? `De ${factory} maakt het vanzelf. ${more} ${factory} gaat sneller.`
      : `De ${factory} maakt het vanzelf${inputs ? `, zo snel als er ${inputs} ${comes}` : ''}.`,
    act: offerMore ? { l: `Bouw nog een ${factory}`, b: mk } : null,
    wait: !offerMore,
  };
}
// Een aanval tijdens de finale: de poort moet heel blijven, dus laat zien hoe hij ervoor staat
function finaleRaidStep(raid: number, boss: Foe | null): CoachStep {
  const gate = finishedGate(),
    health = gateHealth();
  // (een kampioen in het veld hoort altijd bij een tijdperk met een kampioen: zie makeBoss)
  const led = boss ? `, geleid door ${bossName(bossForAge(boss.boss)!)},` : '';
  const left = health ? ` De poort is nog ${Math.round((health.hp / health.max) * 100)}% heel.` : '';
  return {
    t: 'Verdedig de sterrenpoort!',
    h: `${raid} vijanden${led} vallen aan.${left} Herstel hem op tijd met de knop op de balk bovenaan.`,
    act: gate ? { l: 'Bekijk de poort', k: 'sel', id: gate.id } : { l: 'Bekijk de aanval', k: 'alarm' },
    alarm: true,
  };
}
// Hoeveel een gebouw bij elkaar kost (alle grondstoffen opgeteld), om de goedkoopste te kiezen
const costSum = (k: string): number => Object.values(buildCost(k)).reduce((n, v) => n + (v || 0), 0);
// Moet je even wachten tot er genoeg is? Dan toch iets nuttigs om te doen: meer dorpelingen verzamelen
// sneller (een woning als die bijna vol zit), en meer akkers houden iedereen gevoed. Alleen wat je kunt betalen.
function speedUpTip(want: string[]): { text: string; act: CoachAct } | null {
  // Met een markt en genoeg goud koop je wat je mist meteen
  const market = G.bs.find(b => b.type === 'market' && b.done);
  // (alleen met goud dat het volgende tijdperk zelf niet nodig heeft: anders schiet je er niets mee op)
  const freeGold = G.res.gold - (AGE_UP[G.age + 1]?.cost.gold ?? 0);
  const buy = market && want.find(r => MARKET_RES.includes(r) && freeGold >= marketPrices(market, r).buy);
  if (market && buy)
    return {
      text: `Of koop ${RES[buy].n.toLowerCase()} op de markt.`,
      act: { l: 'Naar de markt', k: 'sel', id: market.id },
    };
  const house = bestHouse();
  if (house && popCap() - popNow() < 2 && ruleAllowsBuilding(house) && has(buildCost(house)))
    return {
      text: `Met een extra ${B[house].n.toLowerCase()} komen er meer dorpelingen bij.`,
      act: bAct(house),
    };
  const farms = G.bs.filter(b => b.type === 'farm').length;
  if (farms * 4 < G.vs.length && canMake('farm', G.age) && has(buildCost('farm')))
    return { text: 'Een extra akker houdt iedereen gevoed.', act: bAct('farm') };
  // Een steengroeve of mijnschacht maakt de grondstof er vanzelf bij, zonder arbeiders
  for (const [list, bld] of BACKUP) {
    const r = want.find(k => list.includes(k));
    if (r && !placed(bld) && canMake(bld, G.age) && ruleAllowsBuilding(bld) && has(buildCost(bld)))
      return {
        text: `Een ${B[bld].n.toLowerCase()} maakt er vanzelf ${RES[r].n.toLowerCase()} bij.`,
        act: bAct(bld),
      };
  }
  // Een opslagplaats dicht bij wat je verzamelt scheelt lopen (een paar, meer helpt weinig)
  const far = want.find(r => r !== 'food' && GATHER.includes(r));
  const stores = G.bs.filter(b => b.type === 'storage').length;
  if (far && stores < 2 + G.age / 2 && canMake('storage', G.age) && has(buildCost('storage'))) {
    const where = far === 'wood' ? 'de bomen' : `het ${RES[far].n.toLowerCase()}`;
    return { text: `Een extra opslagplaats bij ${where} scheelt lopen.`, act: bAct('storage') };
  }
  // Missen de meeste huizen dezelfde voorziening? Dan groeien ze niet: de goedkoopste bron die je kunt betalen
  // (pas na akkers, groeves en opslag: eerst wat het volgende tijdperk dichterbij brengt)
  const miss = commonMissing();
  // Hoogstens één bron per zes huizen die hem missen: staat er al een (verkeerd), dan helpt nog een niet.
  // Pas vanaf zes huizen: in een klein dorp gaat het volgende tijdperk voor (de balk in Dorp geeft de tip al).
  const sources = miss
    ? G.bs.filter(b => b.type !== 'townhall' && servesOfType(b.type).some(s => s.k === miss.k)).length
    : 0;
  if (miss && miss.total >= 6 && miss.homes * 2 > miss.total && sources * 6 < miss.homes) {
    const source = BKEYS.filter(
      k =>
        k !== 'townhall' &&
        servesOfType(k).some(s => s.k === miss.k) &&
        canMake(k, G.age) &&
        ruleAllowsBuilding(k) &&
        has(buildCost(k)) &&
        // niet betalen met wat je juist spaart voor het volgende tijdperk
        !Object.keys(buildCost(k)).some(r => want.includes(r)),
    ).sort((a, b) => costSum(a) - costSum(b))[0];
    if (source)
      return {
        text: `Huizen zonder ${SERVICE_BY_KEY[miss.k].n.toLowerCase()} groeien niet verder: zet een ${B[source].n.toLowerCase()} tussen je huizen.`,
        act: bAct(source),
      };
  }
  // Niets te doen dan wachten tot je dorpelingen genoeg verzameld hebben? Dan gaat het sneller op 2×
  if (G.speed > 0 && G.speed < 2)
    return {
      text: 'Op 2× snelheid duurt het wachten maar half zo lang.',
      act: { l: 'Sneller (2×)', k: 'speed' },
    };
  return null;
}

// Wat je nu mist voor het volgende tijdperk, plus wat er in de fabrieken gaat die het missende maken
function wantedNow(): string[] {
  const nx = AGE_UP[G.age + 1];
  if (!nx) return [];
  const out = Object.keys(nx.cost).filter(k => G.res[k] < nx.cost[k]);
  for (const k of [...out]) {
    const mk = BKEYS.find(b => B[b].conv && B[b].conv.out[k]);
    if (mk) out.push(...Object.keys(B[mk].conv!.in));
  }
  return out;
}

/** De volgende stap voor de speler. Is het even wachten (en is er geen knop), dan komt er een nuttige tip bij. */
export function coach(): CoachStep {
  const step = nextStep();
  if (!step.wait || step.act || step.alarm) return step;
  const tip = speedUpTip(wantedNow());
  return tip ? { ...step, h: `${step.h} ${tip.text}`, act: tip.act } : step;
}

/** Ligt er een gebouw niet aan de weg? Dan eerst een pad (met een knop die het pad meteen aanlegt). */
function roadStep(): CoachStep | null {
  const b = unlinkedBuildings()[0];
  if (!b) return null;
  const d = B[b.type],
    name = d.n.toLowerCase(),
    t = 'Leg een pad aan.';
  const plan = planRoadLink(b, LINK_MAX);
  if (!plan) return { t, h: `Sleep een pad van je wegen naar je ${name}.`, tile: 'road', act: bAct('road') };
  // "ligt los van het dorp" past niet achter "ligt niet aan de weg en": dan alleen dat
  const effect = offRoadEffect(d),
    why = effect.startsWith('ligt ') ? effect : `ligt niet aan de weg en ${effect}`;
  const cost = roadLinkCost(plan),
    h = `Je ${name} ${why}. Een pad naar het stamhuis lost dat op.`;
  // Te weinig hout? Dan gaat de gewone uitleg voor: het infopaneel toont al wat het pad kost
  if (!has(cost)) return null;
  return { t, h, act: { l: 'Pad aanleggen', k: 'road', id: b.id } };
}

function nextStep(): CoachStep {
  const nx = AGE_UP[G.age + 1],
    NA = nx ? theAge(G.age + 1) : '', // met lidwoord: "de bronstijd", "het dronetijdperk"
    pn = popNow(),
    cap = popCap();
  const raid = G.foes.filter(isRaider).length;
  const boss = liveBoss();
  if (raid && isCharging()) return finaleRaidStep(raid, boss);
  // (een kampioen in het veld hoort altijd bij een tijdperk met een kampioen: zie makeBoss)
  if (raid && boss)
    return {
      t: `Aanval, geleid door ${bossName(bossForAge(boss.boss)!)}!`,
      h: `${raid} vijanden in je land. Versla de kampioen met je hele leger: dat levert een extra zegening op.`,
      act: { l: 'Bekijk de aanval', k: 'alarm' },
      alarm: true,
    };
  if (raid)
    return {
      t: 'Aanval!',
      h: `${raid} vijanden in je land. Je dorpelingen schuilen. Torens en soldaten verdedigen.`,
      act: { l: 'Bekijk de aanval', k: 'alarm' },
      alarm: true,
    };
  const marching = G.foes.filter(isMarching);
  if (marching.length) return marchStep(marching);
  // Is het volgende tijdperk al binnen? Dan wint "Klaar voor ...": de kampioen en de lamp kunnen wachten
  const ageReady = !!nx && lackList(nx).length === 0;
  // De kampioen komt vannacht: dat gaat voor de lamp en de rest
  const champion = ageReady ? null : championStep();
  if (champion) return champion;
  const lit = G.bs.some(b => b.type !== 'townhall' && B[b.type].light && !B[b.type].gen);
  const dark = G.vs.filter(v => v.state === 'sleep' || (v.state === 'walk' && v.on === 'sleep')).length;
  const lamp = BKEYS.find(k => B[k].cat === 'light' && B[k].light && !B[k].gen && canMake(k, G.age));
  if (isNight() && dark && !lit && lamp && !ageReady)
    return {
      t: `Het is donker: ${dark} ${dark === 1 ? 'dorpeling stopt' : 'dorpelingen stoppen'} met werken.`,
      h: `Bij een ${B[lamp].n.toLowerCase()} werken ze ’s nachts door. Zet het bij de bomen of akkers.`,
      tile: lamp,
      act: bAct(lamp),
    };
  const hrs = hoursUntilRaid();
  if (!G.peaceful && hrs != null && hrs < 7.5) {
    const def = G.bs.some(b => b.type !== 'townhall' && B[b.type].def);
    if (!def && G.us.length < 3) {
      const prep = raidPrepStep();
      if (prep) return prep;
    }
  }
  // Is het volgende tijdperk klaar, dan wint die oproep van het pad
  const road = ageReady ? null : roadStep();
  if (road) return road;
  if (G.age === 0) {
    if (!placed('hut'))
      return {
        t: 'Bouw een hut.',
        h: `Je stam zit vol (${pn}/${cap}). Met een hut is er plek voor nieuwe dorpelingen.`,
        tile: 'hut',
        act: bAct('hut'),
      };
    if (!placed('farm'))
      return {
        t: 'Leg een akker aan.',
        h: 'Een akker geeft voedsel dat nooit opraakt.',
        tile: 'farm',
        act: bAct('farm'),
      };
    if (!placed('storage'))
      return {
        t: 'Bouw een opslagplaats.',
        h: 'Zet hem bij de bomen: dan lopen je dorpelingen minder ver. Nodig voor de bronstijd.',
        tile: 'storage',
        act: bAct('storage'),
      };
    if (!placed('campfire'))
      return {
        t: 'Steek een kampvuur aan.',
        h: 'In het licht werken dorpelingen ook ’s nachts door.',
        tile: 'campfire',
        act: bAct('campfire'),
      };
    // Zonder leger (spelregel van een uitdaging) is er geen kazerne om te bouwen
    if (!G.peaceful && ruleAllowsBuilding('barracks') && !placed('barracks'))
      return {
        t: 'Bouw een kazerne.',
        h: 'Vanaf de tweede nacht vallen vijanden aan. In de kazerne train je verdedigers.',
        tile: 'barracks',
        act: bAct('barracks'),
      };
  }
  const gone = goneStep();
  if (gone) return gone;
  if (!nx) return lastAgeStep();
  for (const n of nx.need)
    if (!placed(n)) {
      // Kun je het gebouw nog niet betalen? Zeg dan eerst waar de ontbrekende grondstof vandaan komt.
      const cost = B[n].cost;
      for (const k in cost) {
        if (G.res[k] >= cost[k]) continue;
        const step = sourceStep(k, fmt(Math.ceil(cost[k] - G.res[k])), `een ${B[n].n.toLowerCase()}`);
        if (step) return step;
      }
      return {
        t: `Bouw een ${B[n].n.toLowerCase()}.`,
        h: `Nodig voor ${NA}.${B[n].desc ? ' ' + B[n].desc : ''}`,
        tile: n,
        act: bAct(n),
      };
    }
  if (pn < nx.pop && pn >= cap) {
    const h = bestHouse();
    return {
      t: `Bouw een ${B[h].n.toLowerCase()}.`,
      h: `Er is geen plek voor meer inwoners (${pn}/${cap}). Voor ${NA} heb je er ${nx.pop} nodig.`,
      tile: h,
      act: bAct(h),
    };
  }
  for (const k in nx.cost) {
    if (G.res[k] >= nx.cost[k]) continue;
    const step = sourceStep(k, fmt(Math.ceil(nx.cost[k] - G.res[k])), NA);
    if (step) return step;
  }
  if (pn < nx.pop) {
    const townhall = G.bs.find(b => b.type === 'townhall');
    if (G.autoTrain || !townhall)
      return {
        t: `Je stam groeit: ${pn} van ${nx.pop} inwoners.`,
        h: 'Het stamhuis traint vanzelf dorpelingen zolang er voedsel is.',
        wait: G.autoTrain,
      };
    return {
      t: `Je stam groeit: ${pn} van ${nx.pop} inwoners.`,
      h: 'Train dorpelingen in het stamhuis.',
      act: { l: 'Naar het stamhuis', k: 'sel', id: townhall.id },
    };
  }
  const miss = lackList(nx);
  if (miss.length)
    return {
      t: `Op weg naar ${NA}.`,
      h: `Nog ${andJoin(miss)} nodig. Je dorpelingen verzamelen vanzelf.`,
      wait: true,
    };
  return {
    t: `Klaar voor ${NA}!`,
    h: 'Alles is binnen. Zet de stap naar een nieuw tijdperk.',
    act: { l: `Naar ${NA}`, k: 'age' },
  };
}

// De toren(s) die dit tijdperk kent, de nieuwste eerst
function towersNow(): string[] {
  return BKEYS.filter(k => B[k].def && B[k].cat === 'mil' && !B[k].nobuild && canMake(k, G.age)).sort(
    (a, b) => B[b].age - B[a].age,
  );
}
// De beste toren die je nu kunt bouwen, of undefined
const bestTower = (): string | undefined => towersNow()[0];
// De beste toren die je nu kunt bouwen én betalen, of undefined
const payableTower = (): string | undefined => towersNow().find(k => has(buildCost(k)));
// De beste soldaat die de kazerne nu kan trainen én die je kunt betalen, of undefined
function payableSoldier(): string | undefined {
  return Object.keys(UNITS)
    .filter(k => UNITS[k].src === 'barracks' && canMake(k, G.age, G.people) && has(UNITS[k].cost))
    .sort((a, b) => UNITS[b].age - UNITS[a].age)[0];
}
// Eén ding dat je nú kunt doen voor je verdediging: een soldaat trainen (als er plek is) of een toren bouwen.
// Alleen wat dit tijdperk nog kent en wat je kunt betalen: zo stuurt de coach je nooit naar een grijze knop.
function defenseTip(): { text: string; act: CoachAct; tile?: string } | null {
  const bar = G.bs.find(b => b.type === 'barracks' && b.done);
  const soldier = bar && popNow() < popCap() ? payableSoldier() : undefined;
  if (bar && soldier)
    return {
      text: `Train een ${UNITS[soldier].n.toLowerCase()} in de kazerne.`,
      act: { l: 'Naar de kazerne', k: 'sel', id: bar.id },
    };
  const tower = payableTower();
  if (tower)
    return { text: `Bouw een ${B[tower].n.toLowerCase()} bij het stamhuis.`, act: bAct(tower), tile: tower };
  return null;
}

// Vannacht komt er een aanval en je hebt nog niets om je te verdedigen
function raidPrepStep(): CoachStep | null {
  const tip = defenseTip();
  if (tip) return { t: 'Vannacht komt een aanval.', h: tip.text, tile: tip.tile, act: tip.act };
  // Huizen vol: soldaten hebben ook een plek nodig (alleen een knop als je de woning kunt betalen)
  const house = bestHouse();
  if (popNow() >= popCap() && house) {
    const houseName = B[house].n.toLowerCase();
    if (has(buildCost(house)))
      return {
        t: 'Vannacht komt een aanval.',
        h: `Bouw eerst een ${houseName}: er is geen plek voor soldaten.`,
        tile: house,
        act: bAct(house),
      };
    return {
      t: 'Vannacht komt een aanval.',
      h: `Er is geen plek voor soldaten. Voor een ${houseName} heb je nog ${lackText(buildCost(house))} nodig.`,
      wait: true,
    };
  }
  return null;
}

/** Vanaf dit uur waarschuwt de coach voor de kampioen van vannacht (de aanval komt om 21 uur). */
const CHAMPION_WARN_HOUR = 12;

// Vandaag is een aanvalsdag, de kampioen komt mee en je verdediging is nog dun: waarschuw 's middags.
// Met een knop als je nu iets kunt doen; anders zegt hij wat er voor een toren nog mist.
function championStep(): CoachStep | null {
  if (G.peaceful || !raidNight() || G.clock < CHAMPION_WARN_HOUR || G.clock >= 21) return null;
  const boss = bossComesTonight();
  if (!boss) return null;
  const towers = G.bs.filter(b => b.done && b.type !== 'townhall' && B[b.type].def).length;
  // Dun: minder dan zes "punten" verdediging, waarbij een toren voor twee soldaten telt
  if (G.us.length + towers * 2 >= 6) return null;
  const threat = `${bossName(boss)} leidt de aanval, met ${BOSS_HP}× levens en ${BOSS_DMG}× schade.`;
  const tip = defenseTip();
  if (tip)
    return {
      t: `Vannacht: ${boss.n}!`,
      h: `${threat} ${tip.text}`,
      tile: tip.tile,
      act: tip.act,
      alarm: true,
    };
  const tower = bestTower();
  const advice = tower
    ? `Voor een ${B[tower].n.toLowerCase()} heb je nog ${lackText(buildCost(tower))} nodig.`
    : 'Houd je soldaten bij het stamhuis.';
  return {
    t: `Vannacht: ${boss.n}!`,
    h: `${threat} ${advice} Je dorpelingen schuilen in het stamhuis.`,
    alarm: true,
  };
}

// Soldaten van een rivaal zijn onderweg naar je stad: wie, hoeveel, uit welke richting en hoe laat
function marchStep(marching: Foe[]): CoachStep {
  const lead = marching[0],
    r = rivalById(lead.rival),
    n = marching.length;
  const oneRival = r && marching.every(f => f.rival === lead.rival);
  const who = oneRival ? `${RIVAL[r.k].n} ${verb(RIVAL[r.k], 'is', 'zijn')}` : 'Rivalen zijn';
  const soldiers = `${n} ${n === 1 ? 'soldaat' : 'soldaten'}`;
  const when = clockText(arrivalHour(marching));
  return {
    t: 'Aanval op komst!',
    h: `${who} onderweg: ${soldiers} uit het ${compass(lead.x, lead.y)}, rond ${when} hier.`,
    act: { l: 'Bekijk ze', k: 'alarm' },
    alarm: true,
  };
}

/** De stap in het laatste tijdperk: de sterrenpoort bouwen, of het doel dat nog over is. */
function lastAgeStep(): CoachStep {
  // In een uitdaging telt alleen het doel van de uitdaging, niet de sterrenpoort
  if (G.scenario && G.won) return { t: 'Uitdaging gehaald.', h: 'Bouw gerust verder.' };
  const stargateGoal = G.opts.victories.includes('stargate');
  // Echt klaar: gewonnen met de sterrenpoort, of met een ander doel als de sterrenpoort niet meetelt
  if (G.won && (VICTORY[G.wonBy]?.full || !stargateGoal))
    return { t: 'Je hebt gewonnen.', h: 'Bouw gerust verder.' };
  if (!stargateGoal) {
    // Winnen met de sterrenpoort staat uit: wijs naar het doel dat nog over is (zoals overleven)
    const goal = victoryGoals().find(g => g.frac < 1);
    return {
      t: goal ? `${goal.v.d}.` : 'Bouw gerust verder.',
      h: `${goal ? `Nu: ${goal.text}. ` : ''}Winnen met de sterrenpoort staat uit in deze wereld.`,
    };
  }
  if (isCharging()) {
    // De finale: de poort laadt op en moet heel blijven tot de zon opkomt
    const gate = finishedGate();
    const act: CoachAct | null = gate ? { l: 'Bekijk de poort', k: 'sel', id: gate.id } : null;
    const percent = chargePercent(chargeFrac(G.finale));
    // isCharging() hierboven: dan is er zeker een finale
    const nights = nightsLeft(G.clock, G.finale!.need - G.finale!.hours, G.finale!.hours);
    // In de vredige modus komen er geen aanvallen: dan is er niets te verdedigen
    if (G.peaceful) {
      const when = nights > 1 ? `Bij zonsopgang na ${nights} nachten` : 'Bij de volgende zonsopgang';
      return {
        t: `De sterrenpoort laadt op: ${percent}%`,
        h: `${when} gaat hij open. Bouw gerust verder.`,
        act,
      };
    }
    const hold = nights > 1 ? `Houd nog ${nights} nachten stand.` : 'Houd stand tot zonsopgang.';
    return {
      t: `Verdedig de sterrenpoort: ${percent}% opgeladen.`,
      h: `${hold} Wordt hij verwoest, dan begint het opladen opnieuw. Herstel hem op tijd met de knop op de balk bovenaan.`,
      act,
    };
  }
  if (built('stargate')) return { t: 'De sterrenpoort staat.', h: 'Bouw gerust verder.' };
  if (placed('stargate')) return { t: 'De sterrenpoort wordt gebouwd.', h: 'Nog even geduld.', wait: true };
  const cost = B.stargate.cost;
  for (const k in cost) {
    if (G.res[k] >= cost[k]) continue;
    const step = sourceStep(k, fmt(Math.ceil(cost[k] - G.res[k])), 'de sterrenpoort');
    if (step) return step;
  }
  const miss = Object.keys(cost)
    .filter(k => G.res[k] < cost[k])
    .map(k => `${fmt(Math.ceil(cost[k] - G.res[k]))} ${RES[k].n.toLowerCase()}`);
  // Al gewonnen met een kort doel? Dan telt de sterrenpoort nog voor de prestaties (zie game/victory.ts)
  const why = G.won ? 'Dan telt je winst ook voor de prestaties.' : 'Daarmee voltooi je je beschaving.';
  return {
    t: 'Bouw de sterrenpoort.',
    h: miss.length ? `${why} Nog ${andJoin(miss)} nodig.` : why,
    tile: 'stargate',
    act: bAct('stargate'),
  };
}
