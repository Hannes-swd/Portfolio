/*
 * Minimaler PNG-Decoder ohne Abhängigkeiten (nur Node-Bordmittel).
 * Liefert { width, height, rgba } – rgba ist ein Uint8Array mit 4 Bytes pro Pixel.
 * Unterstützt alle Standard-Farbtypen und Bittiefen, kein Interlacing.
 */
'use strict';

const zlib = require('zlib');

function decodePNG(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error('Keine PNG-Datei');

  let pos = 8, width, height, depth, type, interlace, palette, trns;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const name = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (name === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (name === 'PLTE') palette = data;
    else if (name === 'tRNS') trns = data;
    else if (name === 'IDAT') idat.push(data);
    else if (name === 'IEND') break;
  }
  if (interlace) throw new Error('Interlaced PNGs werden nicht unterstützt');

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const bpp = Math.max(1, (channels * depth) >> 3);      // Bytes pro Pixel (für Filter)
  const stride = Math.ceil((width * channels * depth) / 8);
  const raw = zlib.inflateSync(Buffer.concat(idat));

  // Zeilenfilter rückgängig machen
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0;
      const b = y > 0 ? out[dst + x - stride] : 0;
      const c = x >= bpp && y > 0 ? out[dst + x - stride - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[dst + x] = v & 255;
    }
  }

  // Einzelnen Kanalwert lesen (auch bei 1/2/4/16 Bit)
  const max = (1 << Math.min(depth, 8)) - 1;
  function sample(y, n) {
    const row = y * stride;
    if (depth === 8) return out[row + n];
    if (depth === 16) return out[row + n * 2];
    const bit = n * depth;
    return (out[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & max;
  }
  const scale = v => (depth < 8 ? Math.round((v * 255) / max) : v);

  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = x * channels, o = (y * width + x) * 4;
      let r, g, b, a = 255;
      if (type === 3) {
        const idx = sample(y, n);
        r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
        if (trns && idx < trns.length) a = trns[idx];
      } else if (type === 0 || type === 4) {
        r = g = b = scale(sample(y, n));
        if (type === 4) a = scale(sample(y, n + 1));
      } else {
        r = scale(sample(y, n)); g = scale(sample(y, n + 1)); b = scale(sample(y, n + 2));
        if (type === 6) a = scale(sample(y, n + 3));
      }
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a;
    }
  }
  return { width, height, rgba };
}

module.exports = { decodePNG };
