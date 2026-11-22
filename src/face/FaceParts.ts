// Code-built face parts: eyeballs, mouth interior, lip gap (stage C), eyelid shells (stage D).
//
// Everything is placed from the landmarks (model-root space) and sized in eyeDist units.
// The parts hang under a `head` group whose pivot is the jaw-pivot midpoint, so a later head
// rotation (stage E) moves them together with the face.
import * as THREE from 'three';
import { HEAD, type FacePartsParams } from '../config';
import { stepSpring } from '../ExpressionEngine';
import type { LandmarkFile, Vec3 } from '../landmarks';
import { createEyeTexture, redrawEyeTexture } from './eyeTexture';
import { LipGap } from './lipGap';
import { buildMouthGeometry } from './mouthInterior';
import { Eyelids, type LidInputs } from './eyelids';
import { sampleEyeSkin } from './skinColor';
import { transformPositions } from '../morph/meshTools';

export interface FacePartsOptions {
  /** Root-space jawOpen displacement for the mouth interior (from MorphBuilder). */
  jawMorph?: (rootPositions: Float32Array) => Float32Array;
}

const DEG = Math.PI / 180;

interface Eye {
  side: 1 | -1; // +1 = character's left (+X)
  landmark: Vec3;
  pivot: THREE.Object3D; // rotates for gaze
  mesh: THREE.Mesh;
}

export class FaceParts {
  readonly head = new THREE.Group();
  readonly eyes: Eye[] = [];
  readonly mouth: THREE.Mesh;
  readonly lipGap: LipGap;
  readonly eyelids: Eyelids;
  private eyeTexture: THREE.CanvasTexture;
  private eyeMaterial: THREE.MeshPhysicalMaterial;
  private eyeGeometry: THREE.SphereGeometry;
  private mouthMaterial: THREE.MeshStandardMaterial;
  private pivotPoint: THREE.Vector3;

  // Gaze state: goal and spring-smoothed current value, in radians.
  private gazeGoal = { yaw: 0, pitch: 0 };
  private gaze = { yaw: 0, pitch: 0, vYaw: 0, vPitch: 0 };

  constructor(
    root: THREE.Object3D,
    meshes: THREE.Mesh[],
    readonly landmarks: LandmarkFile,
    public params: FacePartsParams,
    private options: FacePartsOptions = {},
  ) {
    const { points: P, eyeDist: ed } = landmarks;
    this.head.name = 'head';
    this.pivotPoint = new THREE.Vector3(
      (P.jawPivot_L[0] + P.jawPivot_R[0]) / 2 + HEAD.pivotOffset[0] * ed,
      (P.jawPivot_L[1] + P.jawPivot_R[1]) / 2 + HEAD.pivotOffset[1] * ed,
      (P.jawPivot_L[2] + P.jawPivot_R[2]) / 2 + HEAD.pivotOffset[2] * ed,
    );
    this.head.position.copy(this.pivotPoint);
    root.add(this.head);

    // Eyeballs: unit sphere with its north pole turned to +Z (front), scaled per params.
    this.eyeGeometry = new THREE.SphereGeometry(1, 48, 32);
    this.eyeGeometry.rotateX(Math.PI / 2);
    this.eyeTexture = createEyeTexture(params.eyes);
    this.eyeMaterial = new THREE.MeshPhysicalMaterial({ map: this.eyeTexture });
    for (const [side, landmark] of [
      [1, P.eye_L],
      [-1, P.eye_R],
    ] as const) {
      const pivot = new THREE.Object3D();
      pivot.name = side > 0 ? 'eye_L' : 'eye_R';
      const mesh = new THREE.Mesh(this.eyeGeometry, this.eyeMaterial);
      pivot.add(mesh);
      this.head.add(pivot);
      this.eyes.push({ side, landmark, pivot, mesh });
    }

    // Mouth interior: closed bag along the lip line, seen from inside (see mouthInterior.ts).
    this.mouthMaterial = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, side: THREE.BackSide });
    this.mouth = new THREE.Mesh(new THREE.BufferGeometry(), this.mouthMaterial);
    this.mouth.name = 'mouthInterior';
    this.mouth.position.copy(this.pivotPoint).negate(); // geometry is in model-root space
    this.head.add(this.mouth);

    this.lipGap = new LipGap(meshes, root, landmarks);

    // Eyelid shells, coloured with the skin sampled just above/below each eye.
    root.updateMatrixWorld(true);
    const skinMesh = meshes[0];
    const rootPos = transformPositions(
      skinMesh.geometry.attributes.position as THREE.BufferAttribute,
      root.matrixWorld.clone().invert().multiply(skinMesh.matrixWorld),
    );
    const skins = (['L', 'R'] as const).map((side) => ({
      upper: sampleEyeSkin(skinMesh, rootPos, landmarks, side, 'ring'),
      lower: sampleEyeSkin(skinMesh, rootPos, landmarks, side, 'below'),
    }));
    this.skinSamples = skins.flatMap((k) => [`#${k.upper.getHexString()}`, `#${k.lower.getHexString()}`]);
    this.eyelids = new Eyelids(this.head, this.eyeCenters(), skins);
    this.applyParams();
  }

  /** Lid colours sampled from the texture: [L upper, L lower, R upper, R lower] (sRGB hex). */
  readonly skinSamples: string[];

  private eyeCenters(): THREE.Vector3[] {
    const e = this.params.eyes;
    const ed = this.landmarks.eyeDist;
    return this.eyes.map((eye) => {
      const [x, y, z] = eye.landmark;
      return new THREE.Vector3(x + eye.side * e.offsetX * ed, y + e.offsetY * ed, z - e.depth * ed).sub(this.pivotPoint);
    });
  }

  /** Re-applies every parameter (call after changing `params`). */
  applyParams(): void {
    this.applyEyes();
    this.applyMouth();
    this.lipGap.apply(this.params.lipGap);
  }

  applyEyelids(): void {
    this.eyelids.apply(this.params.eyelids, this.params.eyes, this.landmarks.eyeDist, this.eyeCenters());
  }

  applyEyes(): void {
    const e = this.params.eyes;
    const ed = this.landmarks.eyeDist;
    const centers = this.eyeCenters();
    this.eyes.forEach((eye, k) => {
      eye.pivot.position.copy(centers[k]);
      eye.mesh.scale.setScalar(e.radius * ed);
      eye.pivot.visible = e.visible;
    });
    // Lids depend on eyeball size and position.
    if (this.eyelids) this.applyEyelids();
    const m = this.eyeMaterial;
    m.roughness = e.roughness;
    m.clearcoat = e.clearcoat;
    m.clearcoatRoughness = e.clearcoatRoughness;
  }

  /** Redraws the iris/pupil canvas (slower; call when colors or angles change). */
  applyEyeTexture(): void {
    redrawEyeTexture(this.eyeTexture, this.params.eyes);
  }

  applyMouth(): void {
    const m = this.params.mouth;
    this.mouth.geometry.dispose();
    const geo = buildMouthGeometry(this.landmarks, m);
    if (this.options.jawMorph) {
      // The lower half of the mouth interior opens with the jaw (geometry is in root space).
      const pos = geo.attributes.position.array as Float32Array;
      const disp = this.options.jawMorph(pos);
      const attr = new THREE.Float32BufferAttribute(disp, 3);
      attr.name = 'jawOpen';
      geo.morphAttributes.position = [attr];
      geo.morphTargetsRelative = true;
    }
    this.mouth.geometry = geo;
    // Keep the influences array the engine already holds; only create it the first time.
    if (this.options.jawMorph && !this.mouth.morphTargetInfluences) this.mouth.updateMorphTargets();
    this.mouth.visible = m.visible;
    this.mouthMaterial.color.set(m.color);
  }

  /**
   * Gaze direction: x, y in -1..1 (x+ = toward the viewer's right / character's left,
   * y+ = up). Mapped to ±maxAngle and followed smoothly.
   */
  lookAt(x: number, y: number): void {
    const max = this.params.eyes.maxAngle * DEG;
    this.gazeGoal.yaw = THREE.MathUtils.clamp(x, -1, 1) * max;
    this.gazeGoal.pitch = -THREE.MathUtils.clamp(y, -1, 1) * max;
  }

  /** Points the eyes at a screen position (normalized device coords) seen through `camera`. */
  lookAtScreen(ndcX: number, ndcY: number, camera: THREE.Camera, range: number): void {
    const mid = new THREE.Vector3();
    for (const eye of this.eyes) mid.add(eye.pivot.getWorldPosition(new THREE.Vector3()));
    mid.multiplyScalar(0.5).project(camera);
    this.lookAt((ndcX - mid.x) / range, (ndcY - mid.y) / range);
  }

  update(dt: number, lids: LidInputs = { blink: 0, squint: 0, wide: 0 }): void {
    const w = this.params.eyes.gazeOmega;
    const t = Math.min(dt, 0.1);
    [this.gaze.yaw, this.gaze.vYaw] = stepSpring(this.gaze.yaw, this.gaze.vYaw, this.gazeGoal.yaw, w, 1, t);
    [this.gaze.pitch, this.gaze.vPitch] = stepSpring(this.gaze.pitch, this.gaze.vPitch, this.gazeGoal.pitch, w, 1, t);
    for (const eye of this.eyes) eye.pivot.rotation.set(this.gaze.pitch, this.gaze.yaw, 0, 'YXZ');
    this.eyelids.update(this.params.eyelids, lids, this.gaze.pitch);
  }
}
