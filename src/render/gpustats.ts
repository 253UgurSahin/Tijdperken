// Alleen voor ontwikkelen: hoeveel videogeheugen het canvas, de nabewerking en de schaduwkaart ongeveer kosten.
import { postTargetInfo } from './post';
import { R3, sun } from './scene';

/** Een overzicht van de grote buffers op de videokaart (zie gpuReport). */
export interface GpuReport {
  canvas: { antialias: boolean; depth: boolean; stencil: boolean };
  drawingBuffer: [number, number];
  composer: { type: 'HalfFloat' | 'UnsignedByte'; samples: number; w: number; h: number } | null;
  shadowMap: number;
  shadowBox: { left: number; right: number; top: number; bottom: number };
  estBytes: { canvas: number; composer: number; shadow: number; total: number };
}

/**
 * Een schatting in bytes, met deze vuistregels:
 * - canvas: w·h·36 met gladde randen (4 monsters kleur + diepte, plus het gewone beeld), anders w·h·8;
 * - nabewerking: per monster kleur (bpp) + diepte (4), plus één opgelost beeld; bpp is 8 voor HalfFloat en 4 voor
 *   gewone kleuren: w·h·(samples·(bpp+4) + bpp + 4), zonder monsters w·h·(bpp + 4);
 * - schaduwkaart: map²·8 (diepte plus kleur).
 */
export function gpuReport(): GpuReport {
  const gl = R3.getContext();
  const attrs = gl.getContextAttributes();
  const canvas = { antialias: !!attrs?.antialias, depth: !!attrs?.depth, stencil: !!attrs?.stencil };
  const w = gl.drawingBufferWidth,
    h = gl.drawingBufferHeight;
  const composer = postTargetInfo();
  const map = sun.shadow.mapSize.x;
  const sh = sun.shadow.camera;
  const canvasBytes = w * h * (canvas.antialias ? 36 : 8);
  let composerBytes = 0;
  if (composer) {
    const bpp = composer.type === 'HalfFloat' ? 8 : 4;
    const perPixel = composer.samples ? composer.samples * (bpp + 4) + bpp + 4 : bpp + 4;
    composerBytes = composer.w * composer.h * perPixel;
  }
  const shadowBytes = sun.castShadow ? map * map * 8 : 0;
  return {
    canvas,
    drawingBuffer: [w, h],
    composer,
    shadowMap: map,
    shadowBox: { left: sh.left, right: sh.right, top: sh.top, bottom: sh.bottom },
    estBytes: {
      canvas: canvasBytes,
      composer: composerBytes,
      shadow: shadowBytes,
      total: canvasBytes + composerBytes + shadowBytes,
    },
  };
}
