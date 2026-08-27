/**
 * quotexbot MV3 service worker (v0.9.27-ext)
 *
 * On {type:'capture'} from the DEMO tab content script:
 *   chrome.tabs.captureVisibleTab → crop a strip at the CHART canvas
 *   right edge (blue/cyan live-price tag, left of the trade sidebar)
 *   → digit OCR → number.
 *
 * Visible pixels only. No websocket/HTTP reverse-engineering.
 * Do not crop the window-right 110px (that is the $2 / Up / Down sidebar).
 */
"use strict";

importScripts("vendor/digit-ocr.js");

var lastPack = { at: 0, resp: null };
var inflight = null;

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

function captureOcr(windowId, dpr, rect) {
  return captureVisible(windowId).then(function (dataUrl) {
    if (!dataUrl) return { ok: false, error: "empty capture" };
    return self.DigitOcr.readPriceFromPngDataUrl(dataUrl, {
      rect: rect,
      dpr: dpr
    }).then(function (got) {
      var v = null, text = "";
      if (got != null && typeof got === "object") {
        v = got.v;
        text = got.text ? String(got.text) : "";
      } else {
        v = got;
      }
      if (v == null || !isFinite(v) || v < 0.05) {
        return { ok: false, error: "no tag" };
      }
      var resp = { ok: true, v: v };
      if (text) resp.text = text;
      return resp;
    });
  });
}
