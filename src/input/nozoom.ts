// Zoomen van de browser zelf uitzetten: knijpen, Ctrl+scrollen en Ctrl +/- zoomen de spelwereld, niet de pagina.
// Anders schuift de hele HUD uit beeld en moet je terugzoomen voordat je verder kunt spelen.
import { zoomTo } from './input';
import { cam } from '../render/scene';

/** De browser vragen om niet te zoomen: een vaste schaal in de viewport (de artifact zet er zelf een neer). */
function lockViewport(): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    document.head.appendChild(meta);
  }
  meta.content = 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';
}
lockViewport();

// Ctrl+scrollen (en knijpen op een touchpad, dat de browser als Ctrl+scrollen doorgeeft): nooit de pagina
// zoomen. Op de kaart zelf zoomt het spel dan de camera (zie de wheel-luisteraar in input.ts).
addEventListener(
  'wheel',
  e => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  },
  { passive: false, capture: true },
);

// Ctrl + plus, min of nul: de camera zoomen in plaats van de pagina
const ZOOM_KEYS: Record<string, number> = {
  Equal: 1.25,
  NumpadAdd: 1.25,
  Minus: 0.8,
  NumpadSubtract: 0.8,
  Digit0: 0,
  Numpad0: 0,
};
addEventListener(
  'keydown',
  e => {
    if (!(e.ctrlKey || e.metaKey) || !(e.code in ZOOM_KEYS)) return;
    e.preventDefault();
    const step = ZOOM_KEYS[e.code];
    zoomTo(step ? (cam.tz ?? cam.z) * step : 1);
  },
  { capture: true },
);

// Safari (iPhone en iPad) negeert user-scalable=no; daar houden deze gebaren het knijpen tegen
for (const type of ['gesturestart', 'gesturechange', 'gestureend'])
  addEventListener(type, e => e.preventDefault(), { passive: false });
