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

## (선택) 전체 상품 한 번에 넣기 — CSV 대량 가져오기

일부 상품만 골라 만든 기존 버전과 별개로, 취급하는 **전체 상품**을 그대로 담은 새 제안서 버전을 만들 수 있습니다.
저장소의 **`전체상품-시트.csv`** 는 마스터 유통시트(홍찬화 팀장) 전체 창고 탭을 이 사이트 형식으로 변환해 둔 파일입니다(카테고리는 상품명 키워드로 자동 분류했으니, 가져온 뒤 필요하면 상품별로 카테고리를 고쳐주세요).

1. 관리자 페이지 상단에서 **[+ 새 버전]** 으로 "전체상품" 같은 새 버전을 만듭니다.
2. **[📋 CSV로 대량 가져오기]** 패널을 펼칩니다.
3. **CSV 파일 선택**에서 `전체상품-시트.csv` 를 고르거나, 내용을 복사해 붙여넣습니다.
4. "이 버전의 기존 상품을 지우고 새로 채우기"가 체크된 상태로 **[가져오기 실행]**.
   → 시트에 없던 카테고리(수산물·축산물·간편식품 등)는 자동으로 만들어지고, 상품 수백 개가 한 번에 등록됩니다.
5. 사진이 없는 상품은 공개 사이트에 "사진 준비중"으로 표시됩니다 — 필요한 상품만 관리자에서 **[사진 업로드]** 로 채워주면 됩니다.

CSV 형식은 `상품시트-템플릿.csv` 와 동일합니다: `카테고리,상품명,창고,설명,공급가,택배사,택배비,면과세,사진,노출`.
매일 시세가 바뀌는 시트를 다시 반영하고 싶으면, 같은 CSV를 최신값으로 갱신해 같은 방법으로 다시 가져오면 됩니다(기존 상품이 지워지고 새로 채워집니다).

> 이 버전에도 **공급가 숨기기**(위 "다 됐습니다" 섹션 참고)를 켜면, 오픈카톡 등 불특정 다수에게 공유할 때 가격 대신 문의 버튼이 표시됩니다.

---

## (선택) 원본 링크에서 사진·스펙 자동으로 채우기 — photo-updater

masterc.kr 같은 원본 상세페이지 주소를 상품마다 등록해두면, 그 페이지에서 사진·스펙을
긁어와 자동으로 채워주는 도구입니다. 먼저 **`supabase/link-field.sql`** 을 SQL Editor에서
한 번 실행해 `products` 테이블에 `link` 컬럼을 추가하세요.

1. 관리자에서 상품마다 **"원본 링크"** 칸에 masterc.kr 주소 등을 넣고 저장합니다.
2. 관리자 상단의 **[📸 북마클릿 토큰 복사]** 를 눌러 로그인 토큰을 복사해둡니다(1시간 유효).
3. **[photo-updater.html](photo-updater.html)** 페이지의 안내대로 북마클릿을 즐겨찾기에 등록합니다.
4. 원본 사이트에 **로그인된 탭**에서 북마클릿을 실행 → 토큰 붙여넣기(최초 1회) → 업데이트할 상품 선택 → 실행.
5. 긁어온 사진·스펙이 그 상품의 Supabase 값으로 바로 저장됩니다.

자세한 원리와 주의사항은 `photo-updater.html` 페이지 안내를 참고하세요. (사진·스펙을 뽑는
규칙은 일반적인 `og:image`/설명 메타 태그 기준 기본값이라, 원본 사이트 구조에 따라
`assets/photo-updater.js` 상단의 `EXTRACT` 규칙을 다듬어야 할 수 있습니다.)

---

## (선택) 상품명 자동완성을 "구글 시트에서 실시간"으로 — Apps Script

매번 SQL을 밀어넣지 않고, **마스터 유통시트의 지역/창고 탭을 실시간으로** 읽어 자동완성에 쓰는 방법입니다.
시트는 대외비라 그냥 못 읽으므로, 회원님 계정에 작은 웹앱을 만들어 **비밀키로 보호된 API**로 노출합니다.

### 1) Apps Script 만들기
1. [script.google.com](https://script.google.com) → **새 프로젝트**
2. 기본 코드 지우고, 아래 코드 전체를 붙여넣기 (`SHEET_ID`·`SECRET` 값은 회원님 것으로 변경)
3. 저장(💾)

```js
var SHEET_ID = '여기에_마스터_유통시트_ID';
var SECRET   = 'wonbi-master-key';   // ← 원하는 비밀키로 변경

function doGet(e){
  var cb  = (e && e.parameter && e.parameter.callback) || '';
  var key = (e && e.parameter && e.parameter.key) || '';
  var payload;
  if (key !== SECRET) { payload = { error: 'unauthorized' }; }
  else { try { payload = buildCatalog(); } catch (err) { payload = { error: String(err) }; } }
  var json = JSON.stringify(payload);
  if (cb) return ContentService.createTextOutput(cb + '(' + json + ')')
                 .setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function buildCatalog(){
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheets = ss.getSheets(), seen = {}, out = [];
  for (var s = 0; s < sheets.length; s++){
    var sh = sheets[s];
    if (sh.getName().indexOf('변동') > -1) continue;   // 변동사항 탭 제외
    var range = sh.getDataRange();
    var rows = range.getValues();
    var richRows = range.getRichTextValues();   // 상품명 셀 하이퍼링크를 읽기 위해 필요
    var formulaRows = range.getFormulas();       // =HYPERLINK() 수식 링크도 보조로 읽음
    for (var r = 0; r < rows.length; r++){
      var row = rows[r], idx = -1;
      for (var j = row.length - 1; j >= 0; j--){
        var v = String(row[j]).trim();
        if (v === '면세' || v === '과세'){ idx = j; break; }
      }
      if (idx < 4) continue;
      var tax = String(row[idx]).trim();
      var courier = String(row[idx-2]).trim();
      var priceC  = String(row[idx-3]);
      var pname   = String(row[idx-4]).trim();
      var wh      = (idx-5 >= 0) ? String(row[idx-5]).trim() : '';
      if (!(courier.indexOf('택배') > -1 || courier.indexOf('통운') > -1)) continue;
      var price = toNum(priceC);
      if (!pname || price === null || pname.indexOf('상품명') > -1) continue;
      if (seen[pname]) continue;
      seen[pname] = true;
      var link = linkOf(richRows[r][idx-4], formulaRows[r][idx-4]);
      out.push({ name: pname, warehouse: wh, supply_price: price,
                 courier: courier, ship_fee: toShip(String(row[idx-1])), tax: tax, link: link });
    }
  }
  return out;
}
function linkOf(richTextValue, formula){
  try {
    if (richTextValue) {
      var direct = richTextValue.getLinkUrl();
      if (direct) return direct;
      var runs = richTextValue.getRuns();
      for (var i = 0; i < runs.length; i++){
        var u = runs[i].getLinkUrl();
        if (u) return u;
      }
    }
  } catch (e) {}
  if (formula) {
    var m = String(formula).match(/HYPERLINK\(\s*"([^"]+)"/i);
    if (m) return m[1];
  }
  return '';
}
function toNum(s){ s=String(s); var i=s.indexOf('>'); if(i>-1) s=s.substring(i+1);
  var d=s.replace(/[^0-9]/g,''); return d===''?null:parseInt(d,10); }
function toShip(s){ if(String(s).indexOf('무료')>-1) return 0; var n=toNum(s); return n===null?0:n; }
```

> 이미 이 Apps Script를 쓰고 계셨다면, `buildCatalog()` / `linkOf()` / `toNum()` / `toShip()` 을 위 코드로
> 통째로 덮어쓰기만 하면 됩니다(`SHEET_ID`·`SECRET`는 원래 쓰시던 값 그대로 두세요).
> 저장한 뒤 **꼭 재배포**해야 반영됩니다 — 오른쪽 위 **배포 → 배포 관리** → 기존 배포 옆 연필(✏️)
> → 버전 **"새 버전"** 선택 → **배포**. (기존 URL이 그대로 유지되어 관리자에 다시 붙여넣지 않아도 됩니다.)

### 2) 웹앱으로 배포
1. 오른쪽 위 **배포 → 새 배포**
2. 유형(톱니 ⚙️) → **웹 앱**
3. 설정:
   - 실행 계정: **나(본인)**
   - 액세스 권한: **모든 사용자**
4. **배포** → 처음이면 **권한 승인**(내 계정 → 고급 → 이동 → 허용)
5. 나오는 **웹 앱 URL**(끝이 `/exec`) 복사

### 3) 관리자에 연결 (공개 코드가 아니라 "이 브라우저"에 저장)
> ⚠️ 이 주소+키는 **공개 코드(`config.js`)에 넣지 마세요.** 넣으면 저장소를 보는 누구나 카탈로그(대외비)를 읽을 수 있습니다.
> 대신 관리자 페이지에서 입력하면 **회원님 브라우저에만** 저장됩니다.

1. 관리자 페이지 상단의 **[🔗 시트연동]** 버튼 클릭
2. 배포한 웹 앱 URL에 **`?key=비밀키`** 를 붙여 붙여넣기:
   ```
   https://script.google.com/macros/s/AKfy..../exec?key=여기에_SECRET값
   ```
3. 저장 → 버튼에 **✓** 표시가 뜨면 완료. 이제 상품명 자동완성이 **시트에서 실시간**으로 옵니다.

> - 시세가 바뀌면(홍찬화 팀장이 시트 수정) → 다음 자동완성부터 자동으로 새 값.
> - 다른 PC/브라우저에서 관리하려면 그 브라우저에서도 [🔗 시트연동]에 한 번 붙여넣으면 됩니다.
> - 연동을 안 하면(또는 실패하면) 기존 Supabase `catalog` 표(수동 업로드)가 폴백으로 쓰입니다.

---

## 잘 안 될 때
- **admin 페이지가 "설정이 필요합니다"라고 나와요** → `config.js`의 `url`/`anonKey`가 비었거나 틀렸습니다. 3단계 다시 확인.
- **로그인이 "이메일 인증 필요"라고 나와요** → 4단계에서 **Auto Confirm User**를 켜서 사용자를 다시 만들거나, Users 목록에서 해당 사용자를 확인 처리하세요.
- **저장이 안 돼요** → `supabase/schema.sql`을 2단계에서 실행했는지 확인(보안규칙까지 같이 생성됩니다).
- **사진이 안 올라가요** → schema.sql 실행 시 저장공간(product-images) 규칙도 생성됩니다. 재실행해도 안전합니다.
