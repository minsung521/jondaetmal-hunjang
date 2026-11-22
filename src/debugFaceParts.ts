// ?debug folder for the stage C face parts, with a JSON export of the tuned values.
import type GUI from 'lil-gui';
import type { FaceParts } from './face/FaceParts';
import { createJsonBox } from './jsonBox';

export interface GazeControl {
  followPointer: boolean;
  x: number;
  y: number;
}

export function addFacePartsFolder(gui: GUI, parts: FaceParts, modelKey: string, gaze: GazeControl): void {
  const p = parts.params;
  const box = createJsonBox();
  const json = () => JSON.stringify(p, null, 2);
  const changed = (fn: () => void) => () => {
    fn();
    box.update(json());
  };

  const folder = gui.addFolder('얼굴 부품');

  const eyes = folder.addFolder('눈알');
  const eyesChanged = changed(() => parts.applyEyes());
  const textureChanged = changed(() => parts.applyEyeTexture());
  eyes.add(p.eyes, 'visible').name('표시').onChange(eyesChanged);
  eyes.add(p.eyes, 'radius', 0.1, 0.4, 0.005).name('반지름 (×eyeDist)').onChange(eyesChanged);
  eyes.add(p.eyes, 'depth', -0.1, 0.4, 0.005).name('깊이 (뒤로 +)').onChange(eyesChanged);
  eyes.add(p.eyes, 'offsetX', -0.15, 0.15, 0.005).name('바깥쪽으로').onChange(eyesChanged);
  eyes.add(p.eyes, 'offsetY', -0.15, 0.15, 0.005).name('위로').onChange(eyesChanged);
  eyes.add(p.eyes, 'maxAngle', 0, 40, 1).name('최대 시선각(°)').onChange(changed(() => {}));
  eyes.add(p.eyes, 'gazeOmega', 4, 40, 1).name('시선 스프링 ω').onChange(changed(() => {}));
  eyes.add(p.eyes, 'irisAngle', 15, 60, 1).name('홍채 크기(°)').onChange(textureChanged);
  eyes.add(p.eyes, 'pupilAngle', 4, 40, 1).name('동공 크기(°)').onChange(textureChanged);
  eyes.addColor(p.eyes, 'irisColor').name('홍채 색').onChange(textureChanged);
  eyes.addColor(p.eyes, 'irisEdgeColor').name('홍채 테두리').onChange(textureChanged);
  eyes.addColor(p.eyes, 'scleraColor').name('흰자 색').onChange(textureChanged);
  eyes.add(p.eyes, 'roughness', 0, 1, 0.01).name('거칠기').onChange(eyesChanged);
  eyes.add(p.eyes, 'clearcoat', 0, 1, 0.01).name('클리어코트').onChange(eyesChanged);
  eyes.add(p.eyes, 'clearcoatRoughness', 0, 0.5, 0.01).name('코트 거칠기').onChange(eyesChanged);

  const lids = folder.addFolder('눈꺼풀');
  const lidsChanged = changed(() => parts.applyEyelids());
  const motionChanged = changed(() => {});
  lids.add(p.eyelids, 'visible').name('표시').onChange(lidsChanged);
  lids.add(p.eyelids, 'gap', 0, 0.2, 0.005).name('눈알과의 간격').onChange(lidsChanged);
  lids.add(p.eyelids, 'width', 0.8, 1.6, 0.01).name('가로 배율').onChange(lidsChanged);
  lids.add(p.eyelids, 'upperRest', -0.5, 1.3, 0.01).name('위꺼풀 기본').onChange(motionChanged);
  lids.add(p.eyelids, 'upperWide', 0.5, 1.6, 0.01).name('위꺼풀 eyeWide').onChange(motionChanged);
  lids.add(p.eyelids, 'squintUpperDrop', 0, 0.8, 0.01).name('squint 때 위꺼풀 내림').onChange(motionChanged);
  lids.add(p.eyelids, 'lowerRest', -1.6, 0, 0.01).name('아래꺼풀 기본').onChange(motionChanged);
  lids.add(p.eyelids, 'lowerSquint', -1.2, 0.5, 0.01).name('아래꺼풀 eyeSquint').onChange(motionChanged);
  lids.add(p.eyelids, 'blinkLowerRise', 0, 0.8, 0.01).name('blink 때 아래꺼풀 올림').onChange(motionChanged);
  lids.add(p.eyelids, 'overlap', 0, 0.3, 0.01).name('감을 때 겹침').onChange(motionChanged);
  lids.add(p.eyelids, 'followGaze', 0, 1, 0.01).name('시선 따라가기').onChange(motionChanged);
  lids.addColor(p.eyelids, 'lashColor').name('속눈썹 선 색').onChange(lidsChanged);
  lids.add(p.eyelids, 'lashWidth', 0, 20, 0.5).name('속눈썹 선 폭(°)').onChange(lidsChanged);
  lids.add(p.eyelids, 'brightness', 0.6, 1.4, 0.01).name('피부색 밝기').onChange(lidsChanged);
  lids.add(p.eyelids, 'roughness', 0, 1, 0.01).name('거칠기').onChange(lidsChanged);
  const samples = { colors: parts.skinSamples.join(' ') };
  lids.add(samples, 'colors').name('샘플 색 L위·L아래·R위·R아래').disable();

  const gazeFolder = folder.addFolder('시선');
  const lookManual = () => {
    if (!gaze.followPointer) parts.lookAt(gaze.x, gaze.y);
  };
  gazeFolder.add(gaze, 'followPointer').name('마우스 따라가기').onChange(lookManual);
  gazeFolder.add(gaze, 'x', -1, 1, 0.01).name('좌우 (수동)').onChange(lookManual);
  gazeFolder.add(gaze, 'y', -1, 1, 0.01).name('상하 (수동)').onChange(lookManual);

  const mouth = folder.addFolder('입 속');
  const mouthChanged = changed(() => parts.applyMouth());
  mouth.add(p.mouth, 'visible').name('표시').onChange(mouthChanged);
  mouth.add(p.mouth, 'ahead', -0.3, 0.1, 0.005).name('입술 선보다 앞으로').onChange(mouthChanged);
  mouth.add(p.mouth, 'width', 0.3, 1, 0.01).name('입꼬리 쪽 범위').onChange(mouthChanged);
  mouth.add(p.mouth, 'height', 0.05, 0.8, 0.01).name('높이').onChange(mouthChanged);
  mouth.add(p.mouth, 'depth', 0.05, 1, 0.01).name('깊이').onChange(mouthChanged);
  mouth.add(p.mouth, 'offsetY', -0.3, 0.3, 0.005).name('위로').onChange(mouthChanged);
  mouth.addColor(p.mouth, 'color').name('색').onChange(mouthChanged);

  const gap = folder.addFolder('입술 틈');
  const stats = { removed: '' };
  const gapChanged = changed(() => {
    parts.lipGap.apply(p.lipGap);
    stats.removed = `${parts.lipGap.removed}개`;
    removedCtrl.updateDisplay();
  });
  gap.add(p.lipGap, 'enabled').name('켜기').onChange(gapChanged);
  gap.add(p.lipGap, 'thickness', 0, 0.3, 0.005).name('띠 두께').onChange(gapChanged);
  gap.add(p.lipGap, 'width', 0.2, 1, 0.01).name('입꼬리 쪽 범위').onChange(gapChanged);
  gap.add(p.lipGap, 'taper', 0, 1, 0.01).name('끝으로 갈수록 얇게').onChange(gapChanged);
  gap.add(p.lipGap, 'depthFront', 0, 0.3, 0.005).name('깊이 창 (앞)').onChange(gapChanged);
  gap.add(p.lipGap, 'depthBack', 0, 0.5, 0.005).name('깊이 창 (뒤)').onChange(gapChanged);
  gap.add(p.lipGap, 'minFacing', -1, 1, 0.01).name('앞 향함 최소값').onChange(gapChanged);
  stats.removed = `${parts.lipGap.removed}개`;
  const removedCtrl = gap.add(stats, 'removed').name('지운 삼각형').disable();

  folder.add({ show: () => box.show(`faceParts.${modelKey}.json`, json()) }, 'show').name('조정값 JSON 보기');
}
