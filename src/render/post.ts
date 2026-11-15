// Nabewerking van het beeld: een zachte gloed rond lichten en vuur (bloom) en kleurcorrectie. Hoeveel
// hiervan aan staat, hangt af van de kwaliteitsinstelling (zie quality.ts); op "laag" wordt het beeld
// direct getekend. (De omlijning van wat je selecteert zit in outline.ts en kost geen extra beeldpas.)
import * as T3 from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CAM3, R3, S3 } from './scene';
import { setOutlineEnabled } from './outline';

// Zachte "schouder" voor felle kleuren: tot 0.8 blijft alles gelijk, daarboven loopt het
// geleidelijk naar wit in plaats van hard af te kappen. Zo houden zonnig zand, sneeuw en
// witte randen hun tekening. Dezelfde formule zit in de nabewerking en (op laag/middel) in de
// materialen; daarom staat hij hier één keer, met een eigen naam per plek.
const shoulder = (name: string) => `vec3 ${name}(vec3 c) {
    vec3 over = max(c - 0.8, 0.0);
    return min(c, 0.8) + 0.2 * (1.0 - exp(-over / 0.2));
  }`;
T3.ShaderChunk.tonemapping_pars_fragment = T3.ShaderChunk.tonemapping_pars_fragment.replace(
  'vec3 CustomToneMapping( vec3 color ) { return color; }',
  shoulder('tpShoulder') +
    '\nvec3 CustomToneMapping( vec3 color ) { return tpShoulder( color * toneMappingExposure ); }',
);

// Kleurcorrectie: zachte schouder, iets meer contrast en kleur, een klein beetje verscherpen
// (fijne details komen beter uit) en zacht donkere hoeken (vignet) voor diepte. Daarbij warm licht en
// koele schaduw (uSplit, sterker bij zonsopkomst en -ondergang) en 's nachts blauw maanlicht (uNight).
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new T3.Vector2() },
    uSharpen: { value: 0 },
    uShoulder: { value: 1 },
    uNight: { value: 0 },
    uSplit: { value: 1 },
    uWet: { value: 0 },
    tBloom: { value: null },
    uBloom: { value: 0 },
  },
  vertexShader: `varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uSharpen; uniform float uShoulder;
    uniform float uNight; uniform float uSplit; uniform float uWet;
    uniform sampler2D tBloom; uniform float uBloom;
    varying vec2 vUv;
    ${shoulder('softShoulder')}
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (uSharpen > 0.0) {
        vec3 around = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb
          + texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb
          + texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb
          + texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb;
        c = max(c + (c - around * 0.25) * uSharpen, 0.0);
      }
      // De gloed komt er hier bij (na het verscherpen, zodat de gloed zelf zacht blijft; vóór de schouder,
      // zoals toen de gloedstap hem nog los over het beeld legde)
      c += texture2D(tBloom, vUv).rgb * uBloom;
      if (uShoulder > 0.5) c = softShoulder(c);
      c = (c - 0.5) * 1.07 + 0.5;                       // contrast
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 1.12);                         // verzadiging
      // Warm licht, koele schaduw: lichte delen een tikje warmer, donkere een tikje koeler
      c += (l - 0.45) * 0.04 * uSplit * vec3(1.0, 0.3, -0.9);
      // Bewolkt (regen, sneeuw): de kleuren worden wat grauwer
      c = mix(c, vec3(l), 0.15 * uWet);
      // Maanlicht: 's nachts worden donkere, kleurloze delen (gras, muren, daken) blauwgrijs. Wat fel, warm
      // of echt gekleurd is (ramen, lampen, vuur, teamkleuren, de groene selectiering) blijft zoals het is.
      if (uNight > 0.0) {
        float hi = max(c.r, max(c.g, c.b)), lo = min(c.r, min(c.g, c.b));
        float keep = max(smoothstep(0.5, 0.85, hi), smoothstep(0.08, 0.25, c.r - c.b));
        keep = max(keep, smoothstep(0.09, 0.15, hi - lo));
        vec3 moon = vec3(l) * vec3(0.78, 0.9, 1.2) + vec3(0.0, 0.006, 0.022);
        c = mix(c, moon, uNight * 0.55 * (1.0 - keep));
      }
      vec2 d = vUv - 0.5;
      c *= 1.0 - dot(d, d) * 0.38;                       // vignet
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

// Lichtfilter van de gloed, met 4 monsters in plaats van 1. De gloed rekent op een kwart van de pixels in
// elke richting: één monster ziet dan maar 2×2 van elk blok van 4×4 pixels, en een klein verlicht raam
// (2 tot 4 pixels) flikkert dan aan en uit als je het beeld verschuift. Vier monsters zien het hele blok.
// De drempel geldt per monster (en daarna het gemiddelde): anders zakt een klein raam onder de drempel en gloeit
// het helemaal niet meer.
const BRIGHT_FRAGMENT = `uniform sampler2D tDiffuse; uniform vec3 defaultColor; uniform float defaultOpacity;
    uniform float luminosityThreshold; uniform float smoothWidth; uniform vec2 uSrcTexel;
    varying vec2 vUv;
    vec4 bright(vec2 uv) {
      vec4 texel = texture2D(tDiffuse, uv);
      float v = dot(texel.xyz, vec3(0.299, 0.587, 0.114));
      float alpha = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, v);
      return mix(vec4(defaultColor.rgb, defaultOpacity), texel, alpha);
    }
    void main() {
      gl_FragColor = 0.25 * (bright(vUv + vec2(-uSrcTexel.x, -uSrcTexel.y))
        + bright(vUv + vec2(uSrcTexel.x, -uSrcTexel.y))
        + bright(vUv + vec2(-uSrcTexel.x, uSrcTexel.y))
        + bright(vUv + vec2(uSrcTexel.x, uSrcTexel.y)));
    }`;

const BLUR_X = new T3.Vector2(1, 0),
  BLUR_Y = new T3.Vector2(0, 1);

/**
 * De gloed (bloom) zoals UnrealBloomPass hem maakt, maar zonder de laatste stap: die legde de gloed nog eens over
 * het hele beeld (een extra tekenstap op volle resolutie, met 4 monsters per pixel). Nu leest de kleurcorrectie
 * de gloed zelf uit renderTargetsHorizontal[0] (zie GradeShader).
 */
class GlowPass extends UnrealBloomPass {
  private readonly keepClearColor = new T3.Color();
  constructor(resolution: T3.Vector2, strength: number, radius: number, threshold: number) {
    super(resolution, strength, radius, threshold);
    const mat = this.materialHighPassFilter;
    mat.uniforms.uSrcTexel = { value: new T3.Vector2(1 / 1024, 1 / 1024) };
    mat.fragmentShader = BRIGHT_FRAGMENT;
    mat.needsUpdate = true;
    this.needsSwap = false;
  }
  /** Hoe groot één pixel van het volle beeld is (in beeldcoördinaten), voor het lichtfilter. */
  setSourceSize(w: number, h: number) {
    (this.materialHighPassFilter.uniforms.uSrcTexel.value as T3.Vector2).set(1 / w, 1 / h);
  }
  /** De gloed van dit beeldje, voor de kleurcorrectie. */
  get glowTexture(): T3.Texture {
    return this.renderTargetsHorizontal[0].texture;
  }
  override render(
    renderer: T3.WebGLRenderer,
    _writeBuffer: T3.WebGLRenderTarget,
    readBuffer: T3.WebGLRenderTarget,
  ) {
    // Dezelfde stappen als UnrealBloomPass.render (three r149), zonder het tekenen naar het scherm en zonder de
    // laatste stap terug in het beeld. Wisstand en wiskleur zetten we daarna terug zoals ze waren.
    renderer.getClearColor(this.keepClearColor);
    const oldClearAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setClearColor(this.clearColor, 0);
    // 1. De felle delen eruit halen
    const bright = this.materialHighPassFilter.uniforms;
    bright.tDiffuse.value = readBuffer.texture;
    bright.luminosityThreshold.value = this.threshold;
    this.fsQuad.material = this.materialHighPassFilter;
    renderer.setRenderTarget(this.renderTargetBright);
    renderer.clear();
    this.fsQuad.render(renderer);
    // 2. Steeds waziger maken, op steeds kleinere maten
    let input = this.renderTargetBright;
    for (let i = 0; i < this.nMips; i++) {
      const blur = this.separableBlurMaterials[i];
      this.fsQuad.material = blur;
      blur.uniforms.colorTexture.value = input.texture;
      blur.uniforms.direction.value = BLUR_X;
      renderer.setRenderTarget(this.renderTargetsHorizontal[i]);
      renderer.clear();
      this.fsQuad.render(renderer);
      blur.uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture;
      blur.uniforms.direction.value = BLUR_Y;
      renderer.setRenderTarget(this.renderTargetsVertical[i]);
      renderer.clear();
      this.fsQuad.render(renderer);
      input = this.renderTargetsVertical[i];
    }
    // 3. Alle maten samenvoegen tot één gloed
    const comp = this.compositeMaterial.uniforms;
    this.fsQuad.material = this.compositeMaterial;
    comp.bloomStrength.value = this.strength;
    comp.bloomRadius.value = this.radius;
    comp.bloomTintColors.value = this.bloomTintColors;
    renderer.setRenderTarget(this.renderTargetsHorizontal[0]);
    renderer.clear();
    this.fsQuad.render(renderer);
    renderer.setClearColor(this.keepClearColor, oldClearAlpha);
    renderer.autoClear = oldAutoClear;
  }
}

// Een zwart plaatje van 1 pixel: wat de kleurcorrectie als gloed leest als de gloed uit staat
const NO_GLOW = new T3.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
NO_GLOW.needsUpdate = true;

// Worden pas gemaakt als de nabewerking aan gaat (zie build), en dan allemaal tegelijk
let composer: EffectComposer | null = null,
  bloom: GlowPass | null = null,
  grade: ShaderPass | null = null;
const on = { post: false, bloom: false, outline: false, sharpen: 0, hdr: false, samples: 0 };
/** Laatste schermmaat: breedte, hoogte en pixelverhouding. */
let size: [number, number, number] = [4, 4, 1];

// Boven zoveel pixels wordt het beeld met 2 in plaats van 4 monsters per pixel gladgestreken: op een
// 4K-scherm kost 4× anders meer geheugenverkeer dan de hele rest van het beeld bij elkaar
const MSAA_FULL_PIXELS = 4.5e6;
const wantSamples = () => {
  if (!R3.capabilities.isWebGL2) return 0;
  const [w, h, dpr] = size;
  return w * h * dpr * dpr > MSAA_FULL_PIXELS ? 2 : 4;
};

function build(hdr: boolean) {
  // Eigen render-doel met multisampling, zodat randen ook met nabewerking glad blijven.
  // Op "hoog" met "half float": dan mogen kleuren feller dan wit zijn, en gloeien alleen echte
  // lichten (in plaats van alles wat in de zon wit wordt). Op "middel" gewone kleuren: lichter.
  const samples = wantSamples();
  const target = new T3.WebGLRenderTarget(4, 4, {
    samples,
    type: hdr ? T3.HalfFloatType : T3.UnsignedByteType,
  });
  composer = new EffectComposer(R3, target);
  composer.addPass(new RenderPass(S3, CAM3));
  // Alleen echt felle dingen (vuur, lampen, lasers) gloeien: de drempel ligt hoog
  bloom = new GlowPass(new T3.Vector2(256, 256), 0.55, 0.5, hdr ? 1.35 : 0.82);
  composer.addPass(bloom);
  grade = new ShaderPass(GradeShader);
  grade.uniforms.uShoulder.value = hdr ? 1 : 0;
  // De laatste stap tekent direct op het scherm; niet wisselen betekent dat het tweede
  // (grote) render-doel van de composer nooit nodig is. Dat scheelt videogeheugen.
  grade.needsSwap = false;
  composer.addPass(grade);
  on.hdr = hdr;
  on.samples = samples;
  resizePost(...size);
}

// (alleen aangeroepen als composer bestaat, zie configurePost)
function dispose() {
  for (const pass of composer!.passes) pass.dispose && pass.dispose();
  composer!.dispose();
  composer = null;
}

/** Welke onderdelen van de nabewerking aan staan: alles, de gloed en de omlijning. */
export interface PostSettings {
  post: boolean;
  bloom: boolean;
  outline: boolean;
  /** Hoeveel het beeld verscherpt wordt (0 = niet). */
  sharpen?: number;
  /** Kleuren feller dan wit, zodat alleen echte lichten gloeien (alleen als de videokaart dat kan). */
  hdr?: boolean;
}
/** Zet onderdelen van de nabewerking aan of uit. */
export function configurePost({ post, bloom: useBloom, outline, sharpen = 0, hdr = false }: PostSettings) {
  // Felle kleuren alleen als de videokaart dat kan
  hdr = hdr && R3.capabilities.isWebGL2 && R3.extensions.has('EXT_color_buffer_float');
  on.post = post;
  on.bloom = useBloom;
  on.outline = outline;
  on.sharpen = sharpen;
  if (composer && (!post || on.hdr !== hdr)) dispose();
  if (post && !composer) build(hdr);
  // composer, bloom en grade bestaan altijd samen (zie build)
  if (composer) {
    bloom!.enabled = useBloom;
    grade!.uniforms.uSharpen.value = sharpen;
    linkGlow();
  }
  setOutlineEnabled(outline);
  // De zachte schouder voor felle kleuren zit in de laatste stap als die felle kleuren kent
  // (hoog); anders in de materialen zelf. Zo gebeurt het altijd precies één keer.
  R3.toneMapping = composer && on.hdr ? T3.NoToneMapping : T3.CustomToneMapping;
}

export function resizePost(w: number, h: number, dpr: number) {
  size = [w, h, dpr];
  if (!composer) return;
  // Een ander aantal monsters per pixel nodig (zie MSAA_FULL_PIXELS)? Dan alles opnieuw opbouwen
  if (on.samples !== wantSamples()) {
    dispose();
    build(on.hdr);
    return;
  }
  composer.setPixelRatio(dpr);
  composer.setSize(w, h);
  // De gloed is een wazige deken: die hoeft maar op een kwart van de pixels (de helft in elke richting
  // van wat de composer zou nemen). Dat scheelt vier keer zoveel werk en je ziet het verschil niet.
  bloom!.setSize(Math.max(2, Math.round((w * dpr) / 2)), Math.max(2, Math.round((h * dpr) / 2)));
  grade!.uniforms.uTexel.value.set(1 / Math.max(1, w * dpr), 1 / Math.max(1, h * dpr));
  bloom!.setSourceSize(Math.max(1, w * dpr), Math.max(1, h * dpr));
  linkGlow();
}

// De kleurcorrectie leest de gloed (of zwart als die uit staat). Opnieuw na elke maatwijziging, voor de zekerheid.
function linkGlow() {
  grade!.uniforms.tBloom.value = on.bloom ? bloom!.glowTexture : NO_GLOW;
  grade!.uniforms.uBloom.value = on.bloom ? 1 : 0;
}

/** Hoe de nabewerking nu tekent (voor gpustats.ts): soort kleuren, monsters per pixel en de maat in pixels. */
export function postTargetInfo(): {
  type: 'HalfFloat' | 'UnsignedByte';
  samples: number;
  w: number;
  h: number;
} | null {
  if (!composer) return null;
  const t = composer.renderTarget1;
  return {
    type: on.hdr ? 'HalfFloat' : 'UnsignedByte',
    samples: on.samples,
    w: Math.round(t.width),
    h: Math.round(t.height),
  };
}

/**
 * De gloed hangt af van het uur: overdag gloeit alleen wat feller is dan zonnig wit,
 * 's nachts ook verlichte ramen en lampen. dk = hoe donker het is (0 = dag, 1 = nacht).
 */
export function setBloomDarkness(dk: number) {
  if (!bloom) return;
  bloom.threshold = on.hdr ? 1.35 - dk * 0.6 : 0.82;
  // Hoe sterk het maanlicht in de kleurcorrectie is: 1 midden in de nacht (dan is dk 0,78).
  // (grade bestaat altijd samen met bloom, zie build)
  grade!.uniforms.uNight.value = Math.min(1, dk / 0.78);
}

/**
 * Warm licht en koele schaduw: 1 overdag, sterker bij zonsopkomst en -ondergang (dusk 0..1).
 * wet: hoe bewolkt het is (0..1), dan worden de kleuren wat grauwer.
 */
export function setGradeTime(dusk: number, wet: number) {
  if (!grade) return;
  grade.uniforms.uSplit.value = 1 + 0.8 * dusk;
  grade.uniforms.uWet.value = wet;
}

export function renderFrame() {
  // Staat on.post aan, dan is build() al gedaan en bestaat composer
  if (on.post) composer!.render();
  else R3.render(S3, CAM3);
}
