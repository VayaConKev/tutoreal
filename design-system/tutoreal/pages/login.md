# 로그인 · 출입증 체크인 (페이지 규칙)

- 기준: `style.css` 886행~ (`.pass-*`), `docs/design/tutoreal-login-badge-final.html`, `intent/2026-11-25-login-badge.md`
- 대상: 123~127단계 출입증 화면 (지금은 미리 보기 기기만: 선생님·테스터로 한 번 로그인한 기기). 다른 기기는 예전 '접속 코드' 카드.
- 이 파일이 `MASTER.md`보다 앞선다. 여기 없는 것은 MASTER를 따른다.

---

## 1. 바뀌지 않는 규칙

1. **출입증 안은 테마와 상관없이 늘 라이트 색**(`--badge-*`). 다크 모드는 출입증 바깥(`--pass-*`와 앱 변수)만 바뀐다.
2. **출입증 높이는 모든 상태에서 같다**: `.pass` 420px 고정, 안내 문구 자리 `.pass-msg` 44px 늘 확보, 테두리 늘 2px (상태는 색만 바꾼다).
3. 띠 문구는 영어 고정폭: `TUTOREAL PASS` / `CHECKED IN` / `CHECK-IN FAILED` / `PLEASE WAIT`.
4. 성공 상태에서 체크박스·'다른 코드로 체크인'은 `visibility: hidden`으로 숨기기만 한다 (버튼 자리 그대로).
5. 성공 화면은 **3초** 뒤 홈으로 (`PASS_HOME_MS`, v1.34. 디자인 파일의 1초에서 바뀜). '바로 시작하기'는 바로.
6. '움직임 줄이기'에서는 찍힘·흔들림을 끈다.

## 2. 색

### 2-1. 출입증 안 (고정, `.pass-screen`에 정의)

| 변수 | 값 | 쓰는 곳 |
|---|---|---|
| `--badge-card` | `#FFFFFF` | 출입증 바탕 |
| `--badge-line` | `#E2E5EA` | 기본 테두리, 구분선, 빈 출석 점선 |
| `--badge-text` | `#1F2937` | 이름, 입력 글자, NEXT CLASS 제목 |
| `--badge-muted` | `#5B6472` | 소속, 역할, 안내, 요일 |
| `--badge-input` | `#F3F4F6` | 입력칸 바탕 |
| `--badge-placeholder` | `#8A93A0` | 입력칸 안내 글 |
| `--badge-soft` | `#E4F0EF` | 사진 자리, NEXT CLASS 카드 |
| `--badge-soft-ink` | `#256B69` | 연청록 위 글자 (이니셜, NEXT CLASS, D-day) |
| `--badge-pass` | `#2F7A78` | 기본 띠, 출석 도장 |
| `--badge-success` | `#1A7A50` | 성공 띠, 사진 위 ✓ |
| `--badge-danger` | `#C43D3D` | 오류 띠·테두리·입력 테두리 (앱 `--danger` 라이트와 같음) |
| `--badge-danger-soft` | `#FDF1F1` | 오류 입력칸 바탕 |
| `--badge-danger-text` | `#B42318` | 오류 문구 |
| `--badge-warn` | `#9A5B00` | 지연 띠·테두리 (앱 `--notice` 라이트와 같음) |
| `--badge-warn-text` | `#7A4300` | 지연 문구 |
| `--badge-brand` | `#15336E` | 아래 로고 'Tuto', 입력칸 포커스 테두리 |
| `--badge-brand-accent` | `#2F7A78` | 아래 로고 'real' |

띠 글자는 늘 흰색(`#FFFFFF`): 기본 5.0:1 · 성공 5.3:1 · 오류 5.1:1 · 지연 5.4:1.

### 2-2. 출입증 바깥 (`--pass-*` + 앱 변수)

| 자리 | 라이트 | 다크 |
|---|---|---|
| 화면 바탕 · 띠 구멍 | `--bg` #F3F6F8 | `--bg` #0B141D |
| 제목 `--pass-heading` | `#15336E` | `--text` #E5EDF2 |
| 부제 · 체크박스 글 · 다른 코드 링크 | `--muted` #5B6B7C | `--muted` #93A7B6 |
| 목걸이 줄 `--pass-strap` | `#15336E` | `#50B3B2` |
| 클립 `--pass-clip` | `#B8C0CC` | `#5B6676` |
| 주 버튼 `--pass-primary` / 글자 | `#15336E` / `#FFFFFF` | `--accent` #50B3B2 / `--on-accent` #04223F |
| 출입증 그림자 `--pass-shadow` | `0 8px 24px rgba(21,51,110,.12)` | `0 8px 24px rgba(0,0,0,.45)` |

디자인 파일과 다른 점 (구현이 앞선다): 바깥 바탕·부제는 디자인 파일의 `--p-bg`·`--p-sub` 대신 앱 변수(`--bg`, `--muted`)를 쓴다. 로고 칩·테마 버튼은 앱 머리줄 그대로.

## 3. 글자

- 고정폭 `--badge-mono`: JetBrains Mono 500·700 (영문만 담은 `fonts/` 파일, 이 화면에서만 받음).
- 고정폭을 쓰는 곳: 띠 문구 13px 700 · 날짜 도장 12px 500 · 소속 11px 500 · `PASS CODE` 12px 700 · 입력 글자 17px · NEXT CLASS 11px 700 · D-day 22px 700 · THIS WEEK 11px 500 · SINCE/No. 10px 500. 글자 간격 1–2px.
- 앱 글꼴: 제목 26px 800 · 부제 15px · 이름 20px 800(길면 …) · 역할 13px · 안내 13px(줄 간격 1.55) · 버튼 17px 800.
- 입력칸 안내 글은 앱 글꼴, 글자 간격 0.

## 4. 구조와 크기

```
머리줄(로고 · 테마)            ← 앱 header
제목 26px / 부제 15px          .pass-head (최소 64px)
목걸이 줄 14×30 + 클립 46×16   .pass-lanyard (장식, aria-hidden)
┌ 출입증 420px, 반경 22px, 테두리 2px ┐
│ 띠: 구멍 52×9 / 상태 · 날짜     │ .pass-band
│ 사진 68×68(반경 18) · 소속/이름/역할 │ .pass-who
│ ─ 구분선                        │
│ 가운데(남는 높이):              │ .pass-middle (입력 묶음과 성공 묶음을 같은 칸에 겹침)
│   PASS CODE / 입력 56px / 안내 44px │
│   또는 NEXT CLASS + THIS WEEK     │
│ ┄ 점선 / Tutoreal / SINCE · No. │ .pass-foot
└─────────────────────────────────┘
체크박스 줄 44px / 주 버튼 56px(반경 16) / 다른 코드 링크 44px   .pass-below
```

- 좌우: 출입증 바깥 여백 12px. 359px 이하에서는 바깥 여백 0, 안쪽 16px.
- 출석 도장: 7칸 그리드, 점 30px, 빈 날은 1.5px 점선 `--badge-line`, 체크한 날 `--badge-pass` + 흰 ✓, 오늘은 요일 글자 굵게.

## 5. 상태 5가지

| 상태 | 클래스 | 띠 (색 · 문구) | 출입증 테두리 | 가운데 | 안내 문구 | 주 버튼 |
|---|---|---|---|---|---|---|
| 1. 첫 방문 | (없음) | `--badge-pass` · TUTOREAL PASS · 날짜 | `--badge-line` | 사람 아이콘, NEW MEMBER, PASS CODE 입력 | ⓘ 코드는 선생님께 받은 그대로 입력해 주세요. (`--badge-muted`) | 체크인 |
| 2. 다시 온 학생 | (없음, 기기에 저장된 출입증 정보) | 1과 같음 | 1과 같음 | 캐릭터 그림(없으면 이니셜), 이름·소속·역할, 입력 | 1과 같음 | 체크인 + '○○ 님이 아닌가요? 다른 코드로 체크인' |
| 3. 체크인 성공 | `.is-success` | `--badge-success` · CHECKED IN · 날짜 · 시각 | 1과 같음 | 사진 위 ✓, NEXT CLASS(챕터·날짜·D-day, 없으면 '곧 올라와요') + THIS WEEK | (숨김) | 바로 시작하기 (3초 뒤 자동 홈) |
| 4. 코드 오류 | `.is-error` | `--badge-danger` · CHECK-IN FAILED | `--badge-danger` | 입력 테두리 `--badge-danger`, 바탕 `--badge-danger-soft`, `aria-invalid` | **확인되지 않은 코드예요.** … (`--badge-danger-text`, `role="alert"`) | 다시 체크인. 출입증 좌우 흔들림 360ms 한 번 |
| 5. 서버 지연 | `.is-slow` | `--badge-warn` · PLEASE WAIT | `--badge-warn` | 코드 유지 | **서버가 잠시 느려요.** 10초 뒤 자동으로 다시 시도할게요. (`--badge-warn-text`, `role="status"`) | 지금 다시 시도 (10초마다 3번 자동) |

- 코드를 고치면 1·2의 모습으로 돌아간다.
- 3의 찍힘 효과 320ms(`.pass.stamp`), 4의 흔들림(`.pass.shake`)은 움직임 줄이기에서 끈다.
- 다크 모드에서도 표의 출입증 안 색은 그대로다. 바뀌는 것은 2-2의 바깥 색뿐.

## 6. 점검 (2026-11-26, 320·375·390 폭, 라이트·다크)

- 가로 넘침 없음. 320 폭에서 오류·지연 문구 두 줄이 44px 자리에 잘리지 않고 들어감.
- 대비: 이름 14.7:1, 보조 글 6.0:1, 오류 문구 6.6:1, 지연 문구 8.0:1, 연청록 위 글자 5.3:1, 바깥 제목 11.2:1(라이트)·15.7:1(다크).
- 미달: 입력칸 안내 글 `#8A93A0` 2.8:1, 입력칸 테두리·바탕이 출입증과 1.1–1.2:1 (위에 'PASS CODE' 이름표가 있어 뜻은 전해짐), 테마 버튼 높이 34px.
