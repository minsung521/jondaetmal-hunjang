// Facial landmarks: names, picking hints, saved data per model.
//
// Coordinates are in the model root's space (the glTF scene): +Y up, +Z toward the viewer,
// y = 0 at the bottom. Left/right are the character's own, so *_L sits at +X
// (on the viewer's right when looking at the face from the front).

import { modelData } from './modelData';

export const LANDMARK_NAMES = [
  'browInner_L',
  'browInner_R',
  'browOuter_L',
  'browOuter_R',
  'eye_L',
  'eye_R',
  'cheek_L',
  'cheek_R',
  'noseTip',
  'mouthCorner_L',
  'mouthCorner_R',
  'upperLip',
  'lowerLip',
  'chin',
  'jawPivot_L',
  'jawPivot_R',
  'collarFront',
] as const;

export type LandmarkName = (typeof LANDMARK_NAMES)[number];
export type Vec3 = [number, number, number];
export type LandmarkPoints = Partial<Record<LandmarkName, Vec3>>;

export interface LandmarkFile {
  model: string;
  space: string;
  /** Distance between eye_L and eye_R; the unit for every radius and offset. */
  eyeDist: number;
  points: Record<LandmarkName, Vec3>;
}

export const SPACE_NOTE = 'model root: +Y up, +Z front, y=0 bottom; character left (_L) = +X';

const SIDE_NOTE_L = '캐릭터 기준 왼쪽 = 화면에서 오른쪽';
const SIDE_NOTE_R = '캐릭터 기준 오른쪽 = 화면에서 왼쪽';

export const LANDMARK_HINTS: Record<LandmarkName, string> = {
  browInner_L: `왼쪽 눈썹의 안쪽 끝(미간 쪽). ${SIDE_NOTE_L}`,
  browInner_R: `오른쪽 눈썹의 안쪽 끝(미간 쪽). ${SIDE_NOTE_R}`,
  browOuter_L: `왼쪽 눈썹의 바깥쪽 끝(관자놀이 쪽). ${SIDE_NOTE_L}`,
  browOuter_R: `오른쪽 눈썹의 바깥쪽 끝(관자놀이 쪽). ${SIDE_NOTE_R}`,
  eye_L: `텍스처에 칠해진 왼쪽 눈의 중심(눈동자 가운데). ${SIDE_NOTE_L}`,
  eye_R: `텍스처에 칠해진 오른쪽 눈의 중심(눈동자 가운데). ${SIDE_NOTE_R}`,
  cheek_L: `왼쪽 광대(볼에서 가장 도톰한 곳). ${SIDE_NOTE_L}`,
  cheek_R: `오른쪽 광대(볼에서 가장 도톰한 곳). ${SIDE_NOTE_R}`,
  noseTip: '코끝(가장 앞으로 나온 곳).',
  mouthCorner_L: `왼쪽 입꼬리. ${SIDE_NOTE_L}`,
  mouthCorner_R: `오른쪽 입꼬리. ${SIDE_NOTE_R}`,
  upperLip: '윗입술 가운데, 입술이 맞닿는 선 바로 위.',
  lowerLip: '아랫입술 가운데, 입술이 맞닿는 선 바로 아래.',
  chin: '턱끝. 수염이 덮고 있으면 턱끝이 있을 만한 수염 표면.',
  jawPivot_L: `왼쪽 귀 바로 아래, 턱이 꺾이는 곳. 옆모습으로 돌려서 찍으세요. ${SIDE_NOTE_L}`,
  jawPivot_R: `오른쪽 귀 바로 아래, 턱이 꺾이는 곳. 옆모습으로 돌려서 찍으세요. ${SIDE_NOTE_R}`,
  collarFront: '도포 깃이 앞에서 만나는 가운데.',
};

export function sideOf(name: LandmarkName): 'L' | 'R' | null {
  return name.endsWith('_L') ? 'L' : name.endsWith('_R') ? 'R' : null;
}

/** Saved file src/data/landmarks.<modelKey>.json, or null. */
export function savedLandmarks(modelKey: string): LandmarkFile | null {
  return modelData<LandmarkFile>('landmarks', modelKey);
}

export function isComplete(points: LandmarkPoints): points is Record<LandmarkName, Vec3> {
  return LANDMARK_NAMES.every((n) => points[n]);
}

export function eyeDistance(points: LandmarkPoints): number | null {
  const a = points.eye_L;
  const b = points.eye_R;
  return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : null;
}

function round(v: number): number {
  return Math.round(v * 1e5) / 1e5;
}

/** Pretty JSON with one landmark per line. */
export function toLandmarkJson(modelKey: string, points: Record<LandmarkName, Vec3>): string {
  const lines = LANDMARK_NAMES.map(
    (n, i) =>
      `    "${n}": [${points[n].map(round).join(', ')}]${i < LANDMARK_NAMES.length - 1 ? ',' : ''}`,
  );
  return [
    '{',
    `  "model": ${JSON.stringify(modelKey)},`,
    `  "space": ${JSON.stringify(SPACE_NOTE)},`,
    `  "eyeDist": ${round(eyeDistance(points)!)},`,
    '  "points": {',
    ...lines,
    '  }',
    '}',
  ].join('\n');
}
