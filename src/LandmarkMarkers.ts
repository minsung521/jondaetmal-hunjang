// Small spheres (+ optional name labels) showing landmarks on the face.
// Add the group as a child of the model root so stored coordinates apply directly.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { LANDMARKS_VIEW } from './config';
import { type LandmarkName, type LandmarkPoints, type Vec3, sideOf } from './landmarks';

export class LandmarkMarkers extends THREE.Group {
  private markers = new Map<LandmarkName, { mesh: THREE.Mesh; label: CSS2DObject }>();
  private geometry: THREE.SphereGeometry;
  private materials: Record<'L' | 'R' | 'C' | 'active', THREE.MeshBasicMaterial>;
  private labelsVisible = true;
  private occlusion: { camera: THREE.Camera; occluders: THREE.Object3D[]; timer: number } | null = null;
  private raycaster = new THREE.Raycaster();

  /** radius in model units. */
  constructor(radius: number) {
    super();
    this.name = 'landmarkMarkers';
    this.geometry = new THREE.SphereGeometry(radius, 16, 12);
    const c = LANDMARKS_VIEW.colors;
    this.materials = {
      L: new THREE.MeshBasicMaterial({ color: c.left }),
      R: new THREE.MeshBasicMaterial({ color: c.right }),
      C: new THREE.MeshBasicMaterial({ color: c.center }),
      active: new THREE.MeshBasicMaterial({ color: c.active }),
    };
  }

  setPoint(name: LandmarkName, p: Vec3 | undefined): void {
    let m = this.markers.get(name);
    if (!p) {
      if (m) {
        this.remove(m.mesh);
        m.label.element.remove();
        this.markers.delete(name);
      }
      return;
    }
    if (!m) {
      const mesh = new THREE.Mesh(this.geometry, this.materials[sideOf(name) ?? 'C']);
      mesh.renderOrder = 1;
      const el = document.createElement('div');
      el.className = 'landmark-label';
      el.textContent = name;
      const label = new CSS2DObject(el);
      label.center.set(-0.1, 1.1);
      label.visible = this.labelsVisible;
      mesh.add(label);
      this.add(mesh);
      m = { mesh, label };
      this.markers.set(name, m);
    }
    m.mesh.position.set(...p);
    this.scheduleOcclusion();
  }

  /**
   * Fades labels whose marker is hidden behind the model. Rechecked (by raycast) shortly after
   * the camera stops moving, not every frame, to keep picking smooth on 50k-triangle meshes.
   */
  enableOcclusion(camera: THREE.Camera, controls: THREE.EventDispatcher<{ change: object }>, occluders: THREE.Object3D[]): void {
    this.occlusion = { camera, occluders, timer: 0 };
    controls.addEventListener('change', () => this.scheduleOcclusion());
    this.scheduleOcclusion();
  }

  private scheduleOcclusion(): void {
    const o = this.occlusion;
    if (!o) return;
    clearTimeout(o.timer);
    o.timer = window.setTimeout(() => this.updateOcclusion(), LANDMARKS_VIEW.occlusionDelayMs);
  }

  private updateOcclusion(): void {
    const o = this.occlusion;
    if (!o) return;
    const camPos = o.camera.getWorldPosition(new THREE.Vector3());
    const p = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const radius = this.geometry.parameters.radius;
    for (const m of this.markers.values()) {
      m.mesh.getWorldPosition(p);
      dir.subVectors(p, camPos);
      const dist = dir.length();
      this.raycaster.set(camPos, dir.normalize());
      this.raycaster.far = dist;
      const hit = this.raycaster.intersectObjects(o.occluders, false)[0];
      const hidden = !!hit && hit.distance < dist - radius * 2;
      m.label.element.style.opacity = hidden ? String(LANDMARKS_VIEW.hiddenLabelOpacity) : '1';
    }
  }

  setAll(points: LandmarkPoints): void {
    for (const name of [...this.markers.keys()]) if (!points[name]) this.setPoint(name, undefined);
    for (const [name, p] of Object.entries(points)) this.setPoint(name as LandmarkName, p);
  }

  /** Highlights one marker (the one being picked). */
  setActive(name: LandmarkName | null): void {
    for (const [n, m] of this.markers) {
      m.mesh.material = n === name ? this.materials.active : this.materials[sideOf(n) ?? 'C'];
      m.mesh.scale.setScalar(n === name ? 1.5 : 1);
    }
  }

  setLabelsVisible(v: boolean): void {
    this.labelsVisible = v;
    for (const m of this.markers.values()) m.label.visible = v;
  }

  /** CSS2D labels are DOM nodes; hiding the group must hide them too. */
  setShown(v: boolean): void {
    this.visible = v;
    for (const m of this.markers.values()) m.label.visible = v && this.labelsVisible;
  }
}
