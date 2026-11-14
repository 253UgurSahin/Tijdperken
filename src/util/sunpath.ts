// Waar de zon staat op elk uur van de dag: pure rekensom, zonder three.js, zodat hij te testen is.

/**
 * Richting naar de zon rond 12 uur: schuin van linksachter, zoals het spel altijd belicht was.
 * Vast (bevroren): verander hem nooit, alles rond de zon rekent hiervandaan.
 */
export const SUN_NOON: readonly [number, number, number] = Object.freeze(
  ((x: number, y: number, z: number): [number, number, number] => {
    const len = Math.hypot(x, y, z);
    return [x / len, y / len, z / len];
  })(-28, 46, 14),
);

const DEG = Math.PI / 180;
/** Lager dan dit komt de zon nooit, anders worden de schaduwen eindeloos lang. */
export const SUN_MIN_EL = 19 * DEG;
const NOON_AZ = Math.atan2(SUN_NOON[2], SUN_NOON[0]),
  NOON_EL = Math.asin(SUN_NOON[1]);
// Zo ver draait de zon weg van zijn plek om 12 uur. 's Ochtends minder, anders staat het spel bij de start
// (7 uur) in tegenlicht; 's avonds meer, zodat de muren die je ziet het gouden licht vangen.
const MORNING_SWING = 32 * DEG,
  EVENING_SWING = 65 * DEG;

/**
 * Richting naar de zon op dit uur (lengte 1). Om half zes laag achter de stad (in het standaardbeeld),
 * om 12 uur precies SUN_NOON, om 20 uur laag links vóór.
 */
export function sunDirAt(clock: number): [number, number, number] {
  // 0 = 5:30, 0,5 = 12:00, 1 = 20:00 (de ochtend is wat korter dan de middag en avond)
  const t = clock < 12 ? 0.5 * Math.max(0, (clock - 5.5) / 6.5) : 0.5 + 0.5 * Math.min(1, (clock - 12) / 8);
  const el = Math.max(SUN_MIN_EL, 10 * DEG + (NOON_EL - 10 * DEG) * Math.sin(Math.PI * t)),
    az = NOON_AZ + (t < 0.5 ? MORNING_SWING : EVENING_SWING) * (1 - 2 * t);
  return [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
}
