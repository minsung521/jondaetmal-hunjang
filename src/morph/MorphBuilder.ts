// Stage D: generates morph targets on the head mesh from landmarks + MORPHS config.
//
// Each target is a list of handles {landmark, radius, move}; a vertex moves by
// Σ (1 − smoothstep(d / r)) × move. jawOpen rotates the lower face about the jawPivot axis.
// Work happens in model-root space (+Y up, +Z front, eyeDist units for the config), and the
// result is converted to the mesh's own space. Seam duplicates share a position, so they get
// identical displacements; normals are accumulated over welded groups for the same reason.
import * as THREE from 'three';
import type { FacePartsParams, JawDef, MorphDefs, MorphHandle, V3 } from '../config';
import type { LandmarkFile, LandmarkName } from '../landmarks';
import { lipLineAtX, lowerLipWeight, type LipBand } from '../face/lipLine';
import { hasSurfaceBehind, transformPositions, weldByPosition, weldedNormals } from './meshTools';

const DEG = Math.PI / 180;

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

function mirrorName(name: string): string {
  return name.endsWith('_L') ? name.slice(0, -2) + '_R' : name.endsWith('_R') ? name.slice(0, -2) + '_L' : name;
}

interface ResolvedHandle {
  c: THREE.Vector3;
  r: number;
  shape: V3;
  move: THREE.Vector3;
  lip?: 'upper' | 'lower';
}

interface MeshMorphData {
  mesh: THREE.Mesh;
  /** Mesh-local → model-root (positions) and its inverse linear part (directions). */
  rootFromLocalDir: THREE.Matrix3;
  localFromRootDir: THREE.Matrix3;
  local: Float32Array;
  root: Float32Array;
  index: ArrayLike<number>;
  canon: Uint32Array;
  groups: number;
  baseNormals: Float32Array;
  /** 0 = free, 1 = robe/shoulders (never moves). */
  fixed: Float32Array;
  /** 1 = beard (follows the chin). */
  beard: Uint8Array;
  posAttrs: THREE.Float32BufferAttribute[];
  normAttrs: THREE.Float32BufferAttribute[];
}

export class MorphBuilder {
  readonly names: string[];
  private data: MeshMorphData[] = [];
  /** Largest displacement difference among seam duplicates in the last build (should be 0). */
  seamError = 0;
  /** Vertex counts of the masks, for the debug panel. */
  stats = { beard: 0, fixed: 0 };

  constructor(
    meshes: THREE.Mesh[],
    root: THREE.Object3D,
    readonly landmarks: LandmarkFile,
    public defs: MorphDefs,
    private lipGap: FacePartsParams['lipGap'],
  ) {
    this.names = [...Object.keys(defs.targets), 'jawOpen'];
    root.updateMatrixWorld(true);
    const rootInv = root.matrixWorld.clone().invert();
    for (const mesh of meshes) {
      const geo = mesh.geometry;
      if (!geo.index) continue;
      const toRoot = new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld);
      const posAttr = geo.attributes.position as THREE.BufferAttribute;
      const local = transformPositions(posAttr, new THREE.Matrix4());
      const rootPos = transformPositions(posAttr, toRoot);
      const index = geo.index.array.slice();
      const { canon, count } = weldByPosition(rootPos, landmarks.eyeDist * 1e-4);
      const rootFromLocalDir = new THREE.Matrix3().setFromMatrix4(toRoot);
      const d: MeshMorphData = {
        mesh,
        rootFromLocalDir,
        localFromRootDir: rootFromLocalDir.clone().invert(),
        local,
        root: rootPos,
        index,
        canon,
        groups: count,
        baseNormals: weldedNormals(local, index, canon, count),
        fixed: new Float32Array(posAttr.count),
        beard: new Uint8Array(posAttr.count),
        posAttrs: [],
        normAttrs: [],
      };
      this.computeMasks(d);
      for (const name of this.names) {
        const p = new THREE.Float32BufferAttribute(new Float32Array(posAttr.count * 3), 3);
        p.name = name;
        const n = new THREE.Float32BufferAttribute(new Float32Array(posAttr.count * 3), 3);
        n.name = name;
        d.posAttrs.push(p);
        d.normAttrs.push(n);
      }
      geo.morphAttributes.position = d.posAttrs;
      geo.morphAttributes.normal = d.normAttrs;
      geo.morphTargetsRelative = true;
      this.data.push(d);
    }
    for (const name of this.names) this.build(name);
    for (const d of this.data) d.mesh.updateMorphTargets();
  }

  /** Masks that do not depend on tunable values: robe/shoulders (fixed) and beard. */
  private computeMasks(d: MeshMorphData): void {
    const P = this.landmarks.points;
    const ed = this.landmarks.eyeDist;
    const n = d.canon.length;
    const chin = P.chin;
    // Beard: below the chin, in front of another front-facing surface (neck/robe), and
    // connected to the chin through such vertices (keeps overlapping robe lapels out).
    const queries: number[] = [];
    for (let i = 0; i < n; i++) if (d.root[i * 3 + 1] < chin[1]) queries.push(i);
    const layered = hasSurfaceBehind(d.root, d.index, queries, this.defs.beard.layerDepth * ed, 0.1, ed * 0.035);
    const layeredGroup = new Uint8Array(d.groups);
    for (let i = 0; i < n; i++) if (layered[i]) layeredGroup[d.canon[i]] = 1;
    const adj: number[][] = Array.from({ length: d.groups }, () => []);
    for (let t = 0; t < d.index.length; t += 3) {
      const g = [d.canon[d.index[t]], d.canon[d.index[t + 1]], d.canon[d.index[t + 2]]];
      for (let k = 0; k < 3; k++) {
        const a = g[k], b = g[(k + 1) % 3];
        if (a !== b) {
          adj[a].push(b);
          adj[b].push(a);
        }
      }
    }
    const beardGroup = new Uint8Array(d.groups);
    const stack: number[] = [];
    const seedR = this.defs.beard.seedRadius * ed;
    for (let i = 0; i < n; i++) {
      const dx = d.root[i * 3] - chin[0], dy = d.root[i * 3 + 1] - chin[1], dz = d.root[i * 3 + 2] - chin[2];
      const g = d.canon[i];
      if (layered[i] && Math.hypot(dx, dy, dz) < seedR && !beardGroup[g]) {
        beardGroup[g] = 1;
        stack.push(g);
      }
    }
    while (stack.length) {
      const a = stack.pop()!;
      for (const b of adj[a]) {
        if (layeredGroup[b] && !beardGroup[b]) {
          beardGroup[b] = 1;
          stack.push(b);
        }
      }
    }
    const collarY = P.collarFront[1];
    const margin = this.defs.fixed.collarMargin * ed;
    this.stats = { beard: 0, fixed: 0 };
    for (let i = 0; i < n; i++) {
      d.beard[i] = beardGroup[d.canon[i]];
      const below = 1 - smoothstep(collarY, collarY + margin, d.root[i * 3 + 1]);
      d.fixed[i] = d.beard[i] ? 0 : below;
      if (d.beard[i]) this.stats.beard++;
      if (d.fixed[i] > 0.999) this.stats.fixed++;
    }
  }

  private lipBand(): LipBand {
    return { gapWidth: this.lipGap.width, ...this.defs.lipBand };
  }

  private resolveHandles(handles: MorphHandle[], strength: number, radiusScale: number): ResolvedHandle[] {
    const P = this.landmarks.points as Record<string, number[]>;
    const ed = this.landmarks.eyeDist;
    const out: ResolvedHandle[] = [];
    const add = (h: MorphHandle, mirrored: boolean) => {
      const names = (Array.isArray(h.at) ? h.at : [h.at]).map((n) => (mirrored ? mirrorName(n) : n));
      const c = new THREE.Vector3();
      for (const n of names) {
        const p = P[n];
        if (!p) throw new Error(`Unknown landmark "${n}" in morph handle`);
        c.add(new THREE.Vector3(p[0], p[1], p[2]));
      }
      c.divideScalar(names.length);
      const sx = mirrored ? -1 : 1;
      const o = h.offset ?? [0, 0, 0];
      c.add(new THREE.Vector3(o[0] * sx, o[1], o[2]).multiplyScalar(ed));
      out.push({
        c,
        r: h.radius * radiusScale * ed,
        shape: h.shape ?? [1, 1, 1],
        move: new THREE.Vector3(h.move[0] * sx, h.move[1], h.move[2]).multiplyScalar(ed * strength),
        lip: h.lip,
      });
    };
    for (const h of handles) {
      add(h, false);
      if (h.mirror) add(h, true);
    }
    return out;
  }

  /** Root-space displacement field for one target over the given root-space positions. */
  displacements(name: string, root: Float32Array, opts: { lipOnly?: boolean; fixed?: Float32Array; beard?: Uint8Array } = {}): Float32Array {
    const n = root.length / 3;
    const out = new Float32Array(n * 3);
    if (name === 'jawOpen') {
      this.jawDisplacements(this.defs.jaw, root, out, opts);
    } else {
      const def = this.defs.targets[name];
      const handles = this.resolveHandles(def.handles, def.strength, def.radius);
      const band = this.lipBand();
      for (let i = 0; i < n; i++) {
        const x = root[i * 3], y = root[i * 3 + 1], z = root[i * 3 + 2];
        let dx = 0, dy = 0, dz = 0;
        for (const h of handles) {
          const qx = (x - h.c.x) / h.shape[0], qy = (y - h.c.y) / h.shape[1], qz = (z - h.c.z) / h.shape[2];
          const dist = Math.hypot(qx, qy, qz);
          if (dist >= h.r) continue;
          let w = 1 - smoothstep(0, 1, dist / h.r);
          if (h.lip) {
            const lower = lowerLipWeight(this.landmarks, x, y, band);
            w *= h.lip === 'lower' ? lower : 1 - lower;
          }
          dx += h.move.x * w;
          dy += h.move.y * w;
          dz += h.move.z * w;
        }
        const keep = 1 - (opts.fixed?.[i] ?? 0);
        out[i * 3] = dx * keep;
        out[i * 3 + 1] = dy * keep;
        out[i * 3 + 2] = dz * keep;
      }
    }
    return out;
  }

  private jawDisplacements(
    jaw: JawDef,
    root: Float32Array,
    out: Float32Array,
    opts: { lipOnly?: boolean; fixed?: Float32Array; beard?: Uint8Array },
  ): void {
    const P = this.landmarks.points;
    const ed = this.landmarks.eyeDist;
    const L = new THREE.Vector3(...P.jawPivot_L);
    const R = new THREE.Vector3(...P.jawPivot_R);
    const pivot = L.clone().add(R).multiplyScalar(0.5).add(new THREE.Vector3(...jaw.pivotOffset).multiplyScalar(ed));
    const axis = L.clone().sub(R).normalize(); // +X-ish: positive angle swings the chin down
    const angle = jaw.angle * jaw.strength * DEG;
    const rot = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    const chin = new THREE.Vector3(...P.chin);
    const chinMove = chin.clone().sub(pivot).applyQuaternion(rot).add(pivot).sub(chin);
    // Plane through the pivot axis and a point below the chin; the neck lies below it.
    const neckPoint = chin.clone().add(new THREE.Vector3(0, -jaw.chinMargin * ed, 0));
    const planeN = new THREE.Vector3().crossVectors(axis, neckPoint.sub(pivot)).normalize();
    const lowerLip = new THREE.Vector3(...P.lowerLip);
    if (planeN.dot(lowerLip.clone().sub(pivot)) < 0) planeN.negate();
    const band = this.lipBand();
    const bandScaled: LipBand = { ...band, outerUp: band.outerUp * jaw.radius, outerDown: band.outerDown * jaw.radius };
    const neck = jaw.neckFalloff * jaw.radius * ed;
    const back = jaw.backFalloff * ed;
    const beardBlend = jaw.beardBlend * ed;
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    const n = root.length / 3;
    for (let i = 0; i < n; i++) {
      p.set(root[i * 3], root[i * 3 + 1], root[i * 3 + 2]);
      let w = lowerLipWeight(this.landmarks, p.x, p.y, bandScaled);
      if (!opts.lipOnly) {
        const side = planeN.dot(q.copy(p).sub(pivot));
        w *= smoothstep(-neck, 0, side);
        w *= smoothstep(pivot.z - back, pivot.z + 0.2 * ed, p.z);
      }
      // Rotated position minus original = rigid jaw displacement.
      q.copy(p).sub(pivot).applyQuaternion(rot).add(pivot).sub(p);
      if (opts.beard?.[i]) {
        // Beard hangs from the chin: near the chin it rotates, lower down it follows the chin.
        const k = jaw.beardFollow * smoothstep(0, beardBlend, chin.y - p.y);
        q.lerp(chinMove, k);
        w = 1;
      }
      w *= 1 - (opts.fixed?.[i] ?? 0);
      out[i * 3] = q.x * w;
      out[i * 3 + 1] = q.y * w;
      out[i * 3 + 2] = q.z * w;
    }
  }

  /** (Re)computes one target's morph positions and normals on every mesh. */
  build(name: string): void {
    const t = this.names.indexOf(name);
    if (t < 0) return;
    let seam = 0;
    for (const d of this.data) {
      const disp = this.displacements(name, d.root, { fixed: d.fixed, beard: d.beard });
      const posArr = d.posAttrs[t].array as Float32Array;
      const displaced = new Float32Array(d.local.length);
      const v = new THREE.Vector3();
      for (let i = 0; i < d.canon.length; i++) {
        v.set(disp[i * 3], disp[i * 3 + 1], disp[i * 3 + 2]).applyMatrix3(d.localFromRootDir);
        posArr[i * 3] = v.x;
        posArr[i * 3 + 1] = v.y;
        posArr[i * 3 + 2] = v.z;
        displaced[i * 3] = d.local[i * 3] + v.x;
        displaced[i * 3 + 1] = d.local[i * 3 + 1] + v.y;
        displaced[i * 3 + 2] = d.local[i * 3 + 2] + v.z;
      }
      // Seam check: duplicates of one welded group must move identically.
      const first = new Int32Array(d.groups).fill(-1);
      for (let i = 0; i < d.canon.length; i++) {
        const g = d.canon[i];
        if (first[g] < 0) first[g] = i;
        else {
          const j = first[g];
          seam = Math.max(
            seam,
            Math.abs(disp[i * 3] - disp[j * 3]),
            Math.abs(disp[i * 3 + 1] - disp[j * 3 + 1]),
            Math.abs(disp[i * 3 + 2] - disp[j * 3 + 2]),
          );
        }
      }
      const moved = weldedNormals(displaced, d.index, d.canon, d.groups);
      const normArr = d.normAttrs[t].array as Float32Array;
      for (let i = 0; i < normArr.length; i++) normArr[i] = moved[i] - d.baseNormals[i];
      d.posAttrs[t].needsUpdate = true;
      d.normAttrs[t].needsUpdate = true;
    }
    this.seamError = seam / this.landmarks.eyeDist;
  }

  /** After build() at runtime: drop the cached morph texture so the GPU copy is rebuilt. */
  refreshGpu(): void {
    for (const d of this.data) d.mesh.geometry.dispose();
  }

  /** Root-space jawOpen displacement for other meshes (mouth interior): lip split only. */
  jawForPositions(root: Float32Array): Float32Array {
    const out = new Float32Array(root.length);
    this.jawDisplacements(this.defs.jaw, root, out, { lipOnly: true });
    return out;
  }

  /** Largest displacement (eyeDist) of fixed robe vertices for a target, as a sanity check. */
  maxFixedMotion(name: string): number {
    let m = 0;
    for (const d of this.data) {
      const disp = this.displacements(name, d.root, { fixed: d.fixed, beard: d.beard });
      for (let i = 0; i < d.canon.length; i++) {
        if (d.fixed[i] < 0.999) continue;
        m = Math.max(m, Math.hypot(disp[i * 3], disp[i * 3 + 1], disp[i * 3 + 2]));
      }
    }
    return m / this.landmarks.eyeDist;
  }

  /** Line y at x, exposed for debug overlays. */
  lipLineY(x: number): number {
    return lipLineAtX(this.landmarks, x).y;
  }

  /** Landmark position (helper for UIs). */
  point(name: LandmarkName): THREE.Vector3 {
    return new THREE.Vector3(...this.landmarks.points[name]);
  }
}
