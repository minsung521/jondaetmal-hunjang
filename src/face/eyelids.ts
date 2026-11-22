// Eyelid shells: an upper and a lower partial sphere per eye, slightly larger than the
// eyeball, rotated about the eye's horizontal (x) axis to cover it.
//
// The shell is a wedge of a sphere whose poles sit on the x axis (the eye corners), so
// rotating it about x moves its edge up and down like a real lid. Edge positions are given
// as fractions of the visible eyeball's half-angle (see FacePartsParams['eyelids']).
import * as THREE from 'three';
import type { FacePartsParams } from '../config';

const SPAN = 160 * (Math.PI / 180); // angular size of each shell (covers the eye in every pose)

export interface LidInputs {
  blink: number;
  squint: number;
  wide: number;
}

interface EyeLids {
  pivot: THREE.Object3D; // at the eyeball centre (head-local)
  upper: THREE.Mesh;
  lower: THREE.Mesh;
  skin: { upper: THREE.Color; lower: THREE.Color };
}

function wedge(upper: boolean): THREE.BufferGeometry {
  // SphereGeometry wedge around Y, then turned so its pole axis is X.
  // After rotateZ(−90°) a vertex's elevation (angle from +Z toward +Y) = 90° − phi.
  const phiStart = upper ? Math.PI / 2 - SPAN : Math.PI / 2;
  const g = new THREE.SphereGeometry(1, 48, 32, phiStart, SPAN, 0, Math.PI);
  g.rotateZ(-Math.PI / 2);
  return g;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

export class Eyelids {
  private eyes: EyeLids[] = [];
  private upperGeo = wedge(true);
  private lowerGeo = wedge(false);
  /** Visible half-angle of the shell (radians), from eyeball depth and radius. */
  private halfAngle = 1;

  constructor(
    head: THREE.Object3D,
    centers: THREE.Vector3[],
    skins: { upper: THREE.Color; lower: THREE.Color }[],
  ) {
    centers.forEach((c, k) => {
      const pivot = new THREE.Object3D();
      pivot.name = k === 0 ? 'eyelids_L' : 'eyelids_R';
      pivot.position.copy(c);
      const make = (geo: THREE.BufferGeometry, name: string) => {
        const m = new THREE.Mesh(
          geo.clone(),
          new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, metalness: 0 }),
        );
        m.name = name;
        pivot.add(m);
        return m;
      };
      const upper = make(this.upperGeo, 'upperLid');
      const lower = make(this.lowerGeo, 'lowerLid');
      head.add(pivot);
      this.eyes.push({ pivot, upper, lower, skin: skins[k] });
    });
  }

  /** Rebuilds sizes, colours and positions. centers are head-local eyeball centres. */
  apply(p: FacePartsParams['eyelids'], eyes: FacePartsParams['eyes'], eyeDist: number, centers: THREE.Vector3[]): void {
    const radius = eyes.radius * eyeDist * (1 + p.gap);
    this.halfAngle = Math.acos(THREE.MathUtils.clamp(eyes.depth / (eyes.radius * (1 + p.gap)), -1, 1));
    const lash = new THREE.Color(p.lashColor);
    const lashW = p.lashWidth * (Math.PI / 180);
    this.eyes.forEach((e, k) => {
      e.pivot.position.copy(centers[k]);
      e.pivot.visible = p.visible;
      for (const [mesh, skin, src] of [
        [e.upper, e.skin.upper, this.upperGeo],
        [e.lower, e.skin.lower, this.lowerGeo],
      ] as const) {
        mesh.scale.set(radius * p.width, radius, radius);
        const pos = src.attributes.position;
        const colors = new Float32Array(pos.count * 3);
        const base = skin.clone().multiplyScalar(p.brightness);
        const c = new THREE.Color();
        for (let i = 0; i < pos.count; i++) {
          // Edge sits at elevation 0 before rotation; darken a thin band along it.
          const elev = Math.abs(Math.atan2(pos.getY(i), pos.getZ(i)));
          c.copy(lash).lerp(base, smoothstep(0, lashW, elev));
          colors[i * 3] = c.r;
          colors[i * 3 + 1] = c.g;
          colors[i * 3 + 2] = c.b;
        }
        mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        (mesh.material as THREE.MeshStandardMaterial).roughness = p.roughness;
      }
    });
  }

  /** Sets lid edges from expression values (0..1) and the eyeballs' pitch (radians, + = down). */
  update(p: FacePartsParams['eyelids'], v: LidInputs, gazePitch: number): void {
    const blink = THREE.MathUtils.clamp(v.blink, 0, 1.1);
    const squint = THREE.MathUtils.clamp(v.squint, 0, 1.1);
    const wide = THREE.MathUtils.clamp(v.wide, 0, 1.1);
    let lower = p.lowerRest + (p.lowerSquint - p.lowerRest) * squint + p.blinkLowerRise * blink;
    let upper = p.upperRest + (p.upperWide - p.upperRest) * wide - p.squintUpperDrop * squint;
    upper = upper + (lower + p.overlap - upper) * Math.min(blink, 1);
    upper = Math.max(upper, lower + p.overlap * Math.min(blink, 1));
    // Lids follow vertical gaze a little (pitch + = looking down = edges move down).
    const follow = -gazePitch * p.followGaze;
    const toAngle = (f: number) => f * this.halfAngle;
    lower = toAngle(lower) + follow;
    const upperA = toAngle(upper) + follow;
    for (const e of this.eyes) {
      // Rotating about x by β lowers every elevation by β, so β = −edge puts the edge there.
      e.upper.rotation.x = -upperA;
      e.lower.rotation.x = -lower;
    }
  }
}
