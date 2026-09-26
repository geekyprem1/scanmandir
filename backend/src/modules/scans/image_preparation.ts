import sharp from 'sharp';

/**
 * Raised when the uploaded bytes are not a usable image: not decodable, without
 * dimensions, or beyond the pixel budget. That is a property of the input rather than a
 * fault in the service, so callers record a retake action instead of retrying.
 */
export class UnusableImageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'UnusableImageError';
  }
}

/** The content type of every derivative this module produces. */
export const DERIVATIVE_CONTENT_TYPE = 'image/jpeg';

interface ImageLimits {
  limitInputPixels: number;
}

type ImageMetadata = Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;

export interface PrepareImageOptions {
  /** Longest edge of the derivative. A smaller original is never enlarged. */
  maxEdge: number;
  /** Decode budget. A decompression bomb is refused before it can allocate. */
  maxInputPixels: number;
  quality: number;
}

export interface PreparedImage {
  bytes: Buffer;
  contentType: string;
  width: number;
  height: number;
  /** Dimensions as stored, before orientation was applied. For diagnostics. */
  sourceWidth: number;
  sourceHeight: number;
}

/**
 * Turns an uploaded original into the derivative the analysis stages read.
 *
 * Three things happen here and nowhere else: the EXIF orientation is applied so a
 * sideways photo is stored upright, the long edge is bounded so nothing downstream has
 * to handle a 50 megapixel image, and metadata is dropped — neither `keepExif` nor
 * `withMetadata` is called, so location data attached by the camera does not survive
 * into the derivative (ARCHITECTURE.md section 6).
 *
 * Decoding stays at sharp's default failure mode on purpose: a phone photo truncated by
 * a few bytes still has to be readable, because the user expects a photo they can see to
 * work. A file that is not an image at all still throws.
 */
export async function prepareDerivative(
  original: Buffer,
  options: PrepareImageOptions,
): Promise<PreparedImage> {
  const limits = { limitInputPixels: options.maxInputPixels };
  const metadata = await readMetadata(original, limits);

  const { width, height } = metadata;
  if (!width || !height) {
    throw new UnusableImageError('The uploaded image has no readable dimensions.');
  }

  try {
    const { data, info } = await sharp(original, limits)
      .rotate()
      .resize({
        width: options.maxEdge,
        height: options.maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: options.quality })
      .toBuffer({ resolveWithObject: true });

    return {
      bytes: data,
      contentType: DERIVATIVE_CONTENT_TYPE,
      width: info.width,
      height: info.height,
      sourceWidth: width,
      sourceHeight: height,
    };
  } catch (error) {
    throw new UnusableImageError('The uploaded image could not be prepared.', { cause: error });
  }
}

/** Reads the header, reporting a file that is not an image as unusable rather than a fault. */
async function readMetadata(original: Buffer, limits: ImageLimits): Promise<ImageMetadata> {
  try {
    return await sharp(original, limits).metadata();
  } catch (error) {
    throw new UnusableImageError('The uploaded file could not be decoded as an image.', {
      cause: error,
    });
  }
}
