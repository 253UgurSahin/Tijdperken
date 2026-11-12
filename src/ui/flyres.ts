// Een geleverde grondstof vliegt als klein icoontje van de opslag naar zijn teller bovenin, en die tikt even aan.
// Zo zie je wat je dorpelingen binnenbrengen, zonder dat je naar de getallen hoeft te kijken.
import { SET } from '../core/settings';
import { proj } from '../render/camera';
import { gem } from './format';

// Niet te veel tegelijk: bij een grote stad leveren er elke seconde tientallen in
const MAX_FLYING = 10;
const MIN_GAP_MS = 140;
let flying = 0;
const lastAt: Record<string, number> = {};

/** De plek waar de grondstof naartoe vliegt: zijn teller, of de knop +N als hij niet in de strook past. */
function targetFor(res: string): HTMLElement | null {
  const chip = document.querySelector<HTMLElement>(`#resbar .res[data-k="${res}"]`);
  if (chip && !chip.hidden && chip.offsetParent) return chip;
  const more = document.querySelector<HTMLElement>('#resMore');
  return more && !more.hidden ? more : null;
}

/** Laat de teller even opveren (de animatie staat in styles/juice.css). */
function bump(el: HTMLElement): void {
  el.classList.remove('bump');
  void el.offsetWidth; // zo begint de animatie opnieuw, ook als hij net nog liep
  el.classList.add('bump');
}

/** Grondstof `res` is geleverd op tegel (x, y): laat hem naar zijn teller vliegen. */
export function flyToBar(x: number, y: number, res: string): void {
  if (!SET.motion || document.hidden || flying >= MAX_FLYING) return;
  const now = performance.now();
  if (now - (lastAt[res] || 0) < MIN_GAP_MS) return;
  const target = targetFor(res);
  if (!target) return;
  const [sx, sy, depth] = proj(x, 0.6, y);
  // Alleen als de plek in beeld is (achter de camera of buiten het scherm heeft geen zin)
  if (depth > 1 || sx < 0 || sy < 0 || sx > innerWidth || sy > innerHeight) return;
  lastAt[res] = now;
  const end = target.getBoundingClientRect(),
    ex = end.left + Math.min(end.width, 28) / 2,
    ey = end.top + end.height / 2;
  const token = document.createElement('div');
  token.className = 'flyres';
  token.innerHTML = gem(res);
  token.style.left = sx + 'px';
  token.style.top = sy + 'px';
  document.body.appendChild(token);
  flying++;
  // Een boogje: eerst wat omhoog, dan naar de teller
  const dx = ex - sx,
    dy = ey - sy;
  const anim = token.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
      {
        transform: `translate(calc(-50% + ${dx * 0.3}px), calc(-50% + ${dy * 0.15 - 60}px)) scale(1.3)`,
        opacity: 1,
        offset: 0.3,
      },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.8)`, opacity: 0.9 },
    ],
    { duration: 650 + Math.random() * 150, easing: 'cubic-bezier(.5,0,.6,1)' },
  );
  anim.onfinish = anim.oncancel = () => {
    token.remove();
    flying--;
    bump(target);
  };
}
