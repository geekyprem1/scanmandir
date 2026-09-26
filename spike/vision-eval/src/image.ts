import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

export interface PreparedImage {
  dataUrl: string;
  byteLength: number;
  width: number | null;
  height: number | null;
  resized: boolean;
  note: string | null;
}

type SharpFactory = (typeof import('sharp'))['default'];

let sharpLoad: Promise<SharpFactory | null> | null = null;

/**
 * sharp is an optional dependency with native binaries. If it is unavailable the
 * harness still runs, but it sends the original full-resolution photo — which inflates
 * image token counts well above the normalized derivative the architecture plans to
 * send, so the measured cost would not represent production.
 */
async function loadSharp(): Promise<SharpFactory | null> {
  sharpLoad ??= import('sharp')
    .then((mod) => mod.default)
    .catch(() => null);
  return sharpLoad;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export async function prepareImage(filePath: string): Promise<PreparedImage> {
  const original = await fs.readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const mime = MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';

  if (!config.resize) {
    return {
      dataUrl: `data:${mime};base64,${original.toString('base64')}`,
      byteLength: original.byteLength,
      width: null,
      height: null,
      resized: false,
      note: 'resize disabled; token cost will not match the planned normalized derivative',
    };
  }

  const sharp = await loadSharp();
  if (!sharp) {
    return {
      dataUrl: `data:${mime};base64,${original.toString('base64')}`,
      byteLength: original.byteLength,
      width: null,
      height: null,
      resized: false,
      note: 'sharp unavailable; sent original resolution, so measured cost overstates production',
    };
  }

  // Orientation is applied and metadata dropped, matching ARCHITECTURE.md section 6 step 4.
  const pipeline = sharp(original)
    .rotate()
    .resize({
      width: config.resizeMaxEdge,
      height: config.resizeMaxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85, mozjpeg: true });

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  return {
    dataUrl: `data:image/jpeg;base64,${data.toString('base64')}`,
    byteLength: data.byteLength,
    width: info.width,
    height: info.height,
    resized: true,
    note: null,
  };
}
