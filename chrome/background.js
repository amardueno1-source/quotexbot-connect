/**
 * quotexbot MV3 service worker (v0.9.33-ext)
 *
 * On {type:'capture'} from the DEMO tab content script:
 *   chrome.tabs.captureVisibleTab → send PNG + chart-canvas rect to the
 *   offscreen document, which crops the SMALL blue/cyan live-price tag
 *   (canvas right −90/+24) and runs Tesseract.js (whitelist 0123456789.,
 *   PSM 7). Wasm cannot run here; OCR is never injected into Quotex.
 *
 * Visible pixels only. No websocket/HTTP reverse-engineering.
 */
"use strict";

var lastPack = { at: 0, resp: null };
var inflight = null;
var offscreenReady = null;

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== "capture") return;
  var windowId = (sender && sender.tab && sender.tab.windowId != null)
    ? sender.tab.windowId
    : null;
  var dpr = Number(msg.dpr) > 0 ? Number(msg.dpr) : 1;
  var rect = parseRect(msg.rect);
  runCapture(windowId, dpr, rect)
    .then(sendResponse)
    .catch(function (err) {
      sendResponse({
        ok: false,
        error: String(err && err.message ? err.message : err)
      });
    });
  return true;
});

function parseRect(r) {
  if (!r || typeof r !== "object") return null;
  var left = Number(r.left), top = Number(r.top);
  var width = Number(r.width), height = Number(r.height);
  if (!isFinite(left) || !isFinite(top) || !isFinite(width) || !isFinite(height)) return null;
  if (width < 40 || height < 40) return null;
  return { left: left, top: top, width: width, height: height };
}

function runCapture(windowId, dpr, rect) {
  var now = Date.now();
  if (inflight) return inflight;
  if (lastPack.resp && now - lastPack.at < 700) {
    return Promise.resolve(lastPack.resp);
  }
  inflight = captureOcr(windowId, dpr, rect)
    .then(function (resp) {
      lastPack = { at: Date.now(), resp: resp };
      return resp;
    })
    .finally(function () {
      inflight = null;
    });
  return inflight;
}

function captureVisible(windowId) {
  var opts = { format: "png" };
  if (windowId == null) {
    return chrome.tabs.captureVisibleTab(null, opts);
  }
  return chrome.tabs.captureVisibleTab(windowId, opts).catch(function () {
    return chrome.tabs.captureVisibleTab(null, opts);
  });
}

function ensureOffscreen() {
  if (offscreenReady) return offscreenReady;
  offscreenReady = (async function () {
    var url = chrome.runtime.getURL("offscreen.html");
    if (chrome.runtime.getContexts) {
      var ctxs = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [url]
      });
      if (ctxs && ctxs.length) return;
    }
    try {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["WORKERS"],
        justification: "Run Tesseract.js OCR on the chart live-price tag crop"
      });
    } catch (err) {
      var msg = String(err && err.message ? err.message : err);
      if (msg.indexOf("Only a single offscreen") < 0 && msg.indexOf("already exists") < 0) {
        throw err;
      }
    }
  })().catch(function (err) {
    offscreenReady = null;
    throw err;
  });
  return offscreenReady;
}

function sendOcr(payload) {
  return new Promise(function (resolve, reject) {
    chrome.runtime.sendMessage(payload, function (resp) {
      var err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || String(err)));
        return;
      }
      resolve(resp || { ok: false, error: "no ocr resp" });
    });
  });
}

function captureOcr(windowId, dpr, rect) {
  return captureVisible(windowId).then(function (dataUrl) {
    if (!dataUrl) return { ok: false, error: "empty capture" };
    return ensureOffscreen().then(function () {
      var payload = {
        type: "quotexbot-ocr",
        dataUrl: dataUrl,
        dpr: dpr,
        rect: rect
      };
      return sendOcr(payload).catch(function () {
        return new Promise(function (r) { setTimeout(r, 200); }).then(function () {
          return sendOcr(payload);
        });
      });
    }).then(function (got) {
      if (!got || !got.ok) return got || { ok: false, error: "no tag" };
      var v = got.v;
      var text = got.text ? String(got.text) : "";
      if (v == null || !isFinite(v) || v < 0.05) {
        return { ok: false, error: "no tag", text: text };
      }
      var resp = { ok: true, v: v };
      if (text) resp.text = text;
      return resp;
    });
  });
}
