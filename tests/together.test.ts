import { describe, expect, it } from 'vitest';
import { B } from '../src/data/buildings';
import { DAILY_KEEP, betterMedal, cleanPlayer, leaderboard, mergeDaily } from '../src/data/together';

const known = (t: string) => !!B[t];

describe('samen spelen', () => {
  it('een gedeeld dorp komt gecontroleerd binnen: onbekende gebouwen en rare getallen vallen weg', () => {
    const doc = cleanPlayer(
      {
        daily: { '2026-11-12': { score: 1234.4, medal: 'goud', won: true }, nonsens: { score: 5 } },
        village: {
          place: 'Eikendal<script>',
          age: 99,
          day: 4,
          pop: 12,
          bs: [
            ['townhall', 0, 0],
            ['hut', 2, 1],
            ['nep', 1, 1],
            ['hut', 1.5, 0],
            ['hut', 5000, 0],
          ],
        },
      },
      known,
    );
    expect(doc).not.toBeNull();
    expect(doc!.daily['2026-11-12']).toEqual({ score: 1234, medal: 'goud', won: true });
    expect(Object.keys(doc!.daily)).toEqual(['2026-11-12']);
    expect(doc!.village!.place).toBe('Eikendalscript');
    expect(doc!.village!.age).toBe(8);
    expect(doc!.village!.bs).toEqual([
      ['townhall', 0, 0],
      ['hut', 2, 1],
    ]);
  });

  it('rommel of een leeg document geeft niets', () => {
    expect(cleanPlayer(null, known)).toBeNull();
    expect(cleanPlayer('hoi', known)).toBeNull();
    expect(cleanPlayer({ daily: {}, village: { bs: [] } }, known)).toBeNull();
  });

  it('de beste dagscore en medaille blijven staan, oude dagen vallen weg', () => {
    let d = mergeDaily({}, '2026-11-12', { score: 900, medal: 'zilver', won: true });
    d = mergeDaily(d, '2026-11-12', { score: 500, medal: '', won: false });
    expect(d['2026-11-12']).toEqual({ score: 900, medal: 'zilver', won: true });
    d = mergeDaily(d, '2026-11-12', { score: 1200, medal: 'brons', won: true });
    expect(d['2026-11-12']).toEqual({ score: 1200, medal: 'zilver', won: true });
    for (let i = 1; i <= 20; i++)
      d = mergeDaily(d, `2026-10-${String(i).padStart(2, '0')}`, { score: i, medal: '', won: false });
    expect(Object.keys(d)).toHaveLength(DAILY_KEEP);
    expect(d['2026-11-12']).toBeTruthy();
  });

  it('medailles: goud gaat voor zilver, zilver voor brons, iets voor niets', () => {
    expect(betterMedal('zilver', 'goud')).toBe('goud');
    expect(betterMedal('brons', '')).toBe('brons');
    expect(betterMedal('', '')).toBe('');
  });

  it('de ranglijst zet de hoogste score bovenaan, en gelijke scores delen een plaats', () => {
    const day = '2026-11-12';
    const doc = (score: number) => ({
      v: 1 as const,
      village: null,
      daily: { [day]: { score, medal: '', won: true } },
    });
    const rows = leaderboard(
      [
        { id: 'a', doc: doc(500) },
        { id: 'b', doc: doc(900) },
        { id: 'c', doc: doc(500) },
        { id: 'd', doc: { v: 1, village: null, daily: {} } },
      ],
      day,
    );
    expect(rows.map(r => [r.id, r.rank])).toEqual([
      ['b', 1],
      ['a', 2],
      ['c', 2],
    ]);
  });
});
