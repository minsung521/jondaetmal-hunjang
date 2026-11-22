// Entry point.
//   ?model=hunjang | hunjang-real | facecap   choose the face
//   ?debug                                    lil-gui panel + FPS meter (+ saved landmarks)
//   ?landmarks                                landmark picking tool
import * as THREE from 'three';
import { DEFAULT_MODEL, ENGINE, LANDMARKS_VIEW, MODELS } from './config';
import { createStage } from './stage';
import { loadModel } from './loadModel';
import { ExpressionEngine } from './ExpressionEngine';
import { createDebugPanel, type DebugPanel } from './debugPanel';
import { LandmarkMarkers } from './LandmarkMarkers';
import { createLandmarkTool } from './landmarkTool';
import { savedLandmarks } from './landmarks';

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

    if (debug) panel = createDebugPanel(engine, { markers: landmarkMode ? null : markers, landmarks: saved });

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
  engine?.update(timer.getDelta());
  stage.render();
  panel?.tick();
});
