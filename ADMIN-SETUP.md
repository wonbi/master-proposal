# 관리자 페이지 설정 (Supabase)

이 문서는 **회원님이 직접 수정하는 관리자 웹페이지**를 켜는 방법입니다.
한 번만 설정하면, 이후에는 `.../admin` 페이지에서 상품을 고치고 **[확정 저장]**만 누르면 공개 사이트에 반영됩니다.

```
관리자 페이지(/admin) ──[확정 저장]──▶ Supabase(저장소) ──자동──▶ 공개 사이트
```

---

## 1단계. Supabase 프로젝트 만들기 (무료)

1. [supabase.com](https://supabase.com) 접속 → **Start your project** → GitHub 계정 등으로 가입 (카드 등록 없음)
2. **New project** 클릭
   - Name: 아무거나 (예: `master-proposal`)
   - Database Password: 아무 강한 비밀번호 (적어두세요, 자주 쓸 일은 없음)
   - Region: `Northeast Asia (Seoul)` 권장
   - **Create new project** → 1~2분 대기

## 2단계. 데이터베이스 만들기 (복사·붙여넣기 한 번)

1. 왼쪽 메뉴 **SQL Editor** → **New query**
2. 이 저장소의 **`supabase/schema.sql`** 파일 내용을 **전체 복사**해서 붙여넣기
   (GitHub에서 파일 열기 → 오른쪽 위 **Copy raw file**)
3. 오른쪽 아래 **Run** 클릭 → "Success" 나오면 끝
   - 이때 상품 테이블 + 보안규칙 + 사진 저장공간 + **기본 상품 24종**이 한 번에 생성됩니다.

## 3단계. 연결 값 2개 복사해서 넣기

1. 왼쪽 메뉴 **Settings**(톱니) → **API**
2. 두 값을 복사합니다:
   - **Project URL** (예: `https://abcd1234.supabase.co`)
   - **anon public** 키 (긴 문자열)
   > anon 키는 공개돼도 안전합니다. 실제 보안은 DB 규칙(RLS)이 막아줍니다.
3. 이 저장소의 **`config.js`** 를 열어(GitHub에서 연필✏️) 맨 위 `supabase` 부분을 채웁니다:
   ```js
   supabase: {
     url: "https://abcd1234.supabase.co",
     anonKey: "eyJhbGciOi...(복사한 anon 키)..."
   },
   ```
4. **Commit changes**(저장) → 사이트가 자동 재배포됩니다.

## 4단계. 관리자 로그인 계정 만들기

1. Supabase 왼쪽 메뉴 **Authentication** → **Users** → **Add user** → **Create new user**
2. 관리자 이메일 + 비밀번호 입력
   - **Auto Confirm User**(자동 확인)를 **켜세요** — 안 켜면 로그인 시 이메일 인증 오류가 납니다.
3. **Create user**

---

## 다 됐습니다 — 이렇게 쓰면 됩니다

1. 브라우저에서 **`https://wonbi.github.io/master-proposal/admin.html`** 접속
2. 3단계에서 만든 이메일/비밀번호로 **로그인**
3. 상품 카드에서 수정:
   - 공급가·택배비·상품명·설명 등 텍스트 수정
   - **[사진 업로드]** 로 사진 교체 (파일 선택하면 자동 업로드)
   - **[+ 상품 추가]** 로 새 상품 추가
   - **삭제** 버튼으로 상품 제거 / **사이트에 표시** 체크 해제로 잠시 숨기기
4. 다 고쳤으면 아래 **[확정 저장]** → 공개 사이트에 즉시 반영 ✅

> 거래처는 `admin` 페이지에 로그인할 수 없으니(비밀번호), 완성된 공개 사이트만 봅니다.

---

## (선택) 상품명 자동완성을 "구글 시트에서 실시간"으로 — Apps Script

매번 SQL을 밀어넣지 않고, **마스터 유통시트의 지역/창고 탭을 실시간으로** 읽어 자동완성에 쓰는 방법입니다.
시트는 대외비라 그냥 못 읽으므로, 회원님 계정에 작은 웹앱을 만들어 **비밀키로 보호된 API**로 노출합니다.

### 1) Apps Script 만들기
1. [script.google.com](https://script.google.com) → **새 프로젝트**
2. 기본 코드 지우고, 아래 코드 전체를 붙여넣기 (`SECRET` 값은 원하는 비밀번호로 변경)
3. 저장(💾)

### 2) 웹앱으로 배포
1. 오른쪽 위 **배포 → 새 배포**
2. 유형(톱니 ⚙️) → **웹 앱**
3. 설정:
   - 실행 계정: **나(본인)**
   - 액세스 권한: **모든 사용자**
4. **배포** → 처음이면 **권한 승인**(내 계정 → 고급 → 이동 → 허용)
5. 나오는 **웹 앱 URL**(끝이 `/exec`) 복사

### 3) 사이트에 연결
`config.js` 의 `catalogApiUrl` 에 **URL + `?key=비밀키`** 를 넣습니다:
```js
catalogApiUrl: "https://script.google.com/macros/s/AKfy..../exec?key=여기에_SECRET값",
```
저장(Commit)하면 → 관리자 상품명 자동완성이 **시트에서 실시간**으로 옵니다. (시세 바뀌면 자동 반영, SQL 불필요)

> `catalogApiUrl` 을 비워두면 기존 Supabase `catalog` 표(수동 업로드) 방식으로 동작합니다.
> 시트를 수정하는 사람(홍찬화 팀장)이 값을 바꾸면, 다음 자동완성부터 새 값이 나옵니다.

---

## 잘 안 될 때
- **admin 페이지가 "설정이 필요합니다"라고 나와요** → `config.js`의 `url`/`anonKey`가 비었거나 틀렸습니다. 3단계 다시 확인.
- **로그인이 "이메일 인증 필요"라고 나와요** → 4단계에서 **Auto Confirm User**를 켜서 사용자를 다시 만들거나, Users 목록에서 해당 사용자를 확인 처리하세요.
- **저장이 안 돼요** → `supabase/schema.sql`을 2단계에서 실행했는지 확인(보안규칙까지 같이 생성됩니다).
- **사진이 안 올라가요** → schema.sql 실행 시 저장공간(product-images) 규칙도 생성됩니다. 재실행해도 안전합니다.
