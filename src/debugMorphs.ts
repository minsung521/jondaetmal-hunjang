// ?debug folder for stage D: per-target strength/radius of the generated morphs, jaw settings,
// sanity checks, and the tuned values as morphConfig JSON (text box + copy button).
import type GUI from 'lil-gui';
import type { ExpressionEngine } from './ExpressionEngine';
import type { FaceParts } from './face/FaceParts';
import type { MorphBuilder } from './morph/MorphBuilder';
import { createJsonBox } from './jsonBox';

export function addMorphFolder(
  gui: GUI,
  morphs: MorphBuilder,
  parts: FaceParts,
  engine: ExpressionEngine,
  modelKey: string,
): void {
  const defs = morphs.defs;
  const box = createJsonBox();
  const exportJson = () => {
    const targets: Record<string, { strength: number; radius: number }> = {};
    for (const [name, t] of Object.entries(defs.targets)) targets[name] = { strength: t.strength, radius: t.radius };
    return JSON.stringify({ targets, jaw: defs.jaw }, null, 2);
  };

  const checks = { seam: '', robe: '', beard: '' };
  const refreshChecks = () => {
    checks.seam = `${morphs.seamError.toExponential(1)} eyeDist`;
    const worst = Math.max(...morphs.names.map((n) => morphs.maxFixedMotion(n)));
    checks.robe = `${worst.toExponential(1)} eyeDist`;
    checks.beard = `${morphs.stats.beard}개 · 고정 ${morphs.stats.fixed}개`;
    for (const c of checkCtrls) c.updateDisplay();
  };

  // Rebuilds are coalesced to one per frame while a slider is dragged.
  const dirty = new Set<string>();
  let scheduled = false;
  const rebuild = (name: string) => {
    dirty.add(name);
    box.update(exportJson());
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      for (const n of dirty) morphs.build(n);
      morphs.refreshGpu();
      if (dirty.has('jawOpen')) parts.applyMouth();
      dirty.clear();
    });
  };

  const solo = (name: string) => {
    engine.resetTargets();
    engine.setTarget(name, 1);
  };

  const folder = gui.addFolder('모프 생성 (단계 D)');
  folder.close();
  for (const [name, t] of Object.entries(defs.targets)) {
    const f = folder.addFolder(name);
    f.close();
    f.add(t, 'strength', 0, 2, 0.01).name('세기').onChange(() => rebuild(name));
    f.add(t, 'radius', 0.3, 2, 0.01).name('반경').onChange(() => rebuild(name));
    f.add({ go: () => solo(name) }, 'go').name('이것만 1로 보기');
  }
  const jaw = folder.addFolder('jawOpen');
  jaw.close();
  const jawChanged = () => rebuild('jawOpen');
  jaw.add(defs.jaw, 'strength', 0, 2, 0.01).name('세기').onChange(jawChanged);
  jaw.add(defs.jaw, 'radius', 0.3, 2, 0.01).name('반경(부드러운 띠)').onChange(jawChanged);
  jaw.add(defs.jaw, 'angle', 5, 35, 0.5).name('각도(°)').onChange(jawChanged);
  jaw.add(defs.jaw, 'chinMargin', 0, 1.5, 0.01).name('턱 아래 여유').onChange(jawChanged);
  jaw.add(defs.jaw, 'neckFalloff', 0, 1, 0.01).name('목 쪽 감쇠').onChange(jawChanged);
  jaw.add(defs.jaw, 'beardFollow', 0, 1, 0.01).name('수염: 턱끝 따라가기').onChange(jawChanged);
  jaw.add(defs.jaw, 'beardBlend', 0.1, 2, 0.01).name('수염: 전환 길이').onChange(jawChanged);
  jaw.add({ go: () => solo('jawOpen') }, 'go').name('이것만 1로 보기');

  const checkFolder = folder.addFolder('점검');
  const checkCtrls = [
    checkFolder.add(checks, 'seam').name('이음새 정점 차이').disable(),
    checkFolder.add(checks, 'robe').name('도포 최대 이동').disable(),
    checkFolder.add(checks, 'beard').name('수염 정점').disable(),
  ];
  checkFolder.add({ go: refreshChecks }, 'go').name('다시 계산');
  refreshChecks();

  folder.add({ show: () => box.show(`morphConfig.${modelKey}.json`, exportJson()) }, 'show').name('조정값 JSON 보기');
}
