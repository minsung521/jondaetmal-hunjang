// Entry point.
//   ?model=hunjang | hunjang-real | facecap   choose the face
//   ?debug                                    lil-gui panel + FPS meter (+ saved landmarks)
//   ?landmarks                                landmark picking tool
import * as THREE from 'three';
import { DEFAULT_MODEL, ENGINE, FACE_PARTS, GAZE, LANDMARKS_VIEW, MODELS, type FacePartsParams } from './config';
import { createStage } from './stage';
import { loadModel } from './loadModel';
import { ExpressionEngine } from './ExpressionEngine';
import { createDebugPanel, type DebugPanel } from './debugPanel';
import { LandmarkMarkers } from './LandmarkMarkers';
import { createLandmarkTool } from './landmarkTool';
import { savedLandmarks } from './landmarks';
import { FaceParts } from './face/FaceParts';
import { deepMerge, modelData } from './modelData';
import { addFacePartsFolder, type GazeControl } from './debugFaceParts';

const params = new URLSearchParams(location.search);
const modelKey = params.get('model') && MODELS[params.get('model')!] ? params.get('model')! : DEFAULT_MODEL;
const model = MODELS[modelKey];
const debug = params.has('debug');
const landmarkMode = params.has('landmarks');

const hud = document.getElementById('hud')!;
const stage = createStage(document.getElementById('app')!);

function linkTo(next: Record<string, string | null>): string {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(next)) {
    if (v === null) p.delete(k);
    else p.set(k, v);
  }
  const q = p.toString().replace(/=(?=&|$)/g, '');
  return q ? `?${q}` : location.pathname;
}

function toggleLink(param: string, on: boolean, label: string): string {
  return `<a href="${linkTo({ [param]: on ? null : '' })}">${label} ${on ? '끄기' : '켜기'}</a>`;
}

const modelLinks = Object.keys(MODELS)
  .map((k) => (k === modelKey ? `<b>${k}</b>` : `<a href="${linkTo({ model: k })}">${k}</a>`))
  .join(' · ');
const modeLinks = `${toggleLink('debug', debug, '디버그')} · ${toggleLink('landmarks', landmarkMode, '기준점 찍기')}`;
hud.innerHTML = `모델: ${modelLinks}<br>불러오는 중…`;

let engine: ExpressionEngine | null = null;
let panel: DebugPanel | null = null;
let parts: FaceParts | null = null;

// Gaze: follow the pointer unless the debug panel switches to manual sliders.
const gaze: GazeControl = { followPointer: GAZE.followPointer, x: 0, y: 0 };
const pointer = { x: 0, y: 0, inside: false };
window.addEventListener('pointermove', (ev) => {
  pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
  pointer.inside = true;
});
document.documentElement.addEventListener('pointerleave', () => (pointer.inside = false));

loadModel(model.url, stage.renderer)
  .then((loaded) => {
    stage.scene.add(loaded.root);
    if (landmarkMode) stage.frame(loaded.root, LANDMARKS_VIEW.frameHeight, LANDMARKS_VIEW.frameDistance);
    else stage.frame(loaded.root, model.frameHeight, model.frameDistance);

    engine = new ExpressionEngine(loaded.morphMeshes, {
      omega: ENGINE.springOmega,
      dampingRatio: ENGINE.dampingRatio,
      outputMin: ENGINE.outputMin,
      outputMax: ENGINE.outputMax,
      maxDt: ENGINE.maxDt,
      aliases: ENGINE.aliases,
    });
    engine.setBaseWeights(model.baseWeights);

    // Landmark markers live under the model root, so stored coordinates apply directly.
    const saved = savedLandmarks(modelKey);
    let markers: LandmarkMarkers | null = null;
    if (landmarkMode || (debug && saved)) {
      const height = new THREE.Box3().setFromObject(loaded.root).getSize(new THREE.Vector3()).y;
      const radius = height * LANDMARKS_VIEW.markerRadius;
      markers = new LandmarkMarkers(radius);
      loaded.root.add(markers);
      markers.enableOcclusion(stage.camera, stage.controls, loaded.meshes);
      if (landmarkMode) {
        createLandmarkTool(stage, loaded.root, loaded.meshes, markers, modelKey, radius);
      } else if (saved) {
        markers.setAll(saved.points);
      }
    }

    // Eyeballs, mouth interior and lip gap need landmarks. Skipped while picking landmarks,
    // so the painted eyes and the closed lips stay clickable.
    if (saved && !landmarkMode) {
      const params = deepMerge<FacePartsParams>(FACE_PARTS, model.faceParts, modelData('faceParts', modelKey));
      parts = new FaceParts(loaded.root, loaded.meshes, saved, params);
    }

    if (debug) {
      panel = createDebugPanel(engine, { markers: landmarkMode ? null : markers, landmarks: saved });
      if (parts) addFacePartsFolder(panel.gui, parts, modelKey, gaze);
    }

    hud.innerHTML =
      `모델: ${modelLinks}<br>` +
      `정점 ${loaded.vertexCount.toLocaleString()}개 · 모프 ${engine.channels.length}개 · ` +
      `기준점 ${saved ? '저장됨' : '없음'} · 드래그로 회전<br>` +
      modeLinks;
  })
  .catch((err) => {
    hud.textContent = `모델을 불러오지 못했어요: ${String(err)}`;
    console.error(err);
  });

const timer = new THREE.Timer();
stage.renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = timer.getDelta();
  engine?.update(dt);
  if (parts) {
    if (gaze.followPointer) {
      if (pointer.inside) parts.lookAtScreen(pointer.x, pointer.y, stage.camera, GAZE.pointerRange);
      else parts.lookAt(0, 0);
    }
    parts.update(dt);
  }
  stage.render();
  panel?.tick();
});
