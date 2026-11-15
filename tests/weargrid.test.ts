// Toetst het rekenwerk voor platgelopen grond: erven rond gebouwen, paadjes die groeien en vervagen.
import { describe, expect, it } from 'vitest';
import { addStep, clearYards, createWearGrid, decayPaths, stampYard, writeBytes } from '../src/util/weargrid';

const noRoad = () => false;
// De waarde van een tegel (x, y): het meeste van zijn vakjes
function tileValue(grid: ReturnType<typeof createWearGrid>, out: Uint8Array, x: number, y: number) {
  let m = 0;
  for (let sy = 0; sy < grid.res; sy++)
    for (let sx = 0; sx < grid.res; sx++)
      m = Math.max(m, out[(y * grid.res + sy) * grid.gw + x * grid.res + sx]);
  return m;
}

describe('erven rond gebouwen', () => {
  it('bedekken het gebouw plus de rand en verder niets', () => {
    const grid = createWearGrid(20, 20),
      out = new Uint8Array(grid.gw * grid.gh);
    stampYard(grid, 8, 8, 2, 1, 1, 5);
    writeBytes(grid, out, noRoad);
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 20; x++) {
        const inside = x >= 7 && x <= 10 && y >= 7 && y <= 10,
          v = tileValue(grid, out, x, y);
        const onBuilding = x >= 8 && x <= 9 && y >= 8 && y <= 9;
        if (onBuilding) expect(v).toBeGreaterThanOrEqual(Math.round(0.45 * 255));
        if (inside) {
          expect(v).toBeGreaterThan(Math.round(0.45 * 0.5 * 255) - 1);
          expect(v).toBeLessThanOrEqual(Math.round(0.7 * 255));
        } else expect(v).toBe(0);
      }
  });
  it('op een weg altijd 0', () => {
    const grid = createWearGrid(10, 10),
      out = new Uint8Array(grid.gw * grid.gh);
    stampYard(grid, 2, 2, 3, 1, 1, 1);
    for (let i = 0; i < 50; i++) addStep(grid, 3.5, 3.5, 0.1);
    writeBytes(grid, out, (x, y) => x === 3 && y === 3);
    expect(tileValue(grid, out, 3, 3)).toBe(0);
    expect(tileValue(grid, out, 2, 2)).toBeGreaterThan(0);
  });
  it('wissen en opnieuw neerzetten geeft hetzelfde', () => {
    const grid = createWearGrid(16, 16);
    stampYard(grid, 4, 4, 2, 2, 1, 9);
    const first = grid.yard.slice();
    clearYards(grid, 0, 0, 15, 15);
    expect(grid.yard.every(v => v === 0)).toBe(true);
    stampYard(grid, 4, 4, 2, 2, 1, 9);
    stampYard(grid, 4, 4, 2, 2, 1, 9);
    expect(Array.from(grid.yard)).toEqual(Array.from(first));
  });
  it('blijven staan als paadjes vervagen', () => {
    const grid = createWearGrid(8, 8);
    stampYard(grid, 2, 2, 1, 1, 1, 3);
    const before = grid.yard.slice();
    for (let i = 0; i < 100; i++) decayPaths(grid, 0.99);
    expect(Array.from(grid.yard)).toEqual(Array.from(before));
  });
});

describe('paadjes', () => {
  it('een stap verdeelt zich over de vier dichtste vakjes en blijft hoogstens 1', () => {
    const grid = createWearGrid(4, 4);
    // Precies tussen vier vakjes in (vakjes van een halve tegel, midden op 0,25 en 0,75)
    addStep(grid, 1.0, 1.0, 0.4);
    const k = (cx: number, cy: number) => cy * grid.gw + cx;
    for (const [cx, cy] of [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ])
      expect(grid.path[k(cx, cy)]).toBeCloseTo(0.1);
    expect(grid.path.reduce((a, b) => a + b, 0)).toBeCloseTo(0.4);
    for (let i = 0; i < 100; i++) addStep(grid, 1.0, 1.0, 0.4);
    expect(Math.max(...grid.path)).toBe(1);
  });
  it('60 keer vervagen met 0,99 laat ongeveer 55% over', () => {
    const grid = createWearGrid(4, 4);
    addStep(grid, 1.25, 1.25, 0.8); // midden op een vakje: alles in één vakje
    const start = Math.max(...grid.path);
    for (let i = 0; i < 60; i++) decayPaths(grid, 0.99);
    expect(Math.max(...grid.path) / start).toBeCloseTo(0.547, 2);
  });
  it('vervagen binnen een stuk laat de rest staan', () => {
    const grid = createWearGrid(10, 10);
    addStep(grid, 1.25, 1.25, 0.5);
    addStep(grid, 8.25, 8.25, 0.5);
    decayPaths(grid, 0.5, { x0: 0, y0: 0, x1: 3, y1: 3 });
    expect(grid.path[2 * grid.gw + 2]).toBeCloseTo(0.25);
    expect(grid.path[16 * grid.gw + 16]).toBeCloseTo(0.5);
  });
});
