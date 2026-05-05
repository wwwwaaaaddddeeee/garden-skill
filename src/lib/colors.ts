import sharp from "sharp";

export interface PaletteColor {
  hex: string;
  oklch: string;       // formatted as "oklch(L C H)"
  rgb: [number, number, number];
  population: number;  // 0..1 fraction of sampled pixels
}

/**
 * Extract a small dominant-color palette from an image buffer.
 * Strategy: downscale to a small posterized image, count unique colors,
 * keep the top N. Fast, deterministic, no native deps beyond sharp.
 */
export async function extractPalette(buf: Buffer, k = 6): Promise<PaletteColor[]> {
  // Downscale and quantize. PNG output preserves exact pixel data.
  const SIZE = 64;
  const { data, info } = await sharp(buf, { failOn: "none" })
    .resize(SIZE, SIZE, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const counts = new Map<string, number>();
  const total = info.width * info.height;
  // Posterize each channel to 5 bits (32 levels) to merge near-duplicates
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i] & 0xf8;
    const g = data[i + 1] & 0xf8;
    const b = data[i + 2] & 0xf8;
    const key = (r << 16) | (g << 8) | b;
    counts.set(String(key), (counts.get(String(key)) ?? 0) + 1);
  }

  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k * 4); // grab extras to allow merging

  // Merge perceptually-close colors greedily
  const merged: { rgb: [number, number, number]; count: number }[] = [];
  for (const [keyStr, count] of sorted) {
    const key = Number(keyStr);
    const r = (key >> 16) & 0xff;
    const g = (key >> 8) & 0xff;
    const b = key & 0xff;
    const existing = merged.find((m) => colorDist(m.rgb, [r, g, b]) < 28);
    if (existing) {
      existing.count += count;
    } else {
      merged.push({ rgb: [r, g, b], count });
    }
    if (merged.length >= k) break;
  }

  return merged.map(({ rgb, count }) => ({
    hex: rgbToHex(rgb),
    oklch: rgbToOklchString(rgb),
    rgb,
    population: count / total,
  }));
}

function colorDist(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

// sRGB -> linear RGB -> OKLab -> OKLCH
function rgbToOklchString(rgb: [number, number, number]): string {
  const [L, C, H] = rgbToOklch(rgb);
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)})`;
}

function rgbToOklch([r, g, b]: [number, number, number]): [number, number, number] {
  const lr = srgbToLinear(r / 255);
  const lg = srgbToLinear(g / 255);
  const lb = srgbToLinear(b / 255);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const C = Math.sqrt(a * a + bb * bb);
  let H = (Math.atan2(bb, a) * 180) / Math.PI;
  if (H < 0) H += 360;

  return [L, C, H];
}

function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
