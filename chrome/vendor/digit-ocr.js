/**
 * Minimal digit OCR for the Quotex right-axis live price tag.
 * Tesseract.js wasm/core is several MB per file — too large to vendor.
 * Reads a tiny crop of white digits on a bright blue/cyan rounded rect
 * (e.g. 0.58264). Whitelist 0123456789. PSM-style single line.
 */
(function (root) {
  "use strict";

  var PRICE_RE = /(\d{1,6}\.\d{1,6})/;
  var PROTOS = {
    "0": [1,1,1, 1,0,1, 1,0,1, 1,0,1, 1,1,1],
    "1": [0.2,1,0.1, 0.4,1,0.1, 0.1,1,0.1, 0.1,1,0.1, 0.6,1,0.6],
    "1b": [0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0],
    "2": [1,1,1, 0.1,0.1,1, 0.3,1,0.7, 1,0.2,0.1, 1,1,1],
    "3": [1,1,1, 0.1,0.2,1, 0.3,1,1, 0.1,0.2,1, 1,1,1],
    "4": [1,0.1,1, 1,0.1,1, 1,1,1, 0.1,0.2,1, 0.1,0.1,1],
    "5": [1,1,1, 1,0.15,0.1, 1,1,1, 0.1,0.2,1, 1,1,1],
    "6": [1,1,1, 1,0.15,0.1, 1,1,1, 1,0.15,1, 1,1,1],
    "7": [1,1,1, 0.1,0.2,1, 0.1,0.7,0.4, 0.2,1,0.1, 0.3,0.8,0.1],
    "8": [1,1,1, 1,0.15,1, 1,1,1, 1,0.15,1, 1,1,1],
    "9": [1,1,1, 1,0.15,1, 1,1,1, 0.1,0.2,1, 1,1,1]
  };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function makeImageData(w, h) {
    if (typeof ImageData === "function") {
      try { return new ImageData(w, h); } catch (_e) {}
    }
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    var h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d + 6) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: h, s: max === 0 ? 0 : d / max, v: max };
  }

  function isBlueTagPx(r, g, b, a) {
    if (a < 180) return false;
    var hsv = rgbToHsv(r, g, b);
    if (hsv.s < 0.32 || hsv.v < 0.32) return false;
    if (hsv.h >= 165 && hsv.h <= 245) return true;
    if (b > 150 && b > r + 20 && b >= g - 10 && g > 50) return true;
    return false;
  }

  function otsu(hist, total) {
    var sum = 0, i;
    for (i = 0; i < 256; i++) sum += i * hist[i];
    var sumB = 0, wB = 0, wF = 0, varMax = 0, thr = 160;
    for (i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      wF = total - wB;
      if (!wF) break;
      sumB += i * hist[i];
      var mB = sumB / wB, mF = (sum - sumB) / wF;
      var v = wB * wF * (mB - mF) * (mB - mF);
      if (v > varMax) { varMax = v; thr = i; }
    }
    return thr;
  }

  function cropImageData(src, x, y, w, h) {
    x = Math.max(0, x | 0); y = Math.max(0, y | 0);
    w = Math.max(1, w | 0); h = Math.max(1, h | 0);
    if (x + w > src.width) w = src.width - x;
    if (y + h > src.height) h = src.height - y;
    if (w < 1 || h < 1) return null;
    var out = makeImageData(w, h);
    var s = src.data, d = out.data;
    for (var row = 0; row < h; row++) {
      var si = ((y + row) * src.width + x) * 4;
      var di = row * w * 4;
      d.set(s.subarray(si, si + w * 4), di);
    }
    return out;
  }

  function scaleNearest(src, scale) {
    scale = scale || 3;
    var nw = Math.max(1, Math.round(src.width * scale));
    var nh = Math.max(1, Math.round(src.height * scale));
    var out = makeImageData(nw, nh);
    var s = src.data, d = out.data;
    var sw = src.width, sh = src.height;
    for (var y = 0; y < nh; y++) {
      var sy = Math.min(sh - 1, (y / scale) | 0);
      for (var x = 0; x < nw; x++) {
        var sx = Math.min(sw - 1, (x / scale) | 0);
        var si = (sy * sw + sx) * 4, di = (y * nw + x) * 4;
        d[di] = s[si]; d[di + 1] = s[si + 1]; d[di + 2] = s[si + 2]; d[di + 3] = s[si + 3];
      }
    }
    return out;
  }

  function findBlueBlobs(imageData) {
    var w = imageData.width, h = imageData.height, data = imageData.data;
    var n = w * h;
    var seen = new Uint8Array(n);
    var blobs = [];
    function isBlueAt(p) {
      var o = p * 4;
      return isBlueTagPx(data[o], data[o + 1], data[o + 2], data[o + 3]);
    }
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var start = y * w + x;
        if (seen[start] || !isBlueAt(start)) continue;
        var stack = [start];
        seen[start] = 1;
        var minX = x, maxX = x, minY = y, maxY = y, count = 0;
        while (stack.length) {
          var p = stack.pop();
          var px = p % w, py = (p / w) | 0;
          count++;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
          var nbs = [p - 1, p + 1, p - w, p + w];
          for (var i = 0; i < 4; i++) {
            var q = nbs[i];
            if (q < 0 || q >= n) continue;
            var qx = q % w;
            if (qx - px > 1 || px - qx > 1) continue;
            if (seen[q] || !isBlueAt(q)) continue;
            seen[q] = 1;
            stack.push(q);
          }
        }
        blobs.push({
          minX: minX, minY: minY, maxX: maxX, maxY: maxY,
          w: maxX - minX + 1, h: maxY - minY + 1, count: count
        });
      }
    }
    return blobs;
  }

  function pickTagBlobs(blobs, dpr) {
    dpr = dpr > 0 ? dpr : 1;
    var minW = 28 * dpr * 0.7;
    var maxW = 140 * dpr;
    var minH = 11 * dpr * 0.7;
    var maxH = 40 * dpr;
    var good = [];
    for (var i = 0; i < blobs.length; i++) {
      var b = blobs[i];
      if (b.w < minW || b.w > maxW) continue;
      if (b.h < minH || b.h > maxH) continue;
      var ar = b.w / b.h;
      if (ar < 1.2 || ar > 12) continue;
      if (b.count < b.w * b.h * 0.18) continue;
      good.push(b);
    }
    good.sort(function (a, c) {
      return (c.minX - a.minX) || (c.count - a.count);
    });
    return good;
  }

  function toBinary(img, fixedThr) {
    var w = img.width, h = img.height, data = img.data;
    var hist = new Uint32Array(256);
    var lum = new Uint8Array(w * h);
    var i, o, L;
    for (i = 0; i < w * h; i++) {
      o = i * 4;
      L = (0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2] + 0.5) | 0;
      lum[i] = L;
      hist[L]++;
    }
    var thr = fixedThr != null ? fixedThr : otsu(hist, w * h);
    if (fixedThr == null) {
      if (thr < 110) thr = 140;
      if (thr > 220) thr = 190;
    }
    var bin = new Uint8Array(w * h);
    var ink = 0;
    for (i = 0; i < lum.length; i++) {
      if (lum[i] >= thr) { bin[i] = 1; ink++; }
    }
    /* white digits on blue: ink should be the minority */
    if (ink > w * h * 0.55) {
      for (i = 0; i < bin.length; i++) bin[i] = bin[i] ? 0 : 1;
    }
    return { bin: bin, w: w, h: h };
  }

  function dilate4(src) {
    var w = src.w, h = src.h, b = src.bin;
    var out = new Uint8Array(b.length);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var p = y * w + x;
        if (b[p]) { out[p] = 1; continue; }
        if ((x > 0 && b[p - 1]) || (x + 1 < w && b[p + 1]) ||
            (y > 0 && b[p - w]) || (y + 1 < h && b[p + w])) out[p] = 1;
      }
    }
    return { bin: out, w: w, h: h };
  }

  function countHoles(bin, w, h, gx, gy, gw, gh) {
    var n = gw * gh;
    var seen = new Uint8Array(n);
    function ink(lx, ly) {
      if (lx < 0 || ly < 0 || lx >= gw || ly >= gh) return 1;
      return bin[(gy + ly) * w + (gx + lx)];
    }
    function bfsEmpty(sx, sy, fromBorder) {
      if (ink(sx, sy) || seen[sy * gw + sx]) return 0;
      var stack = [sy * gw + sx];
      seen[sy * gw + sx] = 1;
      var touchedBorder = fromBorder;
      var count = 0;
      while (stack.length) {
        var p = stack.pop();
        var x = p % gw, y = (p / gw) | 0;
        count++;
        if (x === 0 || y === 0 || x === gw - 1 || y === gh - 1) touchedBorder = 1;
        var nbs = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        for (var i = 0; i < 4; i++) {
          var nx = nbs[i][0], ny = nbs[i][1];
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          var q = ny * gw + nx;
          if (seen[q] || ink(nx, ny)) continue;
          seen[q] = 1;
          stack.push(q);
        }
      }
      return touchedBorder ? 0 : 1;
    }
    var holes = 0;
    var x, y;
    for (x = 0; x < gw; x++) {
      bfsEmpty(x, 0, 1);
      bfsEmpty(x, gh - 1, 1);
    }
    for (y = 0; y < gh; y++) {
      bfsEmpty(0, y, 1);
      bfsEmpty(gw - 1, y, 1);
    }
    for (y = 1; y < gh - 1; y++) {
      for (x = 1; x < gw - 1; x++) {
        if (!ink(x, y) && !seen[y * gw + x]) holes += bfsEmpty(x, y, 0);
      }
    }
    return holes;
  }

  function holeCentroidY(bin, w, h, gx, gy, gw, gh) {
    var sumY = 0, n = 0;
    var seen = new Uint8Array(gw * gh);
    function ink(lx, ly) {
      if (lx < 0 || ly < 0 || lx >= gw || ly >= gh) return 1;
      return bin[(gy + ly) * w + (gx + lx)];
    }
    function markBorder(sx, sy) {
      if (ink(sx, sy) || seen[sy * gw + sx]) return;
      var stack = [sy * gw + sx];
      seen[sy * gw + sx] = 1;
      while (stack.length) {
        var p = stack.pop();
        var x = p % gw, y = (p / gw) | 0;
        var nbs = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        for (var i = 0; i < 4; i++) {
          var nx = nbs[i][0], ny = nbs[i][1];
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          var q = ny * gw + nx;
          if (seen[q] || ink(nx, ny)) continue;
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    var x, y;
    for (x = 0; x < gw; x++) { markBorder(x, 0); markBorder(x, gh - 1); }
    for (y = 0; y < gh; y++) { markBorder(0, y); markBorder(gw - 1, y); }
    for (y = 1; y < gh - 1; y++) {
      for (x = 1; x < gw - 1; x++) {
        if (!ink(x, y) && !seen[y * gw + x]) { sumY += y; n++; }
      }
    }
    if (!n) return 0.5;
    return (sumY / n) / gh;
  }

  function cellDensities(bin, w, gx, gy, gw, gh) {
    var cells = 15, out = new Array(cells), c;
    for (c = 0; c < cells; c++) out[c] = 0;
    var colW = gw / 3, rowH = gh / 5;
    var x, y;
    for (y = 0; y < gh; y++) {
      var ry = Math.min(4, (y / rowH) | 0);
      for (x = 0; x < gw; x++) {
        var cx = Math.min(2, (x / colW) | 0);
        if (bin[(gy + y) * w + (gx + x)]) out[ry * 3 + cx]++;
      }
    }
    var cellA = Math.max(1, (gw / 3) * (gh / 5));
    for (c = 0; c < cells; c++) out[c] = out[c] / cellA;
    return out;
  }

  function cosine(a, b) {
    var dot = 0, na = 0, nb = 0, i;
    for (i = 0; i < a.length; i++) {
      var av = a[i] || 0, bv = b[i] || 0;
      dot += av * bv; na += av * av; nb += bv * bv;
    }
    if (na < 1e-9 || nb < 1e-9) return 0;
    return dot / Math.sqrt(na * nb);
  }

  function stemFracs(bin, w, gx, gy, gw, gh) {
    var midY = (gh / 2) | 0;
    var leftW = Math.max(1, (gw * 0.34) | 0);
    var right0 = gw - leftW;
    var lt = 0, lb = 0, rt = 0, rb = 0, nL = 0, nR = 0, nT = 0, nB = 0;
    var x, y;
    for (y = 0; y < gh; y++) {
      for (x = 0; x < gw; x++) {
        var v = bin[(gy + y) * w + (gx + x)] ? 1 : 0;
        if (y < midY) nT++; else nB++;
        if (x < leftW) {
          nL++;
          if (y < midY) lt += v; else lb += v;
        } else if (x >= right0) {
          nR++;
          if (y < midY) rt += v; else rb += v;
        }
      }
    }
    var qL = Math.max(1, nL / 2), qR = Math.max(1, nR / 2);
    return {
      leftTop: lt / qL,
      leftBot: lb / qL,
      rightTop: rt / qR,
      rightBot: rb / qR
    };
  }

  function classifyGlyph(bin, w, h, gx, gy, gw, gh, lineH) {
    if (gw < 1 || gh < 1) return "";
    if (gh < lineH * 0.38 && gw < lineH * 0.55 && gw * gh < (lineH * lineH) * 0.22) {
      return ".";
    }
    var aspect = gw / gh;
    if (aspect < 0.32 && gh > lineH * 0.55) return "1";
    var dens = cellDensities(bin, w, gx, gy, gw, gh);
    var holes = countHoles(bin, w, h, gx, gy, gw, gh);
    var holeY = holes ? holeCentroidY(bin, w, h, gx, gy, gw, gh) : 0.5;
    var st = stemFracs(bin, w, gx, gy, gw, gh);
    var leftFull = st.leftTop > 0.28 && st.leftBot > 0.28;
    var leftTopOnly = st.leftTop > 0.28 && st.leftBot < 0.18;
    var leftBotOnly = st.leftBot > 0.28 && st.leftTop < 0.18;
    var best = "?", bestS = -1;
    var keys = Object.keys(PROTOS);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var s = cosine(dens, PROTOS[k]);
      var ch = k.charAt(0);
      if (holes === 2) {
        if (ch === "8") s += 0.45;
        else if (ch === "0" || ch === "6" || ch === "9") s -= 0.12;
        else s -= 0.28;
      } else if (holes === 1) {
        if (ch === "1" || ch === "2" || ch === "3" || ch === "5" || ch === "7") s -= 0.32;
        if (ch === "0") {
          if (leftFull && holeY >= 0.40 && holeY <= 0.56) s += 0.40;
          else if (leftFull) s += 0.04;
          else s -= 0.06;
        }
        if (ch === "4") s += leftTopOnly ? 0.16 : -0.04;
        if (ch === "6") {
          if (holeY > 0.54) s += 0.40;
          else s -= 0.16;
          if (leftBotOnly) s += 0.08;
        }
        if (ch === "9") {
          if (holeY < 0.46) s += 0.40;
          else s -= 0.16;
          if (leftTopOnly) s += 0.08;
        }
      } else {
        if (ch === "0" || ch === "8" || ch === "6" || ch === "9") s -= 0.22;
        if (ch === "4") s += 0.04;
      }
      if (aspect < 0.42 && ch === "1") s += 0.2;
      if (s > bestS) { bestS = s; best = ch; }
    }
    return best === "?" ? "" : best;
  }

  function inkBounds(bin, w, h) {
    var minX = w, maxX = -1, minY = h, maxY = -1, x, y;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        if (!bin[y * w + x]) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return null;
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }

  function segmentAndRead(binImg) {
    var bin = binImg.bin, w = binImg.w, h = binImg.h;
    var b = inkBounds(bin, w, h);
    if (!b) return "";
    var col = new Uint16Array(w);
    var x, y, maxCol = 0;
    for (x = b.minX; x <= b.maxX; x++) {
      var c = 0;
      for (y = b.minY; y <= b.maxY; y++) if (bin[y * w + x]) c++;
      col[x] = c;
      if (c > maxCol) maxCol = c;
    }
    var thr = Math.max(1, Math.round(maxCol * 0.08));
    var runs = [];
    x = b.minX;
    while (x <= b.maxX) {
      while (x <= b.maxX && col[x] < thr) x++;
      if (x > b.maxX) break;
      var x0 = x;
      while (x <= b.maxX && col[x] >= thr) x++;
      runs.push({ x0: x0, x1: x - 1 });
    }
    if (!runs.length) return "";
    var lineH = b.maxY - b.minY + 1;
    var glyphs = [];
    for (var r = 0; r < runs.length; r++) {
      var gx0 = runs[r].x0, gx1 = runs[r].x1;
      var gy0 = h, gy1 = 0, inkN = 0;
      for (y = b.minY; y <= b.maxY; y++) {
        for (x = gx0; x <= gx1; x++) {
          if (!bin[y * w + x]) continue;
          inkN++;
          if (y < gy0) gy0 = y;
          if (y > gy1) gy1 = y;
        }
      }
      if (!inkN) continue;
      glyphs.push({ gx: gx0, gy: gy0, gw: gx1 - gx0 + 1, gh: gy1 - gy0 + 1 });
    }
    var parts = [];
    for (var g = 0; g < glyphs.length; g++) {
      var gl = glyphs[g];
      parts.push(classifyGlyph(bin, w, h, gl.gx, gl.gy, gl.gw, gl.gh, lineH));
    }
    return parts.join("");
  }

  function parsePrice(text) {
    if (!text) return null;
    var t = String(text).replace(/,/g, ".").replace(/[^\d.]/g, "");
    var m = t.match(PRICE_RE);
    if (!m) return null;
    var v = parseFloat(m[1]);
    if (!isFinite(v) || v < 0.05) return null;
    return v;
  }

  function ocrBlob(full, blob) {
    var padX = Math.max(2, (blob.w * 0.04) | 0);
    var padY = Math.max(2, (blob.h * 0.12) | 0);
    var crop = cropImageData(
      full,
      blob.minX - padX,
      blob.minY - padY,
      blob.w + padX * 2,
      blob.h + padY * 2
    );
    if (!crop) return null;
    var scale = crop.height < 36 ? 4 : crop.height < 56 ? 3 : 2;
    var up = scaleNearest(crop, scale);
    var tries = [null, 150, 170, 185, 200];
    var lastText = "";
    var t;
    for (t = 0; t < tries.length; t++) {
      var bw = toBinary(up, tries[t]);
      var text = segmentAndRead(bw);
      if (text) lastText = text;
      var v = parsePrice(text);
      if (v != null) return { v: v, text: text };
      var bw2 = dilate4(bw);
      text = segmentAndRead(bw2);
      if (text) lastText = text;
      v = parsePrice(text);
      if (v != null) return { v: v, text: text };
    }
    return lastText ? { v: null, text: lastText } : null;
  }

  async function pngToImageData(dataUrl) {
    var res = await fetch(dataUrl);
    var blob = await res.blob();
    var bmp = await createImageBitmap(blob);
    var c = new OffscreenCanvas(bmp.width, bmp.height);
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    var img = ctx.getImageData(0, 0, bmp.width, bmp.height);
    try { bmp.close(); } catch (_e) {}
    return img;
  }

  async function readPriceFromPngDataUrl(dataUrl, opts) {
    var img = await pngToImageData(dataUrl);
    return readPriceFromImageData(img, opts);
  }

  function readPriceFromImageData(img, opts) {
    opts = opts || {};
    var dpr = opts.dpr > 0 ? opts.dpr : 1;
    var cropRightCss = opts.cropRightCss > 0 ? opts.cropRightCss : 110;
    var cropTopCss = opts.cropTopCss >= 0 ? opts.cropTopCss : 70;
    var cropW = Math.max(40, Math.round(cropRightCss * dpr));
    var cropTop = Math.max(0, Math.round(cropTopCss * dpr));
    if (cropW > img.width) cropW = img.width;
    if (cropTop >= img.height - 20) cropTop = Math.max(0, (img.height * 0.08) | 0);
    var x0 = img.width - cropW;
    var strip = cropImageData(img, x0, cropTop, cropW, img.height - cropTop);
    if (!strip) return null;
    var blobs = pickTagBlobs(findBlueBlobs(strip), dpr);
    var i;
    for (i = 0; i < Math.min(blobs.length, 4); i++) {
      var got = ocrBlob(strip, blobs[i]);
      if (got && got.v != null) return got.v;
    }
    return null;
  }

  root.DigitOcr = {
    readPriceFromPngDataUrl: readPriceFromPngDataUrl,
    readPriceFromImageData: readPriceFromImageData,
    parsePrice: parsePrice,
    findBlueBlobs: findBlueBlobs,
    pickTagBlobs: pickTagBlobs
  };
})(typeof self !== "undefined" ? self : this);
