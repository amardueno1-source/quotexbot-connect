/**
 * quotexbot offscreen OCR host (v0.9.39-ext)
 *
 * Tesseract.js wasm cannot run in the MV3 service worker. This hidden
 * extension page loads the vendored worker + wasm + eng.traineddata and
 * OCRs the SMALL blue live-tag crop plus the last-candle trade-bubble
 * crop (MM:SS next to $). Never injected into Quotex.
 */
"use strict";

var tessWorker = null;
var tessInit = null;
var ocrChain = Promise.resolve();
var PRICE_RE = /(\d{1,6}\.\d{1,6})/g;

chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
  if (!msg || msg.type !== "quotexbot-ocr") return;
  runOcrQueued(msg)
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

function parseCountdownText(text) {
  if (!text) return null;
  var t = String(text)
    .replace(/[oO]/g, "0")
    .replace(/[lI]/g, "1")
    .replace(/,/g, ".")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  var hasMoney = /\$/.test(t) || /\d\s*\$/.test(t);
  var best = null;
  var re = /(\d{1,2})[:.](\d{2})(?!\d)/g;
  var m;
  while ((m = re.exec(t))) {
    var mm = parseInt(m[1], 10), ss = parseInt(m[2], 10);
    if (!isFinite(mm) || !isFinite(ss) || ss > 59 || mm >= 15) continue;
    var total = mm * 60 + ss;
    if (total <= 0 || total > 600) continue;
    if (!hasMoney && mm !== 0) continue;
    if (best == null || total < best) best = total;
  }
  if (best == null && hasMoney) {
    var m2 = t.match(/\b0{1,2}\s+([0-5]\d)\b/);
    if (m2) {
      var ss2 = parseInt(m2[1], 10);
      if (ss2 > 0 && ss2 <= 59) best = ss2;
    }
  }
  if (best == null) return null;
  return { sec: best, text: t, hasMoney: hasMoney };
}

function imageDataToCanvas(img) {
  var c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").putImageData(img, 0, 0);
  return c;
}

function runOcrQueued(msg) {
  var job = ocrChain.then(function () { return runOcr(msg); });
  ocrChain = job.then(function () {}, function () {});
  return job;
}

async function runOcr(msg) {
  if (!msg.dataUrl) return { ok: false, error: "empty capture" };
  if (typeof DigitOcr === "undefined" || !DigitOcr.pngToImageData) {
    return { ok: false, error: "crop helper missing" };
  }
  var opts = { rect: msg.rect, dpr: msg.dpr };
  var img = await DigitOcr.pngToImageData(msg.dataUrl);
  var worker = await getWorker();
  var priceGot = null;
  var rawPrice = "";
  var tagCrop = DigitOcr.cropLiveTagImageData(img, opts);
  if (tagCrop) {
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789.",
      tessedit_pageseg_mode: "7"
    });
    var priceCanvas = imageDataToCanvas(tagCrop);
    var priceResult = await worker.recognize(priceCanvas, {}, { text: true });
    rawPrice = priceResult && priceResult.data ? String(priceResult.data.text || "") : "";
    priceGot = parsePriceText(rawPrice);
  }
  var cdGot = null;
  var rawCd = "";
  if (msg.needCd !== false && DigitOcr.cropTradeBubbleImageData) {
    var bubbleCrop = DigitOcr.cropTradeBubbleImageData(img, opts);
    if (bubbleCrop) {
      await worker.setParameters({
        tessedit_char_whitelist: "0123456789:$+ ",
        tessedit_pageseg_mode: "6"
      });
      var cdCanvas = imageDataToCanvas(bubbleCrop);
      var cdResult = await worker.recognize(cdCanvas, {}, { text: true });
      rawCd = cdResult && cdResult.data ? String(cdResult.data.text || "") : "";
      cdGot = parseCountdownText(rawCd);
      await worker.setParameters({
        tessedit_char_whitelist: "0123456789.",
        tessedit_pageseg_mode: "7"
      });
    }
  }
  var resp = { ok: false };
  if (priceGot && priceGot.v != null) {
    resp.ok = true;
    resp.v = priceGot.v;
    resp.text = priceGot.text;
  } else {
    resp.error = "no tag";
    if (rawPrice) resp.text = rawPrice;
  }
  if (cdGot && cdGot.sec != null) {
    resp.cdSec = cdGot.sec;
    resp.cdText = cdGot.text || rawCd;
    resp.cdMoney = !!cdGot.hasMoney;
  } else if (rawCd) {
    resp.cdText = rawCd;
  }
  return resp;
}

getWorker().catch(function () {});
