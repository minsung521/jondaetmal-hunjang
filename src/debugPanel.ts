// lil-gui panel + FPS meter. Only created when the URL has ?debug.
import GUI from 'lil-gui';
import Stats from 'three/addons/libs/stats.module.js';
import { ExpressionEngine } from './ExpressionEngine';

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
  /** Call once per frame (FPS meter). */
  tick(): void;
}

export function createDebugPanel(engine: ExpressionEngine): DebugPanel {
  const stats = new Stats();
  stats.dom.style.cssText = 'position:fixed;top:0;left:0;z-index:10;cursor:pointer';
  document.body.appendChild(stats.dom);

  const gui = new GUI({ title: '디버그' });

  const engineFolder = gui.addFolder('표정 엔진');
  engineFolder.add(engine.options, 'omega', 2, 40, 0.5).name('스프링 ω');

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
    return { tick: () => stats.update() };
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

  return { tick: () => stats.update() };
}
