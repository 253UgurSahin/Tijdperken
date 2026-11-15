// Welvaart van huizen: de trede waar een huis naartoe groeit, hoe snel, en wat het oplevert.
import { describe, expect, it } from 'vitest';
import { AGES, AGE_UP } from '../src/data/ages';
import { B } from '../src/data/buildings';
import {
  DECLINE_AFTER,
  GROW_AFTER,
  HOUSE_GRADES,
  gradePopBonus,
  joinNeeds,
  nextNeeds,
  stepGrade,
  targetGrade,
  taxPerMinute,
} from '../src/data/houses';
import type { HomeState } from '../src/data/houses';

/** Een huis in de Steentijd (drie voorzieningen) met wat je meegeeft. */
const home = (o: Partial<HomeState>): HomeState => ({
  linked: true,
  covered: 0,
  unlocked: 3,
  charm: 0,
  missing: ['food', 'safety', 'faith'],
  ...o,
});

describe('welvaart van huizen', () => {
  it('vijf treden, van vervallen tot prachtig, met steeds meer plek', () => {
    expect(HOUSE_GRADES.map(g => g.n)).toEqual(['Vervallen', 'Eenvoudig', 'Net', 'Welvarend', 'Prachtig']);
    for (let i = 1; i < HOUSE_GRADES.length; i++)
      expect(HOUSE_GRADES[i].popMul).toBeGreaterThan(HOUSE_GRADES[i - 1].popMul);
  });

  it('de trede volgt uit weg, voorzieningen en sfeer', () => {
    expect(targetGrade(home({ linked: false, covered: 3, charm: 8 }))).toBe(0);
    // Een fabriek ernaast houdt het huis eenvoudig
    expect(targetGrade(home({ covered: 3, charm: -1 }))).toBe(1);
    expect(targetGrade(home({ covered: 1 }))).toBe(1);
    // Een hut in de Steentijd met voedsel en veiligheid (van het stamhuis)
    expect(targetGrade(home({ covered: 2, missing: ['faith'] }))).toBe(2);
    expect(targetGrade(home({ covered: 3, charm: 3, missing: [] }))).toBe(3);
    expect(targetGrade(home({ covered: 3, charm: 6, missing: [] }))).toBe(4);
    // Later tellen er meer voorzieningen: dan is drie van de vijf niet genoeg voor prachtig
    expect(targetGrade(home({ covered: 3, unlocked: 5, charm: 8, missing: ['water', 'market'] }))).toBe(3);
  });

  it('groeit na precies 20 s en vervalt na 30 s, één trede per keer', () => {
    let s = { grade: 1, timer: 0 };
    for (let t = 0; t < GROW_AFTER - 0.5; t += 0.5) s = stepGrade(s.grade, 4, s.timer, 0.5);
    expect(s.grade).toBe(1);
    s = stepGrade(s.grade, 4, s.timer, 0.5);
    expect(s).toEqual({ grade: 2, timer: 0 });
    // Een grote stap tegelijk geeft toch maar één trede
    expect(stepGrade(1, 4, 0, 100).grade).toBe(2);
    let d = { grade: 3, timer: 0 };
    for (let t = 0; t < DECLINE_AFTER - 0.5; t += 0.5) d = stepGrade(d.grade, 0, d.timer, 0.5);
    expect(d.grade).toBe(3);
    d = stepGrade(d.grade, 0, d.timer, 0.5);
    expect(d).toEqual({ grade: 2, timer: 0 });
    // Bereikt: het klokje staat stil op 0
    expect(stepGrade(2, 2, 7, 0.5)).toEqual({ grade: 2, timer: 0 });
    // Draait de richting om, dan begint het klokje opnieuw
    expect(stepGrade(2, 1, 15, 0.5).timer).toBe(-0.5);
  });

  it('welvaart geeft (of kost) altijd minstens één inwoner', () => {
    expect(gradePopBonus(3, 1)).toBe(0);
    expect(gradePopBonus(3, 2)).toBe(1);
    expect(gradePopBonus(3, 0)).toBe(-1);
    expect(gradePopBonus(20, 4)).toBe(7);
  });

  it('belasting pas vanaf de Middeleeuwen, en alleen bij welvarend en prachtig', () => {
    expect(taxPerMinute(4, 2)).toBe(0);
    expect(taxPerMinute(2, 5)).toBe(0);
    expect(taxPerMinute(3, 3)).toBe(0.5);
    expect(taxPerMinute(4, 3)).toBe(1);
    expect(taxPerMinute(4, 5)).toBeCloseTo(1.2);
  });

  it('zegt in gewone woorden wat er mist voor de volgende trede', () => {
    expect(nextNeeds(home({ linked: false }), 0)).toEqual(['een weg']);
    expect(nextNeeds(home({ covered: 1, missing: ['safety', 'faith'] }), 1)).toEqual(['veiligheid']);
    expect(nextNeeds(home({ covered: 2, charm: 1, missing: ['faith'] }), 2)).toEqual(['geloof', 'sfeer 3']);
    expect(nextNeeds(home({ covered: 3, charm: 6, missing: [] }), 4)).toEqual([]);
    expect(joinNeeds(['water', 'geloof', 'sfeer 6'])).toBe('water, geloof en sfeer 6');
  });

  it('balans: prachtig geeft hoogstens 35% (plus één) meer, en eenvoudige huizen halen elk tijdperk', () => {
    const homes = Object.entries(B).filter(([k, d]) => d.pop && k !== 'townhall');
    for (const [k, d] of homes) {
      const base = d.pop!;
      expect(base + gradePopBonus(base, 4), k).toBeLessThanOrEqual(base * 1.35 + 1);
      // Eenvoudig verandert niets: de inwoners die een tijdperk vraagt, haal je zoals vroeger
      expect(gradePopBonus(base, 1), k).toBe(0);
    }
    for (let a = 1; a < AGES.length; a++) expect(AGE_UP[a]!.pop).toBeGreaterThan(0);
  });
});
