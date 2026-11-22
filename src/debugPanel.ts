// lil-gui panel + FPS meter. Only created when the URL has ?debug.
import GUI from 'lil-gui';
import Stats from 'three/addons/libs/stats.module.js';
import { ExpressionEngine } from './ExpressionEngine';
import type { LandmarkMarkers } from './LandmarkMarkers';
import type { LandmarkFile } from './landmarks';

/** The 10 expressions stage D will generate for the hunjang models (combined/ARKit names). */
const CORE_EXPRESSIONS = [
  'browDown',
  'browInnerUp',
  'browOuterUpLeft',
  'eyeWide',
  'eyeSquint',
  'jawOpen',
  'mouthFrown',
  'mouthSmile',
  'mouthPress',
  'noseSneer',
];

export interface DebugPanel {
  gui: GUI;
  /** Call once per frame (FPS meter). */
  tick(): void;
}

export interface DebugExtras {
  /** Saved-landmark markers to toggle (null when the picking tool owns them). */
  markers?: LandmarkMarkers | null;
  landmarks?: LandmarkFile | null;
}

export function createDebugPanel(engine: ExpressionEngine, extras: DebugExtras = {}): DebugPanel {
  const stats = new Stats();
  stats.dom.style.cssText = 'position:fixed;top:0;left:0;z-index:10;cursor:pointer';
  document.body.appendChild(stats.dom);

  const gui = new GUI({ title: '디버그' });

  if (extras.markers && extras.landmarks) {
    const lmFolder = gui.addFolder('기준점');
    lmFolder.close();
    const markers = extras.markers;
    // Hidden by default since stage C: the eyeballs cover the eye markers anyway.
    const view = { shown: false, labels: true, eyeDist: extras.landmarks.eyeDist.toFixed(4) };
    markers.setShown(false);
    lmFolder.add(view, 'shown').name('표시').onChange((v: boolean) => markers.setShown(v));
    lmFolder.add(view, 'labels').name('이름 표시').onChange((v: boolean) => markers.setLabelsVisible(v));
    lmFolder.add(view, 'eyeDist').name('eyeDist').disable();
  }

  const engineFolder = gui.addFolder('표정 엔진');
  engineFolder.add(engine.options, 'omega', 2, 40, 0.5).name('스프링 ω');
  engineFolder.add(engine.options, 'dampingRatio', 0.1, 2, 0.01).name('감쇠비 ζ (1=임계)');

  const morphState: Record<string, number> = {};
  const morphControllers: ReturnType<GUI['add']>[] = [];

  const actions = {
    reset() {
      engine.resetTargets();
      for (const k of Object.keys(morphState)) morphState[k] = 0;
      for (const c of morphControllers) c.updateDisplay();
    },
    random() {
      engine.resetTargets();
      for (const k of Object.keys(morphState)) morphState[k] = 0;
      for (const name of engine.arkitNames) {
        if (Math.random() < 0.15) {
          morphState[name] = Math.round(Math.random() * 100) / 100;
          engine.setTarget(name, morphState[name]);
        }
      }
      for (const c of morphControllers) c.updateDisplay();
    },
  };
  engineFolder.add(actions, 'reset').name('모두 0으로');
  engineFolder.add(actions, 'random').name('무작위 표정');

  if (engine.channels.length === 0) {
    gui.addFolder('모프').add({ note: '이 모델엔 모프가 아직 없어요' }, 'note').name('안내').disable();
    return { gui, tick: () => stats.update() };
  }

  // Combined names exercise the alias layer (e.g. browDown → browDown_L + browDown_R on facecap).
  const core = CORE_EXPRESSIONS.filter((n) => engine.resolve(n).length > 0);
  if (core.length) {
    const coreFolder = gui.addFolder('1차 10개 (별칭 경유)');
    for (const name of core) {
      morphState[name] = 0;
      morphControllers.push(
        coreFolder
          .add(morphState, name, 0, 1, 0.01)
          .onChange((v: number) => engine.setTarget(name, v)),
      );
    }
  }

  // Per-channel spring override through setTarget(name, value, { dampingRatio }).
  const springFolder = gui.addFolder('채널별 감쇠비');
  springFolder.close();
  const perChannel = { name: core[0] ?? engine.arkitNames[0], ratio: engine.options.dampingRatio };
  const picker = springFolder
    .add(perChannel, 'name', [...new Set([...core, ...engine.arkitNames])])
    .name('모프');
  const ratioCtrl = springFolder
    .add(perChannel, 'ratio', 0.1, 2, 0.01)
    .name('감쇠비 ζ')
    .onChange((v: number) =>
      engine.setTarget(perChannel.name, engine.getTarget(perChannel.name), { dampingRatio: v }),
    );
  picker.onChange((n: string) => {
    perChannel.ratio = engine.getSpring(n).dampingRatio ?? engine.options.dampingRatio;
    ratioCtrl.updateDisplay();
  });
  springFolder.add({ clear: () => engine.clearSpringOverrides() }, 'clear').name('채널별 설정 모두 해제');

  const allFolder = gui.addFolder(`모든 모프 (${engine.channels.length})`);
  allFolder.close();
  for (const name of engine.arkitNames) {
    if (name in morphState) continue;
    morphState[name] = 0;
    morphControllers.push(
      allFolder.add(morphState, name, 0, 1, 0.01).onChange((v: number) => engine.setTarget(name, v)),
    );
  }

  const baseFolder = gui.addFolder('기본 가중치');
  baseFolder.close();
  const base = { name: engine.arkitNames[0], value: 0 };
  const baseName = baseFolder.add(base, 'name', engine.arkitNames).name('모프');
  const baseValue = baseFolder
    .add(base, 'value', 0, 1, 0.01)
    .name('값')
    .onChange((v: number) => engine.setBaseWeight(base.name, v));
  baseName.onChange((n: string) => {
    base.value = engine.getBaseWeight(n);
    baseValue.updateDisplay();
  });

  return { gui, tick: () => stats.update() };
}
