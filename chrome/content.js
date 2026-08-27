/**
 * quotexbot Chrome MV3 content script (v0.9.12-ext)
 *
 * Visible-DOM scraper for the already-open Quotex trade tab / chart iframe.
 * DEMO-only Up/Down clicks. Stay on the open chart.
 *
 * Will not: read document.cookie, capture SSID/tokens, talk to WebSockets,
 * store email/password, call unofficial broker APIs, or load remote code.
 * Connect = read what is already on screen, then optionally click Up/Down.
 *
 * Injects into LARGE frames (w>=600, h>=400) so the HUD sits ON the chart
 * iframe, not behind it. Tiny frames are skipped. No full-page MutationObserver.
 */

(function (root) {
  "use strict";
  function quotexbotShouldBoot() {
    try {
      const w = window.innerWidth || 0, h = window.innerHeight || 0;
      if (w < 50 || h < 50) return false; // hidden/tiny
      if (window.top === window) {
        // top shell often covered by iframe — still boot, but iframe boot is the visible one
        return w >= 300 && h >= 200;
      }
      // visible chart iframe: LARGE only, no URL regex
      return w >= 600 && h >= 400;
    } catch (_e) { return window.top === window; }
  }
  if (!quotexbotShouldBoot()) return;

  const UP_LABELS = new Set(
    [
      "up",
      "call",
      "higher",
      "buy",
      "arriba",
      "acima",
      "yukarı",
      "yukari",
      "вверх",
      "выше",
      "наверх",
      "উপরে",
      "আপ",
      "ऊपर",
      "naik",
      "haut",
      "hoch",
      "上",
      "alza",
    ].map(norm)
  );

  const DOWN_LABELS = new Set(
    [
      "down",
      "put",
      "lower",
      "sell",
      "abajo",
      "abaixo",
      "aşağı",
      "asagi",
      "вниз",
      "ниже",
      "নিচে",
      "ডাউন",
      "नीचे",
      "turun",
      "bas",
      "runter",
      "下",
      "baja",
    ].map(norm)
  );

  const STAKE_LABELS = /investment|amount|stake|инвест|сумма|cantidad|valor|ইনভেস্ট|বিনিয়োগ/i;
  const TIME_LABELS = /\b(time|expiry|expiration|tiempo|tempo|время|সময়)\b/i;

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function snapshotFromVisibleText(text, url) {
    const t = String(text || "").replace(/\u00a0/g, " ");
    const href = String(url || "");

    let accountMode = "unknown";
    let accountLabel = "";
    if (/demo\s+account|демо|compte\s+d[eé]mo|cuenta\s+demo|ডেমো\s+অ্যাকাউন্ট/i.test(t)) {
      accountMode = "demo";
      const m = t.match(/DEMO\s+ACCOUNT/i);
      accountLabel = m ? m[0] : "DEMO";
    }
    if (/live\s+account|real\s+account|real\s+money|реальн|cuenta\s+real|লাইভ\s+অ্যাকাউন্ট/i.test(t)) {
      if (accountMode !== "demo") {
        accountMode = "live";
        const m = t.match(/LIVE\s+ACCOUNT|REAL\s+ACCOUNT/i);
        accountLabel = m ? m[0] : "LIVE";
      }
    }
    if (accountMode === "unknown") {
      if (/\/demo-trade/i.test(href)) {
        accountMode = "demo";
        accountLabel = "demo-trade";
      } else if (/\/live-trade/i.test(href)) {
        accountMode = "live";
        accountLabel = "live-trade";
      }
    }

    const assetMatch = t.match(/\b([A-Za-z]{3})\s*\/\s*([A-Za-z]{3})(\s*\(\s*OTC\s*\))?/i);
    const asset = assetMatch
      ? `${assetMatch[1].toUpperCase()}/${assetMatch[2].toUpperCase()}${assetMatch[3] ? " (OTC)" : ""}`
      : "";

    const pct = t.match(/\b(\d{1,3})\s*%/);
    const payoutPercent = pct ? pct[1] + "%" : "";

    const money = [];
    const moneyRe = /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g;
    let mm;
    while ((mm = moneyRe.exec(t))) {
      money.push({ raw: mm[0].replace(/\s+/g, ""), value: parseFloat(mm[1].replace(/,/g, "")) });
    }
    const trailing = /(?:^|\s)(\d+(?:\.\d{1,2})?)\s*\$/g;
    while ((mm = trailing.exec(t))) {
      money.push({ raw: mm[1] + "$", value: parseFloat(mm[1]) });
    }
    money.sort((a, b) => b.value - a.value);
    const balance = money.length ? money[0].raw.replace(/^\s+/, "") : "";
    if (balance && !balance.startsWith("$") && /^\d/.test(balance)) {
      /* keep 10000.00$ style as-is */
    }

    let stake = "";
    const inv = t.match(/Investment[\s\S]{0,80}?(\d+(?:\.\d{1,2})?\s*\$|\$\s*\d+(?:\.\d{1,2})?)/i);
    if (inv) stake = inv[1].replace(/\s+/g, "");
    if (!stake) {
      const small = money.filter((x) => x.value > 0 && x.value < 50);
      if (small.length) stake = small[small.length - 1].raw.replace(/\s+/g, "");
    }

    let payoutAmount = "";
    const po = t.match(/Payout[\s\S]{0,80}?(\d+(?:\.\d{1,2})?\s*\$|\$\s*\d+(?:\.\d{1,2})?)/i);
    if (po) payoutAmount = po[1].replace(/\s+/g, "");

    const clock = t.match(/\b(\d{2}:\d{2}:\d{2})\b/);
    const duration = clock ? clock[1] : "";
    const tf = t.match(/\b(5s|10s|15s|30s|1m|2m|3m|5m|10m|15m|30m|1h)\b/i);
    const timeframe = tf ? tf[1].toLowerCase() : "";

    return {
      accountMode,
      accountLabel,
      balance,
      asset,
      payoutPercent,
      payoutAmount,
      duration,
      timeframe,
      stake,
    };
  }

  function isVisible(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") return false;
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) return false;
    if (el.disabled) return false;
    const view = (el.ownerDocument && el.ownerDocument.defaultView) || (typeof window !== "undefined" ? window : null);
    if (view && typeof view.getComputedStyle === "function") {
      try {
        const s = view.getComputedStyle(el);
        if (!s) return true;
        if (s.display === "none" || s.visibility === "hidden") return false;
        if (parseFloat(s.opacity || "1") === 0) return false;
      } catch (_e) {
        /* mock documents */
      }
    }
    return true;
  }

  function labelOf(el) {
    const aria = (el.getAttribute && (el.getAttribute("aria-label") || el.getAttribute("title"))) || "";
    const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    return { text, aria };
  }

  function parseRgb(color) {
    if (!color) return null;
    const m = String(color).match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3] };
  }

  function toneOf(el) {
    const view = (el.ownerDocument && el.ownerDocument.defaultView) || (typeof window !== "undefined" ? window : null);
    if (!view || typeof view.getComputedStyle !== "function") return null;
    try {
      const s = view.getComputedStyle(el);
      const samples = [s.backgroundColor, s.borderColor, s.color];
      for (const c of samples) {
        const rgb = parseRgb(c);
        if (!rgb) continue;
        if (rgb.r + rgb.g + rgb.b < 30) continue;
        if (rgb.g > rgb.r + 25 && rgb.g > rgb.b) return "green";
        if (rgb.r > rgb.g + 25 && rgb.r > rgb.b) return "red";
      }
    } catch (_e) {
      return null;
    }
    return null;
  }

  function clickableAncestor(el) {
    let n = el;
    for (let i = 0; i < 6 && n; i++) {
      const tag = (n.tagName || "").toUpperCase();
      const role = (n.getAttribute && n.getAttribute("role")) || "";
      if (tag === "BUTTON" || tag === "A" || role === "button") return n;
      n = n.parentElement;
    }
    return el;
  }

  function collectCandidates(doc) {
    const root = doc.body || doc;
    let nodes = [];
    try {
      nodes = Array.from(root.querySelectorAll("button, [role='button'], a, input[type='button']"));
    } catch (_e) {
      nodes = [];
    }
    try {
      const all = Array.from(root.querySelectorAll("*"));
      for (const el of all) {
        const { text, aria } = labelOf(el);
        if (text.length > 28) continue;
        const key = norm(text) || norm(aria);
        if (UP_LABELS.has(key) || DOWN_LABELS.has(key)) nodes.push(el);
      }
    } catch (_e) {
      /* mock documents may only implement a button selector */
    }
    const seen = new Set();
    const out = [];
    for (const el of nodes) {
      if (seen.has(el)) continue;
      seen.add(el);
      try {
        if (el.id === "quotexbot-hud" || el.id === "quotexbot-dash") continue;
        if (el.closest && (el.closest("#quotexbot-hud") || el.closest("#quotexbot-dash"))) continue;
      } catch (_bot) {}
      if (!isVisible(el)) continue;
      out.push(el);
    }
    return out;
  }

  function findTradeButtons(doc) {
    const found = { up: null, down: null };
    const candidates = collectCandidates(doc);
    const scored = [];
    for (const el of candidates) {
      const { text, aria } = labelOf(el);
      if (text.length > 28) continue;
      const key = norm(text) || norm(aria);
      let dir = null;
      if (UP_LABELS.has(key)) dir = "up";
      else if (DOWN_LABELS.has(key)) dir = "down";
      else {
        const tone = toneOf(el);
        const r = el.getBoundingClientRect();
        const wide = typeof window !== "undefined" ? window.innerWidth : 1200;
        if (r.width >= 40 && r.height >= 24 && r.left > wide * 0.45) {
          if (tone === "green") dir = "up";
          if (tone === "red") dir = "down";
        }
      }
      if (!dir) continue;
      const target = clickableAncestor(el);
      try {
        if (target.closest && (target.closest("#quotexbot-hud") || target.closest("#quotexbot-dash"))) continue;
      } catch (_bot2) {}
      const r = target.getBoundingClientRect();
      const wide = typeof window !== "undefined" ? window.innerWidth : 1200;
      const area = r.width * r.height;
      const rightBonus = r.left > wide * 0.55 ? 80000 : 0;
      scored.push({ dir, el: target, area: area + rightBonus, text: text || aria });
    }
    scored.sort((a, b) => b.area - a.area);
    for (const s of scored) {
      if (!found[s.dir]) found[s.dir] = s.el;
    }
    return found;
  }

  function nearbyText(el) {
    let n = el;
    for (let i = 0; i < 5 && n; i++) {
      const t = (n.innerText || n.textContent || "").slice(0, 200);
      if (t) return t;
      n = n.parentElement;
    }
    return "";
  }

  function findLabeledInput(doc, labelRe) {
    const root = doc.body || doc;
    let inputs = [];
    try {
      inputs = Array.from(root.querySelectorAll("input, textarea, [contenteditable='true']"));
    } catch (_e) {
      return null;
    }
    for (const el of inputs) {
      if (!isVisible(el)) continue;
      const type = ((el.getAttribute && el.getAttribute("type")) || el.type || "text").toLowerCase();
      if (["hidden", "password", "email", "checkbox", "radio", "file"].includes(type)) continue;
      const blob = nearbyText(el.parentElement || el);
      if (labelRe.test(blob)) return el;
    }
    return null;
  }

  function setControlValue(el, value) {
    if (!el) return false;
    const str = String(value);
    if ("value" in el) {
      el.value = str;
      el.dispatchEvent && el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent && el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    if (el.getAttribute && el.getAttribute("contenteditable") === "true") {
      el.textContent = str;
      el.dispatchEvent && el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    return false;
  }

  function clickElement(el) {
    if (!el) return false;
    try {
      el.scrollIntoView && el.scrollIntoView({ block: "center", inline: "center" });
    } catch (_e) {
      /* ignore */
    }
    try {
      el.focus && el.focus();
    } catch (_e) {
      /* ignore */
    }
    if (typeof el.click === "function") {
      el.click();
      return true;
    }
    return false;
  }

  function collectVisibleText(doc, depth) {
    depth = depth || 0;
    if (!doc || depth > 4) return "";
    let text = "";
    try {
      const hud = doc.getElementById && doc.getElementById("quotexbot-hud");
      const dashEl = doc.getElementById && doc.getElementById("quotexbot-dash");
      const prevDisp = hud && hud.style ? hud.style.display : "";
      const prevDash = dashEl && dashEl.style ? dashEl.style.display : "";
      if (hud) hud.style.display = "none";
      if (dashEl) dashEl.style.display = "none";
      const body = doc.body;
      if (body) text += " " + (body.innerText || body.textContent || "");
      if (hud) hud.style.display = prevDisp || "";
      if (dashEl) dashEl.style.display = prevDash || "";
      const all = body ? body.querySelectorAll("*") : [];
      for (const el of all) {
        if (el.id === "quotexbot-hud" || (el.closest && el.closest("#quotexbot-hud"))) continue;
        if (el.shadowRoot) text += " " + (el.shadowRoot.textContent || "");
      }
      const frames = doc.querySelectorAll ? doc.querySelectorAll("iframe") : [];
      for (const f of frames) {
        try {
          const idoc = f.contentDocument || (f.contentWindow && f.contentWindow.document);
          if (idoc) text += " " + collectVisibleText(idoc, depth + 1);
        } catch (_e) {}
      }
    } catch (_e2) {}
    return text;
  }

  function scrapeDocument(doc) {
    const href =
      (doc.defaultView && doc.defaultView.location && doc.defaultView.location.href) ||
      (typeof location !== "undefined" ? location.href : "");
    const text = collectVisibleText(doc) ||
      (doc.body && (doc.body.innerText || doc.body.textContent)) ||
      "";
    const snap = snapshotFromVisibleText(text, href);
    const btns = findTradeButtons(doc);
    const stakeInput = findLabeledInput(doc, STAKE_LABELS);
    const timeInput = findLabeledInput(doc, TIME_LABELS);
    snap.canClickUp = Boolean(btns.up);
    snap.canClickDown = Boolean(btns.down);
    snap.canSetStake = Boolean(stakeInput);
    snap.canSetDuration = Boolean(timeInput);
    snap.url = href;
    snap.scrapedAt = new Date().toISOString();
    return snap;
  }

  function prepareOptionalFields(doc, opts) {
    opts = opts || {};
    if (opts.stake) {
      const el = findLabeledInput(doc, STAKE_LABELS);
      if (el) setControlValue(el, opts.stake);
    }
    if (opts.duration) {
      const el = findLabeledInput(doc, TIME_LABELS);
      if (el) setControlValue(el, opts.duration);
    }
  }

  function clickUp(doc, opts) {
    prepareOptionalFields(doc, opts);
    const { up } = findTradeButtons(doc);
    if (!up) return { ok: false, error: "Up button not found on the visible page" };
    clickElement(up);
    return { ok: true, direction: "up", label: (up.innerText || "Up").trim() };
  }

  function clickDown(doc, opts) {
    prepareOptionalFields(doc, opts);
    const { down } = findTradeButtons(doc);
    if (!down) return { ok: false, error: "Down button not found on the visible page" };
    clickElement(down);
    return { ok: true, direction: "down", label: (down.innerText || "Down").trim() };
  }

  const api = {
    snapshotFromVisibleText,
    scrapeDocument,
    findTradeButtons,
    clickUp,
    clickDown,
    setControlValue,
    findLabeledInput,
  };

  root.QuotexbotScrape = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);



(function () {
  "use strict";
  try {
  function quotexbotShouldBoot() {
    try {
      const w = window.innerWidth || 0, h = window.innerHeight || 0;
      if (w < 50 || h < 50) return false; // hidden/tiny
      if (window.top === window) {
        // top shell often covered by iframe — still boot, but iframe boot is the visible one
        return w >= 300 && h >= 200;
      }
      // visible chart iframe: LARGE only, no URL regex
      return w >= 600 && h >= 400;
    } catch (_e) { return window.top === window; }
  }
  if (!quotexbotShouldBoot()) return;
  if (window.__quotexbotHudBoot) return;
  window.__quotexbotHudBoot = true;

  const scrape = globalThis.QuotexbotScrape || null;

  /* edit only this object for tuning — HUD, dashboard, observer, strategy all read it */
  const CONFIG = {
    version: "0.9.12-ext",
    minWaitMs: 8000,
    tradeMs: 60000,
    axisRightFrac: 0.68,
    maxAuto: 10,
    cooldownMs: 65000,
    barBucketMs: 15000,
    minTicks: 2,
    sampleTicks: 16,
    sampleMs: 250,
    recordMs: 800,
    uiMs: 4000,
    minBarsForEma: 21,
    emaFast: 8,
    emaSlow: 21,
    rsiPeriod: 14,
    bodyMin: 0.45,
    wickMax: 0.28,
    emaSep: 0.00003,
    rsiCall: [48, 68],
    rsiPut: [32, 52],
    ranges: {
      "USD/JPY": [90, 220],
      "EUR/JPY": [120, 240],
      "GBP/JPY": [130, 260],
      "EUR/USD": [0.9, 1.35],
      "GBP/USD": [1.20, 1.55],
      "AUD/USD": [0.5, 0.85],
      "AUD/NZD": [0.9, 1.25],
      "USD/CAD": [1.2, 1.55],
      "USD/PHP": [40, 80],
      "USD/COP": [2000, 5000],
      "USD/BRL": [3, 9],
      "USD/DZD": [80, 200],
      "NZD/CAD": [0.75, 1.05],
      "USD/BDT": [90, 160],
    },
    watch: [
      { yahoo: "EURUSD=X", label: "EUR/USD" },
      { yahoo: "GBPUSD=X", label: "GBP/USD" },
      { yahoo: "USDJPY=X", label: "USD/JPY" },
      { yahoo: "AUDUSD=X", label: "AUD/USD" },
      { yahoo: "AUDNZD=X", label: "AUD/NZD" },
      { yahoo: "USDCAD=X", label: "USD/CAD" },
      { yahoo: "EURJPY=X", label: "EUR/JPY" },
      { yahoo: "GBPJPY=X", label: "GBP/JPY" },
    ],
  };

  const KEY = "quotexbot_tm_state";
  const VER = CONFIG.version;
  const MAX_AUTO = CONFIG.maxAuto;
  const WATCH = CONFIG.watch;
  const SCAN_MAX = 800;
  let axisObs = null;
  let lastAxisEl = null;
  let lastHudSig = "";
  let topHudYielded = false;

  function loadState() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (_e) { return {}; }
  }
  function saveState(st) {
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (_e) {}
  }

    let state = Object.assign({
    connected: true, auto: false, minimized: false, liveAck: false, dashOpen: false,
    autoCount: 0, lastSignal: "—", lastReason: "", lastPair: "—", lastBar: "",
    logs: [], ver: "", pairStats: {}, journal: [],
  }, loadState());
  if (!Array.isArray(state.logs)) state.logs = [];
  if (!state.pairStats || typeof state.pairStats !== "object") state.pairStats = {};
  if (!Array.isArray(state.journal)) state.journal = [];
  if (state.ver !== VER) {
    state.ver = VER;
    state.logs = [];
    state.lastReason = "";
    state.lastPair = "—";
    state.otcBars = {};
    state.pairStats = {};
    state.hudWin = null;
    state.dashWin = null;
    state.minimized = false;
    try { saveState(state); } catch (_e) {}
  }

  function log(msg) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const line = hh + ":" + mm + ":" + ss + "  " + msg;
    state.logs.push(line);
    if (state.logs.length > 40) state.logs = state.logs.slice(-40);
    console.log("[quotexbot]", line);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }

  function notePair(label, info) {
    if (!label) return;
    if (!state.pairStats || typeof state.pairStats !== "object") state.pairStats = {};
    const cur = state.pairStats[label] || {};
    state.pairStats[label] = Object.assign({}, cur, info, { at: Date.now() });
  }

  function addJournal(row) {
    if (!Array.isArray(state.journal)) state.journal = [];
    state.journal.push(row);
    if (state.journal.length > 80) state.journal = state.journal.slice(-80);
  }

  let lastClickAt = 0;
  if (Array.isArray(state.journal)) {
    for (let i = state.journal.length - 1; i >= 0; i--) {
      if (state.journal[i] && state.journal[i].ok && state.journal[i].t) {
        lastClickAt = state.journal[i].t;
        break;
      }
    }
  }
  let scanning = false;
  let browseIndex = 0;
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function priceRange(pairLabel) {
    const p = pairLabel || "";
    const r = CONFIG.ranges[p];
    if (r) return { lo: r[0], hi: r[1] };
    if (/JPY/i.test(p)) return { lo: 90, hi: 260 };
    if (/COP|BRL|ARS|CLP|INR|IDR|KRW|NGN|DZD|EGP|VND|PKR|TRY|MXN|ZAR|PHP|THB|MYR|BDT|LKR|NPR/i.test(p)) {
      return { lo: 1, hi: 100000 };
    }
    return { lo: 0.05, hi: 20 };
  }

  function scrapeQuoteCandidates() {
    const hud = document.getElementById("quotexbot-hud");
    const found = [];
    const seen = {};
    function add(v, el, decimals) {
      if (!isFinite(v) || v <= 0) return;
      const key = String(v);
      if (seen[key]) return;
      seen[key] = 1;
      let r = { width: 0, height: 0, top: 0, left: 0 };
      try { r = el.getBoundingClientRect(); } catch (_e) {}
      const wide = window.innerWidth || 1200;
      if (r.width < 4 || r.height < 4) return;
      if (r.top < 0 || r.left < 0) return;
      if (r.left > wide * 0.62) return;
      let font = 12;
      try { font = parseFloat(window.getComputedStyle(el).fontSize || "12"); } catch (_e2) {}
      found.push({ v: v, font: font, area: r.width * r.height, y: r.top, x: r.left, decimals: decimals });
    }
    const re = /(\d{1,4}(?:\.\d{2,6}))/g;
    const nodes = document.querySelectorAll("span, div, b, strong, p, label, em, h1, h2, h3, td, li");
    const nMax = Math.min(nodes.length, SCAN_MAX);
    for (let i = 0; i < nMax; i++) {
      const el = nodes[i];
      if (hud && (el === hud || hud.contains(el))) continue;
      let raw = "";
      try { raw = (el.innerText || el.textContent || ""); } catch (_e3) { continue; }
      if (/[+\u2212$]|\$/.test(raw)) continue;
      raw = raw.replace(/[\s\u00a0\u202f]/g, "").replace(/,/g, "");
      if (!raw || raw.length > 24) continue;
      if (/^[+\-]/.test(raw) || /\$/.test(raw)) continue;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(raw))) {
        const s0 = m[1];
        const decimals = (s0.split(".")[1] || "").length;
        add(parseFloat(s0), el, decimals);
      }
    }
    try {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let walked = 0;
      while (walker.nextNode()) {
        if (++walked > SCAN_MAX) break;
        const node = walker.currentNode;
        if (hud && hud.contains(node)) continue;
        const dashEl = document.getElementById("quotexbot-dash");
        if (dashEl && dashEl.contains(node)) continue;
        if (/[+\u2212$]/.test(node.nodeValue || "")) continue;
        const t = (node.nodeValue || "").replace(/[\s\u00a0\u202f]/g, "").replace(/,/g, "");
        const mm = t.match(/\d{1,4}\.\d{2,6}/);
        if (!mm) continue;
        const el = node.parentElement || document.body;
        add(parseFloat(mm[0]), el, (mm[0].split(".")[1] || "").length);
      }
    } catch (_e4) {}
    return found;
  }

  function forEachRoot(cb) {
    const roots = [document];
    try {
      if (lastAxisEl) {
        const ar = lastAxisEl.getRootNode && lastAxisEl.getRootNode();
        if (ar && ar !== document && typeof ar.querySelectorAll === "function") roots.push(ar);
      }
    } catch (_e) {}
    for (let r = 0; r < roots.length; r++) cb(roots[r]);
  }

  function readAxisLivePrice() {
    const hud = document.getElementById("quotexbot-hud");
    const dashEl = document.getElementById("quotexbot-dash");
    const wide = window.innerWidth || 1200;
    const leftMin = wide * (CONFIG.axisRightFrac || 0.55);
    const hits = [];
    const nodes = [];
    forEachRoot(function (root) {
      try {
        const list = root.querySelectorAll("span, div, b, strong, label, em, p, text, tspan");
        for (let i = 0; i < list.length && nodes.length < SCAN_MAX; i++) nodes.push(list[i]);
      } catch (_e0) {}
    });
    const nScan = Math.min(nodes.length, SCAN_MAX);
    for (let i = 0; i < nScan; i++) {
      const el = nodes[i];
      if (hud && (el === hud || hud.contains(el))) continue;
      if (dashEl && (el === dashEl || dashEl.contains(el))) continue;
      let rawT = "";
      try { rawT = (el.innerText || el.textContent || ""); } catch (_e) { continue; }
      if (/[+\u2212$€]|\u0024/.test(rawT)) continue;
      let t = rawT.replace(/[\s\u00a0]/g, "").replace(/,/g, "");
      if (!t || t.length > 28) continue;
      if (/^[+\-]/.test(t) || /\$/.test(t)) continue;
      const m = t.match(/^(\d{1,6}\.\d{2,6})$/);
      if (!m) continue;
      const v = parseFloat(m[1]);
      if (!isFinite(v) || v < 0.4 || v >= 1000000) continue;
      let r;
      try { r = el.getBoundingClientRect(); } catch (_e2) { continue; }
      const leftMax = wide * 0.86;
      if (!r || r.left < leftMin || r.left > leftMax || r.width < 4 || r.height < 4) continue;
      if (r.top < 70 || r.top > (window.innerHeight || 800) * 0.92) continue;
      let font = 12;
      let bg = "";
      try {
        const cs = window.getComputedStyle(el);
        font = parseFloat(cs.fontSize || "12");
        bg = cs.backgroundColor || "";
      } catch (_e3) {}
      const hasBg = !!(bg && bg !== "transparent" && bg.indexOf("rgba(0, 0, 0, 0)") < 0 && bg !== "rgba(0,0,0,0)");
      let nearBell = false;
      try {
        const p = el.parentElement;
        nearBell = !!(p && (p.querySelector("svg") || p.querySelector("button") || el.previousElementSibling));
      } catch (_e4) {}
      hits.push({ v: v, font: font, y: r.top, x: r.left, nearBell: nearBell, hasBg: hasBg, decimals: (m[1].split(".")[1] || "").length, el: el });
    }
    if (!hits.length) return null;
    const midY = (window.innerHeight || 800) * 0.45;
    hits.sort(function (a, b) {
      const da = Math.abs(a.y - midY);
      const db = Math.abs(b.y - midY);
      return (b.hasBg - a.hasBg) || (b.nearBell - a.nearBell) || (da - db) || (b.x - a.x) || (b.font - a.font);
    });
    return hits[0];
  }

  const quoteSeen = {};
  function rememberQuotes(vals) {
    const now = Date.now();
    const live = {};
    for (let i = 0; i < vals.length; i++) {
      const k = String(vals[i]);
      live[k] = 1;
      if (!quoteSeen[k]) quoteSeen[k] = { first: now, last: now, v: vals[i] };
      else quoteSeen[k].last = now;
    }
    Object.keys(quoteSeen).forEach(function (k) { if (!live[k] && now - quoteSeen[k].last > 15000) delete quoteSeen[k]; });
  }
  function isFrozenQuote(v) {
    const s = quoteSeen[String(v)];
    return !!(s && (s.last - s.first) > 7000);
  }

  let pnlCache = { t: 0, set: {} };
  function isPnlNumber(v) {
    const now = Date.now();
    if (now - pnlCache.t > 700) {
      const set = {};
      try {
        const snips = listPnlSnippets();
        for (let i = 0; i < snips.length; i++) set[String(snips[i].pnl)] = 1;
      } catch (_e) {}
      const j = state.journal || [];
      for (let i = 0; i < j.length; i++) {
        if (j[i] && j[i].pnl != null) set[String(j[i].pnl)] = 1;
      }
      pnlCache = { t: now, set: set };
    }
    if (pnlCache.set[String(v)]) return true;
    const keys = Object.keys(pnlCache.set);
    for (let i = 0; i < keys.length; i++) {
      if (Math.abs(Number(keys[i]) - v) < 1e-6) return true;
    }
    return false;
  }

  function resetLivePrice(reason) {
    state.lastGoodPx = null;
    state.lastPx = "—";
    lastObservedPx = null;
    lastAxisEl = null;
    try { Object.keys(quoteSeen).forEach(function (k) { delete quoteSeen[k]; }); } catch (_e) {}
    try { if (axisObs) axisObs.disconnect(); } catch (_e2) {}
    if (reason) log(reason);
  }
  function onPairChange(newLabel) {
    if (!newLabel || newLabel === lastSeenPair) return;
    const old = lastSeenPair || state.lastPair || "—";
    lastSeenPair = newLabel;
    state.lastPair = newLabel;
    resetLivePrice("পেয়ার বদল: " + old + " → " + newLabel + ", দাম রিসেট");
  }

  function readLivePrice(pairLabel) {
    onPairChange(pairLabel);
    const range = priceRange(pairLabel);
    const axis = readAxisLivePrice();
    const all = scrapeQuoteCandidates();
    function ok(v) {
      if (v == null || !isFinite(v)) return false;
      if (v < range.lo || v > range.hi) return false;
      if (isPnlNumber(v)) return false;
      if (isFrozenQuote(v) && state.lastGoodPx != null && Math.abs(v - state.lastGoodPx) > 1e-9) return false;
      return true;
    }
    rememberQuotes([axis && axis.v].concat(all.map(function (c) { return c.v; })).filter(function (x) { return x != null; }));
    const cands = [];
    if (axis && ok(axis.v)) cands.push({ v: axis.v, x: axis.x || 0, font: axis.font || 12, hasBg: axis.hasBg, nearBell: axis.nearBell, y: axis.y || 0, axis: 1 });
    for (let i = 0; i < all.length; i++) {
      if (ok(all[i].v)) cands.push({ v: all[i].v, x: all[i].x || 0, font: all[i].font || 12, hasBg: 0, nearBell: 0, y: all[i].y || 0, axis: 0 });
    }
    if (!cands.length) return null;
    let axisCand = null;
    for (let i = 0; i < cands.length; i++) {
      if (cands[i].axis) { axisCand = cands[i]; break; }
    }
    if (axisCand && state.lastGoodPx != null) {
      const rel = Math.abs(axisCand.v - state.lastGoodPx) / Math.max(state.lastGoodPx, 1e-6);
      if (rel > 0.04) {
        state.lastGoodPx = axisCand.v;
        return axisCand.v;
      }
    }
    if (lastSeenPair === pairLabel && state.lastGoodPx != null) {
      const near = cands.filter(function (c) {
        return Math.abs(c.v - state.lastGoodPx) / Math.max(state.lastGoodPx, 1e-6) < 0.025;
      });
      if (near.length) {
        near.sort(function (a, b) { return (b.axis - a.axis) || (b.hasBg - a.hasBg) || (b.nearBell - a.nearBell); });
        state.lastGoodPx = near[0].v;
        return near[0].v;
      }
    }
    cands.sort(function (a, b) {
      return (b.axis - a.axis) || (b.hasBg - a.hasBg) || (b.nearBell - a.nearBell) || (b.x - a.x);
    });
    state.lastGoodPx = cands[0].v;
    return cands[0].v;
  }

  function peekQuotes(pairLabel) {
    const range = priceRange(pairLabel);
    const all = scrapeQuoteCandidates();
    const shown = all.slice(0, 6).map(function (c) { return String(c.v); }).join(", ");
    const nIn = all.filter(function (c) { return c.v >= range.lo && c.v <= range.hi; }).length;
    return { n: all.length, nIn: nIn, shown: shown };
  }

  async function sampleOtc(label) {
    const ticks = [];
    for (let i = 0; i < CONFIG.sampleTicks; i++) {
      const px = readLivePrice(label);
      if (px != null) ticks.push(px);
      await sleep(CONFIG.sampleMs);
    }
    return ticks;
  }

  function ingestTicks(label, ticks) {
    if (!label || label === "—") return [];
    if (!state.otcBars || typeof state.otcBars !== "object") state.otcBars = {};
    if (!Array.isArray(state.otcBars[label])) state.otcBars[label] = [];
    const bars = state.otcBars[label];
    const bucket = Math.floor(Date.now() / CONFIG.barBucketMs);
    for (let i = 0; i < ticks.length; i++) {
      const px = ticks[i];
      let bar = bars.length && bars[bars.length - 1].m === bucket ? bars[bars.length - 1] : null;
      if (!bar) {
        bar = { m: bucket, t: bucket * (CONFIG.barBucketMs / 1000), open: px, high: px, low: px, close: px, n: 1 };
        bars.push(bar);
      } else {
        bar.high = Math.max(bar.high, px);
        bar.low = Math.min(bar.low, px);
        bar.close = px;
        bar.n = (bar.n || 1) + 1;
      }
    }
    if (bars.length > 120) state.otcBars[label] = bars.slice(-120);
    return state.otcBars[label];
  }

  function denseBars(label) {
    const bars = (state.otcBars && state.otcBars[label]) || [];
    return bars.filter(function (b) { return (b.n || 0) >= 3 && (b.high - b.low) > 0; });
  }

  function barCount(label) {
    return ((state.otcBars && state.otcBars[label]) || []).length;
  }

  function labelFromText(raw) {
    if (!raw) return null;
    const u = String(raw).toUpperCase().replace(/\s+/g, "").replace("OTC", "");
    for (let i = 0; i < WATCH.length; i++) {
      const lab = WATCH[i].label;
      if (u.indexOf(lab.replace("/", "")) !== -1 || u.indexOf(lab) !== -1) return lab;
    }
    const m = String(raw).match(/\b([A-Za-z]{3})\s*\/\s*([A-Za-z]{3})\b/);
    return m ? (m[1].toUpperCase() + "/" + m[2].toUpperCase()) : null;
  }

  function visiblePair() {
    const hud = document.getElementById("quotexbot-hud");
    const dashEl = document.getElementById("quotexbot-dash");
    const nodes = document.querySelectorAll("button, span, div, a, h1, h2, h3, b, strong, p");
    let best = null, bestScore = -1e9;
    const nMax = Math.min(nodes.length, SCAN_MAX);
    for (let n = 0; n < nMax; n++) {
      const el = nodes[n];
      if (hud && (el === hud || hud.contains(el))) continue;
      if (dashEl && (el === dashEl || dashEl.contains(el))) continue;
      let t = "";
      try { t = (el.innerText || "").replace(/\s+/g, " ").trim(); } catch (_e) { continue; }
      if (!t || t.length > 48) continue;
      const lab = labelFromText(t);
      if (!lab) continue;
      let r;
      try { r = el.getBoundingClientRect(); } catch (_e2) { continue; }
      if (!r || r.width < 4 || r.height < 4) continue;
      let font = 12;
      try { font = parseFloat(window.getComputedStyle(el).fontSize || "12"); } catch (_e3) {}
      let extra = 0;
      try {
        const cls = String(el.className || "");
        const aria = (el.getAttribute && el.getAttribute("aria-selected")) || "";
        if (aria === "true" || /active|selected|current|is-active|is-current/i.test(cls)) extra += 400;
        const par = el.parentElement;
        if (par && /active|selected|current/i.test(String(par.className || ""))) extra += 140;
        if (r.top < 140 && r.left < (window.innerWidth || 1200) * 0.55) extra += 500;
      } catch (_e4) {}
      const score = font * 8 - r.top + (t.length < 18 ? 40 : 0) + (/OTC/i.test(t) ? 50 : 0) + extra;
      if (score > bestScore) { bestScore = score; best = lab; }
    }
    if (best) return best;
    const snap = snapDoc();
    const fromSnap = labelFromText(snap && snap.asset);
    if (fromSnap) return fromSnap;
    return null;
  }

  async function waitForPair(label) {
    for (let i = 0; i < 16; i++) {
      if (visiblePair() === label) return true;
      await sleep(220);
    }
    return visiblePair() === label;
  }

  let saveN = 0;
  function recordVisible() {
    const label = visiblePair();
    if (!label) return;
    onPairChange(label);
    const px = readLivePrice(label);
    if (px == null) {
      state.lastPx = "—";
      return;
    }
    ingestTicks(label, [px]);
    state.lastPx = String(px);
    notePair(label, { px: String(px), bars: barCount(label) });
    saveN += 1;
    if (saveN % 10 === 0) saveState(state);
  }

  function decideTicks(ticks) {
    if (ticks.length < CONFIG.minTicks) return { signal: "SKIP", reason: "OTC tick কম" };
    const first = ticks[0], last = ticks[ticks.length - 1];
    if (last > first) return { signal: "CALL", reason: "OTC live up " + first + " → " + last };
    if (last < first) return { signal: "PUT", reason: "OTC live down " + first + " → " + last };
    return { signal: "SKIP", reason: "OTC flat " + last };
  }

  function ema(values, period) {
    if (values.length < period) return null;
    const k = 2 / (period + 1);
    let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
    return e;
  }
  function rsi(values, period) {
    if (values.length < period + 1) return null;
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) {
      const d = values[i] - values[i - 1];
      if (d >= 0) gain += d; else loss -= d;
    }
    gain /= period; loss /= period;
    for (let i = period + 1; i < values.length; i++) {
      const d = values[i] - values[i - 1];
      gain = (gain * (period - 1) + Math.max(d, 0)) / period;
      loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    }
    if (loss === 0) return 100;
    return 100 - 100 / (1 + gain / loss);
  }

  function decide(bar, closes) {
    const fast = ema(closes, CONFIG.emaFast);
    const slow = ema(closes, CONFIG.emaSlow);
    const r = rsi(closes, CONFIG.rsiPeriod);
    if (fast == null || slow == null || r == null) return { signal: "SKIP", reason: "history কম" };
    const range = bar.high - bar.low;
    if (range <= 0) return { signal: "SKIP", reason: "flat candle" };
    const body = Math.abs(bar.close - bar.open);
    const bodyRatio = body / range;
    const upWick = (bar.high - Math.max(bar.open, bar.close)) / range;
    const dnWick = (Math.min(bar.open, bar.close) - bar.low) / range;
    const sep = Math.abs(fast - slow) / bar.close;
    if (sep < CONFIG.emaSep) return { signal: "SKIP", reason: "EMA কাছাকাছি" };
    const bull = bar.close > bar.open;
    const bear = bar.close < bar.open;
    if (fast > slow && bull) {
      if (bodyRatio < CONFIG.bodyMin) return { signal: "SKIP", reason: "weak body" };
      if (upWick > CONFIG.wickMax) return { signal: "SKIP", reason: "upper wick" };
      if (r < CONFIG.rsiCall[0] || r > CONFIG.rsiCall[1]) return { signal: "SKIP", reason: "RSI " + r.toFixed(1) };
      return { signal: "CALL", reason: "uptrend EMA" + CONFIG.emaFast + ">" + CONFIG.emaSlow + ", RSI " + r.toFixed(1) };
    }
    if (fast < slow && bear) {
      if (bodyRatio < CONFIG.bodyMin) return { signal: "SKIP", reason: "weak body" };
      if (dnWick > CONFIG.wickMax) return { signal: "SKIP", reason: "lower wick" };
      if (r < CONFIG.rsiPut[0] || r > CONFIG.rsiPut[1]) return { signal: "SKIP", reason: "RSI " + r.toFixed(1) };
      return { signal: "PUT", reason: "downtrend EMA" + CONFIG.emaFast + "<" + CONFIG.emaSlow + ", RSI " + r.toFixed(1) };
    }
    return { signal: "SKIP", reason: "no aligned setup" };
  }

  function clickableByText(needle) {
    const want = needle.toLowerCase().replace(/\s+/g, "");
    const nodes = Array.from(document.querySelectorAll("button, [role='button'], a, span, div, li"));
    let best = null, bestLen = 1e9;
    for (const el of nodes) {
      if (el.closest && el.closest("#quotexbot-hud")) continue;
      const t = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      if (!t || t.length > 40) continue;
      const n = t.toLowerCase().replace(/\s+/g, "");
      if (n.includes(want) || n.includes(want.replace("/", ""))) {
        if (t.length < bestLen) { best = el; bestLen = t.length; }
      }
    }
    return best;
  }

  function findSearchBox() {
    const inputs = Array.from(document.querySelectorAll("input, textarea, [contenteditable='true']"));
    for (const el of inputs) {
      if (el.closest && el.closest("#quotexbot-hud")) continue;
      const ph = ((el.getAttribute("placeholder") || "") + " " + (el.getAttribute("aria-label") || "")).toLowerCase();
      if (/search|asset|pair|symbol|find|поиск|buscar|suche|recherche/i.test(ph)) return el;
      if ((el.type || "") === "search") return el;
    }
    return null;
  }

  function typeIn(el, value) {
    try { el.focus(); } catch (_e) {}
    try {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc && desc.set) desc.set.call(el, value);
      else el.value = value;
    } catch (_e) {
      try { el.value = value; } catch (_e2) {}
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    try { el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "a" })); } catch (_e3) {}
  }

  function clickCurrentAssetHeader() {
    const nodes = Array.from(document.querySelectorAll("button, [role='button'], a, span, div"));
    let best = null, bestLen = 1e9;
    for (const el of nodes) {
      if (el.closest && el.closest("#quotexbot-hud")) continue;
      const t = (el.innerText || "").replace(/\s+/g, " ").trim();
      if (!t || t.length > 28) continue;
      if (!/^[A-Z]{3}\s*\/\s*[A-Z]{3}/i.test(t) && !/\(\s*OTC\s*\)/i.test(t)) continue;
      if (t.length < bestLen) { best = el; bestLen = t.length; }
    }
    if (best && typeof best.click === "function") {
      best.click();
      return true;
    }
    return false;
  }

  async function openAsset(label) {
    const compact = label.replace("/", "").toUpperCase();
    const already = (snapDoc().asset || "").replace(/\s+/g, "").toUpperCase();
    if (already.includes(compact)) return true;

    let chip = clickableByText(label) || clickableByText(label + " (OTC)") || clickableByText(label.replace("/", ""));
    if (chip && typeof chip.click === "function") {
      chip.click();
      await sleep(400);
      const item = clickableByText(label);
      if (item && item !== chip && typeof item.click === "function") item.click();
      await sleep(700);
      const now = (snapDoc().asset || "").replace(/\s+/g, "").toUpperCase();
      if (now.includes(compact)) return true;
    }

    clickCurrentAssetHeader();
    await sleep(500);
    let box = findSearchBox();
    if (!box) {
      clickCurrentAssetHeader();
      await sleep(400);
      box = findSearchBox();
    }
    if (box) {
      typeIn(box, label);
      await sleep(700);
    }
    chip = clickableByText(label) || clickableByText(label + " (OTC)") || clickableByText(label.replace("/", ""));
    if (chip && typeof chip.click === "function") {
      chip.click();
      await sleep(800);
      return true;
    }
    return false;
  }

  let lastTradesFp = "";
  let lastSeenPair = "";
  let lastObservedPx = null;
  function parsePnlText(t) {
    const s = String(t || "").replace(/\s+/g, "");
    if (!s) return null;
    if (/^0+(?:\.0+)?\$?$/.test(s) || s === "0.00$" || s === "$0.00") return { win: false, pnl: 0 };
    const m = s.match(/^([+\-\u2212])?\$?(\d+(?:\.\d+)?)\$?$/);
    if (!m) return null;
    const n = parseFloat(m[2]);
    if (!isFinite(n)) return null;
    if (m[1] === "-" || m[1] === "\u2212") return { win: false, pnl: -n };
    if (m[1] === "+" || n > 0.001) return { win: true, pnl: n };
    return { win: false, pnl: 0 };
  }
  function listPnlSnippets() {
    const hud = document.getElementById("quotexbot-hud");
    const dashEl = document.getElementById("quotexbot-dash");
    const wide = window.innerWidth || 1200;
    const found = [];
    const nodes = document.querySelectorAll("div, span, li, p, b");
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (hud && (el === hud || hud.contains(el))) continue;
      if (dashEl && (el === dashEl || dashEl.contains(el))) continue;
      let r;
      try { r = el.getBoundingClientRect(); } catch (_e) { continue; }
      if (!r || r.left < wide * 0.58 || r.width < 8 || r.top < 70) continue;
      let t = "";
      try { t = (el.innerText || "").replace(/\s+/g, " ").trim(); } catch (_e2) { continue; }
      if (!t || t.length > 24) continue;
      if (!/[+$\u0024]|0\.00/.test(t)) continue;
      const got = parsePnlText(t);
      if (!got) continue;
      found.push({ y: r.top, win: got.win, pnl: got.pnl, t: t });
    }
    found.sort(function (a, b) { return a.y - b.y; });
    const uniq = [];
    const seen = {};
    for (let i = 0; i < found.length; i++) {
      const k = found[i].win + ":" + found[i].pnl + ":" + Math.round(found[i].y / 8);
      if (seen[k]) continue;
      seen[k] = 1;
      uniq.push(found[i]);
    }
    return uniq;
  }
  function tradeStats() {
    const j = state.journal || [];
    const taken = j.filter(function (x) { return x && x.ok; });
    let wins = 0, losses = 0, pending = 0, net = 0, profit = 0;
    for (let i = 0; i < taken.length; i++) {
      const x = taken[i];
      if (x.result === "win") { wins += 1; const n = Number(x.pnl) || 0; net += n; profit += n; }
      else if (x.result === "loss") { losses += 1; net += Number(x.pnl) || 0; }
      else pending += 1;
    }
    return { total: taken.length, wins: wins, losses: losses, pending: pending, net: net, profit: profit };
  }
  function fmtMoney(n) {
    const x = Number(n) || 0;
    return (x >= 0 ? "+" : "") + x.toFixed(2) + "$";
  }
  const TF_MS = {
    "5s": 5000, "10s": 10000, "15s": 15000, "30s": 30000,
    "1m": 60000, "2m": 120000, "3m": 180000, "5m": 300000,
    "10m": 600000, "15m": 900000, "30m": 1800000, "1h": 3600000,
  };
  function tfToMs(tf) {
    const t = String(tf || "").toLowerCase().replace(/\s+/g, "");
    if (TF_MS[t]) return TF_MS[t];
    const m = t.match(/^(\d+)(s|m|h)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (m[2] === "s") return n * 1000;
      if (m[2] === "m") return n * 60000;
      if (m[2] === "h") return n * 3600000;
    }
    return CONFIG.tradeMs || 60000;
  }
  function clockToTf(v) {
    const raw = String(v || "").replace(/\s+/g, "");
    if (!raw) return null;
    const low = raw.toLowerCase();
    if (TF_MS[low]) return low;
    let sec = null;
    const hms = raw.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (hms) sec = (+hms[1]) * 3600 + (+hms[2]) * 60 + (+hms[3]);
    const ms = !hms && raw.match(/^(\d{1,2}):(\d{2})$/);
    if (ms) sec = (+ms[1]) * 60 + (+ms[2]);
    if (sec == null || !isFinite(sec) || sec <= 0) return null;
    const keys = Object.keys(TF_MS);
    for (let i = 0; i < keys.length; i++) {
      if (TF_MS[keys[i]] === sec * 1000) return keys[i];
    }
    if (sec % 3600 === 0) return (sec / 3600) + "h";
    if (sec % 60 === 0) return (sec / 60) + "m";
    return sec + "s";
  }
  function readExpiryLabel() {
    const hud = document.getElementById("quotexbot-hud");
    const dashEl = document.getElementById("quotexbot-dash");
    const re = /^(5s|10s|15s|30s|1m|2m|3m|5m|10m|15m|30m|1h)$/i;
    let best = null, bestScore = -1e9, bestSel = null, bestSelScore = -1e9;
    const nodes = document.querySelectorAll("button, span, div, li, a, label, b");
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (hud && (el === hud || hud.contains(el))) continue;
      if (dashEl && (el === dashEl || dashEl.contains(el))) continue;
      let t = "";
      try { t = (el.innerText || "").replace(/\s+/g, "").trim(); } catch (_e) { continue; }
      if (!re.test(t)) continue;
      let r;
      try { r = el.getBoundingClientRect(); } catch (_e2) { continue; }
      if (!r || r.width < 4 || r.height < 4) continue;
      let extra = 0;
      try {
        const cls = String(el.className || "");
        const aria = (el.getAttribute && el.getAttribute("aria-selected")) || "";
        if (aria === "true" || /active|selected|current|is-active|is-current/i.test(cls)) extra += 300;
        const par = el.parentElement;
        if (par && /active|selected|current/i.test(String(par.className || ""))) extra += 160;
      } catch (_e3) {}
      const wide = window.innerWidth || 1200;
      const score = extra - r.top + (r.left > wide * 0.5 ? 80 : 0);
      const lab = t.toLowerCase();
      if (score > bestScore) { bestScore = score; best = lab; }
      if (extra >= 160 && score > bestSelScore) { bestSelScore = score; bestSel = lab; }
    }
    if (bestSel && TF_MS[bestSel]) return bestSel;
    try {
      if (scrape && typeof scrape.findLabeledInput === "function") {
        const el = scrape.findLabeledInput(document, /\b(time|expiry|expiration|tiempo|tempo|время|সময়)\b/i);
        if (el) {
          const v = (el.value != null ? el.value : "") || (el.textContent || "");
          const mapped = clockToTf(v);
          if (mapped) return mapped;
        }
      }
    } catch (_e4) {}
    try {
      const snap = snapDoc();
      const tf = snap && snap.timeframe ? String(snap.timeframe).toLowerCase() : "";
      if (TF_MS[tf]) return tf;
    } catch (_e0) {}
    if (best && TF_MS[best]) return best;
    return "1m";
  }
  function readExpiryMs() {
    return tfToMs(readExpiryLabel());
  }
  function screenCountdownSec() {
    const hud = document.getElementById("quotexbot-hud");
    const dashEl = document.getElementById("quotexbot-dash");
    let bestMoney = null;
    let bestZero = null;
    const nodes = [];
    try {
      forEachRoot(function (root) {
        try {
          const list = root.querySelectorAll("div, span, b, strong, p, label, text, tspan, em");
          for (let i = 0; i < list.length; i++) nodes.push(list[i]);
        } catch (_e0) {}
      });
    } catch (_e1) {
      try {
        const list = document.querySelectorAll("div, span, b, strong, p, label");
        for (let i = 0; i < list.length; i++) nodes.push(list[i]);
      } catch (_e2) {}
    }
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (hud && (el === hud || (hud.contains && hud.contains(el)))) continue;
      if (dashEl && (el === dashEl || (dashEl.contains && dashEl.contains(el)))) continue;
      let t = "";
      try { t = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim(); } catch (_e3) { continue; }
      if (!t || t.length > 32) continue;
      if (/\b\d{2}:\d{2}:\d{2}\b/.test(t)) continue;
      const m = t.match(/\b(\d{1,2}):(\d{2})\b/);
      if (!m) continue;
      const mm = parseInt(m[1], 10);
      const ss = parseInt(m[2], 10);
      if (!isFinite(mm) || !isFinite(ss) || ss > 59 || mm >= 15) continue;
      const total = mm * 60 + ss;
      const hasMoney = /\$|\d\s*\$/.test(t);
      if (hasMoney) {
        if (bestMoney == null || total < bestMoney) bestMoney = total;
      } else if (mm === 0) {
        if (bestZero == null || total < bestZero) bestZero = total;
      }
    }
    if (bestMoney != null) return bestMoney;
    if (bestZero != null) return bestZero;
    return null;
  }
  function pnlAlreadyUsed(used, n) {
    if (used[String(n)]) return true;
    const keys = Object.keys(used);
    for (let i = 0; i < keys.length; i++) {
      if (Math.abs(Number(keys[i]) - n) < 1e-6) return true;
    }
    return false;
  }
  function lastOkJournal() {
    const j = state.journal || [];
    for (let i = j.length - 1; i >= 0; i--) {
      if (j[i] && j[i].ok) return j[i];
    }
    return null;
  }
  function settlePendingJournal() {
    if (!Array.isArray(state.journal) || !state.journal.length) return;
    const now = Date.now();
    let cd = null;
    try { cd = screenCountdownSec(); } catch (_e) {}
    const countingDown = cd != null && cd > 1;
    const used = {};
    for (let i = 0; i < state.journal.length; i++) {
      const r = state.journal[i];
      if (r && r.result && r.pnl != null) used[String(r.pnl)] = 1;
    }
    let fpNow = "";
    try { fpNow = tradesFingerprint(); } catch (_fp) {}
    const snips = countingDown ? [] : listPnlSnippets();
    let changed = false;
    for (let i = 0; i < state.journal.length; i++) {
      const row = state.journal[i];
      if (!(row && row.ok && !row.result)) continue;
      const dur = row.durMs || CONFIG.tradeMs || 60000;
      const age = now - (row.t || 0);
      if (age < dur) continue;
      if (countingDown) continue;
      const samePanel = !!(row.fp && fpNow && fpNow === row.fp);
      if (!samePanel) {
        let got = null;
        for (let k = 0; k < snips.length; k++) {
          if (pnlAlreadyUsed(used, snips[k].pnl)) continue;
          got = snips[k];
          break;
        }
        if (got) {
          row.result = got.win ? "win" : "loss";
          row.pnl = got.pnl;
          used[String(got.pnl)] = 1;
          changed = true;
          log((got.win ? "প্রফিট " : "লস ") + fmtMoney(got.pnl) + " · " + (row.pair || "") + (row.pos || row.signal ? " " + (row.pos || row.signal) : "") + (row.dur ? " · " + row.dur : ""));
          continue;
        }
      }
      if (age >= dur + 45000) {
        row.result = "loss";
        row.pnl = 0;
        changed = true;
        log("লস +0.00$ · " + (row.pair || ""));
      }
    }
    if (changed) saveState(state);
  }
  function tradesFingerprint() {
    const hud = document.getElementById("quotexbot-hud");
    const dashEl = document.getElementById("quotexbot-dash");
    const wide = window.innerWidth || 1200;
    const bits = [];
    const nodes = document.querySelectorAll("div, span, li, p, b");
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (hud && (el === hud || hud.contains(el))) continue;
      if (dashEl && (el === dashEl || dashEl.contains(el))) continue;
      let r;
      try { r = el.getBoundingClientRect(); } catch (_e) { continue; }
      if (!r || r.left < wide * 0.58 || r.width < 8) continue;
      let t = "";
      try { t = (el.innerText || "").replace(/\s+/g, " ").trim(); } catch (_e2) { continue; }
      if (!t || t.length > 36) continue;
      if (/[+$\-−]\s*\$?\s*\d+(?:\.\d+)?|\d+\.\d+\s*\$/.test(t)) bits.push(t);
      if (bits.length >= 10) break;
    }
    return bits.join("|");
  }

  function tradeOpen() {
    if (!lastClickAt) return false;
    const now = Date.now();
    const age = now - lastClickAt;
    const last = lastOkJournal();
    const dur = (last && last.durMs) || CONFIG.tradeMs || 60000;
    if (last && !last.result) {
      let cd = null;
      try { cd = screenCountdownSec(); } catch (_e) {}
      if (cd != null && cd > 1) return true;
      if (age < dur) return true;
      try { settlePendingJournal(); } catch (_e2) {}
      if (!last.result && age < dur + 15000) return true;
    }
    if (age < (CONFIG.cooldownMs || 65000)) return true;
    return false;
  }

  function snapDoc() {
    if (!scrape || typeof scrape.scrapeDocument !== "function") return { accountMode: "", asset: "" };
    try { return scrape.scrapeDocument(document); } catch (_e) { return { accountMode: "", asset: "" }; }
  }
  function clickDir(dir) {
    if (!scrape) return { ok: false, error: "scrape missing" };
    const snap = snapDoc();
    if (snap.accountMode !== "demo" && !state.liveAck) return { ok: false, error: "live locked" };
    return dir === "down" ? scrape.clickDown(document) : scrape.clickUp(document);
  }

  async function scanWatchlist() {
    if (scanning || !state.auto) return;
    scanning = true;
    try {
      const snap0 = snapDoc();
      if (snap0.accountMode !== "demo") {
        state.auto = false;
        state.lastReason = "LIVE, auto off"; log("লাইভ অ্যাকাউন্ট দেখে অটো বন্ধ");
        saveState(state); render();
        return;
      }
      if (state.autoCount >= MAX_AUTO) {
        state.auto = false;
        state.lastReason = "অটো পজ"; log("১০টা ট্রেড হয়েছে, অটো থামল");
        saveState(state); render();
        return;
      }
      if (tradeOpen()) {
        const left = Math.max(0, CONFIG.cooldownMs - (Date.now() - lastClickAt));
        state.lastReason = "ট্রেড চলছে, অপেক্ষা " + Math.ceil(left / 1000) + "s";
        log("আগের ট্রেডের ফলাফল/কুলডাউন, অপেক্ষা " + Math.ceil(left / 1000) + "s");
        saveState(state); render();
        return;
      }

      const vis = visiblePair();
      const fallback = (state.lastPair && state.lastPair !== "—") ? state.lastPair : null;
      const p = (vis || fallback) ? { label: vis || fallback } : null;
      if (!p) {
        log("চার্টে পেয়ার ধরা যায়নি, সুইচ করব না");
        state.lastReason = "পেয়ার খোলা রাখো, সুইচ অফ";
        saveState(state); render();
        return;
      }
      if (!vis && fallback) log("পেয়ার ট্যাব অস্থির, খোলা চার্ট ধরে: " + fallback);

      if (vis) onPairChange(p.label);
      state.lastPair = p.label;
      state.lastSignal = "…";
      state.lastReason = "খোলা চার্ট: " + p.label;
      log("এক চার্টে থাকছি: " + p.label);
      saveState(state); render();

      log("OTC চার্টের দাম পড়ছি: " + p.label);
      const ticks = await sampleOtc(p.label);
      const bars = ingestTicks(p.label, ticks);
      const lastPx = ticks.length ? ticks[ticks.length - 1] : null;
      state.lastPx = lastPx != null ? String(lastPx) : "—";
      if (lastPx != null) {
        log("OTC দাম " + p.label + " = " + lastPx + " · " + ticks.length + " tick");
      } else {
        const peek = peekQuotes(p.label);
        log("OTC দাম পাইনি: " + p.label + " · পেজে " + peek.n + " নম্বর (" + (peek.shown || "খালি") + ")");
      }

      const hist = denseBars(p.label);
      let d;
      if (hist.length >= CONFIG.minBarsForEma) {
        const raw = decide(hist[hist.length - 1], hist.map(function (b) { return b.close; }));
        d = { signal: raw.signal, reason: "সেভ হিস্ট্রি " + hist.length + " বার · " + raw.reason };
      } else if (ticks.length >= CONFIG.minTicks) {
        const live = decideTicks(ticks);
        d = { signal: live.signal, reason: live.reason + " · জমা " + barCount(p.label) + "/" + CONFIG.minBarsForEma };
      } else if (bars.length >= 2) {
        const a = bars[bars.length - 2], b = bars[bars.length - 1];
        if (b.close > a.close) d = { signal: "CALL", reason: "সেভ বার up · জমা " + bars.length };
        else if (b.close < a.close) d = { signal: "PUT", reason: "সেভ বার down · জমা " + bars.length };
        else d = { signal: "SKIP", reason: "সেভ বার flat · জমা " + bars.length };
      } else {
        d = { signal: "SKIP", reason: "OTC দাম পাইনি · জমা " + barCount(p.label) + "/" + CONFIG.minBarsForEma };
      }

      state.lastSignal = d.signal;
      state.lastReason = p.label + " · " + d.reason; log(p.label + " সিগন্যাল " + d.signal + " · " + d.reason);
      notePair(p.label, {
        px: lastPx != null ? String(lastPx) : (state.pairStats[p.label] && state.pairStats[p.label].px) || "—",
        signal: d.signal,
        reason: d.reason,
        bars: barCount(p.label),
        ticks: ticks.length,
      });
      saveState(state); render(); renderDash();

      if (d.signal !== "CALL" && d.signal !== "PUT") return;
      if (Date.now() - lastClickAt < CONFIG.cooldownMs) return;

      await sleep(400 + Math.floor(Math.random() * 600));
      let durLabel = "1m";
      let durMsVal = CONFIG.tradeMs || 60000;
      try { durLabel = readExpiryLabel(); } catch (_d1) {}
      try { durMsVal = readExpiryMs(); } catch (_d2) { durMsVal = tfToMs(durLabel); }
      const r = clickDir(d.signal === "PUT" ? "down" : "up");
      let fpAtClick = "";
      try { fpAtClick = tradesFingerprint(); } catch (_fp0) { fpAtClick = ""; }
      addJournal({
        t: Date.now(),
        pair: p.label,
        signal: d.signal,
        pos: d.signal,
        dur: durLabel,
        durMs: durMsVal,
        px: lastPx != null ? String(lastPx) : "—",
        fp: fpAtClick,
        ok: Boolean(r.ok),
        err: r.ok ? "" : (r.error || "fail"),
      });
      if (r.ok) {
        state.autoCount += 1;
        lastClickAt = Date.now();
        lastTradesFp = fpAtClick;
        state.lastReason = d.signal + " " + p.label + " · " + durLabel + " · " + d.reason;
        log("ক্লিক OK: " + d.signal + " " + p.label + " · " + durLabel + " · দাম " + (lastPx != null ? lastPx : "—"));
      } else {
        state.lastReason = p.label + " সিগন্যাল, ক্লিক হয়নি"; log("ক্লিক FAIL: " + p.label + " বাটন পাইনি");
      }
      saveState(state); render(); renderDash();
    } finally {
      scanning = false;
    }
  }

  const HUD_CSS = `
    #quotexbot-hud{position:fixed;bottom:12px;left:12px;top:auto;right:auto;z-index:2147483647 !important;width:380px;height:480px;
      background:#10141c;color:#e8eef7;border:2px solid #3d9cf0;border-radius:12px;
      font:13px/1.4 system-ui,Segoe UI,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.45);
      user-select:none;display:flex !important;flex-direction:column;visibility:visible !important;opacity:1 !important;
      pointer-events:auto !important;overflow:hidden;min-width:240px;min-height:160px;max-width:96vw;max-height:96vh}
    #quotexbot-hud.mini{width:auto;height:auto;min-height:0;padding:6px 10px}
    #quotexbot-hud .hd{display:flex;justify-content:space-between;align-items:center;
      padding:10px 12px;border-bottom:1px solid #2a3344;cursor:move}
    #quotexbot-hud h1{margin:0;font-size:13px}
    #quotexbot-hud .pill{font-size:11px;padding:2px 8px;border-radius:99px;background:#2a3344}
    #quotexbot-hud .pill.ok{background:#14532d;color:#86efac}
    #quotexbot-hud .body{padding:10px 12px;flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column}
    #quotexbot-hud .row{display:flex;justify-content:space-between;margin:4px 0;color:#9aa6b8;gap:8px;flex:0 0 auto}
    #quotexbot-hud .row b{color:#e8eef7;font-weight:600;text-align:right}
    #quotexbot-hud .btns{display:flex;gap:8px;margin-top:8px;flex:0 0 auto}
    #quotexbot-hud button{border:0;border-radius:8px;padding:8px;color:#fff;cursor:pointer;font-weight:700;flex:0 0 auto;height:auto}
    #quotexbot-hud .btns button{flex:1}
    #quotexbot-hud .up{background:#1fa971}
    #quotexbot-hud .down{background:#d64545}
    #quotexbot-hud .auto{width:100%;margin-top:8px;background:#3d9cf0;flex:0 0 auto}
    #quotexbot-hud .auto.on{background:#14532d}
    #quotexbot-hud .m{background:transparent;color:#9aa6b8;flex:0;padding:0 6px;font-size:14px}
    #quotexbot-hud .note{font-size:10px;color:#9aa6b8;margin-top:8px;flex:0 0 auto}
    #quotexbot-hud .logh{margin:10px 0 4px;font-size:11px;color:#9aa6b8;display:flex;justify-content:space-between;flex:0 0 auto}
    #quotexbot-hud .log{flex:1;min-height:80px;height:auto;overflow:auto;background:#0b0f16;border:1px solid #2a3344;
      border-radius:8px;padding:8px;font:11px/1.45 ui-monospace,Consolas,monospace;color:#c5d0de;white-space:pre-wrap}
    #quotexbot-hud .log div{border-bottom:1px solid #1c2430;padding:3px 0}
    #quotexbot-hud .log .empty{color:#6b7787}
    #quotexbot-hud .dashbtn{width:100%;margin-top:6px;background:#2a3344;flex:0 0 auto}
    #quotexbot-dash{position:fixed;top:12px;left:12px;z-index:2147483646 !important;width:540px;height:420px;
      overflow:hidden;background:#0b0f16;color:#e8eef7;
      border:2px solid #3d9cf0;border-radius:12px;font:13px/1.4 system-ui,sans-serif;
      box-shadow:0 8px 28px rgba(0,0,0,.5);display:none !important;pointer-events:auto !important;
      min-width:260px;min-height:160px;max-width:96vw;max-height:96vh;flex-direction:column}
    #quotexbot-dash.open{display:flex !important}
    #quotexbot-dash .hd{display:flex;justify-content:space-between;align-items:center;
      padding:10px 12px;border-bottom:1px solid #2a3344;cursor:move;flex:0 0 auto}
    #quotexbot-hud .qgrip,#quotexbot-dash .qgrip{position:absolute;right:1px;bottom:1px;width:18px;height:18px;
      cursor:nwse-resize;z-index:5;background:linear-gradient(135deg,transparent 55%,#3d9cf0 55%);border-radius:0 0 10px 0}
    #quotexbot-dash h1{margin:0;font-size:14px}
    #quotexbot-dash .body{padding:10px 12px;flex:1;overflow:auto;min-height:0}
    #quotexbot-dash h2{margin:12px 0 6px;font-size:12px;color:#9aa6b8;font-weight:600}
    #quotexbot-dash .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 10px;padding:10px;background:#10141c;border-radius:8px;border:1px solid #2a3344}
    #quotexbot-dash .stats div{text-align:center;color:#9aa6b8;font-size:11px}
    #quotexbot-dash .stats b{display:block;color:#e8eef7;font-size:18px;margin-top:4px;font-weight:700}
    #quotexbot-dash .stats .win b{color:#86efac}
    #quotexbot-dash .stats .lose b{color:#fca5a5}
    #quotexbot-dash table{width:100%;border-collapse:collapse;font-size:11px}
    #quotexbot-dash th,#quotexbot-dash td{padding:5px 6px;border-bottom:1px solid #1c2430;text-align:left}
    #quotexbot-dash th{color:#9aa6b8}
    #quotexbot-dash .call{color:#86efac;font-weight:700}
    #quotexbot-dash .put{color:#fca5a5;font-weight:700}
    #quotexbot-dash .skip{color:#9aa6b8}
    #quotexbot-dash .m{background:transparent;color:#9aa6b8;border:0;cursor:pointer;font-size:16px}
  `;


  function winBox(which) {
    return which === "dash" ? state.dashWin : state.hudWin;
  }
  function applyWin(el, which) {
    if (!el) return;
    const w = winBox(which);
    if (!w) return;
    const left = w.left;
    const top = w.top;
    const off =
      (left != null && (left < 0 || left > window.innerWidth - 60)) ||
      (top != null && (top < 0 || top > window.innerHeight - 40));
    if (off) {
      if (which === "hud") {
        el.style.left = "12px";
        el.style.bottom = "12px";
        el.style.top = "auto";
        el.style.right = "auto";
      }
      return;
    }
    if (w.left != null) {
      el.style.left = w.left + "px";
      el.style.right = "auto";
      el.style.bottom = "auto";
    }
    if (w.top != null) el.style.top = w.top + "px";
    if (w.w) el.style.width = w.w + "px";
    if (w.h && !(which === "hud" && state.minimized)) el.style.height = w.h + "px";
  }
  function saveWin(el, which) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const box = {
      left: Math.round(Math.max(0, r.left)),
      top: Math.round(Math.max(0, r.top)),
      w: Math.round(Math.max(220, r.width)),
      h: Math.round(Math.max(140, r.height)),
    };
    if (which === "dash") state.dashWin = box;
    else state.hudWin = box;
    saveState(state);
  }
  function mountGrip(el, which) {
    if (!el) return;
    applyWin(el, which);
    let g = el.querySelector(":scope > .qgrip");
    if (!g) {
      g = document.createElement("div");
      g.className = "qgrip";
      g.title = "সাইজ বদলাও";
      el.appendChild(g);
    }
  }

  let winDrag = null;
  function onWinMove(ev) {
    if (!winDrag) return;
    const el = winDrag.el;
    if (winDrag.mode === "move") {
      let x = ev.clientX - winDrag.dx;
      let y = ev.clientY - winDrag.dy;
      x = Math.max(0, Math.min(x, window.innerWidth - 80));
      y = Math.max(0, Math.min(y, window.innerHeight - 40));
      el.style.left = x + "px";
      el.style.top = y + "px";
      el.style.right = "auto";
      el.style.bottom = "auto";
    } else {
      const w = Math.max(220, ev.clientX - winDrag.left);
      const h = Math.max(140, ev.clientY - winDrag.top);
      el.style.width = Math.min(w, window.innerWidth - winDrag.left) + "px";
      el.style.height = Math.min(h, window.innerHeight - winDrag.top) + "px";
    }
  }
  function onWinUp() {
    if (!winDrag) return;
    saveWin(winDrag.el, winDrag.which);
    winDrag = null;
  }
  function startWin(el, which, ev) {
    if (!el || !ev) return;
    const t = ev.target;
    if (t && t.closest && t.closest("button, a, input, .log, table")) return;
    const grip = t && t.classList && t.classList.contains("qgrip");
    const hd = t && t.closest && t.closest(".hd");
    if (!grip && !hd) return;
    ev.preventDefault();
    const r = el.getBoundingClientRect();
    winDrag = {
      el: el,
      which: which,
      mode: grip ? "resize" : "move",
      dx: ev.clientX - r.left,
      dy: ev.clientY - r.top,
      left: r.left,
      top: r.top,
    };
  }
  window.addEventListener("mousemove", onWinMove);
  window.addEventListener("mouseup", onWinUp);

  function injectCss() {
    let st = document.getElementById("quotexbot-hud-css");
    if (!st) {
      st = document.createElement("style");
      st.id = "quotexbot-hud-css";
      (document.head || document.documentElement).appendChild(st);
    }
    st.textContent = HUD_CSS;
  }

  function pinHud(el) {
    if (!el) return;
    el.style.left = "12px";
    el.style.bottom = "12px";
    el.style.top = "auto";
    el.style.right = "auto";
    el.style.zIndex = "2147483647";
  }

  function createRoot() {
    injectCss();
    const old = document.getElementById("quotexbot-hud");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    const el = document.createElement("div");
    el.id = "quotexbot-hud";
    el.setAttribute("style", "position:fixed;bottom:12px;left:12px;top:auto;right:auto;z-index:2147483647;width:380px;height:480px;background:#10141c;color:#e8eef7;border:2px solid #3d9cf0;border-radius:12px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.45);display:flex;flex-direction:column;visibility:visible;opacity:1;pointer-events:auto;overflow:hidden;");
    function mount(n) {
      const host = document.body;
      if (!host) {
        if (n < 15) setTimeout(function () { mount(n + 1); }, 300);
        else {
          try { (document.documentElement || document).appendChild(el); } catch (_e0) {}
        }
        return;
      }
      host.appendChild(el);
      applyWin(el, "hud");
      pinHud(el);
    }
    mount(0);
    return el;
  }

  function createDash() {
    injectCss();
    let el = document.getElementById("quotexbot-dash");
    if (el && el.isConnected) return el;
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = document.createElement("div");
    el.id = "quotexbot-dash";
    (document.body || document.documentElement).appendChild(el);
    el.addEventListener("click", function (ev) {
      const act = ev.target && ev.target.getAttribute && ev.target.getAttribute("data-act");
      if (act === "dash-close") {
        state.dashOpen = false;
        saveState(state);
        renderDash();
      }
    });
    el.addEventListener("mousedown", function (ev) { startWin(el, "dash", ev); });
    return el;
  }

  let root = createRoot();
  let dash = createDash();

  function renderDash() {
    if (topHudYielded) return;
    dash = createDash();
    if (!state.dashOpen) {
      dash.className = "";
      dash.innerHTML = "";
      return;
    }
    dash.className = "open";
    const rows = WATCH.map(function (p) {
      const st = (state.pairStats && state.pairStats[p.label]) || {};
      const sig = st.signal || "—";
      const cls = sig === "CALL" ? "call" : sig === "PUT" ? "put" : "skip";
      const nbar = barCount(p.label);
      return "<tr><td>" + esc(p.label) + "</td><td>" + esc(st.px || "—") + "</td><td>" + nbar + "/21</td><td class=\"" + cls + "\">" + esc(sig) + "</td><td>" + esc(st.reason || "—") + "</td></tr>";
    }).join("");
    settlePendingJournal();
    const ts = tradeStats();
    const jrows = (state.journal || []).slice(-20).reverse().map(function (j) {
      const when = new Date(j.t);
      const hh = String(when.getHours()).padStart(2, "0");
      const mm = String(when.getMinutes()).padStart(2, "0");
      const ss = String(when.getSeconds()).padStart(2, "0");
      const cls = j.signal === "CALL" ? "call" : j.signal === "PUT" ? "put" : "skip";
      let res = "—";
      let rcls = "skip";
      if (j.result === "win") { res = "প্রফিট " + fmtMoney(j.pnl); rcls = "call"; }
      else if (j.result === "loss") { res = "লস " + fmtMoney(j.pnl); rcls = "put"; }
      else if (j.ok) res = "চলছে";
      else res = esc(j.err || "FAIL");
      const pos = j.pos || j.signal || "—";
      const dur = j.dur || "—";
      return "<tr><td>" + hh + ":" + mm + ":" + ss + "</td><td>" + esc(j.pair) + "</td><td class=\"" + cls + "\">" + esc(pos) + "</td><td>" + esc(dur) + "</td><td>" + esc(j.px) + "</td><td class=\"" + rcls + "\">" + res + "</td></tr>";
    }).join("") || "<tr><td colspan=\"6\">এখনো ট্রেড নেই</td></tr>";
    dash.innerHTML = "<div class=\"hd\"><h1>quotexbot ড্যাশবোর্ড v" + CONFIG.version + "</h1><button class=\"m\" type=\"button\" data-act=\"dash-close\">×</button></div><div class=\"body\"><div class=\"stats\"><div>মোট ট্রেড<b>" + ts.total + "</b></div><div class=\"win\">প্রফিট<b>" + ts.wins + "</b></div><div class=\"lose\">লস<b>" + ts.losses + "</b></div><div>নেট<b>" + fmtMoney(ts.net) + "</b></div></div>" + (ts.pending ? "<p class=\"note\">ফলাফল অপেক্ষা: " + ts.pending + "</p>" : "") + "<h2>পেয়ার · সেভ ডেটা</h2><table><thead><tr><th>পেয়ার</th><th>OTC দাম</th><th>হিস্ট্রি</th><th>সিগন্যাল</th><th>কারণ</th></tr></thead><tbody>" + rows + "</tbody></table><h2>ট্রেড জার্নাল</h2><table><thead><tr><th>সময়</th><th>পেয়ার</th><th>পজিশন</th><th>সময়</th><th>দাম</th><th>ফলাফল</th></tr></thead><tbody>" + jrows + "</tbody></table></div>";
    mountGrip(dash, "dash");
  }

  function render() {
    if (topHudYielded) return;
    const snap = snapDoc();
    const demo = snap.accountMode === "demo";
    if (state.minimized) {
      root.className = "mini";
      root.innerHTML = `<div class="hd"><h1>quotexbot v${CONFIG.version}</h1>
        <span class="pill ${state.connected ? "ok" : ""}">${state.connected ? "সংযুক্ত" : "না"}</span>
        <button class="m" type="button" data-act="restore">▣</button></div>`;
      return;
    }
    root.className = "";
    root.innerHTML = `
      <div class="hd">
        <h1>quotexbot v${CONFIG.version}</h1>
        <span class="pill ${state.connected ? "ok" : ""}">${state.connected ? "সংযুক্ত" : "সংযুক্ত নয়"}</span>
        <button class="m" type="button" data-act="mini">–</button>
      </div>
      <div class="body">
        <div class="row"><span>মোড</span><b>${demo ? "DEMO" : (snap.accountMode || "—").toUpperCase()}</b></div>
        <div class="row"><span>ব্রাউজ</span><b>সুইচ অফ · এক চার্ট</b></div>
        <div class="row"><span>পেয়ার</span><b>${state.lastPair || snap.asset || "—"}</b></div>
        <div class="row"><span>OTC দাম</span><b>${state.lastPx || "—"}</b></div>
        <div class="row"><span>হিস্ট্রি</span><b>${barCount(state.lastPair || snap.asset || "")}/${CONFIG.minBarsForEma} বার · সেভ</b></div>
        <div class="row"><span>সিগন্যাল</span><b>${state.lastSignal}</b></div>
        <div class="row"><span>ট্রেড</span><b>${(function(){ const j = lastOkJournal(); if (!j) return "—"; return (j.pos || j.signal || "—") + (j.dur ? " · " + j.dur : "") + (j.result ? "" : " · চলছে"); })()}</b></div>
        <div class="row"><span>অটো</span><b>${state.auto ? "ON " + state.autoCount + "/" + MAX_AUTO : "OFF"}</b></div>
        <div class="row"><span>হিসাব</span><b>${(function(){ const s = tradeStats(); return s.total + " ট্রেড · প্রফিট " + s.wins + " · লস " + s.losses + " · " + fmtMoney(s.net); })()}</b></div>
        <div class="btns">
          <button class="up" type="button" data-act="up" ${demo || state.liveAck ? "" : "disabled"}>উপরে</button>
          <button class="down" type="button" data-act="down" ${demo || state.liveAck ? "" : "disabled"}>নিচে</button>
        </div>
        <button class="auto ${state.auto ? "on" : ""}" type="button" data-act="auto">${state.auto ? "অটো বন্ধ করো" : "অটো ট্রেড চালু"}</button>
        <button class="dashbtn" type="button" data-act="dash">ড্যাশবোর্ড</button>
        <p class="note">${state.lastReason || "পেয়ার সুইচ অফ। যে চার্ট খোলা সেখানেই দাম সেভ ও ট্রেড।"}</p>
        <div class="logh"><span>লগ · bot এখন যা করছে</span><span>${state.logs.length}</span></div>
        <div class="log">${state.logs.length
          ? state.logs.map((line) => "<div>" + line.replace(/[&<>]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])) + "</div>").join("")
          : '<div class="empty">এখনো কিছু হয়নি। অটো চালু করলে এখানে দেখাবে।</div>'}</div>
      </div>`;
    const box = root.querySelector(".log");
    if (box) box.scrollTop = box.scrollHeight;
    mountGrip(root, "hud");
    renderDash();
  }

  function onHudClick(ev) {
    const act = ev.target && ev.target.getAttribute && ev.target.getAttribute("data-act");
    if (!act) return;
    if (act === "mini") { state.minimized = true; saveState(state); render(); }
    if (act === "restore") { state.minimized = false; saveState(state); render(); }
    if (act === "dash") { state.dashOpen = !state.dashOpen; saveState(state); renderDash(); }
    if (act === "up") {
      const r = clickDir("up");
      state.lastReason = r.ok ? "উপরে clicked" : (r.error || "fail"); log(r.ok ? "ম্যানুয়াল উপরে OK" : "ম্যানুয়াল উপরে FAIL: " + (r.error || ""));
      saveState(state); render();
    }
    if (act === "down") {
      const r = clickDir("down");
      state.lastReason = r.ok ? "নিচে clicked" : (r.error || ""); log(r.ok ? "ম্যানুয়াল নিচে OK" : "ম্যানুয়াল নিচে FAIL: " + (r.error || ""));
      saveState(state); render();
    }
    if (act === "auto") {
      const snap = snapDoc();
      if (state.auto) {
        state.auto = false;
        log("অটো বন্ধ");
      } else if (snap.accountMode !== "demo") {
        state.lastReason = "লাইভ অ্যাকাউন্টে অটো বন্ধ";
        log("লাইভ, অটো চালু হয়নি");
      } else {
        state.auto = true;
        state.autoCount = 0;
        state.lastReason = "অটো চালু · পেয়ার ব্রাউজ";
        log("অটো চালু — এই চার্টেই থাকবে");
        scanWatchlist();
      }
      saveState(state); render();
    }
  }

  function bindHud(el) {
    el.addEventListener("click", onHudClick);
    el.addEventListener("mousedown", function (ev) { startWin(el, "hud", ev); });
  }
  bindHud(root);

  function hasLargeChartIframe() {
    try {
      const list = document.querySelectorAll("iframe");
      for (let i = 0; i < list.length; i++) {
        let w = 0, h = 0;
        try {
          const r = list[i].getBoundingClientRect();
          w = r.width || 0;
          h = r.height || 0;
        } catch (_e1) {}
        if (w >= 600 && h >= 400) return true;
      }
    } catch (_e) {}
    return false;
  }
  function yieldTopHudToIframe() {
    if (window.top !== window) return;
    if (!hasLargeChartIframe()) return;
    topHudYielded = true;
    try {
      const hud = document.getElementById("quotexbot-hud");
      if (hud && hud.parentNode) hud.parentNode.removeChild(hud);
    } catch (_e0) {}
    try {
      const d = document.getElementById("quotexbot-dash");
      if (d && d.parentNode) d.parentNode.removeChild(d);
    } catch (_e1) {}
  }
  if (window.top === window) {
    setTimeout(yieldTopHudToIframe, 1500);
  }

  function ensureHud() {
    if (topHudYielded) return;
    const live = document.getElementById("quotexbot-hud");
    if (live && live.isConnected) {
      root = live;
    } else {
      root = createRoot();
      bindHud(root);
      log("HUD আবার লাগানো হয়েছে");
      render();
    }
    dash = createDash();
  }

  function onQuoteTick() {
    const label = visiblePair();
    if (!label) return;
    onPairChange(label);
    const px = readLivePrice(label);
    if (px == null) {
      state.lastPx = "—";
      if (root && root.isConnected) {
        const row = root.querySelectorAll(".row b")[3];
        if (row) row.textContent = "—";
      }
      return;
    }
    if (px === lastObservedPx) return;
    lastObservedPx = px;
    ingestTicks(label, [px]);
    state.lastPx = String(px);
    notePair(label, { px: String(px), bars: barCount(label) });
    if (root && root.isConnected) {
      const row = root.querySelectorAll(".row b")[3];
      if (row) row.textContent = state.lastPx;
    }
  }

  function bindAxisObserver() {
    const axis = readAxisLivePrice();
    if (!axis || !axis.el) return;
    const missing = !!(lastAxisEl && lastAxisEl.isConnected === false);
    if (!missing && axis.el === lastAxisEl) return;
    lastAxisEl = axis.el;
    try { if (axisObs) axisObs.disconnect(); } catch (_e) {}
    try {
      axisObs = new MutationObserver(function () { onQuoteTick(); });
      axisObs.observe(axis.el.parentElement || axis.el, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    } catch (_e2) {}
  }

  function startQuoteObserver() {
    if (window.__quotexbotObs) return;
    window.__quotexbotObs = true;
    setInterval(function () {
      bindAxisObserver();
      onQuoteTick();
    }, CONFIG.recordMs);
    bindAxisObserver();
    onQuoteTick();
  }

  setInterval(function () {
    ensureHud();
    settlePendingJournal();
    if (state.auto) scanWatchlist();
    else {
      const sig = String(state.lastPx) + "\0" + String(state.lastPair);
      if (sig === lastHudSig) return;
      lastHudSig = sig;
      render();
    }
  }, CONFIG.uiMs);

  startQuoteObserver();


  log(scrape ? ("HUD চালু v" + CONFIG.version + " · CONFIG") : "HUD চালু, scrape নেই");
  render();
  renderDash();
  if (state.auto) scanWatchlist();
  } catch (err) {
    try {
      const b = document.createElement("div");
      b.id = "quotexbot-hud";
      b.textContent = "quotexbot error: " + (err && err.message ? err.message : err);
      b.setAttribute("style", "position:fixed;top:12px;right:12px;z-index:2147483647;background:#7f1d1d;color:#fff;padding:12px 14px;border-radius:10px;max-width:360px;font:13px system-ui;");
      (document.body || document.documentElement).appendChild(b);
    } catch (_e) {}
    try { console.error("[quotexbot]", err); } catch (_e2) {}
  }
})();
