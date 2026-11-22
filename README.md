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
| `?debug` | 모프 슬라이더·스프링(ω, 감쇠비), 얼굴 부품 조정(+ JSON 복사), FPS, 저장된 기준점 표시 |
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
| `src/face/FaceParts.ts` | 머리 그룹(피벗 = jawPivot 중점) + 눈알·입 속·입술 틈, 시선(lookAt) |
| `src/face/eyeTexture.ts` | 눈알 캔버스 텍스처(흰자·홍채·동공) |
| `src/face/mouthInterior.ts` | 입술 선을 따라 휜 입 속(안쪽 면만 그림) |
| `src/face/lipGap.ts` | 입술 선 근처 얇은 띠의 삼각형을 지워 틈 만들기 |
| `src/debugFaceParts.ts`, `src/jsonBox.ts` | 얼굴 부품 디버그 폴더, JSON 텍스트 상자 + 복사 |
| `src/modelData.ts` | `src/data/<종류>.<모델키>.json` 읽기, 기본값과 합치기 |
| `src/data/` | 붙여넣은 JSON(`landmarks.<모델키>.json`, `faceParts.<모델키>.json` 등) |
| `src/loadModel.ts` | GLTFLoader + KTX2Loader(`public/libs/basis/`) + MeshoptDecoder |
| `src/stage.ts` | 렌더러·조명·카메라·OrbitControls |
| `src/debugPanel.ts` | `?debug` 패널과 FPS |

## 설계 메모

- `ExpressionEngine.setTarget`은 채널마다 마지막 값이 이긴다. 여러 신호가 같은 모프를 건드리면
  (단계 E 신호 매핑) 매핑 층에서 먼저 합산·0~1 자르기를 한 뒤 모프마다 한 번만 `setTarget`을 부른다.
- 스프링 감쇠비 ζ: 1이면 임계 감쇠(넘치지 않음), 1보다 작으면 살짝 넘었다 돌아온다.
  `setTarget(name, v, { dampingRatio })`로 채널별로 바꿀 수 있다(다시 바꾸기 전까지 유지, `null`이면 전역값).
- 얼굴 부품 값의 우선순위: `src/data/faceParts.<모델키>.json` > `config.ts`의 `MODELS[키].faceParts` > `FACE_PARTS`.
- 입 속은 반구 대신 입술 선(입꼬리→입술 중간→입꼬리)을 따라 휜 닫힌 주머니를 안쪽 면만 그린다.
  입술 중앙이 입꼬리보다 0.2~0.3 eyeDist 앞으로 나와 있어, 평평한 반구로는 비스듬히 볼 때 틈 너머 배경이 비쳤다.
  단계 D에서 jawOpen을 만들 때 입 속 아래쪽도 턱을 따라가게 해야 한다.
- 단계 D 고정 영역(도포·어깨): 수염 끝이 collarFront 높이 근처까지 내려오므로 높이만으로 자르지 않는다.
  collarFront보다 아래이면서 수염보다 뒤쪽(z가 작은 쪽)인 정점만 고정하고, 수염은 끝까지 턱(jawOpen)을 따라간다.

## 개발

```bash
npm install
npm run dev
```

작업 지시문: [docs/claude-code-prompt.md](docs/claude-code-prompt.md)
