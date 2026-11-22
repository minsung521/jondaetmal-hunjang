# src/data

브라우저 도구에서 만든 JSON을 붙여넣어 커밋하는 곳. 파일 이름 끝에 모델 키를 붙인다.

| 파일 | 만드는 곳 |
| --- | --- |
| `landmarks.<모델키>.json` | `?landmarks` 기준점 찍기 도구 |
| `faceParts.<모델키>.json` | 단계 C `?debug` → 얼굴 부품 → 조정값 JSON 보기 |
| `morphConfig.<모델키>.json` | 단계 D `?debug` → 모프 생성 → 조정값 JSON 보기 (타깃별 세기·반경, jawOpen 설정) |

좌표는 모델 루트 공간(+Y 위, +Z 정면, 바닥 y=0, 캐릭터 왼쪽 `_L` = +X)이고,
반경·이동량은 두 눈 사이 거리(`eyeDist`)를 단위로 쓴다.
