/*
 * Spiele im Pixelfeld. Man startet sie, indem man ihr Wort auf der Seite tippt:
 *
 *   snake · tetris · pong · breakout · invaders · flappy · mines · life · simon · dodge
 *
 * Esc beendet ein Spiel, ein anderes Wort wechselt es. Die Steuerung steht bei jedem
 * Spiel im Kommentar.
 *
 * Technik: arcade() liefert ein Behavior für die PixelEngine. Das Spiel wird als Overlay
 * über das bestehende Raster gezeichnet. Der Schriftzug in der Mitte wird während des Spiels
 * ausgeblendet (nameShape.hide()); Logo, Hintergrund und Himmel bleiben sichtbar.
 * Jedes Spiel hat ein eigenes Logik-Raster (bw x bh Zellen), das ganzzahlig auf das
 * Pixelfeld skaliert wird. Deshalb wirkt Tetris mit seinen Klötzen größer als Snake.
 */
(function (global) {
  'use strict';

  const INK = [34, 34, 34], MID = [110, 110, 110], SOFT = [200, 200, 200], WHITE = [255, 255, 255];
  // Grautöne für die Tetris-Teile, von dunkel nach hell
  const TONES = [[40, 40, 40], [70, 70, 70], [100, 100, 100], [130, 130, 130], [155, 155, 155], [180, 180, 180], [205, 205, 205]];
  const BRICK = [[34, 34, 34], [62, 62, 62], [92, 92, 92], [124, 124, 124], [158, 158, 158]];
  const SCROLL_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pad = (n, len = 4) => String(Math.max(0, Math.floor(n))).padStart(len, '0');

  // Das Logo als Zellenbild aus Zeilen ('#' = Zelle an): jeweils cell x cell Logo-Pixel werden
  // zu einer Zelle, wenn genug Logo-Pixel darin liegen
  function logoBitmap(cell) {
    const L = global.Shapes && Shapes.logoSmall;
    if (!L) return ['#'];
    const w = Math.ceil(L.width / cell), h = Math.ceil(L.height / cell);
    const count = new Array(w * h).fill(0);
    const need = Math.max(1, Math.round(cell * cell * 0.2));
    for (let k = 0; k < L.count; k++) count[Math.floor(L.y[k] / cell) * w + Math.floor(L.x[k] / cell)]++;
    const rows = [];
    for (let y = 0; y < h; y++) {
      let row = '';
      for (let x = 0; x < w; x++) row += count[y * w + x] >= need ? '#' : '.';
      rows.push(row);
    }
    return rows;
  }

  // 3 x 5 Pixelschrift für Anzeige und Meldungen
  const FONT = {
    ' ': ['...', '...', '...', '...', '...'],
    '0': ['###', '#.#', '#.#', '#.#', '###'],
    '1': ['.#.', '##.', '.#.', '.#.', '###'],
    '2': ['###', '..#', '###', '#..', '###'],
    '3': ['###', '..#', '###', '..#', '###'],
    '4': ['#.#', '#.#', '###', '..#', '..#'],
    '5': ['###', '#..', '###', '..#', '###'],
    '6': ['###', '#..', '###', '#.#', '###'],
    '7': ['###', '..#', '..#', '..#', '..#'],
    '8': ['###', '#.#', '###', '#.#', '###'],
    '9': ['###', '#.#', '###', '..#', '###'],
    A: ['.#.', '#.#', '###', '#.#', '#.#'],
    B: ['##.', '#.#', '##.', '#.#', '##.'],
    C: ['.##', '#..', '#..', '#..', '.##'],
    D: ['##.', '#.#', '#.#', '#.#', '##.'],
    E: ['###', '#..', '##.', '#..', '###'],
    F: ['###', '#..', '##.', '#..', '#..'],
    G: ['.##', '#..', '#.#', '#.#', '.##'],
    H: ['#.#', '#.#', '###', '#.#', '#.#'],
    I: ['###', '.#.', '.#.', '.#.', '###'],
    J: ['..#', '..#', '..#', '#.#', '.#.'],
    K: ['#.#', '#.#', '##.', '#.#', '#.#'],
    L: ['#..', '#..', '#..', '#..', '###'],
    M: ['#.#', '###', '###', '#.#', '#.#'],
    N: ['#.#', '###', '###', '###', '#.#'],
    O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
    P: ['##.', '#.#', '##.', '#..', '#..'],
    Q: ['.#.', '#.#', '#.#', '.##', '..#'],
    R: ['##.', '#.#', '##.', '#.#', '#.#'],
    S: ['.##', '#..', '.#.', '..#', '##.'],
    T: ['###', '.#.', '.#.', '.#.', '.#.'],
    U: ['#.#', '#.#', '#.#', '#.#', '###'],
    V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
    W: ['#.#', '#.#', '###', '###', '#.#'],
    X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
    Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
    Z: ['###', '..#', '.#.', '#..', '###'],
    ':': ['...', '.#.', '...', '.#.', '...'],
    '-': ['...', '...', '###', '...', '...'],
    '!': ['.#.', '.#.', '.#.', '...', '.#.'],
    '.': ['...', '...', '...', '...', '.#.'],
    '/': ['..#', '..#', '.#.', '#..', '#..'],
    '+': ['...', '.#.', '###', '.#.', '...'],
    '=': ['...', '###', '...', '###', '...']
  };

  /*
   * Spielfeld: ein Logik-Raster aus bw x bh Zellen, ganzzahlig auf das Pixelfeld skaliert
   * und mittig gesetzt. Oben bleibt eine Zeile für die Anzeige, unter der Navigation.
   * Alle Koordinaten der Spiele sind Zellen (Zahlen, auch Kommastellen); die Rundung
   * passiert hier.
   */
  // board = [bw, bh] feste Zellenzahl, oder cell = Rasterpixel pro Zelle: dann füllt das Feld den
  // ganzen Bildschirm und bw/bh ergeben sich daraus
  function makeField(engine, board, cell) {
    const f = { bw: 1, bh: 1, s: 1, ox: 0, oy: 0, hudY: 0, hudS: 1, time: 0, e: engine };

    f.layout = e => {
      f.e = e;
      const cellCss = e.cellPx / e.dpr;
      f.hudS = Math.max(1, Math.round(16 / (5 * cellCss)));
      const nav = document.getElementById('nav');
      const navRows = Math.ceil(((nav && nav.offsetHeight) || 60) / cellCss);
      f.hudY = navRows + 1;
      const top = f.hudY + 5 * f.hudS + 3;
      const availH = Math.max(1, e.rows - top - 2);
      if (cell) {
        // Jede Zelle ist cell Rasterpixel groß, wie das Hintergrundraster
        f.s = cell;
        f.bw = Math.max(1, Math.floor(e.cols / cell));
        f.bh = Math.max(1, Math.floor(availH / cell));
      } else {
        f.bw = board[0]; f.bh = board[1];
        f.s = Math.max(1, Math.floor(Math.min(e.cols / f.bw, availH / f.bh)));
      }
      f.ox = Math.floor((e.cols - f.bw * f.s) / 2);
      f.oy = top + Math.floor((availH - f.bh * f.s) / 2);
    };

    f.c0 = x => f.ox + Math.round(x * f.s);
    f.r0 = y => f.oy + Math.round(y * f.s);

    // Rechteck direkt in Pixelkoordinaten (c1, r1 nicht enthalten)
    f.fill = (c0, r0, c1, r1, col, keep = false, a = 1) => {
      const e = f.e;
      for (let r = r0; r < r1; r++) {
        for (let c = c0; c < c1; c++) e.overlay(c, r, col[0], col[1], col[2], a, keep);
      }
    };

    // Rechteck in Zellen
    f.rect = (x, y, w, h, col, keep = false, a = 1) =>
      f.fill(f.c0(x), f.r0(y), f.c0(x + w), f.r0(y + h), col, keep, a);
    f.cell = (x, y, col, keep = false, a = 1) => f.rect(x, y, 1, 1, col, keep, a);

    // Zellenbild (Zeilen mit '#') an der Position (x, y)
    f.sprite = (rows, x, y, col, keep = false) => {
      rows.forEach((row, r) => {
        for (let c = 0; c < row.length; c++) if (row[c] === '#') f.cell(x + c, y + r, col, keep);
      });
    };

    // Klotz mit kleiner dunkler Kante rechts und unten (ab 3 Pixeln pro Zelle)
    f.block = (x, y, col, keep = false) => {
      const c0 = f.c0(x), r0 = f.r0(y), c1 = f.c0(x + 1), r1 = f.r0(y + 1);
      if (f.s < 3) return f.fill(c0, r0, c1, r1, col, keep);
      f.fill(c0, r0, c1, r1, col.map(v => v * 0.6), keep);
      f.fill(c0, r0, c1 - 1, r1 - 1, col, keep);
    };

    // Text in Pixelkoordinaten, sc = Pixel pro Schriftpixel
    f.text = (str, x, y, col, sc = f.hudS, keep = false) => {
      let cx = x;
      for (const ch of String(str).toUpperCase()) {
        const glyph = FONT[ch] || FONT[' '];
        for (let ry = 0; ry < 5; ry++) {
          for (let k = 0; k < 3; k++) {
            if (glyph[ry][k] === '#') {
              f.fill(cx + k * sc, y + ry * sc, cx + (k + 1) * sc, y + (ry + 1) * sc, col, keep);
            }
          }
        }
        cx += 4 * sc;
      }
    };
    f.textW = (str, sc) => String(str).length * 4 * sc - sc;

    // Anzeige oben in der Mitte
    f.hud = str => f.text(str, Math.round((f.e.cols - f.textW(str, f.hudS)) / 2), f.hudY, INK, f.hudS);

    // Meldung in der Mitte, mit weißem Kasten dahinter
    f.msg = (main, sub) => {
      const e = f.e;
      const sc = Math.max(1, Math.min(Math.floor((e.cols * 0.8) / (main.length * 4)), Math.max(f.s * 2, Math.floor(e.rows / 30))));
      const sc2 = Math.max(1, Math.floor(sc / 2));
      const w = Math.max(f.textW(main, sc), sub ? f.textW(sub, sc2) : 0);
      const h = 5 * sc + (sub ? sc + 5 * sc2 : 0);
      const gap = sc * 2;
      const x0 = Math.round((e.cols - w) / 2), y0 = Math.round((e.rows - h) / 2);
      f.fill(x0 - gap, y0 - gap, x0 + w + gap, y0 + h + gap, WHITE);
      f.text(main, x0, y0, INK, sc);
      if (sub) f.text(sub, Math.round((e.cols - f.textW(sub, sc2)) / 2), y0 + 5 * sc + sc, MID, sc2);
    };

    // Zelle unter einer Rasterposition (kann außerhalb des Felds liegen)
    f.cellAt = (col, row) => {
      const x = Math.floor((col - f.ox) / f.s), y = Math.floor((row - f.oy) / f.s);
      return { x, y, inside: x >= 0 && y >= 0 && x < f.bw && y < f.bh };
    };
    f.mouse = () => {
      const m = f.e.mouse;
      return m.inside ? f.cellAt(m.col, m.row) : { x: -1, y: -1, inside: false };
    };

    return f;
  }

  /* ---------- SNAKE ---------- */
  // Pfeile oder WASD. Keine Wände: am Rand kommt die Schlange auf der anderen Seite
  // wieder herein. Mit jedem Apfel wird sie schneller.
  function snake(ctx) {
    const f = ctx.f, W = 48, H = 27;
    const DIRS = {
      ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
      ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0]
    };
    let body, dir, nextDir, food, acc, eaten, over;

    const freeCell = () => {
      for (;;) {
        const x = Math.floor(Math.random() * W), y = Math.floor(Math.random() * H);
        if (!body.some(p => p.x === x && p.y === y)) return { x, y };
      }
    };

    return {
      reset() {
        body = [{ x: 24, y: 13 }, { x: 23, y: 13 }, { x: 22, y: 13 }];
        dir = nextDir = [1, 0];
        food = freeCell();
        acc = 0; eaten = 0; over = false;
      },
      key(code) {
        if (over) { if (code === 'Space' || code === 'Enter') this.reset(); return; }
        const d = DIRS[code];
        if (!d || (d[0] === -dir[0] && d[1] === -dir[1])) return;   // keine 180°-Wende
        nextDir = d;
      },
      update(dt) {
        if (!over) {
          acc += dt;
          const step = Math.max(0.055, 0.12 - eaten * 0.002);
          while (acc >= step && !over) {
            acc -= step;
            dir = nextDir;
            const h = body[0];
            const x = (h.x + dir[0] + W) % W, y = (h.y + dir[1] + H) % H;
            if (body.some(p => p.x === x && p.y === y)) { over = true; break; }
            body.unshift({ x, y });
            if (x === food.x && y === food.y) { eaten++; food = freeCell(); } else body.pop();
          }
        }
        f.cell(food.x, food.y, Math.floor(f.time * 4) % 2 ? INK : MID);
        body.forEach((p, i) => {
          if (i === 0) f.cell(p.x, p.y, INK);
          else { const v = Math.min(170, 40 + i * 6); f.block(p.x, p.y, [v, v, v]); }
        });
        f.hud(`SNAKE ${pad(eaten)}`);
        if (over) f.msg('ENDE', 'ENTER = NEU');
      }
    };
  }

  /* ---------- TETRIS ---------- */
  // Riesige Klötze: das Feld ist nur 10 x 20 Klötze, dafür sind sie groß. Pfeile links und
  // rechts (gedrückt halten wiederholt), Hoch oder W dreht, Runter oder S lässt schneller
  // fallen, Leertaste lässt sofort fallen. Der Schatten zeigt, wo das Teil landet.
  function tetris(ctx) {
    const f = ctx.f, W = 10, H = 20;
    const SHAPES = [
      { c: TONES[0], m: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]] },
      { c: TONES[1], m: [[1, 1], [1, 1]] },
      { c: TONES[2], m: [[0, 1, 0], [1, 1, 1], [0, 0, 0]] },
      { c: TONES[3], m: [[0, 1, 1], [1, 1, 0], [0, 0, 0]] },
      { c: TONES[4], m: [[1, 1, 0], [0, 1, 1], [0, 0, 0]] },
      { c: TONES[5], m: [[1, 0, 0], [1, 1, 1], [0, 0, 0]] },
      { c: TONES[6], m: [[0, 0, 1], [1, 1, 1], [0, 0, 0]] }
    ];
    const rotate = m => m.map((_, y) => m.map((__, x) => m[m.length - 1 - x][y]));
    const randomPiece = () => SHAPES[Math.floor(Math.random() * SHAPES.length)];
    let board, cur, next, dropT, moveT, score, lines, level, over;

    const fits = (m, px, py) => m.every((row, r) => row.every((v, c) => {
      if (!v) return true;
      const x = px + c, y = py + r;
      return x >= 0 && x < W && y < H && (y < 0 || !board[y][x]);
    }));

    function spawn() {
      cur = { m: next.m, c: next.c, x: Math.floor((W - next.m.length) / 2), y: 0 };
      next = randomPiece();
      if (!fits(cur.m, cur.x, cur.y)) over = true;
    }

    function move(dx, dy) {
      if (!fits(cur.m, cur.x + dx, cur.y + dy)) return false;
      cur.x += dx; cur.y += dy;
      return true;
    }

    function rotateCur() {
      const r = rotate(cur.m);
      for (const k of [0, -1, 1, -2, 2]) {
        if (fits(r, cur.x + k, cur.y)) { cur.m = r; cur.x += k; return; }
      }
    }

    function lock() {
      cur.m.forEach((row, r) => row.forEach((v, c) => {
        if (v && cur.y + r >= 0) board[cur.y + r][cur.x + c] = cur.c;
      }));
      let cleared = 0;
      for (let y = H - 1; y >= 0; y--) {
        if (board[y].every(Boolean)) {
          board.splice(y, 1);
          board.unshift(Array(W).fill(null));
          cleared++;
          y++;   // die Zeile ist nachgerutscht: noch einmal prüfen
        }
      }
      if (cleared) {
        score += [0, 40, 100, 300, 1200][cleared] * (level + 1);
        lines += cleared;
        level = Math.floor(lines / 10);
      }
      spawn();
    }

    return {
      reset() {
        board = Array.from({ length: H }, () => Array(W).fill(null));
        next = randomPiece();
        score = 0; lines = 0; level = 0; dropT = 0; moveT = 0; over = false;
        spawn();
      },
      key(code) {
        if (over) { if (code === 'Space' || code === 'Enter') this.reset(); return; }
        if (code === 'ArrowLeft' || code === 'KeyA') { move(-1, 0); moveT = 0.18; }
        else if (code === 'ArrowRight' || code === 'KeyD') { move(1, 0); moveT = 0.18; }
        else if (code === 'ArrowUp' || code === 'KeyW') rotateCur();
        else if (code === 'Space') { while (move(0, 1)) { /* fallen lassen */ } lock(); dropT = 0; }
      },
      update(dt) {
        if (!over) {
          const left = ctx.held('ArrowLeft') || ctx.held('KeyA');
          const right = ctx.held('ArrowRight') || ctx.held('KeyD');
          moveT -= dt;
          if (left !== right && moveT <= 0) { move(left ? -1 : 1, 0); moveT = 0.07; }
          if (!left && !right) moveT = 0;
          const soft = ctx.held('ArrowDown') || ctx.held('KeyS');
          const interval = soft ? 0.03 : Math.max(0.09, 0.6 - level * 0.05);
          dropT += dt;
          while (dropT >= interval && !over) {
            dropT -= interval;
            if (!move(0, 1)) { lock(); dropT = 0; break; }
            if (soft) score++;
          }
        }
        // Zeichnen: Rahmen, gelandete Klötze, Schatten, aktuelles Teil, Vorschau
        f.rect(-1, 0, 1, H, MID);
        f.rect(W, 0, 1, H, MID);
        f.rect(-1, H, W + 2, 1, MID);
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) if (board[y][x]) f.block(x, y, board[y][x]);
        }
        if (!over) {
          let gy = 0;
          while (fits(cur.m, cur.x, cur.y + gy + 1)) gy++;
          cur.m.forEach((row, r) => row.forEach((v, c) => {
            if (!v) return;
            if (cur.y + gy + r >= 0) f.cell(cur.x + c, cur.y + gy + r, cur.c, false, 0.25);
            if (cur.y + r >= 0) f.block(cur.x + c, cur.y + r, cur.c);
          }));
        }
        next.m.forEach((row, r) => row.forEach((v, c) => { if (v) f.block(W + 2 + c, 2 + r, next.c); }));
        f.hud(`TETRIS ${pad(score)} L${level + 1}`);
        if (over) f.msg('ENDE', 'ENTER = NEU');
      }
    };
  }

  /* ---------- PONG ---------- */
  // Du links: mit der Maus oder W/S bzw. Pfeilen. Der Computer rechts. Wer zuerst 7 Punkte
  // hat, gewinnt. Der Ball wird mit jedem Treffer schneller und hinterlässt eine Spur.
  function pong(ctx) {
    const f = ctx.f, W = 64, H = 40, PH = 8, LX = 2, RX = W - 3, TO_WIN = 7;
    let pl, pr, bx, by, vx, vy, speed, serveT, sl, sr, aiErr, trail, over;

    function serve(dir) {
      bx = W / 2; by = H / 2;
      speed = 26;
      const a = rnd(-0.4, 0.4);
      vx = dir * speed * Math.cos(a);
      vy = speed * Math.sin(a);
      serveT = 0.8;
      aiErr = rnd(-2, 2);
      trail = [];
    }

    function bounce(paddleTop, sign) {
      const hit = clamp((by - (paddleTop + PH / 2)) / (PH / 2), -1, 1);
      speed = Math.min(50, speed * 1.05);
      vy = hit * speed * 0.8;
      vx = sign * Math.sqrt(Math.max(speed * speed - vy * vy, speed * speed * 0.2));
    }

    return {
      reset() {
        pl = pr = H / 2 - PH / 2;
        sl = sr = 0; over = false;
        serve(Math.random() < 0.5 ? 1 : -1);
      },
      key(code) { if (over && (code === 'Space' || code === 'Enter')) this.reset(); },
      click() { if (over) this.reset(); },
      update(dt) {
        if (!over) {
          const up = ctx.held('ArrowUp') || ctx.held('KeyW');
          const down = ctx.held('ArrowDown') || ctx.held('KeyS');
          const m = f.mouse();
          if (up !== down) pl += (down ? 1 : -1) * 60 * dt;
          else if (m.inside) pl = m.y - PH / 2;
          pl = clamp(pl, 0, H - PH);
          // Computer: folgt dem Ball etwas langsamer und mit kleinem Fehler
          const aim = (vx > 0 ? by + aiErr : H / 2) - PH / 2;
          pr = clamp(pr + clamp(aim - pr, -0.8 * speed * dt, 0.8 * speed * dt), 0, H - PH);

          if (serveT > 0) {
            serveT -= dt;
          } else {
            for (let k = 0; k < 4 && !over; k++) {
              const h = dt / 4;
              bx += vx * h; by += vy * h;
              if (by < 0) { by = -by; vy = -vy; }
              if (by > H - 1) { by = 2 * (H - 1) - by; vy = -vy; }
              if (vx < 0 && bx <= LX + 1 && bx >= LX - 0.5 && by >= pl - 0.5 && by <= pl + PH + 0.5) {
                bx = LX + 1; bounce(pl, 1);
              } else if (vx > 0 && bx >= RX - 1 && bx <= RX + 0.5 && by >= pr - 0.5 && by <= pr + PH + 0.5) {
                bx = RX - 1; bounce(pr, -1);
              }
              if (bx < 0) {
                sr++;
                if (sr >= TO_WIN) { over = true; break; }
                serve(-1); break;
              }
              if (bx > W - 1) {
                sl++;
                if (sl >= TO_WIN) { over = true; break; }
                serve(1); break;
              }
            }
            if (!over) { trail.push({ x: bx, y: by }); if (trail.length > 6) trail.shift(); }
          }
        }
        // Zeichnen
        for (let y = 0; y < H; y += 2) f.cell(Math.floor(W / 2), y, SOFT);
        f.rect(LX, Math.round(pl), 1, PH, INK);
        f.rect(RX, Math.round(pr), 1, PH, INK);
        trail.forEach((t, i) => f.cell(Math.round(t.x), Math.round(t.y), MID, false, ((i + 1) / trail.length) * 0.5));
        if (serveT <= 0 || Math.floor(f.time * 6) % 2) f.cell(Math.round(bx), Math.round(by), INK);
        f.hud(`${sl}  :  ${sr}`);
        if (over) f.msg(sl >= TO_WIN ? 'SIEG' : 'NIEDERLAGE', 'ENTER = NEU');
      }
    };
  }

  /* ---------- BREAKOUT ---------- */
  // Das Logo wird zu Steinen: jeweils 2 x 2 Logo-Pixel ergeben einen Stein. Maus oder Pfeile
  // bewegen den Schläger, Klick oder Leertaste schießt den Ball los. Drei Leben.
  function breakout(ctx) {
    const f = ctx.f, W = 100, H = 64, BW = 14, BH = 15, TOP = 4, PW = 14, X0 = 29;   // Stein: 3 x 2 Zellen
    let bricks, left, paddle, bx, by, vx, vy, speed, lives, launched, score, over, won;

    function buildBricks() {
      bricks = new Uint8Array(BW * BH);
      const L = global.Shapes && Shapes.logoSmall;
      if (L) {
        for (let k = 0; k < L.count; k++) bricks[Math.floor(L.y[k] / 2) * BW + Math.floor(L.x[k] / 2)] = 1;
      } else {
        bricks.fill(1);
      }
      left = bricks.reduce((a, v) => a + v, 0);
    }

    function stick() {
      launched = false;
      speed = 40;
      bx = paddle + PW / 2; by = H - 4; vx = vy = 0;
    }

    function launch() {
      if (launched || over) return;
      launched = true;
      const a = rnd(-0.35, 0.35);
      vx = speed * Math.sin(a);
      vy = -speed * Math.cos(a);
    }

    function step(h) {
      bx += vx * h; by += vy * h;
      if (bx < 0) { bx = -bx; vx = -vx; }
      if (bx > W - 1) { bx = 2 * (W - 1) - bx; vx = -vx; }
      if (by < 0) { by = -by; vy = -vy; }
      // Schläger (Reihe H - 3): der Winkel hängt davon ab, wo der Ball auftrifft
      if (vy > 0 && by >= H - 3.5 && by <= H - 2.5 && bx >= paddle - 0.5 && bx <= paddle + PW + 0.5) {
        const hit = clamp((bx - (paddle + PW / 2)) / (PW / 2), -1, 1);
        speed = Math.min(70, speed + 0.8);
        vx = hit * speed * 0.8;
        vy = -Math.sqrt(Math.max(speed * speed - vx * vx, speed * speed * 0.2));
        by = H - 3.5;
      }
      // Stein getroffen?
      const cx = Math.floor((bx - X0) / 3), cy = Math.floor((by - TOP) / 2);
      if (by >= TOP && bx >= X0 && cx >= 0 && cx < BW && cy >= 0 && cy < BH && bricks[cy * BW + cx]) {
        bricks[cy * BW + cx] = 0;
        left--; score += 10; vy = -vy;
        if (left === 0) { over = won = true; }
      }
      // Ball unten vorbei
      if (by > H) {
        lives--;
        if (lives <= 0) over = true;
        else stick();
      }
    }

    return {
      reset() {
        buildBricks();
        paddle = (W - PW) / 2;
        lives = 3; score = 0; over = won = false;
        stick();
      },
      key(code) {
        if (over) { if (code === 'Space' || code === 'Enter') this.reset(); return; }
        if (code === 'Space') launch();
      },
      click() { if (over) this.reset(); else launch(); },
      update(dt) {
        if (!over) {
          const L = ctx.held('ArrowLeft') || ctx.held('KeyA');
          const R = ctx.held('ArrowRight') || ctx.held('KeyD');
          const m = f.mouse();
          if (L !== R) paddle += (R ? 1 : -1) * 70 * dt;
          else if (m.inside) paddle = m.x - PW / 2;
          paddle = clamp(paddle, 0, W - PW);
          if (!launched) { bx = paddle + PW / 2; by = H - 4; }
          else for (let k = 0; k < 4 && launched && !over; k++) step(dt / 4);
        }
        // Zeichnen
        for (let y = 0; y < BH; y++) {
          for (let x = 0; x < BW; x++) {
            if (bricks[y * BW + x]) f.rect(X0 + x * 3, TOP + y * 2, 3, 2, BRICK[Math.min(4, Math.floor(y / 3))]);
          }
        }
        f.rect(Math.round(paddle), H - 3, PW, 1, INK);
        f.cell(Math.round(bx), Math.round(by), INK);
        f.hud(`SCORE ${pad(score)}  ${'O'.repeat(Math.max(0, lives))}`);
        if (over) f.msg(won ? 'GEWONNEN' : 'ENDE', 'ENTER = NEU');
      }
    };
  }

  /* ---------- INVADERS ---------- */
  // Die Armee ist dein Logo: jeder Pixel des Logos ist ein Gegner. Pfeile oder Maus bewegen
  // das Schiff, Leertaste oder Klick schießen. Die Armee wird schneller, je weniger übrig sind.
  function invaders(ctx) {
    const f = ctx.f, W = 80, H = 60;
    const LOGO = (global.Shapes && Shapes.logoSmall) || { count: 0, x: [], y: [], width: 0 };
    const N = LOGO.count;
    const SHADES = [INK, [70, 70, 70], MID, [150, 150, 150], SOFT];
    let alive, ax, ay, dir, stepT, shots, bombs, sx, lives, score, wave, cool, bombT, over;

    function extent() {
      let x0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
      for (let k = 0; k < N; k++) {
        if (!alive[k]) continue;
        n++;
        x0 = Math.min(x0, LOGO.x[k]);
        x1 = Math.max(x1, LOGO.x[k]);
        y1 = Math.max(y1, LOGO.y[k]);
      }
      return { x0, x1, y1, n };
    }

    function newWave() {
      alive = new Uint8Array(N).fill(1);
      ax = Math.floor((W - LOGO.width) / 2); ay = 6; dir = 1; stepT = 1;
    }

    return {
      reset() {
        wave = 1; lives = 3; score = 0; sx = W / 2;
        shots = []; bombs = []; cool = 0; bombT = 2; over = false;
        newWave();
      },
      key(code) {
        if (over) { if (code === 'Space' || code === 'Enter') this.reset(); return; }
        if (code === 'Space') this.fire();
      },
      click() { if (over) this.reset(); else this.fire(); },
      fire() {
        if (over || cool > 0 || shots.length >= 3) return;
        shots.push({ x: sx, y: H - 4 });
        cool = 0.3;
      },
      update(dt) {
        if (!over) {
          const L = ctx.held('ArrowLeft') || ctx.held('KeyA');
          const R = ctx.held('ArrowRight') || ctx.held('KeyD');
          const m = f.mouse();
          if (L !== R) sx += (R ? 1 : -1) * 45 * dt;
          else if (m.inside) sx = m.x;
          sx = clamp(sx, 2, W - 3);
          cool -= dt;

          // Armee: rückt in Schritten vor, am Rand eine Reihe tiefer
          let ex = extent();
          if (!ex.n) { wave++; newWave(); ex = extent(); }
          stepT -= dt;
          if (stepT <= 0) {
            stepT = 0.1 + ex.n * 0.0015;
            if (ex.x0 + ax + dir < 1 || ex.x1 + ax + dir > W - 2) { ay += 2; dir = -dir; }
            else ax += dir;
          }
          if (ay + ex.y1 >= H - 6) over = true;

          // Eigene Schüsse: treffen einen Gegner, der Pixel verschwindet
          shots = shots.filter(s => {
            s.y -= 40 * dt;
            if (s.y < 0) return false;
            const cx = Math.round(s.x), cy = Math.round(s.y);
            for (let k = 0; k < N; k++) {
              if (alive[k] && ax + LOGO.x[k] === cx && ay + LOGO.y[k] === cy) {
                alive[k] = 0; score += 10;
                return false;
              }
            }
            return true;
          });

          // Gegner schießen zurück
          bombT -= dt;
          if (bombT <= 0 && ex.n) {
            bombT = Math.max(0.35, 1.2 - wave * 0.1) * rnd(0.6, 1.3);
            const cand = [];
            for (let k = 0; k < N; k++) if (alive[k]) cand.push(k);
            const k = cand[Math.floor(Math.random() * cand.length)];
            bombs.push({ x: ax + LOGO.x[k], y: ay + LOGO.y[k] + 1 });
          }
          bombs = bombs.filter(b => {
            b.y += 24 * dt;
            if (b.y >= H - 3 && Math.abs(b.x - sx) <= 2.5) {
              lives--;
              if (lives <= 0) over = true;
              return false;
            }
            return b.y < H;
          });
        }
        // Zeichnen
        for (let k = 0; k < N; k++) {
          if (alive[k]) f.cell(ax + LOGO.x[k], ay + LOGO.y[k], SHADES[Math.min(4, Math.floor(LOGO.y[k] / 6))]);
        }
        f.rect(Math.round(sx) - 2, H - 3, 5, 1, INK);
        f.cell(Math.round(sx), H - 4, INK);
        shots.forEach(s => f.cell(Math.round(s.x), Math.round(s.y), INK));
        bombs.forEach(b => f.cell(Math.round(b.x), Math.round(b.y), MID));
        f.hud(`SCORE ${pad(score)}  ${'O'.repeat(Math.max(0, lives))}`);
        if (over) f.msg('ENDE', 'ENTER = NEU');
      }
    };
  }

  /* ---------- FLAPPY ---------- */
  // Leertaste, Klick oder Pfeil hoch lässt den Vogel flattern. Die Röhren sind aus Ziegeln
  // gemauert; jede Röhre, an der du vorbeikommst, gibt einen Punkt.
  function flappy(ctx) {
    const f = ctx.f;
    const BIRD = logoBitmap(2), BWD = BIRD[0].length, BHT = BIRD.length;   // der Vogel ist das Logo
    let by, vy, pipes, started, over, score, bobT;

    // Maße passen sich dem Feld an: horizontal k, vertikal u (1 bei 64 x 40 Zellen)
    const dims = () => {
      const W = f.bw, H = f.bh, k = W / 64, u = H / 40;
      return {
        W, H, u,
        BX: Math.round(W * 0.18),
        GAP: Math.round(BHT * 2.2),
        PWD: Math.max(4, Math.round(2.5 * k)),
        SPACING: 22 * k,
        SPEED: 20 * k
      };
    };

    return {
      reset() {
        const d = dims();
        by = d.H / 2 - BHT / 2; vy = 0; pipes = [];
        started = false; over = false; score = 0; bobT = 0;
      },
      key(code) {
        if (over) { if (code === 'Space' || code === 'Enter') this.reset(); return; }
        if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') this.flap();
      },
      click() { if (over) this.reset(); else this.flap(); },
      flap() {
        if (over) return;
        started = true;
        vy = -24 * dims().u;
      },
      update(dt) {
        const d = dims();
        const { W, H, u, BX, GAP, PWD } = d;
        const g = 70 * u;
        if (!started) {
          bobT += dt;
          by = H / 2 - BHT / 2 + Math.sin(bobT * 3) * 1.5;
        } else if (!over) {
          vy += g * dt;
          by += vy * dt;
          if (by < 0) { by = 0; vy = 0; }
          for (const p of pipes) p.x -= d.SPEED * dt;
          const last = pipes[pipes.length - 1];
          if (!last || last.x < W - d.SPACING) {
            pipes.push({ x: W + 2, gap: Math.round(rnd(4, H - 4 - GAP)), passed: false });
          }
          pipes = pipes.filter(p => p.x > -PWD - 2);
          const top = Math.round(by), bot = top + BHT - 1;   // Vogel: Logo-Bild
          for (const p of pipes) {
            if (!p.passed && p.x + PWD < BX) { p.passed = true; score++; }
            if (p.x < BX + BWD && p.x + PWD > BX && (top < p.gap || bot >= p.gap + GAP)) over = true;
          }
          if (by + BHT >= H - 1) { by = H - 1 - BHT; over = true; }
        } else {
          // Absturz: der Vogel fällt noch bis zum Boden
          vy += g * dt;
          by = Math.min(H - 1 - BHT, by + vy * dt);
        }
        // Zeichnen: Röhren mit Ziegelfugen, Vogel, Boden
        for (const p of pipes) {
          for (let y = 0; y < H - 1; y += 6) {
            if (y >= p.gap && y < p.gap + GAP) continue;
            f.rect(p.x, y, PWD, 1, SOFT);
          }
          f.rect(p.x, 0, PWD, p.gap, MID);
          f.rect(p.x, p.gap + GAP, PWD, H - 1 - (p.gap + GAP), MID);
          f.rect(p.x - 1, p.gap - 1, PWD + 2, 1, INK);
          f.rect(p.x - 1, p.gap + GAP, PWD + 2, 1, INK);
        }
        f.rect(0, H - 1, W, 1, INK);
        f.sprite(BIRD, BX, Math.round(by), INK);
        f.hud(started ? `FLAPPY ${pad(score)}` : 'LEERTASTE = START');
        if (over) f.msg('ENDE', 'ENTER = NEU');
      }
    };
  }

  /* ---------- MINEN ---------- */
  // Minesweeper mit großen Feldern. Klick deckt auf, Rechtsklick markiert. Mit der Tastatur:
  // Pfeile oder WASD bewegen den Cursor, Leertaste deckt auf, F markiert. Der erste Klick
  // ist immer sicher.
  function mines(ctx) {
    const f = ctx.f, W = 16, H = 10, MINES = 24;
    // Zahlen in Grautönen: je nach Anzahl der Minen in der Nachbarschaft dunkler oder heller
    const NUM = [null, INK, [60, 60, 60], [90, 90, 90], INK, [60, 60, 60], [90, 90, 90], INK, [60, 60, 60]];
    const DIRS = {
      ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
      ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0]
    };
    let mine, num, open, flag, started, over, won, cur;

    const idx = (x, y) => y * W + x;
    const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const eachNeighbor = (x, y, fn) => {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dy) && inside(x + dx, y + dy)) fn(x + dx, y + dy);
        }
      }
    };

    function place(sx, sy) {
      mine = new Uint8Array(W * H);
      let n = 0;
      while (n < MINES) {
        const x = Math.floor(Math.random() * W), y = Math.floor(Math.random() * H);
        if (mine[idx(x, y)] || (Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 1)) continue;
        mine[idx(x, y)] = 1; n++;
      }
      num = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let c = 0;
          eachNeighbor(x, y, (a, b) => { if (mine[idx(a, b)]) c++; });
          num[idx(x, y)] = c;
        }
      }
    }

    function checkWin() {
      let opened = 0;
      for (let i = 0; i < W * H; i++) opened += open[i];
      if (opened === W * H - MINES) { won = over = true; }
    }

    function reveal(x, y) {
      const stack = [[x, y]];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        const i = idx(cx, cy);
        if (open[i] || flag[i]) continue;
        open[i] = 1;
        if (mine[i]) { over = true; break; }
        if (num[i] === 0) eachNeighbor(cx, cy, (a, b) => { if (!open[idx(a, b)]) stack.push([a, b]); });
      }
      if (over) {
        for (let i = 0; i < W * H; i++) if (mine[i]) open[i] = 1;
      } else {
        checkWin();
      }
    }

    function act(x, y) {
      if (!inside(x, y) || over || open[idx(x, y)] || flag[idx(x, y)]) return;
      if (!started) { place(x, y); started = true; }
      reveal(x, y);
    }

    function mark(x, y) {
      if (!inside(x, y) || over || open[idx(x, y)]) return;
      flag[idx(x, y)] ^= 1;
    }

    return {
      reset() {
        mine = new Uint8Array(W * H); num = new Uint8Array(W * H);
        open = new Uint8Array(W * H); flag = new Uint8Array(W * H);
        started = false; over = false; won = false;
        cur = { x: 8, y: 5 };
      },
      key(code) {
        if (over) { if (code === 'Space' || code === 'Enter') this.reset(); return; }
        const d = DIRS[code];
        if (d) {
          cur.x = clamp(cur.x + d[0], 0, W - 1);
          cur.y = clamp(cur.y + d[1], 0, H - 1);
        } else if (code === 'Space') {
          act(cur.x, cur.y);
        } else if (code === 'KeyF') {
          mark(cur.x, cur.y);
        }
      },
      hover(p) { if (p.inside) cur = { x: p.x, y: p.y }; },
      click(p) {
        if (over) { this.reset(); return; }
        if (!p.inside) return;
        cur = { x: p.x, y: p.y };
        act(p.x, p.y);
      },
      rightClick(p) {
        if (!p.inside || over) return;
        cur = { x: p.x, y: p.y };
        mark(p.x, p.y);
      },
      update() {
        const s = f.s;
        let flagged = 0;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = idx(x, y);
            flagged += flag[i];
            if (open[i]) {
              if (mine[i]) {
                f.rect(x, y, 1, 1, MID);
                f.rect(x + 0.25, y + 0.25, 0.5, 0.5, INK);
              } else if (num[i]) {
                const sc = Math.max(1, Math.floor((s - 4) / 5));
                const tx = f.c0(x) + Math.floor((s - 3 * sc) / 2);
                const ty = f.r0(y) + Math.floor((s - 5 * sc) / 2);
                f.text(String(num[i]), tx, ty, NUM[num[i]], sc);
              }
            } else {
              f.block(x, y, [190, 190, 190]);
              if (flag[i]) f.rect(x + 0.3, y + 0.3, 0.4, 0.4, INK);
              else if (over && mine[i]) f.rect(x + 0.25, y + 0.25, 0.5, 0.5, INK);
            }
            if (x === cur.x && y === cur.y) f.cell(x, y, INK, false, 0.25);
          }
        }
        f.hud(`MINEN ${pad(MINES - flagged, 2)}`);
        if (over) f.msg(won ? 'GEWONNEN' : 'ENDE', 'ENTER = NEU');
      }
    };
  }

  /* ---------- LIFE ---------- */
  // Conways Spiel des Lebens als Sandkasten. Mit der Maus malen (gedrückt ziehen), Leertaste
  // startet und pausiert, R füllt zufällig, C leert das Feld. Die Ränder sind verbunden.
  function life(ctx) {
    const f = ctx.f, W = 80, H = 48;
    let grid, next, age, nextAge, running, gen, genT, painting, paintVal;
    const idx = (x, y) => ((y + H) % H) * W + ((x + W) % W);

    function randomize() {
      for (let i = 0; i < W * H; i++) { grid[i] = Math.random() < 0.2 ? 1 : 0; age[i] = 0; }
    }

    // Das Logo als Startmuster: die Zellen des Logos sind lebendig
    function placeLogo() {
      grid.fill(0); age.fill(0);
      const rows = logoBitmap(1);
      const ox = Math.floor((W - rows[0].length) / 2), oy = Math.floor((H - rows.length) / 2);
      rows.forEach((row, r) => {
        for (let c = 0; c < row.length; c++) if (row[c] === '#') grid[idx(ox + c, oy + r)] = 1;
      });
    }

    function step() {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += grid[idx(x + dx, y + dy)];
          }
          const i = y * W + x, alive = grid[i];
          const live = n === 3 || (alive && n === 2) ? 1 : 0;
          next[i] = live;
          nextAge[i] = live ? (alive ? Math.min(255, age[i] + 1) : 0) : 0;
        }
      }
      [grid, next] = [next, grid];
      [age, nextAge] = [nextAge, age];
      gen++;
    }

    return {
      reset() {
        grid = new Uint8Array(W * H); next = new Uint8Array(W * H);
        age = new Uint8Array(W * H); nextAge = new Uint8Array(W * H);
        placeLogo();
        running = false; gen = 0; genT = 0; painting = false;
      },
      key(code) {
        if (code === 'Space') running = !running;
        else if (code === 'KeyR') { randomize(); gen = 0; }
        else if (code === 'KeyC') { grid.fill(0); age.fill(0); gen = 0; }
      },
      press(p) {
        if (!p.inside) return;
        const i = p.y * W + p.x;
        paintVal = grid[i] ? 0 : 1;
        painting = true;
        grid[i] = paintVal; age[i] = 0;
      },
      release() { painting = false; },
      hover(p) {
        if (!painting || !p.inside) return;
        const i = p.y * W + p.x;
        grid[i] = paintVal; age[i] = 0;
      },
      update(dt) {
        if (running) {
          genT += dt;
          while (genT >= 0.1) { genT -= 0.1; step(); }
        }
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = y * W + x;
            if (!grid[i]) continue;
            const a = age[i];
            f.cell(x, y, a < 2 ? INK : a < 6 ? MID : SOFT);
          }
        }
        f.hud(`LIFE ${pad(gen)}${running ? '' : ' PAUSE'}`);
      }
    };
  }

  /* ---------- SIMON ---------- */
  // Vier große Felder leuchten in einer Reihenfolge auf. Wiederhole sie. Jede Runde wird die
  // Reihe um ein Feld länger. Klick, oder Q W A S für oben links, oben rechts, unten links,
  // unten rechts.
  function simon(ctx) {
    const f = ctx.f, W = 40, H = 40, SIZE = 18;
    const Q = [[0, 0], [22, 0], [0, 22], [22, 22]];
    // Vier Grautöne für die vier Felder
    const COLORS = [[60, 60, 60], [100, 100, 100], [140, 140, 140], [180, 180, 180]];
    const KEYS = { KeyQ: 0, KeyW: 1, KeyA: 2, KeyS: 3 };
    let seq, phase, timer, showT, lit, flashI, flashT, pos, score, over;

    function quadAt(x, y) {
      for (let k = 0; k < 4; k++) {
        if (x >= Q[k][0] && x < Q[k][0] + SIZE && y >= Q[k][1] && y < Q[k][1] + SIZE) return k;
      }
      return -1;
    }

    function nextRound() {
      seq.push(Math.floor(Math.random() * 4));
      phase = 'show'; showT = 0; lit = -1;
    }

    function pressed(k) {
      flashI = k; flashT = 0.2;
      if (k !== seq[pos]) { over = true; phase = 'over'; return; }
      pos++;
      if (pos === seq.length) { score = seq.length; phase = 'wait'; timer = 0.9; }
    }

    return {
      reset() {
        seq = []; score = 0; over = false;
        phase = 'wait'; timer = 0.8; pos = 0; lit = -1; flashT = 0; flashI = -1;
      },
      key(code) {
        if (over) { if (code === 'Space' || code === 'Enter') this.reset(); return; }
        const k = KEYS[code];
        if (k !== undefined && phase === 'input') pressed(k);
      },
      click(p) {
        if (over) { this.reset(); return; }
        const k = p.inside ? quadAt(p.x, p.y) : -1;
        if (k >= 0 && phase === 'input') pressed(k);
      },
      update(dt) {
        if (phase === 'wait') {
          timer -= dt;
          if (timer <= 0) nextRound();
        } else if (phase === 'show') {
          showT += dt;
          const step = Math.floor(showT / 0.7), within = showT - step * 0.7;
          lit = step < seq.length && within < 0.45 ? seq[step] : -1;
          if (step >= seq.length) { phase = 'input'; pos = 0; lit = -1; }
        }
        flashT -= dt;
        // Zeichnen: leuchtende Felder hell, die anderen gedämpft
        for (let k = 0; k < 4; k++) {
          const on = lit === k || (flashT > 0 && flashI === k);
          const c = on ? COLORS[k].map(v => v + (255 - v) * 0.55) : COLORS[k].map(v => v * 0.5);
          f.rect(Q[k][0], Q[k][1], SIZE, SIZE, c);
        }
        f.rect(18, 18, 4, 4, INK);
        f.hud(`SIMON ${pad(score)}`);
        if (over) f.msg('ENDE', 'ENTER = NEU');
      }
    };
  }

  /* ---------- DODGE ---------- */
  // Fallenden Blöcken ausweichen. Maus oder Pfeile bewegen das Herz unten. Je länger du
  // überlebst, desto schneller fällt alles. Die Zeit ist dein Punktestand.
  function dodge(ctx) {
    const f = ctx.f;
    const PLAYER = logoBitmap(2), FALL = logoBitmap(4);   // Spieler und Brocken sind das Logo
    const PW = PLAYER[0].length, PH = PLAYER.length;
    let px, blocks, t, spawnT, over;

    return {
      reset() {
        px = f.bw / 2 - PW / 2; blocks = []; t = 0; spawnT = 0; over = false;
      },
      key(code) { if (over && (code === 'Space' || code === 'Enter')) this.reset(); },
      click() { if (over) this.reset(); },
      update(dt) {
        // Geschwindigkeiten passen sich der Feldgröße an (k horizontal, u vertikal, 1 bei 64 x 44)
        const W = f.bw, H = f.bh, k = W / 64, u = H / 44;
        if (!over) {
          t += dt;
          const L = ctx.held('ArrowLeft') || ctx.held('KeyA');
          const R = ctx.held('ArrowRight') || ctx.held('KeyD');
          const m = f.mouse();
          if (L !== R) px += (R ? 1 : -1) * 20 * k * dt;
          else if (m.inside) px = m.x - PW / 2;
          px = clamp(px, 0, W - PW);

          const speed = Math.min(42, 14 + t * 0.9) * u;
          spawnT -= dt;
          if (spawnT <= 0) {
            spawnT = Math.max(0.2, 0.8 - t * 0.02) * rnd(0.7, 1.2);
            blocks.push({
              x: rnd(0, W - FALL[0].length), y: -FALL.length,
              w: FALL[0].length, h: FALL.length,
              vy: speed * rnd(0.8, 1.2)
            });
          }
          for (const b of blocks) b.y += b.vy * dt;
          blocks = blocks.filter(b => b.y < H);

          const hy = H - PH - 1;   // obere Zeile des Spielers
          for (const b of blocks) {
            if (b.x < px + PW && b.x + b.w > px && b.y < hy + PH && b.y + b.h > hy) over = true;
          }
        }
        // Zeichnen
        for (const b of blocks) f.sprite(FALL, Math.round(b.x), Math.round(b.y), MID);
        f.sprite(PLAYER, Math.round(px), H - PH - 1, INK);
        f.hud(`DODGE ${t.toFixed(1)}`);
        if (over) f.msg('ENDE', 'ENTER = NEU');
      }
    };
  }

  /* ---------- Die Liste der Spiele: Wort -> Spiel ---------- */
  const GAMES = [
    { word: 'snake', board: [48, 27], make: snake },
    { word: 'tetris', board: [10, 20], make: tetris },
    { word: 'pong', board: [64, 40], make: pong },
    { word: 'breakout', board: [100, 64], make: breakout },
    { word: 'invaders', board: [80, 60], make: invaders },
    { word: 'flappy', cell: 1, make: flappy },
    { word: 'mines', board: [16, 10], make: mines },
    { word: 'life', board: [80, 48], make: life },
    { word: 'simon', board: [40, 40], make: simon },
    { word: 'dodge', cell: 1, make: dodge }
  ];

  /*
   * Das Behavior für die Engine. Ohne Spiel tut es nichts. Läuft ein Spiel, reicht es Updates
   * und Mausereignisse an das Spiel weiter. Die anderen Behaviors laufen weiter.
   * Ein Spiel kann diese Hooks haben: reset(), update(dt), key(code), hover(p), press(p),
   * release(p), click(p), rightClick(p). p = { x, y, inside } in Zellen des Spielfelds.
   * ctx.f ist das Spielfeld (siehe makeField), ctx.held(code) sagt, ob eine Taste gedrückt ist.
   */
  function arcade() {
    let engine = null, field = null, game = null, buffer = '', downButton = 0;
    const keys = {};

    function start(d) {
      if (!engine) return;
      field = makeField(engine, d.board, d.cell);
      field.layout(engine);
      game = d.make({ f: field, held: code => !!keys[code] });
      game.reset();
      if (global.nameShape) global.nameShape.hide();   // der Schriftzug in der Mitte weicht dem Spiel
      if (global.scrollY > 0) global.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function exit() {
      if (!game) return;
      game = null;
      if (global.nameShape) global.nameShape.show();   // Schriftzug baut sich wieder auf
    }

    const manager = {
      init(e) {
        engine = e;
        if (field) field.layout(e);
      },
      update(e, dt) {
        if (!game) return;
        field.time += dt;
        game.update(dt);
      },
      // Über Pixel-Buttons (engine.mouse.zone) reagiert das Spiel nicht, dort bleiben die Buttons aktiv
      hover(e, i, col, row) { if (game && game.hover && !e.mouse.zone) game.hover(field.cellAt(col, row)); },
      press(e, i, col, row) { if (game && game.press && !e.mouse.zone) game.press(field.cellAt(col, row)); },
      release(e, i, col, row) { if (game && game.release) game.release(field.cellAt(col, row)); },
      click(e, i, col, row) {
        if (!game || e.mouse.zone) return;
        const p = field.cellAt(col, row);
        if (downButton === 2) { if (game.rightClick) game.rightClick(p); }
        else if (game.click) game.click(p);
      },
      play(word) {
        const d = GAMES.find(g => g.word === word);
        if (d) start(d);
      },
      exit,
      words: GAMES.map(d => d.word)
    };

    global.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      keys[e.code] = true;
      if (game && e.code === 'Escape') { e.preventDefault(); exit(); return; }
      if (game && SCROLL_KEYS.includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      // Wörter tippen: der Puffer hält die letzten Buchstaben, passt ein Wort am Ende, startet es
      if (/^[a-zA-Z]$/.test(e.key)) {
        buffer = (buffer + e.key.toLowerCase()).slice(-12);
        const hit = GAMES.find(d => buffer.endsWith(d.word));
        if (hit) { buffer = ''; start(hit); return; }
      }
      if (game && game.key) game.key(e.code);
    });
    global.addEventListener('keyup', e => { keys[e.code] = false; });
    global.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
    // Welche Taste der Maus gedrückt wurde (für Rechtsklick), bevor die Engine den Klick meldet
    global.addEventListener('pointerdown', e => { downButton = e.button; }, true);
    global.addEventListener('contextmenu', e => { if (game) e.preventDefault(); });

    return manager;
  }

  global.Games = { arcade, words: GAMES.map(d => d.word) };
})(window);
