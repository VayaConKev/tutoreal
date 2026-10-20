# 가짜 시트 시험 (tests)

서버(`server/Code.gs`)를 바꾸면 실제 시트와 Gemini 없이 이 시험으로 먼저 확인한다 (README 규칙: 서버를 바꾸면 가짜 시트로 테스트).

- `fakesheet.js`: 가짜 구글 시트 + Apps Script 서비스 (SpreadsheetApp, CacheService, PropertiesService, UrlFetchApp 등). Gemini 요청은 가짜 답을 돌려주고, 시험이 `w.fetchHook`으로 답(예: 503 붐빔)을 바꿀 수 있다. API 키는 `FAKE_KEY`.
- `baseline('커밋')`: 그 커밋의 Code.gs. '예전 서버로 만든 시트에 새 서버의 setup을 다시 돌려도 괜찮은지' 같은 시험에 쓴다 (git이 필요).
- 시험 파일 이름의 숫자는 그 시험을 만든 무렵의 단계 번호. 각 파일 맨 위 주석에 무엇을 확인하는지 적혀 있다.

실행 (저장소 맨 위에서, Node.js 18 이상):

```
node tests/run-all.js
```

시험 하나만: `node tests/test54.js`. 마지막 줄이 `모든 확인 통과`면 통과.

학생 이름·접속 코드·브랜드 이름 같은 실제 값은 넣지 않는다 (시험용 이름만: 학생, 간호사, 선생님 등).
