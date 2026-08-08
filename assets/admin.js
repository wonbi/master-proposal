/* =========================================================
   상품 관리자 — Supabase 연동 편집 페이지
   ========================================================= */
(function () {
  "use strict";

  var CFG = window.PROPOSAL_CONFIG || {};
  var SB = CFG.supabase || {};
  var root = document.getElementById("admin-root");

  var DEFAULT_CATS = [
    { key: "fish",   name: "신선 수산물", mark: "魚", eyebrow: "SEAFOOD · 메인 카테고리", descr: "동해·군산·인천 창고에서 1만 원대 대표 품목을 각 3종씩 선별.", meta: "동해 · 군산 · 인천 창고", accent: "#0E8A8F", fit: "cover",   sort_order: 10 },
    { key: "meal",   name: "간편식품",   mark: "食", eyebrow: "CONVENIENCE FOOD",       descr: "탕·전골·튀김 등 회전율 높은 즉석·냉동 품목 (하남·김포).",       meta: "하남 · 김포 · 푸카 창고", accent: "#FF5B39", fit: "cover",   sort_order: 20 },
    { key: "living", name: "생활용품",   mark: "生", eyebrow: "LIVING GOODS",           descr: "찐한국 위생·주방 소모품, 정기 납품에 유리한 저단가 구성.",       meta: "찐한국 · 위생/주방",     accent: "#3BA559", fit: "contain", sort_order: 30 }
  ];
  var CATS = DEFAULT_CATS.slice();   // Supabase categories 로 교체됨
  function catByKey(k){ for(var i=0;i<CATS.length;i++) if(CATS[i].key===k) return CATS[i]; return null; }

  var client = null;
  var items = [];        // 작업중 상품 목록
  var deletedIds = [];   // 저장 시 삭제할 id
  var dirty = false;
  var addingCat = null;  // 현재 새 상품 추가 중인 카테고리
  var newItem = null;    // 입력 중인 새 상품
  var acResults = [];    // 자동완성 검색결과(비공개 카탈로그)
  var acTimer = null;
  var catalogCache = null;   // 시트 API로 받아온 전체 카탈로그(메모리 캐시)
  var catalogLoading = false;
  var _delegated = false; // root 이벤트는 한 번만 바인딩
  var siteSettings = {};  // 상단·회사 문구 설정(현재 버전)
  var settingsOpen = false;
  var catsOpen = false;   // 카테고리 관리 패널 펼침
  var bulkOpen = false;   // CSV 대량 가져오기 패널 펼침
  var statsOpen = false;  // 조회수 패널 펼침
  var statsRows = null;   // 조회 기록 (null=아직 안 불러옴, []=없음)
  var statsErr = "";
  var expandedCats = {};  // 상품목록에서 펼쳐진 카테고리 (기본 접힘)
  var versions = [];      // 제안서 버전 목록
  var currentVersion = null; // 현재 편집 중인 버전
  var myUid = null;       // 로그인한 계정 id (계정별 독립 작업공간)
  var multiUser = false;  // owner_id 컬럼 사용 가능 여부

  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
  function imgUrl(v){
    var s=String(v||"").trim(); if(!s)return "";
    if(/^https?:\/\//i.test(s)){
      var m=s.match(/drive\.google\.com\/file\/d\/([^/]+)/)||s.match(/[?&]id=([^&]+)/);
      if(m&&/drive\.google\.com/.test(s))return "https://drive.google.com/thumbnail?id="+m[1]+"&sz=w1000";
      return s;
    }
    return "images/products/"+s.replace(/^\/+/,"");
  }
  function uid(){ return (window.crypto&&crypto.randomUUID)?crypto.randomUUID():("k"+Math.random().toString(36).slice(2)+Date.now()); }
  function setDirty(v){ dirty=v; var st=document.getElementById("save-status"); var bt=document.getElementById("btn-save"); if(st){st.textContent=v?"저장 안 된 변경사항이 있습니다 — [저장] 또는 [전체 저장]":"각 상품의 [저장] 버튼으로 저장하세요";st.className="status"+(v?" dirty":"");} if(bt)bt.disabled=!v; }
  function toast(msg,isErr){ var t=document.createElement("div"); t.className="toast"+(isErr?" err":""); t.textContent=msg; document.body.appendChild(t); requestAnimationFrame(function(){t.classList.add("show");}); setTimeout(function(){t.classList.remove("show");setTimeout(function(){t.remove();},300);},2600); }

  /* ---------------- 화면들 ---------------- */
  function showSetupNeeded(){
    root.innerHTML =
      '<div class="center-wrap"><div class="panel">'+
      '<h1>관리자 설정이 필요합니다</h1>'+
      '<p class="sub">아직 데이터베이스(Supabase)가 연결되지 않았어요. 아래 순서로 한 번만 설정하면 됩니다.</p>'+
      '<div class="setup-steps">'+
      '1. <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a> 무료 가입 → 프로젝트 생성<br>'+
      '2. 왼쪽 <b>SQL Editor</b>에 저장소의 <code>supabase/schema.sql</code> 내용 붙여넣고 <b>RUN</b><br>'+
      '3. <b>Settings → API</b>에서 <code>Project URL</code>과 <code>anon public</code> 키 복사<br>'+
      '4. 저장소 <code>config.js</code>의 <code>supabase.url</code> / <code>anonKey</code>에 붙여넣고 저장<br>'+
      '5. <b>Authentication → Users</b>에서 관리자 이메일/비밀번호 계정 추가'+
      '</div>'+
      '<p class="sub" style="margin-top:16px;">설정을 마치면 이 페이지를 새로고침 하세요.</p>'+
      '</div></div>';
  }

  function showLogin(errText){
    root.innerHTML =
      '<div class="center-wrap"><div class="panel">'+
      '<h1>상품 관리자</h1><p class="sub">주식회사 마스터 · 외부유통팀</p>'+
      '<form id="login-form">'+
      '<div class="field"><label>이메일</label><input type="email" id="email" autocomplete="username" required></div>'+
      '<div class="field"><label>비밀번호</label><input type="password" id="password" autocomplete="current-password" required></div>'+
      '<button class="btn-primary" type="submit">로그인</button>'+
      '<div class="msg '+(errText?"err":"")+'" id="login-msg">'+(errText?esc(errText):"")+'</div>'+
      '</form></div></div>';
    document.getElementById("login-form").addEventListener("submit", function(e){
      e.preventDefault();
      var email=document.getElementById("email").value.trim();
      var pw=document.getElementById("password").value;
      var btn=e.target.querySelector("button"); btn.disabled=true; btn.textContent="로그인 중…";
      client.auth.signInWithPassword({ email:email, password:pw }).then(function(res){
        if(res.error){ showLogin(loginErr(res.error.message)); return; }
        boot();
      });
    });
  }
  function loginErr(m){
    if(/Invalid login/i.test(m)) return "이메일 또는 비밀번호가 올바르지 않습니다.";
    if(/Email not confirmed/i.test(m)) return "이메일 인증이 필요합니다. Supabase에서 사용자를 '확인됨'으로 추가하세요.";
    return m;
  }

  /* ---------------- 에디터 ---------------- */
  function cardHTML(it){
    var pv=imgUrl(it.image);
    var taxSel=function(v){return '<option'+(it.tax===v?' selected':'')+'>'+v+'</option>';};
    var catOpts=CATS.map(function(c){return '<option value="'+c.key+'"'+(it.category===c.key?' selected':'')+'>'+c.name+'</option>';}).join("");
    return '<div class="card'+(it.show===false?' hidden-row':'')+'" data-key="'+it._key+'">'+
      '<div class="thumb">'+
        '<div class="imgbox">'+(pv?'<img src="'+esc(pv)+'" alt="">':'<span style="font-size:12px;color:#9aa7ad;">사진 없음</span>')+'</div>'+
        '<div class="up"><label class="btn-up" data-up="'+it._key+'">사진 업로드<input type="file" accept="image/*" data-file="'+it._key+'" style="display:none;"></label></div>'+
      '</div>'+
      '<div class="fields">'+
        '<div class="row r1">'+
          '<div><span class="mini">카테고리</span><select data-f="category">'+catOpts+'</select></div>'+
          '<div><span class="mini">상품명</span><input data-f="name" value="'+esc(it.name)+'" placeholder="상품 이름"></div>'+
          '<div><span class="mini">창고(배지)</span><input data-f="warehouse" value="'+esc(it.warehouse)+'" placeholder="예: 동해"></div>'+
        '</div>'+
        '<div class="row r2">'+
          '<div><span class="mini">설명(회색 글씨)</span><input data-f="spec" value="'+esc(it.spec)+'" placeholder="예: 동해 창고 · 냉동"></div>'+
          '<div><span class="mini">택배사</span><input data-f="courier" value="'+esc(it.courier)+'" placeholder="예: 씨제이대한통운"></div>'+
        '</div>'+
        '<div class="row r3">'+
          '<div><span class="mini">공급가(원)</span><input data-f="supply_price" type="number" inputmode="numeric" value="'+esc(it.supply_price)+'"></div>'+
          '<div><span class="mini">택배비(원)</span><input data-f="ship_fee" type="number" inputmode="numeric" value="'+esc(it.ship_fee)+'"></div>'+
          '<div><span class="mini">면과세</span><select data-f="tax">'+taxSel("면세")+taxSel("과세")+'</select></div>'+
          '<div><span class="mini">&nbsp;</span></div>'+
        '</div>'+
        '<div class="row r4">'+
          '<div><span class="mini">원본 링크 (masterc.kr 등 — 상품명 클릭 링크 + 사진·스펙 자동수집용, 선택)</span><input data-f="link" value="'+esc(it.link||"")+'" placeholder="https://masterc.kr/..."></div>'+
        '</div>'+
        '<div class="card-foot">'+
          '<label class="toggle"><input type="checkbox" data-f="show"'+(it.show!==false?' checked':'')+'> 사이트에 표시</label>'+
          '<button class="btn-saveone" data-saveone="'+it._key+'">저장</button>'+
          '<button class="btn-del" data-del="'+it._key+'">삭제</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  }

  function loadCategoriesAdmin(){
    return mine(client.from("categories").select("*")).order("sort_order",{ascending:true}).then(function(res){
      if(res.error || !res.data || !res.data.length){ CATS=DEFAULT_CATS.slice(); return; }
      CATS=res.data.map(function(r){ return { id:r.id, key:r.key, name:r.name||"", mark:r.mark||"", eyebrow:r.eyebrow||"",
        descr:r.descr||"", meta:r.meta||"", accent:r.accent||"#0E8A8F", fit:r.fit||"cover", show:r.show!==false, sort_order:r.sort_order||0 }; });
    }).catch(function(){ CATS=DEFAULT_CATS.slice(); });
  }

  function catRowHTML(c){
    return '<div class="cat-edit" data-catkey="'+esc(c.key)+'">'+
      '<div class="row" style="grid-template-columns:66px 1fr 1.4fr 74px;">'+
        '<div><span class="mini">아이콘</span><input data-cf="mark" value="'+esc(c.mark)+'" maxlength="2"></div>'+
        '<div><span class="mini">이름</span><input data-cf="name" value="'+esc(c.name)+'"></div>'+
        '<div><span class="mini">소개(카드 설명)</span><input data-cf="descr" value="'+esc(c.descr)+'"></div>'+
        '<div><span class="mini">색상</span><input data-cf="accent" type="color" value="'+esc(c.accent)+'"></div>'+
      '</div>'+
      '<div class="row" style="grid-template-columns:1fr 1fr 110px;">'+
        '<div><span class="mini">영문 라벨(작은 글씨)</span><input data-cf="eyebrow" value="'+esc(c.eyebrow)+'"></div>'+
        '<div><span class="mini">헤더 우측 메타</span><input data-cf="meta" value="'+esc(c.meta)+'"></div>'+
        '<div><span class="mini">사진 맞춤</span><select data-cf="fit"><option value="cover"'+(c.fit!=="contain"?" selected":"")+'>꽉채움</option><option value="contain"'+(c.fit==="contain"?" selected":"")+'>여백(포장)</option></select></div>'+
      '</div>'+
      '<div class="card-foot" style="padding-top:8px;">'+
        '<label class="toggle"><input type="checkbox" data-cf="show"'+(c.show!==false?' checked':'')+'> 사이트에 표시</label>'+
        '<span class="mini" style="margin:0;">상품 '+items.filter(function(i){return i.category===c.key;}).length+'개</span>'+
        '<button class="btn-saveone" data-catsave="'+esc(c.key)+'">저장</button>'+
        '<button class="btn-del" data-catdel="'+esc(c.key)+'">삭제</button>'+
      '</div>'+
    '</div>';
  }
  function catPanelHTML(){
    if(!catsOpen){
      return '<div class="settings-panel"><div class="sp-head" id="cat-toggle"><span>🗂️ 카테고리 관리 (추가·수정·삭제)</span><span class="sp-caret">펼치기 ▾</span></div></div>';
    }
    return '<div class="settings-panel open">'+
      '<div class="sp-head" id="cat-toggle"><span>🗂️ 카테고리 관리 (추가·수정·삭제)</span><span class="sp-caret">접기 ▴</span></div>'+
      '<div class="sp-body">'+
        CATS.map(catRowHTML).join("")+
        '<div class="add-row"><button class="btn-add" id="btn-cat-new">+ 카테고리 추가</button></div>'+
      '</div></div>';
  }
  function saveCategory(key, btn){
    var c=catByKey(key); if(!c) return;
    if(!(c.name||"").trim()){ toast("카테고리 이름을 입력하세요", true); return; }
    if(btn){ btn.disabled=true; btn.textContent="저장중…"; }
    var row={ key:c.key, name:(c.name||"").trim(), mark:c.mark||"", eyebrow:c.eyebrow||"", descr:c.descr||"", meta:c.meta||"", accent:c.accent||"#0E8A8F", fit:c.fit||"cover", show:c.show!==false, sort_order:c.sort_order||0 };
    var q = c.id ? client.from("categories").update(row).eq("id",c.id) : client.from("categories").insert(withOwner(row)).select();
    q.then(function(res){
      if(res && res.error) throw res.error;
      if(!c.id && res && res.data && res.data[0]) c.id=res.data[0].id;
      if(btn){ btn.disabled=false; btn.textContent="저장됨 ✓"; setTimeout(function(){ if(btn) btn.textContent="저장"; },1500); }
      renderEditor(); toast("카테고리 저장됨 ✅ 공개 사이트에 반영됩니다");
    }).catch(function(err){ if(btn){ btn.disabled=false; btn.textContent="저장"; } toast("저장 실패: "+(err.message||err), true); });
  }
  function newCategory(){
    var name=window.prompt("새 카테고리 이름 (예: 신선 정육)"); if(!name||!name.trim()) return; name=name.trim();
    var key="cat"+uid().replace(/[^a-z0-9]/gi,"").slice(0,8).toLowerCase();
    var sort=(CATS.length?Math.max.apply(null,CATS.map(function(c){return c.sort_order||0;})):0)+10;
    var c={ key:key, name:name, mark:(name.charAt(0)||""), eyebrow:"", descr:"", meta:"", accent:"#0E8A8F", fit:"cover", show:true, sort_order:sort };
    client.from("categories").insert(withOwner(c)).select().then(function(res){
      if(res.error) throw res.error;
      if(res.data && res.data[0]) c.id=res.data[0].id;
      CATS.push(c); catsOpen=true; renderEditor(); toast("카테고리 '"+name+"' 추가됨 ✅ 아이콘·색상을 정한 뒤 저장하세요");
    }).catch(function(err){ toast("추가 실패: "+(err.message||err), true); });
  }
  function deleteCategory(key){
    var c=catByKey(key); if(!c) return;
    var cnt=items.filter(function(i){return i.category===key;}).length;
    var msg = cnt>0 ? ("이 카테고리에 상품 "+cnt+"개가 있습니다.\n삭제하면 그 상품들은 사이트에서 안 보이게 됩니다(상품 데이터는 남음).\n삭제할까요?") : "이 카테고리를 삭제할까요?";
    if(!window.confirm(msg)) return;
    function done(){ CATS=CATS.filter(function(x){return x.key!==key;}); renderEditor(); toast("카테고리 삭제됨"); }
    if(c.id){ client.from("categories").delete().eq("id",c.id).then(function(res){ if(res&&res.error) throw res.error; done(); }).catch(function(err){ toast("삭제 실패: "+(err.message||err), true); }); }
    else done();
  }

  /* ---------------- CSV 대량 가져오기 ---------------- */
  // 상품시트-템플릿.csv 와 같은 헤더 별칭(공개 사이트 app.js 의 규칙과 동일)
  function bulkHeaderKey(h){
    var s=String(h||"").trim().replace(/\s+/g,"").toLowerCase();
    var map={
      "카테고리":"category","분류":"category","category":"category",
      "상품명":"name","이름":"name","name":"name",
      "창고":"warehouse","배지":"warehouse","태그":"warehouse","warehouse":"warehouse",
      "설명":"spec","스펙":"spec","spec":"spec",
      "공급가":"supplyPrice","가격":"supplyPrice","단가":"supplyPrice","price":"supplyPrice",
      "택배사":"courier","courier":"courier",
      "택배비":"shipFee","배송비":"shipFee","shipfee":"shipFee",
      "면과세":"tax","과세":"tax","tax":"tax",
      "사진":"image","이미지":"image","image":"image","img":"image",
      "노출":"show","표시":"show","show":"show",
      "링크":"link","link":"link","url":"link","주소":"link"
    };
    return map[s]||null;
  }
  function parseBulkCSV(text){
    var rows=[],row=[],field="",inQ=false,i=0,c;
    while(i<text.length){
      c=text[i];
      if(inQ){
        if(c==='"'){ if(text[i+1]==='"'){field+='"';i+=2;continue;} inQ=false;i++;continue; }
        field+=c;i++;continue;
      }
      if(c==='"'){ inQ=true;i++;continue; }
      if(c===','){ row.push(field);field="";i++;continue; }
      if(c==='\r'){ i++;continue; }
      if(c==='\n'){ row.push(field);rows.push(row);row=[];field="";i++;continue; }
      field+=c;i++;
    }
    row.push(field); rows.push(row);
    return rows.filter(function(r){ return r.length>1 || (r[0]||"").trim()!==""; });
  }
  function bulkRowsToObjects(text){
    var rows=parseBulkCSV(text); if(!rows.length) return [];
    var head=rows[0].map(bulkHeaderKey);
    var out=[];
    for(var r=1;r<rows.length;r++){
      var obj={};
      for(var c=0;c<head.length;c++){ if(head[c]) obj[head[c]]=(rows[r][c]||"").trim(); }
      if(!obj.name) continue;
      out.push(obj);
    }
    return out;
  }
  function cleanNum(s){ var d=String(s||"").replace(/[^0-9]/g,""); return d?parseInt(d,10):0; }

  function bulkPanelHTML(){
    if(!bulkOpen){
      return '<div class="settings-panel"><div class="sp-head" id="bulk-toggle"><span>📋 CSV로 대량 가져오기 (전체 상품 한 번에)</span><span class="sp-caret">펼치기 ▾</span></div></div>';
    }
    return '<div class="settings-panel open">'+
      '<div class="sp-head" id="bulk-toggle"><span>📋 CSV로 대량 가져오기 (전체 상품 한 번에)</span><span class="sp-caret">접기 ▴</span></div>'+
      '<div class="sp-body">'+
        '<div class="sp-note" style="margin-bottom:8px;">'+
          '<code>상품시트-템플릿.csv</code>와 같은 형식(헤더: 카테고리,상품명,창고,설명,공급가,택배사,택배비,면과세,사진,노출)의 CSV를 붙여넣거나 파일을 선택하세요.'+
          '<br>시트에 없는 카테고리 이름은 자동으로 새 카테고리로 만들어집니다.'+
        '</div>'+
        '<textarea id="bulk-csv-text" rows="6" placeholder="여기에 CSV 내용을 붙여넣으세요"></textarea>'+
        '<div class="row r2" style="margin-top:8px;align-items:end;">'+
          '<div><span class="mini">또는 CSV 파일 선택</span><input type="file" id="bulk-csv-file" accept=".csv,text/csv"></div>'+
          '<div><label class="toggle"><input type="checkbox" id="bulk-replace" checked> 이 버전의 기존 상품을 지우고 새로 채우기</label></div>'+
        '</div>'+
        '<div class="sp-foot"><span class="sp-note">현재 버전(<b>'+(currentVersion?esc(currentVersion.name):"버전 없음")+'</b>)에 가져옵니다.</span>'+
        '<button class="btn-addsave" id="btn-bulk-import">가져오기 실행</button></div>'+
      '</div></div>';
  }

  function runBulkImport(){
    if(!currentVersion){ toast("먼저 버전을 만들거나 선택하세요", true); return; }
    var ta=document.getElementById("bulk-csv-text");
    var text=(ta&&ta.value||"").trim();
    if(!text){ toast("CSV 내용을 붙여넣거나 파일을 선택하세요", true); return; }
    var raw=bulkRowsToObjects(text);
    if(!raw.length){ toast("가져올 상품이 없습니다. 헤더와 내용을 확인하세요.", true); return; }
    var replace=!!(document.getElementById("bulk-replace") && document.getElementById("bulk-replace").checked);
    var btn=document.getElementById("btn-bulk-import"); btn.disabled=true; btn.textContent="가져오는 중…";

    // 1) CSV의 카테고리 이름 → key. 없는 이름은 새 카테고리로 생성.
    var byName={}; CATS.forEach(function(c){ byName[(c.name||"").trim()]=c.key; });
    var newNames=[], seenNew={};
    raw.forEach(function(o){
      var cn=(o.category||"").trim();
      if(cn && !byName[cn] && !seenNew[cn]){ seenNew[cn]=1; newNames.push(cn); }
    });
    var palette=["#0E8A8F","#FF5B39","#3BA559","#C0392B","#9B5DE5","#E8A33D","#3D7DCB","#B23A48","#5A8F3C","#7A5C3E"];
    var baseSort=(CATS.length?Math.max.apply(null,CATS.map(function(c){return c.sort_order||0;})):0);

    var createCats=newNames.length ? Promise.all(newNames.map(function(name,idx){
      var key="cat"+uid().replace(/[^a-z0-9]/gi,"").slice(0,8).toLowerCase();
      var c={ key:key, name:name, mark:name.charAt(0)||"", eyebrow:"", descr:"", meta:"", accent:palette[idx%palette.length], fit:"cover", show:true, sort_order:baseSort+10+idx*10 };
      return client.from("categories").insert(withOwner(c)).select().then(function(res){
        if(res.error) throw res.error;
        if(res.data && res.data[0]) c.id=res.data[0].id;
        CATS.push(c); byName[name]=key;
      });
    })) : Promise.resolve();

    var importedCount=0;
    createCats.then(function(){
      var order=0;
      var rowsDb=raw.map(function(o){
        order+=10;
        var catKey=byName[(o.category||"").trim()] || (CATS[0]&&CATS[0].key) || "meal";
        var showVal=/숨김|hide|false/i.test(String(o.show||"")) ? false : true;
        var taxVal=(o.tax==="과세") ? "과세" : "면세";
        return { category:catKey, name:String(o.name||"").trim(), warehouse:String(o.warehouse||"").trim(),
          spec:String(o.spec||"").trim(), supply_price:cleanNum(o.supplyPrice), courier:String(o.courier||"").trim(),
          ship_fee:cleanNum(o.shipFee), tax:taxVal, image:String(o.image||"").trim(), link:String(o.link||"").trim(), show:showVal,
          sort_order:order, version_id:currentVersion.id, updated_at:new Date().toISOString() };
      }).filter(function(r){ return r.name; });
      importedCount=rowsDb.length;

      var delChain = replace ? client.from("products").delete().eq("version_id",currentVersion.id).then(chk) : Promise.resolve();
      return delChain.then(function(){
        var chunks=[]; for(var i=0;i<rowsDb.length;i+=200) chunks.push(rowsDb.slice(i,i+200));
        var chain=Promise.resolve();
        chunks.forEach(function(chunk){ chain=chain.then(function(){ return client.from("products").insert(chunk.map(withOwner)).then(chk); }); });
        return chain;
      });
    }).then(function(){
      return loadProducts();
    }).then(function(){
      dirty=false; bulkOpen=false; renderEditor();
      toast(importedCount+"개 상품을 가져왔어요 ✅"+(newNames.length?(" (새 카테고리 "+newNames.length+"개 생성)"):""));
    }).catch(function(err){
      if(btn){ btn.disabled=false; btn.textContent="가져오기 실행"; }
      toast("가져오기 실패: "+(err.message||err), true);
    });
  }

  /* ---------------- 조회수 통계 ---------------- */
  function loadStats(){
    return client.from("page_views").select("version_slug,visitor,viewed_at,referrer")
      .order("viewed_at",{ascending:false}).limit(5000).then(function(res){
        if(res.error){ statsRows=[]; statsErr="views.sql 을 실행해야 조회수가 기록됩니다."; return; }
        statsRows=res.data||[]; statsErr="";
      }).catch(function(err){ statsRows=[]; statsErr=String(err&&err.message||err); });
  }
  function statsSummary(){
    // 계정별 분리 모드에서는 내 버전의 조회수만 집계
    var mySlugs = null;
    if(multiUser && myUid && versions.length){
      mySlugs={}; versions.forEach(function(v){ mySlugs[v.slug]=1; });
    }
    var now=new Date();
    var d0=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
    var d7=d0-6*86400000, d30=d0-29*86400000;
    var by={};
    (statsRows||[]).forEach(function(r){
      var k=r.version_slug||"(미지정)";
      if(mySlugs && !mySlugs[k]) return;   // 남의 버전 조회수는 제외
      var b=by[k]||(by[k]={slug:k,total:0,uniq:{},today:0,week:0,month:0,last:null,refs:{}});
      var t=new Date(r.viewed_at).getTime();
      b.total++; if(r.visitor) b.uniq[r.visitor]=1;
      if(t>=d0)b.today++; if(t>=d7)b.week++; if(t>=d30)b.month++;
      if(!b.last||t>b.last) b.last=t;
      var ref=(r.referrer||"").trim();
      if(ref){ var host=ref.replace(/^https?:\/\//,"").split("/")[0]; b.refs[host]=(b.refs[host]||0)+1; }
    });
    return Object.keys(by).map(function(k){ var b=by[k];
      b.uniqCount=Object.keys(b.uniq).length;
      b.topRef=Object.keys(b.refs).sort(function(a,c){return b.refs[c]-b.refs[a];})[0]||"";
      return b; }).sort(function(a,c){return c.total-a.total;});
  }
  function fmtWhen(t){
    if(!t) return "-";
    var diff=Date.now()-t, m=Math.floor(diff/60000);
    if(m<1) return "방금";
    if(m<60) return m+"분 전";
    var h=Math.floor(m/60); if(h<24) return h+"시간 전";
    var d=Math.floor(h/24); if(d<30) return d+"일 전";
    var dt=new Date(t); return (dt.getMonth()+1)+"/"+dt.getDate();
  }
  function verName(slug){
    var v=versions.filter(function(x){return x.slug===slug;})[0];
    return v?v.name:slug;
  }
  // 상단바용 — 현재 버전의 조회수 요약
  function statsChipHTML(){
    if(!currentVersion) return '';
    if(statsRows===null) return '<button class="stat-chip" id="btn-stats" title="조회수 보기">👁 조회 …</button>';
    var b=statsSummary().filter(function(x){return x.slug===currentVersion.slug;})[0];
    if(!b) return '<button class="stat-chip" id="btn-stats" title="아직 조회 없음">👁 조회 0</button>';
    return '<button class="stat-chip" id="btn-stats" title="클릭하면 버전별 상세 조회수">'+
      '👁 조회 <b>'+b.total+'</b>'+
      '<span class="sc-sep"></span>방문 <b>'+b.uniqCount+'</b>'+
      (b.today?'<span class="sc-today">오늘 '+b.today+'</span>':'')+
      '</button>';
  }

  function statsPanelHTML(){
    if(!statsOpen) return '';
    var body;
    if(statsRows===null){ body='<div class="st-empty">불러오는 중…</div>'; }
    else if(statsErr){ body='<div class="st-empty">'+esc(statsErr)+'</div>'; }
    else if(!statsRows.length){ body='<div class="st-empty">아직 조회 기록이 없습니다. 거래처가 링크를 열면 여기에 쌓입니다.</div>'; }
    else {
      body='<table class="st-table"><thead><tr>'+
        '<th>버전</th><th>총 조회</th><th>방문자</th><th>오늘</th><th>7일</th><th>30일</th><th>마지막 조회</th><th>유입</th>'+
        '</tr></thead><tbody>'+
        statsSummary().map(function(b){
          return '<tr><td class="st-ver">'+esc(verName(b.slug))+' <span class="st-slug">'+esc(b.slug)+'</span></td>'+
            '<td class="st-num big">'+b.total+'</td>'+
            '<td class="st-num">'+b.uniqCount+'</td>'+
            '<td class="st-num'+(b.today?' hot':'')+'">'+b.today+'</td>'+
            '<td class="st-num">'+b.week+'</td>'+
            '<td class="st-num">'+b.month+'</td>'+
            '<td class="st-when">'+fmtWhen(b.last)+'</td>'+
            '<td class="st-ref">'+esc(b.topRef||"-")+'</td></tr>';
        }).join("")+'</tbody></table>'+
        '<div class="st-note">· <b>총 조회</b>는 열어본 횟수, <b>방문자</b>는 서로 다른 사람 수(같은 사람이 여러 번 봐도 1)입니다.<br>'+
        '· 관리자에서 [공개 사이트 보기]로 연 것은 집계되지 않습니다.</div>';
    }
    // 편집 영역이 아니라 화면 위에 뜨는 팝업
    return '<div class="modal-back" id="st-close-back">'+
      '<div class="modal" role="dialog" aria-label="조회수">'+
        '<div class="modal-head">'+
          '<span>📊 조회수 — 버전별 열람 현황</span>'+
          '<span><button class="btn-ghost2" id="btn-st-refresh">새로고침</button>'+
          '<button class="modal-x" id="btn-st-close" aria-label="닫기">✕</button></span>'+
        '</div>'+
        '<div class="modal-body">'+body+'</div>'+
      '</div></div>';
  }

  function settingsEffective(){
    var d = {
      hero_eyebrow: CFG.heroEyebrow||"", hero_lead: CFG.heroLead||"",
      hero_title1: (CFG.heroTitleLines||[])[0]||"", hero_title2: (CFG.heroTitleLines||[])[1]||"", hero_title3: (CFG.heroTitleLines||[])[2]||"",
      company: CFG.company||"", team: CFG.team||"", manager_name: CFG.managerName||"", manager_title: CFG.managerTitle||"",
      phone: CFG.phone||"", email: CFG.email||"", kakao: CFG.kakao||""
    };
    for(var k in siteSettings){ if(siteSettings[k]!=null) d[k]=siteSettings[k]; }
    return d;
  }
  function isHidePrice(s){ var v=s.hide_price; return v===true||v==="1"||v==="true"; }
  function settingsPanelHTML(){
    var s=settingsEffective();
    function ti(k,label,ph){ return '<div><span class="mini">'+label+'</span><input data-sf="'+k+'" value="'+esc(s[k])+'" placeholder="'+(ph||"")+'"></div>'; }
    if(!settingsOpen){
      return '<div class="settings-panel"><div class="sp-head" id="sp-toggle"><span>📝 상단·회사 문구 편집</span><span class="sp-caret">펼치기 ▾</span></div></div>';
    }
    return '<div class="settings-panel open">'+
      '<div class="sp-head" id="sp-toggle"><span>📝 상단·회사 문구 편집</span><span class="sp-caret">접기 ▴</span></div>'+
      '<div class="sp-body">'+
        '<div class="sp-sec">표지(상단)</div>'+
        '<div class="row r2">'+ti("hero_eyebrow","상단 작은 문구","공동구매 마켓 제안서 · B2B 도매")+
          '<div><span class="mini">표지 설명(문단)</span><textarea data-sf="hero_lead" rows="2">'+esc(s.hero_lead)+'</textarea></div></div>'+
        '<div class="row r3">'+ti("hero_title1","제목 1줄")+ti("hero_title2","제목 2줄")+ti("hero_title3","제목 3줄(노란색)")+'<div></div></div>'+
        '<div class="sp-sec">회사 · 담당자</div>'+
        '<div class="row r2">'+ti("company","회사명")+ti("team","팀명")+'</div>'+
        '<div class="row r2">'+ti("manager_name","담당자명")+ti("manager_title","직함")+'</div>'+
        '<div class="sp-sec">연락처</div>'+
        '<div class="row r3">'+ti("phone","전화")+ti("email","이메일")+ti("kakao","카카오톡 ID")+'<div></div></div>'+
        '<div class="sp-sec">공개 범위</div>'+
        '<label class="hide-price'+(isHidePrice(s)?' on':'')+'">'+
          '<input type="checkbox" data-sf="hide_price"'+(isHidePrice(s)?' checked':'')+'>'+
          '<span><b>공급가 숨기기</b> — 가격 대신 <b>[공급가 문의하기]</b> 버튼이 표시되고, 누르면 아래 연락처로 이동합니다.'+
          '<br><span class="hp-note">오픈카톡방·단체방처럼 불특정 다수가 보는 링크에 사용하세요.</span></span>'+
        '</label>'+
        '<div class="sp-foot"><span class="sp-note">저장하면 공개 사이트 상단·문의에 바로 반영됩니다.</span><button class="btn-addsave" id="btn-save-settings">문구 저장</button></div>'+
      '</div></div>';
  }
  function saveSettings(btn){
    if(!currentVersion){ toast("먼저 versions.sql 을 실행해 버전을 만들어주세요", true); return; }
    btn.disabled=true; btn.textContent="저장 중…";
    var keys=["hero_eyebrow","hero_title1","hero_title2","hero_title3","hero_lead","company","team","manager_name","manager_title","phone","email","kakao"];
    var eff=settingsEffective(); var obj={};
    keys.forEach(function(k){ obj[k]=(eff[k]!=null?String(eff[k]):""); });
    obj.hide_price = isHidePrice(eff) ? "1" : "";   // 공급가 숨김 여부
    client.from("versions").update({settings:obj}).eq("id",currentVersion.id).then(chk).then(function(){
      currentVersion.settings=obj; siteSettings=Object.assign({},obj);
      btn.disabled=false; btn.textContent="문구 저장";
      toast("문구가 저장됐어요 ✅ 이 버전 공개 사이트에 반영됩니다");
    }).catch(function(err){ btn.disabled=false; btn.textContent="문구 저장"; toast("저장 실패: "+(err.message||err), true); });
  }

  function addFormHTML(){
    var it=newItem; var pv=imgUrl(it.image);
    var taxSel=function(v){return '<option'+(it.tax===v?' selected':'')+'>'+v+'</option>';};
    var catOpts=CATS.map(function(c){return '<option value="'+c.key+'"'+(it.category===c.key?' selected':'')+'>'+c.name+'</option>';}).join("");
    return '<div class="card new-card">'+
      '<div class="thumb">'+
        '<div class="imgbox">'+(pv?'<img src="'+esc(pv)+'" alt="">':'<span style="font-size:12px;color:#9aa7ad;">사진 없음</span>')+'</div>'+
        '<div class="up"><label class="btn-up" data-upnew="1">사진 업로드<input type="file" accept="image/*" data-nfile="1" style="display:none;"></label></div>'+
      '</div>'+
      '<div class="fields">'+
        '<div class="new-badge">＋ 새 상품 입력</div>'+
        '<div class="row r1">'+
          '<div><span class="mini">카테고리</span><select data-nf="category">'+catOpts+'</select></div>'+
          '<div class="ac-wrap"><span class="mini">상품명 <span class="ac-tip">타이핑하면 자동완성 ↓</span></span><input data-nf="name" value="'+esc(it.name)+'" placeholder="상품명 입력" autocomplete="off"><div class="ac-list" id="ac-list"></div></div>'+
          '<div><span class="mini">창고(배지)</span><input data-nf="warehouse" value="'+esc(it.warehouse)+'" placeholder="예: 동해"></div>'+
        '</div>'+
        '<div class="row r2">'+
          '<div><span class="mini">설명(회색 글씨)</span><input data-nf="spec" value="'+esc(it.spec)+'" placeholder="예: 동해 창고 · 냉동"></div>'+
          '<div><span class="mini">택배사</span><input data-nf="courier" value="'+esc(it.courier)+'" placeholder="예: 씨제이대한통운"></div>'+
        '</div>'+
        '<div class="row r3">'+
          '<div><span class="mini">공급가(원)</span><input data-nf="supply_price" type="number" inputmode="numeric" value="'+esc(it.supply_price)+'"></div>'+
          '<div><span class="mini">택배비(원)</span><input data-nf="ship_fee" type="number" inputmode="numeric" value="'+esc(it.ship_fee)+'"></div>'+
          '<div><span class="mini">면과세</span><select data-nf="tax">'+taxSel("면세")+taxSel("과세")+'</select></div>'+
          '<div><span class="mini">&nbsp;</span></div>'+
        '</div>'+
        '<div class="row r4">'+
          '<div><span class="mini">원본 링크 (masterc.kr 등 — 상품명 클릭 링크 + 사진·스펙 자동수집용, 선택)</span><input data-nf="link" value="'+esc(it.link||"")+'" placeholder="https://masterc.kr/..."></div>'+
        '</div>'+
        '<div class="card-foot">'+
          '<label class="toggle"><input type="checkbox" data-nf="show"'+(it.show!==false?' checked':'')+'> 사이트에 표시</label>'+
          '<button class="btn-cancel" id="btn-add-cancel">취소</button>'+
          '<button class="btn-addsave" id="btn-add-save">이 상품 추가</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  }

  function renderEditor(){
    var email = (client && client.auth && window.__adminEmail) || "";
    var verCtrl = versions.length
      ? '<select id="ver-select" class="ver-select" title="편집할 버전 선택">'+
          versions.map(function(v){ return '<option value="'+v.id+'"'+(currentVersion&&v.id===currentVersion.id?' selected':'')+'>'+esc(v.name)+'</option>'; }).join("")+
        '</select>'+
        '<button class="btn-ghost" id="btn-ver-new">+ 새 버전</button>'+
        '<button class="btn-ghost" id="btn-ver-copy" title="현재 버전의 상품·문구를 그대로 복사해 새 버전 만들기">⧉ 복제</button>'+
        '<button class="btn-ghost" id="btn-ver-rename" title="이름과 공개 주소(?v=) 변경">✏ 이름·주소</button>'+
        '<button class="btn-ghost" id="btn-ver-link">🔗 링크 복사</button>'+
        '<button class="btn-ghost danger" id="btn-ver-del" title="이 버전과 소속 상품 삭제">🗑 삭제</button>'
      : '<span class="ver-note">⚠ 버전 기능: versions.sql 실행 필요</span>';
    // nt=1 → 관리자 미리보기는 조회수에 집계되지 않음
    var pubHref = "index.html?nt=1" + (currentVersion ? ("&v="+encodeURIComponent(currentVersion.slug)) : "");
    var html =
      '<div class="topbar"><span class="brand">🐟 상품 관리자</span>'+ verCtrl +
      statsChipHTML()+
      '<span class="spacer"></span>'+
      '<button class="btn-ghost" id="btn-sheet-link" title="상품명 자동완성을 구글 시트에서 실시간으로">🔗 시트연동'+(apiUrl()?' ✓':'')+'</button>'+
      '<button class="btn-ghost" id="btn-copy-token" title="photo-updater.html 북마클릿에 붙여넣을 로그인 토큰 복사 (1시간 유효)">📸 북마클릿 토큰 복사</button>'+
      '<a href="'+pubHref+'" target="_blank" rel="noopener">공개 사이트 보기 ↗</a>'+
      '<button class="btn-ghost" id="btn-logout">로그아웃</button></div>'+
      '<div class="wrap">'+
      '<div class="hint">상품을 고친 뒤 그 상품의 <b>[저장]</b> 버튼을 누르면 바로 공개 사이트에 반영됩니다. 사진은 <b>[사진 업로드]</b>, 삭제는 <b>[삭제]</b>로 즉시 처리돼요. (아래 <b>[전체 저장]</b>은 여러 개를 한 번에 저장할 때만 쓰세요.)</div>'+
      settingsPanelHTML()+
      catPanelHTML()+
      bulkPanelHTML();

    var anyOpen = CATS.some(function(c){ return expandedCats[c.key]; });
    html+='<div class="prodlist-head"><span class="plh-title">상품 목록 <span class="plh-hint">(카테고리 제목을 눌러 펼치기/접기)</span></span>'+
          '<button class="btn-ghost2" id="btn-expand-all">'+(anyOpen?'전체 접기 ▴':'전체 펼치기 ▾')+'</button></div>';

    CATS.forEach(function(c){
      var list=items.filter(function(i){return i.category===c.key;});
      var isOpen = !!expandedCats[c.key] || addingCat===c.key;
      var caret = isOpen ? '▾' : '▸';
      var hiddenMark = c.show===false ? ' <span style="color:#e0483d;font-weight:800;">· 숨김</span>' : '';
      html+='<div class="cat-block'+(c.show===false?' cat-hidden':'')+'">';
      html+='<div class="cat-title cat-toggle-head" data-catview="'+esc(c.key)+'"><span class="tcaret">'+caret+'</span><span class="dot" style="background:'+c.accent+'"></span>'+esc(c.name)+' <span class="count">'+list.length+'개</span>'+hiddenMark+'</div>';
      if(isOpen){
        html+=list.map(cardHTML).join("");
        if(addingCat===c.key){ html+=addFormHTML(); }
        else { html+='<div class="add-row"><button class="btn-add" data-add="'+c.key+'">+ '+esc(c.name)+' 상품 1개 추가</button></div>'; }
      }
      html+='</div>';
    });

    html+='</div>'+
      '<div class="savebar"><span class="status" id="save-status">각 상품의 [저장] 버튼으로 저장하세요</span>'+
      '<button class="btn-save" id="btn-save" disabled>전체 저장</button></div>'+
      statsPanelHTML();   // 조회수 팝업(열려 있을 때만)
    root.innerHTML=html;
    setDirty(dirty);
    bindEditor();
  }

  function findItem(key){ for(var i=0;i<items.length;i++) if(items[i]._key===key) return items[i]; return null; }

  function bindEditor(){
    if(_delegated) return;   // root 이벤트는 최초 1회만 바인딩(중복 방지)
    _delegated = true;

    // 자동완성 목록 밖으로 포커스 이동 시 닫기
    root.addEventListener("focusin", function(e){
      if(!(e.target.closest && e.target.closest(".ac-wrap"))) hideAc();
    });

    // 필드 입력 (재렌더 없이 값만 반영 → 포커스 유지)
    root.addEventListener("input", function(e){
      var sf=e.target.getAttribute("data-sf");
      if(sf){ siteSettings[sf]=e.target.value; return; }
      var cf=e.target.getAttribute("data-cf");
      if(cf){ var cw=e.target.closest(".cat-edit"); var c=cw&&catByKey(cw.getAttribute("data-catkey")); if(c) c[cf]=e.target.value; return; }
      var nf=e.target.getAttribute("data-nf");
      if(nf && newItem){
        if(nf==="supply_price"||nf==="ship_fee"){ newItem[nf]=parseInt(e.target.value.replace(/[^0-9]/g,""),10)||0; }
        else { newItem[nf]=e.target.value; }
        if(nf==="name") scheduleCatalog(e.target.value);
        return;
      }
      var f=e.target.getAttribute("data-f"); if(!f)return;
      var card=e.target.closest(".card"); if(!card)return;
      var it=findItem(card.getAttribute("data-key")); if(!it)return;
      if(f==="supply_price"||f==="ship_fee"){ it[f]=parseInt(e.target.value.replace(/[^0-9]/g,""),10)||0; }
      else { it[f]=e.target.value; }
      setDirty(true);
    });
    root.addEventListener("change", function(e){
      if(e.target.id==="ver-select"){ switchVersion(e.target.value); return; }
      // 설정 체크박스(공급가 숨기기)
      if(e.target.getAttribute("data-sf")==="hide_price"){
        siteSettings.hide_price = e.target.checked ? "1" : "";
        var lab=e.target.closest(".hide-price"); if(lab) lab.classList.toggle("on", e.target.checked);
        return;
      }
      var cf=e.target.getAttribute("data-cf");
      if(cf){ var cw=e.target.closest(".cat-edit"); var cc=cw&&catByKey(cw.getAttribute("data-catkey"));
        if(cc){ if(cf==="show"){ cc.show=e.target.checked; saveCategory(cc.key); } else { cc[cf]=e.target.value; } } return; }
      // 새 상품 입력폼
      var nf=e.target.getAttribute("data-nf");
      if(nf && newItem){
        if(nf==="show"){ newItem.show=e.target.checked; return; }
        if(nf==="tax"){ newItem.tax=e.target.value; return; }
        if(nf==="category"){ newItem.category=e.target.value; addingCat=e.target.value; renderEditor(); focusNewName(); return; }
      }
      if(e.target.getAttribute("data-nfile") && e.target.files && e.target.files[0]){ uploadNew(e.target.files[0]); return; }
      if(e.target.id==="bulk-csv-file" && e.target.files && e.target.files[0]){
        var bf=e.target.files[0], reader=new FileReader();
        reader.onload=function(ev){ var bta=document.getElementById("bulk-csv-text"); if(bta) bta.value=String(ev.target.result||""); };
        reader.readAsText(bf, "utf-8");
        return;
      }

      // 기존 상품
      var f=e.target.getAttribute("data-f");
      if(f){
        var card=e.target.closest(".card"); var it=findItem(card.getAttribute("data-key")); if(!it)return;
        if(f==="show"){ it.show=e.target.checked; card.classList.toggle("hidden-row",!e.target.checked); setDirty(true); return; }
        if(f==="tax"){ it.tax=e.target.value; setDirty(true); return; }
        if(f==="category"){ it.category=e.target.value; setDirty(true); renderEditor(); return; }
      }
      var fk=e.target.getAttribute("data-file");
      if(fk && e.target.files && e.target.files[0]){ doUpload(fk, e.target.files[0], e.target); }
    });
    // 추가폼 열기 / 저장 / 취소 / 삭제 / 로그아웃 / 확정저장
    root.addEventListener("click", function(e){
      if(e.target.id==="btn-logout"){ client.auth.signOut().then(function(){ items=[];deletedIds=[];dirty=false; addingCat=null;newItem=null; showLogin(); }); return; }
      if(e.target.id==="btn-sheet-link"){ setApiUrl(); renderEditor(); return; }
      if(e.target.id==="btn-copy-token"){ copyBookmarkletToken(); return; }
      if(e.target.id==="btn-save"){ saveAll(); return; }
      if(e.target.closest && e.target.closest("#sp-toggle")){ settingsOpen=!settingsOpen; renderEditor(); return; }
      if(e.target.id==="btn-save-settings"){ saveSettings(e.target); return; }
      if(e.target.id==="btn-st-refresh"){ statsRows=null; renderEditor(); loadStats().then(renderEditor); return; }
      if(e.target.closest && e.target.closest("#btn-stats")){
        statsOpen=true; renderEditor();
        if(statsRows===null) loadStats().then(renderEditor);
        return;
      }
      // 팝업 닫기 (X 버튼 또는 바깥 배경 클릭)
      if(e.target.id==="btn-st-close" || e.target.id==="st-close-back"){ statsOpen=false; renderEditor(); return; }
      if(e.target.closest && e.target.closest("#cat-toggle")){ catsOpen=!catsOpen; renderEditor(); return; }
      if(e.target.closest && e.target.closest("#bulk-toggle")){ bulkOpen=!bulkOpen; renderEditor(); return; }
      if(e.target.id==="btn-bulk-import"){ runBulkImport(); return; }
      if(e.target.id==="btn-cat-new"){ newCategory(); return; }
      var catSaveKey=e.target.getAttribute("data-catsave");
      if(catSaveKey){ saveCategory(catSaveKey, e.target); return; }
      var catDelKey=e.target.getAttribute("data-catdel");
      if(catDelKey){ deleteCategory(catDelKey); return; }
      var headEl=e.target.closest && e.target.closest(".cat-toggle-head");
      if(headEl){ var vk=headEl.getAttribute("data-catview"); expandedCats[vk]=!expandedCats[vk]; renderEditor(); return; }
      if(e.target.id==="btn-expand-all"){
        var openNow=CATS.some(function(c){ return expandedCats[c.key]; });
        expandedCats={}; if(!openNow){ CATS.forEach(function(c){ expandedCats[c.key]=true; }); }
        renderEditor(); return;
      }
      if(e.target.id==="btn-ver-new"){ newVersion(); return; }
      if(e.target.id==="btn-ver-copy"){ duplicateVersion(); return; }
      if(e.target.id==="btn-ver-rename"){ renameVersion(); return; }
      if(e.target.id==="btn-ver-link"){ copyVersionLink(); return; }
      if(e.target.id==="btn-ver-del"){ deleteVersion(); return; }
      var addCat=e.target.getAttribute("data-add");
      if(addCat){
        addingCat=addCat; expandedCats[addCat]=true;
        newItem={_key:"NEW",category:addCat,name:"",warehouse:"",spec:"",supply_price:0,courier:"",ship_fee:addCat==="living"?2500:4000,tax:addCat==="fish"?"면세":"과세",image:"",link:"",show:true};
        renderEditor(); focusNewName(); return;
      }
      // 자동완성 후보 클릭 → 값 채우기
      var acEl=e.target.closest && e.target.closest(".ac-item");
      if(acEl && newItem){
        var r=acResults[parseInt(acEl.getAttribute("data-ac"),10)];
        if(r){ newItem.name=r.name; newItem.warehouse=r.warehouse||""; newItem.spec=r.spec||"";
          newItem.supply_price=r.supply_price||0; newItem.courier=r.courier||""; newItem.ship_fee=r.ship_fee||0; newItem.tax=r.tax||"면세"; }
        renderEditor(); focusNewName(); return;
      }
      if(e.target.id==="btn-add-cancel"){ addingCat=null; newItem=null; renderEditor(); return; }
      if(e.target.id==="btn-add-save"){ saveNewItem(e.target); return; }
      var saveKey=e.target.getAttribute("data-saveone");
      if(saveKey){ saveOne(saveKey, e.target); return; }
      var delKey=e.target.getAttribute("data-del");
      if(delKey){ deleteOne(delKey); return; }
    });
  }

  function doUpload(key, file, inputEl){
    var it=findItem(key); if(!it)return;
    var label=root.querySelector('.btn-up[data-up="'+key+'"]'); if(label){label.classList.add("busy");label.childNodes[0].nodeValue="업로드 중…";}
    var ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"")||"jpg";
    var path=uid()+"."+ext;
    client.storage.from("product-images").upload(path, file, { cacheControl:"3600", upsert:false }).then(function(res){
      if(res.error) throw res.error;
      var pub=client.storage.from("product-images").getPublicUrl(path);
      it.image=pub.data.publicUrl; setDirty(true); renderEditor(); toast("사진이 업로드됐어요");
    }).catch(function(err){
      if(label){label.classList.remove("busy");label.childNodes[0].nodeValue="사진 업로드";}
      toast("사진 업로드 실패: "+(err.message||err), true);
    });
  }

  function focusNewName(){ var el=root.querySelector('.new-card input[data-nf="name"]'); if(el){ el.focus(); var v=el.value; el.value=""; el.value=v; } }

  // 비공개 카탈로그 자동완성
  function hideAc(){ var l=document.getElementById("ac-list"); if(l){ l.className="ac-list"; l.innerHTML=""; } }
  function scheduleCatalog(q){
    if(acTimer) clearTimeout(acTimer);
    q=(q||"").trim();
    if(q.length<1){ hideAc(); return; }
    acTimer=setTimeout(function(){ runCatalog(q); }, 220);
  }
  function renderAcList(list){
    if(!acResults.length){ list.className="ac-list show"; list.innerHTML='<div class="ac-empty">일치하는 상품이 없어요</div>'; return; }
    list.innerHTML=acResults.map(function(r,i){
      var price=r.supply_price?("₩"+Number(r.supply_price).toLocaleString()):"";
      var out=r.status==="품절"?'<span class="ac-out">품절</span>':"";
      return '<div class="ac-item" data-ac="'+i+'"><span class="ac-name">'+esc(r.name)+'</span>'+
             '<span class="ac-meta">'+esc(r.warehouse||"")+(price?" · "+price:"")+" "+out+'</span></div>';
    }).join("");
    list.className="ac-list show";
  }

  // 시트 연동 주소는 "이 브라우저에만" 저장(공개 코드에 비밀키가 안 들어가게)
  function apiUrl(){
    var v="";
    try{ v=localStorage.getItem("catalogApiUrl")||""; }catch(e){}
    return (v || CFG.catalogApiUrl || "").trim();
  }
  function setApiUrl(){
    var cur=""; try{ cur=localStorage.getItem("catalogApiUrl")||""; }catch(e){}
    var v=window.prompt("구글 시트 웹앱 주소를 붙여넣으세요 (?key= 까지 포함).\n※ 이 브라우저에만 저장됩니다(공개 코드엔 안 들어감).", cur);
    if(v===null) return;
    v=v.trim();
    try{ if(v) localStorage.setItem("catalogApiUrl", v); else localStorage.removeItem("catalogApiUrl"); }catch(e){}
    catalogCache=null; catalogLoading=false;
    toast(v?"시트 연동 주소 저장됨 ✅":"시트 연동 해제됨");
    if(v) loadCatalogFromApi();
  }

  // photo-updater.html 북마클릿이 Supabase에 쓰기 위한 로그인 토큰을 복사.
  // 토큰 자체는 서버에 저장하지 않고 지금 이 로그인 세션의 것을 그대로 넘겨줌 —
  // masterc.kr 탭(다른 도메인)은 이 관리자 페이지의 로그인 상태를 알 방법이 없어서,
  // 딱 한 번 복사해 붙여넣는 방식으로 권한을 넘긴다. (Supabase 기본 만료: 1시간)
  function copyBookmarkletToken(){
    client.auth.getSession().then(function(res){
      var token=res && res.data && res.data.session && res.data.session.access_token;
      if(!token){ toast("로그인 세션을 찾을 수 없어요. 새로고침 후 다시 시도하세요.", true); return; }
      var text=token;
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(function(){ toast("토큰 복사됨 ✅ photo-updater.html 북마클릿에 붙여넣으세요 (1시간 유효)"); },
          function(){ window.prompt("아래 토큰을 복사하세요 (1시간 유효)", text); });
      } else { window.prompt("아래 토큰을 복사하세요 (1시간 유효)", text); }
    });
  }

  // 구글 시트 Apps Script 웹앱에서 전체 카탈로그를 JSONP로 받아옴(1회 캐시)
  function loadCatalogFromApi(){
    var url=apiUrl();
    if(!url || catalogLoading) return;
    catalogLoading=true;
    var cbName="__cat_cb_"+(new Date()).getTime();
    var s=document.createElement("script");
    var sep=url.indexOf("?")>-1?"&":"?";
    window[cbName]=function(data){
      catalogCache = Array.isArray(data) ? data : ((data&&data.rows)||[]);
      catalogLoading=false;
      try{ delete window[cbName]; }catch(e){ window[cbName]=undefined; }
      if(s.parentNode) s.parentNode.removeChild(s);
      var inp=root.querySelector('.new-card input[data-nf="name"]');
      if(inp && inp.value) runCatalog(inp.value);
    };
    s.onerror=function(){ catalogLoading=false; if(s.parentNode) s.parentNode.removeChild(s);
      var l=document.getElementById("ac-list"); if(l){ l.className="ac-list show"; l.innerHTML='<div class="ac-empty">시트 연결 실패 — 주소를 확인하세요</div>'; } };
    s.src=url+sep+"callback="+cbName;
    document.body.appendChild(s);
  }

  function runCatalog(q){
    var list=document.getElementById("ac-list"); if(!list) return;
    // (1) 시트 API 모드: 캐시에서 로컬 필터
    if(apiUrl()){
      if(catalogCache===null){ loadCatalogFromApi(); list.className="ac-list show"; list.innerHTML='<div class="ac-empty">상품 목록 불러오는 중…</div>'; return; }
      var ql=String(q).toLowerCase();
      acResults=catalogCache.filter(function(r){ return String(r.name||"").toLowerCase().indexOf(ql)>-1; }).slice(0,8);
      renderAcList(list); return;
    }
    // (2) Supabase catalog 표 모드(폴백)
    if(!client){ hideAc(); return; }
    client.from("catalog").select("*").ilike("name","%"+q+"%").order("status",{ascending:true}).limit(8).then(function(res){
      var l=document.getElementById("ac-list"); if(!l) return;
      if(res.error){ hideAc(); return; }
      acResults=res.data||[];
      renderAcList(l);
    }).catch(function(){ hideAc(); });
  }

  function uploadNew(file){
    if(!newItem)return;
    var label=root.querySelector('.new-card .btn-up[data-upnew]'); if(label){label.classList.add("busy");label.childNodes[0].nodeValue="업로드 중…";}
    var ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"")||"jpg";
    var path=uid()+"."+ext;
    client.storage.from("product-images").upload(path, file, { cacheControl:"3600", upsert:false }).then(function(res){
      if(res.error) throw res.error;
      newItem.image=client.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      renderEditor(); focusNewName(); toast("사진이 업로드됐어요");
    }).catch(function(err){
      if(label){label.classList.remove("busy");label.childNodes[0].nodeValue="사진 업로드";}
      toast("사진 업로드 실패: "+(err.message||err), true);
    });
  }

  function saveNewItem(btn){
    if(!newItem)return;
    if(!(newItem.name||"").trim()){ toast("상품명을 입력하세요", true); focusNewName(); return; }
    btn.disabled=true; btn.textContent="추가 중…";
    var maxSort=0; items.forEach(function(i){ if((i.sort_order||0)>maxSort)maxSort=i.sort_order; });
    var row=dbRow(newItem, maxSort+10);
    client.from("products").insert(withOwner(row)).select().then(function(res){
      if(res.error) throw res.error;
      var r=(res.data && res.data[0]) || null;
      if(r){
        items.push({ _key:uid(), id:r.id, category:r.category||"fish", name:r.name||"", warehouse:r.warehouse||"", spec:r.spec||"",
          supply_price:r.supply_price||0, courier:r.courier||"", ship_fee:r.ship_fee||0, tax:r.tax||"면세", image:r.image||"", link:r.link||"", show:r.show!==false, sort_order:r.sort_order||(maxSort+10) });
        addingCat=null; newItem=null; renderEditor();
        toast("상품이 추가됐어요 ✅ 공개 사이트에 반영됩니다");
      } else {
        // 반환값이 없으면 안전하게 전체 다시 불러오기
        addingCat=null; newItem=null;
        loadProducts().then(function(){ dirty=false; renderEditor(); toast("상품이 추가됐어요 ✅"); });
      }
    }).catch(function(err){ btn.disabled=false; btn.textContent="이 상품 추가"; toast("추가 실패: "+(err.message||err), true); });
  }

  // 기존 상품 1개만 즉시 저장
  function saveOne(key, btn){
    var it=findItem(key); if(!it) return;
    if(!(it.name||"").trim()){ toast("상품명을 입력하세요", true); return; }
    if(btn){ btn.disabled=true; btn.textContent="저장중…"; }
    var r=dbRow(it, (typeof it.sort_order==="number"?it.sort_order:0));
    var q = it.id ? client.from("products").update(r).eq("id",it.id) : client.from("products").insert(withOwner(r)).select();
    q.then(function(res){
      if(res && res.error) throw res.error;
      if(!it.id && res && res.data && res.data[0]) it.id=res.data[0].id;
      if(btn){ btn.disabled=false; btn.textContent="저장됨 ✓"; setTimeout(function(){ if(btn) btn.textContent="저장"; }, 1500); }
      toast("저장됐어요 ✅ 공개 사이트에 반영됩니다");
    }).catch(function(err){ if(btn){ btn.disabled=false; btn.textContent="저장"; } toast("저장 실패: "+(err.message||err), true); });
  }

  // 상품 1개 즉시 삭제
  function deleteOne(key){
    var it=findItem(key); if(!it) return;
    if(!window.confirm("이 상품을 삭제할까요?\n공개 사이트에서 바로 사라집니다.")) return;
    function done(){ items=items.filter(function(x){return x._key!==key;}); renderEditor(); toast("삭제됐어요"); }
    if(it.id){
      client.from("products").delete().eq("id",it.id).then(function(res){
        if(res && res.error) throw res.error; done();
      }).catch(function(err){ toast("삭제 실패: "+(err.message||err), true); });
    } else { done(); }
  }

  function dbRow(it, order){
    var r={ category:it.category, name:(it.name||"").trim(), warehouse:(it.warehouse||"").trim(), spec:(it.spec||"").trim(),
      supply_price:parseInt(it.supply_price,10)||0, courier:(it.courier||"").trim(), ship_fee:parseInt(it.ship_fee,10)||0,
      tax:it.tax||"면세", image:(it.image||"").trim(), link:(it.link||"").trim(), show:it.show!==false, sort_order:order, updated_at:new Date().toISOString() };
    if(it.id) r.id=it.id;
    if(currentVersion) r.version_id=currentVersion.id;
    return r;
  }

  function saveAll(){
    var btn=document.getElementById("btn-save"); btn.disabled=true; btn.textContent="저장 중…";
    // 표시 순서대로 sort_order 재부여
    var ordered=[]; CATS.forEach(function(c){ items.filter(function(i){return i.category===c.key;}).forEach(function(i){ordered.push(i);}); });
    var updates=[], inserts=[];
    ordered.forEach(function(it,idx){ var r=dbRow(it,(idx+1)*10); if(r.id)updates.push(r); else inserts.push(r); });

    var chain=Promise.resolve();
    if(deletedIds.length) chain=chain.then(function(){ return client.from("products").delete().in("id",deletedIds).then(chk); });
    if(updates.length)    chain=chain.then(function(){ return client.from("products").upsert(updates).then(chk); });
    if(inserts.length)    chain=chain.then(function(){ return client.from("products").insert(inserts.map(withOwner)).then(chk); });

    chain.then(function(){
      deletedIds=[]; dirty=false;
      return loadProducts();
    }).then(function(){
      renderEditor(); toast("저장 완료 — 공개 사이트에 반영됐어요 ✅");
    }).catch(function(err){
      btn.disabled=false; btn.textContent="전체 저장";
      toast("저장 실패: "+(err.message||err), true);
    });
  }
  function chk(res){ if(res && res.error) throw res.error; return res; }

  /* ---------------- 로드 / 부팅 ---------------- */
  // 한글 이름에 자주 쓰는 단어 → 영문 주소
  var SLUG_HINTS = [
    ["셀러","seller"], ["온라인","online"], ["스마트스토어","store"], ["스토어","store"],
    ["공동구매","market"], ["공구","market"], ["마켓","market"], ["도매","wholesale"],
    ["급식","catering"], ["식자재","food"], ["소매","retail"], ["선물","gift"], ["기본","default"]
  ];
  function slugify(name){
    var raw=(name||"").toLowerCase();
    var s=raw.replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
    if(!s){ // 한글 등 영문이 없을 때: 키워드 추정
      for(var i=0;i<SLUG_HINTS.length;i++){ if(raw.indexOf(SLUG_HINTS[i][0])>-1){ s=SLUG_HINTS[i][1]; break; } }
    }
    if(!s) s="v"+(versions.length+1);
    var base=s, n=2;
    while(versions.some(function(v){return v.slug===s;})){ s=base+"-"+n; n++; }
    return s;
  }
  function switchVersion(id){
    if(id===(currentVersion&&currentVersion.id)) return;
    if(dirty && !window.confirm("저장 안 된 상품 변경사항이 있습니다.\n버전을 바꾸면 사라집니다. 계속할까요?")){ renderEditor(); return; }
    var v=versions.filter(function(x){return x.id===id;})[0]; if(!v) return;
    currentVersion=v; addingCat=null; newItem=null; dirty=false;
    root.innerHTML='<div class="loading">버전 불러오는 중…</div>';
    Promise.all([loadProducts(), loadAdminSettings()]).then(function(){ renderEditor(); })
      .catch(function(err){ toast("불러오기 실패: "+(err.message||err), true); });
  }
  function renameVersion(){
    if(!currentVersion) return;
    var name=window.prompt("버전 이름 변경", currentVersion.name); if(name===null) return;
    name=(name||"").trim(); if(!name) return;
    var slug=window.prompt(
      "이 버전의 주소(영문)를 정하세요.\n예: seller  →  .../?v=seller\n\n영문 소문자·숫자·하이픈(-)만 쓸 수 있습니다.",
      currentVersion.slug);
    if(slug===null) return;
    slug=(slug||"").trim().toLowerCase().replace(/[^a-z0-9-]/g,"");
    if(!slug){ toast("주소는 영문/숫자로 입력해주세요", true); return; }
    if(versions.some(function(v){ return v.slug===slug && v.id!==currentVersion.id; })){ toast("이미 쓰고 있는 주소예요. 다른 걸로 해주세요", true); return; }
    client.from("versions").update({name:name, slug:slug}).eq("id",currentVersion.id).then(chk).then(function(){
      currentVersion.name=name; currentVersion.slug=slug;
      var v=versions.filter(function(x){return x.id===currentVersion.id;})[0]; if(v){ v.name=name; v.slug=slug; }
      renderEditor(); toast("변경됐어요 — 주소: ?v="+slug);
    }).catch(function(err){ toast("변경 실패: "+(err.message||err), true); });
  }
  function copyVersionLink(){
    if(!currentVersion) return;
    var url=location.href.split("?")[0].replace(/admin\.html$/,"")+"?v="+encodeURIComponent(currentVersion.slug);
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(url).then(function(){ toast("링크 복사됨 ✅"); }, function(){ window.prompt("아래 링크를 복사하세요", url); });
    } else { window.prompt("아래 링크를 복사하세요", url); }
  }
  // 버전 생성 공통 — src 가 있으면 그 버전의 상품·문구를 복사
  function createVersion(name, src){
    name=(name||"").trim(); if(!name) return;
    var slug=slugify(name);
    var sort=(versions.length?Math.max.apply(null,versions.map(function(v){return v.sort_order||0;})):0)+1;
    var settings=src?Object.assign({},src.settings||{}):{};
    var attempt=function(sl, tries){
      return client.from("versions").insert(withOwner({slug:sl,name:name,sort_order:sort,settings:settings})).select()
        .then(function(res){
          // 다른 계정이 이미 쓰는 주소면 번호를 붙여 재시도
          if(res.error && /duplicate|unique/i.test(res.error.message||"") && tries<5){
            return attempt(sl+"-"+(tries+2), tries+1);
          }
          return res;
        });
    };
    attempt(slug,0).then(function(res){
      if(res.error) throw res.error;
      slug=res.data[0].slug;
      var nv=res.data[0];
      var finish=function(copied){
        return loadVersions().then(function(){
          currentVersion=versions.filter(function(v){return v.id===nv.id;})[0]||nv;
          addingCat=null; newItem=null; expandedCats={};
          return Promise.all([loadProducts(), loadAdminSettings()]);
        }).then(function(){
          dirty=false; renderEditor();
          toast("'"+name+"' 만들었어요 ✅"+(copied?(" (상품 "+copied+"개 복사)"):"")+" · 주소 ?v="+slug);
        });
      };
      if(src){
        return client.from("products").select("*").eq("version_id",src.id).then(function(pr){
          var rows=(pr.data||[]).map(function(p){ return {category:p.category,name:p.name,warehouse:p.warehouse,spec:p.spec,supply_price:p.supply_price,courier:p.courier,ship_fee:p.ship_fee,tax:p.tax,image:p.image,show:p.show,sort_order:p.sort_order,version_id:nv.id}; });
          if(!rows.length) return finish(0);
          return client.from("products").insert(rows.map(withOwner)).then(chk).then(function(){ return finish(rows.length); });
        });
      }
      return finish(0);
    }).catch(function(err){ toast("버전 생성 실패: "+(err.message||err), true); });
  }

  function newVersion(){
    var name=window.prompt("새 버전 이름 (빈 상태로 시작합니다)\n예: 급식 거래처용");
    if(name===null||!name.trim()) return;
    createVersion(name, null);
  }

  function duplicateVersion(){
    if(!currentVersion){ toast("복제할 버전이 없습니다", true); return; }
    if(dirty && !window.confirm("저장 안 된 변경사항은 복제본에 반영되지 않습니다.\n계속할까요?")) return;
    var cnt=items.length;
    var name=window.prompt(
      "'"+currentVersion.name+"' 을(를) 복제합니다.\n상품 "+cnt+"개와 문구 설정이 그대로 복사됩니다.\n\n새 버전 이름을 입력하세요.",
      currentVersion.name+" 복사본");
    if(name===null||!name.trim()) return;
    createVersion(name, currentVersion);
  }

  function deleteVersion(){
    if(!currentVersion){ return; }
    if(versions.length<=1){ toast("마지막 버전은 삭제할 수 없습니다", true); return; }
    var v=currentVersion, cnt=items.length;
    if(!window.confirm(
      "[" + v.name + "] 버전을 삭제합니다.\n\n"+
      "· 이 버전의 상품 " + cnt + "개가 함께 삭제됩니다\n"+
      "· 공유한 링크(?v=" + v.slug + ")는 더 이상 열리지 않습니다\n"+
      "· 되돌릴 수 없습니다\n\n계속할까요?")) return;
    var typed=window.prompt("확인을 위해 버전 이름을 그대로 입력하세요:\n"+v.name);
    if(typed===null) return;
    if(typed.trim()!==v.name.trim()){ toast("이름이 일치하지 않아 취소했습니다", true); return; }

    client.from("products").delete().eq("version_id",v.id).then(chk).then(function(){
      return client.from("versions").delete().eq("id",v.id).then(chk);
    }).then(function(){
      currentVersion=null; addingCat=null; newItem=null; expandedCats={}; dirty=false;
      root.innerHTML='<div class="loading">삭제 중…</div>';
      return loadVersions().then(function(){
        return Promise.all([loadProducts(), loadAdminSettings()]);
      });
    }).then(function(){ renderEditor(); toast("'"+v.name+"' 버전을 삭제했어요"); })
      .catch(function(err){ toast("삭제 실패: "+(err.message||err), true); renderEditor(); });
  }

  // owner_id 컬럼이 있으면 본인 것만, 없으면 전체(기존 방식)
  function mine(q){ return (multiUser && myUid) ? q.eq("owner_id", myUid) : q; }
  function withOwner(row){ if(multiUser && myUid) row.owner_id = myUid; return row; }

  function loadVersions(){
    return mine(client.from("versions").select("*")).order("sort_order",{ascending:true}).then(function(res){
      if(res.error){ versions=[]; currentVersion=null; return; }
      versions=res.data||[];
      if(versions.length){
        currentVersion = (currentVersion && versions.filter(function(v){return v.id===currentVersion.id;})[0]) || versions[0];
      } else { currentVersion=null; }
    }).catch(function(){ versions=[]; currentVersion=null; });
  }

  // 새 계정(내 버전이 하나도 없음) → 기본 버전 + 기본 카테고리 자동 생성
  function bootstrapWorkspace(){
    if(!multiUser || !myUid) return Promise.resolve();
    if(versions.length) return Promise.resolve();          // 이미 쓰던 계정
    var base="내 제안서";
    var slug="ws"+String(myUid).replace(/[^a-z0-9]/gi,"").slice(0,8).toLowerCase();
    return client.from("versions").insert(withOwner({
      slug:slug, name:base, sort_order:1,
      settings:{ hero_eyebrow:"상품 제안서", hero_title1:"바다에서", hero_title2:"식탁까지,", hero_title3:"한 번에 채우다",
                 hero_lead:"취급 품목을 공급가와 택배 조건으로 정리했습니다.",
                 company:"", team:"", manager_name:"", manager_title:"", phone:"", email:"", kakao:"", hide_price:"" }
    })).select().then(function(res){
      if(res.error) throw res.error;
      // 카테고리도 내 것이 없으면 기본 3개 생성
      return client.from("categories").select("id").eq("owner_id",myUid).limit(1).then(function(cr){
        if(!cr.error && cr.data && cr.data.length) return null;
        return client.from("categories").insert(DEFAULT_CATS.map(function(c){
          return withOwner({key:c.key+"-"+String(myUid).slice(0,6), name:c.name, mark:c.mark, eyebrow:c.eyebrow,
            descr:c.descr, meta:c.meta, accent:c.accent, fit:c.fit, show:true, sort_order:c.sort_order});
        }));
      });
    }).then(function(){ return loadVersions(); })
      .catch(function(err){ console.warn("작업공간 생성 실패:", err); });
  }

  function loadProducts(){
    var q=client.from("products").select("*").order("sort_order",{ascending:true});
    if(currentVersion) q=q.eq("version_id", currentVersion.id);
    return q.then(function(res){
      if(res.error) throw res.error;
      items=(res.data||[]).map(function(r){ return {
        _key:uid(), id:r.id, category:r.category||"fish", name:r.name||"", warehouse:r.warehouse||"", spec:r.spec||"",
        supply_price:r.supply_price||0, courier:r.courier||"", ship_fee:r.ship_fee||0, tax:r.tax||"면세",
        image:r.image||"", link:r.link||"", show:r.show!==false, sort_order:r.sort_order||0 }; });
    });
  }

  function loadAdminSettings(){
    siteSettings = (currentVersion && currentVersion.settings) ? Object.assign({}, currentVersion.settings) : {};
    return Promise.resolve();
  }

  function boot(){
    root.innerHTML='<div class="loading">불러오는 중…</div>';
    // 로그인한 계정 확인 + owner_id(계정별 분리) 지원 여부 확인
    client.auth.getUser().then(function(u){
      var user=(u&&u.data&&u.data.user)||null;
      window.__adminEmail=(user&&user.email)||"";
      myUid=(user&&user.id)||null;
      return client.from("versions").select("owner_id").limit(1).then(function(r){
        multiUser = !r.error;   // 컬럼이 없으면 기존(공용) 방식으로 동작
      }).catch(function(){ multiUser=false; });
    }).then(function(){
      return loadVersions();
    }).then(function(){
      return bootstrapWorkspace();   // 새 계정이면 기본 버전·카테고리 자동 생성
    }).then(function(){
      return Promise.all([loadProducts(), loadAdminSettings(), loadCategoriesAdmin()]);
    }).then(function(){
      dirty=false; renderEditor();
      if(apiUrl()) loadCatalogFromApi();
      loadStats().then(renderEditor);   // 상단바 조회수 표시용
    })
      .catch(function(err){ toast("상품 로드 실패: "+(err.message||err), true); showLogin("데이터를 불러오지 못했습니다. DB 설정을 확인하세요."); });
  }

  /* ---------------- 시작 ---------------- */
  if(!SB.url || !SB.anonKey || !window.supabase){
    showSetupNeeded();
    return;
  }
  client = window.supabase.createClient(SB.url, SB.anonKey);
  client.auth.getSession().then(function(res){
    if(res.data && res.data.session){ boot(); } else { showLogin(); }
  }).catch(function(){ showLogin(); });

})();
