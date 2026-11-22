// Mouth interior: a closed "bag" that follows the lip line, drawn from the inside (BackSide).
//
// The lips curve forward strongly (centre ≈0.2–0.3 eyeDist ahead of the corners), so a plain
// hemisphere either pokes through the cheeks or leaves the slit near the corners uncovered,
// and from an angle you could see the background through the gap. Instead the bag's front
// edge hugs the lip line (corner → lip midpoint → corner) just behind the surface. Seen from
// inside, its back wall reads as a dark hemisphere behind the lip gap.
import * as THREE from 'three';
import type { FacePartsParams } from '../config';
import type { LandmarkFile } from '../landmarks';

const SEG_X = 48; // along the lip line
const SEG_R = 32; // around the cross-section
const END_SHAPE = 4; // higher = blunter ends

/** Lip line point at u ∈ [-1, 1] (−1 = right corner, 0 = lip midpoint, +1 = left corner). */
export function lipLine(landmarks: LandmarkFile, u: number): [number, number, number] {
  const P = landmarks.points;
  const mid = [
    (P.upperLip[0] + P.lowerLip[0]) / 2,
    (P.upperLip[1] + P.lowerLip[1]) / 2,
    (P.upperLip[2] + P.lowerLip[2]) / 2,
  ];
  const c = u >= 0 ? P.mouthCorner_L : P.mouthCorner_R;
  const a = Math.abs(u);
  const u2 = u * u;
  return [mid[0] + (c[0] - mid[0]) * a, mid[1] + (c[1] - mid[1]) * u2, mid[2] + (c[2] - mid[2]) * u2];
}

/** Geometry in model-root space. */
export function buildMouthGeometry(landmarks: LandmarkFile, p: FacePartsParams['mouth']): THREE.BufferGeometry {
  const ed = landmarks.eyeDist;
  const ry = p.height * ed;
  const rz = p.depth * ed;
  const positions: number[] = [];
  for (let i = 0; i <= SEG_X; i++) {
    const t = (i / SEG_X) * 2 - 1;
    const [x, y, z] = lipLine(landmarks, t * p.width);
    const s = Math.pow(Math.max(0, 1 - Math.abs(t) ** END_SHAPE), 1 / END_SHAPE);
    const cy = y + p.offsetY * ed;
    const cz = z + p.ahead * ed - rz * s; // front of the cross-section sits at the lip line + ahead
    for (let j = 0; j <= SEG_R; j++) {
      const phi = (j / SEG_R) * Math.PI * 2;
      positions.push(x, cy + ry * s * Math.cos(phi), cz + rz * s * Math.sin(phi));
    }
  }
  const index: number[] = [];
  const row = SEG_R + 1;
  for (let i = 0; i < SEG_X; i++) {
    for (let j = 0; j < SEG_R; j++) {
      const a = i * row + j;
      const b = a + row;
      // Wound so normals point outward; the material renders the inside (BackSide).
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
