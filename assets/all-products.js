/* =========================================================
   전체 취급 상품 — 창고별 보기
   data/all-products.json (구글 마스터 유통시트 스냅샷)을 읽어
   창고(공급처)별 섹션으로 묶어 보여준다. 로그인·가격숨김 없음 — 내부용.
   ========================================================= */
(function () {
  "use strict";

  var root = document.getElementById("app");
  var wonKR = new Intl.NumberFormat("ko-KR");

  var CAT_COLOR = {
    "수산물": "#0E8A8F", "축산물": "#C0392B", "간편식품·밀키트": "#FF5B39",
    "농산물·과일": "#3BA559", "계란·유제품": "#E8A33D", "김치·반찬": "#B23A48",
    "떡·간식": "#9B5DE5", "생활용품": "#3D7DCB", "선물세트": "#C9A227"
  };

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function money(n) { var v = Number(n); if (!isFinite(v)) return ""; if (v === 0) return "무료"; return "₩" + wonKR.format(v); }
  function imgUrl(v) {
    var s = String(v || "").trim(); if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    return "images/products/" + s.replace(/^\/+/, "");
  }
  function slugify(s) {
    return String(s || "").trim().toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-+|-+$/g, "") || "wh";
  }

  function cardHTML(p) {
    var img = imgUrl(p.image);
    var accent = CAT_COLOR[p.category] || "#0E8A8F";
    var imgHtml = img
      ? '<img src="' + esc(img) + '" alt="" loading="lazy" decoding="async">'
      : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#9aa7ad;font-size:12px;">사진 준비중</div>';
    return '' +
      '<div class="prod-card" data-name="' + esc((p.name || "").toLowerCase()) + '">' +
        '<div class="prod-img" style="background:#eef4f3;">' +
          imgHtml +
          (p.category ? '<div class="badge-tag" style="background:' + accent + ';">' + esc(p.category) + '</div>' : '') +
          (p.tax ? '<div class="badge-tax">' + esc(p.tax) + '</div>' : '') +
        '</div>' +
        '<div class="prod-body">' +
          '<h3>' + esc(p.name) + '</h3>' +
          '<div class="prod-spec">' + esc(p.spec || "") + '</div>' +
          '<div class="price-row"><span class="lbl">공급가</span><span class="val display">' + money(p.supplyPrice) + '</span></div>' +
          '<div class="ship-row">' +
            (p.courier ? '<span class="pill" style="color:' + accent + ';background:#eef4f3;">' + esc(p.courier) + '</span>' : '') +
            '<span class="txt">택배비 ' + money(p.shipFee) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function groupByWarehouse(list) {
    var by = {}, order = [];
    list.forEach(function (p) {
      var wh = (p.warehouse || "기타").trim() || "기타";
      if (!by[wh]) { by[wh] = []; order.push(wh); }
      by[wh].push(p);
    });
    order.sort(function (a, b) { return by[b].length - by[a].length; });
    return { by: by, order: order };
  }

  function render(list) {
    var shown = list.filter(function (p) { return p.show !== false; });
    var g = groupByWarehouse(shown);
    var whCount = g.order.length;

    var html = '' +
      '<div class="ap-hero">' +
        '<div class="kicker">주식회사 마스터 · 외부유통팀</div>' +
        '<h1 class="display">전체 취급 상품 — 창고별 보기</h1>' +
        '<p>마스터 유통시트 전체 창고를 그대로 옮겨온 목록입니다. 시세가 자주 바뀌니 최종 발주 전 담당자에게 확인해 주세요.</p>' +
        '<div class="ap-stats"><span><b>' + shown.length + '</b>개 상품</span><span><b>' + whCount + '</b>개 창고/공급처</span></div>' +
      '</div>' +
      '<div class="ap-toolbar">' +
        '<input type="search" class="ap-search" id="ap-search" placeholder="상품명으로 검색…">' +
        '<div class="ap-nav" id="ap-nav">' +
          g.order.map(function (wh) {
            return '<a class="ap-chip" href="#wh-' + slugify(wh) + '">' + esc(wh) + '<span class="n"> ' + g.by[wh].length + '</span></a>';
          }).join("") +
        '</div>' +
      '</div>' +
      '<div class="ap-empty" id="ap-empty">검색 결과가 없습니다.</div>' +
      '<div id="ap-sections">' +
      g.order.map(function (wh) {
        return '<section class="ap-wh-section" id="wh-' + slugify(wh) + '">' +
          '<div class="ap-wh-head"><h2>' + esc(wh) + '</h2><span class="cnt">' + g.by[wh].length + '개</span></div>' +
          '<div class="prod-grid">' + g.by[wh].map(cardHTML).join("") + '</div>' +
        '</section>';
      }).join("") +
      '</div>';

    root.innerHTML = html;

    var searchEl = document.getElementById("ap-search");
    searchEl.addEventListener("input", function () {
      var q = searchEl.value.trim().toLowerCase();
      var anyShown = false;
      document.querySelectorAll(".ap-wh-section").forEach(function (sec) {
        var visible = 0;
        sec.querySelectorAll(".prod-card").forEach(function (card) {
          var match = !q || card.getAttribute("data-name").indexOf(q) > -1;
          card.classList.toggle("ap-hide", !match);
          if (match) visible++;
        });
        sec.style.display = visible ? "" : "none";
        if (visible) anyShown = true;
      });
      document.getElementById("ap-empty").style.display = anyShown ? "none" : "block";
    });
  }

  fetch("data/all-products.json")
    .then(function (r) { return r.json(); })
    .then(function (data) { render(data || []); })
    .catch(function () {
      root.innerHTML = '<div class="notice">상품 목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</div>';
    });
})();
