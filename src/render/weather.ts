// Het weer in de shaders: hoeveel sneeuw er ligt, gevallen blad en windvlagen. Grond, gebouwen, bomen, rotsen
// en gras lezen allemaal hieruit, zodat ze samen met het seizoen meegaan (zie seasons.ts).
import type * as T3 from 'three';

/** Hoeveel sneeuw er ligt, van 0 (geen) tot 1 (alles wit). seasons.ts laat dit met het seizoen meelopen. */
export const SNOW_COVER = { value: 0 };
/** Hoeveel gevallen blad er rond de bomen ligt (0..1): alleen in de herfst (zie seasons.ts). */
export const LEAF_LITTER = { value: 0 };
/** Hoe nat de grond en de daken zijn van de regen (0..1). Loopt mee met G.rain, behalve in de winter (dan sneeuwt het). */
export const RAIN_WET = { value: 0 };

/**
 * Elk beeldje: laat de natheid meelopen met de regen. Nat worden gaat vlot (zo'n 15 seconden), opdrogen
 * duurt langer (zo'n minuut). dt in seconden speltijd.
 */
export function stepWetGround(dt: number, raining: boolean, winter: boolean): void {
  const want = raining && !winter ? 1 : 0,
    tau = want > RAIN_WET.value ? 5 : 20,
    // (1 - e^(-dt/tijd): even snel bij 30 en bij 120 beeldjes per seconde)
    k = 1 - Math.exp(-dt / tau);
  RAIN_WET.value += (want - RAIN_WET.value) * k;
  if (RAIN_WET.value < 0.001) RAIN_WET.value = 0;
}

/**
 * Windvlagen (GLSL): een golf die over het land trekt en bomen en gras even harder laat zwaaien.
 * Nodig in de shader: `ip` (de plek van het ding) en `uWind` (de tijd). Gebruik: sway *= WIND_GUST.
 */
export const WIND_GUST =
  '(1.0 + 1.6 * pow(0.5 + 0.5 * sin(dot(ip.xz, vec2(0.8, 0.6)) * 0.12 - uWind * 0.9), 8.0))';

/** Hoe de sneeuw op een materiaal ligt (zie addSnow). */
export interface SnowLook {
  /**
   * Vanaf hoe vlak een stukje sneeuw krijgt (0 = rechtop, 1 = vlak), en vanaf waar het helemaal wit is. Een getal,
   * of een GLSL-uitdrukking (zoals een uniform per materiaal: dan delen materialen met elk een eigen waarde één shader).
   */
  lo: number | string;
  hi: number | string;
  /** Hoe wit het hoogstens wordt (1 = helemaal). */
  max: number;
  /** GLSL: maakt de rand van de sneeuw grillig (een getal rond 0). Zonder: een eenvoudig golfpatroon. */
  blotch?: string;
  /**
   * Sneeuw grijzer op donkere dingen: de helderheid van de kleur per boom of steen keer dit getal (tussen 0,6
   * en 1). Zo blijft sneeuw in de wildernis (donkerder getekend) grijzer dan op je eigen land. Zonder: even wit.
   */
  tint?: number;
}

// Een getal als GLSL-getal (altijd met een punt erin, anders is het een geheel getal); tekst blijft tekst
const glsl = (n: number | string) =>
  typeof n === 'string' ? n : Number.isInteger(n) ? n.toFixed(1) : String(n);

/**
 * Leg in de winter sneeuw op de bovenkant van een materiaal (aanroepen in onBeforeCompile). Alleen de uniform
 * uSnowCover bepaalt hoeveel: een ander seizoen maakt dus nooit een nieuwe shader. Materialen met andere
 * instellingen hebben elk een eigen customProgramCacheKey nodig (three.js herkent een shader aan die sleutel).
 */
export function addSnow(shader: T3.Shader, look: SnowLook): void {
  shader.uniforms.uSnowCover = SNOW_COVER;
  const tint =
    look.tint == null
      ? ''
      : `#if defined( USE_COLOR )
          snowCol *= clamp(dot(vColor.rgb, vec3(0.3, 0.59, 0.11)) * ${glsl(look.tint)}, 0.6, 1.0);
        #endif`;
  // Na normal_fragment_maps: daar is de richting van het vlak (normal) bekend en de kleur nog niet belicht.
  // Alleen in de wereld (die heeft nevel): pictogrammen, die three.js in een eigen scène zonder nevel tekent,
  // blijven zo zonder sneeuw. Die worden één keer gemaakt en bewaard, ook als het daarna zomer wordt.
  shader.fragmentShader = ('uniform float uSnowCover;\n' + shader.fragmentShader).replace(
    '#include <normal_fragment_maps>',
    `#include <normal_fragment_maps>
    #ifdef USE_FOG
      if (uSnowCover > 0.001) {
        // Hoe vlak ligt dit stukje in de wereld (1 = vlak, 0 = rechtop)? Alleen bovenkanten krijgen sneeuw.
        float snowUp = inverseTransformDirection(normal, viewMatrix).y;
        // De plek in de wereld, teruggerekend vanuit de camera (zo is er geen extra varying nodig)
        vec3 snowPos = (vec4(-vViewPosition - viewMatrix[3].xyz, 0.0) * viewMatrix).xyz;
        float snowEdge = ${look.blotch ?? 'sin(snowPos.x * 11.0 + sin(snowPos.z * 9.0)) * sin(snowPos.z * 10.0 + snowPos.y * 7.0) * 0.12'};
        float snowAmt = uSnowCover * ${glsl(look.max)} * smoothstep(${glsl(look.lo)}, ${glsl(look.hi)}, snowUp + snowEdge);
        vec3 snowCol = vec3(0.9, 0.93, 0.97);
        ${tint}
        diffuseColor.rgb = mix(diffuseColor.rgb, snowCol, snowAmt);
      }
    #endif`,
  );
}
