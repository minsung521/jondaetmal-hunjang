// Opens the fused lips by dropping triangles in a thin band along the lip line.
//
// Works in model-root space with the landmarks. The lip line runs from mouthCorner_R through
// the upperLip/lowerLip midpoint to mouthCorner_L (a parabola on each side, in y and in z;
// the same curve as lipLine() in mouthInterior.ts).
// A triangle is removed when its centroid is inside the band, close in depth to that line,
// and it faces forward. The original index is kept so the band can be re-cut live.
import * as THREE from 'three';
import type { FacePartsParams } from '../config';
import type { LandmarkFile } from '../landmarks';
import { lipLineAtX } from './lipLine';

interface MeshCut {
  mesh: THREE.Mesh;
  original: THREE.BufferAttribute;
  /** Per-triangle centroid (x, y, z) and normal z, in root space. */
  centroids: Float32Array;
  normalZ: Float32Array;
  /** 1 if the triangle's vertices lie on both sides of the lip line. */
  straddles: Uint8Array;
}

export class LipGap {
  private cuts: MeshCut[] = [];
  /** Triangles removed by the last apply(). */
  removed = 0;

  constructor(
    meshes: THREE.Mesh[],
    root: THREE.Object3D,
    private landmarks: LandmarkFile,
  ) {
    root.updateMatrixWorld(true);
    const toRoot = new THREE.Matrix4();
    const rootInv = root.matrixWorld.clone().invert();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (const mesh of meshes) {
      const index = mesh.geometry.index;
      if (!index) continue; // the hunjang GLBs are indexed; skip anything else
      toRoot.multiplyMatrices(rootInv, mesh.matrixWorld);
      const pos = mesh.geometry.attributes.position;
      const triCount = index.count / 3;
      const centroids = new Float32Array(triCount * 3);
      const normalZ = new Float32Array(triCount);
      const straddles = new Uint8Array(triCount);
      for (let t = 0; t < triCount; t++) {
        a.fromBufferAttribute(pos, index.getX(t * 3)).applyMatrix4(toRoot);
        b.fromBufferAttribute(pos, index.getX(t * 3 + 1)).applyMatrix4(toRoot);
        c.fromBufferAttribute(pos, index.getX(t * 3 + 2)).applyMatrix4(toRoot);
        centroids[t * 3] = (a.x + b.x + c.x) / 3;
        centroids[t * 3 + 1] = (a.y + b.y + c.y) / 3;
        centroids[t * 3 + 2] = (a.z + b.z + c.z) / 3;
        let above = 0;
        for (const v of [a, b, c]) if (v.y > lipLineAtX(landmarks, v.x).y) above++;
        straddles[t] = above > 0 && above < 3 ? 1 : 0;
        n.subVectors(c, b).cross(a.sub(b)).normalize();
        normalZ[t] = n.z;
      }
      this.cuts.push({ mesh, original: index.clone(), centroids, normalZ, straddles });
    }
  }

  apply(p: FacePartsParams['lipGap']): void {
    const { points, eyeDist: ed } = this.landmarks;
    const up = points.upperLip;
    const lo = points.lowerLip;
    const mid = [(up[0] + lo[0]) / 2, (up[1] + lo[1]) / 2, (up[2] + lo[2]) / 2];
    const cL = points.mouthCorner_L;
    const cR = points.mouthCorner_R;
    const half = p.thickness * ed * 0.5;
    const front = p.depthFront * ed;
    const back = p.depthBack * ed;

    this.removed = 0;
    for (const cut of this.cuts) {
      const src = cut.original.array;
      if (!p.enabled) {
        cut.mesh.geometry.setIndex(cut.original);
        continue;
      }
      const kept: number[] = [];
      const triCount = src.length / 3;
      for (let t = 0; t < triCount; t++) {
        const x = cut.centroids[t * 3];
        const y = cut.centroids[t * 3 + 1];
        const z = cut.centroids[t * 3 + 2];
        // u: -1 at the right corner, 0 at the lip midpoint, +1 at the left corner.
        const corner = x >= mid[0] ? cL : cR;
        const u = (x - mid[0]) / (corner[0] - mid[0]) || 0;
        let drop = false;
        if (u >= 0 && u < p.width && cut.normalZ[t] > p.minFacing) {
          const u2 = u * u;
          const lineY = mid[1] + (corner[1] - mid[1]) * u2;
          const lineZ = mid[2] + (corner[2] - mid[2]) * u2;
          const h = half * (1 - p.taper * (u / p.width) ** 2);
          const dz = z - lineZ;
          const inBand = Math.abs(y - lineY) < h || (p.cutStraddling && cut.straddles[t] === 1);
          drop = inBand && dz < front && dz > -back;
        }
        if (drop) this.removed++;
        else kept.push(src[t * 3], src[t * 3 + 1], src[t * 3 + 2]);
      }
      const Arr = src instanceof Uint32Array ? Uint32Array : Uint16Array;
      cut.mesh.geometry.setIndex(new THREE.BufferAttribute(new Arr(kept), 1));
    }
  }
}
