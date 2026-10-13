# 콘텐츠 작성 가이드 (챕터 · 시나리오 · 문장 연습)

Tutoreal의 교과서 내용은 **모두 구글 시트(Tutoreal DB)에만** 있다. 코드에는 넣지 않는다 (README 규칙 2).
이 문서는 새 챕터·시나리오·문장 연습을 만들 때의 형식과 규칙이다.
일반 Claude 대화창이나 새 Claude Code 대화에서 이 파일을 통째로 붙여 넣고 요청하면, 시트에 바로 붙일 수 있는 줄을 만들 수 있다.

과정은 두 가지다. 같은 탭과 칸을 쓰고, 칸의 뜻만 과정마다 조금 다르다.

| 과정 | course 칸 | 학생 | 상대(AI) |
| --- | --- | --- | --- |
| 영어 | `en` 또는 빈칸 | 건강검진센터 간호사 | 외국인 수검자 |
| 중국어 | `zh` | 한국 패션 브랜드 대표 (초보, HSK 2 정도) | 중국·대만의 편집숍 사장, 바이어 등 |

## 1. 만들기 전에 확인할 것

- **이미 쓰는 번호**: Claude는 시트를 볼 수 없다. 지금 시트에 있는 챕터 번호(예: ch01, ch02, zh01~zh05)를 함께 알려 준다. 번호가 겹치면 같은 줄로 취급되어 꼬인다.
- **칸 순서**: 시트 1행의 칸 이름 순서대로 붙여 넣는다. 아래 표의 순서가 지금 시트의 순서다 (setup이 만든 순서). 다르면 시트 1행을 기준으로 맞춘다.
- **칸 이름은 바꾸지 않는다** (README 규칙 6).

## 2. 번호 규칙

| 무엇 | 형식 | 예 |
| --- | --- | --- |
| 챕터 | 영어 `ch` + 두 자리, 중국어 `zh` + 두 자리 | `ch03`, `zh06` |
| 시나리오 | 챕터 번호 + `-s` + 두 자리 | `ch03-s01`, `zh06-s02` |
| 문장 연습 | 챕터 번호 + `-d` + 두 자리 | `ch03-d01`, `zh06-d05` |

- 한 번 쓴 번호는 다른 내용에 다시 쓰지 않는다. 기록(sessions 탭)이 번호로 연결되어 있다.
- 챕터를 없애고 싶으면 줄을 지우지 말고 `published`를 FALSE로, 시나리오·문장은 `active`를 FALSE로 바꾼다.

## 3. chapters 탭

칸 순서: `chapter_id` `order` `title` `goal` `keywords` `scene` `published` `ai_captions` `course`

| 칸 | 뜻 | 영어 과정 | 중국어 과정 |
| --- | --- | --- | --- |
| chapter_id | 번호 | `ch03` | `zh06` |
| order | 목록 순서 (과정 안에서 1, 2, 3…) | 숫자 | 숫자 |
| title | 챕터 제목 (한국어, 짧게) | 검사 후 안내 | 공장 방문 ① 원단 고르기 |
| goal | 학습 개요 (한국어). 줄바꿈이나 `-`로 나누면 앱에서 글머리표 | `- 회복실 안내하기` | `- 원단 이름 말하기` |
| keywords | 핵심 표현, 쉼표로 구분. 피드백이 사용 여부를 확인하고, 받아쓰기 단어 힌트로도 쓴다 | `recovery room, dizzy, results` | `面料, 棉, 羊毛` |
| scene | **AI에게 주는 장면 설명. 영어로** 쓴다. 장소, 상황, AI가 할 일, 언제 끝내는지 | 아래 예 | 아래 예 |
| published | 학생에게 보일지 | TRUE / FALSE | TRUE / FALSE |
| ai_captions | AI 말 자막: `tap`(눌러서 보기) / `show`(항상) / `off`(없음) | 보통 `tap` | 초보라 `show` |
| course | 과정 | `en` 또는 빈칸 | `zh` |

**scene 쓰는 법**
- AI 입장에서 쓴다: "You are …", "The learner …".
- 학생이 먼저 말을 거는 구조가 자연스럽다 (AI는 학생이 말할 때까지 기다린다).
- 한 챕터에 목표 2~3개. 길면 챕터를 나눈다 (예: ① 인사 ② 브랜드 소개 ③ 방문 목적 ④ 마무리 ⑤ 처음부터 끝까지).
- 영어 예: `You are now in the endoscopy room. The nurse will guide you.`
- 중국어 예: `The learner has just walked into your boutique for the first time and will greet you. Greet back, ask who they are, tell them your surname, and invite them to sit down. End after you have both introduced yourselves.`

## 4. scenarios 탭

칸 순서: `scenario_id` `chapter_id` `name` `sex` `dob` `country` `exam` `twist` `level` `active`

대화를 시작할 때 그 챕터의 active 시나리오 중 하나를 **무작위로** 고른다. 챕터마다 2~3개를 두면 매번 조금씩 다르다.

| 칸 | 영어 과정 (수검자) | 중국어 과정 (상대) |
| --- | --- | --- |
| scenario_id | `ch03-s01` | `zh06-s01` |
| chapter_id | `ch03` | `zh06` |
| name | 수검자 이름 (영어). 실제 사람·환자 이름은 쓰지 않는다 | 상대 이름 (한자). 예: `林美玲` |
| sex | `male` / `female` — AI 목소리를 고른다 | 같음 |
| dob | 생년월일 `yyyy-mm-dd` (화면 카드와 본인 확인에 쓰임) | **비운다** |
| country | 수검자 국적 (영어) | `China` 또는 `Taiwan` — 받아쓰기 언어와 말투가 바뀐다 |
| exam | 검사 이름 (영어). 화면 카드에 보임 | **상대의 역할·장소 (한국어)**. 화면 카드에 보임. 예: `상하이 편집숍 사장` |
| twist | 숨은 설정 (영어). 학생 화면에는 안 보이고 AI만 안다. 없으면 비움 | 같음. 예: 대만이면 `Use Taiwan Mandarin words (for example 型錄 for catalog). You use LINE, not WeChat.` |
| level | 난이도 메모 1~3 (지금은 고를 때 쓰지 않는 참고용) | 같음 |
| active | TRUE / FALSE | TRUE / FALSE |

- twist 예 (영어): `You say your birth year as "two thousand and three".`, `You do not understand "glaucoma" at first.`
- 영어 수검자 캐릭터 그림은 `img/avatars/patients/<scenario_id>.jpg`와 `manifest.json`에 따로 추가해야 보인다 (docs/avatar-prompts.md). 그림이 없으면 이름 첫 글자로 보인다.

## 5. drills 탭 (문장 연습)

칸 순서: `drill_id` `chapter_id` `order` `situation` `sentence` `pron` `active`

| 칸 | 뜻 | 영어 과정 | 중국어 과정 |
| --- | --- | --- | --- |
| situation | 언제 쓰는 말인지 (한국어). 2단계에서는 이것만 보고 문장 전체를 말한다 | `녹내장이 있는지 물어볼 때` | `명함을 건넬 때` / 단어면 `단어: 명함` |
| sentence | 연습 문장. **[대괄호]** 부분이 1단계의 빈칸 (핵심 단어) | `Do you have [glaucoma]?` | `这是我的[名片]。` |
| pron | 발음 안내. 발음 코칭의 기준 | 어려운 단어만: `glaucoma: glaw-KOH-muh (강세는 KOH)`. 없으면 비움 | **문장 전체의 교과서식 병음** (꼭 채운다): `Zhè shì wǒ de míngpiàn.` |

- 챕터마다 5~8개. 쉬운 것부터: 중국어는 **단어 몇 개 → 짧은 문장**, 영어는 짧은 문장 위주.
- 빈칸은 그 챕터의 keywords와 맞춘다.
- 중국어 병음 형식: 성조 표시, 단어 단위로 붙여 쓰기, 문장 첫 글자 대문자, 경성(xiānsheng, wǒmen), 一·不 성조 변화(yíxià, búyòng), 문장부호 유지.

## 6. 과정별 수준과 말투

**영어 과정**
- 간호사가 실제로 쓰는 짧고 공손한 문장. 의료 조언을 하는 문장은 넣지 않는다.
- 실제 환자 정보는 쓰지 않는다.

**중국어 과정**
- 학생은 초보 (HSK 1~2급, 수업 표현은 2~3급까지). 한 문장은 짧게, HSK 1~2급 단어 + 그 챕터의 핵심 단어.
- 존칭: 처음 만난 상대에게는 您.
- '대표'는 代表가 아니라 老板 (代表는 '대리인').
- 본토와 대만 차이: 간체/번체, 微信/LINE, 目录/型錄 등. 같은 챕터에 China·Taiwan 시나리오를 하나씩 두면 둘 다 연습된다.

## 7. 학생 정보 (students 탭)

| 칸 | 뜻 |
| --- | --- |
| course | `en`(빈칸) / `zh`. 학생은 자기 과정 챕터만 본다. `role`이 `teacher`인 코드는 모든 과정을 본다 |
| profile | 학생 소개 (사실만, 영어 권장). AI 상대의 힌트와 피드백 예문이 이 사실로 문장을 만든다. 비우면 쓰지 않는다 |

profile 예 (지어낸 예): `Name: Kim Minsu (introduces with this name). Owner (老板) of BRAND-X, a Korean fashion brand in Seoul. Mainly womenswear (女装), also menswear (男装).`

- 학생 이름·브랜드 이름은 시트(profile, keywords, twist)에만 쓴다. 공개 저장소의 코드나 문서에는 넣지 않는다.

## 8. 시트에 붙여 넣는 형식

- 한 줄에 한 행, 칸 사이는 **탭**. 1행(칸 이름)은 빼고 내용만.
- 구글 시트에서 빈 줄의 첫 칸을 누르고 붙여 넣으면 칸별로 나뉜다.
- TRUE / FALSE는 대문자. 날짜(dob)는 시트가 날짜로 바꾸지 않도록 글자 형식 칸에 들어간다 (setup이 맞춰 둠).

## 9. 요청 예시 (Claude에게)

```
아래 콘텐츠 작성 가이드를 따라 중국어 과정 챕터를 만들어 줘.
- 주제: 원단 공장 방문 (원단 이름, 혼용률, 샘플 요청)
- 지금 시트의 챕터 번호: ch01, ch02, zh01~zh05
- 챕터 3개로 나누고, 챕터마다 시나리오 2개 (China 1, Taiwan 1)와 문장 연습 6개
- chapters, scenarios, drills 탭에 붙여 넣을 탭 구분 줄로 줘. 중국어 문장과 병음은 한 번 더 확인해 줘.

(여기에 이 가이드 전체를 붙여 넣기)
```

받은 줄은 붙여 넣기 전에 한 번 읽어 보고, 중국어 문장과 병음은 선생님이 확인한다.
