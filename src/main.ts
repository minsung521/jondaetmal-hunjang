// Entry point.
//   ?model=hunjang | hunjang-real | facecap   choose the face
//   ?debug                                    lil-gui panel + FPS meter
import * as THREE from 'three';
import { DEFAULT_MODEL, ENGINE, MODELS } from './config';
import { createStage } from './stage';
import { loadModel } from './loadModel';
import { ExpressionEngine } from './ExpressionEngine';
import { createDebugPanel, type DebugPanel } from './debugPanel';

const params = new URLSearchParams(location.search);
const modelKey = params.get('model') && MODELS[params.get('model')!] ? params.get('model')! : DEFAULT_MODEL;
const model = MODELS[modelKey];
const debug = params.has('debug');

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

const modelLinks = Object.keys(MODELS)
  .map((k) => (k === modelKey ? `<b>${k}</b>` : `<a href="${linkTo({ model: k })}">${k}</a>`))
  .join(' · ');
const debugLink = debug
  ? `<a href="${linkTo({ debug: null })}">디버그 끄기</a>`
  : `<a href="${linkTo({ debug: '' })}">디버그 켜기</a>`;
hud.innerHTML = `모델: ${modelLinks}<br>불러오는 중…`;

let engine: ExpressionEngine | null = null;
let panel: DebugPanel | null = null;

loadModel(model.url, stage.renderer)
  .then((loaded) => {
    stage.scene.add(loaded.root);
    stage.frame(loaded.root, model.frameHeight, model.frameDistance);

    engine = new ExpressionEngine(loaded.morphMeshes, {
      omega: ENGINE.springOmega,
      maxDt: ENGINE.maxDt,
      aliases: ENGINE.aliases,
    });
    engine.setBaseWeights(model.baseWeights);
    if (debug) panel = createDebugPanel(engine);

    hud.innerHTML =
      `모델: ${modelLinks}<br>` +
      `정점 ${loaded.vertexCount.toLocaleString()}개 · 모프 ${engine.channels.length}개 · 드래그로 회전<br>` +
      debugLink;
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
  stage.controls.update();
  stage.renderer.render(stage.scene, stage.camera);
  panel?.tick();
});
