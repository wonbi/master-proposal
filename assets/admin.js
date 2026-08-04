/* =========================================================
   상품 관리자 — Supabase 연동 편집 페이지
   ========================================================= */
(function () {
  "use strict";

  var CFG = window.PROPOSAL_CONFIG || {};
  var SB = CFG.supabase || {};
  var root = document.getElementById("admin-root");

  var CATS = [
    { key: "fish",   label: "신선 수산물", color: "#0E8A8F" },
    { key: "meal",   label: "간편식품",   color: "#FF5B39" },
    { key: "living", label: "생활용품",   color: "#3BA559" }
  ];

  var client = null;
  var items = [];        // 작업중 상품 목록
  var deletedIds = [];   // 저장 시 삭제할 id
  var dirty = false;
  var addingCat = null;  // 현재 새 상품 추가 중인 카테고리
  var newItem = null;    // 입력 중인 새 상품
  var acResults = [];    // 자동완성 검색결과(비공개 카탈로그)
  var acTimer = null;
  var _delegated = false; // root 이벤트는 한 번만 바인딩

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
  function setDirty(v){ dirty=v; var st=document.getElementById("save-status"); var bt=document.getElementById("btn-save"); if(st){st.textContent=v?"저장 안 된 변경사항이 있습니다":"모든 변경사항이 저장됨";st.className="status"+(v?" dirty":"");} if(bt)bt.disabled=!v; }
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
    var catOpts=CATS.map(function(c){return '<option value="'+c.key+'"'+(it.category===c.key?' selected':'')+'>'+c.label+'</option>';}).join("");
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
          '<button class="btn-del" data-del="'+it._key+'">삭제</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  }

  function addFormHTML(){
    var it=newItem; var pv=imgUrl(it.image);
    var taxSel=function(v){return '<option'+(it.tax===v?' selected':'')+'>'+v+'</option>';};
    var catOpts=CATS.map(function(c){return '<option value="'+c.key+'"'+(it.category===c.key?' selected':'')+'>'+c.label+'</option>';}).join("");
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
    var html =
      '<div class="topbar"><span class="brand">🐟 상품 관리자</span>'+
      '<span class="spacer"></span>'+
      '<a href="index.html" target="_blank" rel="noopener">공개 사이트 보기 ↗</a>'+
      '<button class="btn-ghost" id="btn-logout">로그아웃</button></div>'+
      '<div class="wrap">'+
      '<div class="hint">상품을 수정·추가·삭제한 뒤 아래 <b>[확정 저장]</b> 버튼을 누르면 공개 사이트에 반영됩니다. 사진은 각 상품의 <b>[사진 업로드]</b>로 바꿀 수 있어요.</div>';

    CATS.forEach(function(c){
      var list=items.filter(function(i){return i.category===c.key;});
      html+='<div class="cat-block"><div class="cat-title"><span class="dot" style="background:'+c.color+'"></span>'+c.label+' <span class="count">'+list.length+'개</span></div>';
      html+=list.map(cardHTML).join("");
      if(addingCat===c.key){ html+=addFormHTML(); }
      else { html+='<div class="add-row"><button class="btn-add" data-add="'+c.key+'">+ '+c.label+' 상품 1개 추가</button></div>'; }
      html+='</div>';
    });

    html+='</div>'+
      '<div class="savebar"><span class="status" id="save-status">모든 변경사항이 저장됨</span>'+
      '<button class="btn-save" id="btn-save" disabled>확정 저장</button></div>';
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
      if(e.target.id==="btn-save"){ saveAll(); return; }
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
      var delKey=e.target.getAttribute("data-del");
      if(delKey){ var it=findItem(delKey); if(it&&it.id)deletedIds.push(it.id); items=items.filter(function(x){return x._key!==delKey;}); setDirty(true); renderEditor(); }
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
  function runCatalog(q){
    if(!client) return;
    client.from("catalog").select("*").ilike("name","%"+q+"%").order("status",{ascending:true}).limit(8).then(function(res){
      var list=document.getElementById("ac-list"); if(!list) return;
      if(res.error){ hideAc(); return; }              // 카탈로그 표 없음 등 → 조용히 무시
      acResults=res.data||[];
      if(!acResults.length){ list.className="ac-list show"; list.innerHTML='<div class="ac-empty">일치하는 상품이 없어요</div>'; return; }
      list.innerHTML=acResults.map(function(r,i){
        var price=r.supply_price?("₩"+Number(r.supply_price).toLocaleString()):"";
        var out=r.status==="품절"?'<span class="ac-out">품절</span>':"";
        return '<div class="ac-item" data-ac="'+i+'"><span class="ac-name">'+esc(r.name)+'</span>'+
               '<span class="ac-meta">'+esc(r.warehouse||"")+(price?" · "+price:"")+" "+out+'</span></div>';
      }).join("");
      list.className="ac-list show";
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

  function dbRow(it, order){
    var r={ category:it.category, name:(it.name||"").trim(), warehouse:(it.warehouse||"").trim(), spec:(it.spec||"").trim(),
      supply_price:parseInt(it.supply_price,10)||0, courier:(it.courier||"").trim(), ship_fee:parseInt(it.ship_fee,10)||0,
      tax:it.tax||"면세", image:(it.image||"").trim(), show:it.show!==false, sort_order:order, updated_at:new Date().toISOString() };
    if(it.id) r.id=it.id;
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
      btn.disabled=false; btn.textContent="확정 저장";
      toast("저장 실패: "+(err.message||err), true);
    });
  }
  function chk(res){ if(res && res.error) throw res.error; return res; }

  /* ---------------- 로드 / 부팅 ---------------- */
  function loadProducts(){
    return client.from("products").select("*").order("sort_order",{ascending:true}).then(function(res){
      if(res.error) throw res.error;
      items=(res.data||[]).map(function(r){ return {
        _key:uid(), id:r.id, category:r.category||"fish", name:r.name||"", warehouse:r.warehouse||"", spec:r.spec||"",
        supply_price:r.supply_price||0, courier:r.courier||"", ship_fee:r.ship_fee||0, tax:r.tax||"면세",
        image:r.image||"", show:r.show!==false, sort_order:r.sort_order||0 }; });
    });
  }

  function boot(){
    root.innerHTML='<div class="loading">상품을 불러오는 중…</div>';
    client.auth.getUser().then(function(u){ window.__adminEmail=(u&&u.data&&u.data.user&&u.data.user.email)||""; });
    loadProducts().then(function(){ dirty=false; renderEditor(); })
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
