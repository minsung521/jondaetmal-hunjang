// Code-built face parts: eyeballs, mouth interior, lip gap (stage C).
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
    this.applyParams();
  }

  /** Re-applies every parameter (call after changing `params`). */
  applyParams(): void {
    this.applyEyes();
    this.applyMouth();
    this.lipGap.apply(this.params.lipGap);
  }

  applyEyes(): void {
    const e = this.params.eyes;
    const ed = this.landmarks.eyeDist;
    for (const eye of this.eyes) {
      const [x, y, z] = eye.landmark;
      eye.pivot.position
        .set(x + eye.side * e.offsetX * ed, y + e.offsetY * ed, z - e.depth * ed)
        .sub(this.pivotPoint);
      eye.mesh.scale.setScalar(e.radius * ed);
      eye.pivot.visible = e.visible;
    }
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
    this.mouth.geometry = buildMouthGeometry(this.landmarks, m);
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

  update(dt: number): void {
    const w = this.params.eyes.gazeOmega;
    const t = Math.min(dt, 0.1);
    [this.gaze.yaw, this.gaze.vYaw] = stepSpring(this.gaze.yaw, this.gaze.vYaw, this.gazeGoal.yaw, w, 1, t);
    [this.gaze.pitch, this.gaze.vPitch] = stepSpring(this.gaze.pitch, this.gaze.vPitch, this.gazeGoal.pitch, w, 1, t);
    for (const eye of this.eyes) eye.pivot.rotation.set(this.gaze.pitch, this.gaze.yaw, 0, 'YXZ');
  }
}
