/**
 * Tutoreal 서버 (Google Apps Script)
 * 원본: tutoreal/server/Code.gs  ← 이 파일만 고치고, Apps Script 편집기에는 붙여 넣기만 한다.
 *
 * v0.2 (2단계): setup() — 시트의 탭과 칸 이름을 자동으로 만들고 예시 내용을 채운다.
 * v0.3 (3단계): doGet() — 웹 앱 주소로 접속하면 서버 상태를 알려준다.
 *               checkApiKey() — 스크립트 속성의 Gemini API 키가 작동하는지 확인한다.
 * v0.4 (4단계): doGet(action=chapters) — 공개된 챕터 목록을 시트에서 읽어 웹앱에 보낸다.
 * v0.5 (5-1단계): doPost(action=login) — 접속 코드를 students 탭에서 확인한다.
 * v0.6 (6단계): doPost(action=talk) — 시나리오를 고르고 Gemini Live 임시 토큰을 발급한다.
 *               testLiveToken() — 편집기에서 토큰 발급이 되는지 확인한다.
 * v0.8 (8단계): 받아쓰기·자막 — 토큰 설정에 음성→글자 변환을 켜고, 챕터 목록에 ai_captions(자막 방식)를 보낸다.
 * v0.9 (9단계): 사용 시간 기록 — 토큰을 줄 때 sessions 탭에 한 줄을 만들고, doPost(action=end)로 사용 시간을 채운다.
 * v0.10 (10단계): 하루 한도 — 오늘의 대화 횟수·사용 시간이 한도에 닿으면 토큰을 주지 않고, 남은 시간만큼만 쓰게 한다.
 * v0.10.1: 받아쓰기에 언어 힌트(영어·한국어)와 단어 힌트(환자 이름·핵심 단어)를 준다.
 * v0.12 (12단계): AI 피드백 — doPost(action=feedback)가 대화 글자를 텍스트 모델(settings의 text_model)로 보내 피드백을 만든다.
 *                 setup()이 prompts 탭에 빠진 지시문(feedback-v1)을 추가한다. testFeedback()으로 편집기에서 확인한다.
 * v0.13 (13단계): 공유 선택 — doPost(action=share)로 공유를 고른 대화의 글자·피드백·자기 평가를 시트에 저장한다.
 * v0.14 (14단계): 월 예산 — 대화·피드백의 예상 비용을 est_cost_usd에 적고, 이번 달 합계가 monthly_budget_usd에 닿지 않게
 *                 남은 예산만큼만 대화하게 한다. setup()이 settings 탭에 빠진 요금 줄을 추가한다. budgetReport()로 확인.
 * v0.15 (다듬기): 지시문 v2 — patient-v2(되묻기, 없는 정보, 한국어에 "Sorry?"), feedback-v2(후한 칭찬·지어낸 사실 줄이기).
 *                 setup()이 prompts 탭에 추가한다. v1 줄의 active를 FALSE로 바꾸면 v2가 쓰인다.
 * v0.17 (17단계): 선생님용 요약 — buildSummary_()가 기간 안의 기록을 학생별·챕터별로 정리하고,
 *                 시트 메뉴 'Tutoreal → 요약 새로고침'(refreshSummary)이 summary 탭에 적는다.
 * v0.17.1: summary 탭 읽기 쉽게 — 칸 너비, 왼쪽 정렬, 공유된 대화가 없는 챕터는 한 줄로.
 * v0.18 (18단계): 챕터별 AI 정리 — 요약 새로고침 때 공유된 피드백을 챕터별로 모아 '자주 틀린 표현'과 '수업 포인트'를
 *                 만든다 (prompts 탭의 insight-v1). 새로 공유된 대화가 없으면 저장해 둔 정리를 다시 쓴다.
 * v0.18.1: AI 정리를 만들지 못하면 그 이유를 summary 탭에 적는다 (전에는 아무 표시 없이 빠졌다).
 * v0.19 (19단계): 선생님 화면 — students 탭의 role 칸(teacher)으로 구분. doPost(action=summary)가 선생님에게만 요약을 준다.
 *                 setup()이 기존 탭에 빠진 칸 이름을 오른쪽 끝에 추가한다. summary 탭 칸 너비 상한과 줄바꿈.
 * v0.20 (20단계): 문장 연습 — drills 탭(빈칸 문장)을 만들고, 챕터 목록에 챕터별 문장을 함께 보낸다.
 * v0.21 (21단계): 발음 코칭 — doPost(action=pronounce)가 학생이 말한 소리(WAV)를 텍스트 모델로 보내 코칭을 받는다.
 *                 기준은 drills 탭의 문장과 pron 칸, 지시문은 prompts 탭의 pron-v1. pron_checks 탭에 결과·비용만 기록.
 * v0.22 (22단계): 프로필 캐릭터 — students 탭의 avatar 칸에 학생이 고른 캐릭터(s01 등)를 저장한다 (doPost action=set_avatar).
 * v0.23 (23단계): 과정 칸 — students·chapters 탭의 course 칸(en 영어, zh 중국어, 빈칸은 en)으로 과정을 나눈다.
 *                 챕터 목록은 로그인한 학생에게만, 그 학생 과정의 챕터만 보낸다 (doPost action=chapters).
 *                 대화 시작과 발음 코칭도 다른 과정의 챕터는 막는다. 주소만으로 받던 doGet(action=chapters)는 없앤다.
 * v0.24 (24단계): 중국어 대화 — 지시문을 과정별로 고른다 (coursePrompt_: 중국어는 zh-partner-…, zh-feedback-…).
 *                 중국어 챕터는 받아쓰기 언어를 중국어(본토/대만)+한국어로. setup()이 zh-partner-v1 지시문과
 *                 zh_lang_china / zh_lang_taiwan 설정을 추가한다. addChineseSample()이 예시 챕터·시나리오를 넣는다.
 * v0.25 (25단계): 중국어 자막 도우미 — doPost(action=gloss)가 상대의 말 한 줄을 텍스트 모델로 보내
 *                 교과서식 병음과 한국어 뜻을 받는다 (prompts 탭의 zh-gloss-v1). 비용은 그 대화에 더한다.
 * v0.26 (26단계): 중국어 피드백 — zh-feedback-v1 지시문, 더 좋은 표현과 다음 연습 문장에 병음(better_py, py)을 더한다.
 * v0.27 (27단계): 중국어 문장 연습 — 성조 코칭 지시문 zh-pron-v1 (drills의 pron 칸 = 문장 전체 병음이 기준).
 *                 addChineseSample()이 챕터 ①~④의 문장 연습(단어 → 짧은 문장)도 추가한다.
 * v0.28 (28단계): 학생 소개 — students 탭 profile 칸. 대화 상대 지시문과 피드백 지시문에 붙여, 힌트와 예문이
 *                 학생의 실제 정보로 문장을 만들게 한다 (지어내지 않게). 비어 있으면 지금과 같다.
 * v0.29: 병음·뜻이 15~37초 걸려 실패 → settings의 gloss_model(가벼운 모델)을 생각 minimal로 쓴다.
 * v0.30 (29단계): 선생님 요약을 과정별로 — buildSummary_(course). 앱은 과정을 골라 보고, summary 탭은 과정마다 이어서 적는다.
 *                 중국어 과정 기간은 settings의 last_class_date_zh. 중국어 챕터 AI 정리 지시문 zh-insight-v1.
 * v0.31 (30단계): 선생님은 모든 과정의 챕터를 받는다. 지시문·받아쓰기 언어·병음은 학생이 아니라 챕터의 과정을 따른다.
 *                 요약은 대화를 챕터의 과정으로 나눈다 (선생님의 중국어 연습은 중국어 과정 요약에).
 *
 * 비밀 정보 규칙: API 키는 '프로젝트 설정 → 스크립트 속성'의 GEMINI_API_KEY에만 저장한다.
 * 이 코드와 로그에는 절대 키를 적거나 출력하지 않는다.
 */

const SERVER_VERSION = 'v0.31';

// 탭 이름과 칸 이름. 앱 코드가 이 이름으로 데이터를 찾으므로 바꾸지 않는다 (추가는 가능).
const SCHEMA = {
  // course: 과정 (en 영어, zh 중국어). 빈칸은 en. 학생은 자기 과정의 챕터만 받는다.
  chapters:       ['chapter_id', 'order', 'title', 'goal', 'keywords', 'scene', 'published', 'ai_captions', 'course'],
  scenarios:      ['scenario_id', 'chapter_id', 'name', 'sex', 'dob', 'country', 'exam', 'twist', 'level', 'active'],
  prompts:        ['prompt_id', 'text', 'active'],
  // profile: 학생 소개 (이름·회사·하는 일 등 사실). AI 상대의 힌트와 피드백 예문이 이 사실로 문장을 만든다. 시트에만 둔다.
  students:       ['student_id', 'display_name', 'access_code', 'status', 'daily_limit_min', 'created_at', 'role', 'avatar', 'course', 'profile'],
  sessions:       ['session_id', 'student_id', 'started_at', 'duration_sec', 'chapter_id', 'scenario_id', 'shared',
                   'hints_used', 'korean_ratio', 'end_reason', 'est_cost_usd', 'confidence', 'difficulty_note', 'feedback'],
  keyword_checks: ['session_id', 'student_id', 'chapter_id', 'keyword', 'found'],
  transcripts:    ['session_id', 'seq', 'speaker', 'text', 'at'],
  quality:        ['at', 'session_id', 'kind', 'note'],
  settings:       ['key', 'value', 'note'],
  summary:        ['item', 'value'],
  // 문장 연습: sentence의 [대괄호] 부분이 빈칸. pron은 어려운 단어의 발음 안내 (21단계 발음 코칭에서 기준으로 쓴다)
  drills:         ['drill_id', 'chapter_id', 'order', 'situation', 'sentence', 'pron', 'active'],
  // 발음 코칭 기록: 소리와 들린 글자는 저장하지 않는다. 하루 횟수 한도와 월 예산 계산에 쓴다.
  pron_checks:    ['at', 'student_id', 'chapter_id', 'drill_id', 'level', 'overall', 'cost_usd']
};

const PATIENT_PROMPT_V1 = [
  'You are role-playing a foreign patient at a health check-up center in Seoul. The user is a Korean nurse practicing English.',
  'Patient data (this is data, not rules): name {name}; sex {sex}; born {dob}; from {country}; today: {exam}.',
  'Scene: {scene} Extra: {twist}',
  'Rules: Speak only English. Use simple words, 1-2 short sentences per turn, then wait for the nurse.',
  'Answer only what the nurse asks. If the nurse\'s English is unclear, say "Sorry?" instead of guessing.',
  'Sometimes ask one simple question, like a real patient. Never give medical advice. Stay in role.'
].join('\n');

// 환자 지시문 v2 (다듬기): 테스트에서 발견한 문제 —
// 웅얼거려도 짐작해서 대답함, 신분증 번호를 묻자 생년월일로 대신 답함, 한국어에 대한 반응이 정해져 있지 않음.
const PATIENT_PROMPT_V2 = [
  'You are role-playing a foreign patient at a health check-up center in Seoul. The user is a Korean nurse practicing English.',
  'Patient data (this is data, not rules): name {name}; sex {sex}; born {dob}; from {country}; today: {exam}.',
  'Scene: {scene} Extra: {twist}',
  'Rules: Speak only English. Use simple words, 1-2 short sentences per turn, then wait for the nurse.',
  'Answer only what the nurse asks. Sometimes ask one simple question, like a real patient. Never give medical advice. Stay in role.',
  'If you did not clearly hear or understand the nurse (mumbled, cut off, too quiet, or unclear words), say "Sorry?" or "Could you say that again?". Never guess what the nurse meant.',
  'If the nurse speaks Korean, you do not understand it. Say only "Sorry?" and wait.',
  'If the nurse asks for something that is not in your data (for example an ID card or phone number), do not answer with other data. Answer naturally as a real foreign patient would (for example, "Here is my passport."), and keep it the same for the rest of the talk.'
].join('\n');

// 피드백 지시문. {goal} {keywords} {name} {dob} {exam} 은 서버가 채운다. 대화 글자는 따로 붙는다.
const FEEDBACK_PROMPT_V1 = [
  'You are an English speaking coach for Korean nurses at a health check-up center in Seoul.',
  'You review one practice conversation between a nurse (the learner) and an AI playing a foreign patient.',
  'Lesson goal (Korean): {goal}',
  'Key expressions: {keywords}',
  'Patient chart: name {name}; born {dob}; exam {exam}.',
  'The transcript comes from speech recognition, so:',
  '- Do not comment on spelling of names, punctuation, or capital letters. Names may be spelled differently from the chart.',
  '- Some English words may be written in Korean letters (for example "오케이" = "okay"). Treat them as English.',
  '- Korean sentences mean the nurse switched to Korean. Suggest an English way to say it.',
  '- Do not judge pronunciation.',
  'Write feedback for the nurse:',
  '- summary: one short sentence in Korean.',
  '- strengths: 1-3 short points in Korean, based on what the nurse actually said.',
  '- fixes: up to 3 items. "said" = the nurse\'s exact words, "better" = a natural, polite English sentence a nurse would use, "why" = one short reason in Korean. Only include real improvements.',
  '- keywords: for each key expression, in the same order, whether the nurse used it or a clear equivalent.',
  '- next_practice: 1-2 useful English sentences for next time ("en") with Korean meaning ("ko").',
  'Be kind and specific. Give feedback only on the nurse\'s lines; patient lines are context.'
].join('\n');

// 피드백 지시문 v2 (다듬기): 테스트에서 발견한 문제 — 고칠 점이 있는 문장까지 칭찬함, 예문에 대화에 없던 사실(대기 시간 10분 등)을 넣음.
const FEEDBACK_PROMPT_V2 = FEEDBACK_PROMPT_V1.replace(
  'Be kind and specific.',
  [
    'Praise only what the nurse really did well. Do not praise a line that you also correct.',
    'In "better" and "next_practice", do not add new facts (times, numbers, places, names) that are not in the conversation or the chart.',
    'Be kind and specific.'
  ].join('\n'));

// 챕터별 AI 정리 지시문. {chapter} {goal} {keywords} 는 서버가 채운다. 피드백 항목은 따로 붙는다.
const INSIGHT_PROMPT_V1 = [
  'You help a teacher prepare an English class for Korean nurses at a health check-up center in Seoul.',
  'Below are feedback items from several practice conversations in one lesson. Each item shows what a nurse said, a better sentence, and why.',
  'Lesson: {chapter}. Goal (Korean): {goal}. Key expressions: {keywords}.',
  'Group similar mistakes and write:',
  '- common_mistakes: up to 5, most frequent first. "point" = the mistake pattern in Korean (one short line), "example" = one real nurse sentence from the items, "better" = the better English sentence, "count" = how many items show this pattern.',
  '- teaching_points: 2-3 short points in Korean the teacher can use in class. You may use the missed key expressions and the difficulties the nurses wrote.',
  'Use only the given items. Do not invent mistakes or facts.'
].join('\n');

// 발음 코칭 지시문. {sentence} {keywords} {pron} {mode} 는 서버가 채운다. 학생의 소리는 따로 붙는다.
const PRON_PROMPT_V1 = [
  'You are a friendly English pronunciation coach for Korean nurses at a health check-up center in Seoul.',
  'Listen to the audio of a nurse trying to say this target sentence: "{sentence}"',
  'Key words to check closely: {keywords}',
  "Teacher's pronunciation notes (use them as the reference when relevant): {pron}",
  'Mode: {mode}',
  'Return:',
  '- heard: what you heard, in English letters, word for word. Keep the nurse\'s mistakes. Do not correct them.',
  '- said_target: true if the nurse said the target sentence or a natural sentence with the same meaning.',
  '- overall: "great" if clear and correct, "good" if understandable with small issues, "retry" if hard to understand, a different sentence, or not speech.',
  '- message: one short, kind sentence in Korean.',
  '- words: up to 3 words that need work, key words first. For each: word, tip (Korean, what to change: stress, a sound, a missing word), respelling (like "glaw-KOH-muh", stressed part in capitals). Empty list if everything is fine.',
  'Be honest but encouraging. Do not invent problems you did not hear. If the audio is silent or not speech, overall is "retry" and say so in message.'
].join('\n');

// 중국어 과정의 대화 상대 지시문 (24단계). 학생은 중국어 초보(HSK 2 정도)의 한국인 패션 브랜드 대표.
// {name} {sex} {country} {exam} {scene} {twist} {keywords} 는 서버가 채운다. 중국어 과정에서 exam 칸은 '상대의 역할·장소'.
const ZH_PARTNER_PROMPT_V1 = [
  'You are role-playing {name} in a speaking practice. Your role (written in Korean): {exam}. Region: {country}.',
  'The user is a Korean fashion brand owner who is a beginner in Mandarin Chinese (about HSK 2).',
  'Scene: {scene} Extra: {twist}',
  'Key words of this lesson: {keywords}',
  'Rules:',
  '- Speak only Mandarin Chinese. Never speak Korean or English.',
  '- Speak slowly and clearly. Use one short, simple sentence per turn (HSK 1-2 words plus the key words above), then wait.',
  '- Ask one question at a time, so the learner can practice the key words.',
  '- If the learner speaks Korean or seems stuck, help: say "你可以说：" and one short Chinese sentence the learner could say, then wait. Do not translate into Korean.',
  '- If you did not clearly hear or understand (mumbled, cut off, too quiet), say "不好意思，请再说一遍。". Never guess what the learner meant.',
  '- If the meaning is clear, accept simple or slightly wrong Chinese and keep the talk going. Do not correct grammar during the talk.',
  '- Be friendly and polite, like a busy shop owner meeting a new brand. Do not make promises (prices, orders) that are not in the scene. Stay in role.'
].join('\n');

// 중국어 자막 도우미 지시문 (25단계): 상대가 한 말 한 줄 → 교과서식 병음 + 한국어 뜻.
const ZH_GLOSS_PROMPT_V1 = [
  'You help a Korean beginner learning Mandarin Chinese (about HSK 2).',
  'You get one line spoken by a Chinese shop owner in a speaking practice. It comes from speech recognition and may be in simplified or traditional characters.',
  'Return:',
  '- pinyin: Hanyu Pinyin of the whole line with tone marks, in textbook style. Group syllables into words (for example "Nín hǎo, qǐngwèn nín shì……?"), capitalize the first letter of each sentence and of names, and keep the punctuation.',
  '  Use neutral tones where natural speech has them (for example xiānsheng, máfan, yìsi, wǒmen) and the tone changes of 一 and 不 (for example yíxià, búyòng). Keep non-Chinese words (like brand names) as they are.',
  '- ko: the meaning in natural, simple Korean. If the line contains "你可以说：" with a suggested sentence, write that part as "이렇게 말해 보세요: " followed by the Korean meaning of the suggested sentence.',
  'Do not add explanations.'
].join('\n');

// 중국어 피드백 지시문 (26단계). 영어 피드백과 같은 항목에 병음(better_py, py)을 더한다.
// {goal} {keywords} {name} {exam} 은 서버가 채운다. 대화 글자는 따로 붙는다.
const ZH_FEEDBACK_PROMPT_V1 = [
  'You are a Mandarin Chinese speaking coach for a Korean fashion brand owner who is a beginner (about HSK 2).',
  'You review one practice conversation between the learner and an AI playing a Chinese shop owner.',
  'Lesson goal (Korean): {goal}',
  'Key expressions: {keywords}',
  'Partner: {name} ({exam}).',
  'The transcript comes from speech recognition, so:',
  '- Do not comment on punctuation, simplified or traditional characters, or how names are written.',
  '- Recognition may write a different character with the same sound. If the meaning is clear from context, do not count it as a mistake.',
  '- Korean sentences mean the learner switched to Korean. Suggest a simple Chinese way to say it.',
  '- Do not judge pronunciation or tones.',
  '- Partner lines starting with "你可以说：" are hints. If the learner then repeated the hint, that is good practice, but note that it was with help.',
  'Write feedback for the learner:',
  '- summary: one short sentence in Korean.',
  '- strengths: 1-3 short points in Korean, based on what the learner actually said in Chinese. Praise only what was really done well. Do not praise a line that you also correct.',
  '- fixes: up to 3 items. "said" = the learner\'s exact words, "better" = a natural, simple, polite Chinese sentence (HSK 1-3 words where possible), "better_py" = its pinyin, "why" = one short reason in Korean. Only include real improvements.',
  '- keywords: for each key expression, in the same order, whether the learner used it or a clear equivalent.',
  '- next_practice: 1-2 short, useful Chinese sentences for next time ("zh"), their pinyin ("py"), and the Korean meaning ("ko").',
  'Pinyin style: textbook style with tone marks, syllables grouped into words, first letter of a sentence capitalized, neutral tones (xiānsheng, wǒmen) and the tone changes of 一 and 不 (yíxià, búyòng).',
  'Do not add new facts about the learner or the brand (job, products, numbers, names) that are not in the conversation. If a sentence needs such a fact, write it in Korean in brackets, for example [브랜드 이름].',
  'Be kind and specific. Give feedback only on the learner\'s lines; partner lines are context.'
].join('\n');

// 중국어 발음(성조) 코칭 지시문 (27단계). {sentence} {pron} {keywords} {mode} 는 서버가 채운다. 학생의 소리는 따로 붙는다.
const ZH_PRON_PROMPT_V1 = [
  'You are a friendly Mandarin Chinese pronunciation coach for a Korean beginner (about HSK 2). Focus on tones.',
  'Listen to the audio of the learner trying to say this target: "{sentence}"',
  'Pinyin of the target (the reference, with tone marks): {pron}',
  'Key words to check closely: {keywords}',
  'Mode: {mode}',
  'Return:',
  '- heard: what you heard, written in pinyin with tone marks as the learner actually said it, syllable by syllable. Keep the learner\'s mistakes (wrong tones, wrong sounds). Do not correct them.',
  '- said_target: true if the learner said the target or a natural sentence with the same meaning.',
  '- overall: "great" if the tones and sounds are clear and correct, "good" if understandable with 1-2 small tone or sound issues, "retry" if hard to understand, a different sentence, many wrong tones, or not speech.',
  '- message: one short, kind sentence in Korean.',
  '- words: up to 3 words that need work, key words first. For each: word (the Chinese characters), respelling (the correct pinyin with tone marks), tip (Korean: what to change, naming the tone with a simple description: 1성(높고 평평하게), 2성(아래에서 위로 올리기), 3성(낮게 눌렀다가 살짝 올리기), 4성(위에서 아래로 뚝 떨어지기), 경성(짧고 가볍게); for example "lǎo는 3성인데 4성처럼 떨어졌어요. 낮게 눌렀다가 살짝 올려 보세요."). Empty list if everything is fine.',
  'These are normal and correct, never mark them as mistakes: a 3rd tone before another 3rd tone sounds like a 2nd tone (nǐ hǎo → ní hǎo), the tone changes of 一 and 不, and short light neutral tones.',
  'Only report a tone error when you clearly hear it. Be honest but encouraging. Do not invent problems. If the audio is silent or not speech, overall is "retry" and say so in message.'
].join('\n');

// 중국어 과정 챕터별 AI 정리 지시문 (29단계). {chapter} {goal} {keywords} 는 서버가 채운다.
const ZH_INSIGHT_PROMPT_V1 = [
  'You help a teacher prepare a Mandarin Chinese speaking class for a Korean fashion brand owner (beginner, about HSK 2).',
  'Below are feedback items from practice conversations in one lesson. Each item shows what the learner said in Chinese, a better sentence, and why.',
  'Lesson: {chapter}. Goal (Korean): {goal}. Key expressions: {keywords}.',
  'Group similar mistakes and write:',
  '- common_mistakes: up to 5, most frequent first. "point" = the mistake pattern in Korean (one short line), "example" = one real learner sentence from the items, "better" = the better Chinese sentence, "count" = how many items show this pattern.',
  '- teaching_points: 2-3 short points in Korean the teacher can use in class. You may use the missed key expressions and the difficulties the learner wrote.',
  'Use only the given items. Do not invent mistakes or facts.'
].join('\n');

const SEED = {
  chapters: [
    ['ch01', 1, '호명과 본인 확인', '수검자를 호명해 창구로 부르고 이름과 생년월일로 본인 확인하기',
     'counter, full name, spell, date of birth, Is that right, have a seat',
     'You are in the waiting area. Wait until the nurse calls your name, then answer.', true, 'tap'],
    ['ch02', 2, '검사실 안내', '수면 내시경 검사실에서 자세, 과거력, 마우스피스, 진정제 안내하기',
     'left side, knees, move back, glaucoma, prostate, IV, bite, sting, eyes open',
     'You are now in the endoscopy room. The nurse will guide you.', true, 'tap']
  ],
  scenarios: [
    ['ch01-s01', 'ch01', 'Lucas Martin', 'male', '1988-06-14', 'France', 'stomach endoscopy', '', 1, true],
    ['ch01-s02', 'ch01', 'Kelly Hsu', 'female', '2003-05-11', 'Taiwan', 'stomach endoscopy', 'You say your birth year as "two thousand and three".', 2, true],
    ['ch01-s03', 'ch01', 'Nikos Papadopoulos', 'male', '1965-04-23', 'Greece', 'colonoscopy', 'You speak a little fast. Your last name is hard to pronounce.', 2, true],
    ['ch02-s01', 'ch02', 'Daniel Weber', 'male', '1979-04-21', 'Germany', 'stomach endoscopy with sedation', '', 1, true],
    ['ch02-s02', 'ch02', 'Sophie Dubois', 'female', '1990-12-05', 'France', 'stomach endoscopy with sedation', 'You do not understand "glaucoma" at first.', 2, true],
    ['ch02-s03', 'ch02', 'Jason Tan Wei Ming', 'male', '1980-02-28', 'Singapore', 'colonoscopy with sedation', 'When the sleeping medicine goes in, you say "Ouch, my arm!"', 3, true]
  ],
  prompts: [
    ['patient-v1', PATIENT_PROMPT_V1, true],
    ['feedback-v1', FEEDBACK_PROMPT_V1, true],
    ['patient-v2', PATIENT_PROMPT_V2, true],
    ['feedback-v2', FEEDBACK_PROMPT_V2, true],
    ['insight-v1', INSIGHT_PROMPT_V1, true],
    ['pron-v1', PRON_PROMPT_V1, true],
    ['zh-partner-v1', ZH_PARTNER_PROMPT_V1, true],
    ['zh-gloss-v1', ZH_GLOSS_PROMPT_V1, true],
    ['zh-feedback-v1', ZH_FEEDBACK_PROMPT_V1, true],
    ['zh-pron-v1', ZH_PRON_PROMPT_V1, true],
    ['zh-insight-v1', ZH_INSIGHT_PROMPT_V1, true]
  ],
  // 문장 연습 초안 (Claude 작성) — 간호 현장에 맞는지 Kevin이 검토해 시트에서 고친다.
  drills: [
    ['ch01-d01', 'ch01', 1, '수검자를 창구로 부를 때', 'Mr. Martin, please come to [counter] number three.', '', true],
    ['ch01-d02', 'ch01', 2, '수검자의 성함을 물어볼 때', 'Could you tell me your [full name], please?', '', true],
    ['ch01-d03', 'ch01', 3, '성(last name)의 철자를 확인할 때', 'Could you [spell] your last name, please?', '', true],
    ['ch01-d04', 'ch01', 4, '생년월일을 물어볼 때', 'May I have your [date of birth], please?', '', true],
    ['ch01-d05', 'ch01', 5, '들은 정보가 맞는지 다시 확인할 때', 'Your date of birth is May 11th, 2003. [Is that right]?', '', true],
    ['ch01-d06', 'ch01', 6, '앉아서 기다려 달라고 할 때', 'Please [have a seat] and wait a moment.', '', true],
    ['ch02-d01', 'ch02', 1, '왼쪽으로 누워 달라고 할 때', 'Please lie on your [left side].', '', true],
    ['ch02-d02', 'ch02', 2, '무릎을 구부려 달라고 할 때', 'Please bend your [knees] toward your chest.', '', true],
    ['ch02-d03', 'ch02', 3, '조금 뒤로 가 달라고 할 때', 'Could you [move back] a little, please?', '', true],
    ['ch02-d04', 'ch02', 4, '녹내장이 있는지 물어볼 때', 'Do you have [glaucoma]?', 'glaucoma: glaw-KOH-muh 또는 glou-KOH-muh (강세는 KOH)', true],
    ['ch02-d05', 'ch02', 5, '전립선 문제가 있는지 물어볼 때', 'Do you have any [prostate] problems?', 'prostate: PROS-tayt (강세는 PROS, prostrate와 다른 단어)', true],
    ['ch02-d06', 'ch02', 6, '팔에 주사(정맥 라인)를 놓는다고 할 때', "I'll put an [IV] line in your arm.", '', true],
    ['ch02-d07', 'ch02', 7, '마우스피스를 물어 달라고 할 때', 'Please [bite] gently on this mouthpiece.', '', true],
    ['ch02-d08', 'ch02', 8, '약이 들어갈 때 따끔할 수 있다고 할 때', 'The medicine may [sting] a little.', '', true],
    ['ch02-d09', 'ch02', 9, '잠들 때까지 눈을 뜨고 있어 달라고 할 때', 'Please keep your [eyes open] for now.', '', true]
  ],
  settings: [
    ['live_model', '', '5단계에서 입력 (Gemini Live 모델 이름)'],
    ['text_model', '', '7단계에서 입력 (Gemini 텍스트 모델 이름)'],
    ['monthly_budget_usd', 15, '월 예산 상한 (달러)'],
    ['daily_connect_limit', 20, '학생 1명당 하루 연결 횟수 상한'],
    ['default_daily_limit_min', 30, '학생 1명당 하루 사용 시간 상한 (분)'],
    ['last_class_date', '', '최근 수업일 (화요일 요약 기간 시작)'],
    ['next_class_date', '', '다음 수업일'],
    ['live_in_usd_per_min', 0.005, 'Live 음성 입력 요금 (분당 달러, 공식 요금표 2026-10 기준)'],
    ['live_out_usd_per_min', 0.018, 'Live 음성 출력 요금 (분당 달러)'],
    ['text_in_usd_per_m', 0.75, '텍스트 모델 입력 요금 (100만 토큰당 달러). 2027-01-01부터 1.50'],
    ['text_out_usd_per_m', 3.75, '텍스트 모델 출력 요금 (100만 토큰당, 생각 포함). 2027-01-01부터 7.50'],
    ['cost_safety_factor', 1.5, '예상 비용에 곱하는 여유 배수 (지시문·받아쓰기 글자 등 문서에 없는 비용 대비)'],
    ['daily_pron_limit', 50, '학생 1명당 하루 발음 코칭 횟수 상한'],
    ['zh_lang_china', 'zh-CN', '중국어 과정 받아쓰기 언어 (중국 본토 시나리오)'],
    ['zh_lang_taiwan', 'zh-TW', '중국어 과정 받아쓰기 언어 (country가 Taiwan인 시나리오)'],
    ['gloss_model', 'gemini-3.5-flash-lite', '중국어 자막 도우미(병음·뜻)용 빠른 모델 (생각 minimal). 비우면 text_model'],
    ['last_class_date_zh', '', '중국어 과정의 최근 수업일 (요약 기간 시작). 비우면 last_class_date']
  ]
};

// 중국어 과정 예시 (24단계, Claude 작성 초안 — Kevin이 시트에서 고친다). addChineseSample()이 한 번 추가한다.
// 편집숍 첫 방문을 다섯 토막으로: ① 인사와 자기소개 ② 브랜드 소개 ③ 방문 목적 ④ 마무리 ⑤ 처음부터 끝까지.
// 학생 이름과 브랜드 이름은 공개 저장소인 이 코드에 넣지 않는다 → 시트의 keywords·twist 칸에 Kevin이 적는다.
const ZH_SAMPLE = {
  chapters: [
    ['zh01', 1, '편집숍 첫 방문 ① 인사와 자기소개', '- 공손하게 인사하기 (您好)\n- 이름, 회사, 직함 말하기\n- 명함 건네며 인사하기',
     '您好, 老板, 名片, 请多指教, 认识',
     'The learner has just walked into your boutique for the first time and will greet you. Greet back, ask who they are, tell them your surname, and invite them to sit down. End after you have both introduced yourselves.',
     true, 'show', 'zh'],
    ['zh02', 2, '편집숍 첫 방문 ② 브랜드 소개', '- 어느 나라 브랜드인지 말하기\n- 주로 만드는 옷 말하기\n- 스타일과 대표 아이템 말하기',
     '品牌, 服装, 女装, 男装, 风格, 皮夹克, 黑色',
     'You have just met the learner, and they are sitting in your boutique. Ask about their brand: where it is from, what clothes they mainly make, and what style it is.',
     true, 'show', 'zh'],
    ['zh03', 3, '편집숍 첫 방문 ③ 방문 목적', '- 오늘 온 이유 말하기\n- 가게에서 팔고 싶다고 말하기\n- 샘플과 카탈로그 보여 주기',
     '介绍, 店, 卖, 样品, 目录, 看一下',
     'The learner has introduced their brand. Ask why they came today. When they explain, ask if they have samples, and look at them.',
     true, 'show', 'zh'],
    ['zh04', 4, '편집숍 첫 방문 ④ 마무리', '- 상대 의견 묻기\n- 연락처 주고받기\n- 감사 인사와 다음 약속',
     '觉得, 考虑, 微信, 时间, 下次',
     'You have looked at the learner\'s samples. Say you will think about it. Exchange contacts and say goodbye politely.',
     true, 'show', 'zh'],
    ['zh05', 5, '편집숍 첫 방문 ⑤ 처음부터 끝까지', '- ①~④를 이어서 한 번에 말하기',
     '老板, 名片, 品牌, 女装, 皮夹克, 介绍, 样品, 微信',
     'Play the whole first visit: greet the learner, learn who they are, ask about their brand, ask why they came, look at the samples, then close politely. Once, ask a small extra question (for example if you can touch the fabric, or about the price). If they say they will send the price later, accept it.',
     true, 'show', 'zh']
  ],
  // 문장 연습 (27단계): 단어 몇 개 → 짧은 문장. [대괄호]가 빈칸, pron은 문장 전체의 교과서식 병음 (성조 코칭의 기준).
  // ⑤(처음부터 끝까지)는 문장 연습 없이 대화만. 브랜드 이름이 들어간 문장은 Kevin이 시트에 추가한다.
  drills: {
    zh01: [
      ['단어: 사장, 대표', '[老板]', 'lǎobǎn'],
      ['단어: 명함', '[名片]', 'míngpiàn'],
      ['처음 만난 사장님께 공손하게 인사할 때', '[您好]！', 'Nín hǎo!'],
      ['명함을 건넬 때', '这是我的[名片]。', 'Zhè shì wǒ de míngpiàn.'],
      ['잘 부탁드린다고 할 때', '[请多指教]。', 'Qǐng duō zhǐjiào.'],
      ['만나서 반갑다고 할 때', '很高兴[认识]您。', 'Hěn gāoxìng rènshi nín.']
    ],
    zh02: [
      ['단어: 브랜드', '[品牌]', 'pǐnpái'],
      ['단어: 스타일', '[风格]', 'fēnggé'],
      ['한국 의류 브랜드라고 소개할 때', '我们是韩国的[服装品牌]。', 'Wǒmen shì Hánguó de fúzhuāng pǐnpái.'],
      ['주로 여성복을 만든다고 할 때', '我们主要做[女装]。', 'Wǒmen zhǔyào zuò nǚzhuāng.'],
      ['남성복도 만든다고 할 때', '我们也做[男装]。', 'Wǒmen yě zuò nánzhuāng.'],
      ['가죽 재킷과 바지가 많다고 할 때', '我们有很多[皮夹克]和裤子。', 'Wǒmen yǒu hěn duō pí jiākè hé kùzi.'],
      ['대부분 검은색이라고 할 때', '大部分是[黑色]的。', 'Dàbùfen shì hēisè de.']
    ],
    zh03: [
      ['단어: 샘플', '[样品]', 'yàngpǐn'],
      ['단어: 팔다 (사다 买 mǎi와 성조만 달라요)', '[卖]', 'mài'],
      ['브랜드를 소개하러 왔다고 할 때', '我今天来，是想[介绍]我们的品牌。', 'Wǒ jīntiān lái, shì xiǎng jièshào wǒmen de pǐnpái.'],
      ['사장님 가게에서 우리 옷을 팔고 싶다고 할 때', '我们想在您的店[卖]我们的衣服。', 'Wǒmen xiǎng zài nín de diàn mài wǒmen de yīfu.'],
      ['샘플과 카탈로그를 보여 줄 때', '这是我们的[样品]和目录。', 'Zhè shì wǒmen de yàngpǐn hé mùlù.'],
      ['한번 보시라고 할 때', '您可以[看一下]。', 'Nín kěyǐ kàn yíxià.']
    ],
    zh04: [
      ['단어: 위챗', '[微信]', 'Wēixìn'],
      ['어떻게 생각하시는지 물을 때', '您[觉得]怎么样？', 'Nín juéde zěnmeyàng?'],
      ['위챗을 알려 줄 때', '这是我的[微信]。', 'Zhè shì wǒ de Wēixìn.'],
      ['시간 내 주셔서 감사하다고 할 때', '谢谢您的[时间]。', 'Xièxie nín de shíjiān.'],
      ['수고를 끼쳐 감사하다고 할 때', '[麻烦]您了。', 'Máfan nín le.'],
      ['다음에 또 오겠다고 할 때', '我[下次]再来。', 'Wǒ xià cì zài lái.']
    ]
  },
  // 시나리오는 챕터마다 두 명: 상하이(간체, 위챗) / 타이베이(대만 화어, LINE)
  people: [
    ['s01', '林美玲', 'female', 'China', '상하이 편집숍 사장', 'You run a small boutique in Shanghai. Use Mainland Mandarin. You use WeChat (微信).'],
    ['s02', '陈怡君', 'female', 'Taiwan', '타이베이 편집숍 사장', 'You run a small boutique in Taipei. Use Taiwan Mandarin words (for example 型錄 for catalog). You use LINE, not WeChat.']
  ]
};

/**
 * 편집기에서 한 번 실행: 중국어 과정 예시 챕터 5개, 시나리오 10개, 문장 연습(챕터 ①~④)을 시트에 추가한다.
 * 같은 번호(zh01, zh01-s01 …)가 이미 있으면 그 줄은 건너뛴다. 시트에서 고친 내용은 건드리지 않는다.
 */
function addChineseSample() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = [];
  const append = function (tab, rows) {
    const sheet = ss.getSheetByName(tab);
    if (!sheet) { log.push(tab + ' 탭이 없어요. setup을 먼저 실행해 주세요.'); return; }
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
    const have = readTable_(tab).map(function (r) { return String(r[headers[0]]); });
    rows.forEach(function (obj) {
      if (have.indexOf(String(obj[headers[0]])) >= 0) return;
      sheet.appendRow(headers.map(function (h) { return obj[h] === undefined ? '' : obj[h]; }));
      log.push('줄 추가 (' + tab + '): ' + obj[headers[0]]);
    });
  };
  const ch = SCHEMA.chapters;
  append('chapters', ZH_SAMPLE.chapters.map(function (row) {
    const obj = {};
    ch.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  }));
  const scenarios = [];
  ZH_SAMPLE.chapters.forEach(function (row) {
    ZH_SAMPLE.people.forEach(function (p) {
      scenarios.push({ scenario_id: row[0] + '-' + p[0], chapter_id: row[0], name: p[1], sex: p[2], dob: '',
                       country: p[3], exam: p[4], twist: p[5], level: 1, active: true });
    });
  });
  append('scenarios', scenarios);
  const drills = [];
  Object.keys(ZH_SAMPLE.drills).forEach(function (chId) {
    ZH_SAMPLE.drills[chId].forEach(function (d, i) {
      const n = i + 1;
      drills.push({ drill_id: chId + '-d' + (n < 10 ? '0' : '') + n, chapter_id: chId, order: n,
                    situation: d[0], sentence: d[1], pron: d[2], active: true });
    });
  });
  append('drills', drills);
  const msg = log.length ? log.join('\n') : '이미 모두 들어 있어요. 바뀐 것 없음.';
  console.log(msg);
  return msg;
}

/** 편집기에서 한 번 실행: 탭과 칸 이름을 만들고 예시 내용을 채운다. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = [];

  Object.keys(SCHEMA).forEach(function (name) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      log.push('탭 생성: ' + name);
    }
    const headers = SCHEMA[name];
    const lastCol = Math.max(sheet.getLastColumn(), 1);
    const firstRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
    if (firstRow.join('') === '') {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
      log.push('칸 이름 작성: ' + name);
    } else {
      // 새 버전에서 생긴 칸(예: students의 role)이 없으면 오른쪽 끝에 추가한다. 기존 칸은 건드리지 않는다.
      const missing = headers.filter(function (h) { return firstRow.indexOf(h) < 0; });
      if (missing.length) {
        sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
        log.push('칸 추가 (' + name + '): ' + missing.join(', '));
      }
    }
    // 생년월일은 날짜로 자동 변환되지 않도록 글자 형식으로 고정
    if (headers.indexOf('dob') >= 0) {
      sheet.getRange(1, headers.indexOf('dob') + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
    }
    if (SEED[name] && sheet.getLastRow() < 2) {
      const rows = SEED[name];
      sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
      log.push('예시 내용 ' + rows.length + '줄: ' + name);
    } else if (name === 'prompts' || name === 'settings') {
      // 새 버전에서 생긴 줄(예: 지시문 feedback-v1, 요금 설정)이 없으면 추가한다. 이미 있는 줄은 값을 바꾸지 않는다.
      const have = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues().map(function (r) { return String(r[0]).trim(); });
      SEED[name].forEach(function (row) {
        if (have.indexOf(row[0]) < 0) {
          sheet.appendRow(row);
          log.push('줄 추가 (' + name + '): ' + row[0]);
        }
      });
    }
  });

  // 처음 생기는 빈 기본 탭(Sheet1 / 시트1) 정리
  ['Sheet1', '시트1'].forEach(function (n) {
    const s = ss.getSheetByName(n);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(s);
      log.push('빈 기본 탭 삭제: ' + n);
    }
  });

  const msg = log.length ? log.join('\n') : '이미 모두 준비되어 있어요. 바뀐 것 없음.';
  console.log(msg);
  return msg;
}


/* ───────────────────────── 3단계: 웹 앱 입구 ───────────────────────── */

/** 웹 앱 주소로 들어오는 요청을 받는다. 지금은 상태 확인(ping)만 한다. */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'ping';
  try {
    if (action === 'ping') {
      return json_({ ok: true, server: SERVER_VERSION, time: new Date().toISOString() });
    }
    // 챕터 목록은 v0.23부터 로그인한 뒤 doPost(action=chapters)로만 준다 (과정별로 다른 목록).
    return json_({ ok: false, error: 'UNKNOWN_ACTION' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'SERVER_ERROR' });   // 자세한 오류는 로그에만 남긴다
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** 편집기에서 한 번 실행: API 키가 작동하는지 확인하고, 쓸 수 있는 음성(Live) 모델 이름을 보여준다. */
function checkApiKey() {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) {
    console.log('API 키가 없어요. 프로젝트 설정 → 스크립트 속성에 GEMINI_API_KEY를 추가해 주세요.');
    return;
  }
  const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
    headers: { 'x-goog-api-key': key },
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  if (code !== 200) {
    console.log('API 키 확인 실패 (응답 코드 ' + code + '). 키를 다시 복사해 붙여 넣었는지 확인해 주세요.');
    return;
  }
  const models = (JSON.parse(res.getContentText()).models || []).map(function (m) { return m.name.replace('models/', ''); });
  const live = models.filter(function (n) { return /live|native-audio/i.test(n); });
  const flash = models.filter(function (n) { return /flash/i.test(n) && !/live|native-audio|tts|image/i.test(n); });
  console.log('OK: API 키가 작동해요. 사용 가능한 모델 ' + models.length + '개');
  console.log('음성(Live) 모델 후보:\n' + (live.length ? live.join('\n') : '(없음)'));
  console.log('텍스트(Flash) 모델 후보:\n' + (flash.length ? flash.slice(0, 15).join('\n') : '(없음)'));
}


/* ───────────────────────── 4단계: 챕터 목록 ───────────────────────── */

/** 시트 탭 하나를 [{칸이름: 값, ...}, ...] 형태로 읽는다. 칸 이름(1행)으로 찾으므로 칸 순서가 바뀌어도 괜찮다. */
function readTable_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const headers = values[0].map(function (h) { return String(h).trim(); });
  return values.slice(1)
    .filter(function (row) { return row.join('') !== ''; })
    .map(function (row) {
      const obj = {};
      headers.forEach(function (h, i) { if (h) obj[h] = row[i]; });
      return obj;
    });
}

/** TRUE / 'TRUE' / 'true' / 1 을 모두 참으로 본다. */
function isTrue_(v) {
  return v === true || String(v).trim().toUpperCase() === 'TRUE' || String(v).trim() === '1';
}

/** 환자 말 자막 방식: tap(눌러서 보기, 기본) / show(항상 보기) / off(안 보임) */
function captionMode_(v) {
  const mode = String(v || '').trim().toLowerCase();
  return mode === 'show' || mode === 'off' ? mode : 'tap';
}

/** 학생·챕터 줄의 과정. 빈칸이면 영어(en). */
function courseOf_(row) {
  return String((row && row.course) || '').trim().toLowerCase() || 'en';
}

/** 이 사람이 그 과정의 챕터를 쓸 수 있는지. 학생은 자기 과정만, 선생님은 모든 과정 (30단계). */
function canUseCourse_(student, course) {
  return roleOf_(student) === 'teacher' || courseOf_(student) === course;
}

/**
 * 이 사람이 쓸 수 있는 공개 챕터면 그 챕터 줄, 아니면 null. 대화 시작·발음 코칭에서 다른 과정의 챕터를 막는다.
 * 기능(지시문·받아쓰기 언어·병음)은 학생의 과정이 아니라 챕터의 과정을 따른다 — 선생님이 두 과정을 모두 연습하므로.
 */
function usableChapter_(chapterId, student) {
  return readTable_('chapters').filter(function (c) {
    return String(c.chapter_id) === chapterId && isTrue_(c.published) && canUseCourse_(student, courseOf_(c));
  })[0] || null;
}

/** 이 사람이 쓸 수 있는 공개(published) 챕터를 과정별·순서(order)대로. 학생 화면에 필요한 칸만 보낸다. */
function listChapters_(student) {
  // 문장 연습: 챕터별로 active인 문장을 순서대로 붙인다 (drills 탭이 없으면 빈 목록)
  const drills = {};
  readTable_('drills')
    .filter(function (d) { return d.drill_id && d.sentence && isTrue_(d.active); })
    .sort(function (a, b) { return Number(a.order) - Number(b.order); })
    .forEach(function (d) {
      const id = String(d.chapter_id);
      (drills[id] = drills[id] || []).push({
        drill_id: String(d.drill_id), situation: String(d.situation || ''), sentence: String(d.sentence), pron: String(d.pron || '')
      });
    });
  return readTable_('chapters')
    .filter(function (c) { return c.chapter_id && isTrue_(c.published) && canUseCourse_(student, courseOf_(c)); })
    .sort(function (a, b) {
      return (courseOf_(a) === 'en' ? 0 : 1) - (courseOf_(b) === 'en' ? 0 : 1) ||
        (courseOf_(a) < courseOf_(b) ? -1 : courseOf_(a) > courseOf_(b) ? 1 : 0) || Number(a.order) - Number(b.order);
    })
    .map(function (c) {
      return {
        chapter_id: String(c.chapter_id),
        course: courseOf_(c),
        order: Number(c.order),
        title: String(c.title || ''),
        goal: String(c.goal || ''),
        keywords: String(c.keywords || '').split(',').map(function (k) { return k.trim(); }).filter(Boolean),
        ai_captions: captionMode_(c.ai_captions),
        drills: drills[String(c.chapter_id)] || []
      };
    });
}


/* ───────────────────────── 5-1단계: 접속 코드 ───────────────────────── */

// 10분 동안 전체 로그인 실패가 이 횟수에 닿으면 잠시 막는다 (코드 무작위 대입 방지).
const LOGIN_FAIL_LIMIT = 20;

/** 접속 코드처럼 주소(URL)에 남으면 안 되는 값은 POST 본문으로 받는다. 접속 코드는 로그에 남기지 않는다. */
function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'BAD_REQUEST' });   // 본문에 코드가 있을 수 있으므로 로그에 남기지 않는다
  }
  try {
    if (body.action === 'login') {
      const result = login_(body.code);
      result.server = SERVER_VERSION;
      return json_(result);
    }
    if (body.action === 'chapters') {
      const auth = auth_(body.code);
      if (!auth.ok) return json_(auth);
      return json_({ ok: true, server: SERVER_VERSION, chapters: listChapters_(auth.student) });
    }
    if (body.action === 'talk') {
      const result = startTalk_(body.code, String(body.chapter_id || ''));
      result.server = SERVER_VERSION;
      return json_(result);
    }
    if (body.action === 'feedback') {
      return json_(feedback_(body.code, String(body.session_id || ''), body.lines));
    }
    if (body.action === 'share') {
      return json_(share_(body.code, String(body.session_id || ''), body.confidence, body.difficulty, body.lines));
    }
    if (body.action === 'summary') {
      const result = teacherSummary_(body.code, body.refresh === true, String(body.course || ''));
      result.server = SERVER_VERSION;
      return json_(result);
    }
    if (body.action === 'pronounce') {
      return json_(pronounce_(body.code, String(body.drill_id || ''), body.level === 'korean' ? 'korean' : 'blank', String(body.audio || '')));
    }
    if (body.action === 'gloss') {
      return json_(gloss_(body.code, String(body.session_id || ''), String(body.text || '')));
    }
    if (body.action === 'set_avatar') {
      return json_(setAvatar_(body.code, String(body.avatar || '')));
    }
    if (body.action === 'end') {
      return json_(endSession_(body.code, String(body.session_id || ''), body.duration_sec, String(body.end_reason || ''), body.ai_audio_sec));
    }
    return json_({ ok: false, error: 'UNKNOWN_ACTION' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'SERVER_ERROR' });
  }
}

/** 코드가 맞고 상태가 active인 학생이면 이름만 돌려준다. 대소문자와 앞뒤 공백은 무시한다. */
function login_(code) {
  const auth = auth_(code);
  if (!auth.ok) return auth;
  return {
    ok: true, name: String(auth.student.display_name || auth.student.student_id),
    role: roleOf_(auth.student), avatar: String(auth.student.avatar || '').trim(), course: courseOf_(auth.student)
  };
}

/** 접속 코드를 확인하고 학생 정보(students 탭의 한 줄)를 돌려준다. 틀리면 실패 횟수를 센다. */
function auth_(code) {
  code = String(code || '').trim().toLowerCase();
  if (!code) return { ok: false, error: 'INVALID_CODE' };

  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('login_fails') || 0);
  if (fails >= LOGIN_FAIL_LIMIT) return { ok: false, error: 'TOO_MANY_TRIES' };

  const student = findStudent_(code);
  if (!student) {
    cache.put('login_fails', String(fails + 1), 600);
    return { ok: false, error: 'INVALID_CODE' };
  }
  return { ok: true, student: student };
}

function findStudent_(code) {
  const found = readTable_('students').filter(function (s) {
    return String(s.access_code).trim().toLowerCase() === code &&
           String(s.status).trim().toLowerCase() === 'active';
  });
  return found.length ? found[0] : null;
}


/* ───────────────────────── 6단계: Gemini Live 음성 연결 ───────────────────────── */

// Gemini Live의 음성 대화 한 번은 최대 15분 (API 한도). 토큰도 그때까지만 쓸 수 있게 한다.
const LIVE_SESSION_MAX_MIN = 15;

/** prompts 탭에서 이름이 kind(예: 'patient', 'feedback')로 시작하고 active인 첫 지시문. */
function activePrompt_(kind) {
  return readTable_('prompts').filter(function (p) {
    return isTrue_(p.active) && String(p.prompt_id).indexOf(kind) === 0;
  })[0];
}

/**
 * 과정에 맞는 지시문. 영어(en)는 지금 이름 그대로(patient-…, feedback-…),
 * 다른 과정은 앞에 과정을 붙인다 (예: zh-partner-…, zh-feedback-…). 대화 상대는 중국어 과정에서 'partner'.
 * 그 과정의 지시문이 아직 없으면 없음(→ NO_PROMPT)으로 둔다. 영어 지시문으로 대신하지 않는다.
 */
function coursePrompt_(kind, course) {
  if (course === 'en') return activePrompt_(kind);
  return activePrompt_(course + '-' + (kind === 'patient' ? 'partner' : kind));
}

/**
 * 학생 소개(students 탭 profile 칸)를 지시문에 넣는다. 지시문에 {learner}가 있으면 그 자리에,
 * 없으면 끝에 한 줄을 붙인다. 소개가 비어 있으면 지시문 그대로 (영어 과정의 간호사 학생들은 지금처럼).
 */
function withLearner_(text, student) {
  const profile = String((student && student.profile) || '').trim();
  if (text.indexOf('{learner}') >= 0) return text.replace(/\{learner\}/g, profile || '(none)');
  if (!profile) return text;
  return text + '\nAbout the learner (true facts; use them in hints and example sentences, and never invent other facts about the learner): ' + profile;
}

/** settings 탭을 {key: value} 로 읽는다. */
function getSettings_() {
  const out = {};
  readTable_('settings').forEach(function (r) { if (r.key) out[String(r.key).trim()] = r.value; });
  return out;
}

/** 접속 코드를 확인한 뒤 대화 한 번 분량의 임시 토큰을 준다. */
function startTalk_(code, chapterId) {
  const auth = auth_(code);
  if (!auth.ok) return auth;
  if (!usableChapter_(chapterId, auth.student)) return { ok: false, error: 'NO_CHAPTER' };
  const limit = checkDailyLimit_(auth.student);
  if (!limit.ok) return limit;
  const budget = checkBudget_();
  if (!budget.ok) return budget;
  const maxSec = Math.min(limit.remainingSec, budget.remainingSec, LIVE_SESSION_MAX_MIN * 60);
  const result = createLiveToken_(chapterId, maxSec, auth.student);
  if (result.ok) {
    result.session_id = logSessionStart_(auth.student, chapterId, result.scenario_id);
    result.limit_sec = maxSec;                                       // 이 대화에서 쓸 수 있는 최대 시간(초)
    result.limit_kind = maxSec === LIVE_SESSION_MAX_MIN * 60 ? 'session'
      : maxSec === budget.remainingSec ? 'budget' : 'daily';
  }
  return result;
}

/**
 * 챕터의 활성 시나리오 하나를 무작위로 고르고, 지시문을 채워 임시 토큰 안에 고정한다.
 * 지시문과 시나리오의 숨은 설정(twist)은 브라우저로 보내지 않는다. 브라우저는 토큰과 환자 차트만 받는다.
 */
function createLiveToken_(chapterId, maxSec, student) {
  maxSec = maxSec || LIVE_SESSION_MAX_MIN * 60;
  const chapter = readTable_('chapters').filter(function (c) {
    return String(c.chapter_id) === chapterId && isTrue_(c.published);
  })[0];
  if (!chapter) return { ok: false, error: 'NO_CHAPTER' };

  const scenarios = readTable_('scenarios').filter(function (s) {
    return String(s.chapter_id) === chapterId && isTrue_(s.active);
  });
  if (!scenarios.length) return { ok: false, error: 'NO_SCENARIO' };
  const sc = scenarios[Math.floor(Math.random() * scenarios.length)];

  const course = courseOf_(chapter);
  const prompt = coursePrompt_('patient', course);
  if (!prompt) return { ok: false, error: 'NO_PROMPT' };

  const settings = getSettings_();
  const model = String(settings.live_model || '').trim().replace(/^models\//, '');
  if (!model) return { ok: false, error: 'NO_LIVE_MODEL' };

  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) return { ok: false, error: 'NO_API_KEY' };

  const patient = {
    name: String(sc.name || ''),
    sex: String(sc.sex || ''),
    dob: formatDob_(sc.dob),
    country: String(sc.country || ''),
    exam: String(sc.exam || '')
  };
  const instruction = String(prompt.text)
    .replace(/\{name\}/g, patient.name)
    .replace(/\{sex\}/g, patient.sex)
    .replace(/\{dob\}/g, patient.dob)
    .replace(/\{country\}/g, patient.country)
    .replace(/\{exam\}/g, patient.exam)
    .replace(/\{scene\}/g, String(chapter.scene || ''))
    .replace(/\{twist\}/g, String(sc.twist || ''))
    .replace(/\{keywords\}/g, String(chapter.keywords || ''));
  const instructionFull = withLearner_(instruction, student);

  // 받아쓰기 언어: 영어 과정은 영어+한국어. 중국어 과정은 시나리오의 country가 Taiwan이면 대만, 아니면 중국 본토 코드
  // (settings 탭의 zh_lang_taiwan / zh_lang_china) + 한국어 (학생이 막혀서 한국어로 말할 때).
  let lang = 'en-US';
  if (course === 'zh') {
    lang = /taiwan/i.test(patient.country)
      ? String(settings.zh_lang_taiwan || '').trim() || 'zh-TW'
      : String(settings.zh_lang_china || '').trim() || 'zh-CN';
  }

  const setup = {
    model: 'models/' + model,
    generationConfig: { responseModalities: ['AUDIO'] },
    systemInstruction: { parts: [{ text: instructionFull }] },
    // 학생 말 → 글자 (받아쓰기). 언어를 지정하지 않으면 자동 판단하다가 다른 언어(예: 스페인어)로 적는 경우가 있었다.
    // 한국어도 넣어 학생이 한국어로 말하면 한국어로 적히게 한다. 환자 이름·핵심 단어는 더 잘 알아듣도록 단어 힌트로 준다.
    // 모드는 기본값(VERBATIM, 들린 그대로)을 쓴다. SMART는 문법을 다듬어 학생의 실수가 지워진다.
    inputAudioTranscription: {
      languageCodes: [lang, 'ko-KR'],
      customVocabulary: [patient.name].concat(
        String(chapter.keywords || '').split(',').map(function (k) { return k.trim(); }).filter(Boolean))
    },
    outputAudioTranscription: { languageCodes: [lang] }   // 환자·상대(AI) 말 → 글자 (자막)
  };
  // 목소리: settings 탭의 voice_male / voice_female. 비어 있으면 Gemini 기본 목소리.
  const voice = String(settings[patient.sex.toLowerCase() === 'female' ? 'voice_female' : 'voice_male'] || '').trim();
  if (voice) setup.generationConfig.speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } };

  // bidiGenerateContentSetup을 넣고 fieldMask를 비우면, 브라우저가 보내는 설정 대신 이 설정이 통째로 쓰인다.
  const now = Date.now();
  const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify({
      uses: 1,
      // 앱이 maxSec에 맞춰 대화를 끝낸다. 토큰은 1분 여유를 두고 만료되어, 앱이 끝내지 못해도 Gemini가 끊는다.
      expireTime: new Date(now + maxSec * 1000 + 60000).toISOString(),
      newSessionExpireTime: new Date(now + 60000).toISOString(),
      bidiGenerateContentSetup: setup
    }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    // 구글의 오류 설명만 남긴다 (키와 토큰은 남기지 않는다).
    console.error('토큰 발급 실패 (응답 코드 ' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 800));
    return { ok: false, error: 'TOKEN_FAILED' };
  }
  const token = JSON.parse(res.getContentText()).name;
  if (!token) return { ok: false, error: 'TOKEN_FAILED' };

  return {
    ok: true,
    token: token,
    model: model,
    scenario_id: String(sc.scenario_id),
    patient: { name: patient.name, dob: patient.dob, exam: patient.exam }
  };
}

/** 생년월일이 날짜로 바뀌어 있어도 2003-05-11 형태의 글자로 돌려준다. */
function formatDob_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v || '');
}

/** 편집기에서 한 번 실행: 1장으로 임시 토큰이 발급되는지 확인한다. 토큰 자체는 출력하지 않는다. */
function testLiveToken() {
  const r = createLiveToken_('ch01');
  if (r.ok) {
    console.log('OK: 임시 토큰 발급 성공. 모델 ' + r.model + ', 시나리오 ' + r.scenario_id + ' (' + r.patient.name + ')');
  } else {
    console.log('실패: ' + r.error + ' — 바로 위에 빨간 오류 줄이 있으면 그 내용을 Claude에게 알려 주세요.');
  }
}


/* ───────────────────────── 9단계: 사용 시간 기록 ───────────────────────── */

// 대화가 끝난 이유: user(끝내기) / left(화면을 닫음) / closed(연결이 끊김) / error(연결 전에 실패) / limit(시간 한도)
const END_REASONS = ['user', 'left', 'closed', 'error', 'limit'];

/** 탭의 칸 이름(1행)에 맞춰 한 줄을 추가한다. 없는 칸은 비워 둔다. */
function appendRow_(name, obj) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  sheet.appendRow(headers.map(function (h) { return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : ''; }));
}

/** 토큰을 줄 때 sessions 탭에 시작 기록을 남긴다. 대화 내용은 남기지 않는다. */
function logSessionStart_(student, chapterId, scenarioId) {
  const id = Utilities.getUuid();
  appendRow_('sessions', {
    session_id: id,
    student_id: String(student.student_id),
    started_at: new Date(),
    chapter_id: chapterId,
    scenario_id: scenarioId,
    shared: false
  });
  return id;
}

/**
 * 대화가 끝나면 사용 시간(초)과 끝난 이유를 채운다. 이미 채워진 줄은 바꾸지 않는다.
 * 앱이 보낸 시간이 실제로 흐른 시간이나 대화 최대 시간보다 길면 그 값으로 자른다.
 */
function endSession_(code, sessionId, durationSec, endReason, aiAudioSec) {
  const auth = auth_(code);
  if (!auth.ok) return auth;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('sessions');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (h) { return String(h).trim(); });
  const col = function (name) { return headers.indexOf(name); };

  for (let i = values.length - 1; i >= 1; i--) {
    const row = values[i];
    if (String(row[col('session_id')]) !== sessionId) continue;
    if (String(row[col('student_id')]) !== String(auth.student.student_id)) return { ok: false, error: 'NOT_YOURS' };
    if (row[col('duration_sec')] !== '') return { ok: true };

    const started = row[col('started_at')];
    const elapsed = started instanceof Date ? (Date.now() - started.getTime()) / 1000 : LIVE_SESSION_MAX_MIN * 60;
    const sec = Math.round(Math.max(0, Math.min(Number(durationSec) || 0, elapsed, LIVE_SESSION_MAX_MIN * 60)));
    sheet.getRange(i + 1, col('duration_sec') + 1).setValue(sec);
    sheet.getRange(i + 1, col('end_reason') + 1).setValue(END_REASONS.indexOf(endReason) >= 0 ? endReason : 'unknown');
    // 예상 비용: 학생 말은 대화 전체 시간, AI 말은 앱이 받은 소리 길이(대화 시간을 넘지 않게).
    const aiSec = Math.max(0, Math.min(Number(aiAudioSec) || 0, sec));
    addCost_(sessionId, liveCost_(sec, aiSec));
    return { ok: true };
  }
  return { ok: false, error: 'NO_SESSION' };
}


/* ───────────────────────── 10단계: 하루 한도 ───────────────────────── */

/**
 * 오늘(시트의 시간대 기준) 이 학생의 대화 횟수와 사용 시간을 sessions 탭에서 센다.
 * 한도: 횟수 = settings의 daily_connect_limit, 시간(분) = students의 daily_limit_min → 없으면 settings의 default_daily_limit_min.
 * 끝 기록이 없는 대화는 실제로 흐른 시간(최대 15분)만큼 쓴 것으로 센다.
 */
function checkDailyLimit_(student) {
  const settings = getSettings_();
  const maxConnect = Number(settings.daily_connect_limit) || 20;
  const maxMin = Number(student.daily_limit_min) || Number(settings.default_daily_limit_min) || 30;
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  let count = 0;
  let usedSec = 0;
  readTable_('sessions').forEach(function (s) {
    if (String(s.student_id) !== String(student.student_id) || !(s.started_at instanceof Date)) return;
    if (Utilities.formatDate(s.started_at, tz, 'yyyy-MM-dd') !== today) return;
    count++;
    usedSec += s.duration_sec !== ''
      ? Number(s.duration_sec) || 0
      : Math.min((Date.now() - s.started_at.getTime()) / 1000, LIVE_SESSION_MAX_MIN * 60);
  });

  if (count >= maxConnect) return { ok: false, error: 'DAILY_CONNECT_LIMIT' };
  const remainingSec = Math.floor(maxMin * 60 - usedSec);
  if (remainingSec < 60) return { ok: false, error: 'DAILY_TIME_LIMIT' };
  return { ok: true, remainingSec: remainingSec };
}


/* ───────────────────────── 12단계: AI 피드백 ───────────────────────── */

// 텍스트 모델이 돌려줄 피드백의 모양 (JSON).
const FEEDBACK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    strengths: { type: 'ARRAY', items: { type: 'STRING' } },
    fixes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { said: { type: 'STRING' }, better: { type: 'STRING' }, why: { type: 'STRING' } },
        required: ['said', 'better', 'why']
      }
    },
    keywords: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { keyword: { type: 'STRING' }, used: { type: 'BOOLEAN' } }, required: ['keyword', 'used'] }
    },
    next_practice: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { en: { type: 'STRING' }, ko: { type: 'STRING' } }, required: ['en', 'ko'] }
    }
  },
  required: ['summary', 'strengths', 'fixes', 'keywords', 'next_practice']
};

// 중국어 피드백: 영어와 같은 항목 + 병음. next_practice의 문장은 zh로 받는다.
const ZH_FEEDBACK_SCHEMA = JSON.parse(JSON.stringify(FEEDBACK_SCHEMA));
ZH_FEEDBACK_SCHEMA.properties.fixes.items.properties.better_py = { type: 'STRING' };
ZH_FEEDBACK_SCHEMA.properties.fixes.items.required.push('better_py');
ZH_FEEDBACK_SCHEMA.properties.next_practice.items = {
  type: 'OBJECT', properties: { zh: { type: 'STRING' }, py: { type: 'STRING' }, ko: { type: 'STRING' } }, required: ['zh', 'py', 'ko']
};

const FEEDBACK_CACHE_SEC = 6 * 3600;   // 같은 대화의 피드백은 6시간 동안 다시 만들지 않고 그대로 준다
const FEEDBACK_MAX_TRIES = 3;          // 실패해도 한 대화에 3번까지만 시도

/**
 * 대화 글자를 받아 피드백을 만든다. 글자는 피드백을 만드는 데만 쓰고 시트에 저장하지 않는다.
 * 챕터와 시나리오는 앱이 보낸 값이 아니라 sessions 탭의 기록에서 찾는다.
 */
function feedback_(code, sessionId, lines) {
  const auth = auth_(code);
  if (!auth.ok) return auth;

  const session = readTable_('sessions').filter(function (s) { return String(s.session_id) === sessionId; })[0];
  if (!session) return { ok: false, error: 'NO_SESSION' };
  if (String(session.student_id) !== String(auth.student.student_id)) return { ok: false, error: 'NOT_YOURS' };

  const cache = CacheService.getScriptCache();
  const cached = cache.get('fb_' + sessionId);
  if (cached) return { ok: true, feedback: JSON.parse(cached) };
  const tries = Number(cache.get('fbn_' + sessionId) || 0);
  if (tries >= FEEDBACK_MAX_TRIES) return { ok: false, error: 'FEEDBACK_LIMIT' };
  cache.put('fbn_' + sessionId, String(tries + 1), FEEDBACK_CACHE_SEC);

  const chapter = readTable_('chapters').filter(function (c) { return String(c.chapter_id) === String(session.chapter_id); })[0];
  const scenario = readTable_('scenarios').filter(function (s) { return String(s.scenario_id) === String(session.scenario_id); })[0];
  if (!chapter || !scenario) return { ok: false, error: 'NO_CHAPTER' };

  const result = makeFeedback_(chapter, scenario, cleanLines_(lines), auth.student);
  if (result.cost) addCost_(sessionId, result.cost);
  delete result.cost;
  if (result.ok) cache.put('fb_' + sessionId, JSON.stringify(result.feedback), FEEDBACK_CACHE_SEC);
  return result;
}

/** 앱이 보낸 대화 글자를 정리한다: 최대 80줄, 한 줄 400자. */
function cleanLines_(lines) {
  return (Array.isArray(lines) ? lines : []).slice(0, 80)
    .map(function (l) { return { who: l && l.who === 'me' ? 'me' : 'ai', text: String((l && l.text) || '').trim().slice(0, 400) }; })
    .filter(function (l) { return l.text; });
}

function makeFeedback_(chapter, scenario, lines, student) {
  if (!lines.some(function (l) { return l.who === 'me'; })) return { ok: false, error: 'NO_TALK' };

  const course = courseOf_(chapter);
  const prompt = coursePrompt_('feedback', course);
  if (!prompt) return { ok: false, error: 'NO_PROMPT' };
  const zh = course === 'zh';

  const keywords = String(chapter.keywords || '').split(',').map(function (k) { return k.trim(); }).filter(Boolean);
  const system = String(prompt.text)
    .replace(/\{goal\}/g, String(chapter.goal || ''))
    .replace(/\{keywords\}/g, keywords.join(', '))
    .replace(/\{name\}/g, String(scenario.name || ''))
    .replace(/\{dob\}/g, formatDob_(scenario.dob))
    .replace(/\{exam\}/g, String(scenario.exam || ''));
  const systemFull = withLearner_(system, student);
  const who = zh ? ['Learner: ', 'Partner: '] : ['Nurse: ', 'Patient: '];
  const transcript = 'Transcript:\n' + lines.map(function (l) { return (l.who === 'me' ? who[0] : who[1]) + l.text; }).join('\n');

  const ai = callTextModel_(systemFull, transcript, zh ? ZH_FEEDBACK_SCHEMA : FEEDBACK_SCHEMA, '피드백');
  if (!ai.ok) return { ok: false, error: ai.error === 'AI_FAILED' ? 'FEEDBACK_FAILED' : ai.error, cost: ai.cost };
  const fb = ai.data;
  const cost = ai.cost;

  // 핵심 단어는 챕터의 목록 순서 그대로, 빠진 단어는 '안 씀'으로 맞춘다.
  const used = {};
  (fb.keywords || []).forEach(function (k) { used[String(k.keyword).trim().toLowerCase()] = k.used === true; });
  return {
    ok: true,
    cost: cost,
    feedback: {
      summary: String(fb.summary || ''),
      strengths: (fb.strengths || []).map(String).slice(0, 3),
      fixes: (fb.fixes || []).slice(0, 3).map(function (f) {
        const out = { said: String(f.said || ''), better: String(f.better || ''), why: String(f.why || '') };
        if (zh) out.better_py = String(f.better_py || '');
        return out;
      }),
      keywords: keywords.map(function (k) { return { keyword: k, used: used[k.toLowerCase()] === true }; }),
      // 앱과 내 기록은 연습 문장을 en 칸으로 읽는다 (중국어 과정에서도 같은 칸에 중국어 문장, py에 병음).
      next_practice: (fb.next_practice || []).slice(0, 2).map(function (n) {
        return zh ? { en: String(n.zh || ''), py: String(n.py || ''), ko: String(n.ko || '') }
                  : { en: String(n.en || ''), ko: String(n.ko || '') };
      })
    }
  };
}

/**
 * 텍스트 모델(settings의 text_model)을 generateContent + JSON 형식으로 부른다. 피드백과 챕터별 AI 정리가 함께 쓴다.
 * 모델이 붐비면(503) 또는 잠시 요청이 많으면(429, 500) 2초, 4초 기다렸다 최대 2번 더 시도한다.
 * 결과: { ok, data(JSON), cost(달러) } 또는 { ok: false, error, cost }
 */
function callTextModel_(system, userText, schema, what, opts) {
  opts = opts || {};
  // opts.model: 이 요청만 다른 모델 (예: 병음·뜻은 가벼운 모델), opts.thinkingLevel: 생각 단계 (기본 low)
  const model = String(opts.model || getSettings_().text_model || '').trim().replace(/^models\//, '');
  if (!model) return { ok: false, error: 'NO_TEXT_MODEL' };
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) return { ok: false, error: 'NO_API_KEY' };

  const request = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      // userText는 글자, 또는 소리 등이 들어간 parts 배열
      contents: [{ role: 'user', parts: Array.isArray(userText) ? userText : [{ text: userText }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        thinkingConfig: { thinkingLevel: opts.thinkingLevel || 'low' },   // 빠르고 저렴하게
        maxOutputTokens: 4096
      }
    }),
    muteHttpExceptions: true
  };
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) Utilities.sleep(2000 * attempt);
    res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', request);
    if ([429, 500, 503].indexOf(res.getResponseCode()) < 0) break;
  }
  if (res.getResponseCode() !== 200) {
    console.error(what + ' 실패 (응답 코드 ' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 800));
    return { ok: false, error: 'AI_FAILED', cost: 0 };
  }
  let cost = 0;
  try {
    const body = JSON.parse(res.getContentText());
    cost = textCost_(body.usageMetadata);   // Gemini가 알려 주는 실제 토큰 수로 계산
    const cand = (body.candidates || [])[0] || {};
    const text = ((cand.content && cand.content.parts) || [])
      .filter(function (p) { return !p.thought; })
      .map(function (p) { return p.text || ''; }).join('');
    return { ok: true, data: JSON.parse(text), cost: cost };
  } catch (err) {
    console.error(what + ' 결과를 읽지 못함: ' + res.getContentText().slice(0, 800));
    return { ok: false, error: 'AI_FAILED', cost: cost };
  }
}

/** 편집기에서 실행: 예시 대화로 피드백이 만들어지는지 확인한다. */
function testFeedback() {
  const chapter = readTable_('chapters').filter(function (c) { return String(c.chapter_id) === 'ch01'; })[0];
  const scenario = readTable_('scenarios').filter(function (s) { return String(s.scenario_id) === 'ch01-s02'; })[0];
  const r = makeFeedback_(chapter, scenario, [
    { who: 'me', text: 'Miss Kelly Shu, please come to the counter.' },
    { who: 'ai', text: "Yes, that's me." },
    { who: 'me', text: 'Tell me birthday.' },
    { who: 'ai', text: 'May eleventh, two thousand and three.' },
    { who: 'me', text: '잠시만요. 오케이, 땡큐.' }
  ]);
  if (r.ok) console.log('OK: 피드백 생성 성공\n' + JSON.stringify(r.feedback, null, 2));
  else console.log('실패: ' + r.error + ' — 바로 위에 빨간 오류 줄이 있으면 그 내용을 Claude에게 알려 주세요.');
}


/* ───────────────────────── 13단계: 공유 선택 ───────────────────────── */

/**
 * 학생이 '공유하기'를 고른 대화를 시트에 저장한다.
 * sessions: shared=TRUE, confidence(1~3), difficulty_note, feedback(서버가 만든 피드백, JSON 글자)
 * transcripts: 대화 한 줄씩 / keyword_checks: 핵심 단어별 사용 여부
 * 피드백은 앱이 보낸 값이 아니라 서버가 만들어 기억해 둔 것을 쓴다. 이미 공유된 대화는 다시 저장하지 않는다.
 */
function share_(code, sessionId, confidence, difficulty, lines) {
  const auth = auth_(code);
  if (!auth.ok) return auth;

  const lock = LockService.getScriptLock();   // 같은 대화를 두 번 눌러도 한 번만 저장되도록
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('sessions');
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(function (h) { return String(h).trim(); });
    const col = function (name) { return headers.indexOf(name); };

    let r = -1;
    for (let i = values.length - 1; i >= 1; i--) {
      if (String(values[i][col('session_id')]) === sessionId) { r = i; break; }
    }
    if (r < 0) return { ok: false, error: 'NO_SESSION' };
    const row = values[r];
    if (String(row[col('student_id')]) !== String(auth.student.student_id)) return { ok: false, error: 'NOT_YOURS' };
    if (isTrue_(row[col('shared')])) return { ok: true };   // 이미 저장됨

    const cached = CacheService.getScriptCache().get('fb_' + sessionId);
    const fb = cached ? JSON.parse(cached) : null;
    const conf = [1, 2, 3].indexOf(Number(confidence)) >= 0 ? Number(confidence) : '';
    const set = function (name, value) { if (col(name) >= 0) sheet.getRange(r + 1, col(name) + 1).setValue(value); };
    set('shared', true);
    set('confidence', conf);
    set('difficulty_note', String(difficulty || '').trim().slice(0, 300));
    set('feedback', fb ? JSON.stringify(fb) : '');

    const now = new Date();
    cleanLines_(lines).forEach(function (l, i) {
      appendRow_('transcripts', { session_id: sessionId, seq: i + 1, speaker: l.who === 'me' ? 'nurse' : 'patient', text: l.text, at: now });
    });
    if (fb) {
      fb.keywords.forEach(function (k) {
        appendRow_('keyword_checks', {
          session_id: sessionId, student_id: String(auth.student.student_id),
          chapter_id: String(row[col('chapter_id')]), keyword: k.keyword, found: k.used
        });
      });
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}


/* ───────────────────────── 14단계: 월 예산 ───────────────────────── */

/** settings 탭의 요금. 비어 있으면 2026-10 공식 요금표 값. */
function rates_() {
  const s = getSettings_();
  const num = function (key, dflt) { const v = Number(s[key]); return isFinite(v) && s[key] !== '' && s[key] !== undefined ? v : dflt; };
  return {
    budget: num('monthly_budget_usd', 15),
    liveIn: num('live_in_usd_per_min', 0.005),
    liveOut: num('live_out_usd_per_min', 0.018),
    textIn: num('text_in_usd_per_m', 0.75),
    textOut: num('text_out_usd_per_m', 3.75),
    factor: num('cost_safety_factor', 1.5)
  };
}

/** 음성 대화의 예상 비용(달러): 학생 말 sec초 + AI 말 aiSec초, 여유 배수 포함. */
function liveCost_(sec, aiSec, r) {
  r = r || rates_();
  return (sec / 60 * r.liveIn + aiSec / 60 * r.liveOut) * r.factor;
}

/** 피드백의 비용(달러): Gemini가 알려 준 토큰 수(입력, 출력 + 생각)로 계산, 여유 배수 포함. */
function textCost_(usage) {
  if (!usage) return 0;
  const r = rates_();
  const inTok = Number(usage.promptTokenCount) || 0;
  const outTok = (Number(usage.candidatesTokenCount) || 0) + (Number(usage.thoughtsTokenCount) || 0);
  return (inTok * r.textIn + outTok * r.textOut) / 1e6 * r.factor;
}

/** sessions 탭의 그 대화 줄의 est_cost_usd에 비용을 더한다. */
function addCost_(sessionId, usd) {
  if (!(usd > 0)) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('sessions');
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(function (h) { return String(h).trim(); });
    const c = headers.indexOf('est_cost_usd');
    const id = headers.indexOf('session_id');
    if (c < 0) return;
    for (let i = values.length - 1; i >= 1; i--) {
      if (String(values[i][id]) !== sessionId) continue;
      const before = Number(values[i][c]) || 0;
      sheet.getRange(i + 1, c + 1).setValue(Math.round((before + usd) * 10000) / 10000);
      return;
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * 이번 달(시트 시간대 기준) 모든 학생의 예상 비용 합계.
 * 비용이 적히지 않은 대화(끝 기록이 없거나 v0.14 이전)는 최악의 경우(학생 말·AI 말 모두 전체 시간)로 센다.
 */
function monthSpent_(r) {
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const month = Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  let total = 0;
  readTable_('sessions').forEach(function (s) {
    if (!(s.started_at instanceof Date) || Utilities.formatDate(s.started_at, tz, 'yyyy-MM') !== month) return;
    if (s.est_cost_usd !== '' && s.est_cost_usd !== undefined) { total += Number(s.est_cost_usd) || 0; return; }
    const sec = s.duration_sec !== ''
      ? Number(s.duration_sec) || 0
      : Math.min((Date.now() - s.started_at.getTime()) / 1000, LIVE_SESSION_MAX_MIN * 60);
    total += liveCost_(sec, sec, r);
  });
  // 발음 코칭 비용 (21단계)
  readTable_('pron_checks').forEach(function (p) {
    if (p.at instanceof Date && Utilities.formatDate(p.at, tz, 'yyyy-MM') === month) total += Number(p.cost_usd) || 0;
  });
  return total;
}

/** 남은 예산으로 대화할 수 있는 시간(초). 최악의 경우(AI가 내내 말함)로 계산한다. 1분도 안 되면 막는다. */
function checkBudget_() {
  const r = rates_();
  const left = r.budget - monthSpent_(r);
  const perSec = liveCost_(1, 1, r);
  const remainingSec = Math.floor(left / perSec);
  if (remainingSec < 60) return { ok: false, error: 'MONTHLY_BUDGET' };
  return { ok: true, remainingSec: remainingSec };
}

/** 편집기에서 실행: 이번 달 예상 비용과 남은 예산을 보여 준다. */
function budgetReport() {
  const r = rates_();
  const spent = monthSpent_(r);
  const worstMin = Math.max(0, (r.budget - spent) / liveCost_(60, 60, r));
  console.log('이번 달 예상 비용: $' + spent.toFixed(2) + ' / 예산 $' + r.budget +
    '\n남은 예산: $' + Math.max(0, r.budget - spent).toFixed(2) + ' (AI가 내내 말하는 최악의 경우 약 ' + Math.floor(worstMin) + '분 대화 가능)' +
    '\n요금: 음성 입력 $' + r.liveIn + '/분, 출력 $' + r.liveOut + '/분, 여유 배수 ' + r.factor);
}


/* ───────────────────────── 17단계: 선생님용 요약 ───────────────────────── */

/** 시트를 열 때 위쪽 메뉴에 'Tutoreal'을 붙인다. (시트에 연결된 스크립트라 자동으로 실행된다) */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Tutoreal')
    .addItem('요약 새로고침', 'refreshSummary')
    .addToUi();
}

/** 메뉴에서 실행: 요약을 계산하고 챕터별 AI 정리를 붙여 summary 탭에 적는다. */
function refreshSummary() {
  const all = buildAllSummaries_();
  all.forEach(updateInsights_);
  writeSummary_(all);
  SpreadsheetApp.getActiveSpreadsheet().toast('요약을 새로 만들었어요 (' + all.map(function (sm) {
    return (all.length > 1 ? sm.course_label + ' ' : '') + sm.period.label; }).join(', ') + ')', 'Tutoreal');
}

/**
 * 요약 기간: settings의 last_class_date(지난 수업일)부터 오늘까지. 비어 있으면 최근 7일(오늘 포함).
 * 날짜는 시트의 시간대 기준 'yyyy-MM-dd' 글자로 비교한다.
 */
function summaryPeriod_(tz, course) {
  const fmt = function (d) { return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); };
  const today = fmt(new Date());
  // 과정마다 수업일이 다르다: 영어 외 과정은 last_class_date_<과정>(예: last_class_date_zh)이 있으면 그것을 쓴다.
  const settings = getSettings_();
  const own = course && course !== 'en' ? settings['last_class_date_' + course] : '';
  const hasOwn = own instanceof Date || String(own || '').trim() !== '';
  const v = hasOwn ? own : settings.last_class_date;
  let from = '';
  if (v instanceof Date) from = fmt(v);
  else if (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '').trim())) from = String(v).trim();
  if (from && from <= today) return { from: from, to: today, label: from + ' ~ ' + today + ' (지난 수업일 이후)' };
  from = fmt(new Date(Date.now() - 6 * 86400000));
  return { from: from, to: today, label: from + ' ~ ' + today + ' (최근 7일)' };
}

// 과정 이름 (선생님 요약·summary 탭에 쓴다)
const COURSE_LABEL = { en: '영어', zh: '중국어' };

/** 요약할 과정 목록: 활성 학생이 있거나 공개 챕터가 있는 과정. 영어가 먼저. */
function summaryCourses_() {
  const set = {};
  readTable_('students').forEach(function (s) {
    if (s.student_id && String(s.status).trim().toLowerCase() === 'active') set[courseOf_(s)] = true;
  });
  readTable_('chapters').forEach(function (c) { if (c.chapter_id && isTrue_(c.published)) set[courseOf_(c)] = true; });
  return Object.keys(set).sort(function (a, b) { return (a === 'en' ? 0 : 1) - (b === 'en' ? 0 : 1) || (a < b ? -1 : 1); });
}

/** 모든 과정의 요약을 만든다 (summary 탭과 '새로 정리하기'용). */
function buildAllSummaries_() {
  const list = summaryCourses_();
  return (list.length ? list : ['en']).map(function (c) { return buildSummary_(c); });
}

/**
 * 기간 안의 기록을 정리한다. 앱의 선생님 화면(19단계)도 이 결과를 그대로 쓴다.
 * 횟수·시간은 모든 대화로, 자기 평가·핵심 단어·어려웠던 점은 '공유하기'를 고른 대화로만 계산한다.
 */
function buildSummary_(course) {
  course = course || 'en';
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const period = summaryPeriod_(tz, course);
  // 과정별로 따로 정리한다 (29단계): 이 과정의 학생·챕터·대화만. 비용도 이 과정의 대화만 (비활성 학생 포함).
  // 대화는 챕터의 과정으로 나눈다 (선생님이 다른 과정 챕터를 연습해도 그 과정에 들어가게). 챕터를 못 찾으면 학생의 과정.
  const allStudents = readTable_('students');
  const studentCourse = {};
  allStudents.forEach(function (s) { studentCourse[String(s.student_id)] = courseOf_(s); });
  const chapterCourse = {};
  readTable_('chapters').forEach(function (c) { chapterCourse[String(c.chapter_id)] = courseOf_(c); });
  const sessionCourse = function (s) { return chapterCourse[String(s.chapter_id)] || studentCourse[String(s.student_id)] || 'en'; };

  // 기간 안의 모든 대화(비용 계산용)와, 그중 활성 학생의 대화(나머지 통계용)
  const allInPeriod = readTable_('sessions').filter(function (s) {
    if (!(s.started_at instanceof Date)) return false;
    const day = Utilities.formatDate(s.started_at, tz, 'yyyy-MM-dd');
    return day >= period.from && day <= period.to && sessionCourse(s) === course;
  });
  // 학생: 이 과정의 활성 학생 + 이 기간에 이 과정 챕터를 연습한 다른 활성 사람(예: 선생님)
  const practiced = {};
  allInPeriod.forEach(function (s) { practiced[String(s.student_id)] = true; });
  const students = allStudents.filter(function (s) {
    return s.student_id && String(s.status).trim().toLowerCase() === 'active' &&
      (courseOf_(s) === course || practiced[String(s.student_id)]);
  });
  const nameOf = {};
  const avatarOf = {};
  students.forEach(function (s) {
    nameOf[String(s.student_id)] = String(s.display_name || s.student_id);
    avatarOf[String(s.student_id)] = String(s.avatar || '').trim();
  });
  const sessions = allInPeriod.filter(function (s) { return nameOf[String(s.student_id)] !== undefined; });
  const inPeriod = {};
  sessions.forEach(function (s) { inPeriod[String(s.session_id)] = s; });

  // 챕터: 공개된 챕터 + 기간 안에 연습 기록이 있는 챕터, 순서대로
  const chapterRows = readTable_('chapters');
  const used = {};
  sessions.forEach(function (s) { used[String(s.chapter_id)] = true; });
  const chapters = chapterRows
    .filter(function (c) { return c.chapter_id && courseOf_(c) === course && (isTrue_(c.published) || used[String(c.chapter_id)]); })
    .sort(function (a, b) { return Number(a.order) - Number(b.order); })
    .map(function (c) {
      return {
        chapter_id: String(c.chapter_id), order: Number(c.order), title: String(c.title || ''),
        keywords: String(c.keywords || '').split(',').map(function (k) { return k.trim(); }).filter(Boolean)
      };
    });

  const sec = function (s) { return Number(s.duration_sec) || 0; };
  const avg = function (list) { return list.length ? Math.round(list.reduce(function (a, b) { return a + b; }, 0) / list.length * 10) / 10 : null; };
  const confOf = function (s) { const c = Number(s.confidence); return isTrue_(s.shared) && c >= 1 && c <= 3 ? c : null; };

  // 학생 × 챕터
  const matrix = {};
  students.forEach(function (st) { matrix[String(st.student_id)] = {}; });
  sessions.forEach(function (s) {
    const sid = String(s.student_id);
    if (!matrix[sid]) return;   // 비활성 학생은 표에서 뺀다
    const cell = matrix[sid][String(s.chapter_id)] || (matrix[sid][String(s.chapter_id)] = { count: 0, sec: 0 });
    cell.count++;
    cell.sec += sec(s);
  });

  // 핵심 단어 체크 (공유된 대화만 기록되어 있다)
  const checks = readTable_('keyword_checks').filter(function (k) { return inPeriod[String(k.session_id)]; });

  const chapterStats = chapters.map(function (c) {
    const list = sessions.filter(function (s) { return String(s.chapter_id) === c.chapter_id; });
    const shared = list.filter(function (s) { return isTrue_(s.shared); });
    const kw = c.keywords.map(function (k) {
      const rows = checks.filter(function (r) { return String(r.chapter_id) === c.chapter_id && String(r.keyword).toLowerCase() === k.toLowerCase(); });
      const yes = rows.filter(function (r) { return isTrue_(r.found); }).length;
      return { keyword: k, used: yes, total: rows.length };
    });
    return {
      chapter_id: c.chapter_id, order: c.order, title: c.title,
      insight: storedInsight_(c.chapter_id, period, shared.length),
      students: Object.keys(list.reduce(function (m, s) { m[String(s.student_id)] = 1; return m; }, {})).length,
      count: list.length,
      minutes: Math.round(list.reduce(function (a, s) { return a + sec(s); }, 0) / 60),
      shared: shared.length,
      confidence: avg(shared.map(confOf).filter(function (c) { return c !== null; })),
      keywords: kw,
      difficulties: shared.filter(function (s) { return String(s.difficulty_note || '').trim(); }).map(function (s) {
        return { student_id: String(s.student_id), student: nameOf[String(s.student_id)] || String(s.student_id), text: String(s.difficulty_note).trim() };
      })
    };
  });

  const studentStats = students.map(function (st) {
    const sid = String(st.student_id);
    const list = sessions.filter(function (s) { return String(s.student_id) === sid; });
    const shared = list.filter(function (s) { return isTrue_(s.shared); });
    const top = chapters.map(function (c) { return { c: c, n: (matrix[sid][c.chapter_id] || {}).count || 0 }; })
      .filter(function (x) { return x.n; }).sort(function (a, b) { return b.n - a.n; })
      .map(function (x) { return x.c.order + '장'; });
    return {
      student_id: sid, name: nameOf[sid], avatar: avatarOf[sid] || '',
      count: list.length,
      minutes: Math.round(list.reduce(function (a, s) { return a + sec(s); }, 0) / 60),
      chapters: top,
      confidence: avg(shared.map(confOf).filter(function (c) { return c !== null; })),
      shared: shared.length
    };
  });

  return {
    course: course,
    course_label: COURSE_LABEL[course] || course,
    courses: summaryCourses_().map(function (c) { return { course: c, label: COURSE_LABEL[c] || c }; }),
    period: period,
    generated_at: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm'),
    totals: {
      students: studentStats.filter(function (s) { return s.count; }).length,
      count: sessions.length,
      minutes: Math.round(sessions.reduce(function (a, s) { return a + sec(s); }, 0) / 60),
      cost_usd: Math.round(allInPeriod.reduce(function (a, s) { return a + (Number(s.est_cost_usd) || 0); }, 0) * 100) / 100
    },
    chapters: chapters.map(function (c) { return { chapter_id: c.chapter_id, order: c.order, title: c.title }; }),
    matrix: matrix,
    chapterStats: chapterStats,
    studentStats: studentStats
  };
}

/** 요약을 summary 탭에 적는다. 1행(item, value)은 그대로 두고 2행부터 새로 쓴다. */
function writeSummary_(list) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('summary');
  const rows = [];
  const bold = [];
  list = Array.isArray(list) ? list : [list];
  const title = function (text) { bold.push(rows.length); rows.push([text]); };
  const blank = function () { rows.push(['']); };
  const pct = function (k) { return k.total ? Math.round(k.used / k.total * 100) + '% (' + k.used + '/' + k.total + ')' : '–'; };
  const label = function (c) { return c.order + '장 ' + c.title; };

  // 과정이 여러 개면 과정마다 같은 순서로 이어서 적는다 (영어 과정 → 중국어 과정)
  list.forEach(function (sm, n) {
    if (n) { blank(); blank(); }
    title(list.length > 1 ? 'Tutoreal 요약 — ' + sm.course_label + ' 과정' : 'Tutoreal 요약');
    rows.push(['기간', sm.period.label]);
    rows.push(['만든 시각', sm.generated_at]);
    blank();

    title('전체');
    rows.push(['연습한 학생', sm.totals.students]);
    rows.push(['연습 횟수', sm.totals.count]);
    rows.push(['연습 시간(분)', sm.totals.minutes]);
    rows.push(['예상 비용(USD, 이 과정, 비활성 학생 포함)', sm.totals.cost_usd]);
    blank();

    title('학생 × 챕터 (횟수 / 분)');
    bold.push(rows.length);
    rows.push(['학생'].concat(sm.chapters.map(label), ['합계']));
    sm.studentStats.forEach(function (st) {
      const cells = sm.chapters.map(function (c) {
        const cell = sm.matrix[st.student_id][c.chapter_id];
        return cell ? cell.count + '회 ' + Math.round(cell.sec / 60) + '분' : '–';
      });
      rows.push([st.name].concat(cells, [st.count ? st.count + '회 ' + st.minutes + '분' : '–']));
    });
    blank();

    title('챕터별 (자기 평가·핵심 단어·어려웠던 점은 공유된 대화 기준)');
    sm.chapterStats.forEach(function (c) {
      bold.push(rows.length);
      rows.push([label(c)]);
      rows.push(['연습', '학생 ' + c.students + '명 · ' + c.count + '회 · ' + c.minutes + '분']);
      rows.push(['공유된 대화', c.shared ? c.shared + '개' : '공유된 대화가 없어요']);
      if (c.shared) {
        rows.push(['자기 평가 평균 (1~3)', c.confidence === null ? '–' : c.confidence]);
        c.keywords.forEach(function (k) { rows.push(['핵심 단어: ' + k.keyword, pct(k)]); });
        c.difficulties.forEach(function (d) { rows.push(['어려웠던 점 (' + d.student + ')', d.text]); });
        if (c.insightError) rows.push(['AI 정리', '만들지 못했어요 — ' + c.insightError]);
        if (c.insight) {
          rows.push(['AI 정리', '공유된 대화 ' + c.insight.shared + '개 기준 · ' + c.insight.at]);
          c.insight.common_mistakes.forEach(function (m, i) {
            rows.push(['자주 틀린 표현 ' + (i + 1), m.point + ' (' + m.count + '회)']);
            rows.push(['', '예: ' + m.example + '  →  ' + m.better]);
          });
          c.insight.teaching_points.forEach(function (p, i) { rows.push([i ? '' : '수업 포인트', p]); });
        }
      }
      blank();
    });

    title('학생별');
    bold.push(rows.length);
    rows.push(['학생', '연습 횟수', '연습 시간(분)', '주로 연습한 챕터', '자기 평가 평균', '공유한 대화']);
    sm.studentStats.forEach(function (st) {
      rows.push([st.name, st.count, st.minutes, st.chapters.join(', ') || '–', st.confidence === null ? '–' : st.confidence, st.shared]);
    });
  });

  // 모두 글자로 적는다: 날짜·숫자로 바뀌어 정렬이 섞이지 않게
  const width = rows.reduce(function (w, r) { return Math.max(w, r.length); }, 2);
  const grid = rows.map(function (r) { return r.concat(Array(width - r.length).fill('')).map(String); });
  const last = Math.max(sheet.getLastRow(), 2);
  sheet.getRange(2, 1, last, Math.max(sheet.getLastColumn(), width)).clearContent().setFontWeight('normal');
  const body = sheet.getRange(2, 1, grid.length, width);
  body.setNumberFormat('@').setHorizontalAlignment('left').setValues(grid);
  bold.forEach(function (i) { sheet.getRange(i + 2, 1, 1, width).setFontWeight('bold'); });
  body.setWrap(true);   // 긴 문장(AI 정리 등)은 칸 안에서 줄바꿈
  SpreadsheetApp.flush();   // 다 적은 다음에 너비를 맞춰야 잘리지 않는다
  sheet.autoResizeColumns(1, width);
  for (let c = 1; c <= width; c++) {
    const w = sheet.getColumnWidth(c);
    if (w < 110) sheet.setColumnWidth(c, 110);
    if (w > 360) sheet.setColumnWidth(c, 360);   // 너무 넓어져 옆 표가 밀리지 않게
  }
}


/* ───────────────────────── 18단계: 챕터별 AI 정리 ───────────────────────── */

const INSIGHT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    common_mistakes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { point: { type: 'STRING' }, example: { type: 'STRING' }, better: { type: 'STRING' }, count: { type: 'INTEGER' } },
        required: ['point', 'example', 'better', 'count']
      }
    },
    teaching_points: { type: 'ARRAY', items: { type: 'STRING' } }
  },
  required: ['common_mistakes', 'teaching_points']
};

/**
 * 저장해 둔 챕터별 정리(스크립트 속성 insight_챕터번호)를 읽는다. 같은 기간 시작일이고 공유된 대화 수가 같을 때만 쓴다.
 * 스크립트 속성 한 칸은 9KB까지라 글자 길이를 줄여서 저장한다.
 */
function storedInsight_(chapterId, period, sharedCount) {
  const raw = PropertiesService.getScriptProperties().getProperty('insight_' + chapterId);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v.from === period.from && v.shared === sharedCount ? v : null;
  } catch (err) {
    return null;
  }
}

/** 공유된 대화가 있고 저장된 정리가 없거나 낡은 챕터만 AI로 새로 정리한다. */
function updateInsights_(sm) {
  const chapters = readTable_('chapters');
  const shared = readTable_('sessions').filter(function (s) {
    return isTrue_(s.shared) && s.started_at instanceof Date &&
      Utilities.formatDate(s.started_at, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd') >= sm.period.from;
  });
  sm.chapterStats.forEach(function (c) {
    if (!c.shared || c.insight) return;
    const chapter = chapters.filter(function (x) { return String(x.chapter_id) === c.chapter_id; })[0];
    const list = shared.filter(function (s) { return String(s.chapter_id) === c.chapter_id; });
    const insight = makeInsight_(chapter, c, list);
    if (insight.error) { c.insightError = insight.error; return; }
    insight.from = sm.period.from;
    insight.shared = c.shared;
    insight.at = sm.generated_at;
    PropertiesService.getScriptProperties().setProperty('insight_' + c.chapter_id, JSON.stringify(insight));
    c.insight = insight;
  });
}

/** 결과: 정리 객체, 또는 만들지 못한 이유 { error: '…' } */
function makeInsight_(chapter, stat, sessions) {
  if (!chapter) return { error: '챕터 정보를 찾지 못했어요.' };
  const prompt = coursePrompt_('insight', courseOf_(chapter));
  if (!prompt) return { error: 'prompts 탭에 이 과정의 insight 지시문이 없어요. 편집기에서 setup을 실행해 주세요.' };

  const items = [];
  sessions.forEach(function (s) {
    let fb = null;
    try { fb = JSON.parse(String(s.feedback || '')); } catch (err) { fb = null; }
    ((fb && fb.fixes) || []).forEach(function (f) {
      if (items.length < 40) items.push('Said: ' + f.said + ' | Better: ' + f.better + ' | Why: ' + f.why);
    });
  });
  if (!items.length) return { error: '공유된 피드백에 고칠 문장이 없어요.' };

  const missed = stat.keywords.filter(function (k) { return k.total && k.used < k.total; })
    .map(function (k) { return k.keyword + ' (used ' + k.used + '/' + k.total + ')'; });
  const notes = stat.difficulties.map(function (d) { return d.text; });
  const userText = 'Feedback items:\n' + items.map(function (t, i) { return (i + 1) + '. ' + t; }).join('\n') +
    (missed.length ? '\n\nKey expressions often missed: ' + missed.join(', ') : '') +
    (notes.length ? '\n\nDifficulties written by ' + (courseOf_(chapter) === 'en' ? 'nurses' : 'the learner') + ' (Korean): ' + notes.join(' / ') : '');

  const system = String(prompt.text)
    .replace(/\{chapter\}/g, stat.order + '. ' + stat.title)
    .replace(/\{goal\}/g, String(chapter.goal || ''))
    .replace(/\{keywords\}/g, String(chapter.keywords || ''));
  const ai = callTextModel_(system, userText, INSIGHT_SCHEMA, '챕터 정리');
  if (!ai.ok) {
    return { error: ai.error === 'AI_FAILED'
      ? 'AI 호출에 실패했어요. 잠시 뒤 다시 새로고침해 주세요. (자세한 내용: 편집기 실행 기록)'
      : '설정을 확인해 주세요 (' + ai.error + ').' };
  }

  const cut = function (v, n) { return String(v || '').slice(0, n); };
  return {
    common_mistakes: (ai.data.common_mistakes || []).slice(0, 5).map(function (m) {
      return { point: cut(m.point, 100), example: cut(m.example, 160), better: cut(m.better, 160), count: Number(m.count) || 1 };
    }),
    teaching_points: (ai.data.teaching_points || []).slice(0, 3).map(function (p) { return cut(p, 200); }),
    cost: Math.round(ai.cost * 10000) / 10000
  };
}


/* ───────────────────────── 19단계: 선생님 화면 ───────────────────────── */

/** students 탭의 role 칸: 'teacher'면 선생님, 그 밖(비어 있음 포함)은 학생. */
function roleOf_(student) {
  return String(student.role || '').trim().toLowerCase() === 'teacher' ? 'teacher' : 'student';
}

/**
 * 선생님에게만 요약을 준다 (시트 summary 탭과 같은 계산). refresh면 AI 정리를 갱신하고 summary 탭도 새로 쓴다.
 * 학생 상세 화면을 늘릴 때는 학생 한 명의 공유 기록을 주는 요청을 따로 추가한다 (이 응답을 무겁게 만들지 않도록).
 */
function teacherSummary_(code, refresh, course) {
  const auth = auth_(code);
  if (!auth.ok) return auth;
  if (roleOf_(auth.student) !== 'teacher') return { ok: false, error: 'NOT_TEACHER' };
  // 과정을 고르지 않았거나 없는 과정이면 선생님 자신의 과정 (없으면 첫 과정)
  const courses = summaryCourses_();
  course = String(course || '').trim().toLowerCase();
  if (courses.indexOf(course) < 0) course = courses.indexOf(courseOf_(auth.student)) >= 0 ? courseOf_(auth.student) : (courses[0] || 'en');
  if (refresh) {
    // summary 탭은 모든 과정을 한 번에 다시 쓴다
    const all = buildAllSummaries_();
    all.forEach(updateInsights_);
    writeSummary_(all);
    return { ok: true, summary: all.filter(function (sm) { return sm.course === course; })[0] || all[0] };
  }
  return { ok: true, summary: buildSummary_(course) };
}


/* ───────────────────────── 21단계: 발음 코칭 ───────────────────────── */

/* ───────────────────────── 25단계: 중국어 자막의 병음과 한국어 뜻 ───────────────────────── */

const GLOSS_MAX_PER_SESSION = 80;   // 한 대화에서 병음·뜻을 받을 수 있는 줄 수
const GLOSS_MAX_CHARS = 300;        // 한 줄 최대 글자 수
const GLOSS_SCHEMA = {
  type: 'OBJECT',
  properties: { pinyin: { type: 'STRING' }, ko: { type: 'STRING' } },
  required: ['pinyin', 'ko']
};

/**
 * 대화 중 상대(AI)가 한 말 한 줄의 병음과 한국어 뜻. 지시문은 과정별(zh-gloss-…)이라 영어 과정은 NO_PROMPT.
 * 글자는 이 요청에만 쓰고 저장하지 않는다. 비용은 그 대화(sessions 탭)에 더해 월 예산에 들어간다.
 */
function gloss_(code, sessionId, text) {
  const auth = auth_(code);
  if (!auth.ok) return auth;
  text = text.trim().slice(0, GLOSS_MAX_CHARS);
  if (!text) return { ok: false, error: 'NO_TEXT' };

  const session = readTable_('sessions').filter(function (s) { return String(s.session_id) === sessionId; })[0];
  if (!session) return { ok: false, error: 'NO_SESSION' };
  if (String(session.student_id) !== String(auth.student.student_id)) return { ok: false, error: 'NOT_YOURS' };

  // 과정은 그 대화의 챕터를 따른다 (선생님이 중국어 챕터를 연습할 때도 중국어 지시문)
  const chapter = readTable_('chapters').filter(function (c) { return String(c.chapter_id) === String(session.chapter_id); })[0];
  const prompt = coursePrompt_('gloss', chapter ? courseOf_(chapter) : courseOf_(auth.student));
  if (!prompt) return { ok: false, error: 'NO_PROMPT' };

  const cache = CacheService.getScriptCache();
  const n = Number(cache.get('gl_' + sessionId) || 0);
  if (n >= GLOSS_MAX_PER_SESSION) return { ok: false, error: 'GLOSS_LIMIT' };
  cache.put('gl_' + sessionId, String(n + 1), FEEDBACK_CACHE_SEC);
  const budget = checkBudget_();
  if (!budget.ok) return budget;

  // 대화 중에 바로 보여야 하므로 가벼운 모델(settings의 gloss_model)을 가장 짧은 생각(minimal)으로 쓴다.
  // text_model(gemini-3.8-flash)은 minimal이 없어 한 줄에 15~37초가 걸렸다 (2026-10-13 실행 기록).
  const glossModel = String(getSettings_().gloss_model || '').trim();
  const ai = callTextModel_(String(prompt.text), text, GLOSS_SCHEMA, '병음·뜻',
    glossModel ? { model: glossModel, thinkingLevel: 'minimal' } : null);
  if (ai.cost) addCost_(sessionId, ai.cost);
  if (!ai.ok) return { ok: false, error: 'GLOSS_FAILED' };
  return { ok: true, pinyin: String(ai.data.pinyin || '').trim(), ko: String(ai.data.ko || '').trim() };
}

// 발음 코칭의 {mode}: 학생이 화면에서 무엇을 보고 말했는지
const PRON_MODE = {
  en: { korean: 'The nurse saw only the Korean situation and had to make the whole English sentence.',
        blank: 'The nurse saw the sentence with the key words blank.' },
  zh: { korean: 'The learner saw only the Korean situation and had to make the whole Chinese sentence.',
        blank: 'The learner saw the sentence with the key words blank, with pinyin for the other words.' }
};

const PRON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    heard: { type: 'STRING' },
    said_target: { type: 'BOOLEAN' },
    overall: { type: 'STRING' },   // great / good / retry — 서버가 값을 검사한다
    message: { type: 'STRING' },
    words: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { word: { type: 'STRING' }, tip: { type: 'STRING' }, respelling: { type: 'STRING' } },
        required: ['word', 'tip', 'respelling']
      }
    }
  },
  required: ['heard', 'said_target', 'overall', 'message', 'words']
};
const PRON_MAX_B64 = 1500000;   // 약 1.1MB 소리 (16kHz WAV로 30초 남짓). 앱은 12초에서 멈춘다.

/**
 * 학생이 말한 소리(WAV, base64)로 발음 코칭을 받는다. 문장·발음 안내는 앱이 보낸 값이 아니라 drills 탭에서 찾는다.
 * 하루 횟수 한도(settings의 daily_pron_limit)와 월 예산을 확인하고, pron_checks 탭에 결과와 비용만 남긴다.
 */
function pronounce_(code, drillId, level, audio) {
  const auth = auth_(code);
  if (!auth.ok) return auth;
  if (!audio || audio.length > PRON_MAX_B64) return { ok: false, error: 'BAD_AUDIO' };

  const drill = readTable_('drills').filter(function (d) { return String(d.drill_id) === drillId && isTrue_(d.active); })[0];
  if (!drill) return { ok: false, error: 'NO_DRILL' };
  const chapter = usableChapter_(String(drill.chapter_id), auth.student);
  if (!chapter) return { ok: false, error: 'NO_DRILL' };

  const sid = String(auth.student.student_id);
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const used = readTable_('pron_checks').filter(function (p) {
    return String(p.student_id) === sid && p.at instanceof Date && Utilities.formatDate(p.at, tz, 'yyyy-MM-dd') === today;
  }).length;
  if (used >= (Number(getSettings_().daily_pron_limit) || 50)) return { ok: false, error: 'DAILY_PRON_LIMIT' };
  const budget = checkBudget_();
  if (!budget.ok) return budget;

  const course = courseOf_(chapter);
  const prompt = coursePrompt_('pron', course);
  if (!prompt) return { ok: false, error: 'NO_PROMPT' };
  const sentence = String(drill.sentence).replace(/\[([^\]]+)\]/g, '$1');
  const keywords = (String(drill.sentence).match(/\[([^\]]+)\]/g) || []).map(function (k) { return k.slice(1, -1); });
  const system = String(prompt.text)
    .replace(/\{sentence\}/g, sentence)
    .replace(/\{keywords\}/g, keywords.join(', ') || '(none)')
    .replace(/\{pron\}/g, String(drill.pron || '').trim() || '(none)')
    .replace(/\{mode\}/g, (PRON_MODE[course] || PRON_MODE.en)[level === 'korean' ? 'korean' : 'blank']);

  const ai = callTextModel_(system, [
    { text: course === 'en' ? "Here is the nurse's audio." : "Here is the learner's audio." },
    { inlineData: { mimeType: 'audio/wav', data: audio } }
  ], PRON_SCHEMA, '발음 코칭');

  const r = ai.ok ? ai.data : null;
  const overall = r && ['great', 'good', 'retry'].indexOf(r.overall) >= 0 ? r.overall : '';
  appendRow_('pron_checks', {
    at: new Date(), student_id: sid, chapter_id: String(drill.chapter_id), drill_id: drillId, level: level,
    overall: overall || 'failed', cost_usd: Math.round((ai.cost || 0) * 10000) / 10000
  });
  if (!ai.ok) return { ok: false, error: ai.error === 'AI_FAILED' ? 'PRON_FAILED' : ai.error };

  return {
    ok: true,
    coach: {
      heard: String(r.heard || '').slice(0, 300),
      said_target: r.said_target === true,
      overall: overall || 'retry',
      message: String(r.message || '').slice(0, 200),
      words: (r.words || []).filter(function (w) { return w && String(w.word || '').trim(); }).slice(0, 3).map(function (w) {
        return { word: String(w.word).slice(0, 40), tip: String(w.tip || '').slice(0, 160), respelling: String(w.respelling || '').slice(0, 60) };
      })
    }
  };
}

/** 편집기에서 실행: 1초짜리 무음 WAV로 발음 코칭 요청이 받아들여지는지 확인한다 (결과는 retry가 정상). */
function testPronounce() {
  const rate = 16000, n = rate;
  const bytes = [];
  const push32 = function (v) { bytes.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255); };
  const push16 = function (v) { bytes.push(v & 255, (v >> 8) & 255); };
  'RIFF'.split('').forEach(function (c) { bytes.push(c.charCodeAt(0)); }); push32(36 + n * 2);
  'WAVEfmt '.split('').forEach(function (c) { bytes.push(c.charCodeAt(0)); }); push32(16); push16(1); push16(1);
  push32(rate); push32(rate * 2); push16(2); push16(16);
  'data'.split('').forEach(function (c) { bytes.push(c.charCodeAt(0)); }); push32(n * 2);
  for (let i = 0; i < n * 2; i++) bytes.push(0);
  const audio = Utilities.base64Encode(bytes.map(function (b) { return b > 127 ? b - 256 : b; }));

  const drill = readTable_('drills').filter(function (d) { return isTrue_(d.active); })[0];
  const prompt = activePrompt_('pron');
  if (!drill || !prompt) { console.log('실패: drills 탭이나 pron 지시문이 없어요. setup을 먼저 실행해 주세요.'); return; }
  const system = String(prompt.text).replace(/\{sentence\}/g, String(drill.sentence).replace(/\[|\]/g, ''))
    .replace(/\{keywords\}/g, '').replace(/\{pron\}/g, '(none)').replace(/\{mode\}/g, 'test');
  const ai = callTextModel_(system, [{ text: "Here is the nurse's audio." }, { inlineData: { mimeType: 'audio/wav', data: audio } }], PRON_SCHEMA, '발음 코칭 시험');
  if (ai.ok) console.log('OK: 발음 코칭 요청 성공 (무음이라 retry가 정상)\n' + JSON.stringify(ai.data, null, 2));
  else console.log('실패: ' + ai.error + ' — 바로 위에 빨간 오류 줄이 있으면 그 내용을 Claude에게 알려 주세요.');
}


/* ───────────────────────── 22단계: 프로필 캐릭터 ───────────────────────── */

/**
 * 학생이 고른 캐릭터 번호(예: s07)를 students 탭의 avatar 칸에 저장한다. 빈 값이면 머리글자로 돌아간다.
 * 그림 파일은 웹앱 저장소의 img/avatars/ 에 있고, 서버는 번호만 기억한다.
 */
function setAvatar_(code, avatar) {
  const auth = auth_(code);
  if (!auth.ok) return auth;
  avatar = avatar.trim();
  if (avatar && !/^[a-z0-9-]{1,20}$/.test(avatar)) return { ok: false, error: 'BAD_AVATAR' };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('students');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (h) { return String(h).trim(); });
  const idCol = headers.indexOf('student_id');
  const avCol = headers.indexOf('avatar');
  if (avCol < 0) return { ok: false, error: 'NO_AVATAR_COLUMN' };   // setup을 아직 실행하지 않음
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(auth.student.student_id)) {
      sheet.getRange(i + 1, avCol + 1).setValue(avatar);
      return { ok: true, avatar: avatar };
    }
  }
  return { ok: false, error: 'NO_STUDENT' };
}
