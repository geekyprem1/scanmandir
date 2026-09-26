import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  DERIVATIVE_CONTENT_TYPE,
  UnusableImageError,
  prepareDerivative,
} from '../../src/modules/scans/image_preparation.js';

const OPTIONS = { maxEdge: 1024, maxInputPixels: 40_000_000, quality: 80 };

/** Real JPEG bytes, because what is under test is what a decoder does with pixels. */
async function jpeg(width: number, height: number, orientation?: number): Promise<Buffer> {
  const image = sharp({
    create: { width, height, channels: 3, background: { r: 140, g: 70, b: 20 } },
  }).jpeg();
  return orientation === undefined ? image.toBuffer() : image.withMetadata({ orientation }).toBuffer();
}

describe('prepareDerivative', () => {
  it('bounds the long edge and re-encodes as JPEG', async () => {
    const prepared = await prepareDerivative(await jpeg(3000, 1500), OPTIONS);

    expect(prepared.contentType).toBe(DERIVATIVE_CONTENT_TYPE);
    expect([prepared.width, prepared.height]).toEqual([1024, 512]);
    expect([prepared.sourceWidth, prepared.sourceHeight]).toEqual([3000, 1500]);

    const bytes = await sharp(prepared.bytes).metadata();
    expect(bytes.format).toBe('jpeg');
    expect([bytes.width, bytes.height]).toEqual([1024, 512]);
  });

  it('never enlarges an original that is already small', async () => {
    const prepared = await prepareDerivative(await jpeg(320, 200), OPTIONS);

    expect([prepared.width, prepared.height]).toEqual([320, 200]);
  });

  it('applies the EXIF orientation and carries no metadata into the derivative', async () => {
    const sideways = await jpeg(400, 200, 6);
    // Confirms the fixture really is tagged, so a passing rotation assertion means something.
    expect((await sharp(sideways).metadata()).orientation).toBe(6);

    const prepared = await prepareDerivative(sideways, OPTIONS);

    // The stored 400x200 is meant to be read as 200x400.
    expect([prepared.width, prepared.height]).toEqual([200, 400]);

    const bytes = await sharp(prepared.bytes).metadata();
    expect(bytes.exif).toBeUndefined();
    expect(bytes.orientation).toBeUndefined();
  });

  it('refuses bytes that are not an image at all', async () => {
    const text = Buffer.from('a text file that someone renamed to .jpg');

    await expect(prepareDerivative(text, OPTIONS)).rejects.toBeInstanceOf(UnusableImageError);
  });

  it('refuses an image beyond the pixel budget instead of decoding it', async () => {
    const bytes = await jpeg(400, 400);

    await expect(prepareDerivative(bytes, { ...OPTIONS, maxInputPixels: 10_000 })).rejects.toBeInstanceOf(
      UnusableImageError,
    );
  });
});
