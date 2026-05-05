import sharp from "sharp";

/**
 * Difference hash (dHash). Fast, good for near-duplicate detection.
 * Returns a 64-bit hash as a 16-char hex string.
 */
export async function computePhash(buf: Buffer): Promise<string> {
  // 9x8 grayscale, then compare each pixel to its right neighbor.
  const { data } = await sharp(buf, { failOn: "none" })
    .resize(9, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = 0n;
  let bit = 0n;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = data[row * 9 + col];
      const right = data[row * 9 + col + 1];
      if (left > right) hash |= 1n << bit;
      bit++;
    }
  }
  return hash.toString(16).padStart(16, "0");
}

/** Hamming distance between two hex pHashes. */
export function phashDistance(a: string, b: string): number {
  let x = BigInt("0x" + a) ^ BigInt("0x" + b);
  let dist = 0;
  while (x) {
    dist += Number(x & 1n);
    x >>= 1n;
  }
  return dist;
}
