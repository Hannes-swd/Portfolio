/*
 * PixelEngine – die ganze Seite als Raster aus gleich großen, dynamischen Pixeln.
 *
 * Jeder Pixel hat eine aktuelle Farbe (r, g, b, a) und eine Zielfarbe (tr, tg, tb, ta).
 * Pro Frame gleitet die aktuelle Farbe weich zur Zielfarbe. Was die Pixel tun,
 * bestimmen "Behaviors" – kleine Objekte mit optionalen Hooks:
 *
 *   {
 *     init(engine)                     – nach jedem Aufbau / Resize des Rasters
 *     update(engine, dt, time)         – jeden Frame (dt & time in Sekunden)
 *     hover(engine, i, col, row)       – Maus betritt einen Pixel
 *     leave(engine, i, col, row)       – Maus verlässt einen Pixel
 *     press(engine, i, col, row)       – Maustaste / Finger wird gedrückt
 *     release(engine, i, col, row)     – wieder losgelassen (i, col, row = Pixel vom Drücken)
 *     click(engine, i, col, row)       – echter Klick / Tap (Drücken + Loslassen ohne Ziehen)
 *   }
 *
 * Behaviors laufen in der Reihenfolge, in der sie mit engine.use() hinzugefügt wurden.
 *
 * Rendering: Jeder Rasterpixel ist genau ein Pixel in einem kleinen Puffer-Bild
 * (cols x rows). Dieses Bild wird ohne Glättung auf den Bildschirm hochskaliert.
 * Dadurch bleibt die Engine auch bei Hunderttausenden Pixeln flüssig.
 */
(function (global) {
  'use strict';

  // CSS-Farbe in ihr Negativ umrechnen (für den Randbereich im Dark Mode)
  function invertCss(css) {
    const c = document.createElement('canvas').getContext('2d');
    c.fillStyle = css;
    c.fillRect(0, 0, 1, 1);
    const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
    return `rgb(${255 - r},${255 - g},${255 - b})`;
  }

  class PixelEngine {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      // Das Raster füllt immer diesen Container aus (Standard: Elternelement des Canvas)
      this.container = options.container ?? canvas.parentElement;

      this.cellSize = options.cellSize ?? 6;    // Größe eines Pixels in CSS-px (wird auf ganze Bildschirmpixel gerundet)
      this.background = options.background ?? '#ffffff';
      this.easing = options.easing ?? 14;       // Wie schnell Farben zum Ziel gleiten (höher = schneller)
      this.clickTolerance = options.clickTolerance ?? 6; // max. Mausweg in px, damit es noch als Klick zählt
      this.invertSpeed = options.invertSpeed ?? 1.6;      // Dark-Mode-Übergang: Durchläufe pro Sekunde

      // Dark Mode = alle Farben umgedreht. _invert läuft weich von 0 nach 1 (oder zurück),
      // dazwischen sind die Pixel in zufälliger Reihenfolge schon umgedreht.
      this.inverted = false;
      this._invert = 0;

      // Schleier: legt eine Farbe über das ganze Raster (0 = aus, 1 = komplett bedeckt).
      // Overlays liegen darüber – z. B. für einen Bildschirmschoner.
      this.veil = 0;
      this.veilColor = options.veilColor ?? [255, 255, 255];
      this._bgInverted = invertCss(this.background);

      this.behaviors = [];
      this._overlay = [];
      // Klickbare Bereiche im Raster (z. B. Pixel-Buttons): { col, row, w, h }.
      // Andere Behaviors können mit zoneAt() prüfen, ob die Maus gerade über so einem Bereich ist.
      this.zones = [];
      this.mouse = { x: -1, y: -1, col: -1, row: -1, index: -1, inside: false };
      this.time = 0;
      this.running = false;
      this.visible = true;   // false, solange das Raster aus dem Bild gescrollt ist

      this.buffer = document.createElement('canvas');
      this.bufferCtx = this.buffer.getContext('2d');

      this._lastFrame = 0;
      this._frame = this._frame.bind(this);

      this._bindEvents();
      this.resize();
    }

    /* ---------- Raster ---------- */

    resize() {
      const dpr = global.devicePixelRatio || 1;
      this.dpr = dpr;
      this.width = this.container.clientWidth;
      this.height = this.container.clientHeight;

      // Ab hier wird intern in echten Bildschirmpixeln gerechnet,
      // damit jeder Rasterpixel exakt gleich groß ist
      this.canvas.width = Math.round(this.width * dpr);
      this.canvas.height = Math.round(this.height * dpr);
      this.canvas.style.width = this.width + 'px';
      this.canvas.style.height = this.height + 'px';
      // cellSize darf auch eine Funktion (breite, höhe) => px sein, z. B. für kleinere Pixel am Handy
      const cellSize = typeof this.cellSize === 'function'
        ? this.cellSize(this.width, this.height)
        : this.cellSize;
      this.cellPx = Math.max(1, Math.round(cellSize * dpr));

      // Nur so viele Pixel, wie komplett hineinpassen – keine angeschnittenen Pixel am Rand
      this.cols = Math.max(1, Math.floor(this.canvas.width / this.cellPx));
      this.rows = Math.max(1, Math.floor(this.canvas.height / this.cellPx));
      this.count = this.cols * this.rows;

      // Raster mittig ausrichten, der Restplatz verteilt sich gleichmäßig auf die Ränder
      this.offsetX = Math.floor((this.canvas.width - this.cols * this.cellPx) / 2);
      this.offsetY = Math.floor((this.canvas.height - this.rows * this.cellPx) / 2);

      this.buffer.width = this.cols;
      this.buffer.height = this.rows;
      this.image = this.bufferCtx.createImageData(this.cols, this.rows);
      // Reihenfolge, in der die Pixel beim Umschalten des Dark Mode kippen:
      // eine körnige Welle von oben links nach unten rechts
      this._invertOrder = new Float32Array(this.cols * this.rows);
      for (let i = 0; i < this._invertOrder.length; i++) {
        const diag = ((i % this.cols) / this.cols + ((i / this.cols) | 0) / this.rows) / 2;
        this._invertOrder[i] = diag * 0.8 + Math.random() * 0.2;
      }

      const n = this.count;
      this.r = new Float32Array(n); this.g = new Float32Array(n);
      this.b = new Float32Array(n); this.a = new Float32Array(n);
      this.tr = new Float32Array(n); this.tg = new Float32Array(n);
      this.tb = new Float32Array(n); this.ta = new Float32Array(n);
      // Freier Speicher pro Pixel für Behaviors (z. B. Timer, Zustände)
      this.data = new Array(n);
      for (let i = 0; i < n; i++) this.data[i] = {};

      this.mouse.col = this.mouse.row = this.mouse.index = -1;
      for (const b of this.behaviors) if (b.init) b.init(this);
    }

    index(col, row) {
      if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return -1;
      return row * this.cols + col;
    }

    colOf(i) { return i % this.cols; }
    rowOf(i) { return (i / this.cols) | 0; }

    // x, y = Bildschirmkoordinaten in CSS-px (clientX / clientY) – funktioniert auch,
    // wenn die Seite gescrollt ist
    cellAt(x, y) {
      const rect = this.canvas.getBoundingClientRect();
      const col = Math.floor(((x - rect.left) * this.dpr - this.offsetX) / this.cellPx);
      const row = Math.floor(((y - rect.top) * this.dpr - this.offsetY) / this.cellPx);
      return { col, row, index: this.index(col, row) };
    }

    forEachCell(fn) {
      for (let row = 0, i = 0; row < this.rows; row++) {
        for (let col = 0; col < this.cols; col++, i++) fn(i, col, row);
      }
    }

    // Alle Pixel im Kreis um (col, row) – praktisch für Pinsel, Wellen usw.
    forEachInRadius(col, row, radius, fn) {
      const reach = Math.ceil(radius);
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const d = Math.hypot(dx, dy);
          if (d > radius) continue;
          const i = this.index(col + dx, row + dy);
          if (i >= 0) fn(i, col + dx, row + dy, d);
        }
      }
    }

    // Bereich, der (col, row) enthält – oder null
    zoneAt(col, row) {
      for (const z of this.zones) {
        if (col >= z.col && row >= z.row && col < z.col + z.w && row < z.row + z.h) return z;
      }
      return null;
    }

    /* ---------- Farben ---------- */

    // Zielfarbe setzen – der Pixel gleitet weich dorthin
    setColor(i, r, g, b, a = 1) {
      if (i < 0 || i >= this.count) return;
      this.tr[i] = r; this.tg[i] = g; this.tb[i] = b; this.ta[i] = a;
    }

    // Farbe sofort setzen, ohne Übergang
    setColorNow(i, r, g, b, a = 1) {
      if (i < 0 || i >= this.count) return;
      this.r[i] = this.tr[i] = r;
      this.g[i] = this.tg[i] = g;
      this.b[i] = this.tb[i] = b;
      this.a[i] = this.ta[i] = a;
    }

    getColor(i) {
      return { r: this.r[i], g: this.g[i], b: this.b[i], a: this.a[i] };
    }

    // Overlay: Pixel nur für diesen einen Frame darüberlegen, ohne den Zustand des
    // Rasters zu verändern. Ideal für bewegte Dinge wie Partikel, Strahlen, Funken.
    // Muss jeden Frame (in update) neu gezeichnet werden.
    overlay(col, row, r, g, b, a = 1) {
      const i = this.index(col, row);
      if (i < 0 || a <= 0) return;
      this._overlay.push(i, r, g, b, a > 1 ? 1 : a);
    }

    /* ---------- Behaviors ---------- */

    use(behavior) {
      this.behaviors.push(behavior);
      if (behavior.init && this.count) behavior.init(this);
      return this;
    }

    remove(behavior) {
      this.behaviors = this.behaviors.filter(b => b !== behavior);
      return this;
    }

    _emit(hook, ...args) {
      for (const b of this.behaviors) {
        if (!b[hook]) continue;
        // Ein Fehler in einem Behavior soll nicht die ganze Seite einfrieren:
        // melden (einmal je Behavior und Hook) und mit den anderen weitermachen
        try {
          b[hook](this, ...args);
        } catch (err) {
          b._failed = b._failed || {};
          if (!b._failed[hook]) {
            b._failed[hook] = true;
            console.error(`PixelEngine: Fehler in ${hook}()`, err);
          }
        }
      }
    }

    /* ---------- Eingabe ---------- */

    _bindEvents() {
      let resizeTimer, lastW = -1, lastH = -1;
      new ResizeObserver(() => {
        const w = this.container.clientWidth, h = this.container.clientHeight;
        if (w === lastW && h === lastH) return;
        lastW = w; lastH = h;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => this.resize(), 100);
      }).observe(this.container);

      // Nicht sichtbar (weggescrollt) -> nicht rechnen und zeichnen
      new IntersectionObserver(entries => {
        this.visible = entries[0].isIntersecting;
      }).observe(this.canvas);

      global.addEventListener('pointermove', e => this._pointerMove(e.clientX, e.clientY));

      // Beim Scrollen wandern die Pixel unter der stehenden Maus durch –
      // die Hover-Position also mit der letzten Mausposition neu bestimmen
      global.addEventListener('scroll', () => {
        if (this._lastPointer) this._pointerMove(this._lastPointer.x, this._lastPointer.y);
      }, { passive: true });

      // Klick = Drücken und Loslassen ohne nennenswerte Bewegung dazwischen.
      // Gezählt wird der Pixel, auf dem gedrückt wurde. Nur Klicks auf das Raster
      // selbst zählen, nicht auf Inhalte darüber oder darunter.
      this.canvas.addEventListener('pointerdown', e => {
        this._pointerMove(e.clientX, e.clientY);
        const c = this.cellAt(e.clientX, e.clientY);
        this._press = { x: e.clientX, y: e.clientY, cell: c };
        if (c.index >= 0) this._emit('press', c.index, c.col, c.row);
      });
      global.addEventListener('pointerup', e => {
        const p = this._press;
        this._press = null;
        if (!p || p.cell.index < 0) return;
        this._emit('release', p.cell.index, p.cell.col, p.cell.row);
        const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y);
        if (moved <= this.clickTolerance) this._emit('click', p.cell.index, p.cell.col, p.cell.row);
      });
      // Abgebrochenes Drücken (Fenster verliert Fokus, Touch abgebrochen) zählt als Loslassen
      const cancelPress = () => {
        const p = this._press;
        this._press = null;
        if (p && p.cell.index >= 0) this._emit('release', p.cell.index, p.cell.col, p.cell.row);
      };
      global.addEventListener('pointercancel', cancelPress);
      document.addEventListener('pointerleave', () => { this._lastPointer = null; this._pointerLeave(); });
      global.addEventListener('blur', () => { cancelPress(); this._lastPointer = null; this._pointerLeave(); });
    }

    _pointerMove(x, y) {
      this._lastPointer = { x, y };
      const c = this.cellAt(x, y);

      // Maus außerhalb des Rasters (z. B. über dem Inhalt weiter unten)
      if (c.index < 0) {
        if (this.mouse.inside) this._pointerLeave();
        return;
      }

      this.mouse.x = x;
      this.mouse.y = y;
      this.mouse.inside = true;

      const prevCol = this.mouse.col, prevRow = this.mouse.row;
      if (c.col === prevCol && c.row === prevRow) return;

      if (prevCol === -1) {
        this._enterCell(c.col, c.row);
      } else {
        // Bei schnellen Bewegungen alle Pixel auf der Strecke mitnehmen (Bresenham),
        // damit keine Lücken in der "Spur" entstehen
        this._walkLine(prevCol, prevRow, c.col, c.row);
      }
    }

    _walkLine(x0, y0, x1, y1) {
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      while (x0 !== x1 || y0 !== y1) {
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
        this._enterCell(x0, y0);
      }
    }

    _enterCell(col, row) {
      const m = this.mouse;
      if (m.index >= 0) this._emit('leave', m.index, m.col, m.row);
      m.col = col; m.row = row;
      m.index = this.index(col, row);
      // Über klickbaren Bereichen die Hand als Mauszeiger zeigen
      m.zone = this.zoneAt(col, row);
      this.canvas.style.cursor = m.zone ? 'pointer' : '';
      if (m.index >= 0) this._emit('hover', m.index, col, row);
    }

    _pointerLeave() {
      const m = this.mouse;
      if (m.index >= 0) this._emit('leave', m.index, m.col, m.row);
      m.inside = false;
      m.zone = null;
      this.canvas.style.cursor = '';
      m.col = m.row = m.index = -1;
    }

    /* ---------- Dark Mode ---------- */

    // Alle Farben umdrehen (true) oder normal (false). animate = false schaltet sofort um.
    setInverted(on, animate = true) {
      this.inverted = !!on;
      if (!animate) this._invert = this.inverted ? 1 : 0;
      return this;
    }

    toggleInverted() {
      return this.setInverted(!this.inverted);
    }

    /* ---------- Loop ---------- */

    start() {
      if (this.running) return this;
      this.running = true;
      this._lastFrame = performance.now();
      requestAnimationFrame(this._frame);
      return this;
    }

    stop() {
      this.running = false;
      return this;
    }

    _frame(now) {
      if (!this.running) return;
      // Nächsten Frame zuerst anmelden – so läuft die Schleife auch nach einem Fehler weiter
      requestAnimationFrame(this._frame);
      // dt begrenzen: nie negativ (Zeitstempel des ersten Frames kann vor start() liegen),
      // nie riesig (nach Tab-Wechsel) – sonst schießen die Farbübergänge über das Ziel hinaus
      const dt = Math.max(0, Math.min((now - this._lastFrame) / 1000, 0.1));
      this._lastFrame = now;

      if (this.visible) {
        this.time += dt;
        const target = this.inverted ? 1 : 0;
        if (this._invert !== target) {
          const step = this.invertSpeed * dt;
          this._invert = target ? Math.min(1, this._invert + step) : Math.max(0, this._invert - step);
        }
        this._emit('update', dt, this.time);
        this._ease(dt);
        this._render();
      }
    }

    _ease(dt) {
      const k = 1 - Math.exp(-this.easing * dt);
      const { r, g, b, a, tr, tg, tb, ta } = this;
      for (let i = 0; i < this.count; i++) {
        r[i] += (tr[i] - r[i]) * k;
        g[i] += (tg[i] - g[i]) * k;
        b[i] += (tb[i] - b[i]) * k;
        a[i] += (ta[i] - a[i]) * k;
      }
    }

    _render() {
      const px = this.image.data;
      const { r, g, b, a } = this;
      for (let i = 0, p = 0; i < this.count; i++, p += 4) {
        px[p] = r[i];
        px[p + 1] = g[i];
        px[p + 2] = b[i];
        px[p + 3] = a[i] * 255;
      }

      // Schleier über das Raster legen
      const v = this.veil;
      if (v > 0) {
        const [vr, vg, vb] = this.veilColor;
        for (let p = 0; p < px.length; p += 4) {
          px[p] += (vr - px[p]) * v;
          px[p + 1] += (vg - px[p + 1]) * v;
          px[p + 2] += (vb - px[p + 2]) * v;
        }
      }

      // Overlay-Pixel darüber mischen
      const ov = this._overlay;
      for (let k = 0; k < ov.length; k += 5) {
        const p = ov[k] * 4, oa = ov[k + 4];
        px[p] += (ov[k + 1] - px[p]) * oa;
        px[p + 1] += (ov[k + 2] - px[p + 1]) * oa;
        px[p + 2] += (ov[k + 3] - px[p + 2]) * oa;
        px[p + 3] = 255;
      }
      ov.length = 0;

      // Dark Mode: Farben umdrehen – während des Übergangs nur die Pixel, die schon dran sind
      const inv = this._invert;
      if (inv > 0) {
        const order = this._invertOrder;
        for (let i = 0, p = 0; i < this.count; i++, p += 4) {
          if (inv < 1 && order[i] >= inv) continue;
          px[p] = 255 - px[p];
          px[p + 1] = 255 - px[p + 1];
          px[p + 2] = 255 - px[p + 2];
        }
      }

      this.bufferCtx.putImageData(this.image, 0, 0);

      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = inv >= 0.5 ? this._bgInverted : this.background;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.buffer, this.offsetX, this.offsetY,
        this.cols * this.cellPx, this.rows * this.cellPx);
    }
  }

  global.PixelEngine = PixelEngine;
})(window);
