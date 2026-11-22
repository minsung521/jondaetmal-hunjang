// Renderer, scene, lights, camera and orbit controls.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LIGHTS, VIEW } from './config';

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** Points the camera at a model: target at frameHeight of its height, distance in heights. */
  frame(root: THREE.Object3D, frameHeight: number, frameDistance: number): void;
}

export function createStage(container: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, VIEW.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(VIEW.background);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = LIGHTS.environmentIntensity;

  // Soft key light from front-left, rim light from behind.
  const key = new THREE.DirectionalLight(LIGHTS.key.color, LIGHTS.key.intensity);
  key.position.set(...LIGHTS.key.position);
  scene.add(key);
  const rim = new THREE.DirectionalLight(LIGHTS.rim.color, LIGHTS.rim.intensity);
  rim.position.set(...LIGHTS.rim.position);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(VIEW.fov, window.innerWidth / window.innerHeight, 0.01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function frame(root: THREE.Object3D, frameHeight: number, frameDistance: number) {
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const target = new THREE.Vector3(center.x, box.min.y + size.y * frameHeight, center.z);
    controls.target.copy(target);
    camera.position.set(target.x, target.y, target.z + size.y * frameDistance);
    camera.near = size.y * 0.01;
    camera.far = size.y * 100;
    camera.updateProjectionMatrix();
    controls.update();
  }

  return { renderer, scene, camera, controls, frame };
}
