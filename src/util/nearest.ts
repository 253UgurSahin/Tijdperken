// De k dichtstbijzijnde dingen bij een punt kiezen, zonder elk beeldje nieuwe lijsten te maken.

/** Iets met een plek op de kaart. */
export interface Spot {
  x: number;
  y: number;
}

// Afstanden (in het kwadraat) die bij de lijst `out` horen; steeds hergebruikt
const outDist: number[] = [];

/**
 * Vult `out` met hooguit k dingen uit items die dichter dan maxDist bij (x, y) liggen en die accept goedkeurt,
 * de dichtstbijzijnde eerst. `out` wordt eerst leeggemaakt en weer teruggegeven. Elk nieuw ding schuift op zijn
 * plek in de korte lijst (insertion sort): bij een kleine k is dat sneller dan alles sorteren.
 */
export function nearestK<T extends Spot>(
  items: readonly T[],
  x: number,
  y: number,
  maxDist: number,
  k: number,
  out: T[],
  accept?: (item: T) => boolean,
): T[] {
  out.length = 0;
  outDist.length = 0;
  if (k <= 0) return out;
  const max2 = maxDist * maxDist;
  for (const item of items) {
    const dx = item.x - x,
      dy = item.y - y,
      d2 = dx * dx + dy * dy;
    if (d2 >= max2) continue;
    // Vol en verder weg dan de verste in de lijst: hoeft er niet in
    if (out.length >= k && d2 >= outDist[out.length - 1]) continue;
    if (accept && !accept(item)) continue;
    let at = out.length < k ? out.length : k - 1;
    while (at > 0 && outDist[at - 1] > d2) {
      out[at] = out[at - 1];
      outDist[at] = outDist[at - 1];
      at--;
    }
    out[at] = item;
    outDist[at] = d2;
  }
  return out;
}
