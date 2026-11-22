// ?landmarks mode: click the face to record each landmark, then copy the JSON.
import * as THREE from 'three';
import { LANDMARKS_VIEW } from './config';
import type { Stage } from './stage';
import type { LandmarkMarkers } from './LandmarkMarkers';
import {
  LANDMARK_HINTS,
  LANDMARK_NAMES,
  type LandmarkName,
  type LandmarkPoints,
  type Vec3,
  eyeDistance,
  isComplete,
  savedLandmarks,
  sideOf,
  toLandmarkJson,
} from './landmarks';

function loadDraft(modelKey: string): LandmarkPoints | null {
  try {
    const raw = localStorage.getItem(LANDMARKS_VIEW.draftKey + modelKey);
    return raw ? (JSON.parse(raw) as LandmarkPoints) : null;
  } catch {
    return null;
  }
}

function saveDraft(modelKey: string, points: LandmarkPoints | null): void {
  try {
    const key = LANDMARKS_VIEW.draftKey + modelKey;
    if (points) localStorage.setItem(key, JSON.stringify(points));
    else localStorage.removeItem(key);
  } catch {
    // Storage blocked (private mode etc.): the tool still works, it just won't survive a reload.
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

export function createLandmarkTool(
  stage: Stage,
  root: THREE.Object3D,
  pickMeshes: THREE.Object3D[],
  markers: LandmarkMarkers,
  modelKey: string,
  markerRadius: number,
): void {
  const saved = savedLandmarks(modelKey);
  const draft = loadDraft(modelKey);
  let points: LandmarkPoints = draft ?? (saved ? { ...saved.points } : {});
  let sourceText = draft
    ? '이 브라우저에 남아 있던 작업을 이어서 하는 중'
    : saved
      ? '저장된 파일(src/data)에서 불러옴'
      : '새로 찍는 중';
  let current: LandmarkName = LANDMARK_NAMES.find((n) => !points[n]) ?? LANDMARK_NAMES[0];

  // Ghost marker that follows the cursor over the face.
  const ghost = new THREE.Mesh(
    new THREE.SphereGeometry(markerRadius, 16, 12),
    new THREE.MeshBasicMaterial({ color: LANDMARKS_VIEW.colors.ghost, transparent: true, opacity: 0.7 }),
  );
  ghost.visible = false;
  root.add(ghost);

  // ---- panel ----
  const panel = el('div', 'lm-panel');
  const title = el('div', 'lm-title', `기준점 찍기 · ${modelKey}`);
  const source = el('div', 'lm-source');
  const step = el('div', 'lm-step');
  const hint = el('div', 'lm-hint');
  const warn = el('div', 'lm-warn');
  const buttons = el('div', 'lm-buttons');
  const list = el('ol', 'lm-list');
  const output = el('div', 'lm-output');
  panel.append(title, source, step, hint, warn, buttons, list, output);
  document.body.appendChild(panel);

  function button(label: string, onClick: () => void, parent: HTMLElement = buttons) {
    const b = el('button', '', label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    parent.appendChild(b);
    return b;
  }

  button('다시 찍기', () => {
    points[current] = undefined;
    commit();
  });
  button('◀ 이전', () => select(LANDMARK_NAMES[Math.max(0, LANDMARK_NAMES.indexOf(current) - 1)]));
  button('다음 ▶', () =>
    select(LANDMARK_NAMES[Math.min(LANDMARK_NAMES.length - 1, LANDMARK_NAMES.indexOf(current) + 1)]),
  );
  const views = el('div', 'lm-buttons');
  panel.insertBefore(views, list);
  button('정면', () => stage.setAzimuth(0), views);
  button('캐릭터 왼쪽 옆', () => stage.setAzimuth(LANDMARKS_VIEW.sideViewAngle), views);
  button('캐릭터 오른쪽 옆', () => stage.setAzimuth(-LANDMARKS_VIEW.sideViewAngle), views);
  const resets = el('div', 'lm-buttons');
  panel.insertBefore(resets, list);
  button('모두 지우기', () => {
    if (!confirm('찍은 기준점을 모두 지울까요?')) return;
    points = {};
    current = LANDMARK_NAMES[0];
    sourceText = '새로 찍는 중';
    commit();
  }, resets);
  if (saved) {
    button('저장된 파일 값으로', () => {
      points = { ...saved.points };
      sourceText = '저장된 파일(src/data)에서 불러옴';
      commit();
    }, resets);
  }
  const labelToggle = el('label', 'lm-toggle');
  const labelBox = el('input');
  labelBox.type = 'checkbox';
  labelBox.checked = true;
  labelBox.addEventListener('change', () => markers.setLabelsVisible(labelBox.checked));
  labelToggle.append(labelBox, ' 이름 표시');
  resets.appendChild(labelToggle);

  const items = new Map<LandmarkName, HTMLLIElement>();
  for (const name of LANDMARK_NAMES) {
    const li = el('li');
    li.addEventListener('click', () => select(name));
    list.appendChild(li);
    items.set(name, li);
  }

  const textarea = el('textarea');
  textarea.readOnly = true;
  textarea.rows = 10;
  const copyRow = el('div', 'lm-buttons');
  const copyBtn = button('JSON 복사', async () => {
    textarea.select();
    try {
      await navigator.clipboard.writeText(textarea.value);
      copyBtn.textContent = '복사했어요 ✓';
    } catch {
      document.execCommand('copy');
      copyBtn.textContent = '선택됨 · Ctrl/⌘+C';
    }
    setTimeout(() => (copyBtn.textContent = 'JSON 복사'), 1800);
  }, copyRow);
  output.append(el('div', 'lm-output-title', '다 찍었어요. 이 JSON을 대화창에 붙여 주세요.'), textarea, copyRow);

  function select(name: LandmarkName) {
    current = name;
    render();
  }

  function commit() {
    markers.setAll(points);
    saveDraft(modelKey, points);
    render();
  }

  function sideWarning(): string {
    const issues: string[] = [];
    for (const name of LANDMARK_NAMES) {
      const p = points[name];
      const side = sideOf(name);
      if (!p || !side) continue;
      if ((side === 'L' && p[0] < 0) || (side === 'R' && p[0] > 0)) issues.push(name);
    }
    return issues.length
      ? `좌우가 바뀐 것 같아요: ${issues.join(', ')} — _L은 화면 오른쪽(+X), _R은 화면 왼쪽이에요.`
      : '';
  }

  function render() {
    const done = LANDMARK_NAMES.filter((n) => points[n]).length;
    source.textContent = sourceText;
    step.textContent = `${LANDMARK_NAMES.indexOf(current) + 1}/${LANDMARK_NAMES.length} · ${current}${points[current] ? ' (찍음 · 다시 클릭하면 바뀜)' : ''}`;
    hint.textContent = LANDMARK_HINTS[current];
    warn.textContent = sideWarning();
    for (const [name, li] of items) {
      li.textContent = `${name}${points[name] ? ' ✓' : ''}`;
      li.classList.toggle('active', name === current);
      li.classList.toggle('done', !!points[name]);
    }
    markers.setActive(current);
    const complete = isComplete(points);
    output.style.display = complete ? '' : 'none';
    if (isComplete(points)) textarea.value = toLandmarkJson(modelKey, points);
    title.textContent = `기준점 찍기 · ${modelKey} · ${done}/${LANDMARK_NAMES.length}`;
    const d = eyeDistance(points);
    if (d) title.textContent += ` · eyeDist ${d.toFixed(4)}`;
  }

  // ---- picking ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const canvas = stage.renderer.domElement;

  function hit(ev: PointerEvent): THREE.Vector3 | null {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, stage.camera);
    const h = raycaster.intersectObjects(pickMeshes, false)[0];
    return h ? root.worldToLocal(h.point.clone()) : null;
  }

  let down: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (ev) => {
    down = { x: ev.clientX, y: ev.clientY };
  });
  canvas.addEventListener('pointerup', (ev) => {
    if (!down) return;
    const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
    down = null;
    if (moved > LANDMARKS_VIEW.clickTolerancePx || ev.button !== 0) return;
    const p = hit(ev);
    if (!p) return;
    points[current] = p.toArray() as Vec3;
    // Advance to the next unpicked landmark (wrapping), or stay if all are done.
    const i = LANDMARK_NAMES.indexOf(current);
    const next = [...LANDMARK_NAMES.slice(i + 1), ...LANDMARK_NAMES.slice(0, i)].find((n) => !points[n]);
    if (next) current = next;
    commit();
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse' || ev.buttons) {
      ghost.visible = false;
      return;
    }
    const p = hit(ev);
    ghost.visible = !!p;
    if (p) ghost.position.copy(p);
  });
  canvas.addEventListener('pointerleave', () => (ghost.visible = false));

  markers.setAll(points);
  render();
}
