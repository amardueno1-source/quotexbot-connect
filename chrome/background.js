/**
 * quotexbot MV3 service worker (v0.9.25-ext)
 *
 * On {type:'capture'} from the DEMO tab content script:
 *   chrome.tabs.captureVisibleTab → crop the RIGHT-EDGE live price tag
 *   (blue/cyan rounded label on the last candle) → digit OCR → number.
 *
 * Visible pixels only. No websocket/HTTP reverse-engineering.
 */
"use strict";

importScripts("vendor/digit-ocr.js");

var CROP_RIGHT = 110;
var CROP_TOP = 70;
var lastPack = { at: 0, resp: null };
var inflight = null;

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== "capture") return;
  var windowId = (sender && sender.tab && sender.tab.windowId != null)
    ? sender.tab.windowId
    : null;
  var dpr = Number(msg.dpr) > 0 ? Number(msg.dpr) : 1;
  var cropRight = Number(msg.cropRight) > 0 ? Number(msg.cropRight) : CROP_RIGHT;
  var cropTop = Number(msg.cropTop) >= 0 ? Number(msg.cropTop) : CROP_TOP;
  runCapture(windowId, dpr, cropRight, cropTop)
    .then(sendResponse)
    .catch(function (err) {
      sendResponse({
        ok: false,
        error: String(err && err.message ? err.message : err)
      });
    });
  return true;
});

function runCapture(windowId, dpr, cropRight, cropTop) {
  var now = Date.now();
  if (inflight) return inflight;
  if (lastPack.resp && now - lastPack.at < 700) {
    return Promise.resolve(lastPack.resp);
  }
  inflight = captureOcr(windowId, dpr, cropRight, cropTop)
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

function captureOcr(windowId, dpr, cropRight, cropTop) {
  return captureVisible(windowId).then(function (dataUrl) {
    if (!dataUrl) return { ok: false, error: "empty capture" };
    return self.DigitOcr.readPriceFromPngDataUrl(dataUrl, {
      cropRightCss: cropRight,
      cropTopCss: cropTop,
      dpr: dpr
    }).then(function (v) {
      if (v == null || !isFinite(v) || v < 0.05) {
        return { ok: false, error: "no tag" };
      }
      return { ok: true, v: v };
    });
  });
}
