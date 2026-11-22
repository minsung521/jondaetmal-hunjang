// The lip line: mouthCorner_R → midpoint of upperLip/lowerLip → mouthCorner_L, a parabola per
// side in y and z (model-root space). Shared by the lip gap, the mouth interior, jawOpen and
// lip-gated morph handles so they all agree on where the lips part.
import type { LandmarkFile } from '../landmarks';

export function lipMid(landmarks: LandmarkFile): [number, number, number] {
  const P = landmarks.points;
  return [
    (P.upperLip[0] + P.lowerLip[0]) / 2,
    (P.upperLip[1] + P.lowerLip[1]) / 2,
    (P.upperLip[2] + P.lowerLip[2]) / 2,
  ];
}

/** Point on the lip line at u ∈ [-1, 1] (−1 = right corner, 0 = midpoint, +1 = left corner). */
export function lipLine(landmarks: LandmarkFile, u: number): [number, number, number] {
  const P = landmarks.points;
  const mid = lipMid(landmarks);
  const c = u >= 0 ? P.mouthCorner_L : P.mouthCorner_R;
  const a = Math.abs(u);
  const u2 = u * u;
  return [mid[0] + (c[0] - mid[0]) * a, mid[1] + (c[1] - mid[1]) * u2, mid[2] + (c[2] - mid[2]) * u2];
}

/**
 * Lip line at a given x: |u| (0 at the midpoint, 1 at a corner, >1 beyond) and the line's y/z.
 * Beyond the corners the line stays flat at the corner's height/depth.
 */
export function lipLineAtX(landmarks: LandmarkFile, x: number): { u: number; y: number; z: number } {
  const P = landmarks.points;
  const mid = lipMid(landmarks);
  const c = x >= mid[0] ? P.mouthCorner_L : P.mouthCorner_R;
  const u = Math.abs((x - mid[0]) / (c[0] - mid[0]) || 0);
  const k = Math.min(u, 1) ** 2;
  return { u, y: mid[1] + (c[1] - mid[1]) * k, z: mid[2] + (c[2] - mid[2]) * k };
}

export interface LipBand {
  /** |u| up to which the lips are cut apart (lipGap.width). */
  gapWidth: number;
  gapUp: number;
  gapDown: number;
  outerUp: number;
  outerDown: number;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * 0 above the lip line (upper lip side) → 1 below it (lower lip side). Sharp inside the gap,
 * soft outside the corners where the skin is still connected. Band values are in eyeDist.
 */
export function lowerLipWeight(landmarks: LandmarkFile, x: number, y: number, band: LipBand): number {
  const ed = landmarks.eyeDist;
  const line = lipLineAtX(landmarks, x);
  const s = smoothstep(band.gapWidth, band.gapWidth + 0.3, line.u);
  const up = (band.gapUp + (band.outerUp - band.gapUp) * s) * ed;
  const down = (band.gapDown + (band.outerDown - band.gapDown) * s) * ed;
  return smoothstep(0, 1, (line.y + up - y) / (up + down));
}
