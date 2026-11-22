# 작업: "존댓말 훈장님" 3D 얼굴 표정 엔진 (Blender 없이, 클라우드 작업)

## 배경
- 메시지를 입력하는 동안 Jev(TypeSafe AI)가 공손함을 판정하고, 3D 훈장님 얼굴이 표정으로 반응하는 웹 서비스다.
- 얼굴 모델 2개(둘 다 Hunyuan 3D로 생성, 셰이프키 없음, 눈은 텍스처에 칠해져 있고 입술은 붙어 있음)
  - public/models/hunjang.glb: 귀여운 버전(기본). 삼각형 약 5만, 정점 약 3.2만, 텍스처 2048px WebP
  - public/models/hunjang-real.glb: 실사 버전(비교용). 같은 규격
  - 두 모델 모두 정면이 +Z, 위가 +Y, 바닥이 y=0이다.
- Blender는 쓰지 않는다. 눈알·입 속·표정(모프 타깃)을 전부 코드로 만든다.
- 스택: Vite + TypeScript + three.js 0.187, lil-gui.

## 작업 환경 (중요)
- 너는 클라우드 세션에서 일한다. 나는 로컬 개발 서버를 볼 수 없고, 이 저장소가 연결된 Vercel 미리보기 주소로만 결과를 확인한다.
- 그래서 단계마다: npm run build 통과 확인 → 커밋 → 푸시 → 미리보기에서 무엇을 어떻게 확인할지(눌러볼 것, 기대 결과)를 적고 멈춘다.
- 브라우저에서 만드는 데이터(기준점, 조정값)는 파일 다운로드가 아니라 화면의 텍스트 상자 + 복사 버튼으로 보여준다. 내가 그 JSON을 대화창에 붙여넣으면 너는 src/data/에 저장해 커밋한다.
- 디버그 패널(lil-gui)은 주소에 ?debug가 있을 때만 보인다.
- 외부 파일 다운로드가 막히면 우회하지 말고 나에게 어떤 파일을 어디에 올려야 하는지 알려준다.
- 모든 기능은 두 모델에서 똑같이 동작해야 한다. 모델별 데이터는 파일 이름에 모델 키를 붙인다(예: src/data/landmarks.hunjang.json, src/data/landmarks.hunjang-real.json).

## 단계 0 — 프로젝트 준비 (완료)
- src/main.ts에 모델 뷰어가 있다. ?model=hunjang | hunjang-real 로 바꾸고, OrbitControls, 환경광(RoomEnvironment) + 주광 + 윤곽광이 들어 있다.
- 이 뷰어를 출발점으로 구조를 정리해서 이어간다.

## 단계 A — 표정 엔진 뼈대 (개발용 얼굴)
- three.js 저장소의 examples/models/gltf/facecap.glb를 public/models/에 넣고, 예제 webgl_morphtargets_face와 같은 방식(KTX2Loader + MeshoptDecoder, 디코더 파일도 public에 포함)으로 ?model=facecap에서 띄운다.
- ExpressionEngine 클래스
  - setTarget(name, value): ARKit 이름 기준 목표값
  - 별칭 층: 모델에 좌우 합친 키(예: browDown)만 있으면 browDownLeft/Right 요청을 그 키로 보낸다. 좌우 키만 있으면 합친 요청을 둘 다에 보낸다
  - 매 프레임 임계 감쇠 스프링(ω 약 14, config)으로 현재값이 목표값을 따라가게 해 morphTargetInfluences에 넣는다
  - 기본 가중치(base weights) 지원
- ?debug에서 모프 슬라이더 패널과 FPS 표시
완료 기준: 미리보기에서 슬라이더를 움직이면 얼굴이 부드럽게 따라온다.

## 단계 B — 기준점 찍기 도구
- ?landmarks 모드: 아래 이름을 하나씩 안내하고, 얼굴을 클릭하면 레이캐스트 지점을 모델 로컬 좌표로 기록하고 작은 구로 표시한다. 다시 찍기와 시점 회전 가능. 다 찍으면 landmarks JSON을 텍스트 상자와 복사 버튼으로 보여준다.
- 기준점 17개(좌우는 캐릭터 기준): browInner_L/R, browOuter_L/R, eye_L/R(칠해진 눈 중심), cheek_L/R, noseTip, mouthCorner_L/R, upperLip, lowerLip, chin, jawPivot_L/R(귀 아래 턱 회전축), collarFront(도포 깃 앞 중앙)
- 내가 붙여넣은 JSON을 src/data/landmarks.<모델키>.json으로 저장한다. 모든 반경·이동량은 두 눈 사이 거리(eyeDist)를 단위로 쓴다.
완료 기준: 저장된 기준점이 미리보기에서 얼굴 위에 표시된다.

## 단계 C — 코드로 얼굴 부품 만들기
- 눈알: eye_L/R 위치에 구 2개. 반지름 기본 0.22×eyeDist, 깊이 오프셋은 슬라이더. 흰자·짙은 갈색 홍채·검은 동공을 캔버스 텍스처로 그리고 MeshPhysicalMaterial(clearcoat)로 광택을 준다. 머리 그룹의 자식으로 붙이고 lookAt(x, y)로 ±20도까지 회전한다.
- 입 속: upperLip·lowerLip 중간, 표면 뒤쪽에 어두운 붉은색 반구.
- 입술 틈: 입꼬리 사이 x 범위에서, 윗입술·아랫입술 중간선 근처 얇은 띠 안에 중심이 있고 앞쪽을 향하는 삼각형을 지워 틈을 만든다. 띠 두께는 슬라이더.
완료 기준: 눈알이 마우스를 따라 시선을 옮기고, 입술 사이에 어두운 틈이 보인다.

## 단계 D — 모프 타깃 생성
- 로드할 때 geometry.morphAttributes.position에 아래 10개를 계산해 넣고, morphTargetDictionary에 ARKit 이름으로 등록한다.
- 방식: 타깃마다 핸들 목록 {기준점, 반경, 이동 벡터}. 정점 이동 = Σ smoothstep 감쇠 가중치 × 이동 벡터. jawOpen은 jawPivot_L→R 축 회전으로 만들고 아랫입술 아래 정점에만 감쇠 가중치를 준다.
- collarFront보다 아래·뒤의 정점(도포·어깨)은 모든 타깃에서 이동 0. 수염은 턱을 따라간다.
- UV 이음새 때문에 같은 위치에 정점이 여러 개 있다. 위치로 계산하므로 같은 이동을 받게 된다(확인만).
- 1차 10개: browDown, browInnerUp, browOuterUpLeft, eyeWide, eyeSquint, jawOpen, mouthFrown, mouthSmile, mouthPress, noseSneer
- ?debug에서 타깃별 반경·세기를 조절하고, 조정값을 morphConfig JSON으로 텍스트 상자 + 복사 버튼에 보여준다. 내가 붙여넣으면 src/data/morphConfig.<모델키>.json으로 커밋해 기본값으로 쓴다.
- 변형 후 법선도 모프 법선으로 계산한다(어려우면 TODO로 남긴다).
완료 기준: 두 모델 모두 10개 슬라이더가 각각 의도한 표정으로 보이고, 도포는 움직이지 않는다.

## 단계 E — 판정 신호 → 표정 매핑 (Jev 연결 전)
- 신호: politeness(0~4), confidence(0~1), banmal, frivolous, flattery, wrongHonorific, apjonbeop(각 0~1)
- 아래 매핑을 config로 옮긴다. 같은 모프는 합산 후 0~1로 자른다. 머리 회전과 눈알 시선도 포함한다.
  - politeness 높음: mouthSmile 0.3, 천천히 끄덕
  - politeness 낮음: browDown ~0.9, noseSneer ~0.5, mouthFrown ~0.7, 고개 숙이고 치켜뜸
  - banmal: 경악(eyeWide 1, browInnerUp 0.8, jawOpen 0.4, 고개 뒤로) 0.4초 후 노기로 전환
  - frivolous: browOuterUpLeft ∝ 값, 고개 살짝 기울임
  - flattery: eyeSquint 0.6, 고개 뒤로 빼고 곁눈질
  - wrongHonorific: browInnerUp 0.5, 고개 10도 기울임
  - apjonbeop: 헛기침(짧게 눈 감기) 후 고개 가로젓기
  - confidence 낮음: eyeSquint 0.4, 고개를 앞으로
  - 입력 중(판정 전): 눈알 시선 아래로
- ?debug에 신호 슬라이더 패널을 두고 Jev 없이 테스트한다. 항상 도는 대기 모션(숨쉬기, 가끔 eyeSquint로 깜빡임 대신)도 넣는다.
완료 기준: 미리보기에서 신호 슬라이더만으로 위 반응이 모두 재현된다.

## 범위 밖
- Jev API 호출·서버 프록시, 호통 대사, 프로덕션 배포

## 작업 방식
- 단계마다 푸시하고 확인 방법을 적은 뒤 멈춘다. 내가 확인하면 다음 단계로 넘어간다.
- 수치는 전부 config로 빼서 코드 수정 없이 튜닝할 수 있게 한다.
