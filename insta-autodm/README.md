# insta-autodm — 인스타 댓글 → 자동 DM

키워드가 들어간 댓글이 달리면 작성자에게 DM을 보내고, 댓글에 "DM 보내드렸어요" 답글을 답니다.
Meta 공식 API(Private Reply)와 Cloudflare Workers 무료 플랜으로 동작합니다.

```
댓글 작성 → Meta 웹훅 → Cloudflare Worker → 키워드 확인 → DM 발송 + 공개 답글
```

## 0. 준비물
- 인스타그램 **프로페셔널 계정** (비즈니스 또는 크리에이터)
  - 설정 → 계정 유형 및 도구 → 프로페셔널 계정으로 전환
- Cloudflare 계정 (무료) · Meta 개발자 계정 (무료)
- PC에 Node.js 18 이상

## 1. 규칙 정하기 — `src/rules.js`
키워드, DM 문구, 공개 답글 문구를 수정합니다. 특정 게시물에만 적용하려면 `media_id`를 넣습니다.

## 2. Meta 앱 만들기
1. https://developers.facebook.com/apps → **앱 만들기**
2. 사용 사례에서 **Instagram 메시지 및 콘텐츠 관리**(Instagram API) 선택
3. 앱 대시보드 → Instagram → **Instagram 로그인을 통한 API 설정**
   - **액세스 토큰 생성**에서 인스타 계정을 연결하고 토큰을 복사합니다. 이것이 `IG_ACCESS_TOKEN`(장기 토큰)입니다.
   - 같은 화면의 **Instagram 앱 시크릿**을 복사합니다. 이것이 `APP_SECRET`입니다.
   - 계정 ID도 확인합니다(선택). 이것이 `IG_USER_ID`입니다.
4. 필요한 권한: `instagram_business_basic`, `instagram_business_manage_comments`, `instagram_business_manage_messages`
5. 인스타 앱 설정 → 개인정보 및 보안 → 메시지 → **연결된 도구 허용**을 켭니다.

## 3. Cloudflare에 배포
```bash
cd insta-autodm
npm install
npx wrangler login

# 토큰 자동 갱신용 KV 생성 → 출력된 id를 wrangler.toml의 REPLACE_WITH_KV_ID에 붙여넣기
npx wrangler kv namespace create TOKENS

# 비밀값 등록 (화면에 붙여넣기)
npx wrangler secret put APP_SECRET       # Instagram 앱 시크릿
npx wrangler secret put VERIFY_TOKEN     # 아무 문자열이나 직접 정하기 (예: seedhouse-2026-xyz)
npx wrangler secret put IG_ACCESS_TOKEN  # 2단계에서 받은 토큰

npm run deploy
```
배포가 끝나면 `https://insta-autodm.<계정>.workers.dev`와 같은 주소가 나옵니다.

## 4. 웹훅 연결
1. Meta 앱 → Instagram → API 설정 → **웹훅 구성**
   - 콜백 URL: `https://insta-autodm.<계정>.workers.dev/webhook`
   - 확인 토큰: 3단계에서 정한 `VERIFY_TOKEN`
   - **확인 및 저장**
2. 웹훅 필드에서 **comments**를 **구독**합니다.
3. 계정 옆의 웹훅 구독 토글을 켭니다.

## 5. 테스트
- 앱이 **개발 모드**인 동안에는 앱 역할(관리자, 테스터)에 등록된 계정의 댓글에만 동작합니다.
  - 앱 역할 → Instagram 테스터에 다른 계정을 추가하고, 그 계정에서 키워드 댓글을 달아보세요.
- 실시간 로그: `npm run logs`
- 로컬 로직 테스트: `npm test`

## 6. 공개 운영 (앱 검수)
일반 사용자 댓글에도 동작하게 하려면 **앱 검수**를 받아야 합니다.
- 위 권한 3개에 대해 **Advanced Access**를 요청합니다.
- 제출물: 사용 목적 설명, 동작 시연 화면 녹화, 개인정보처리방침 URL(seedhouse.kr의 방침 사용 가능)
- 검수가 통과되면 앱을 **라이브 모드**로 전환합니다.

## 동작 규칙 · 주의
- 비공개 답장은 **댓글 1개당 1회**, 댓글 작성 후 **7일 이내**에만 보낼 수 있습니다. 이 제한은 Meta 정책입니다.
- 상대가 DM에 답장한 경우에만 이후 24시간 동안 추가 메시지를 보낼 수 있습니다.
- 내 계정이 단 댓글은 무시합니다. 그래서 자동 공개 답글 때문에 무한 루프가 생기지 않습니다.
- 웹훅이 재전송되어도 두 번째 DM은 Meta가 거절하므로 공개 답글이 중복되지 않습니다.
- 장기 토큰은 60일 뒤 만료되므로, 매주 월요일에 크론으로 자동 갱신해 KV에 저장합니다.
- 비밀값은 절대 코드나 이 저장소에 넣지 말고 `wrangler secret`으로만 등록하세요.
