/**
 * quotexbot offscreen OCR host (v0.9.33-ext)
 *
 * Tesseract.js wasm cannot run in the MV3 service worker. This hidden
 * extension page loads the vendored worker + wasm + eng.traineddata and
 * OCRs only the SMALL blue live-tag crop. Never injected into Quotex.
 */
"use strict";

var tessWorker = null;
var tessInit = null;
var PRICE_RE = /(\d{1,6}\.\d{1,6})/g;

chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
  if (!msg || msg.type !== "quotexbot-ocr") return;
  runOcr(msg)
    .then(sendResponse)
    .catch(function (err) {
      sendResponse({
        ok: false,
        error: String(err && err.message ? err.message : err)
      });
    });
  return true;
});

function vendorUrl(name) {
  return chrome.runtime.getURL("vendor/" + name);
}

function getWorker() {
  if (tessWorker) return Promise.resolve(tessWorker);
  if (tessInit) return tessInit;
  tessInit = (async function () {
    if (typeof Tesseract === "undefined" || !Tesseract.createWorker) {
      throw new Error("Tesseract not loaded");
    }
    var worker = await Tesseract.createWorker("eng", 1, {
      workerPath: vendorUrl("worker.min.js"),
      corePath: vendorUrl("tesseract-core-simd-lstm.wasm.js"),
      langPath: chrome.runtime.getURL("vendor/"),
      workerBlobURL: false,
      gzip: false,
      cacheMethod: "none",
      logger: function () {}
    });
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789.",
      tessedit_pageseg_mode: "7"
    });
    tessWorker = worker;
    return worker;
  })().catch(function (err) {
    tessInit = null;
    tessWorker = null;
    throw err;
  });
  return tessInit;
}

function parsePriceText(text) {
  if (!text) return null;
  var t = String(text).replace(/,/g, ".");
  var m, best = null;
  PRICE_RE.lastIndex = 0;
  while ((m = PRICE_RE.exec(t))) {
    if (!best || m[1].length > best.length) best = m[1];
  }
  if (!best) return null;
  var v = parseFloat(best);
  if (!isFinite(v) || v < 0.05) return null;
  return { v: v, text: best };
}

function imageDataToCanvas(img) {
  var c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").putImageData(img, 0, 0);
  return c;
}

async function runOcr(msg) {
  if (!msg.dataUrl) return { ok: false, error: "empty capture" };
  if (typeof DigitOcr === "undefined" || !DigitOcr.cropLiveTagFromPngDataUrl) {
    return { ok: false, error: "crop helper missing" };
  }
  var crop = await DigitOcr.cropLiveTagFromPngDataUrl(msg.dataUrl, {
    rect: msg.rect,
    dpr: msg.dpr
  });
  if (!crop) return { ok: false, error: "no tag" };
  var worker = await getWorker();
  var canvas = imageDataToCanvas(crop);
  var result = await worker.recognize(canvas, {}, { text: true });
  var raw = result && result.data ? String(result.data.text || "") : "";
  var got = parsePriceText(raw);
  if (!got) return { ok: false, error: "no tag", text: raw };
  return { ok: true, v: got.v, text: got.text };
}

getWorker().catch(function () {});
