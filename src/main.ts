// Stage 0: model viewer. Switch models with ?model=hunjang | hunjang-real.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const MODELS: Record<string, string> = {
  hunjang: '/models/hunjang.glb',
  'hunjang-real': '/models/hunjang-real.glb',
};

const params = new URLSearchParams(location.search);
const modelKey = params.get('model') ?? 'hunjang';
const modelUrl = MODELS[modelKey] ?? MODELS.hunjang;

const container = document.getElementById('app')!;
const hud = document.getElementById('hud')!;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e4da);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

// Soft key light from front-left, rim light from behind.
const key = new THREE.DirectionalLight(0xfff4e6, 1.6);
key.position.set(-1, 1.5, 2);
scene.add(key);
const rim = new THREE.DirectionalLight(0xdde8ff, 1.2);
rim.position.set(1.5, 1, -2);
scene.add(rim);

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.01, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const links = Object.keys(MODELS)
  .map((k) => (k === modelKey ? `<b>${k}</b>` : `<a href="?model=${k}">${k}</a>`))
  .join(' · ');
hud.innerHTML = `모델: ${links}<br>불러오는 중…`;

new GLTFLoader().load(
  modelUrl,
  (gltf) => {
    const root = gltf.scene;
    scene.add(root);
    // Frame the head: center on the bounding box, camera in front (+Z).
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const headTarget = new THREE.Vector3(center.x, box.min.y + size.y * 0.62, center.z);
    controls.target.copy(headTarget);
    camera.position.set(headTarget.x, headTarget.y, headTarget.z + size.y * 2.2);
    controls.update();

    let verts = 0;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) verts += m.geometry.attributes.position.count;
    });
    hud.innerHTML = `모델: ${links}<br>정점 ${verts.toLocaleString()}개 · 드래그로 회전`;
  },
  undefined,
  (err) => {
    hud.textContent = `모델을 불러오지 못했어요: ${String(err)}`;
  },
);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
