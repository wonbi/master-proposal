/* =========================================================
   상품 사진·스펙 자동 업데이트 — masterc.kr 탭에서 북마클릿으로 실행됨
   (photo-updater.html 참고)

   동작 원리:
   - masterc.kr에 로그인된 탭 "안에서" 실행되므로 그 사이트를 fetch해도
     같은 출처(same-origin)라 CORS에 막히지 않고 로그인 세션도 그대로 쓴다.
   - 상품 목록·저장은 우리 Supabase REST API를 직접 호출한다(별도 캐시 시트 없이
     products.image / products.spec 컬럼에 바로 씀).
   - 쓰기 권한은 상품 관리자에서 복사한 로그인 토큰(1시간 유효)으로 인증한다.
   ========================================================= */
(function () {
  "use strict";

  // 이미 떠 있으면 다시 안 열고 토글만
  if (window.__mspPhotoUpdater) { window.__mspPhotoUpdater.toggle(); return; }

  var SELF_SRC = (document.currentScript && document.currentScript.src) || "";
  var BASE = SELF_SRC.replace(/assets\/photo-updater\.js.*$/, "");
  var TOKEN_KEY = "msp_pu_token";

  // ---------------------------------------------------------------
  // EXTRACT 규칙 — masterc.kr 실제 페이지 구조에 맞춰 이 부분만 고치면 됨.
  // 지금은 일반적인 og:image / meta description 기반 기본값이라
  // masterc.kr에 맞는 더 정확한 선택자로 바꿔야 결과가 좋아질 수 있음.
  // ---------------------------------------------------------------
  var EXTRACT = {
    image: function (doc) {
      var og = doc.querySelector('meta[property="og:image"]');
      if (og && og.getAttribute("content")) return og.getAttribute("content");
      var tw = doc.querySelector('meta[name="twitter:image"]');
      if (tw && tw.getAttribute("content")) return tw.getAttribute("content");
      var imgs = Array.prototype.slice.call(doc.querySelectorAll("img"));
      for (var i = 0; i < imgs.length; i++) {
        var src = imgs[i].getAttribute("src") || "";
        if (src && !/logo|icon|sprite|blank|spinner|avatar/i.test(src)) return src;
      }
      return "";
    },
    spec: function (doc) {
      var ogd = doc.querySelector('meta[property="og:description"]');
      if (ogd && ogd.getAttribute("content")) return ogd.getAttribute("content").trim();
      var d = doc.querySelector('meta[name="description"]');
      if (d && d.getAttribute("content")) return d.getAttribute("content").trim();
      return "";
    }
  };

  function absUrl(u, base) {
    if (!u) return "";
    try { return new URL(u, base).href; } catch (e) { return u; }
  }

  function loadConfig() {
    return new Promise(function (resolve) {
      if (window.PROPOSAL_CONFIG) { resolve(window.PROPOSAL_CONFIG); return; }
      var s = document.createElement("script");
      s.src = BASE + "config.js?" + Date.now();
      s.onload = function () { resolve(window.PROPOSAL_CONFIG || {}); };
      s.onerror = function () { resolve({}); };
      document.body.appendChild(s);
    });
  }

  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
  }
  function askToken() {
    var t = window.prompt("상품 관리자 → [📸 북마클릿 토큰 복사]로 받은 토큰을 붙여넣으세요.\n(이 탭에서만 기억되고, 창을 닫으면 사라집니다)");
    if (t) { t = t.trim(); try { sessionStorage.setItem(TOKEN_KEY, t); } catch (e) {} }
    return t || "";
  }

  var SB = null; // { url, anonKey }
  var products = [];
  var filter = "missing"; // missing | all
  var query = "";
  var selected = {};
  var busy = false;
  var results = { ok: 0, fail: 0, failList: [] };

  var PANEL_ID = "msp-pu-panel";

  function css() {
    return "#" + PANEL_ID + "{position:fixed;right:16px;bottom:16px;width:340px;max-height:78vh;" +
      "background:#fff;border:1px solid #dfe4e0;border-radius:14px;box-shadow:0 10px 34px rgba(20,40,30,.22);" +
      "z-index:2147483647;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#18211f;" +
      "display:flex;flex-direction:column;overflow:hidden;font-size:12.5px;}" +
      "#" + PANEL_ID + " .hd{padding:12px 14px;background:#0E8A8F;color:#fff;display:flex;justify-content:space-between;align-items:center;font-weight:700;}" +
      "#" + PANEL_ID + " .hd button{background:transparent;border:none;color:#fff;font-size:16px;cursor:pointer;line-height:1;}" +
      "#" + PANEL_ID + " .bd{padding:10px 14px;overflow:auto;flex:1;}" +
      "#" + PANEL_ID + " .row{display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;}" +
      "#" + PANEL_ID + " .chip{border:1px solid #dfe4e0;background:#f4f6f5;border-radius:16px;padding:4px 10px;cursor:pointer;font-size:11.5px;font-weight:600;}" +
      "#" + PANEL_ID + " .chip.on{background:#0E8A8F;border-color:#0E8A8F;color:#fff;}" +
      "#" + PANEL_ID + " input[type=search]{width:100%;box-sizing:border-box;border:1px solid #dfe4e0;border-radius:8px;padding:6px 9px;margin-bottom:8px;font-size:12.5px;}" +
      "#" + PANEL_ID + " .item{display:flex;gap:7px;align-items:flex-start;padding:5px 0;border-bottom:1px dashed #eef1ec;}" +
      "#" + PANEL_ID + " .item span{flex:1;line-height:1.4;}" +
      "#" + PANEL_ID + " .tag{font-size:10px;color:#9aa7ad;}" +
      "#" + PANEL_ID + " .ft{padding:10px 14px;border-top:1px solid #eef1ec;}" +
      "#" + PANEL_ID + " .btn{width:100%;background:#0E8A8F;color:#fff;border:none;border-radius:9px;padding:9px;font-weight:700;cursor:pointer;font-size:12.5px;}" +
      "#" + PANEL_ID + " .btn[disabled]{opacity:.5;cursor:default;}" +
      "#" + PANEL_ID + " .prog{font-size:11.5px;color:#6a7671;margin-top:6px;text-align:center;}" +
      "#" + PANEL_ID + " .empty{color:#9aa7ad;text-align:center;padding:20px 0;}";
  }

  function ensureStyle() {
    if (document.getElementById("msp-pu-style")) return;
    var st = document.createElement("style"); st.id = "msp-pu-style"; st.textContent = css();
    document.head.appendChild(st);
  }

  function filtered() {
    return products.filter(function (p) {
      if (filter === "missing" && p.image && p.spec) return false;
      if (query && p.name.toLowerCase().indexOf(query.toLowerCase()) < 0) return false;
      return true;
    });
  }

  function render() {
    ensureStyle();
    var panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("div");
      panel.id = PANEL_ID;
      document.body.appendChild(panel);
    }
    var list = filtered();
    var selCount = Object.keys(selected).filter(function (k) { return selected[k]; }).length;
    panel.innerHTML =
      '<div class="hd"><span>📸 사진·스펙 업데이트</span><button id="mspu-close">×</button></div>' +
      '<div class="bd">' +
      '<div class="row">' +
      '<span class="chip' + (filter === "missing" ? " on" : "") + '" data-f="missing">누락만 (' + products.filter(function (p) { return p.link && (!p.image || !p.spec); }).length + ')</span>' +
      '<span class="chip' + (filter === "all" ? " on" : "") + '" data-f="all">전체 (' + products.filter(function (p) { return p.link; }).length + ')</span>' +
      '<span class="chip" id="mspu-selall">전체선택</span>' +
      '<span class="chip" id="mspu-selnone">선택해제</span>' +
      '</div>' +
      '<input type="search" id="mspu-q" placeholder="상품명 검색" value="' + esc(query) + '">' +
      (list.length ? list.map(itemHTML).join("") : '<div class="empty">해당하는 상품이 없습니다</div>') +
      '</div>' +
      '<div class="ft">' +
      '<button class="btn" id="mspu-run"' + (busy || !selCount ? " disabled" : "") + '>' +
      (busy ? "업데이트 중…" : "선택 " + selCount + "건 업데이트") + '</button>' +
      '<div class="prog" id="mspu-prog">' + progText() + '</div>' +
      '</div>';
    bind(panel);
  }

  function progText() {
    if (busy) return "진행 중…";
    if (results.ok || results.fail) {
      var t = "완료 — 성공 " + results.ok + "건";
      if (results.fail) t += ", 실패 " + results.fail + "건 (" + results.failList.slice(0, 3).join(", ") + (results.failList.length > 3 ? " 외" : "") + ")";
      return t;
    }
    return "링크가 등록된 상품 중 골라서 업데이트하세요";
  }

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  function itemHTML(p) {
    var checked = !!selected[p.id];
    var tag = (!p.image && !p.spec) ? "사진·스펙 없음" : (!p.image ? "사진 없음" : (!p.spec ? "스펙 없음" : "완료"));
    return '<label class="item"><input type="checkbox" data-id="' + p.id + '"' + (checked ? " checked" : "") + '>' +
      '<span>' + esc(p.name) + '<br><span class="tag">' + tag + '</span></span></label>';
  }

  function bind(panel) {
    panel.querySelector("#mspu-close").onclick = function () { panel.remove(); window.__mspPhotoUpdater.open = false; };
    panel.querySelectorAll(".chip[data-f]").forEach(function (el) {
      el.onclick = function () { filter = el.getAttribute("data-f"); render(); };
    });
    panel.querySelector("#mspu-selall").onclick = function () {
      filtered().forEach(function (p) { if (p.link) selected[p.id] = true; }); render();
    };
    panel.querySelector("#mspu-selnone").onclick = function () { selected = {}; render(); };
    var q = panel.querySelector("#mspu-q");
    q.oninput = function () { query = q.value; render(); q.focus(); q.selectionStart = q.selectionEnd = q.value.length; };
    panel.querySelectorAll("input[data-id]").forEach(function (el) {
      el.onchange = function () { selected[el.getAttribute("data-id")] = el.checked; render(); };
    });
    var runBtn = panel.querySelector("#mspu-run");
    if (runBtn) runBtn.onclick = runUpdate;
  }

  function sbHeaders(withAuth) {
    var h = { "apikey": SB.anonKey, "Content-Type": "application/json" };
    if (withAuth) h["Authorization"] = "Bearer " + getToken();
    return h;
  }

  function loadProducts() {
    return fetch(SB.url + "/rest/v1/products?select=id,name,link,image,spec&order=name.asc", { headers: sbHeaders(false) })
      .then(function (r) { if (!r.ok) throw new Error("목록 조회 실패 " + r.status); return r.json(); })
      .then(function (rows) {
        products = (rows || []).map(function (r) {
          return { id: r.id, name: r.name || "", link: (r.link || "").trim(), image: (r.image || "").trim(), spec: (r.spec || "").trim() };
        }).filter(function (p) { return p.link; });
      });
  }

  function scrapeOne(url) {
    return fetch(url, { credentials: "include", redirect: "follow" })
      .then(function (r) { if (!r.ok) throw new Error("페이지 오류 " + r.status); return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        return {
          image: absUrl(EXTRACT.image(doc), url),
          spec: EXTRACT.spec(doc)
        };
      });
  }

  function saveOne(p, found) {
    var patch = {};
    if (found.image) patch.image = found.image;
    if (found.spec) patch.spec = found.spec;
    if (!Object.keys(patch).length) return Promise.resolve("nochange");
    return fetch(SB.url + "/rest/v1/products?id=eq." + encodeURIComponent(p.id), {
      method: "PATCH", headers: Object.assign(sbHeaders(true), { "Prefer": "return=minimal" }),
      body: JSON.stringify(patch)
    }).then(function (r) {
      if (r.status === 401) throw new Error("토큰 만료");
      if (!r.ok) throw new Error("저장 실패 " + r.status);
      return "ok";
    });
  }

  function delay(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }

  function runUpdate() {
    var ids = Object.keys(selected).filter(function (k) { return selected[k]; });
    if (!ids.length) return;
    if (!getToken() && !askToken()) return;
    busy = true; results = { ok: 0, fail: 0, failList: [] }; render();
    var chain = Promise.resolve();
    ids.forEach(function (id) {
      chain = chain.then(function () {
        var p = products.filter(function (x) { return String(x.id) === String(id); })[0];
        if (!p) return;
        return scrapeOne(p.link)
          .then(function (found) { return saveOne(p, found); })
          .then(function (status) {
            if (status === "ok" || status === "nochange") { results.ok++; }
          })
          .catch(function (err) {
            results.fail++; results.failList.push(p.name);
            if (/토큰 만료/.test(err.message)) { try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {} }
          })
          .then(function () { render(); return delay(400); });
      });
    });
    chain.then(function () {
      busy = false;
      return loadProducts();
    }).then(function () { selected = {}; render(); });
  }

  loadConfig().then(function (cfg) {
    SB = (cfg && cfg.supabase) || {};
    if (!SB.url || !SB.anonKey) { window.alert("Supabase 설정을 불러오지 못했어요. config.js를 확인하세요."); return; }
    if (!getToken()) askToken();
    return loadProducts();
  }).then(function () {
    render();
    window.__mspPhotoUpdater = {
      open: true,
      toggle: function () {
        var panel = document.getElementById(PANEL_ID);
        if (panel) { panel.remove(); this.open = false; } else { this.open = true; render(); }
      }
    };
  }).catch(function (err) {
    window.alert("불러오기 실패: " + (err && err.message || err));
  });
})();
