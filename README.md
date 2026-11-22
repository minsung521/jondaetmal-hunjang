# 존댓말 훈장님

메시지를 쓰는 동안 공손함을 실시간으로 판정해, 3D 훈장님이 표정으로 반응하는 웹 토이프로젝트.

- 판정: Jev (TypeSafe AI)
- 얼굴: Hunyuan 3D로 만든 GLB + 코드로 만든 눈알·입 속·모프 타깃
- 화면: Vite + TypeScript + three.js

## 모델

| 주소 | 파일 | 설명 |
| --- | --- | --- |
| `?model=hunjang` | `public/models/hunjang.glb` | 귀여운 버전(기본) |
| `?model=hunjang-real` | `public/models/hunjang-real.glb` | 실사 버전(비교용) |
| `?model=facecap` | `public/models/facecap.glb` | 개발용 얼굴(three.js 예제, ARKit 모프 52개) |

| 주소 옵션 | 내용 |
| --- | --- |
| `?debug` | 모프 슬라이더·스프링(ω, 감쇠비) 패널(lil-gui), FPS, 저장된 기준점 표시 |
| `?landmarks` | 기준점 17개 찍기 도구. 다 찍으면 JSON 텍스트 상자 + 복사 버튼 |

훈장님 두 모델 모두 삼각형 약 5만, 텍스처 2048px WebP(원본 4096px PNG에서 축소).

## 구조

| 파일 | 역할 |
| --- | --- |
| `src/config.ts` | 모델 목록·스프링 ω·조명 등 모든 수치 |
| `src/ExpressionEngine.ts` | ARKit 이름 → 모델 모프 별칭, 감쇠 스프링(채널별 감쇠비), 기본 가중치 |
| `src/landmarks.ts` | 기준점 이름·안내 문구·저장 파일 읽기·JSON 만들기 |
| `src/landmarkTool.ts` | `?landmarks` 찍기 도구 |
| `src/LandmarkMarkers.ts` | 기준점 구 + 이름표(가려진 이름표는 흐리게) |
| `src/data/` | 붙여넣은 JSON(`landmarks.<모델키>.json` 등) |
| `src/loadModel.ts` | GLTFLoader + KTX2Loader(`public/libs/basis/`) + MeshoptDecoder |
| `src/stage.ts` | 렌더러·조명·카메라·OrbitControls |
| `src/debugPanel.ts` | `?debug` 패널과 FPS |

## 설계 메모

- `ExpressionEngine.setTarget`은 채널마다 마지막 값이 이긴다. 여러 신호가 같은 모프를 건드리면
  (단계 E 신호 매핑) 매핑 층에서 먼저 합산·0~1 자르기를 한 뒤 모프마다 한 번만 `setTarget`을 부른다.
- 스프링 감쇠비 ζ: 1이면 임계 감쇠(넘치지 않음), 1보다 작으면 살짝 넘었다 돌아온다.
  `setTarget(name, v, { dampingRatio })`로 채널별로 바꿀 수 있다(다시 바꾸기 전까지 유지, `null`이면 전역값).
- 단계 D 고정 영역(도포·어깨): 수염 끝이 collarFront 높이 근처까지 내려오므로 높이만으로 자르지 않는다.
  collarFront보다 아래이면서 수염보다 뒤쪽(z가 작은 쪽)인 정점만 고정하고, 수염은 끝까지 턱(jawOpen)을 따라간다.

## 개발

```bash
npm install
npm run dev
```

작업 지시문: [docs/claude-code-prompt.md](docs/claude-code-prompt.md)
