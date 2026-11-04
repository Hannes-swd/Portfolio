/*
 * Wandelt die gepixelten PNGs aus /assets in Punktdaten für die PixelEngine um.
 *
 *   node tools/convert-shapes.js
 *
 * Ein Pixel zählt als "an", wenn er deckend und dunkel ist. Für jede Form entsteht:
 *
 *   { width, height,        – Größe nach Zuschneiden auf die gesetzten Pixel
 *     x: [...], y: [...],   – Koordinaten aller gesetzten Pixel (0 = oben links)
 *     order: [...] }        – Schreib-Reihenfolge je Pixel, 0…1000
 *
 * Die Schreib-Reihenfolge entsteht so: Die Form wird in zusammenhängende Teile
 * (Buchstaben, Striche) zerlegt, die von links nach rechts sortiert werden. In jedem
 * Teil läuft eine Breitensuche vom linkesten Pixel aus entlang des Strichs. Der
 * Abstand entlang des Strichs ergibt die Reihenfolge – so "schreibt" sich die Form
 * später wie mit einem Stift.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { decodePNG } = require('./png');

const root = path.join(__dirname, '..');
const SOURCES = {
  name: 'assets/name.png',
  logo: 'assets/logo.png',
  logoSmall: 'assets/logo-small.png'
};

function isOn(rgba, i) {
  const o = i * 4;
  return rgba[o + 3] > 127 && rgba[o] + rgba[o + 1] + rgba[o + 2] < 384;
}

// Eine PNG-Datei -> Bitmap { w, h, on } (auf die gesetzten Pixel zugeschnitten)
function loadBitmap(file) {
  const { width, height, rgba } = decodePNG(fs.readFileSync(path.join(root, file)));

  // Auf die gesetzten Pixel zuschneiden
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isOn(rgba, y * width + x)) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const on = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) on[y * w + x] = isOn(rgba, (y + minY) * width + (x + minX)) ? 1 : 0;
  }
  return { w, h, on };
}

// Bitmap um den Faktor 2 verkleinern: ein neuer Pixel ist an, wenn mindestens
// 2 der 4 alten an waren – so bleiben dünne Striche erhalten
function halve({ w, h, on }) {
  const nw = Math.ceil(w / 2), nh = Math.ceil(h / 2);
  const out = new Uint8Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      let n = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = x * 2 + dx, sy = y * 2 + dy;
          if (sx < w && sy < h) n += on[sy * w + sx];
        }
      }
      out[y * nw + x] = n >= 2 ? 1 : 0;
    }
  }
  return { w: nw, h: nh, on: out };
}

// Bitmap -> Form mit Schreib-Reihenfolge
function convert({ w, h, on }) {
  // Zusammenhängende Teile finden (8er-Nachbarschaft)
  const comp = new Int32Array(w * h).fill(-1);
  const parts = [];
  const neighbors = (i, fn) => {
    const x = i % w, y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (on[j]) fn(j);
      }
    }
  };
  for (let i = 0; i < w * h; i++) {
    if (!on[i] || comp[i] >= 0) continue;
    const id = parts.length, pixels = [i];
    comp[i] = id;
    for (let k = 0; k < pixels.length; k++) {
      neighbors(pixels[k], j => { if (comp[j] < 0) { comp[j] = id; pixels.push(j); } });
    }
    // Startpunkt: linkester Pixel, bei Gleichstand der oberste
    let start = pixels[0];
    for (const p of pixels) {
      const px = p % w, sx = start % w;
      if (px < sx || (px === sx && p < start)) start = p;
    }
    parts.push({ pixels, start, left: start % w });
  }
  parts.sort((a, b) => a.left - b.left);

  // Abstand entlang des Strichs je Teil, Teile hintereinander gehängt
  const dist = new Float64Array(w * h).fill(-1);
  let offset = 0;
  for (const part of parts) {
    const queue = [part.start];
    dist[part.start] = offset;
    let maxD = offset;
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k];
      neighbors(i, j => {
        if (dist[j] >= 0) return;
        dist[j] = dist[i] + 1;
        if (dist[j] > maxD) maxD = dist[j];
        queue.push(j);
      });
    }
    offset = maxD + 1;
  }

  const xs = [], ys = [], order = [];
  const total = Math.max(1, offset - 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!on[i]) continue;
      xs.push(x);
      ys.push(y);
      order.push(Math.round((dist[i] / total) * 1000));
    }
  }
  return { width: w, height: h, count: xs.length, x: xs, y: ys, order };
}

let out = '/* Automatisch erzeugt von tools/convert-shapes.js – nicht von Hand bearbeiten. */\n';
out += 'window.Shapes = window.Shapes || {};\n';

// Kleiner Name fürs Handy: eigene Datei assets/name-small.png, falls vorhanden,
// sonst automatisch aus dem großen Namen auf halbe Größe verkleinert
const bitmaps = {};
for (const [name, file] of Object.entries(SOURCES)) bitmaps[name] = { file, bmp: loadBitmap(file) };
bitmaps.nameSmall = fs.existsSync(path.join(root, 'assets/name-small.png'))
  ? { file: 'assets/name-small.png', bmp: loadBitmap('assets/name-small.png') }
  : { file: 'assets/name.png (halbiert)', bmp: halve(bitmaps.name.bmp) };

for (const [name, { file, bmp }] of Object.entries(bitmaps)) {
  const s = convert(bmp);
  out += `\n// ${file}: ${s.width}x${s.height}, ${s.count} Pixel\n`;
  out += `Shapes.${name} = {\n`;
  out += `  width: ${s.width}, height: ${s.height}, count: ${s.count},\n`;
  out += `  x: [${s.x.join(',')}],\n`;
  out += `  y: [${s.y.join(',')}],\n`;
  out += `  order: [${s.order.join(',')}]\n};\n`;
  console.log(`${name}: ${s.width}x${s.height}, ${s.count} Pixel`);
}
fs.writeFileSync(path.join(root, 'js/shapes.js'), out);
console.log('-> js/shapes.js geschrieben');
