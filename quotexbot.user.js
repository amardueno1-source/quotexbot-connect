// ==UserScript==
// @name         quotexbot Connect
// @namespace    https://github.com/amardueno1-source/quotexbot-connect
// @version      0.2.0
// @description  DEMO OTC HUD that stays on the trade page. Auto Up/Down without the popup. No cookies, no SSID, no passwords.
// @author       amardueno1-source
// @match        https://market-qx.info/*
// @match        https://*.market-qx.info/*
// @match        https://market-qx.com/*
// @match        https://*.market-qx.com/*
// @match        https://broker-qx.com/*
// @match        https://*.broker-qx.com/*
// @match        https://broker-qx.info/*
// @match        https://*.broker-qx.info/*
// @match        https://qxbroker.com/*
// @match        https://*.qxbroker.com/*
// @match        https://quotex.com/*
// @match        https://*.quotex.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/amardueno1-source/quotexbot-connect/main/quotexbot.user.js
// @downloadURL  https://raw.githubusercontent.com/amardueno1-source/quotexbot-connect/main/quotexbot.user.js
// @run-at       document-idle
// ==/UserScript==

/**
 * Visible-DOM scraper for the trade tab.
 *
 * Will not: read document.cookie, capture SSID/tokens, talk to WebSockets,
 * store email/password, or call unofficial broker APIs.
 * Connect = read what is already on screen, then optionally click Up/Down.
 */
(function (root) {
  "use strict";

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
      const r = target.getBoundingClientRect();
      scored.push({ dir, el: target, area: r.width * r.height, text: text || aria });
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

  function scrapeDocument(doc) {
    const href =
      (doc.defaultView && doc.defaultView.location && doc.defaultView.location.href) ||
      (typeof location !== "undefined" ? location.href : "");
    const text =
      (doc.body && (doc.body.innerText || doc.body.textContent)) ||
      (typeof document !== "undefined" && document.body && document.body.innerText) ||
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
  if (window.__quotexbotHud) return;
  window.__quotexbotHud = true;

  const scrape = globalThis.QuotexbotScrape;
  if (!scrape) return;

  const KEY = "quotexbot_tm_state";
  function loadState() {
    try {
      if (typeof GM_getValue === "function") {
        const raw = GM_getValue(KEY, "");
        return raw ? JSON.parse(raw) : {};
      }
    } catch (_e) {}
    try {
      return JSON.parse(localStorage.getItem(KEY) || "{}");
    } catch (_e2) {
      return {};
    }
  }
  function saveState(s) {
    const json = JSON.stringify(s);
    try {
      if (typeof GM_setValue === "function") GM_setValue(KEY, json);
    } catch (_e) {}
    try {
      localStorage.setItem(KEY, json);
    } catch (_e2) {}
  }

  let state = Object.assign(
    {
      connected: true,
      auto: false,
      minimized: false,
      liveAck: false,
      autoCount: 0,
      lastSignal: "—",
      lastReason: "",
      lastBar: "",
    },
    loadState()
  );

  const candles = [];
  let samples = [];
  let lastClickAt = 0;
  const MAX_AUTO = 10;

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
    const rs = gain / loss;
    return 100 - 100 / (1 + rs);
  }

  function readPrice() {
    const text = (document.body && document.body.innerText) || "";
    const nums = [];
    const re = /\b(\d+\.\d{4,6})\b/g;
    let m;
    while ((m = re.exec(text))) nums.push(parseFloat(m[1]));
    if (!nums.length) return null;
    const snap = scrape.scrapeDocument(document);
    // Prefer a number close to typical FX OTC quotes, last occurrence often the live line.
    return nums[nums.length - 1];
  }

  function decide(bar, closes) {
    const fast = ema(closes, 8);
    const slow = ema(closes, 21);
    const r = rsi(closes, 14);
    if (fast == null || slow == null || r == null) {
      return { signal: "SKIP", reason: "history কম" };
    }
    const range = bar.high - bar.low;
    if (range <= 0) return { signal: "SKIP", reason: "flat candle" };
    const body = Math.abs(bar.close - bar.open);
    const bodyRatio = body / range;
    const upWick = (bar.high - Math.max(bar.open, bar.close)) / range;
    const dnWick = (Math.min(bar.open, bar.close) - bar.low) / range;
    const sep = Math.abs(fast - slow) / bar.close;
    if (sep < 0.00003) return { signal: "SKIP", reason: "EMA কাছাকাছি / no trend" };
    const bull = bar.close > bar.open;
    const bear = bar.close < bar.open;
    if (fast > slow && bull) {
      if (bodyRatio < 0.45) return { signal: "SKIP", reason: "weak body" };
      if (upWick > 0.28) return { signal: "SKIP", reason: "upper wick" };
      if (r < 48 || r > 68) return { signal: "SKIP", reason: "RSI " + r.toFixed(1) };
      return { signal: "CALL", reason: "uptrend EMA8>21, RSI " + r.toFixed(1) };
    }
    if (fast < slow && bear) {
      if (bodyRatio < 0.45) return { signal: "SKIP", reason: "weak body" };
      if (dnWick > 0.28) return { signal: "SKIP", reason: "lower wick" };
      if (r < 32 || r > 52) return { signal: "SKIP", reason: "RSI " + r.toFixed(1) };
      return { signal: "PUT", reason: "downtrend EMA8<21, RSI " + r.toFixed(1) };
    }
    return { signal: "SKIP", reason: "no aligned setup" };
  }

  function tradeOpen() {
    const t = (document.body && document.body.innerText) || "";
    if (/you don'?t have a trade history/i.test(t)) return false;
    if (/pending|opened|in progress/i.test(t) && /trades/i.test(t)) return true;
    return false;
  }

  function clickDir(dir) {
    const snap = scrape.scrapeDocument(document);
    if (snap.accountMode !== "demo" && !state.liveAck) {
      return { ok: false, error: "live locked" };
    }
    return dir === "down" ? scrape.clickDown(document) : scrape.clickUp(document);
  }

  GM_addStyle(`
    #quotexbot-hud{position:fixed;top:72px;right:16px;z-index:2147483646;width:280px;
      background:#10141c;color:#e8eef7;border:1px solid #2a3344;border-radius:12px;
      font:13px/1.4 system-ui,Segoe UI,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.45);
      user-select:none}
    #quotexbot-hud.mini{width:auto;padding:6px 10px}
    #quotexbot-hud .hd{display:flex;justify-content:space-between;align-items:center;
      padding:10px 12px;border-bottom:1px solid #2a3344;cursor:move}
    #quotexbot-hud h1{margin:0;font-size:13px}
    #quotexbot-hud .pill{font-size:11px;padding:2px 8px;border-radius:99px;background:#2a3344}
    #quotexbot-hud .pill.ok{background:#14532d;color:#86efac}
    #quotexbot-hud .body{padding:10px 12px}
    #quotexbot-hud .row{display:flex;justify-content:space-between;margin:4px 0;color:#9aa6b8}
    #quotexbot-hud .row b{color:#e8eef7;font-weight:600}
    #quotexbot-hud .btns{display:flex;gap:8px;margin-top:8px}
    #quotexbot-hud button{flex:1;border:0;border-radius:8px;padding:8px;color:#fff;cursor:pointer;font-weight:700}
    #quotexbot-hud .up{background:#1fa971}
    #quotexbot-hud .down{background:#d64545}
    #quotexbot-hud .auto{width:100%;margin-top:8px;background:#3d9cf0}
    #quotexbot-hud .auto.on{background:#14532d}
    #quotexbot-hud .x,#quotexbot-hud .m{background:transparent;color:#9aa6b8;flex:0;padding:0 6px;font-size:14px}
    #quotexbot-hud .note{font-size:10px;color:#9aa6b8;margin-top:8px}
  `);

  const root = document.createElement("div");
  root.id = "quotexbot-hud";
  document.documentElement.appendChild(root);

  function render() {
    const snap = scrape.scrapeDocument(document);
    const demo = snap.accountMode === "demo";
    if (state.minimized) {
      root.className = "mini";
      root.innerHTML = `<div class="hd"><h1>quotexbot</h1>
        <span class="pill ${state.connected ? "ok" : ""}">${state.connected ? "সংযুক্ত" : "না"}</span>
        <button class="m" type="button" data-act="restore">▣</button></div>`;
      return;
    }
    root.className = "";
    root.innerHTML = `
      <div class="hd">
        <h1>quotexbot</h1>
        <span class="pill ${state.connected ? "ok" : ""}">${state.connected ? "সংযুক্ত" : "সংযুক্ত নয়"}</span>
        <button class="m" type="button" data-act="mini">–</button>
      </div>
      <div class="body">
        <div class="row"><span>মোড</span><b>${demo ? "DEMO" : (snap.accountMode || "—").toUpperCase()}</b></div>
        <div class="row"><span>ব্যালেন্স</span><b>${snap.balance || "—"}</b></div>
        <div class="row"><span>অ্যাসেট</span><b>${snap.asset || "—"}</b></div>
        <div class="row"><span>পেআউট</span><b>${[snap.payoutPercent, snap.payoutAmount].filter(Boolean).join(" · ") || "—"}</b></div>
        <div class="row"><span>সিগন্যাল</span><b>${state.lastSignal}</b></div>
        <div class="row"><span>অটো</span><b>${state.auto ? "ON " + state.autoCount + "/" + MAX_AUTO : "OFF"}</b></div>
        <div class="btns">
          <button class="up" type="button" data-act="up" ${demo || state.liveAck ? "" : "disabled"}>উপরে</button>
          <button class="down" type="button" data-act="down" ${demo || state.liveAck ? "" : "disabled"}>নিচে</button>
        </div>
        <button class="auto ${state.auto ? "on" : ""}" type="button" data-act="auto">${state.auto ? "অটো বন্ধ করো" : "অটো ট্রেড চালু"}</button>
        <p class="note">${state.lastReason || "পপআপ বন্ধ হলেও এই প্যানেল থাকবে। শুধু DEMO অটো। এটা আর্থিক পরামর্শ নয়।"}</p>
      </div>`;
  }

  root.addEventListener("click", (ev) => {
    const act = ev.target && ev.target.getAttribute && ev.target.getAttribute("data-act");
    if (!act) return;
    if (act === "mini") { state.minimized = true; saveState(state); render(); }
    if (act === "restore") { state.minimized = false; saveState(state); render(); }
    if (act === "up") {
      const r = clickDir("up");
      state.lastReason = r.ok ? "উপরে clicked" : (r.error || "fail");
      saveState(state); render();
    }
    if (act === "down") {
      const r = clickDir("down");
      state.lastReason = r.ok ? "নিচে clicked" : (r.error || "fail");
      saveState(state); render();
    }
    if (act === "auto") {
      const snap = scrape.scrapeDocument(document);
      if (state.auto) {
        state.auto = false;
      } else if (snap.accountMode !== "demo") {
        state.lastReason = "লাইভ অ্যাকাউন্টে অটো বন্ধ";
      } else {
        state.auto = true;
        state.autoCount = 0;
        state.lastReason = "অটো চালু · DEMO";
      }
      saveState(state); render();
    }
  });

  // drag
  let drag = null;
  root.addEventListener("mousedown", (ev) => {
    if (!ev.target.closest(".hd")) return;
    drag = { x: ev.clientX - root.offsetLeft, y: ev.clientY - root.offsetTop };
  });
  window.addEventListener("mouseup", () => { drag = null; });
  window.addEventListener("mousemove", (ev) => {
    if (!drag) return;
    root.style.left = ev.clientX - drag.x + "px";
    root.style.top = ev.clientY - drag.y + "px";
    root.style.right = "auto";
  });

  function onMinuteClose(bar) {
    candles.push(bar);
    if (candles.length > 120) candles.shift();
    const closes = candles.map((c) => c.close);
    const d = decide(bar, closes);
    state.lastSignal = d.signal;
    state.lastReason = d.reason;
    state.lastBar = bar.t;
    if (!state.auto) { saveState(state); render(); return; }
    const snap = scrape.scrapeDocument(document);
    if (snap.accountMode !== "demo") {
      state.auto = false;
      state.lastReason = "LIVE detected, auto off";
      saveState(state); render();
      return;
    }
    if (state.autoCount >= MAX_AUTO) {
      state.auto = false;
      state.lastReason = "অটো পজ: " + MAX_AUTO + " ট্রেড";
      saveState(state); render();
      return;
    }
    if (tradeOpen()) { saveState(state); render(); return; }
    if (Date.now() - lastClickAt < 50000) { saveState(state); render(); return; }
    if (d.signal === "CALL" || d.signal === "PUT") {
      const r = clickDir(d.signal === "PUT" ? "down" : "up");
      if (r.ok) {
        state.autoCount += 1;
        lastClickAt = Date.now();
        state.lastReason = d.signal + " auto · " + d.reason;
      } else {
        state.lastReason = "click fail: " + (r.error || "");
      }
    }
    saveState(state);
    render();
  }

  setInterval(function () {
    const px = readPrice();
    const now = new Date();
    const bucket = new Date(now);
    bucket.setSeconds(0, 0);
    const t = bucket.toISOString();
    if (px != null) samples.push({ t: now.getTime(), px });
    if (samples.length > 400) samples = samples.slice(-400);
    if (state.lastBar !== t && now.getSeconds() >= 1 && samples.length) {
      const prev = new Date(bucket.getTime() - 60000).toISOString();
      // close previous minute if we haven't
      const inPrev = samples.filter((s) => s.t >= bucket.getTime() - 60000 && s.t < bucket.getTime());
      if (inPrev.length && state.lastBar !== prev) {
        const opens = inPrev[0].px;
        const close = inPrev[inPrev.length - 1].px;
        const high = Math.max.apply(null, inPrev.map((s) => s.px));
        const low = Math.min.apply(null, inPrev.map((s) => s.px));
        onMinuteClose({ t: prev, open: opens, high, low, close });
      }
    }
    if (!root.dataset.drawn) { render(); root.dataset.drawn = "1"; }
  }, 2000);

  render();
})();
