/* =========================================================
   상품 제안서 — 렌더링 로직
   - 구글 시트가 연결돼 있으면 시트에서 상품을 읽어옵니다.
   - 없거나 오류가 나면 기본 데이터(data/products.json)로 표시합니다.
   ========================================================= */
(function () {
  "use strict";

  var CFG = window.PROPOSAL_CONFIG || {};

  // 카테고리별 디자인 값 (고정)
  var CAT = {
    fish:   { key: "fish",   name: "신선 수산물", mark: "魚", eyebrow: "SEAFOOD · 메인 카테고리", accent: "#0E8A8F", soft: "#E4F1F1", imgBg: "#E4F1F1", rowBg: "#F3F8F8", pillBg: "#DCEDED", fit: "cover" },
    meal:   { key: "meal",   name: "간편식품",   mark: "食", eyebrow: "CONVENIENCE FOOD",       accent: "#FF5B39", soft: "#FCE7E0", imgBg: "#FCE7E0", rowBg: "#FDF1ED", pillBg: "#FAD9CF", fit: "cover" },
    living: { key: "living", name: "생활용품",   mark: "生", eyebrow: "LIVING GOODS",           accent: "#3BA559", soft: "#E6F2E9", imgBg: "#ffffff", rowBg: "#EEF6F0", pillBg: "#D6EBDC", fit: "contain" }
  };
  var CAT_ORDER = ["fish", "meal", "living"];

  // 창고 이름 → 배지 색
  var WH_COLOR = {
    "동해": "#0E8A8F", "군산": "#1AA0A6", "인천": "#0E7C86",
    "하남": "#FF5B39", "김포": "#F0713F", "푸카": "#C2410C", "찐한국": "#3BA559"
  };

  var wonKR = new Intl.NumberFormat("ko-KR");

  // ---------- 유틸 ----------
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function money(n) {
    var v = Number(n);
    if (!isFinite(v) || v === 0 && (n === "" || n == null)) return esc(n || "");
    return "₩" + wonKR.format(v);
  }
  function toNumber(s) {
    if (typeof s === "number") return s;
    var d = String(s || "").replace(/[^0-9.-]/g, "");
    return d === "" ? 0 : Number(d);
  }
  function normCat(v) {
    var s = String(v || "").trim().toLowerCase();
    if (s.indexOf("fish") > -1 || s.indexOf("수산") > -1 || s.indexOf("seafood") > -1) return "fish";
    if (s.indexOf("meal") > -1 || s.indexOf("간편") > -1 || s.indexOf("식품") > -1) return "meal";
    if (s.indexOf("living") > -1 || s.indexOf("생활") > -1) return "living";
    return null;
  }
  function isShown(v) {
    if (v == null || v === "") return true;
    var s = String(v).trim().toLowerCase();
    return !(s === "false" || s === "n" || s === "no" || s === "x" || s === "0" || s === "숨김" || s === "비공개");
  }

  // 이미지 값 → 실제 URL (파일명 / 일반 URL / 구글드라이브 링크 모두 지원)
  function resolveImage(v) {
    var s = String(v || "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) {
      var m = s.match(/drive\.google\.com\/file\/d\/([^/]+)/) ||
              s.match(/drive\.google\.com\/open\?id=([^&]+)/) ||
              s.match(/[?&]id=([^&]+)/);
      if (m && /drive\.google\.com/.test(s)) {
        return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w1000";
      }
      return s;
    }
    return "images/products/" + s.replace(/^\/+/, "");
  }

  // ---------- CSV 파서 ----------
  function parseCSV(text) {
    var rows = [], row = [], field = "", inQ = false, i = 0, c;
    while (i < text.length) {
      c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    row.push(field); rows.push(row);
    return rows.filter(function (r) { return r.length > 1 || (r[0] || "").trim() !== ""; });
  }

  // 시트 헤더명 → 표준 키
  function headerKey(h) {
    var s = String(h || "").trim().replace(/\s+/g, "").toLowerCase();
    var map = {
      "카테고리": "category", "분류": "category", "category": "category",
      "상품명": "name", "이름": "name", "name": "name",
      "창고": "warehouse", "배지": "warehouse", "태그": "warehouse", "warehouse": "warehouse",
      "설명": "spec", "스펙": "spec", "spec": "spec",
      "공급가": "supplyPrice", "가격": "supplyPrice", "단가": "supplyPrice", "price": "supplyPrice",
      "택배사": "courier", "courier": "courier",
      "택배비": "shipFee", "배송비": "shipFee", "shipfee": "shipFee",
      "면과세": "tax", "과세": "tax", "tax": "tax",
      "사진": "image", "이미지": "image", "image": "image", "img": "image",
      "노출": "show", "표시": "show", "show": "show"
    };
    return map[s] || null;
  }

  function rowsToProducts(rows) {
    if (!rows.length) return [];
    var head = rows[0].map(headerKey);
    var out = [];
    for (var r = 1; r < rows.length; r++) {
      var obj = {};
      for (var c = 0; c < head.length; c++) {
        if (head[c]) obj[head[c]] = rows[r][c];
      }
      if (!obj.name || !String(obj.name).trim()) continue; // 빈 줄 스킵
      out.push(obj);
    }
    return out;
  }

  // ---------- 정규화 ----------
  function normalize(list) {
    var products = [];
    list.forEach(function (p) {
      if (!isShown(p.show)) return;
      var cat = normCat(p.category);
      if (!cat) return;
      var wh = String(p.warehouse || "").trim();
      products.push({
        cat: cat,
        name: String(p.name || "").trim(),
        warehouse: wh,
        spec: String(p.spec || "").trim(),
        supplyPrice: toNumber(p.supplyPrice),
        courier: String(p.courier || "").trim(),
        shipFee: toNumber(p.shipFee),
        tax: String(p.tax || "").trim(),
        image: resolveImage(p.image),
        badgeColor: WH_COLOR[wh] || CAT[cat].accent
      });
    });
    return products;
  }

  // ---------- 렌더 ----------
  function cardHTML(p) {
    var c = CAT[p.cat];
    var imgHtml = p.image
      ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async">'
      : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#9aa7ad;font-size:13px;">사진 준비중</div>';
    return '' +
      '<div class="prod-card">' +
        '<div class="prod-img' + (c.fit === "contain" ? " contain" : "") + '" style="background:' + c.imgBg + ';">' +
          imgHtml +
          (p.warehouse ? '<div class="badge-tag" style="background:' + p.badgeColor + ';">' + esc(p.warehouse) + '</div>' : '') +
          (p.tax ? '<div class="badge-tax">' + esc(p.tax) + '</div>' : '') +
        '</div>' +
        '<div class="prod-body">' +
          '<h3>' + esc(p.name) + '</h3>' +
          (p.spec ? '<div class="prod-spec">' + esc(p.spec) + '</div>' : '') +
          '<div class="price-row"><span class="lbl">공급가</span><span class="val display">' + money(p.supplyPrice) + '</span></div>' +
          '<div class="ship-row" style="background:' + c.rowBg + ';">' +
            (p.courier ? '<span class="pill" style="color:' + c.accent + ';background:' + c.pillBg + ';">' + esc(p.courier) + '</span>' : '') +
            '<span class="txt">택배비 ' + money(p.shipFee) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function sectionHTML(cat, items) {
    var c = CAT[cat];
    var meta = (CFG.categoryText && CFG.categoryText[cat] && CFG.categoryText[cat].meta) || "";
    var cards = items.map(cardHTML).join("");
    return '' +
      '<section id="' + cat + '" class="section">' +
        '<div class="sec-head" style="border-bottom:3px solid ' + c.accent + ';">' +
          '<div class="left">' +
            '<div class="tile display" style="background:' + c.accent + ';">' + c.mark + '</div>' +
            '<div>' +
              '<div class="kicker" style="color:' + c.accent + ';">' + esc(c.eyebrow) + '</div>' +
              '<h2 class="display">' + esc(c.name) + '</h2>' +
            '</div>' +
          '</div>' +
          (meta ? '<div class="meta">' + esc(meta) + '</div>' : '') +
        '</div>' +
        '<div class="prod-grid">' + cards + '</div>' +
      '</section>';
  }

  function overviewHTML(grouped) {
    var cards = CAT_ORDER.filter(function (k) { return grouped[k] && grouped[k].length; }).map(function (k) {
      var c = CAT[k];
      var t = (CFG.categoryText && CFG.categoryText[k]) || {};
      return '' +
        '<a class="cat-card" href="#' + k + '" style="background:' + c.soft + ';border:2px solid ' + c.accent + ';">' +
          '<div class="tile display" style="background:' + c.accent + ';">' + c.mark + '</div>' +
          '<h3 class="display">' + esc(c.name) + '</h3>' +
          '<p>' + esc(t.desc || "") + '</p>' +
          '<div class="go" style="color:' + c.accent + ';">' + grouped[k].length + '품목 · 바로가기 ↓</div>' +
        '</a>';
    }).join("");
    return '' +
      '<section class="section">' +
        '<div class="cat-head">' +
          '<div class="kicker">CATEGORY LINEUP</div>' +
          '<h2 class="display">세 갈래로 채우는 한 장의 제안</h2>' +
        '</div>' +
        '<div class="cat-grid">' + cards + '</div>' +
      '</section>';
  }

  function heroHTML(total, catCount) {
    var lines = (CFG.heroTitleLines || ["바다에서", "식탁까지,", "한 번에 채우다"]);
    var h1 = lines.map(function (ln, i) {
      return (i === lines.length - 1) ? '<span class="hl">' + esc(ln) + '</span>' : esc(ln);
    }).join("<br>");
    var mark = (CFG.company || "마스터").trim().charAt(0) || "마";
    return '' +
      '<section class="hero">' +
        '<div class="hero-circle c1"></div><div class="hero-circle c2"></div>' +
        '<div class="eyebrow"><span class="bar"></span>' + esc(CFG.heroEyebrow || "") + '</div>' +
        '<h1 class="display">' + h1 + '</h1>' +
        '<p class="hero-lead">' + esc(CFG.heroLead || "") + '</p>' +
        '<div class="stats">' +
          '<div><div class="num display">' + total + '</div><div class="lbl">엄선 품목</div></div>' +
          '<div class="divider"></div>' +
          '<div><div class="num display">' + catCount + '</div><div class="lbl">상품 카테고리</div></div>' +
          '<div class="divider"></div>' +
          '<div><div class="num display">전국</div><div class="lbl">택배 배송</div></div>' +
        '</div>' +
        '<div class="owner-chip">' +
          '<div class="avatar display">' + esc(mark) + '</div>' +
          '<div>' +
            '<div class="name">' + esc(CFG.company || "") + '</div>' +
            '<div class="sub">' + esc((CFG.team || "") + " · " + (CFG.managerName || "") + " " + (CFG.managerTitle || "")) + '</div>' +
          '</div>' +
        '</div>' +
      '</section>';
  }

  function calloutHTML() {
    return '' +
      '<section class="callout-sec">' +
        '<div class="callout">' +
          '<div class="tile display">全</div>' +
          '<div style="flex:1;">' +
            '<div class="title display">전체 상품은 약 500여 종 — 구글 시트로 실시간 공유합니다</div>' +
            '<p>이 제안서는 대표 품목만 추린 요약본입니다. 시세·재고에 따라 수시로 업데이트되는 <strong style="color:#08324B;">전체 품목·공급가 리스트</strong>는 구글 시트로 안내드리니, 아래 연락처로 요청 주시면 열람 링크를 바로 보내드립니다.</p>' +
          '</div>' +
          '<div class="cta">전체 리스트 요청 →</div>' +
        '</div>' +
      '</section>';
  }

  function contactHTML() {
    var mark = (CFG.managerName || "박").trim().charAt(0) || "박";
    var phone = CFG.phone || "", email = CFG.email || "", kakao = CFG.kakao || "";
    return '' +
      '<section class="contact">' +
        '<div class="contact-in">' +
          '<div>' +
            '<h2 class="display">지금 바로<br>거래 문의하세요</h2>' +
            '<p class="lead">맞춤 단가 제안이 가능합니다.<br>편하신 채널로 연락 주세요.</p>' +
          '</div>' +
          '<div class="contact-card">' +
            '<div class="who">' +
              '<div class="avatar display">' + esc(mark) + '</div>' +
              '<div>' +
                '<div class="name">' + esc(CFG.managerName || "") + ' <small>' + esc((CFG.team || "") + " " + (CFG.managerTitle || "")) + '</small></div>' +
                '<div class="org">' + esc(CFG.company || "") + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="contact-lines">' +
              (phone ? '<div class="line"><span class="k">전화</span><a class="v" href="tel:' + esc(phone.replace(/[^0-9+]/g, "")) + '">' + esc(phone) + '</a></div>' : '') +
              (email ? '<div class="line"><span class="k">이메일</span><a class="v" href="mailto:' + esc(email) + '">' + esc(email) + '</a></div>' : '') +
              (kakao ? '<div class="line"><span class="k">카카오톡</span><span class="v">' + esc(kakao) + '</span></div>' : '') +
              '<div class="line"><span class="k">전체 상품</span><span class="v">구글시트 · 요청 시 공유</span></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</section>';
  }

  function render(products) {
    var grouped = { fish: [], meal: [], living: [] };
    products.forEach(function (p) { if (grouped[p.cat]) grouped[p.cat].push(p); });
    var catCount = CAT_ORDER.filter(function (k) { return grouped[k].length; }).length;

    var html = heroHTML(products.length, catCount) + overviewHTML(grouped);
    CAT_ORDER.forEach(function (k) {
      if (grouped[k].length) html += sectionHTML(k, grouped[k]);
    });
    html += calloutHTML() + contactHTML();

    document.getElementById("app").innerHTML = html;
    document.title = (CFG.company || "상품") + " 상품 제안서";
  }

  // ---------- 데이터 로드 ----------
  function loadFallback() {
    return fetch("data/products.json", { cache: "no-store" })
      .then(function (r) { return r.json(); });
  }

  var _sbClient = null;
  function sbClient() {
    if (_sbClient) return _sbClient;
    var s = CFG.supabase || {};
    if (!s.url || !s.anonKey || !window.supabase) return null;
    _sbClient = window.supabase.createClient(s.url, s.anonKey);
    return _sbClient;
  }

  var CURRENT_VERSION = null;

  function applySettings(m) {
    if (!m) return;
    if (m.hero_eyebrow != null) CFG.heroEyebrow = m.hero_eyebrow;
    if (m.hero_lead != null) CFG.heroLead = m.hero_lead;
    if (m.hero_title1 != null || m.hero_title2 != null || m.hero_title3 != null) {
      CFG.heroTitleLines = [
        m.hero_title1 != null ? m.hero_title1 : (CFG.heroTitleLines || [])[0] || "",
        m.hero_title2 != null ? m.hero_title2 : (CFG.heroTitleLines || [])[1] || "",
        m.hero_title3 != null ? m.hero_title3 : (CFG.heroTitleLines || [])[2] || ""
      ];
    }
    ["company","team","kakao","phone","email"].forEach(function(k){ if(m[k]!=null) CFG[k]=m[k]; });
    if (m.manager_name != null) CFG.managerName = m.manager_name;
    if (m.manager_title != null) CFG.managerTitle = m.manager_title;
  }

  // ?v=슬러그 로 버전 선택 (없으면 첫 버전). 버전 테이블 없으면 무시.
  function loadVersion() {
    var c = sbClient();
    if (!c) return Promise.resolve();
    var slug = (new URLSearchParams(location.search)).get("v");
    return c.from("versions").select("*").order("sort_order", { ascending: true }).then(function (res) {
      if (res.error || !res.data || !res.data.length) return;
      var match = slug ? res.data.filter(function (v) { return v.slug === slug; })[0] : null;
      CURRENT_VERSION = match || res.data[0];
      applySettings(CURRENT_VERSION.settings || {});
    }).catch(function () {});
  }

  function loadSupabase() {
    var c = sbClient();
    if (!c) return Promise.reject("no-supabase");
    var q = c.from("products").select("*").order("sort_order", { ascending: true });
    if (CURRENT_VERSION) q = q.eq("version_id", CURRENT_VERSION.id);
    return q.then(function (res) {
      if (res.error) throw res.error;
      var rows = res.data || [];
      if (!rows.length) { if (CURRENT_VERSION) return []; throw new Error("supabase empty"); }
      return rows.map(function (r) {
        return {
          category: r.category, name: r.name, warehouse: r.warehouse, spec: r.spec,
          supplyPrice: r.supply_price, courier: r.courier, shipFee: r.ship_fee,
          tax: r.tax, image: r.image, show: r.show
        };
      });
    });
  }

  function loadSheet() {
    var id = (CFG.sheetId || "").trim();
    if (!id) return Promise.reject("no-sheet");
    var gid = (CFG.sheetGid || "0").trim();
    var url = "https://docs.google.com/spreadsheets/d/" + id +
              "/gviz/tq?tqx=out:csv&gid=" + encodeURIComponent(gid) + "&headers=1";
    return fetch(url, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("sheet " + r.status);
        return r.text();
      })
      .then(function (t) {
        var prods = rowsToProducts(parseCSV(t));
        if (!prods.length) throw new Error("sheet empty");
        return prods;
      });
  }

  document.getElementById("app").innerHTML =
    '<div class="notice">상품 정보를 불러오는 중…</div>';

  loadVersion()
    .then(function () { return loadSupabase(); })
    .catch(function (e) {
      if (e !== "no-supabase") console.warn("Supabase 로드 실패 → 다음 소스 시도:", e);
      return loadSheet();
    })
    .catch(function (e) {
      if (e !== "no-sheet") console.warn("구글 시트 로드 실패 → 기본 데이터 사용:", e);
      return loadFallback();
    })
    .then(function (list) { render(normalize(list)); })
    .catch(function (e) {
      console.error(e);
      document.getElementById("app").innerHTML =
        '<div class="notice">상품 정보를 불러오지 못했습니다. 잠시 후 새로고침 해주세요.</div>';
    });
})();
