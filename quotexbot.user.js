// ==UserScript==
// @name         quotexbot Connect
// @namespace    https://github.com/amardueno1-source/quotexbot-connect
// @version      0.9.40
// @description  DEMO HUD: axis live price, self-update+reload after GitHub push. No cookies/SSID.
// @author       amardueno1-source
// @match        https://market-qx.info/*
// @match        https://*.market-qx.info/*
// @match        http://market-qx.info/*
// @match        http://*.market-qx.info/*
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
// @match        https://*.quotex.app/*
// @match        https://market-qx.io/*
// @match        https://*.market-qx.io/*
// @match        https://quotex.app/*
// @include      *://*/demo-trade*
// @include      *://*/live-trade*
// @include      *://*/trade*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @connect      raw.githubusercontent.com
// @updateURL    https://raw.githubusercontent.com/amardueno1-source/quotexbot-connect/main/quotexbot.user.js
// @downloadURL  https://raw.githubusercontent.com/amardueno1-source/quotexbot-connect/main/quotexbot.user.js
// @all_frames   true
// @run-at       document-idle
// ==/UserScript==

/**
 * Visible-DOM scraper for the trade tab.
 *
 * Will not: read document.cookie, capture SSID/tokens, talk to WebSockets,
 * store email/password, or call unofficial broker APIs.
 * Connect = read what is already on screen, then optionally click Up/Down.
 */

(function quotexbotLoader() {
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
  function verNewer(remote, local) {
    const a = String(remote).split(".").map(Number);
    const b = String(local).split(".").map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] || 0, y = b[i] || 0;
      if (x > y) return true;
      if (x < y) return false;
    }
    return false;
  }
  if (window.__quotexbotFromPayload) return;
  const FILE_VER = "0.9.16";
  const PK = "quotexbot_script_payload";
  const PV = "quotexbot_script_payload_ver";
  let cachedVer = "";
  let cachedTxt = "";
  try {
    if (typeof GM_getValue === "function") {
      cachedVer = String(GM_getValue(PV, "") || "");
      cachedTxt = String(GM_getValue(PK, "") || "");
    }
  } catch (_e) {}
  if (cachedTxt && cachedVer && verNewer(cachedVer, FILE_VER)) {
    window.__quotexbotFromPayload = true;
    try {
      const code = cachedTxt.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, "");
      Function(code)();
      window.__quotexbotAbortInstalled = true;
    } catch (err) {
      window.__quotexbotFromPayload = false;
      window.__quotexbotAbortInstalled = false;
      try {
        if (typeof GM_setValue === "function") {
          GM_setValue(PK, "");
          GM_setValue(PV, "");
        }
      } catch (_e2) {}
      try { console.error("[quotexbot] payload", err); } catch (_e3) {}
    }
  }
})();
if (window.__quotexbotAbortInstalled) {
  /* newer payload already running; skip this installed copy */
} else {
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

    const tf = t.match(/\b(5s|10s|15s|30s|1m|2m|3m|5m|10m|15m|30m|1h)\b/i);
    const timeframe = tf ? tf[1].toLowerCase() : "";
    let duration = "";
    const durHms = t.match(/\b(00:\d{2}:\d{2})\b/);
    if (durHms) duration = durHms[1];
    else if (timeframe) duration = timeframe;

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
    try { el.focus && el.focus(); } catch (_f) {}
    if ("value" in el) {
      try {
        const proto = Object.getPrototypeOf(el);
        let desc = proto && Object.getOwnPropertyDescriptor(proto, "value");
        if (!desc) {
          try { desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value"); } catch (_d0) {}
        }
        if (!desc) {
          try { desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value"); } catch (_d1) {}
        }
        if (desc && desc.set) desc.set.call(el, str);
        else el.value = str;
      } catch (_e) {
        el.value = str;
      }
      try {
        if (typeof InputEvent === "function") {
          el.dispatchEvent(new InputEvent("input", { bubbles: true, data: str, inputType: "insertText" }));
        } else {
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      } catch (_e2) {
        try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch (_e3) {}
      }
      try { el.dispatchEvent(new Event("change", { bubbles: true })); } catch (_e4) {}
      return true;
    }
    if (el.getAttribute && el.getAttribute("contenteditable") === "true") {
      el.textContent = str;
      try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch (_e5) {}
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
    version: "0.9.39",
    minWaitMs: 8000,
    tradeMs: 60000,
    axisRightFrac: 0.50,
    updateUrl: "https://raw.githubusercontent.com/amardueno1-source/quotexbot-connect/main/quotexbot.user.js",
    checkUpdateMs: 120000,
    autoReloadOnUpdate: true,
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
    mmPct: 0.01,
    mmReducePct: 0.005,
    mmMin: 1,
    mmMax: 200,
    mmCapPct: 0.02,
    mmReduceAfterLosses: 2,
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
      "USD/DZD": [80, 400],
      "NZD/CAD": [0.75, 1.05],
      "NZD/USD": [0.50, 0.62],
      "USD/BDT": [90, 160],
      "USD/PKR": [200, 400],
      "CAD/CHF": [0.40, 0.90],
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
  let lastAxisScanN = 0;
  let lastHudSig = "";
  let topHudYielded = false;
  let lastMissLogAt = 0;
  let lastMissSig = "";
  let cdLowHoldAt = 0;
  let cdGhost1At = 0;
  let cdGhostLogged = false;
  let lastWaitLogSig = "";

  function loadState() {
    try {
      if (typeof GM_getValue === "function") {
        const raw = GM_getValue(KEY, "");
        return raw ? JSON.parse(raw) : {};
      }
    } catch (_e) {}
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (_e2) { return {}; }
  }
  function saveState(st) {
    const json = JSON.stringify(st);
    try { if (typeof GM_setValue === "function") GM_setValue(KEY, json); } catch (_e) {}
    try { localStorage.setItem(KEY, json); } catch (_e2) {}
  }

    let state = Object.assign({
    connected: true, auto: false, minimized: false, liveAck: false, dashOpen: false,
    autoCount: 0, lastSignal: "—", lastReason: "", lastPair: "—", lastBar: "",
    logs: [], ver: "", pairStats: {}, journal: [],
  }, loadState());
  if (!Array.isArray(state.logs)) state.logs = [];
  if (!state.pairStats || typeof state.pairStats !== "object") state.pairStats = {};
  if (!Array.isArray(state.journal)) state.journal = [];
  if (Array.isArray(state.journal)) {
    for (let ji = 0; ji < state.journal.length; ji++) {
      const jr = state.journal[ji];
      if (!jr) continue;
      const lab = String(jr.dur || "").toLowerCase().replace(/\s+/g, "");
      const ms = Number(jr.durMs) || 0;
      if (!/^(5s|10s|15s|30s|1m|2m|3m|5m|10m|15m|30m|1h)$/.test(lab) || ms > 900000 || ms < 5000 || /:/.test(lab) || /^\d{3,}s$/.test(lab)) {
        jr.dur = "1m";
        jr.durMs = 60000;
      }
    }
  }
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

  const bootAt = Date.now();
  let lastClickAt = 0;
  let clickLock = false;
  let staleBusyCleared = false;
  let durationEnsuredOnce = false;
  let scanning = false;
  try {
    if (state.lastReason && /trade open|cooldown|wait \d+\s*s/i.test(String(state.lastReason))) {
      state.lastReason = "";
    }
  } catch (_eR0) {}
  let browseIndex = 0;
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function priceRange(pairLabel) {
    const p = pairLabel || "";
    let r = CONFIG.ranges[p];
    if (!r) {
      const k = fxPairKey(p);
      if (k) {
        const keys = Object.keys(CONFIG.ranges);
        for (let i = 0; i < keys.length; i++) {
          if (fxPairKey(keys[i]) === k) { r = CONFIG.ranges[keys[i]]; break; }
        }
      }
    }
    if (r) return { lo: r[0], hi: r[1] };
    if (/JPY/i.test(p)) return { lo: 90, hi: 260 };
    if (/COP|BRL|ARS|CLP|INR|IDR|KRW|NGN|DZD|EGP|VND|PKR|TRY|MXN|ZAR|PHP|THB|MYR|BDT|LKR|NPR/i.test(p)) {
      return { lo: 1, hi: 100000 };
    }
    return { lo: 0.05, hi: 20 };
  }

  function scrapeQuoteCandidates(pairLabel) {
    const hud = document.getElementById("quotexbot-hud");
    const found = [];
    const seen = {};
    const range = pairLabel ? priceRange(pairLabel) : null;
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
      if (r.left > wide * 0.62 && !(range && v >= range.lo && v <= range.hi)) return;
      let font = 12;
      try { font = parseFloat(window.getComputedStyle(el).fontSize || "12"); } catch (_e2) {}
      found.push({ v: v, font: font, area: r.width * r.height, y: r.top, x: r.left, decimals: decimals });
    }
    const re = /(\d{1,6}(?:\.\d{2,6}))/g;
    const nodes = document.querySelectorAll("span, div, b, strong, p, label, em, h1, h2, h3, td, li");
    const nAll = nodes.length;
    const start = nAll > SCAN_MAX ? nAll - SCAN_MAX : 0;
    for (let i = start; i < nAll; i++) {
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
        const mm = t.match(/\d{1,6}\.\d{2,6}/);
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

  function collectAxisNodes(root, nodes) {
    try {
      const view = (root && root.defaultView) || (root && root.ownerDocument && root.ownerDocument.defaultView) || window;
      const wide = (view && view.innerWidth) || window.innerWidth || 1200;
      const leftMin = wide * 0.45;
      const list = root.querySelectorAll("span, div, b, strong, label, em, p, text, tspan");
      const scored = [];
      const pxRe = /^\d{1,6}\.\d{2,6}$/;
      for (let i = list.length - 1; i >= 0; i--) {
        const el = list[i];
        let raw = "";
        try {
          if (el.childElementCount > 2) continue;
          raw = (el.textContent || "").replace(/[\s\u00a0\u202f]/g, "").replace(/,/g, "");
        } catch (_eT) { continue; }
        if (!raw || raw.length > 16 || !pxRe.test(raw)) continue;
        let r;
        try { r = el.getBoundingClientRect(); } catch (_e1) { continue; }
        if (!r || r.width < 4 || r.height < 4) continue;
        if (r.left < leftMin) continue;
        scored.push({ el: el, x: r.left });
        if (scored.length >= SCAN_MAX) break;
      }
      scored.sort(function (a, b) { return b.x - a.x; });
      const room = SCAN_MAX - nodes.length;
      const nKeep = Math.min(scored.length, room > 0 ? room : 0);
      for (let j = 0; j < nKeep; j++) nodes.push(scored[j].el);
    } catch (_e0) {}
  }

  function collectRightShadowRoots(root) {
    const out = [];
    const seen = [];
    function addShadow(el) {
      if (!el || !el.shadowRoot) return;
      if (out.length >= 15) return;
      if (seen.indexOf(el.shadowRoot) >= 0) return;
      seen.push(el.shadowRoot);
      out.push(el.shadowRoot);
    }
    try {
      const view = (root && root.defaultView) || (root && root.ownerDocument && root.ownerDocument.defaultView) || window;
      const wide = (view && view.innerWidth) || window.innerWidth || 1200;
      const high = (view && view.innerHeight) || window.innerHeight || 800;
      const xMin = wide * 0.60;
      const hud = document.getElementById("quotexbot-hud");
      const dashEl = document.getElementById("quotexbot-dash");
      const list = root.querySelectorAll("div, section, article, aside");
      const large = [];
      let rects = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        if (large.length >= 40) break;
        if (++rects > 400) break;
        const el = list[i];
        if (hud && (el === hud || hud.contains(el))) continue;
        if (dashEl && (el === dashEl || dashEl.contains(el))) continue;
        let r;
        try { r = el.getBoundingClientRect(); } catch (_e1) { continue; }
        if (!r || r.width < 80 || r.height < 80) continue;
        if (r.right < xMin) continue;
        if (r.bottom < 0 || r.top > high || r.right < 0 || r.left > wide) continue;
        large.push(el);
      }
      for (let j = 0; j < large.length && out.length < 15; j++) {
        const el = large[j];
        addShadow(el);
        try {
          const kids = el.children;
          for (let k = 0; k < kids.length && out.length < 15; k++) {
            addShadow(kids[k]);
            try {
              const gk = kids[k].children;
              for (let g = 0; g < gk.length && out.length < 15; g++) addShadow(gk[g]);
            } catch (_e3) {}
          }
        } catch (_e2) {}
      }
    } catch (_e) {}
    return out;
  }

  function largeSameOriginChartDocs() {
    const docs = [];
    try {
      const list = document.querySelectorAll("iframe");
      for (let i = 0; i < list.length && docs.length < 2; i++) {
        const fr = list[i];
        let w = 0, h = 0;
        try {
          const r = fr.getBoundingClientRect();
          w = r.width || 0;
          h = r.height || 0;
        } catch (_e1) {}
        if (w < 400 || h < 300) continue;
        try {
          const doc = fr.contentDocument;
          if (doc && doc !== document) docs.push(doc);
        } catch (_e2) {}
      }
    } catch (_e) {}
    return docs;
  }

  function readAxisLivePrice() {
    const hud = document.getElementById("quotexbot-hud");
    const dashEl = document.getElementById("quotexbot-dash");
    const hits = [];
    function skipHudDash(el) {
      try {
        if (hud && (el === hud || hud.contains(el))) return true;
        if (dashEl && (el === dashEl || dashEl.contains(el))) return true;
        const doc = el.ownerDocument;
        if (doc && doc !== document) {
          const h2 = doc.getElementById("quotexbot-hud");
          if (h2 && (el === h2 || h2.contains(el))) return true;
          const d2 = doc.getElementById("quotexbot-dash");
          if (d2 && (el === d2 || d2.contains(el))) return true;
        }
      } catch (_e) {}
      return false;
    }
    function scanDoc(root) {
      const view = (root && root.defaultView) || (root && root.ownerDocument && root.ownerDocument.defaultView) || window;
      const wide = (view && view.innerWidth) || window.innerWidth || 1200;
      const high = (view && view.innerHeight) || window.innerHeight || 800;
      const leftMin = wide * (CONFIG.axisRightFrac || 0.50);
      const leftMax = wide * 0.995;
      const nodes = [];
      collectAxisNodes(root, nodes);
      try {
        const shadows = collectRightShadowRoots(root);
        for (let s = 0; s < shadows.length; s++) collectAxisNodes(shadows[s], nodes);
      } catch (_eSh) {}
      const canvases = [];
      try {
        const cans = root.querySelectorAll("canvas");
        for (let c = 0; c < cans.length && c < 8; c++) {
          try { canvases.push(cans[c].getBoundingClientRect()); } catch (_ec) {}
        }
      } catch (_eC) {}
      const nScan = Math.min(nodes.length, SCAN_MAX);
      for (let i = 0; i < nScan; i++) {
        const el = nodes[i];
        if (skipHudDash(el)) continue;
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
        if (!r || r.left < leftMin || r.left > leftMax || r.width < 4 || r.height < 4) continue;
        if (r.top < 70 || r.top > high * 0.92) continue;
        let font = 12;
        let bg = "";
        try {
          const cs = view.getComputedStyle(el);
          font = parseFloat(cs.fontSize || "12");
          bg = cs.backgroundColor || "";
        } catch (_e3) {}
        const hasBg = !!(bg && bg !== "transparent" && bg.indexOf("rgba(0, 0, 0, 0)") < 0 && bg !== "rgba(0,0,0,0)");
        let nearBell = false;
        let nearCanvas = false;
        try {
          const p = el.parentElement;
          nearBell = !!(p && (p.querySelector("svg") || p.querySelector("button") || el.previousElementSibling));
        } catch (_e4) {}
        try {
          for (let c = 0; c < canvases.length; c++) {
            const cr = canvases[c];
            if (cr.width < 80 || cr.height < 80) continue;
            const midY = r.top + r.height / 2;
            if (midY >= cr.top - 24 && midY <= cr.bottom + 24 && r.left >= cr.left + cr.width * 0.45 && r.left <= cr.right + 90) {
              nearCanvas = true;
              break;
            }
          }
          if (!nearCanvas) {
            const p = el.parentElement;
            if (p && p.querySelector("canvas")) nearCanvas = true;
          }
        } catch (_e5) {}
        hits.push({ v: v, font: font, y: r.top, x: r.left, nearBell: nearBell, nearCanvas: nearCanvas, hasBg: hasBg, decimals: (m[1].split(".")[1] || "").length, el: el });
      }
    }
    forEachRoot(function (root) { scanDoc(root); });
    if (!hits.length) {
      const extra = largeSameOriginChartDocs();
      for (let f = 0; f < extra.length; f++) scanDoc(extra[f]);
    }
    lastAxisScanN = hits.length;
    if (!hits.length) return null;
    const midY = (window.innerHeight || 800) * 0.45;
    hits.sort(function (a, b) {
      const da = Math.abs(a.y - midY);
      const db = Math.abs(b.y - midY);
      return (b.nearCanvas - a.nearCanvas) || (b.nearBell - a.nearBell) || (da - db) || (b.x - a.x) || (b.font - a.font);
    });
    return hits[0];
  }

  function parsePriceNowNumber(raw) {
    const str = String(raw || "");
    if (!str) return null;
    const re = /(\d{1,6}\.\d{2,6})/g;
    let m;
    while ((m = re.exec(str))) {
      const i = m.index, e = i + m[1].length;
      const before = str.slice(Math.max(0, i - 3), i);
      const after = str.slice(e, e + 4);
      if (/[%$€]/.test(after) || /[%$€+]/.test(before)) continue;
      if (/[+\-]/.test(str.charAt(i - 1) || "")) continue;
      if (/^\.\d/.test(after)) continue;
      if (/^\s*min\b/i.test(after)) continue;
      const v = parseFloat(m[1]);
      if (isFinite(v) && v >= 0.4 && v < 1000000) return v;
    }
    return null;
  }

  function nodeText(el) {
    try { return String(el.innerText || el.textContent || ""); } catch (_e) { return ""; }
  }

  function isVisibleNode(el) {
    try {
      const r = el.getBoundingClientRect();
      if (!r || r.width < 2 || r.height < 2) return false;
      const wide = window.innerWidth || 1200, high = window.innerHeight || 800;
      if (r.bottom < 0 || r.right < 0 || r.top > high || r.left > wide) return false;
      return true;
    } catch (_e) { return false; }
  }

  function nearbyHas(el, re, levels) {
    let cur = el;
    for (let d = 0; d <= levels && cur; d++) {
      if (d > 0) {
        const t = nodeText(cur);
        if (t && t.length < 240 && re.test(t)) return true;
      }
      try {
        const p = cur.parentElement;
        let s = p && p.firstElementChild;
        while (s) {
          if (s !== cur) {
            const t = nodeText(s);
            if (t && t.length < 80 && re.test(t)) return true;
          }
          s = s.nextElementSibling;
        }
      } catch (_e) {}
      cur = cur.parentElement;
    }
    return false;
  }

  /* PAIR INFORMATION modal: "Price Now" 129.744 sits in the center, not on the right axis. */
  function readPriceNow() {
    const hud = document.getElementById("quotexbot-hud");
    const dashEl = document.getElementById("quotexbot-dash");
    const strongRe = /price\s*now|current\s*price|цена/i;
    const looseRe = /price/i;
    const exactRe = /^(\d{1,6}\.\d{2,6})$/;
    const nodes = [];
    forEachRoot(function (root) {
      try {
        const list = root.querySelectorAll("span, div, b, strong, label, em, p, td, li, h1, h2, h3, h4");
        for (let i = 0; i < list.length && nodes.length < SCAN_MAX; i++) nodes.push(list[i]);
      } catch (_e0) {}
    });
    const nScan = Math.min(nodes.length, SCAN_MAX);
    for (let i = 0; i < nScan; i++) {
      const el = nodes[i];
      if (hud && (el === hud || hud.contains(el))) continue;
      if (dashEl && (el === dashEl || dashEl.contains(el))) continue;
      if (!isVisibleNode(el)) continue;
      const rawT = nodeText(el);
      if (!rawT) continue;
      if (/\b\d{1,2}\s*min\b/i.test(rawT) && !strongRe.test(rawT) && rawT.length < 24) continue;
      const strongHere = strongRe.test(rawT);
      const strongNear = !strongHere && nearbyHas(el, strongRe, 1);
      if (strongHere || strongNear) {
        let v = parsePriceNowNumber(rawT);
        if (v == null && strongHere) {
          try {
            if (el.nextElementSibling) v = parsePriceNowNumber(nodeText(el.nextElementSibling));
            if (v == null && el.previousElementSibling) v = parsePriceNowNumber(nodeText(el.previousElementSibling));
            if (v == null && el.parentElement) v = parsePriceNowNumber(nodeText(el.parentElement));
          } catch (_e1) {}
        }
        if (v != null) return { v: v, el: el };
        continue;
      }
      const stripped = rawT.replace(/[\s\u00a0\u202f]/g, "").replace(/,/g, "");
      if (stripped.length <= 16 && exactRe.test(stripped) && nearbyHas(el, looseRe, 2)) {
        const v = parseFloat(stripped);
        if (isFinite(v) && v >= 0.4 && v < 1000000) return { v: v, el: el };
      }
    }
    return null;
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

  let lastGoodPxAt = 0;
  function fxPairKey(label) {
    return String(label || "").replace(/\(\s*OTC\s*\)/gi, "").replace(/\s+/g, "").toUpperCase();
  }
  function resetLivePrice(reason) {
    state.lastGoodPx = null;
    lastGoodPxAt = 0;
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
    const sameFx = fxPairKey(old) === fxPairKey(newLabel) && fxPairKey(newLabel) !== "";
    lastSeenPair = newLabel;
    state.lastPair = newLabel;
    /* Same FX pair with (OTC)/whitespace flicker — keep lastGoodPx. */
    if (sameFx) return;
    resetLivePrice("পেয়ার বদল: " + old + " → " + newLabel + ", দাম রিসেট");
  }

  function readLivePrice(pairLabel, diag) {
    onPairChange(pairLabel);
    const range = priceRange(pairLabel);
    const axis = readAxisLivePrice();
    const all = scrapeQuoteCandidates(pairLabel);
    if (diag) {
      diag.axis = lastAxisScanN;
      diag.cand = all.length;
    }
    function quoteDecimals(v, text) {
      if (text) {
        const m = String(text).replace(/,/g, ".").match(/\d{1,6}\.(\d{1,6})/);
        if (m) return m[1].length;
      }
      const t = String(v);
      const i = t.indexOf(".");
      return i < 0 ? 0 : t.length - i - 1;
    }
    function correctOcr(v, range, lastGood) {
      if (v == null || !isFinite(v)) return v;
      function inRange(x) { return x >= range.lo && x <= range.hi; }
      const tries = [v, v - 0.1, v + 0.1];
      if (lastGood != null) {
        let best = v, bestD = 1e9;
        for (let i = 0; i < tries.length; i++) {
          const t = tries[i];
          if (!inRange(t)) continue;
          const d = Math.abs(t - lastGood);
          if (d < bestD) { bestD = d; best = t; }
        }
        return best;
      }
      if (inRange(v)) return v;
      for (let i = 1; i < tries.length; i++) if (inRange(tries[i])) return tries[i];
      return v;
    }
    if (axis && axis.v != null) axis.v = correctOcr(axis.v, range, state.lastGoodPx);
    function ok(v, info) {
      if (v == null || !isFinite(v)) return false;
      if (v < range.lo || v > range.hi) return false;
      if (isPnlNumber(v)) return false;
      if (isFrozenQuote(v) && state.lastGoodPx != null && Math.abs(v - state.lastGoodPx) > 1e-9) return false;
      let text = null, dec = null;
      if (typeof info === "string") text = info;
      else if (info && typeof info === "object") {
        if (info.text) text = info.text;
        if (info.decimals != null) dec = info.decimals;
      }
      if (dec == null) dec = quoteDecimals(v, text);
      if (v < 2 && dec < 4) return false;
      if (state.lastGoodPx != null) {
        const rel = Math.abs(v - state.lastGoodPx) / Math.max(Math.abs(state.lastGoodPx), 1e-6);
        if (rel > 0.01) return false;
      }
      return true;
    }
    const axisOk = !!(axis && ok(axis.v, axis));
    const pn = axisOk ? null : readPriceNow();
    if (pn && pn.v != null) pn.v = correctOcr(pn.v, range, state.lastGoodPx);
    rememberQuotes([axis && axis.v, pn && pn.v].concat(all.map(function (c) { return c.v; })).filter(function (x) { return x != null; }));
    if (!axisOk && pn && ok(pn.v)) {
      state.lastGoodPx = pn.v;
      lastGoodPxAt = Date.now();
      return pn.v;
    }
    const cands = [];
    if (axisOk) cands.push({ v: axis.v, x: axis.x || 0, font: axis.font || 12, hasBg: axis.hasBg, nearBell: axis.nearBell, y: axis.y || 0, axis: 1 });
    for (let i = 0; i < all.length; i++) {
      if (ok(all[i].v, all[i])) cands.push({ v: all[i].v, x: all[i].x || 0, font: all[i].font || 12, hasBg: 0, nearBell: 0, y: all[i].y || 0, axis: 0 });
    }
    if (!cands.length) {
      if (state.lastGoodPx != null && lastGoodPxAt && (Date.now() - lastGoodPxAt) < 15000) {
        return state.lastGoodPx;
      }
      return null;
    }
    let axisCand = null;
    for (let i = 0; i < cands.length; i++) {
      if (cands[i].axis) { axisCand = cands[i]; break; }
    }
    if (lastSeenPair === pairLabel && state.lastGoodPx != null) {
      const near = cands.filter(function (c) {
        return Math.abs(c.v - state.lastGoodPx) / Math.max(state.lastGoodPx, 1e-6) < 0.025;
      });
      if (near.length) {
        near.sort(function (a, b) { return (b.axis - a.axis) || (b.hasBg - a.hasBg) || (b.nearBell - a.nearBell); });
        state.lastGoodPx = near[0].v;
        lastGoodPxAt = Date.now();
        return near[0].v;
      }
    }
    cands.sort(function (a, b) {
      return (b.axis - a.axis) || (b.hasBg - a.hasBg) || (b.nearBell - a.nearBell) || (b.x - a.x);
    });
    state.lastGoodPx = cands[0].v;
    lastGoodPxAt = Date.now();
    return cands[0].v;
  }

  function peekQuotes(pairLabel) {
    const range = priceRange(pairLabel);
    const all = scrapeQuoteCandidates(pairLabel);
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

  function inLeftoverTooltip(el) {
    if (!el) return false;
    let cur = el;
    for (let d = 0; d < 6 && cur && cur !== document.body && cur !== document.documentElement; d++) {
      try {
        const role = (cur.getAttribute && (cur.getAttribute("role") || "")) || "";
        if (/tooltip/i.test(role)) return true;
        const cls = String(cur.className || "") + " " + String(cur.id || "");
        if (/\b(tooltip|tippy|popper|popover|hint|float-label|chart-tooltip)\b/i.test(cls)) return true;
      } catch (_e) {}
      cur = cur.parentElement;
    }
    return false;
  }

  function inTradesHistory(el) {
    if (!el) return false;
    const hud = document.getElementById("quotexbot-hud");
    const dashEl = document.getElementById("quotexbot-dash");
    if (hud && (el === hud || hud.contains(el))) return false;
    if (dashEl && (el === dashEl || dashEl.contains(el))) return false;
    const wide = window.innerWidth || 1200;
    const high = window.innerHeight || 800;
    const headRe = /\b(trades|trade history|opened|closed|history|deals)\b/i;
    const clsRe = /\b(trades?|deals?|history|orders?|positions?)\b/i;
    let cur = el;
    for (let d = 0; d < 8 && cur && cur !== document.body && cur !== document.documentElement; d++) {
      try {
        const cls = String(cur.className || "") + " " + String(cur.id || "");
        let t = "";
        try { t = String(cur.innerText || "").replace(/\s+/g, " ").trim(); } catch (_eT) { t = ""; }
        let r = null;
        try { r = cur.getBoundingClientRect(); } catch (_eR) {}
        if (r && r.width >= 80 && r.height >= 70 && r.height <= high * 0.72 && r.width <= wide * 0.5) {
          const pairs = t.match(/\b[A-Za-z]{3}\s*\/\s*[A-Za-z]{3}\b/g);
          const nPairs = pairs ? pairs.length : 0;
          if (nPairs >= 2) return true;
          if (headRe.test(t.slice(0, 220)) && nPairs >= 1) return true;
          if (clsRe.test(cls) && (r.left < wide * 0.4 || r.top > high * 0.55) && nPairs >= 1) return true;
        }
      } catch (_e0) {}
      cur = cur.parentElement;
    }
    return false;
  }

  function pairChipText(t) {
    const s = String(t || "");
    if (!/[A-Za-z]{3}\s*\/\s*[A-Za-z]{3}/.test(s)) return false;
    if (/[+$]|\$\s*\d|\d+\.\d+\s*\$|[+\u2212\-]\s*\$?\d/.test(s)) return true;
    if (/\b(win|loss|won|lost|profit|payout|closed)\b/i.test(s)) return true;
    if (/\b(call|put)\b/i.test(s) && /\$|\d/.test(s)) return true;
    return false;
  }

  function colorLooksGreenCss(c) {
    const m = String(c || "").match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!m) return false;
    const r = +m[1], g = +m[2], b = +m[3];
    return g >= 110 && g > r + 20 && g > b;
  }
  function tabLooksSelected(el) {
    let cur = el;
    for (let d = 0; d < 6 && cur && cur.nodeType === 1; d++) {
      try {
        if (cur.getAttribute) {
          const ariaSel = cur.getAttribute("aria-selected");
          const ariaCur = cur.getAttribute("aria-current");
          if (ariaSel === "true" || ariaCur === "true" || ariaCur === "page") return true;
          const ds = cur.getAttribute("data-selected") || cur.getAttribute("data-active") || "";
          if (ds === "true" || ds === "1") return true;
        }
        const cls = String(cur.className || "");
        if (/\b(active|selected|current|is-active|is-current|is-selected|tab-active|tab--active|isActive|isSelected)\b/i.test(cls)) return true;
        try {
          const cs = window.getComputedStyle(cur);
          if (cs) {
            const bw = parseFloat(cs.borderBottomWidth || "0") || 0;
            if (bw >= 1.5 && colorLooksGreenCss(cs.borderBottomColor || "")) return true;
            const bs = String(cs.boxShadow || "");
            if (bs && bs !== "none" && colorLooksGreenCss(bs)) return true;
            const td = String(cs.textDecorationLine || cs.textDecoration || "");
            if (/underline/i.test(td) && colorLooksGreenCss(cs.textDecorationColor || cs.color || "")) return true;
          }
        } catch (_eCs) {}
        try {
          const kids = cur.children;
          if (kids) {
            for (let k = 0; k < kids.length && k < 8; k++) {
              let kr = null, kcs = null;
              try { kr = kids[k].getBoundingClientRect(); kcs = window.getComputedStyle(kids[k]); } catch (_eK2) { continue; }
              if (!kr || !kcs) continue;
              if (kr.height <= 6 && kr.width >= 16 && colorLooksGreenCss(kcs.backgroundColor || kcs.borderBottomColor || "")) return true;
            }
          }
        } catch (_eK) {}
      } catch (_e) {}
      cur = cur.parentElement;
    }
    return false;
  }

  /* Open chart pair only: RIGHT trade panel, or the SELECTED header tab.
     Header band is the tab strip of ALL open charts — never pick a
     non-selected sibling (leftmost AUD/NZD while USD/DZD is active). */
  function visiblePair() {
    const hud = document.getElementById("quotexbot-hud");
    const dashEl = document.getElementById("quotexbot-dash");
    const wide = window.innerWidth || 1200;
    const high = window.innerHeight || 800;
    const titleRe = /^[A-Z]{3}\s*\/\s*[A-Z]{3}(?:\s*\(?\s*OTC\s*\)?)?$/i;
    const header = [];
    const right = [];
    const locked = lastSeenPair;
    const nodes = document.querySelectorAll("button, span, div, a, h1, h2, h3, b, strong, p, label");
    const nMax = Math.min(nodes.length, SCAN_MAX * 2);
    for (let n = 0; n < nMax; n++) {
      const el = nodes[n];
      if (hud && (el === hud || hud.contains(el))) continue;
      if (dashEl && (el === dashEl || dashEl.contains(el))) continue;
      if (inTradesHistory(el) || inLeftoverTooltip(el)) continue;
      let t = "";
      try { t = (el.innerText || "").replace(/\s+/g, " ").trim(); } catch (_e) { continue; }
      if (!t || t.length > 48) continue;
      if (t.indexOf("/") < 0 && t.toUpperCase().indexOf("OTC") < 0) continue;
      if (pairChipText(t)) continue;
      const tClean = t.replace(/[▼▲▾▴⌄^]/g, "").replace(/\s+/g, " ").trim();
      const lab = labelFromText(tClean);
      if (!lab) continue;
      let r;
      try { r = el.getBoundingClientRect(); } catch (_e2) { continue; }
      if (!r || r.width < 4 || r.height < 4) continue;
      if (r.top < 0 || r.left < 0 || r.top > high || r.left > wide) continue;
      let font = 12;
      try { font = parseFloat(window.getComputedStyle(el).fontSize || "12"); } catch (_e3) {}
      const exact = titleRe.test(tClean);
      let extra = 0;
      let sel = false;
      try { sel = tabLooksSelected(el); } catch (_eS) { sel = false; }
      if (sel) extra += 400;
      if (exact) extra += 260;
      if (/OTC/i.test(tClean)) extra += 50;
      if (tClean.length < 18) extra += 40;
      const score = font * 8 - r.top + extra;
      const inHeaderBand = r.top < 140 && r.left > 8 && r.left < wide * 0.62 && r.height < 64;
      const inRightPanel = r.left > wide * 0.55 && r.top > 8 && r.top < high * 0.72;
      const inChartBody = r.top >= 140 && r.left < wide * 0.52 && r.left > 8 && !inRightPanel;
      if (inChartBody) continue;
      if (inHeaderBand) header.push({ lab: lab, score: score + 500, r: r, exact: exact, sel: sel });
      else if (inRightPanel) right.push({ lab: lab, score: score + 180, r: r, exact: exact, sel: sel });
    }
    function pick(list) {
      let best = null, bestScore = -1e9;
      for (let i = 0; i < list.length; i++) {
        if (list[i].score > bestScore) { bestScore = list[i].score; best = list[i]; }
      }
      return best;
    }
    function titleRowOf(list) {
      if (!list.length) return [];
      let top = 1e9;
      for (let i = 0; i < list.length; i++) {
        if (list[i].r.top < top) top = list[i].r.top;
      }
      const row = [];
      for (let i = 0; i < list.length; i++) {
        if (Math.abs(list[i].r.top - top) <= 42) row.push(list[i]);
      }
      return row;
    }
    const titleRow = titleRowOf(header);
    const selHeader = [];
    for (let i = 0; i < header.length; i++) if (header[i].sel) selHeader.push(header[i]);
    const selTitle = [];
    for (let i = 0; i < titleRow.length; i++) if (titleRow[i].sel) selTitle.push(titleRow[i]);
    const bestRight = pick(right);
    const bestSelHeader = pick(selTitle) || pick(selHeader);
    /* Right trade-panel asset is the open chart. Do not use the tab strip. */
    if (bestRight) return bestRight.lab;
    if (bestSelHeader) return bestSelHeader.lab;
    /* Never pick a non-selected sibling tab (leftmost AUD/NZD, etc). */
    if (locked && bestSelHeader && fxPairKey(locked) !== fxPairKey(bestSelHeader.lab)) return bestSelHeader.lab;
    const snap = snapDoc();
    const fromSnap = labelFromText(snap && snap.asset);
    if (fromSnap) return fromSnap;
    if (locked) return locked;
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

  function barsFromYahoo(json) {
    const r = json && json.chart && json.chart.result && json.chart.result[0];
    if (!r) return [];
    const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
    const ts = r.timestamp || [];
    const out = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open && q.open[i], h = q.high && q.high[i], l = q.low && q.low[i], c = q.close && q.close[i];
      if ([o, h, l, c].some((x) => x == null || Number.isNaN(x))) continue;
      out.push({ t: ts[i], open: o, high: h, low: l, close: c });
    }
    return out;
  }

  function fetchYahoo(symbol) {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol) + "?interval=1m&range=1d";
    return new Promise((resolve, reject) => {
      const done = (fn, v) => fn(v);
      if (typeof GM_xmlhttpRequest === "function") {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          headers: { "User-Agent": "quotexbot/0.3" },
          onload: (res) => {
            try { resolve(JSON.parse(res.responseText)); }
            catch (e) { reject(e); }
          },
          onerror: reject,
        });
        return;
      }
      fetch(url).then((r) => r.json()).then(resolve).catch(reject);
    });
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
  let lastPreClickBal = null;
  let lastPreClickStake = null;
  let lastMmAppliedStake = null;
  function parseMoneyNum(t) {
    const n = parseFloat(String(t || "").replace(/,/g, "").replace(/[^\d.]/g, ""));
    return isFinite(n) ? n : null;
  }
  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }
  function colorLooksGreen(el) {
    try {
      const cs = window.getComputedStyle(el);
      return !!(cs && colorLooksGreenCss(cs.color || ""));
    } catch (_e) { return false; }
  }
  function readPlatformBalance() {
    try {
      const snap = snapDoc();
      if (snap && snap.balance) {
        const n = parseMoneyNum(snap.balance);
        if (n != null && n >= 1) return n;
      }
    } catch (_e0) {}
    const hud = document.getElementById("quotexbot-hud");
    const dashEl = document.getElementById("quotexbot-dash");
    let best = null;
    try {
      const nodes = document.querySelectorAll("span, div, b, strong, em");
      const nMax = Math.min(nodes.length, SCAN_MAX);
      for (let i = 0; i < nMax; i++) {
        const el = nodes[i];
        if (hud && (el === hud || hud.contains(el))) continue;
        if (dashEl && (el === dashEl || dashEl.contains(el))) continue;
        let r;
        try { r = el.getBoundingClientRect(); } catch (_e1) { continue; }
        if (!r || r.top > 90 || r.height > 60 || r.width < 20) continue;
        let t = "";
        try { t = (el.innerText || "").replace(/\s+/g, " ").trim(); } catch (_e2) { continue; }
        if (!t || t.length > 28) continue;
        const m = t.match(/(\d{2,7}(?:\.\d{1,2})?)\s*\$|\$\s*(\d{2,7}(?:\.\d{1,2})?)/);
        if (!m) continue;
        const n = parseFloat(m[1] || m[2]);
        if (!isFinite(n) || n < 50) continue;
        if (best == null || n > best) best = n;
      }
    } catch (_e3) {}
    return best;
  }
  function readStakeAmount() {
    try {
      const snap = snapDoc();
      if (snap && snap.stake) {
        const n = parseMoneyNum(snap.stake);
        if (n != null && n > 0 && n < 500) return n;
      }
    } catch (_e0) {}
    try {
      if (scrape && typeof scrape.findLabeledInput === "function") {
        const el = scrape.findLabeledInput(document, /investment|amount|stake|инвест|сумма/i);
        if (el) {
          const v = (el.value != null ? el.value : "") || (el.textContent || "");
          const n = parseMoneyNum(v);
          if (n != null && n > 0 && n < 500) return n;
        }
      }
    } catch (_e1) {}
    return null;
  }
  function findInvestmentInput() {
    if (!scrape || typeof scrape.findLabeledInput !== "function") return null;
    return scrape.findLabeledInput(document, /investment|amount|stake|инвест|сумма|cantidad|valor|ইনভেস্ট|বিনিয়োগ/i);
  }
  function investmentLooksPercent(el) {
    if (!el) return false;
    let blob = "";
    try {
      let n = el;
      for (let i = 0; i < 5 && n; i++) {
        blob += " " + (typeof widgetText === "function" ? widgetText(n) : String(n.innerText || n.textContent || ""));
        n = n.parentElement;
      }
    } catch (_e) {}
    const raw = (el.value != null ? String(el.value) : "") || (el.textContent || "");
    const v = parseMoneyNum(raw);
    const hasPct = /%/.test(blob);
    const hasDollar = /\$/.test(blob);
    if (hasPct && !hasDollar) return true;
    if (hasPct && v != null && v > 0 && v <= 20 && /investment|amount|stake/i.test(blob)) return true;
    return false;
  }
  function clickSwitchInvestment() {
    const hud = document.getElementById("quotexbot-hud");
    const dashEl = document.getElementById("quotexbot-dash");
    const fromEl = findInvestmentInput();
    let panel = fromEl;
    for (let i = 0; i < 6 && panel && panel.parentElement; i++) {
      const t = typeof widgetText === "function" ? widgetText(panel) : "";
      if (t && t.length > 90) break;
      panel = panel.parentElement;
    }
    const nodes = [];
    function collect(root) {
      if (!root || !root.querySelectorAll) return;
      try {
        const list = root.querySelectorAll("button, [role='button'], a, span, div, label, p");
        for (let i = 0; i < list.length; i++) nodes.push(list[i]);
      } catch (_e) {}
    }
    if (panel) collect(panel);
    try {
      forEachRoot(function (root) { collect(root); });
    } catch (_e0) {}
    let best = null, bestScore = -1e9;
    const wide = window.innerWidth || 1200;
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (hud && (el === hud || (hud.contains && hud.contains(el)))) continue;
      if (dashEl && (el === dashEl || (dashEl.contains && dashEl.contains(el)))) continue;
      if (fromEl && el === fromEl) continue;
      const t = typeof widgetText === "function" ? widgetText(el) : String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      if (!t || t.length > 48) continue;
      if (/\bpending\s*trade\b/i.test(t) || /\bpending\b/i.test(t)) continue;
      if (/switch\s*time/i.test(t)) continue;
      if (/time|expiry|duration/i.test(t) && !/invest|amount|stake/i.test(t)) continue;
      let kind = 0;
      const compact = t.replace(/\s+/g, " ").trim();
      if (/^\$|USD/i.test(compact) && compact.length <= 8) kind = 4;
      else if (/switch/i.test(t) && /invest|amount|stake|percent|\$/i.test(t)) kind = 3;
      else if (/^switch$/i.test(compact)) kind = 2;
      else continue;
      let r;
      try { r = el.getBoundingClientRect(); } catch (_e1) { continue; }
      if (!r || r.width < 4 || r.height < 4) continue;
      const right = r.left > wide * 0.45 ? 50 : 0;
      const score = kind * 100 + right - r.top * 0.01;
      if (score > bestScore) { bestScore = score; best = el; }
    }
    if (!best) return false;
    try {
      if (typeof best.click === "function") best.click();
      else if (typeof realishClick === "function") realishClick(best);
    } catch (_e2) { return false; }
    log("Investment SWITCH → $");
    return true;
  }
  function setInvestmentField(dollars) {
    const str = String(Math.floor(Number(dollars) || 1));
    let el = null;
    try { el = findInvestmentInput(); } catch (_e0) { el = null; }
    if (!el) return false;
    try {
      if (scrape && typeof scrape.setControlValue === "function") scrape.setControlValue(el, str);
      else {
        el.value = str;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } catch (_e1) { return false; }
    const got = parseMoneyNum((el.value != null ? String(el.value) : "") || (el.textContent || ""));
    return got != null && Math.abs(got - Number(str)) < 0.51;
  }
  function mmLossStreak() {
    const j = state.journal || [];
    let n = 0;
    for (let i = j.length - 1; i >= 0; i--) {
      const r = j[i];
      if (!r || !r.ok) continue;
      if (!r.result) continue;
      if (r.result === "win") break;
      if (r.result === "loss") n += 1;
      else break;
    }
    return n;
  }
  function computeMmStake() {
    const need = Number(CONFIG.mmReduceAfterLosses) || 2;
    const reduced = mmLossStreak() >= need;
    const pct = reduced ? (Number(CONFIG.mmReducePct) || 0.005) : (Number(CONFIG.mmPct) || 0.01);
    const pctLabel = reduced ? "0.5%" : "1%";
    let bal = null;
    try { bal = readPlatformBalance(); } catch (_e) { bal = null; }
    const minS = Math.max(1, Math.floor(Number(CONFIG.mmMin) || 1));
    const maxS = Math.max(minS, Math.floor(Number(CONFIG.mmMax) || 200));
    const capPct = Number(CONFIG.mmCapPct) || 0.02;
    if (bal == null || !isFinite(bal) || bal < 1) {
      let kept = Math.floor(Number(state.lastMmStake) || 0);
      if (kept < minS) kept = minS;
      if (kept > maxS) kept = maxS;
      return { stake: kept, pctLabel: pctLabel, bal: null, unread: true, reduced: reduced };
    }
    let s = Math.floor(bal * pct);
    const cap2 = Math.floor(bal * capPct);
    if (s > maxS) s = maxS;
    if (s > cap2) s = cap2;
    if (s < minS) s = minS;
    if (reduced) {
      const prev = Math.floor(Number(state.lastMmStake) || 0);
      if (prev >= minS && s > prev) s = prev;
    }
    return { stake: s, pctLabel: pctLabel, bal: bal, unread: false, reduced: reduced };
  }
  function mmHudText() {
    const mm = computeMmStake();
    return "$" + mm.stake + " · " + mm.pctLabel;
  }
  async function ensureDollarInvestment() {
    let el = null;
    try { el = findInvestmentInput(); } catch (_e0) {}
    if (!investmentLooksPercent(el)) return;
    const switched = clickSwitchInvestment();
    if (switched) await sleep(300);
  }
  async function applyMoneyManagement() {
    const mm = computeMmStake();
    let pctMode = false;
    try { pctMode = investmentLooksPercent(findInvestmentInput()); } catch (_e0) { pctMode = false; }
    if (pctMode) {
      try { await ensureDollarInvestment(); } catch (_e1) {}
      try { pctMode = investmentLooksPercent(findInvestmentInput()); } catch (_e2) {}
    }
    if (pctMode) {
      log("MM stake $" + mm.stake + " skipped set — Investment still %");
      lastMmAppliedStake = null;
    } else {
      try { setInvestmentField(mm.stake); } catch (_e3) {}
      lastMmAppliedStake = mm.stake;
    }
    state.lastMmStake = mm.stake;
    state.lastMmPct = mm.pctLabel;
    if (mm.unread) {
      log("MM stake $" + mm.stake + " (balance unread, kept last)");
    } else {
      log("MM stake $" + mm.stake + " (" + mm.pctLabel + " of " + String(Math.floor(mm.bal)) + ")");
    }
  }
  function capturePreClickMoney() {
    try { lastPreClickBal = readPlatformBalance(); } catch (_e0) { lastPreClickBal = null; }
    try { lastPreClickStake = readStakeAmount(); } catch (_e1) { lastPreClickStake = null; }
  }
  function parsePnlText(t, opts) {
    const s = String(t || "").replace(/\s+/g, "");
    if (!s) return null;
    if (/^0+(?:\.0+)?\$?$/.test(s) || s === "0.00$" || s === "$0.00" || s === "+0.00$" || s === "+0$" || s === "0$") return { win: false, pnl: 0 };
    const m = s.match(/^([+\-\u2212])?\$?(\d+(?:\.\d+)?)\$?$/);
    if (!m) return null;
    const n = parseFloat(m[2]);
    if (!isFinite(n)) return null;
    if (n < 0.001) return { win: false, pnl: 0 };
    if (m[1] === "-" || m[1] === "\u2212") return { win: false, pnl: -n };
    if (m[1] === "+") return { win: true, pnl: n };
    if (opts && opts.green) return { win: true, pnl: n };
    return null;
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
      const green = colorLooksGreen(el);
      const got = parsePnlText(t, { green: green });
      if (!got) continue;
      found.push({ y: r.top, win: got.win, pnl: got.pnl, t: t, green: green });
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
  function countPnlKinds(snips) {
    let zero = 0, win = 0;
    const list = snips || [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].win) win += 1;
      else if (Math.abs(Number(list[i].pnl) || 0) < 0.001) zero += 1;
    }
    return { zero: zero, win: win };
  }
  function dirFromText(t) {
    const s = String(t || "");
    if (/\b(call|up|higher|buy)\b/i.test(s)) return "CALL";
    if (/\b(put|down|lower|sell)\b/i.test(s)) return "PUT";
    return "";
  }
  function listTradeRows() {
    const hud = document.getElementById("quotexbot-hud");
    const dashEl = document.getElementById("quotexbot-dash");
    const wide = window.innerWidth || 1200;
    const found = [];
    const nodes = document.querySelectorAll("div, li, tr, article");
    const nMax = Math.min(nodes.length, SCAN_MAX * 3);
    for (let i = 0; i < nMax; i++) {
      const el = nodes[i];
      if (hud && (el === hud || hud.contains(el))) continue;
      if (dashEl && (el === dashEl || dashEl.contains(el))) continue;
      let r;
      try { r = el.getBoundingClientRect(); } catch (_e) { continue; }
      if (!r || r.width < 90 || r.height < 22 || r.height > 220) continue;
      const rightish = r.left >= wide * 0.45;
      let hist = false;
      try { hist = inTradesHistory(el); } catch (_eH) { hist = false; }
      if (!rightish && !hist) continue;
      let t = "";
      try { t = (el.innerText || "").replace(/\s+/g, " ").trim(); } catch (_e2) { continue; }
      if (!t || t.length < 8 || t.length > 240) continue;
      const pairs = t.match(/\b[A-Za-z]{3}\s*\/\s*[A-Za-z]{3}\b/g);
      if (!pairs || pairs.length !== 1) continue;
      const pm = pairs[0].match(/([A-Za-z]{3})\s*\/\s*([A-Za-z]{3})/);
      const pair = pm[1].toUpperCase() + "/" + pm[2].toUpperCase();
      const dir = dirFromText(t);
      let hasCd = false;
      let cdSec = null;
      const cd = t.match(/\b(\d{1,2}):(\d{2})\b/);
      if (cd) {
        const mm = parseInt(cd[1], 10), ss = parseInt(cd[2], 10);
        if (isFinite(mm) && isFinite(ss) && ss <= 59 && mm < 15 && (mm * 60 + ss) > 0) {
          hasCd = true;
          cdSec = mm * 60 + ss;
        }
      }
      const open = hasCd || /\b(open|pending)\b/i.test(t);
      let stake = 0, payout = 0, chip = null;
      const re = /([+\-\u2212])\s*\$?\s*(\d+(?:\.\d{1,2})?)\s*\$?|\$\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*\$/g;
      let m;
      while ((m = re.exec(t))) {
        const sign = m[1] || "";
        const n = parseFloat(m[2] || m[3] || m[4]);
        if (!isFinite(n)) continue;
        if (sign === "+" && n > 0) {
          if (!chip || !chip.win) chip = { win: true, pnl: n };
          if (n > payout) payout = n;
        } else if ((sign === "-" || sign === "\u2212") && n > 0) {
          if (!chip) chip = { win: false, pnl: -n };
        } else if (n < 0.005) {
          if (!chip) chip = { win: false, pnl: 0 };
        } else if (n > 0 && n < 500 && !stake) {
          stake = n;
        }
      }
      if (/\b(win|won|profit)\b/i.test(t) && (!chip || !chip.win)) {
        chip = { win: true, pnl: payout || (chip && chip.pnl) || 0 };
      }
      if (/\b(loss|lost|lose)\b/i.test(t) && !chip) chip = { win: false, pnl: 0 };
      let green = false;
      try { green = colorLooksGreen(el); } catch (_g) {}
      if (green && payout > 0 && (!chip || !chip.win)) chip = { win: true, pnl: payout };
      const settled = !open && chip != null;
      found.push({
        y: r.top,
        pair: pair,
        dir: dir,
        stake: stake,
        payout: payout,
        win: !!(chip && chip.win) && !hasCd,
        pnl: chip ? chip.pnl : null,
        cdSec: cdSec,
        open: hasCd || (open && !(chip && chip.win)),
        settled: settled && !hasCd,
        t: t.slice(0, 120),
      });
    }
    found.sort(function (a, b) { return a.y - b.y; });
    const uniq = [];
    const seen = {};
    for (let i = 0; i < found.length; i++) {
      const f = found[i];
      const k = fxPairKey(f.pair) + ":" + f.dir + ":" + Math.round(f.y / 12) + ":" + (f.win ? "w" : f.open ? "o" : "l");
      if (seen[k]) continue;
      seen[k] = 1;
      uniq.push(f);
    }
    return uniq;
  }
  function journalDirOf(row) {
    return String((row && (row.pos || row.signal)) || "").toUpperCase().replace(/UP|HIGHER|BUY/g, "CALL").replace(/DOWN|LOWER|SELL/g, "PUT");
  }
  function rowMatchesJournal(tr, row) {
    if (!tr || !row) return false;
    const jp = fxPairKey(row.pair);
    const tp = fxPairKey(tr.pair);
    if (!jp || !tp || jp !== tp) return false;
    const jd = journalDirOf(row);
    if ((jd === "CALL" || jd === "PUT") && tr.dir && tr.dir !== jd) return false;
    const js = Number(row.stake) || 0;
    if (js > 0 && tr.stake > 0 && Math.abs(js - tr.stake) > 0.051) return false;
    return true;
  }
  function pickMatchingTrade(row, trades) {
    const hits = [];
    for (let i = 0; i < trades.length; i++) {
      if (rowMatchesJournal(trades[i], row)) hits.push(trades[i]);
    }
    if (!hits.length) return null;
    let older = 0;
    const j = state.journal || [];
    for (let i = 0; i < j.length; i++) {
      if (j[i] === row) break;
      const o = j[i];
      if (!(o && o.ok && o.result)) continue;
      if (fxPairKey(o.pair) !== fxPairKey(row.pair)) continue;
      if (journalDirOf(o) && journalDirOf(row) && journalDirOf(o) !== journalDirOf(row)) continue;
      const s0 = Number(o.stake) || 0, s1 = Number(row.stake) || 0;
      if (s0 && s1 && Math.abs(s0 - s1) > 0.06) continue;
      older += 1;
    }
    const unmatched = hits.slice(0, Math.max(0, hits.length - older));
    const pool = unmatched.length ? unmatched : [];
    const search = pool.length ? pool : [];
    let bestWin = null, bestSettled = null, bestOpen = null;
    for (let i = 0; i < search.length; i++) {
      const h = search[i];
      if (h.win && !bestWin) bestWin = h;
      else if (h.open && !bestOpen) bestOpen = h;
      else if (h.settled && !h.win && !bestSettled) bestSettled = h;
    }
    if (bestWin) return bestWin;
    if (bestOpen) return bestOpen;
    if (bestSettled) {
      if (/0\.00/.test(String(row.fp || "")) && unmatched.length === 0) return bestOpen || null;
      return bestSettled;
    }
    return null;
  }
  function profitFrom(row, src) {
    const stake = Number(row && row.stake) || 0;
    const pre = Number(row && row.bal);
    let balNow = null;
    try { balNow = readPlatformBalance(); } catch (_e) {}
    if (isFinite(pre) && balNow != null && balNow - pre > 0.04) return round2(balNow - pre);
    const payout = src && (src.payout != null ? Number(src.payout) : (src.win && Number(src.pnl) > 0 ? Number(src.pnl) : 0));
    if (payout > 0 && stake > 0 && payout > stake + 0.02) return round2(payout - stake);
    if (src && src.win && Number(src.pnl) > 0) {
      const p = Number(src.pnl);
      if (stake > 0 && p > stake + 0.02) return round2(p - stake);
      return round2(p);
    }
    return 0;
  }
  function journalMoneyFields() {
    const out = {
      bal: lastPreClickBal,
      stake: lastPreClickStake,
      zeroN: 0,
      winN: 0,
    };
    try {
      const k = countPnlKinds(listPnlSnippets());
      out.zeroN = k.zero;
      out.winN = k.win;
    } catch (_e) {}
    if (out.bal == null) {
      try { out.bal = readPlatformBalance(); } catch (_b) {}
    }
    if (out.stake == null) {
      try { out.stake = readStakeAmount(); } catch (_s) {}
    }
    return out;
  }
  function applyJournalResult(row, result, pnl, force) {
    if (!row) return false;
    if (row.result === "win") return false;
    if (row.result === "loss") {
      if (result !== "win") return false;
      if (!(row.forceLoss || Math.abs(Number(row.pnl) || 0) < 0.001)) return false;
    }
    row.result = result;
    row.pnl = result === "win" ? round2(pnl) : round2(pnl != null ? pnl : 0);
    row.settledAt = Date.now();
    row.forceLoss = result === "loss" && !!force;
    if (result === "win") row.forceLoss = false;
    return true;
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
    const mapped = clockToTf(t);
    if (mapped && TF_MS[mapped]) return TF_MS[mapped];
    const m = t.match(/^(\d+)(s|m|h)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isFinite(n) || n <= 0) return CONFIG.tradeMs || 60000;
      if (m[2] === "s" && n >= 5 && n <= 60) return n * 1000;
      if (m[2] === "m" && n >= 1 && n <= 30) return n * 60000;
      if (m[2] === "h" && n === 1) return n * 3600000;
    }
    return CONFIG.tradeMs || 60000;
  }
  function isClockExpiryValue(v) {
    const raw = String(v || "").replace(/\s+/g, "");
    if (!raw) return false;
    if (TF_MS[raw.toLowerCase()]) return false;
    const hms = raw.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (hms) return (+hms[1]) >= 1;
    const hm = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (hm) {
      const hh = +hm[1], mm = +hm[2];
      return hh <= 23 && mm <= 59;
    }
    return false;
  }
  function clockToTf(v) {
    const raw = String(v || "").replace(/\s+/g, "");
    if (!raw) return null;
    const low = raw.toLowerCase();
    if (TF_MS[low]) return low;
    if (isClockExpiryValue(raw)) return null;
    const hms = raw.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (!hms) return null;
    const hh = +hms[1], mm = +hms[2], ss = +hms[3];
    if (hh !== 0) return null;
    const sec = mm * 60 + ss;
    if (sec <= 0 || sec > 3600) return null;
    const keys = Object.keys(TF_MS);
    for (let i = 0; i < keys.length; i++) {
      if (Math.abs(TF_MS[keys[i]] - sec * 1000) <= 2000) return keys[i];
    }
    if (sec % 60 === 0) return (sec / 60) + "m";
    return null;
  }
  function saneDurMs(ms) {
    const n = Number(ms) || 0;
    const keys = Object.keys(TF_MS);
    for (let i = 0; i < keys.length; i++) {
      if (Math.abs(TF_MS[keys[i]] - n) <= 2000) return TF_MS[keys[i]];
    }
    if (n >= 5000 && n <= 900000) return n;
    return CONFIG.tradeMs || 60000;
  }
  function fmtDur(row) {
    const lab = String((row && row.dur) || "").toLowerCase().replace(/\s+/g, "");
    if (TF_MS[lab]) return lab;
    const ms = saneDurMs(row && row.durMs);
    const keys = Object.keys(TF_MS);
    for (let i = 0; i < keys.length; i++) {
      if (TF_MS[keys[i]] === ms) return keys[i];
    }
    return "1m";
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
          if (isClockExpiryValue(v)) { /* wall-clock 22:05 / 00:01 — not duration */ }
          else {
            const mapped = clockToTf(v);
            if (mapped) return mapped;
          }
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
  function timeWidgetRaw() {
    try { return String(readTimeWidgetValue() || "").replace(/\s+/g, ""); } catch (_e) { return ""; }
  }
  function elLooksLikeTimePanel(el) {
    let n = el;
    for (let i = 0; i < 4 && n && n.nodeType === 1; i++) {
      let r = null;
      try { r = n.getBoundingClientRect(); } catch (_eR) {}
      if (r && (r.height > 90 || r.width > 320)) { n = n.parentElement; continue; }
      let t = "";
      try { t = String(n.innerText || n.textContent || "").replace(/\s+/g, " ").trim(); } catch (_e0) { t = ""; }
      if (t && t.length < 48 && TIME_LABELS.test(t) && !/\$/.test(t)) return true;
      try {
        const lab = String((n.getAttribute && (n.getAttribute("aria-label") || n.getAttribute("placeholder") || n.getAttribute("name"))) || "");
        if (lab && TIME_LABELS.test(lab)) return true;
      } catch (_e1) {}
      n = n.parentElement;
    }
    return false;
  }
  function parseTradeCdSec(text) {
    const t = String(text || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (!t) return null;
    let bestMoney = null, bestZero = null;
    const re = /(\d{1,2}):(\d{2})(?!:\d)/g;
    let m;
    while ((m = re.exec(t))) {
      const idx = m.index;
      if (idx >= 3 && /\d/.test(t.charAt(idx - 3)) && t.charAt(idx - 2) === ":") continue;
      const mm = parseInt(m[1], 10);
      const ss = parseInt(m[2], 10);
      if (!isFinite(mm) || !isFinite(ss) || ss > 59 || mm >= 15) continue;
      const total = mm * 60 + ss;
      if (total <= 0 || total > 600) continue;
      const ctx = t.slice(Math.max(0, idx - 18), Math.min(t.length, idx + m[0].length + 10));
      const hasMoney = /\$|\d\s*\$/.test(ctx);
      if (hasMoney) {
        if (bestMoney == null || total < bestMoney) bestMoney = total;
      } else if (mm === 0) {
        if (bestZero == null || total < bestZero) bestZero = total;
      }
    }
    if (bestMoney == null) {
      const loose = t.match(/(?:[+\u2212\-]\s*)?(?:\$\s*)?\d+(?:\.\d+)?\s*\$?\s+(\d{1,2})[.:](\d{2})/);
      if (loose) {
        const mm = parseInt(loose[1], 10), ss = parseInt(loose[2], 10);
        if (isFinite(mm) && isFinite(ss) && ss <= 59 && mm < 15) {
          const total = mm * 60 + ss;
          if (total > 0 && total <= 600) bestMoney = total;
        }
      }
    }
    if (bestMoney != null) return bestMoney;
    if (bestZero != null) return bestZero;
    return null;
  }
  function tradesListCountdownSec() {
    try {
      const rows = listTradeRows();
      let best = null;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r.open) continue;
        let s = r.cdSec != null ? Number(r.cdSec) : parseTradeCdSec(r.t);
        if (s == null || !isFinite(s) || s <= 0) continue;
        if (best == null || s < best) best = s;
      }
      return best;
    } catch (_e) {
      return null;
    }
  }
  function screenCountdownSec() {
    const hud = document.getElementById("quotexbot-hud");
    const dashEl = document.getElementById("quotexbot-dash");
    const timeRaw = timeWidgetRaw();
    let bestMoney = null;
    const nodes = [];
    try {
      forEachRoot(function (root) {
        try {
          const list = root.querySelectorAll("div, span, b, strong, p, label, text, tspan, em, li");
          for (let i = 0; i < list.length; i++) nodes.push(list[i]);
        } catch (_e0) {}
      });
    } catch (_e1) {
      try {
        const list = document.querySelectorAll("div, span, b, strong, p, label, li");
        for (let i = 0; i < list.length; i++) nodes.push(list[i]);
      } catch (_e2) {}
    }
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (hud && (el === hud || (hud.contains && hud.contains(el)))) continue;
      if (dashEl && (el === dashEl || (dashEl.contains && dashEl.contains(el)))) continue;
      let t = "";
      try { t = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim(); } catch (_e3) { continue; }
      if (!t) continue;
      const hasMoneyCd = /\$/.test(t) && /\d{1,2}:\d{2}/.test(t);
      if (t.length > 32 && !hasMoneyCd) continue;
      if (t.length > 120) continue;
      if (/\b\d{2}:\d{2}:\d{2}\b/.test(t) && !hasMoneyCd) continue;
      const compact = t.replace(/\s+/g, "");
      if (timeRaw && compact === timeRaw) continue;
      if (elLooksLikeTimePanel(el)) continue;
      const got = parseTradeCdSec(t);
      if (got == null) continue;
      if (got >= 60 && !/\$/.test(t) && isClockExpiryValue(compact)) continue;
      if (/\$|\d\s*\$/.test(t)) {
        if (bestMoney == null || got < bestMoney) bestMoney = got;
      }
    }
    if (bestMoney != null) return decayShortCountdown(bestMoney);
    try {
      const rowCd = tradesListCountdownSec();
      if (rowCd != null && rowCd > 0) return decayShortCountdown(rowCd);
    } catch (_eR) {}
    return decayShortCountdown(null);
  }
  function clearCountdownGhost1() {
    cdLowHoldAt = 0;
    cdGhost1At = 0;
    if (!cdGhostLogged) {
      cdGhostLogged = true;
      log("Countdown ghost 1s cleared");
    }
  }
  function decayShortCountdown(raw) {
    const now = Date.now();
    if (raw == null || !isFinite(raw) || raw <= 0) {
      cdLowHoldAt = 0;
      cdGhost1At = 0;
      return null;
    }
    const n = Math.round(Number(raw));
    if (n >= 1 && n <= 2) {
      if (!cdLowHoldAt) cdLowHoldAt = now;
      const wall = (now - cdLowHoldAt) / 1000;
      if (n === 1) {
        if (!cdGhost1At) cdGhost1At = now;
        if (now - cdGhost1At >= 4000) {
          clearCountdownGhost1();
          return null;
        }
      } else {
        cdGhost1At = 0;
      }
      if (wall >= 2) return null;
      const left = n - wall;
      if (left < 1) return null;
      return Math.floor(left);
    }
    cdLowHoldAt = 0;
    cdGhost1At = 0;
    cdGhostLogged = false;
    return n;
  }
  function hasOpenTradesListRow() {
    try {
      const rows = listTradeRows();
      for (let i = 0; i < rows.length; i++) {
        if (rows[i] && rows[i].open) return true;
      }
    } catch (_e0) {}
    try {
      const rowCd = tradesListCountdownSec();
      if (rowCd != null && rowCd > 0) return true;
    } catch (_e1) {}
    return false;
  }
  function balanceIsReserved() {
    const last = lastOkJournal();
    if (!(last && last.ok && !last.result && (last.t || 0) >= bootAt)) return false;
    const stake = Number(last.stake) || Number(lastPreClickStake) || 0;
    const pre = Number(last.bal);
    let bal = null;
    try { bal = readPlatformBalance(); } catch (_e) { bal = null; }
    if (!(stake >= 1) || !isFinite(pre) || pre < 1 || bal == null) return false;
    return bal <= pre - Math.max(0.5, stake * 0.4);
  }
  function shortCountdownUncorroborated(cd) {
    if (cd == null || cd <= 0 || cd > 2) return false;
    if (hasOpenTradesListRow()) return false;
    if (balanceIsReserved()) return false;
    return true;
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
    let liveOpen = false;
    try { liveOpen = realTradeOpenNow(); } catch (_e0) { liveOpen = false; }
    let cd = null;
    try { cd = screenCountdownSec(); } catch (_e) {}
    const countingDown = liveOpen || (cd != null && cd > 0);
    if (countingDown) return;
    const used = {};
    for (let i = 0; i < state.journal.length; i++) {
      const r = state.journal[i];
      if (r && r.result && r.pnl != null) used[String(r.pnl)] = 1;
    }
    let fpNow = "";
    try { fpNow = tradesFingerprint(); } catch (_fp) {}
    const snips = countingDown ? [] : listPnlSnippets();
    const trades = countingDown ? [] : listTradeRows();
    let balNow = null;
    try { balNow = readPlatformBalance(); } catch (_b) {}
    const kinds = countPnlKinds(snips);
    let changed = false;
    const lastOk = lastOkJournal();
    function logSettle(row, win, pnl) {
      try { notePair(row.pair, { lastResult: win ? "win" : "loss", lastPnl: pnl }); } catch (_np) {}
      log((win ? "প্রফিট " : "লস ") + fmtMoney(pnl) + " · " + (row.pair || "") + (row.pos || row.signal ? " " + (row.pos || row.signal) : "") + (row.dur ? " · " + row.dur : ""));
    }
    for (let i = 0; i < state.journal.length; i++) {
      const row = state.journal[i];
      if (!(row && row.ok)) continue;
      const isLast = row === lastOk;
      const canFix = !row.result || (isLast && row.result === "loss" && (row.forceLoss || Math.abs(Number(row.pnl) || 0) < 0.001));
      if (!canFix) continue;
      if (row.result === "win") continue;
      const dur = saneDurMs(row.durMs);
      const age = now - (row.t || 0);
      if (countingDown && !row.result) continue;
      if (age < dur && !row.result) continue;
      const match = pickMatchingTrade(row, trades);
      const stake = Number(row.stake) || 0;
      const pre = Number(row.bal);
      const hasPre = isFinite(pre) && pre > 0;

      let stillHolding = false;
      if (hasPre && balNow != null && stake > 0) {
        const down0 = round2(pre - balNow);
        stillHolding = Math.abs(down0 - stake) < 0.08 || (down0 > 0.04 && balNow < pre - 0.04);
      }

      /* 1) Newest settled Trades row for THIS pair+direction+stake. Win chip wins.
         Never log Profit while this trade's stake is still reserved. */
      if (!stillHolding && match && match.win && !match.open) {
        const pnl = profitFrom(row, match);
        if (applyJournalResult(row, "win", pnl, false)) {
          changed = true;
          logSettle(row, true, row.pnl);
          continue;
        }
      }

      /* 2) Platform balance rose vs pre-click after expiry → win (pnl = delta / payout-stake). */
      if (!stillHolding && hasPre && balNow != null && age >= dur) {
        const delta = round2(balNow - pre);
        if (delta > 0.04) {
          if (applyJournalResult(row, "win", delta, false)) {
            changed = true;
            logSettle(row, true, row.pnl);
            continue;
          }
        }
      }

      /* 3) This trade's payout / +N$ / green profit chip — never a leftover 0.00$. */
      {
        let winSnip = null;
        for (let k = 0; k < snips.length; k++) {
          if (!snips[k].win || Number(snips[k].pnl) <= 0.001) continue;
          if (pnlAlreadyUsed(used, snips[k].pnl) && Math.abs(snips[k].pnl) > 0.001) continue;
          const fp = String(row.fp || "");
          const a = Number(snips[k].pnl).toFixed(2);
          if (fp && (fp.indexOf("+" + a) !== -1 || fp.indexOf(a + "$") !== -1)) continue;
          winSnip = snips[k];
          break;
        }
        if (!stillHolding && winSnip && !(match && match.open)) {
          const pnl = profitFrom(row, winSnip);
          if (applyJournalResult(row, "win", pnl, false)) {
            changed = true;
            used[String(row.pnl)] = 1;
            logSettle(row, true, row.pnl);
            continue;
          }
        }
      }

      if (row.result === "win") continue;
      if (match && match.open) continue;

      /* Still in-trade (balance down by stake) — payout not posted yet. */
      if (hasPre && balNow != null && stake > 0) {
        const down = round2(pre - balNow);
        if (Math.abs(down - stake) < 0.08 || (down > 0.04 && balNow < pre - 0.04)) {
          if (age < dur + 45000) continue;
        }
      }

      /* 4) Loss only if THIS row shows 0.00$ / 0$, not a leftover chip. */
      if (match && !match.open && !match.win && match.settled) {
        const isZero = match.pnl == null || Math.abs(Number(match.pnl)) < 0.001;
        const leftover = /0\.00/.test(String(row.fp || "")) && (Number(row.zeroN) || 0) >= kinds.zero;
        if (!(isZero && leftover && kinds.win <= (Number(row.winN) || 0))) {
          if (applyJournalResult(row, "loss", isZero ? 0 : match.pnl, false)) {
            changed = true;
            logSettle(row, false, row.pnl);
            continue;
          }
        }
      }

      /* 5) Balance returned to pre-click → loss/tie. */
      if (hasPre && balNow != null && age >= dur + 2000) {
        const delta = round2(balNow - pre);
        if (Math.abs(delta) < 0.05) {
          if (applyJournalResult(row, "loss", 0, false)) {
            changed = true;
            logSettle(row, false, 0);
            continue;
          }
        }
      }

      const leftoverZero = kinds.zero > 0 && kinds.zero <= (Number(row.zeroN) || 0);
      const newZero = kinds.zero > (Number(row.zeroN) || 0);
      if (leftoverZero && kinds.win <= (Number(row.winN) || 0)) {
        /* leftover 0.00$ from a previous trade — wait */
      } else if (newZero && kinds.win <= (Number(row.winN) || 0) && age >= dur + 4000) {
        if (applyJournalResult(row, "loss", 0, false)) {
          changed = true;
          logSettle(row, false, 0);
          continue;
        }
      }

      /* 6) Force-loss only after a long wait with no win evidence. Never overwrite a win. */
      if (!row.result && age >= dur + 28000) {
        if (kinds.win > (Number(row.winN) || 0)) continue;
        if (match && match.open) continue;
        if (hasPre && balNow != null && balNow > pre + 0.04) continue;
        if (applyJournalResult(row, "loss", 0, true)) {
          changed = true;
          logSettle(row, false, 0);
        }
      }
    }
    if (!pendingJournal()) clickLock = false;
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

  function widgetText(el) {
    try { return String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim(); } catch (_e) { return ""; }
  }
  function readTimeWidgetValue() {
    try {
      if (scrape && typeof scrape.findLabeledInput === "function") {
        const el = scrape.findLabeledInput(document, /\b(time|expiry|expiration|tiempo|tempo|время|সময়)\b/i);
        if (el) {
          const v = (el.value != null && String(el.value).trim()) ? String(el.value) : widgetText(el);
          if (v) return v.replace(/\s+/g, "");
        }
      }
    } catch (_e0) {}
    const hud = document.getElementById("quotexbot-hud");
    const dashEl = document.getElementById("quotexbot-dash");
    const wide = window.innerWidth || 1200;
    const nodes = [];
    try {
      forEachRoot(function (root) {
        try {
          const list = root.querySelectorAll("button, [role='button'], a, span, div, label, p, b, input");
          for (let i = 0; i < list.length; i++) nodes.push(list[i]);
        } catch (_eN) {}
      });
    } catch (_e1) {}
    let found = "";
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (hud && (el === hud || (hud.contains && hud.contains(el)))) continue;
      if (dashEl && (el === dashEl || (dashEl.contains && dashEl.contains(el)))) continue;
      let r;
      try { r = el.getBoundingClientRect(); } catch (_e2) { continue; }
      if (!r || r.left < wide * 0.45 || r.top < 80 || r.width < 4 || r.height < 4) continue;
      const t = widgetText(el);
      if (!t || t.length > 24) continue;
      const raw = t.replace(/\s+/g, "");
      if (isClockExpiryValue(raw)) return raw;
      if (TF_MS[raw.toLowerCase()] && !found) found = raw;
      if (/^00:\d{2}:\d{2}$/.test(raw) && !found) found = raw;
    }
    return found;
  }
  function timeIsClockMode() {
    try { return isClockExpiryValue(readTimeWidgetValue()); } catch (_e) { return false; }
  }
  function clickSwitchTime() {
    const hud = document.getElementById("quotexbot-hud");
    const dashEl = document.getElementById("quotexbot-dash");
    const nodes = [];
    try {
      forEachRoot(function (root) {
        try {
          const list = root.querySelectorAll("button, [role='button'], a, span, div, label, p");
          for (let i = 0; i < list.length; i++) nodes.push(list[i]);
        } catch (_eN) {}
      });
    } catch (_e0) {}
    let best = null, bestLen = 1e9;
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (hud && (el === hud || (hud.contains && hud.contains(el)))) continue;
      if (dashEl && (el === dashEl || (dashEl.contains && dashEl.contains(el)))) continue;
      const t = widgetText(el);
      if (!t || t.length > 48) continue;
      if (/\bpending\s*trade\b/i.test(t) || /\bpending\b/i.test(t)) continue;
      if (!/switch\s*time/i.test(t)) continue;
      let r;
      try { r = el.getBoundingClientRect(); } catch (_e1) { continue; }
      if (!r || r.width < 6 || r.height < 6) continue;
      if (t.length < bestLen) { best = el; bestLen = t.length; }
    }
    if (!best) return false;
    try {
      if (typeof best.click === "function") best.click();
      else if (typeof realishClick === "function") realishClick(best);
    } catch (_e2) { return false; }
    log("SWITCH TIME → duration");
    return true;
  }
  function clickDurationChip(want) {
    const need = String(want || "1m").toLowerCase();
    const hud = document.getElementById("quotexbot-hud");
    const dashEl = document.getElementById("quotexbot-dash");
    const re = /^(5s|10s|15s|30s|1m|2m|3m|5m|10m|15m|30m|1h)$/i;
    const nodes = [];
    try {
      forEachRoot(function (root) {
        try {
          const list = root.querySelectorAll("button, [role='button'], a, span, div, label, b");
          for (let i = 0; i < list.length; i++) nodes.push(list[i]);
        } catch (_eN) {}
      });
    } catch (_e0) {}
    let best = null, bestScore = -1e9;
    const wide = window.innerWidth || 1200;
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (hud && (el === hud || (hud.contains && hud.contains(el)))) continue;
      if (dashEl && (el === dashEl || (dashEl.contains && dashEl.contains(el)))) continue;
      const t = widgetText(el).replace(/\s+/g, "");
      if (!re.test(t) || t.toLowerCase() !== need) continue;
      let r;
      try { r = el.getBoundingClientRect(); } catch (_e1) { continue; }
      if (!r || r.width < 4 || r.height < 4) continue;
      const score = (r.left > wide * 0.5 ? 80 : 0) - r.top;
      if (score > bestScore) { bestScore = score; best = el; }
    }
    if (!best) return false;
    try {
      if (typeof best.click === "function") best.click();
      else if (typeof realishClick === "function") realishClick(best);
    } catch (_e2) { return false; }
    return true;
  }
  async function ensureDurationMode() {
    let clock = false;
    try { clock = timeIsClockMode(); } catch (_e0) { clock = false; }
    if (!clock) return;
    const switched = clickSwitchTime();
    if (switched) await sleep(350);
    if (!clickDurationChip("1m") && switched) {
      try {
        if (scrape && typeof scrape.findLabeledInput === "function" && typeof scrape.setControlValue === "function") {
          const el = scrape.findLabeledInput(document, /\b(time|expiry|expiration|tiempo|tempo|время|সময়)\b/i);
          if (el) scrape.setControlValue(el, "00:01:00");
        }
      } catch (_e1) {}
    }
    if (switched) await sleep(150);
  }
  function platformHasOpenTrade() {
    const hud = document.getElementById("quotexbot-hud");
    const dashEl = document.getElementById("quotexbot-dash");
    const timeRaw = timeWidgetRaw();
    const wide = window.innerWidth || 1200;
    const nodes = [];
    try {
      forEachRoot(function (root) {
        try {
          const list = root.querySelectorAll("div, span, li, p, b, strong, label");
          for (let i = 0; i < list.length; i++) nodes.push(list[i]);
        } catch (_eN) {}
      });
    } catch (_e0) {}
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (hud && (el === hud || (hud.contains && hud.contains(el)))) continue;
      if (dashEl && (el === dashEl || (dashEl.contains && dashEl.contains(el)))) continue;
      if (elLooksLikeTimePanel(el)) continue;
      let r;
      try { r = el.getBoundingClientRect(); } catch (_e1) { continue; }
      if (!r || r.width < 8 || r.height < 8 || r.left < wide * 0.52) continue;
      let t = "";
      try { t = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim(); } catch (_e2) { continue; }
      if (!t || t.length > 96) continue;
      const compact = t.replace(/\s+/g, "");
      if (timeRaw && compact === timeRaw) continue;
      if (/\bpending\s*trade\b/i.test(t)) continue;
      if (/\b\d{2}:\d{2}:\d{2}\b/.test(t)) continue;
      const cdMatch = t.match(/\b(\d{1,2}):(\d{2})\b/);
      let cdOk = false;
      if (cdMatch) {
        const mm = parseInt(cdMatch[1], 10);
        const ss = parseInt(cdMatch[2], 10);
        if (isFinite(mm) && isFinite(ss) && ss <= 59 && mm < 15) {
          if (mm === 0 && ss > 0) cdOk = true;
          else if (/\$/.test(t)) cdOk = true;
        }
      }
      const hasStake = /\$\s*\d|\d(?:\.\d+)?\s*\$/.test(t);
      const hasDir = /\b(call|put|up|down|higher|lower)\b/i.test(t);
      const settledOnly = /(?:^|[+\u2212\-])\s*\$?\s*\d+(?:\.\d+)?\s*\$/.test(t) && !cdOk;
      if (settledOnly) continue;
      if (cdOk && (hasStake || hasDir || /\$/.test(t))) return true;
      if (/\bopen\b/i.test(t) && (hasStake || hasDir || cdOk)) return true;
    }
    return false;
  }
  function realTradeOpenNow() {
    let cd = null;
    try { cd = screenCountdownSec(); } catch (_e) {}
    try {
      const rowCd = tradesListCountdownSec();
      if (rowCd != null && rowCd > 0) return true;
    } catch (_e3) {}
    if (hasOpenTradesListRow()) return true;
    if (balanceIsReserved()) return true;
    const ghostShort = (cd == null || cd <= 2) && !hasOpenTradesListRow() && !balanceIsReserved();
    if (ghostShort) return false;
    if (cd != null && cd > 0) return true;
    try { if (platformHasOpenTrade()) return true; } catch (_e2) {}
    return false;
  }
  function pendingJournal() {
    const last = lastOkJournal();
    if (!(last && !last.result)) return false;
    if ((last.t || 0) < bootAt) return false;
    return true;
  }
  function cooldownLeftMs() {
    try { if (realTradeOpenNow()) return 0; } catch (_e0) {}
    const last = lastOkJournal();
    if (!last || !last.result) return 0;
    if ((last.t || 0) < bootAt) return 0;
    const from = last.settledAt || ((last.t || 0) + saneDurMs(last.durMs));
    const left = (CONFIG.cooldownMs || 65000) - (Date.now() - from);
    return left > 0 ? left : 0;
  }
  function tradeBusy() {
    if (clickLock) return true;
    if (realTradeOpenNow()) return true;
    if (pendingJournal()) return true;
    return false;
  }
  function tradeOpen() {
    if (tradeBusy()) return true;
    if (cooldownLeftMs() > 0) return true;
    return false;
  }
  function liveOcrAgeMs() {
    if (lastGoodPxAt) return Date.now() - lastGoodPxAt;
    return 1e9;
  }
  function priceOcrFresh() {
    return liveOcrAgeMs() < 2000;
  }
  function expiryTooClose() {
    let cd = null;
    try { cd = screenCountdownSec(); } catch (_e) { cd = null; }
    if (cd != null && cd > 0 && cd <= 8) {
      if (cd <= 2 && shortCountdownUncorroborated(cd)) return false;
      return true;
    }
    return false;
  }
  function tradeWaitSec() {
    let cd = null;
    try { cd = screenCountdownSec(); } catch (_e) {}
    if (cd != null && cd > 0 && !shortCountdownUncorroborated(cd)) return cd;
    try { if (realTradeOpenNow()) return 1; } catch (_e2) {}
    const last = lastOkJournal();
    if (last && !last.result && (last.t || 0) >= bootAt) {
      const dur = saneDurMs(last.durMs);
      return Math.max(1, Math.ceil((dur - (Date.now() - (last.t || 0))) / 1000));
    }
    return Math.max(0, Math.ceil(cooldownLeftMs() / 1000));
  }
  function clearStaleBusyIfIdle() {
    if (staleBusyCleared) return;
    if (realTradeOpenNow()) {
      staleBusyCleared = true;
      log("Boot: open trade on platform, keeping one-trade lock");
      return;
    }
    let ready = false;
    try { ready = !!readTimeWidgetValue(); } catch (_eU) {}
    if (!ready && Date.now() - bootAt < 8000) return;
    staleBusyCleared = true;
    clickLock = false;
    lastClickAt = 0;
    try {
      if (state.lastReason && /trade open|cooldown|wait \d+\s*s/i.test(String(state.lastReason))) {
        state.lastReason = "";
      }
    } catch (_eR) {}
    log("Boot: no open trade on platform, stale cooldown cleared");
  }
  async function maybeEnsureDurationIdle() {
    if (durationEnsuredOnce) return;
    if (realTradeOpenNow()) return;
    let clock = false;
    try { clock = timeIsClockMode(); } catch (_e0) { clock = false; }
    if (!clock) {
      try {
        const v = readTimeWidgetValue();
        const lab = String(v || "").toLowerCase().replace(/\s+/g, "");
        if (v && TF_MS[lab]) durationEnsuredOnce = true;
      } catch (_e1) {}
      return;
    }
    try { await ensureDurationMode(); } catch (_e2) {}
    durationEnsuredOnce = true;
  }

  function snapDoc() {
    if (!scrape || typeof scrape.scrapeDocument !== "function") return { accountMode: "", asset: "" };
    try { return scrape.scrapeDocument(document); } catch (_e) { return { accountMode: "", asset: "" }; }
  }
  function journalManual(dir, r) {
    if (!r || !r.ok) return;
    const pos = dir === "down" ? "PUT" : "CALL";
    const pair = visiblePair() || lastSeenPair || (state.lastPair && state.lastPair !== "—" ? state.lastPair : "") || "—";
    let durLabel = "1m";
    let durMsVal = CONFIG.tradeMs || 60000;
    try { durLabel = readExpiryLabel(); } catch (_d1) {}
    try { durMsVal = saneDurMs(readExpiryMs()); } catch (_d2) { durMsVal = tfToMs(durLabel); }
    durLabel = fmtDur({ dur: durLabel, durMs: durMsVal });
    durMsVal = tfToMs(durLabel);
    let fpAtClick = "";
    try { fpAtClick = tradesFingerprint(); } catch (_fp0) { fpAtClick = ""; }
    const px = state.lastPx != null && state.lastPx !== "" ? String(state.lastPx) : "—";
    addJournal(Object.assign({
      t: Date.now(),
      pair: pair,
      signal: pos,
      pos: pos,
      dur: durLabel,
      durMs: durMsVal,
      px: px,
      fp: fpAtClick,
      ok: true,
      err: "",
    }, journalMoneyFields()));
    lastClickAt = Date.now();
    lastTradesFp = fpAtClick;
    notePair(pair, {
      px: px,
      signal: pos,
      reason: "Manual " + pos,
      bars: barCount(pair),
    });
  }
  async function clickDir(dir) {
    if (!scrape) return { ok: false, error: "scrape missing" };
    const snap = snapDoc();
    if (snap.accountMode !== "demo" && !state.liveAck) return { ok: false, error: "live locked" };
    if (tradeBusy()) return { ok: false, error: "Trade open, skip" };
    try { if (expiryTooClose()) return { ok: false, error: "Trade open, skip" }; } catch (_eEx) {}
    try { await ensureDurationMode(); } catch (_eDur) {}
    if (snap.accountMode === "demo") {
      try { await applyMoneyManagement(); } catch (_eMm) {}
    }
    if (tradeBusy()) return { ok: false, error: "Trade open, skip" };
    try { if (expiryTooClose()) return { ok: false, error: "Trade open, skip" }; } catch (_eEx2) {}
    capturePreClickMoney();
    if (lastMmAppliedStake != null) lastPreClickStake = lastMmAppliedStake;
    clickLock = true;
    try {
      const opts = lastMmAppliedStake != null ? { stake: String(lastMmAppliedStake) } : {};
      const r = dir === "down" ? scrape.clickDown(document, opts) : scrape.clickUp(document, opts);
      if (!r || !r.ok) clickLock = false;
      return r;
    } catch (err) {
      clickLock = false;
      return { ok: false, error: (err && err.message) || "fail" };
    }
  }

  async function scanWatchlist() {
    if (scanning || !state.auto) return;
    if (!staleBusyCleared) {
      try { clearStaleBusyIfIdle(); } catch (_eCl) {}
      if (!staleBusyCleared) return;
    }
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
        const left = tradeWaitSec();
        state.lastReason = "Trade open, wait " + left + "s";
        const sig = "wait:" + String(left);
        if (sig !== lastWaitLogSig) {
          lastWaitLogSig = sig;
          log("Waiting on last trade/cooldown " + left + "s");
        }
        saveState(state); render();
        return;
      }
      lastWaitLogSig = "";

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
        log("OTC miss · axis" + lastAxisScanN + " cand" + peek.n);
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
      if (tradeOpen()) { log("Trade open, skip"); return; }
      try { if (expiryTooClose()) { log("Trade open, skip"); return; } } catch (_eEx1) {}

      await sleep(400 + Math.floor(Math.random() * 600));
      if (tradeOpen()) { log("Trade open, skip"); return; }
      try { if (expiryTooClose()) { log("Trade open, skip"); return; } } catch (_eEx2) {}
      if (!priceOcrFresh()) {
        state.lastReason = "Price stale, skip";
        log("Price stale, skip");
        saveState(state); render();
        return;
      }
      const r = await clickDir(d.signal === "PUT" ? "down" : "up");
      if (r && r.error === "Trade open, skip") { log("Trade open, skip"); return; }
      let durLabel = "1m";
      let durMsVal = CONFIG.tradeMs || 60000;
      try { durLabel = readExpiryLabel(); } catch (_d1) {}
      try { durMsVal = saneDurMs(readExpiryMs()); } catch (_d2) { durMsVal = tfToMs(durLabel); }
      durLabel = fmtDur({ dur: durLabel, durMs: durMsVal });
      durMsVal = tfToMs(durLabel);
      let fpAtClick = "";
      try { fpAtClick = tradesFingerprint(); } catch (_fp0) { fpAtClick = ""; }
      addJournal(Object.assign({
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
      }, journalMoneyFields()));
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
      pointer-events:auto !important;overflow:hidden;min-width:240px;min-height:320px;max-width:96vw;max-height:96vh}
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
    #quotexbot-hud .log{flex:1 1 auto;min-height:80px !important;height:auto;overflow:auto;background:#0b0f16;border:1px solid #2a3344;
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
    if (winDrag && winDrag.el === el) return;
    let left = w.left;
    let top = w.top;
    if (left != null) left = Math.max(0, Math.min(Number(left) || 0, window.innerWidth - 80));
    if (top != null) top = Math.max(0, Math.min(Number(top) || 0, window.innerHeight - 40));
    if (left != null) {
      el.style.left = left + "px";
      el.style.right = "auto";
      el.style.bottom = "auto";
    }
    if (top != null) el.style.top = top + "px";
    if (w.w) el.style.width = w.w + "px";
    if (w.h && !(which === "hud" && state.minimized)) {
      let h = Number(w.h) || 0;
      if (which === "hud") h = Math.max(h, 360);
      if (h > 0) el.style.height = h + "px";
    }
    if (which === "hud") ensureLogPane(el);
  }
  function ensureLogPane(el) {
    if (!el || state.minimized) return;
    try {
      el.style.minHeight = Math.max(parseFloat(el.style.minHeight) || 0, 320) + "px";
      const logEl = el.querySelector(".log");
      if (logEl) {
        logEl.style.minHeight = "80px";
        logEl.style.flex = "1 1 auto";
      }
      const body = el.querySelector(".body");
      if (body) body.style.minHeight = "80px";
      if (logEl) {
        const lh = logEl.getBoundingClientRect().height;
        const hh = el.getBoundingClientRect().height;
        if (lh < 80) {
          el.style.height = Math.max(hh, 360) + "px";
          logEl.style.minHeight = "80px";
        }
      }
    } catch (_eL) {}
  }
  function saveWin(el, which) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const box = {
      left: Math.round(Math.max(0, r.left)),
      top: Math.round(Math.max(0, r.top)),
      w: Math.round(Math.max(220, r.width)),
      h: Math.round(Math.max(which === "hud" ? 360 : 140, r.height)),
    };
    if (which === "dash") state.dashWin = box;
    else state.hudWin = box;
    saveState(state);
  }
  function mountGrip(el, which) {
    if (!el) return;
    if (which === "hud" && el.getAttribute("data-qpos") === "1") {
      /* persist HUD left/top across renders */
      if (which === "hud") ensureLogPane(el);
    } else {
      applyWin(el, which);
      if (which === "hud") el.setAttribute("data-qpos", "1");
    }
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
      const h = Math.max(winDrag.which === "hud" ? 360 : 140, ev.clientY - winDrag.top);
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
      if (!state.hudWin) pinHud(el);
      el.setAttribute("data-qpos", "1");
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
      const dur = fmtDur(j);
      return "<tr><td>" + hh + ":" + mm + ":" + ss + "</td><td>" + esc(j.pair) + "</td><td class=\"" + cls + "\">" + esc(pos) + "</td><td>" + esc(dur) + "</td><td>" + esc(j.px) + "</td><td class=\"" + rcls + "\">" + res + "</td></tr>";
    }).join("") || "<tr><td colspan=\"6\">এখনো ট্রেড নেই</td></tr>";
    dash.innerHTML = "<div class=\"hd\"><h1>quotexbot ড্যাশবোর্ড v" + CONFIG.version + "</h1><button class=\"m\" type=\"button\" data-act=\"dash-close\">×</button></div><div class=\"body\"><div class=\"stats\"><div>মোট ট্রেড<b>" + ts.total + "</b></div><div class=\"win\">প্রফিট<b>" + ts.wins + "</b></div><div class=\"lose\">লস<b>" + ts.losses + "</b></div><div>নেট<b>" + fmtMoney(ts.net) + "</b></div></div>" + (ts.pending ? "<p class=\"note\">ফলাফল অপেক্ষা: " + ts.pending + "</p>" : "") + "<h2>পেয়ার · সেভ ডেটা</h2><table><thead><tr><th>পেয়ার</th><th>OTC দাম</th><th>হিস্ট্রি</th><th>সিগন্যাল</th><th>কারণ</th></tr></thead><tbody>" + rows + "</tbody></table><h2>ট্রেড জার্নাল</h2><table><thead><tr><th>সময়</th><th>পেয়ার</th><th>পজিশন</th><th>সময়</th><th>দাম</th><th>ফলাফল</th></tr></thead><tbody>" + jrows + "</tbody></table></div>";
    mountGrip(dash, "dash");
  }

  function render() {
    if (topHudYielded) return;
    try { settlePendingJournal(); } catch (_eS) {}
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
        <div class="row"><span>পেয়ার</span><b>${(function(){ let v=""; try { v=visiblePair()||""; } catch(_e){} return v || state.lastPair || snap.asset || "—"; })()}</b></div>
        <div class="row"><span>OTC দাম</span><b>${state.lastPx || "—"}</b></div>
        <div class="row"><span>হিস্ট্রি</span><b>${barCount(state.lastPair || snap.asset || "")}/${CONFIG.minBarsForEma} বার · সেভ</b></div>
        <div class="row"><span>সিগন্যাল</span><b>${state.lastSignal}</b></div>
        <div class="row"><span>ট্রেড</span><b>${(function(){ const j = lastOkJournal(); if (!j) return "—"; return (j.pos || j.signal || "—") + " · " + fmtDur(j) + (j.result ? "" : " · চলছে"); })()}</b></div>
        <div class="row"><span>অটো</span><b>${state.auto ? "ON " + state.autoCount + "/" + MAX_AUTO : "OFF"}</b></div>
        <div class="row"><span>হিসাব</span><b>${(function(){ const s = tradeStats(); return s.total + " ট্রেড · প্রফিট " + s.wins + " · লস " + s.losses + " · " + fmtMoney(s.net); })()}</b></div>
        <div class="row"><span>Stake</span><b>${mmHudText()}</b></div>
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
    if (act === "up" || act === "down") {
      if (tradeBusy()) {
        log("Trade open, skip");
        state.lastReason = "Trade open, skip";
        saveState(state); render();
        return;
      }
      if (cooldownLeftMs() > 0) {
        log("Cooldown (auto only)");
        state.lastReason = "Cooldown (auto only)";
      }
      (async function () {
        const r = await clickDir(act);
        if (r && r.error === "Trade open, skip") {
          log("Trade open, skip");
          state.lastReason = "Trade open, skip";
        } else if (r && r.ok) {
          journalManual(act, r);
          state.lastReason = act === "down" ? "নিচে clicked" : "উপরে clicked";
          log(act === "down" ? "ম্যানুয়াল নিচে OK" : "ম্যানুয়াল উপরে OK");
        } else {
          state.lastReason = (r && r.error) || "fail";
          log((act === "down" ? "ম্যানুয়াল নিচে FAIL: " : "ম্যানুয়াল উপরে FAIL: ") + ((r && r.error) || ""));
        }
        saveState(state); render();
      })();
      return;
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
    const miss = { axis: 0, cand: 0 };
    const px = readLivePrice(label, miss);
    if (px == null) {
      state.lastPx = "—";
      if (root && root.isConnected) {
        const row = root.querySelectorAll(".row b")[3];
        if (row) row.textContent = "—";
      }
      const sig = "OTC miss · axis" + miss.axis + " cand" + miss.cand;
      const now = Date.now();
      if (sig !== lastMissSig || now - lastMissLogAt > 8000) {
        lastMissSig = sig;
        lastMissLogAt = now;
        log(sig);
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
    try { clearStaleBusyIfIdle(); } catch (_eB) {}
    try { maybeEnsureDurationIdle(); } catch (_eD) {}
    if (state.auto) scanWatchlist();
    else {
      const sig = String(state.lastPx) + "\0" + String(state.lastPair);
      if (sig === lastHudSig) return;
      lastHudSig = sig;
      render();
    }
  }, CONFIG.uiMs);

  startQuoteObserver();
  try {
    const vis0 = visiblePair();
    if (vis0) onPairChange(vis0);
  } catch (_eVis) {}

  function verNewer(remote, local) {
    const a = String(remote).split(".").map(Number);
    const b = String(local).split(".").map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] || 0, y = b[i] || 0;
      if (x > y) return true;
      if (x < y) return false;
    }
    return false;
  }

  function bustUrl(url) {
    if (!url) return url;
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "cb=" + Date.now();
  }

  function savePayload(txt, ver) {
    try {
      if (typeof GM_setValue === "function") {
        GM_setValue("quotexbot_script_payload", txt);
        GM_setValue("quotexbot_script_payload_ver", ver);
      }
    } catch (_e) {}
  }

  function checkRemoteVersion() {
    if (!quotexbotShouldBoot()) return;
    if (window.__quotexbotReloading) return;
    const url = CONFIG.updateUrl;
    if (!url) return;
    function done(txt) {
      if (window.__quotexbotReloading) return;
      const raw = String(txt || "");
      const m = raw.match(/@version\s+([0-9.]+)/);
      if (!m) return;
      const remote = m[1];
      if (!verNewer(remote, CONFIG.version)) return;
      savePayload(raw, remote);
      log("GitHub-এ নতুন v" + remote + " সেভ (এখন v" + CONFIG.version + ")");
      const key = "quotexbot_did_reload_" + remote;
      let already = false;
      try { already = sessionStorage.getItem(key) === "1"; } catch (_e0) {}
      if (already) {
        state.lastReason = "v" + remote + " সেভ · একবার রিফ্রেশ দাও";
        render();
        return;
      }
      if (CONFIG.autoReloadOnUpdate) {
        window.__quotexbotReloading = true;
        try { sessionStorage.setItem(key, "1"); } catch (_e2) {}
        log("আপডেট v" + remote + " লাগাতে একবার রিফ্রেশ");
        location.reload();
        return;
      }
      render();
    }
    const fetchUrl = bustUrl(url);
    try {
      if (typeof GM_xmlhttpRequest === "function") {
        GM_xmlhttpRequest({
          method: "GET",
          url: fetchUrl,
          headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" },
          onload: function (res) { done(res.responseText); },
          onerror: function () {},
        });
        return;
      }
    } catch (_e3) {}
    try {
      fetch(fetchUrl, { cache: "no-store" }).then(function (r) { return r.text(); }).then(done).catch(function () {});
    } catch (_e4) {}
  }

  if (window.top === window) {
    setTimeout(checkRemoteVersion, 2500);
    setInterval(checkRemoteVersion, CONFIG.checkUpdateMs);
  }

  log(scrape ? ("HUD চালু v" + CONFIG.version + " · CONFIG") : "HUD চালু, scrape নেই");
  render();
  renderDash();
  setTimeout(function () {
    try { clearStaleBusyIfIdle(); } catch (_eB) {}
    try { maybeEnsureDurationIdle(); } catch (_eD) {}
    if (state.auto) scanWatchlist();
  }, 600);
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
}
