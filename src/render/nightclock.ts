// Rekenwerk voor licht in de stad 's nachts: welk deel van de ramen aan is, en wanneer elke lamp aangaat.
// Alleen getallen (geen three.js), zodat het los te testen is.

const smooth01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const fract = (v: number) => v - Math.floor(v);
// Zachte overgang van 0 naar 1 tussen uur a en uur b
const ramp = (t: number, a: number, b: number) => smooth01((t - a) / (b - a));

/** Een vast toevalsgetal (0..1) bij vakje (x, y). Precies dezelfde som staat in de lamp-shader (kit.ts). */
export function lampHash(x: number, y: number): number {
  let a = fract(x * 0.1031),
    b = fract(y * 0.1031),
    c = a;
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d;
  b += d;
  c += d;
  return fract((a + b) * c);
}

/** Een vast toevalsgetal (0..1) uit drie hele getallen. Precies dezelfde som staat in de raam-shader (kit.ts). */
export function winHash(x: number, y: number, z: number): number {
  let a = fract(x * 0.1031),
    b = fract(y * 0.103),
    c = fract(z * 0.0973);
  // (p += dot(p, p.yxz + 33.33) uit de shader)
  const d = a * (b + 33.33) + b * (a + 33.33) + c * (c + 33.33);
  a += d;
  b += d;
  c += d;
  return fract((a + b) * c);
}

/**
 * Hoe fel het licht bij de deur van een huis brandt (0..1), met dezelfde regel als zijn ramen in de shader:
 * 's avonds gaat het huis aan als zijn nummer onder het avonddeel zit, 's nachts blijft het aan zolang zijn
 * eerste ruit nog brandt. (cx, cz) = het midden van het huis in de wereld; evening en night uit litShares.
 */
export function doorLight(cx: number, cz: number, evening: number, night: number): number {
  // Zoals vWinId in de shader: plek maal twee, afgerond
  const hx = Math.floor(cx * 2 + 0.5),
    hz = Math.floor(cz * 2 + 0.5);
  const house = winHash(hx, hz, 0),
    pane = winHash(hx, hz, 7);
  // (een korte zachte overgang, zodat het licht niet in één beeldje aan of uit springt)
  const on = (share: number, at: number) => Math.min(1, Math.max(0, (share - at) / 0.03));
  return on(evening, house) * on(night, fract(pane * 31.7));
}

/**
 * Bij welke donkerte (0..0.78) de lamp op plek (x, y) aangaat: voor elke lamp een vast, eigen moment, zodat ze
 * 's avonds één voor één aangaan. De lichtvlek en het licht (lighting.ts) en de lampkop (shader) gebruiken dit
 * allemaal, dus ze gaan samen aan.
 */
export const lampSwitchAt = (x: number, y: number) => 0.05 + 0.4 * lampHash(Math.floor(x), Math.floor(y));

/**
 * Welk deel van de ramen nu aan mag: [avond, nacht]. 's Avonds gaan ze tussen 18:00 en 21:00 huis voor huis
 * aan, tot ongeveer 85%. Na half twaalf gaan ze per raam weer uit, tot zo'n 15% om half drie. Vroeg in de
 * ochtend gaan er een paar weer aan, en bij zonsopkomst gaan alle ramen uit.
 */
export function litShares(clock: number): [number, number] {
  // Uren sinds het middaguur, zodat de hele nacht één doorlopend stuk is (18:00 = 6, middernacht = 12)
  const t = (clock + 12) % 24;
  // Bij het invallen van het donker gaan er snel veel lichten aan, daarna steeds minder (rond 19:10 de helft)
  const dusk = 1 - Math.pow(1 - Math.min(1, Math.max(0, (t - 6) / 3)), 1.6);
  const evening = 0.85 * smooth01(dusk) * (1 - ramp(t, 18, 18.35));
  const night = 1 - 0.82 * ramp(t, 11.5, 14.5) - 0.05 * ramp(t, 14.5, 16.5) + 0.27 * ramp(t, 16.5, 17.75);
  return [evening, night];
}
