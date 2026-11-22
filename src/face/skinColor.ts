// Samples the skin colour around an eye from the head texture (for the eyelid shells).
import * as THREE from 'three';
import type { LandmarkFile } from '../landmarks';

const FALLBACK = '#e8a882';

let cache: { image: unknown; data: ImageData } | null = null;

function pixels(image: CanvasImageSource & { width: number; height: number }): ImageData | null {
  if (cache?.image === image) return cache.data;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(image, 0, 0);
    const data = g.getImageData(0, 0, canvas.width, canvas.height);
    cache = { image, data };
    return data;
  } catch {
    return null;
  }
}

/**
 * Median skin colour of the head texture over the vertices just above or below an eye.
 * Very dark / very bright / grey pixels (lashes, painted eye, white brows) are skipped.
 */
export function sampleEyeSkin(
  mesh: THREE.Mesh,
  rootPositions: Float32Array,
  landmarks: LandmarkFile,
  side: 'L' | 'R',
  region: 'ring' | 'below',
): THREE.Color {
  const color = new THREE.Color(FALLBACK);
  const map = (mesh.material as THREE.MeshStandardMaterial).map;
  const uv = mesh.geometry.attributes.uv;
  const image = map?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!image || !uv) return color;
  const data = pixels(image);
  if (!data) return color;

  const ed = landmarks.eyeDist;
  const e = landmarks.points[side === 'L' ? 'eye_L' : 'eye_R'];
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let i = 0; i < uv.count; i++) {
    const x = rootPositions[i * 3], y = rootPositions[i * 3 + 1], z = rootPositions[i * 3 + 2];
    if (z < e[2] - 0.3 * ed) continue;
    const dxy = Math.hypot(x - e[0], y - e[1]);
    // 'ring': around the eye but under the brow (the eye-socket crease above is darker).
    const inside =
      region === 'ring'
        ? dxy > 0.35 * ed && dxy < 0.6 * ed && y < e[1] + 0.15 * ed
        : dxy < 0.5 * ed && y < e[1] - 0.2 * ed;
    if (!inside) continue;
    // glTF UVs have their origin at the top-left of the image (no flip).
    const px = Math.min(data.width - 1, Math.max(0, Math.floor(uv.getX(i) * data.width)));
    const py = Math.min(data.height - 1, Math.max(0, Math.floor(uv.getY(i) * data.height)));
    const o = (py * data.width + px) * 4;
    const r = data.data[o], g = data.data[o + 1], b = data.data[o + 2];
    const lum = (r + g + b) / 3;
    if (lum < 60 || lum > 235 || Math.max(r, g, b) - Math.min(r, g, b) < 20) continue;
    rs.push(r);
    gs.push(g);
    bs.push(b);
  }
  if (!rs.length) return color;
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
  return color.setRGB(med(rs) / 255, med(gs) / 255, med(bs) / 255, THREE.SRGBColorSpace);
}
