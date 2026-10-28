import sharp, { type Sharp } from "sharp";
import { BINARY_THRESHOLD, MIN_BODY_WIDTH_RATIO } from "@/constants";

export type RawImageData = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

function toBuffer(input: ArrayBuffer | Buffer): Buffer {
  if (Buffer.isBuffer(input)) return input;
  return Buffer.from(input);
}

export async function decodeImage(buffer: ArrayBuffer | Buffer): Promise<Sharp> {
  return sharp(toBuffer(buffer));
}

export async function toImageData(input: ArrayBuffer | Buffer): Promise<RawImageData> {
  const { data, info } = await sharp(toBuffer(input))
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  return {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
  };
}

export async function getImageDimensions(input: ArrayBuffer | Buffer): Promise<{ width: number; height: number }> {
  const metadata = await sharp(toBuffer(input)).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Could not determine image dimensions");
  }
  return { width: metadata.width, height: metadata.height };
}

export function getBodyWidthAtHeight(
  imageData: RawImageData,
  yPx: number,
  centerXNorm: number
): number {
  const { width, height, data } = imageData;

  if (yPx < 0) yPx = 0;
  if (yPx >= height) yPx = height - 1;

  const centerX = Math.round(centerXNorm * width);
  const minWidth = Math.round(MIN_BODY_WIDTH_RATIO * width);

  const row = new Uint8Array(width);
  for (let x = 0; x < width; x++) {
    const idx = (yPx * width + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;

    // Simple 3x3 box blur approximation
    let sum = gray;
    let count = 1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const ny = yPx + dy;
        const nx = x + dx;
        if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
          const nIdx = (ny * width + nx) * 4;
          sum += 0.299 * data[nIdx] + 0.587 * data[nIdx + 1] + 0.114 * data[nIdx + 2];
          count++;
        }
      }
    }
    const blurred = sum / count;

    // Binary threshold: person brighter than background -> white (255), background -> black (0)
    row[x] = blurred > BINARY_THRESHOLD ? 255 : 0;
  }

  // Scan left from center
  let leftEdge = centerX;
  for (let x = centerX; x >= 0; x--) {
    if (row[x] === 0) {
      leftEdge = x;
      break;
    }
  }

  // Scan right from center
  let rightEdge = centerX;
  for (let x = centerX; x < width; x++) {
    if (row[x] === 0) {
      rightEdge = x;
      break;
    }
  }

  let widthPx = rightEdge - leftEdge;
  if (widthPx < minWidth) {
    widthPx = minWidth;
  }

  return widthPx;
}
