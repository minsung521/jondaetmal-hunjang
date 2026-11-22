// Geometry helpers for morph generation: welding by position, welded normals, layer test.
import * as THREE from 'three';

/**
 * Groups vertices that share a position (UV seams duplicate vertices). Returns, per vertex,
 * the id of its group, plus the number of groups.
 */
export function weldByPosition(pos: Float32Array, tolerance: number): { canon: Uint32Array; count: number } {
  const n = pos.length / 3;
  const canon = new Uint32Array(n);
  const map = new Map<string, number>();
  const q = 1 / tolerance;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos[i * 3] * q)},${Math.round(pos[i * 3 + 1] * q)},${Math.round(pos[i * 3 + 2] * q)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = count++;
      map.set(key, id);
    }
    canon[i] = id;
  }
  return { canon, count };
}

/**
 * Area-weighted vertex normals accumulated over welded groups, so seam duplicates get the
 * same normal (and therefore the same morph normal delta).
 */
export function weldedNormals(
  pos: ArrayLike<number>,
  index: ArrayLike<number>,
  canon: Uint32Array,
  groups: number,
): Float32Array {
  const acc = new Float32Array(groups * 3);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3;
    const b = index[t + 1] * 3;
    const c = index[t + 2] * 3;
    const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
    const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    for (const v of [index[t], index[t + 1], index[t + 2]]) {
      const g = canon[v] * 3;
      acc[g] += nx;
      acc[g + 1] += ny;
      acc[g + 2] += nz;
    }
  }
  const out = new Float32Array(canon.length * 3);
  for (let i = 0; i < canon.length; i++) {
    const g = canon[i] * 3;
    const l = Math.hypot(acc[g], acc[g + 1], acc[g + 2]) || 1;
    out[i * 3] = acc[g] / l;
    out[i * 3 + 1] = acc[g + 1] / l;
    out[i * 3 + 2] = acc[g + 2] / l;
  }
  return out;
}

/**
 * For each query vertex, is there a front-facing surface (normal z > minFacing) behind it
 * (toward −Z) within maxDepth? Rays are axis-aligned, so triangles are bucketed in an XY grid.
 * All coordinates are in the same space (model root).
 */
export function hasSurfaceBehind(
  rootPos: Float32Array,
  index: ArrayLike<number>,
  queries: number[],
  maxDepth: number,
  minFacing: number,
  cell: number,
): Uint8Array {
  const n = rootPos.length / 3;
  let x0 = Infinity, y0 = Infinity;
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, rootPos[i * 3]);
    y0 = Math.min(y0, rootPos[i * 3 + 1]);
  }
  const grid = new Map<number, number[]>();
  const key = (gx: number, gy: number) => gx * 100003 + gy;
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
    const ux = rootPos[b] - rootPos[a], uy = rootPos[b + 1] - rootPos[a + 1];
    const vx = rootPos[c] - rootPos[a], vy = rootPos[c + 1] - rootPos[a + 1];
    const uz = rootPos[b + 2] - rootPos[a + 2], vz = rootPos[c + 2] - rootPos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nz / (Math.hypot(nx, ny, nz) || 1) <= minFacing) continue;
    const xs = [rootPos[a], rootPos[b], rootPos[c]];
    const ys = [rootPos[a + 1], rootPos[b + 1], rootPos[c + 1]];
    const gx0 = Math.floor((Math.min(...xs) - x0) / cell), gx1 = Math.floor((Math.max(...xs) - x0) / cell);
    const gy0 = Math.floor((Math.min(...ys) - y0) / cell), gy1 = Math.floor((Math.max(...ys) - y0) / cell);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gy = gy0; gy <= gy1; gy++) {
        const k = key(gx, gy);
        let list = grid.get(k);
        if (!list) grid.set(k, (list = []));
        list.push(t);
      }
    }
  }
  const out = new Uint8Array(n);
  for (const v of queries) {
    const px = rootPos[v * 3], py = rootPos[v * 3 + 1], pz = rootPos[v * 3 + 2];
    const list = grid.get(key(Math.floor((px - x0) / cell), Math.floor((py - y0) / cell)));
    if (!list) continue;
    for (const t of list) {
      const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
      const ax = rootPos[a], ay = rootPos[a + 1], bx = rootPos[b], by = rootPos[b + 1];
      const cx = rootPos[c], cy = rootPos[c + 1];
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(d) < 1e-14) continue;
      const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
      const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      const z = l1 * rootPos[a + 2] + l2 * rootPos[b + 2] + l3 * rootPos[c + 2];
      if (z < pz - maxDepth * 0.002 && z > pz - maxDepth) {
        out[v] = 1;
        break;
      }
    }
  }
  return out;
}

/** Vertex positions transformed into another space (e.g. mesh-local → model root). */
export function transformPositions(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, m: THREE.Matrix4): Float32Array {
  const out = new Float32Array(attr.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < attr.count; i++) {
    v.fromBufferAttribute(attr, i).applyMatrix4(m);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  return out;
}
