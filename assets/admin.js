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
  var versions = [];      // 제안서 버전 목록
  var currentVersion = null; // 현재 편집 중인 버전

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
        '<div class="card-foot">'+
          '<label class="toggle"><input type="checkbox" data-f="show"'+(it.show!==false?' checked':'')+'> 사이트에 표시</label>'+
          '<button class="btn-saveone" data-saveone="'+it._key+'">저장</button>'+
          '<button class="btn-del" data-del="'+it._key+'">삭제</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  }

  function loadCategoriesAdmin(){
    return client.from("categories").select("*").order("sort_order",{ascending:true}).then(function(res){
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
    var q = c.id ? client.from("categories").update(row).eq("id",c.id) : client.from("categories").insert(row).select();
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
    client.from("categories").insert(c).select().then(function(res){
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
        '<div class="sp-foot"><span class="sp-note">저장하면 공개 사이트 상단·문의에 바로 반영됩니다.</span><button class="btn-addsave" id="btn-save-settings">문구 저장</button></div>'+
      '</div></div>';
  }
  function saveSettings(btn){
    if(!currentVersion){ toast("먼저 versions.sql 을 실행해 버전을 만들어주세요", true); return; }
    btn.disabled=true; btn.textContent="저장 중…";
    var keys=["hero_eyebrow","hero_title1","hero_title2","hero_title3","hero_lead","company","team","manager_name","manager_title","phone","email","kakao"];
    var eff=settingsEffective(); var obj={};
    keys.forEach(function(k){ obj[k]=(eff[k]!=null?String(eff[k]):""); });
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
        '<button class="btn-ghost" id="btn-ver-rename">이름변경</button>'+
        '<button class="btn-ghost" id="btn-ver-link">🔗 링크 복사</button>'
      : '<span class="ver-note">⚠ 버전 기능: versions.sql 실행 필요</span>';
    var pubHref = "index.html" + (currentVersion ? ("?v="+encodeURIComponent(currentVersion.slug)) : "");
    var html =
      '<div class="topbar"><span class="brand">🐟 상품 관리자</span>'+ verCtrl +
      '<span class="spacer"></span>'+
      '<button class="btn-ghost" id="btn-sheet-link" title="상품명 자동완성을 구글 시트에서 실시간으로">🔗 시트연동'+(apiUrl()?' ✓':'')+'</button>'+
      '<a href="'+pubHref+'" target="_blank" rel="noopener">공개 사이트 보기 ↗</a>'+
      '<button class="btn-ghost" id="btn-logout">로그아웃</button></div>'+
      '<div class="wrap">'+
      '<div class="hint">상품을 고친 뒤 그 상품의 <b>[저장]</b> 버튼을 누르면 바로 공개 사이트에 반영됩니다. 사진은 <b>[사진 업로드]</b>, 삭제는 <b>[삭제]</b>로 즉시 처리돼요. (아래 <b>[전체 저장]</b>은 여러 개를 한 번에 저장할 때만 쓰세요.)</div>'+
      settingsPanelHTML()+
      catPanelHTML();

    CATS.forEach(function(c){
      var list=items.filter(function(i){return i.category===c.key;});
      var hiddenMark = c.show===false ? ' <span style="color:#e0483d;font-weight:800;">· 숨김(사이트에 안 보임)</span>' : '';
      html+='<div class="cat-block'+(c.show===false?' cat-hidden':'')+'"><div class="cat-title"><span class="dot" style="background:'+c.accent+'"></span>'+esc(c.name)+' <span class="count">'+list.length+'개</span>'+hiddenMark+'</div>';
      html+=list.map(cardHTML).join("");
      if(addingCat===c.key){ html+=addFormHTML(); }
      else { html+='<div class="add-row"><button class="btn-add" data-add="'+c.key+'">+ '+esc(c.name)+' 상품 1개 추가</button></div>'; }
      html+='</div>';
    });

    html+='</div>'+
      '<div class="savebar"><span class="status" id="save-status">각 상품의 [저장] 버튼으로 저장하세요</span>'+
      '<button class="btn-save" id="btn-save" disabled>전체 저장</button></div>';
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
      if(e.target.id==="btn-save"){ saveAll(); return; }
      if(e.target.closest && e.target.closest("#sp-toggle")){ settingsOpen=!settingsOpen; renderEditor(); return; }
      if(e.target.id==="btn-save-settings"){ saveSettings(e.target); return; }
      if(e.target.closest && e.target.closest("#cat-toggle")){ catsOpen=!catsOpen; renderEditor(); return; }
      if(e.target.id==="btn-cat-new"){ newCategory(); return; }
      var catSaveKey=e.target.getAttribute("data-catsave");
      if(catSaveKey){ saveCategory(catSaveKey, e.target); return; }
      var catDelKey=e.target.getAttribute("data-catdel");
      if(catDelKey){ deleteCategory(catDelKey); return; }
      if(e.target.id==="btn-ver-new"){ newVersion(); return; }
      if(e.target.id==="btn-ver-rename"){ renameVersion(); return; }
      if(e.target.id==="btn-ver-link"){ copyVersionLink(); return; }
      var addCat=e.target.getAttribute("data-add");
      if(addCat){
        addingCat=addCat;
        newItem={_key:"NEW",category:addCat,name:"",warehouse:"",spec:"",supply_price:0,courier:"",ship_fee:addCat==="living"?2500:4000,tax:addCat==="fish"?"면세":"과세",image:"",show:true};
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
    client.from("products").insert(row).select().then(function(res){
      if(res.error) throw res.error;
      var r=(res.data && res.data[0]) || null;
      if(r){
        items.push({ _key:uid(), id:r.id, category:r.category||"fish", name:r.name||"", warehouse:r.warehouse||"", spec:r.spec||"",
          supply_price:r.supply_price||0, courier:r.courier||"", ship_fee:r.ship_fee||0, tax:r.tax||"면세", image:r.image||"", show:r.show!==false, sort_order:r.sort_order||(maxSort+10) });
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
    var q = it.id ? client.from("products").update(r).eq("id",it.id) : client.from("products").insert(r).select();
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
      tax:it.tax||"면세", image:(it.image||"").trim(), show:it.show!==false, sort_order:order, updated_at:new Date().toISOString() };
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
    if(inserts.length)    chain=chain.then(function(){ return client.from("products").insert(inserts).then(chk); });

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
  function slugify(name){
    var s=(name||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
    if(!s) s="v"+uid().slice(0,6);
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
    var name=window.prompt("버전 이름 변경", currentVersion.name); if(!name||!name.trim()) return;
    name=name.trim();
    client.from("versions").update({name:name}).eq("id",currentVersion.id).then(chk).then(function(){
      currentVersion.name=name;
      var v=versions.filter(function(x){return x.id===currentVersion.id;})[0]; if(v)v.name=name;
      renderEditor(); toast("이름을 바꿨어요");
    }).catch(function(err){ toast("이름 변경 실패: "+(err.message||err), true); });
  }
  function copyVersionLink(){
    if(!currentVersion) return;
    var url=location.href.split("?")[0].replace(/admin\.html$/,"")+"?v="+encodeURIComponent(currentVersion.slug);
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(url).then(function(){ toast("링크 복사됨 ✅"); }, function(){ window.prompt("아래 링크를 복사하세요", url); });
    } else { window.prompt("아래 링크를 복사하세요", url); }
  }
  function newVersion(){
    var name=window.prompt("새 버전 이름 (예: 온라인 판매 셀러)"); if(!name||!name.trim()) return;
    name=name.trim();
    var copy = !!(currentVersion) && window.confirm("현재 버전('"+currentVersion.name+"')의 상품·문구를 복사해서 시작할까요?\n\n[확인] 복사하기   [취소] 빈 버전으로");
    var srcVersion = currentVersion;
    var slug=slugify(name);
    var sort=(versions.length?Math.max.apply(null,versions.map(function(v){return v.sort_order||0;})):0)+1;
    var settings=(copy && srcVersion)?Object.assign({},srcVersion.settings||{}):{};
    client.from("versions").insert({slug:slug,name:name,sort_order:sort,settings:settings}).select().then(function(res){
      if(res.error) throw res.error;
      var nv=res.data[0];
      var finish=function(){
        return loadVersions().then(function(){
          currentVersion=versions.filter(function(v){return v.id===nv.id;})[0]||nv;
          return Promise.all([loadProducts(), loadAdminSettings()]);
        }).then(function(){ dirty=false; renderEditor(); toast("새 버전 '"+name+"' 만들었어요 ✅"); });
      };
      if(copy && srcVersion){
        return client.from("products").select("*").eq("version_id",srcVersion.id).then(function(pr){
          var rows=(pr.data||[]).map(function(p){ return {category:p.category,name:p.name,warehouse:p.warehouse,spec:p.spec,supply_price:p.supply_price,courier:p.courier,ship_fee:p.ship_fee,tax:p.tax,image:p.image,show:p.show,sort_order:p.sort_order,version_id:nv.id}; });
          if(!rows.length) return finish();
          return client.from("products").insert(rows).then(chk).then(finish);
        });
      }
      return finish();
    }).catch(function(err){ toast("버전 생성 실패: "+(err.message||err), true); });
  }

  function loadVersions(){
    return client.from("versions").select("*").order("sort_order",{ascending:true}).then(function(res){
      if(res.error){ versions=[]; currentVersion=null; return; }
      versions=res.data||[];
      if(versions.length){
        currentVersion = (currentVersion && versions.filter(function(v){return v.id===currentVersion.id;})[0]) || versions[0];
      } else { currentVersion=null; }
    }).catch(function(){ versions=[]; currentVersion=null; });
  }

  function loadProducts(){
    var q=client.from("products").select("*").order("sort_order",{ascending:true});
    if(currentVersion) q=q.eq("version_id", currentVersion.id);
    return q.then(function(res){
      if(res.error) throw res.error;
      items=(res.data||[]).map(function(r){ return {
        _key:uid(), id:r.id, category:r.category||"fish", name:r.name||"", warehouse:r.warehouse||"", spec:r.spec||"",
        supply_price:r.supply_price||0, courier:r.courier||"", ship_fee:r.ship_fee||0, tax:r.tax||"면세",
        image:r.image||"", show:r.show!==false, sort_order:r.sort_order||0 }; });
    });
  }

  function loadAdminSettings(){
    siteSettings = (currentVersion && currentVersion.settings) ? Object.assign({}, currentVersion.settings) : {};
    return Promise.resolve();
  }

  function boot(){
    root.innerHTML='<div class="loading">불러오는 중…</div>';
    client.auth.getUser().then(function(u){ window.__adminEmail=(u&&u.data&&u.data.user&&u.data.user.email)||""; });
    loadVersions().then(function(){
      return Promise.all([loadProducts(), loadAdminSettings(), loadCategoriesAdmin()]);
    }).then(function(){ dirty=false; renderEditor(); if(apiUrl()) loadCatalogFromApi(); })
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
