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

`?debug`를 붙이면 모프 슬라이더 패널(lil-gui)과 FPS 표시가 나옵니다.

훈장님 두 모델 모두 삼각형 약 5만, 텍스처 2048px WebP(원본 4096px PNG에서 축소).

## 구조

| 파일 | 역할 |
| --- | --- |
| `src/config.ts` | 모델 목록·스프링 ω·조명 등 모든 수치 |
| `src/ExpressionEngine.ts` | ARKit 이름 → 모델 모프 별칭, 임계 감쇠 스프링, 기본 가중치 |
| `src/loadModel.ts` | GLTFLoader + KTX2Loader(`public/libs/basis/`) + MeshoptDecoder |
| `src/stage.ts` | 렌더러·조명·카메라·OrbitControls |
| `src/debugPanel.ts` | `?debug` 패널과 FPS |

## 개발

```bash
npm install
npm run dev
```

작업 지시문: [docs/claude-code-prompt.md](docs/claude-code-prompt.md)
