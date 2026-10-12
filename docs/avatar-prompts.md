# 프로필 캐릭터 그림 만들기 안내

학생 캐릭터 24개와 수검자 캐릭터 6개를 이미지 생성 도구(예: Gemini 앱)로 만드는 방법이다.
만든 그림은 아래 "파일 이름과 넣을 곳"대로 저장하면 앱이 알아서 보여 준다.

## 만드는 방법 (한 장씩)

1. 이미지 생성 도구를 연다.
2. **기준 그림(손 흔드는 안경 쓴 캐릭터)을 첨부**한다. 그림체를 맞추는 기준이다.
3. 아래 **공통 문구**를 붙여 넣고, 그 아래에 **캐릭터별 문구** 한 줄을 이어서 붙여 넣는다.
4. 마음에 드는 그림이 나오면 저장한다. 그림체가 기준과 많이 다르면 다시 생성한다.
5. 한 대화에서 계속 만들면 그림체가 더 잘 맞는다. "같은 그림체로 다음 캐릭터: …"처럼 이어서 요청해도 된다.

## 공통 문구 (매번 맨 위에)

```
Draw one character in exactly the same art style as the attached image:
cute hand-drawn digital illustration, thin soft dark-brown outlines, flat pastel colors with very light shading,
slightly chibi proportions (head a little large), simple round dark eyes with a white highlight, small rosy cheeks, gentle smile.
Upper body only, centered, facing the viewer, plain off-white background (#FBF8F4), no text, no frame, no logo.
Square image, 1024 x 1024. The character must look friendly and ordinary, not like any real or famous person.
```

## 학생 캐릭터 24개 (공통 문구 아래에 한 줄씩)

옷: 홀수 번호는 연한 하늘색 간호사 스크럽, 짝수 번호는 파스텔 티셔츠로 섞었다.

| 파일 | 캐릭터별 문구 |
| --- | --- |
| s01 | A young woman with a long dark-brown ponytail and round glasses, winking and waving, light blue nurse scrubs. |
| s02 | A young woman with a short black bob and straight bangs, smiling, holding a small heart, soft pink T-shirt. |
| s03 | A young woman with a neat low bun, no glasses, calm smile, giving a thumbs up, light blue nurse scrubs. |
| s04 | A young woman with long wavy brown hair and a small hair clip, laughing, mint T-shirt. |
| s05 | A young woman with shoulder-length straight black hair and square glasses, gentle smile, holding a clipboard, light blue nurse scrubs. |
| s06 | A young woman with two low braids, cheerful grin, making a peace sign, lavender T-shirt. |
| s07 | A young woman with a high ponytail and a headband, waving, light blue nurse scrubs. |
| s08 | A young woman with a short pixie cut, round glasses, shy smile, pale yellow T-shirt. |
| s09 | A young woman with a messy bun and loose strands, tired but happy smile, holding a coffee cup, light blue nurse scrubs. |
| s10 | A young woman with long straight black hair and see-through bangs, soft smile, cream knit sweater. |
| s11 | A young woman with a medium-length wavy bob and thin gold glasses, waving, light blue nurse scrubs. |
| s12 | A young woman with a half-up hairstyle and a ribbon, sparkling eyes, peach T-shirt. |
| s13 | A young woman with short curly brown hair, big smile, giving a thumbs up, light blue nurse scrubs. |
| s14 | A young woman with a long low ponytail over one shoulder, calm smile, sky blue T-shirt. |
| s15 | A young woman with a bob cut and a small star-shaped hair clip, winking, holding a small notebook, light blue nurse scrubs. |
| s16 | A young woman with wavy hair tied in a side braid, round glasses, laughing, soft green T-shirt. |
| s17 | A young man with short black hair and neat side part, friendly smile, waving, light blue nurse scrubs. |
| s18 | A young man with short brown hair and round glasses, calm smile, navy T-shirt. |
| s19 | A young man with a short buzz cut, big grin, thumbs up, light blue nurse scrubs. |
| s20 | A young man with slightly wavy medium hair, shy smile, light gray hoodie. |
| s21 | A young man with short black hair and square glasses, gentle smile, holding a clipboard, light blue nurse scrubs. |
| s22 | A young man with a two-block haircut, cheerful wink, peace sign, mint T-shirt. |
| s23 | A young woman with long hair under a light blue scrub cap, smiling with eyes closed, light blue nurse scrubs. |
| s24 | A young woman with a short bob and a small mole near the eye, soft smile, holding a heart, pink cardigan. |

## 수검자 캐릭터 6개 (시나리오와 같은 이름)

수검자는 건강검진을 받으러 온 외국인 성인이다. 나라를 드러내는 소품이나 고정관념적인 표현은 넣지 않는다.

**가운 색은 검사 종류(scenarios 탭의 `exam`)로 정한다 — 우리 병원 규칙.**

- 위내시경만 받는 수검자: 라떼색 환자 가운 → 문구 `a latte-colored (light milky brown) patient gown`
- 대장내시경을 받는 수검자 (exam에 colonoscopy가 들어 있으면): 연두색 환자 가운 → 문구 `a light yellow-green (pastel lime) patient gown`

| 파일 | 검사 | 캐릭터별 문구 |
| --- | --- | --- |
| ch01-s01 | 위내시경 | A man in his late 30s with short wavy light-brown hair and light stubble, friendly smile, wearing a latte-colored (light milky brown) patient gown. |
| ch01-s02 | 위내시경 | A woman in her early 20s with long straight black hair and bangs, slightly nervous smile, wearing a latte-colored (light milky brown) patient gown. |
| ch01-s03 | 대장내시경 | A man in his early 60s with short gray hair, gray mustache and kind wrinkles, warm smile, wearing a light yellow-green (pastel lime) patient gown. |
| ch02-s01 | 위내시경 (수면) | A man in his late 40s with short blond hair and thin rectangular glasses, calm expression, wearing a latte-colored (light milky brown) patient gown. |
| ch02-s02 | 위내시경 (수면) | A woman in her mid 30s with shoulder-length chestnut hair, slightly worried smile, wearing a latte-colored (light milky brown) patient gown. |
| ch02-s03 | 대장내시경 (수면) | A man in his mid 40s with short black hair neatly combed, polite smile, wearing a light yellow-green (pastel lime) patient gown. |

시나리오를 새로 추가하면 같은 방식으로 한 장 더 만들고, 파일 이름을 시나리오 번호(scenario_id)로 한다. 가운 색은 위 규칙대로 그 시나리오의 검사에 맞춘다.

## 파일 이름과 넣을 곳

- 학생: `img/avatars/students/s01.png` ~ `s24.png`
- 수검자: `img/avatars/patients/ch01-s01.png` 처럼 시나리오 번호로
- PNG 또는 JPG 모두 된다. 크기는 Claude가 작게 줄여서(256px) 앱에 넣는다.
- 그림을 다 넣었으면 Claude에게 알려 준다. Claude가 목록 파일(`img/avatars/manifest.json`)을 갱신한다.
