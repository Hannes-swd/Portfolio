/*
 * Sammlung von Behaviors für die PixelEngine.
 * Jedes Behavior ist eine Fabrikfunktion, die ein Objekt mit Hooks zurückgibt
 * (siehe Kommentar oben in engine.js).
 */
(function (global) {
  'use strict';

  const rand = n => Math.random() * n;

  function randomRGB() {
    return [rand(256), rand(256), rand(256)];
  }

  // Fester Pseudo-Zufallswert (0…1) aus zwei Zahlen – gleiches Ergebnis bei gleicher Eingabe
  // Pixel-Figur aus Zeilen ('#' = Pixel, '.' = leer) als Overlay zeichnen; S = Rasterpixel pro Figur-Pixel.
  // keep: die Farbe bleibt im Dark Mode so, wie sie ist
  function paintRows(e, rows, x, y, S, c, a) {
    for (let r = 0; r < rows.length; r++) {
      for (let k = 0; k < rows[r].length; k++) {
        if (rows[r][k] !== '#') continue;
        for (let sy = 0; sy < S; sy++) {
          for (let sx = 0; sx < S; sx++) e.overlay(x + k * S + sx, y + r * S + sy, c[0], c[1], c[2], a, true);
        }
      }
    }
  }

  function hash2(a, b) {
    const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
    return v - Math.floor(v);
  }

  // Verfügbare Aufbau-Animationen für Behaviors.shape und ihre Standarddauer in Sekunden
  const INTRO_DURATION = {
    write: 2.2,     // wie mit einem Stift geschrieben
    rain: 2.8,      // Pixel rieseln von oben herab und stapeln sich
    assemble: 2.2,  // Pixel fliegen von überall her an ihren Platz
    print: 3.2,     // 3D-Drucker: Schicht für Schicht von unten, der Kopf fährt hin und her
    snakes: 3.4,    // Schlangen fressen sich von der Mitte aus durch die Form
    matrix: 3.4,    // Matrix-Regen in Grau, die Form rastet ein, wo die Tropfen vorbeikommen
    glitch: 1.8,    // Streifen springen, Pixel fallen aus, Störblöcke – wird immer ruhiger
    mill: 3.4,      // Strahl aus der oberen rechten Ecke fräst die Form entlang des Strichs aus
    sweep: 1.4,     // von links nach rechts
    center: 1.4,    // von der Mitte nach außen
    random: 1.6,    // in zufälliger Reihenfolge
    none: 0
  };

  // Pixel-Symbole für Buttons: Liste von Zeilen, '#' = Pixel an
  const Icons = {
    // Für die Website-Oberfläche (Menü, Dialog, Kontakt), alle 9x9
    menu: [
      '.........',
      '#########',
      '.........',
      '.........',
      '#########',
      '.........',
      '.........',
      '#########',
      '.........'
    ],
    close: [
      '##.....##',
      '###...###',
      '.###.###.',
      '..#####..',
      '...###...',
      '..#####..',
      '.###.###.',
      '###...###',
      '##.....##'
    ],
    mail: [
      '.........',
      '#########',
      '##.....##',
      '#.#...#.#',
      '#..#.#..#',
      '#...#...#',
      '#.......#',
      '#########',
      '.........'
    ],
    link: [
      '....#####',
      '......###',
      '.....####',
      '#...###.#',
      '#..###...',
      '#...#....',
      '#........',
      '#.......#',
      '#########'
    ],
    down: [
      '...###...',
      '...###...',
      '...###...',
      '...###...',
      '#########',
      '.#######.',
      '..#####..',
      '...###...',
      '....#....'
    ],

    // GitHub-Logo (Octocat im Kreis), nach assets/github.png gepixelt (9x9).
    // '#' = Kreis, '.' = ausgesparte Katze mit Ohren, Kopf, Körper und Schwanz links unten
    github: [
      '..#####..',
      '.#.###.#.',
      '#.......#',
      '#.......#',
      '#.......#',
      '##.....##',
      '#.#...###',
      '.#....##.',
      '..#...#..'
    ],

    // Kleiner Hell/Dunkel-Kreis, von Hand gepixelt (7x7)
    contrastSmall: [
      '..###..',
      '.#..##.',
      '#...###',
      '#...###',
      '#...###',
      '.#..##.',
      '..###..'
    ],

    // Halb gefüllter Kreis (Hell/Dunkel), n = Größe in Pixeln
    contrast(n = 9) {
      const c = (n - 1) / 2, r = n / 2, rows = [];
      for (let y = 0; y < n; y++) {
        let row = '';
        for (let x = 0; x < n; x++) {
          const d = Math.hypot(x - c, y - c);
          row += d <= r - 0.3 && (d >= r - 1.3 || x >= c) ? '#' : '.';
        }
        rows.push(row);
      }
      return rows;
    }
  };

  const Behaviors = {
    /*
     * Jeder Pixel startet mit einer zufälligen Farbe.
     * Fährt die Maus darüber, bekommen alle Pixel im Pinsel-Radius
     * eine neue zufällige Farbe (brush: 0 = nur der Pixel unter der Maus).
     */
    randomColors(options = {}) {
      const color = options.color ?? randomRGB;
      const brush = options.brush ?? 0;
      return {
        init(engine) {
          for (let i = 0; i < engine.count; i++) {
            const [r, g, b] = color(i, engine);
            engine.setColorNow(i, r, g, b, 1);
          }
        },
        hover(engine, i, col, row) {
          engine.forEachInRadius(col, row, brush, j => {
            const [r, g, b] = color(j, engine);
            engine.setColor(j, r, g, b, 1);
          });
        }
      };
    },

    /*
     * Weiße Fläche mit hellgrauen Pixel-Blöcken, die zum Rand hin dichter werden.
     * Ein Block ist ein Quadrat aus mehreren Rasterpixeln (ca. blockPx CSS-px groß).
     * Beim Hovern bekommen ein paar zufällige Blöcke in der Nähe der Maus einen neuen
     * Grauton (oder werden weiß). Sobald die Maus weiter weg ist, kehren sie zurück.
     *
     * Optionen:
     *   blockPx     – Blockgröße in CSS-px (inkl. Lücke); 0 = ein Block ist genau ein Rasterpixel
     *   gapRatio    – Anteil der Lücke zwischen den Blöcken (0…1, 0 = keine Lücke)
     *   background  – Farbe der Fläche [r, g, b]
     *   shades      – mögliche Grautöne der Blöcke, von hell nach dunkel
     *   edge        – Breite der dichten Randzone als Anteil der kürzeren Seite
     *   density     – Wahrscheinlichkeit für einen Block direkt am Rand (0…1)
     *   scatter     – Wahrscheinlichkeit für einzelne Blöcke in der Mitte (0…1)
     *   hoverCells  – Radius in Rasterpixeln, in dem Blöcke verändert werden können. Er hängt an der
     *                 Pixelgröße des Felds: auf kleinen Bildschirmen (kleine Pixel) bleibt er klein
     *   hoverCount  – wie viele zufällige Blöcke pro überfahrenem Rasterpixel neu eingefärbt werden
     *   hoverGray   – Wahrscheinlichkeit, dass ein Block grau wird (sonst wird er wieder weiß)
     *   structure   – 'roots': Linien wachsen vom Rand nach innen (am Rand dicht und dunkel,
     *                 innen seltener und heller). Ohne Angabe gibt es zufällige Blöcke.
     *
     * baseColor(i) liefert die Grundfarbe eines Rasterpixels – praktisch für andere
     * Behaviors, die nach einem Effekt wieder zum Hintergrund zurückkehren wollen.
     */
    pixelField(options = {}) {
      const blockPx = options.blockPx ?? 22;
      const gapRatio = options.gapRatio ?? 0.2;
      const background = options.background ?? [255, 255, 255];
      const shades = options.shades ?? [
        [236, 236, 236], [226, 226, 226], [214, 214, 214], [198, 198, 198], [176, 176, 176]
      ];
      const edge = options.edge ?? 0.3;
      const density = options.density ?? 0.8;
      const scatter = options.scatter ?? 0.025;
      const hoverCells = options.hoverCells ?? 10;
      const hoverCount = options.hoverCount ?? 2;
      const hoverGray = options.hoverGray ?? 0.75;
      const structure = options.structure ?? null;   // 'roots': Wurzeln statt zufälliger Blöcke

      let engine, size, inner, bcols, brows, hoverRadius;
      let baseR, baseG, baseB;     // Grundfarbe je Rasterpixel
      let blockColor;              // Farbe je Block
      const touched = new Set();   // Blöcke, die gerade wegen der Maus anders aussehen

      // Wurzeln statt Zufall: Linien wachsen vom Rand nach innen, am Rand dicht und dunkel,
      // nach innen seltener und heller, bis sie ganz aufhören
      function growRoots(zone) {
        const rnd = (a, b) => a + Math.random() * (b - a);
        // t = 0 am Rand, t = 1 an der Zonengrenze innen. Die Wurzeln sind bewusst heller und
        // teils lückenhaft, damit sie sich mit den zufälligen Blöcken dazwischen mischen.
        // Die Blöcke selbst bleiben stehen (der Aufruf kommt nach der Zufallsschleife).
        const paint = (x, y, t) => {
          if (Math.random() < 0.3) return;
          const k = Math.min(3, Math.max(2, Math.round((1 - t) + 2 + rnd(-0.5, 0.5))));
          const c = shades[k], bi = y * bcols + x;
          blockColor[bi * 3] = c[0];
          blockColor[bi * 3 + 1] = c[1];
          blockColor[bi * 3 + 2] = c[2];
        };

        // Startpunkte auf allen Rändern, jeweils nach innen gerichtet
        const walkers = [];
        const seeds = Math.round((bcols + brows) / 5);
        for (let s = 0; s < seeds; s++) {
          const side = Math.floor(Math.random() * 4);
          let x, y, ang;
          if (side === 0) { x = 0; y = Math.random() * brows; ang = 0; }
          else if (side === 1) { x = bcols - 1; y = Math.random() * brows; ang = Math.PI; }
          else if (side === 2) { x = Math.random() * bcols; y = 0; ang = Math.PI / 2; }
          else { x = Math.random() * bcols; y = brows - 1; ang = -Math.PI / 2; }
          walkers.push({ x, y, ang: ang + rnd(-0.5, 0.5), life: rnd(60, 160) });
        }

        while (walkers.length) {
          const w = walkers.pop();
          while (w.life-- > 0) {
            const xi = Math.round(w.x), yi = Math.round(w.y);
            if (xi < 0 || yi < 0 || xi >= bcols || yi >= brows) break;
            const depth = Math.min(xi, bcols - 1 - xi, yi, brows - 1 - yi);
            const t = depth / zone;
            // Nach innen stirbt eine Wurzel immer öfter ab
            if (t >= 1 || Math.random() < t * t * 0.5) break;
            paint(xi, yi, t);
            if (t < 0.4 && xi + 1 < bcols) paint(xi + 1, yi, t);   // am Rand etwas dicker
            // Rauschen rund um die Wurzel, nach innen immer weniger
            if (Math.random() < 0.3 * (1 - t)) {
              const nx = xi + Math.round(rnd(-2, 2)), ny = yi + Math.round(rnd(-2, 2));
              if (nx >= 0 && ny >= 0 && nx < bcols && ny < brows) paint(nx, ny, t + 0.1);
            }
            // Stark schlängelnd weiterwachsen, ab und zu verzweigen
            w.ang += rnd(-0.75, 0.75);
            if (walkers.length < 500 && Math.random() < 0.035) {
              walkers.push({
                x: w.x, y: w.y,
                ang: w.ang + (Math.random() < 0.5 ? -1 : 1) * rnd(0.5, 1.0),
                life: w.life * 0.6
              });
            }
            w.x += Math.cos(w.ang);
            w.y += Math.sin(w.ang);
          }
        }
      }

      function forEachBlockCell(bi, fn) {
        const c0 = (bi % bcols) * size, r0 = ((bi / bcols) | 0) * size;
        for (let y = 0; y < inner; y++) {
          for (let x = 0; x < inner; x++) {
            const i = engine.index(c0 + x, r0 + y);
            if (i >= 0) fn(i);
          }
        }
      }

      const api = {
        init(e) {
          engine = e;
          size = Math.max(1, Math.round((blockPx * engine.dpr) / engine.cellPx));
          inner = Math.max(1, size - Math.round(size * gapRatio));
          // Hover-Radius von Rasterpixeln in Blöcke umrechnen
          hoverRadius = hoverCells / size;
          bcols = Math.ceil(engine.cols / size);
          brows = Math.ceil(engine.rows / size);

          baseR = new Float32Array(engine.count).fill(background[0]);
          baseG = new Float32Array(engine.count).fill(background[1]);
          baseB = new Float32Array(engine.count).fill(background[2]);
          blockColor = new Float32Array(bcols * brows * 3);
          touched.clear();

          // Wahrscheinlichkeit für einen Block: hoch am Rand, fällt zur Mitte hin ab.
          // Horizontale und vertikale Randnähe werden kombiniert -> Ecken am dichtesten.
          const zone = Math.max(1, edge * Math.min(bcols, brows));
          const near = d => Math.max(0, 1 - d / zone) ** 2;

          for (let by = 0, bi = 0; by < brows; by++) {
            for (let bx = 0; bx < bcols; bx++, bi++) {
              const nx = near(Math.min(bx, bcols - 1 - bx));
              const ny = near(Math.min(by, brows - 1 - by));
              const closeness = 1 - (1 - nx) * (1 - ny);
              const p = density * closeness + scatter;

              let col = background;
              if (Math.random() < p) {
                // Näher am Rand -> eher dunklere Grautöne
                const k = Math.min(shades.length - 1,
                  Math.floor(Math.random() * shades.length * (0.35 + 0.65 * closeness)));
                col = shades[k];
              }
              blockColor[bi * 3] = col[0];
              blockColor[bi * 3 + 1] = col[1];
              blockColor[bi * 3 + 2] = col[2];
            }
          }

          // Wurzel-Struktur statt Zufall: ersetzt die Blöcke von oben
          if (structure === 'roots') growRoots(zone);

          for (let i = 0; i < engine.count; i++) {
            engine.setColorNow(i, background[0], background[1], background[2], 1);
          }
          for (let bi = 0; bi < bcols * brows; bi++) {
            const r = blockColor[bi * 3], g = blockColor[bi * 3 + 1], b = blockColor[bi * 3 + 2];
            forEachBlockCell(bi, i => {
              baseR[i] = r; baseG[i] = g; baseB[i] = b;
              engine.setColorNow(i, r, g, b, 1);
            });
          }
        },

        hover(e, i, col, row) {
          if (engine.mouse.zone) return;   // über Buttons kein Hover-Effekt
          const bx = Math.floor(col / size), by = Math.floor(row / size);
          for (let n = 0; n < hoverCount; n++) {
            // Zufälliger Block im Kreis um die Maus (gleichmäßig über die Fläche verteilt)
            const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * hoverRadius;
            const x = Math.round(bx + Math.cos(a) * d), y = Math.round(by + Math.sin(a) * d);
            if (x < 0 || y < 0 || x >= bcols || y >= brows) continue;

            const c = Math.random() < hoverGray ? shades[Math.floor(Math.random() * shades.length)] : background;
            const bi = y * bcols + x;
            // Hover macht einen Block nie heller als seine Ruhefarbe. Sonst blitzen am dichten
            // grauen Rand (Übergang zum Inhalt) einzelne Blöcke kurz weiß auf.
            if (c[0] > blockColor[bi * 3]) continue;
            forEachBlockCell(bi, j => engine.setColor(j, c[0], c[1], c[2], 1));
            touched.add(bi);
          }
        },

        update() {
          if (!touched.size) return;
          const m = engine.mouse;
          const bx = m.col / size, by = m.row / size;
          for (const bi of touched) {
            // Maus weg oder weit genug entfernt -> zurück zur eigentlichen Farbe
            const far = !m.inside || m.zone || Math.hypot((bi % bcols) - bx, ((bi / bcols) | 0) - by) > hoverRadius + 0.5;
            if (!far) continue;
            const r = blockColor[bi * 3], g = blockColor[bi * 3 + 1], b = blockColor[bi * 3 + 2];
            forEachBlockCell(bi, j => engine.setColor(j, r, g, b, 1));
            touched.delete(bi);
          }
        },

        baseColor(i) {
          return [baseR[i], baseG[i], baseB[i]];
        }
      };
      return api;
    },

    /*
     * Button aus Pixeln: Rahmen + Symbol direkt im Raster, kein HTML-Element.
     * Er meldet sich als klickbarer Bereich bei der Engine an (engine.zones),
     * damit andere Effekte über ihm ruhen und die Maus zur Hand wird.
     *
     * Optionen:
     *   icon            – Symbol als Liste von Zeilen ('#' = Pixel an), z. B. Behaviors.Icons.contrast(7)
     *   onClick         – Funktion, die beim Klick aufgerufen wird
     *   sizePx          – ungefähre Größe in CSS-px
     *   padding         – Abstand zwischen Rahmen und Symbol (in Button-Pixeln)
     *   anchor, align, offset – Position wie bei Behaviors.shape
     *   color           – Farbe von Rahmen und Symbol
     *   background      – Füllung
     *   hoverBackground – Füllung, solange die Maus darüber ist
     *   rightOf         – anderer pixelButton: direkt rechts daneben platzieren
     *   gap             – Abstand zu rightOf in Rasterpixeln
     *   round           – Ecken pixelig abrunden (Standard: true)
     *   visible         – Funktion (engine) => true/false: nur anzeigen, wenn true
     *                     (wird bei jeder Größenänderung neu geprüft)
     */
    pixelButton(options = {}) {
      const icon = options.icon ?? Icons.contrast();
      const onClick = options.onClick ?? (() => {});
      const sizePx = options.sizePx ?? 44;
      const pad = options.padding ?? 2;
      const anchor = options.anchor ?? [0, 0];
      const align = options.align ?? [0, 0];
      const offset = options.offset ?? [12, 12];
      const fg = options.color ?? [34, 34, 34];
      const bg = options.background ?? [255, 255, 255];
      const hoverBg = options.hoverBackground ?? [214, 214, 214];

      // Bitmap des Buttons: 2 = Rahmen/Symbol, 1 = Füllung, 0 = frei (Hintergrund bleibt sichtbar)
      const iw = icon[0].length, ih = icon.length;
      const W = iw + 2 * (pad + 1), H = ih + 2 * (pad + 1);
      const bitmap = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
          const ix = x - pad - 1, iy = y - pad - 1;
          const inIcon = ix >= 0 && iy >= 0 && ix < iw && iy < ih && icon[iy][ix] === '#';
          bitmap[y * W + x] = border || inIcon ? 2 : 1;
        }
      }
      // Abgerundete Ecken: Eckpixel weg, dafür den Pixel schräg innen zum Rahmen machen
      if (options.round ?? true) {
        for (const [cx, cy, ix, iy] of [[0, 0, 1, 1], [W - 1, 0, W - 2, 1], [0, H - 1, 1, H - 2], [W - 1, H - 1, W - 2, H - 2]]) {
          bitmap[cy * W + cx] = 0;
          bitmap[iy * W + ix] = 2;
        }
      }

      const zone = { col: 0, row: 0, w: 0, h: 0 };
      let s = 1, shown = true;

      return {
        zone,

        init(engine) {
          s = Math.max(1, Math.round((sizePx * engine.dpr) / engine.cellPx / W));
          shown = options.visible ? !!options.visible(engine) : true;
          // Unsichtbar = Bereich ohne Fläche: wird nie getroffen und nichts gezeichnet
          zone.w = shown ? W * s : 0;
          zone.h = shown ? H * s : 0;
          zone.col = Math.round(engine.cols * anchor[0] - zone.w * align[0] + offset[0]);
          zone.row = Math.round(engine.rows * anchor[1] - zone.h * align[1] + offset[1]);
          // rightOf nur, solange der andere Button sichtbar ist; sonst bleibt die feste Position
          if (options.rightOf && options.rightOf.zone.w > 0) {
            const other = options.rightOf.zone;
            zone.col = other.col + other.w + (options.gap ?? 4);
            zone.row = other.row;
          }
          if (!engine.zones.includes(zone)) engine.zones.push(zone);
        },

        update(engine) {
          if (!shown) return;
          const fill = engine.mouse.zone === zone ? hoverBg : bg;
          for (let y = 0; y < zone.h; y++) {
            for (let x = 0; x < zone.w; x++) {
              const v = bitmap[((y / s) | 0) * W + ((x / s) | 0)];
              if (v === 0) continue;
              const c = v === 2 ? fg : fill;
              engine.setColor(engine.index(zone.col + x, zone.row + y), c[0], c[1], c[2], 1);
            }
          }
        },

        click(engine, i, col, row) {
          if (engine.zoneAt(col, row) === zone) onClick();
        }
      };
    },

    /*
     * Ab und zu fliegt etwas durchs Bild: kleine Vogelschwärme, eine Sternschnuppe,
     * ein Glider aus Conways "Game of Life" oder ein UFO. Alles als Overlay in Grau,
     * der Zustand des Rasters wird nicht verändert.
     *
     * Optionen:
     *   every  – [min, max] Sekunden zwischen zwei Auftritten
     *   kinds  – welche Dinge vorkommen: 'birds', 'comet', 'glider', 'ufo'
     *   color  – Grundfarbe [r, g, b]
     *   pixel  – Größe eines Sprite-Pixels in Rasterpixeln
     *
     * Bei "Bewegung reduzieren" im Betriebssystem bleibt der Himmel leer.
     * spawn(kind?) lässt sofort etwas losfliegen (zum Ausprobieren).
     */
    ambient(options = {}) {
      const every = options.every ?? [3, 8];
      const kinds = options.kinds ?? ['birds', 'comet', 'glider', 'ufo'];
      const color = options.color ?? [100, 100, 100];
      const S = options.pixel ?? 2;
      const reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const BIRD = [
        ['#.....#', '.#...#.', '..#.#..', '...#...'],   // Flügel oben
        ['.......', '.......', '###.###', '...#...']    // Flügel unten
      ];
      const UFO = ['..###..', '.#####.', '#######', '.#.#.#.'];
      const GLIDER = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]];   // fliegt nach rechts unten

      let engine, actors = [], timer = 0;
      const rnd = (a, b) => a + Math.random() * (b - a);

      // Ein Sprite-Pixel = S x S Rasterpixel
      function dot(x, y, c, a) {
        const x0 = Math.round(x), y0 = Math.round(y);
        for (let sy = 0; sy < S; sy++) {
          for (let sx = 0; sx < S; sx++) engine.overlay(x0 + sx, y0 + sy, c[0], c[1], c[2], a);
        }
      }

      function sprite(rows, x, y, c, a) {
        for (let r = 0; r < rows.length; r++) {
          for (let k = 0; k < rows[r].length; k++) {
            if (rows[r][k] === '#') dot(x + k * S, y + r * S, c, a);
          }
        }
      }

      // Eine Generation "Game of Life" für eine kleine Menge lebender Zellen
      function lifeStep(cells) {
        const counts = new Map(), alive = new Set(cells.map(([x, y]) => x + ',' + y));
        for (const [x, y] of cells) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const key = (x + dx) + ',' + (y + dy);
              counts.set(key, (counts.get(key) || 0) + 1);
            }
          }
        }
        const next = [];
        for (const [key, n] of counts) {
          if (n === 3 || (n === 2 && alive.has(key))) next.push(key.split(',').map(Number));
        }
        return next;
      }

      // Absturz eines UFOs: es kippt weg, fällt, qualmt und zerspringt am unteren Rand in Pixel
      function crashUfo(a, dt, H) {
        const g = H * 0.6;   // Schwerkraft, passend zur Bildhöhe (Fallzeit etwa 1,5 s)
        if (!a.debris) {
          a.crashT += dt;
          a.vy += g * dt;
          a.vx *= 1 - Math.min(1, 1.2 * dt);
          a.x += a.vx * dt;
          a.y += a.vy * dt;
          a.smoke.push({ x: a.x + 3 * S + rnd(-1, 1), y: a.y + 2 * S, t: 0 });
          // Wackeln beim Fallen, schnelles Blinken statt des ruhigen Lichts
          const wobble = Math.sin(a.crashT * 25) * 0.6;
          const blink = Math.floor(a.crashT * 12) % 2 ? 40 : 220;
          sprite(UFO, a.x + wobble, a.y, color, 1);
          dot(a.x + 3 * S, a.y + 4 * S, [blink, blink, blink], 1);
          if (a.y + 4 * S >= H - 1) {   // unten angekommen: in Pixel zerspringen
            a.y = H - 4 * S - 1;
            a.debris = [];
            for (let i = 0; i < 28; i++) {
              a.debris.push({
                x: a.x + 3.5 * S, y: a.y + 2 * S,
                vx: rnd(-50, 50), vy: rnd(-80, -30), t: 0, life: rnd(0.8, 1.5)
              });
            }
          }
        }
        // Qualm steigt auf und verblasst
        for (const s of a.smoke) s.t += dt;
        a.smoke = a.smoke.filter(s => s.t < 0.9);
        for (const s of a.smoke) dot(s.x, s.y - s.t * 12, [150, 150, 150], 1 - s.t / 0.9);
        // Trümmer fliegen weg und verschwinden
        if (a.debris) {
          for (const p of a.debris) {
            p.t += dt;
            p.vy += g * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.t < p.life) dot(p.x, p.y, color, 1 - p.t / p.life);
          }
          a.debris = a.debris.filter(p => p.t < p.life);
          a.gone = a.debris.length === 0;
        }
      }

      // Zerfall eines Gleiters: seine Zellen lösen sich nacheinander auf (die nächste an der Maus zuerst),
      // jede wird zu ein paar Staubpixeln, die wegdriften und verblassen
      function dissolveGlider(a, dt) {
        a.dissolveT = (a.dissolveT || 0) + dt;
        while (a.cellsLeft.length && a.dissolveT >= 0.12) {
          a.dissolveT -= 0.12;
          const [x, y] = a.cellsLeft.shift();
          for (let k = 0; k < 3; k++) {
            a.dust.push({ x, y, vx: rnd(-8, 8), vy: rnd(-8, 8), t: 0, life: rnd(0.9, 1.4) });
          }
        }
        for (const [x, y] of a.cellsLeft) dot(x, y, color, 1);
        for (const d of a.dust) {
          d.t += dt;
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          const drag = 1 - Math.min(1, 1.5 * dt);
          d.vx *= drag;
          d.vy *= drag;
          if (d.t < d.life) dot(d.x, d.y, color, 1 - d.t / d.life);
        }
        a.dust = a.dust.filter(d => d.t < d.life);
        a.gone = a.cellsLeft.length === 0 && a.dust.length === 0;
      }

      // Feuerwerk: Funken fliegen in alle Richtungen auseinander und werden langsamer
      function makeSparks(x, y) {
        const sparks = [];
        for (let i = 0; i < 46; i++) {
          const angle = (i / 46) * Math.PI * 2 + rnd(-0.08, 0.08);
          const speed = rnd(25, 80);
          sparks.push({
            x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            t: 0, life: rnd(0.9, 1.5), trail: []
          });
        }
        return sparks;
      }

      function boomStep(a, dt, H) {
        const b = a.boom, g = H * 0.05;   // leichte Schwerkraft
        b.t += dt;
        // Ring, der sich kurz ausbreitet
        if (b.t < 0.3) {
          const r = b.t * 70;
          for (let k = 0; k < 24; k++) {
            const ang = (k / 24) * Math.PI * 2;
            dot(b.x + Math.cos(ang) * r, b.y + Math.sin(ang) * r, color, 1 - b.t / 0.3);
          }
        }
        // Funken mit kurzer Spur
        let alive = 0;
        for (const p of b.sparks) {
          if (p.t >= p.life) continue;
          p.t += dt;
          const drag = 1 - Math.min(1, 1.4 * dt);
          p.vx *= drag;
          p.vy = p.vy * drag + g * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.trail.push([p.x, p.y]);
          if (p.trail.length > 4) p.trail.shift();
          const fade = 1 - p.t / p.life;
          p.trail.forEach(([tx, ty], k) => dot(tx, ty, color, fade * (k + 1) / p.trail.length));
          alive++;
        }
        a.gone = alive === 0;
      }

      function spawn(kind = kinds[Math.floor(Math.random() * kinds.length)]) {
        const W = engine.cols, H = engine.rows;
        const fromLeft = Math.random() < 0.5, dir = fromLeft ? 1 : -1;

        if (kind === 'birds') {
          const n = 1 + Math.floor(Math.random() * 4);
          const y = rnd(H * 0.16, H * 0.6), speed = rnd(18, 30);   // unter der Button- und Logo-Leiste
          for (let i = 0; i < n; i++) {
            actors.push({
              kind, x: (fromLeft ? -10 : W + 3) - dir * i * rnd(7, 11), y: y + (i % 2 ? 1 : -1) * i * rnd(2, 4),
              vx: dir * speed, vy: 0, t: Math.random() * 10
            });
          }
        } else if (kind === 'comet') {
          actors.push({
            kind, x: rnd(W * 0.2, W * 0.95), y: -4,
            vx: (Math.random() < 0.5 ? -1 : 1) * rnd(70, 100), vy: rnd(28, 42), t: 0
          });
        } else if (kind === 'glider') {
          // In eine zufällige diagonale Richtung, Start am passenden Rand
          const sx = Math.random() < 0.5 ? 1 : -1, sy = Math.random() < 0.5 ? 1 : -1;
          actors.push({
            kind, x: sx > 0 ? rnd(0, W * 0.4) : rnd(W * 0.6, W), y: sy > 0 ? rnd(0, H * 0.3) : rnd(H * 0.7, H),
            cells: GLIDER.map(([x, y]) => [x * sx, y * sy]), t: 0, step: 0, life: rnd(10, 16)
          });
        } else if (kind === 'ufo') {
          actors.push({
            kind, x: fromLeft ? -20 : W + 1, y: rnd(H * 0.16, H * 0.32), vx: dir * rnd(10, 16), vy: 0, t: 0,
            crashing: false, crashT: 0, smoke: [], debris: null
          });
        }
      }

      return {
        init(e) {
          engine = e;
          actors = [];
          timer = rnd(every[0], every[1]) * 0.5;   // das erste Mal etwas früher
        },

        spawn(kind) {
          if (engine) spawn(kind);
        },

        update(e, dt) {
          if (reduced) return;
          timer -= dt;
          if (timer <= 0) {
            timer = rnd(every[0], every[1]);
            if (actors.length < 8) spawn();
          }

          const W = engine.cols, H = engine.rows, m = engine.mouse;
          for (const a of actors) {
            a.t += dt;

            if (a.kind === 'birds') {
              // Vögel fliehen nach oben, wenn die Maus zu nah kommt
              if (m.inside && Math.hypot(m.col - a.x - 3 * S, m.row - a.y - 2 * S) < 30) {
                a.vy -= 90 * dt;
                a.vx += Math.sign(a.vx) * 30 * dt;
              }
              a.x += a.vx * dt;
              a.y += a.vy * dt + Math.sin(a.t * 3) * 0.05;
              sprite(BIRD[Math.floor(a.t / 0.18) % 2], a.x, a.y, color, 1);
              a.gone = a.x < -30 || a.x > W + 30 || a.y < -10;
            } else if (a.kind === 'comet') {
              // Kommt die Maus dem Kometen nah, explodiert er wie ein Feuerwerk
              if (!a.boom && m.inside && Math.abs(m.col - a.x) < 5 && Math.abs(m.row - a.y) < 5) {
                a.boom = { x: a.x, y: a.y, t: 0, sparks: makeSparks(a.x, a.y) };
              }
              if (a.boom) {
                boomStep(a, dt, H);
              } else {
                a.x += a.vx * dt;
                a.y += a.vy * dt;
                const len = Math.hypot(a.vx, a.vy), ux = a.vx / len, uy = a.vy / len;
                for (let t = 0; t < 16; t++) {
                  const g = t === 0 ? color[0] - 50 : color[0] + t * 7;
                  dot(a.x - ux * t * S, a.y - uy * t * S, [g, g, g], 1 - t / 16);
                }
                a.gone = a.y > H + 20 || a.x < -30 || a.x > W + 30;
              }
            } else if (a.kind === 'glider') {
              // Berührt die Maus den Gleiter, zerfällt er
              if (!a.dissolving && m.inside && a.cells.some(([cx, cy]) =>
                    Math.abs(m.col - (a.x + cx * S)) < 4 && Math.abs(m.row - (a.y + cy * S)) < 4)) {
                a.dissolving = true;
                a.dust = [];
                a.dissolveT = 0;
                a.cellsLeft = a.cells.map(([cx, cy]) => [a.x + cx * S, a.y + cy * S])
                  .sort((p, q) => Math.hypot(p[0] - m.col, p[1] - m.row) - Math.hypot(q[0] - m.col, q[1] - m.row));
              }
              if (a.dissolving) {
                dissolveGlider(a, dt);
              } else {
                // Nächste Generation etwa 11x pro Sekunde
                while (a.t > (a.step + 1) * 0.09) {
                  a.step++;
                  a.cells = lifeStep(a.cells);
                }
                const fade = Math.min(1, a.t / 0.5, (a.life - a.t) / 1);
                for (const [cx, cy] of a.cells) dot(a.x + cx * S, a.y + cy * S, color, fade);
                a.gone = a.t > a.life;
              }
            } else if (a.kind === 'ufo') {
              // Fährt die Maus über das UFO, stürzt es ab
              if (!a.crashing && m.inside &&
                  m.col >= a.x - 2 && m.col <= a.x + 7 * S + 2 &&
                  m.row >= a.y - 2 && m.row <= a.y + 4 * S + 2) {
                a.crashing = true;
              }
              if (a.crashing) {
                crashUfo(a, dt, H);
              } else {
                a.x += a.vx * dt;
                sprite(UFO, a.x, a.y + Math.sin(a.t * 2) * 1.5, color, 1);
                // Blinkendes Licht unten
                const blink = Math.floor(a.t * 4) % 2 ? 60 : 200;
                dot(a.x + 3 * S, a.y + Math.sin(a.t * 2) * 1.5 + 4 * S, [blink, blink, blink], 1);
                a.gone = a.x < -20 || a.x > W + 20;
              }
            }
          }
          actors = actors.filter(a => !a.gone);
        }
      };
    },

    /*
     * Bildschirmschoner: Nach einer Weile ohne Maus, Tastatur oder Touch scrollt die
     * Seite nach oben, ein heller Schleier legt sich über alles und es laufen
     * abwechselnd kleine Szenen – alles in Grau und im Raster. Jede Eingabe weckt
     * die Seite wieder auf.
     *
     * Optionen:
     *   idle      – Sekunden ohne Eingabe bis zum Start
     *   sceneTime – Sekunden pro Szene
     *   scenes    – Reihenfolge: 'matrix', 'life', 'bounce', 'stars'
     *   logo      – Form für die 'bounce'-Szene (z. B. Shapes.logoSmall)
     *   onWake    – Funktion, die beim Aufwachen aufgerufen wird
     *
     * start() startet den Bildschirmschoner sofort (zum Ausprobieren), stop() beendet ihn,
     * show('life') springt direkt zu einer Szene.
     */
    screensaver(options = {}) {
      const idle = options.idle ?? 300;
      const sceneTime = options.sceneTime ?? 25;
      const sceneList = options.scenes ?? ['matrix', 'life', 'bounce', 'stars'];
      const logo = options.logo ?? null;
      const onWake = options.onWake ?? (() => {});

      let engine, active = false, lastInput = performance.now(), listening = false;
      let sceneIndex = -1, sceneAge = 0, scene = null;
      const rnd = (a, b) => a + Math.random() * (b - a);

      function rect(x, y, w, h, g, a) {
        const x0 = Math.round(x), y0 = Math.round(y);
        for (let yy = 0; yy < h; yy++) {
          for (let xx = 0; xx < w; xx++) engine.overlay(x0 + xx, y0 + yy, g, g, g, a);
        }
      }

      // ---------- Szenen: jede hat start() und draw(dt) ----------
      const SCENES = {
        // Graue Zeichenkolonnen regnen über den ganzen Bildschirm
        matrix() {
          const step = 4, drops = [];
          for (let x = 0; x < engine.cols; x += step) {
            drops.push({ x, y: rnd(-engine.rows, 0), speed: rnd(25, 70), len: Math.floor(rnd(10, 28)) });
          }
          return {
            draw(dt, time) {
              const flick = Math.floor(time * 10);
              for (const d of drops) {
                d.y += d.speed * dt;
                if ((d.y - d.len * 2) > engine.rows) {
                  d.y = rnd(-40, 0); d.speed = rnd(25, 70); d.len = Math.floor(rnd(10, 28));
                }
                for (let t = 0; t < d.len; t++) {
                  const row = Math.floor(d.y) - t * 2;
                  if (row < 0 || row >= engine.rows) continue;
                  if (t > 0 && hash2(d.x * 7 + row, flick) < 0.25) continue;   // flackernde "Zeichen"
                  const g = t === 0 ? 40 : 90 + (130 * t) / d.len;
                  rect(d.x, row, 2, 2, g, t === 0 ? 1 : 1 - t / d.len);
                }
              }
            }
          };
        },

        // Conways "Game of Life" über den ganzen Bildschirm, zufällig gestartet
        life() {
          const C = 4, w = Math.ceil(engine.cols / C), h = Math.ceil(engine.rows / C);
          let grid = Uint8Array.from({ length: w * h }, () => (Math.random() < 0.22 ? 1 : 0));
          let next = new Uint8Array(w * h), acc = 0;
          return {
            draw(dt) {
              acc += dt;
              while (acc > 0.11) {
                acc -= 0.11;
                for (let y = 0; y < h; y++) {
                  for (let x = 0; x < w; x++) {
                    let n = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                      for (let dx = -1; dx <= 1; dx++) {
                        if (dx || dy) n += grid[((y + dy + h) % h) * w + ((x + dx + w) % w)];
                      }
                    }
                    const alive = grid[y * w + x];
                    next[y * w + x] = n === 3 || (alive && n === 2) ? 1 : 0;
                  }
                }
                [grid, next] = [next, grid];
              }
              for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                  if (grid[y * w + x]) rect(x * C, y * C, C - 1, C - 1, 80 + ((x + y) % 3) * 30, 1);
                }
              }
            }
          };
        },

        // Das Logo springt wie ein alter DVD-Player-Schoner durchs Bild
        bounce() {
          if (!logo) return SCENES.stars();
          const S = 3, w = logo.width * S, h = logo.height * S;
          const shades = [40, 80, 120, 160];
          let x = rnd(0, engine.cols - w), y = rnd(0, engine.rows - h);
          let vx = (Math.random() < 0.5 ? -1 : 1) * 30, vy = (Math.random() < 0.5 ? -1 : 1) * 22, shade = 0;
          return {
            draw(dt) {
              x += vx * dt; y += vy * dt;
              if (x < 0 || x > engine.cols - w) { vx = -vx; x = Math.max(0, Math.min(engine.cols - w, x)); shade++; }
              if (y < 0 || y > engine.rows - h) { vy = -vy; y = Math.max(0, Math.min(engine.rows - h, y)); shade++; }
              const g = shades[shade % shades.length];
              for (let k = 0; k < logo.count; k++) rect(x + logo.x[k] * S, y + logo.y[k] * S, S, S, g, 1);
            }
          };
        },

        // Sternenflug: Punkte fliegen aus der Mitte auf einen zu
        stars() {
          const stars = [];
          const reset = (st, far) => {
            st.x = rnd(-1, 1); st.y = rnd(-1, 1); st.z = far ? rnd(0.6, 1) : rnd(0.05, 1);
          };
          for (let i = 0; i < 220; i++) { const st = {}; reset(st, false); stars.push(st); }
          return {
            draw(dt) {
              const cx = engine.cols / 2, cy = engine.rows / 2, f = Math.min(cx, cy);
              for (const st of stars) {
                st.z -= dt * 0.25;
                const sx = cx + (st.x / st.z) * f, sy = cy + (st.y / st.z) * f;
                if (st.z <= 0.02 || sx < 0 || sy < 0 || sx >= engine.cols || sy >= engine.rows) { reset(st, true); continue; }
                const size = st.z < 0.25 ? 3 : st.z < 0.5 ? 2 : 1;
                const g = Math.round(40 + 160 * st.z);
                rect(sx, sy, size, size, g, 1);
              }
            }
          };
        }
      };

      function nextScene() {
        sceneIndex = (sceneIndex + 1) % sceneList.length;
        sceneAge = 0;
        scene = SCENES[sceneList[sceneIndex]]();
      }

      function start() {
        if (active || !engine) return;
        active = true;
        sceneIndex = -1;
        nextScene();
        global.scrollTo({ top: 0, behavior: 'smooth' });
        // Falls sanftes Scrollen nicht klappt (z. B. im Hintergrund-Tab): hart nach oben
        setTimeout(() => { if (active && global.scrollY > 0) global.scrollTo(0, 0); }, 1500);
      }

      function stop() {
        if (!active) return;
        active = false;
        scene = null;
        onWake();
      }

      function input() {
        lastInput = performance.now();
        stop();
      }

      return {
        start,
        stop,
        show(name) {
          start();
          const i = sceneList.indexOf(name);
          if (i < 0 || !SCENES[name]) return;
          sceneIndex = i;
          sceneAge = 0;
          scene = SCENES[name]();
        },
        get active() { return active; },

        init(e) {
          engine = e;
          if (scene) scene = SCENES[sceneList[sceneIndex]]();   // Raster hat sich geändert
          if (listening) return;
          listening = true;
          // Scrollen zählt bewusst nicht – das macht der Schoner ja selbst
          for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) {
            global.addEventListener(type, input, { passive: true });
          }
        },

        update(e, dt, time) {
          if (!active && performance.now() - lastInput > idle * 1000) start();

          // Schleier weich ein- und ausblenden
          const target = active ? 0.92 : 0;
          if (engine.veil !== target) {
            engine.veil = active ? Math.min(target, engine.veil + dt * 0.8) : Math.max(0, engine.veil - dt * 3);
          }
          if (!active) return;

          sceneAge += dt;
          if (sceneAge > sceneTime) nextScene();
          scene.draw(dt, time);
        }
      };
    },

    /*
     * Schnee: ab und zu fällt eine kleine weiße Flocke von oben nach unten und weht dabei
     * leicht hin und her. Gezeichnet als Overlay, der Zustand des Rasters bleibt unverändert.
     * Weiß bleibt weiß, auch im Dark Mode (keep). Damit man sie auf dem weißen Feld sieht,
     * hat jede Flocke einen zarten grauen Rand.
     *
     * Die Positionen stehen als Anteile der Fläche (0…1), damit sie beim Ändern der
     * Fenstergröße an der richtigen Stelle bleiben.
     *
     * Optionen:
     *   max     – höchstens so viele Flocken gleichzeitig (Standard: je nach Fläche)
     *   every   – [min, max] Sekunden zwischen zwei neuen Flocken
     *   speed   – Faktor auf die Fallgeschwindigkeit (1 = normal, 0.5 = halb so schnell)
     *
     * Bei "Bewegung reduzieren" im Betriebssystem fällt kein Schnee.
     */
    snow(options = {}) {
      const every = options.every ?? [2, 6];
      const speed = options.speed ?? 1;
      const reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const CORE = [255, 255, 255];
      const EDGE = [120, 120, 130], EDGE_ALPHA = 0.55;
      // Kleine Flocken: ein Punkt oder ein 2x2-Block, jeweils mit Rand außen herum
      const SHAPES = [
        { core: [[0, 0]], edge: [[1, 0], [-1, 0], [0, 1], [0, -1]] },
        { core: [[0, 0], [1, 0], [0, 1], [1, 1]], edge: [[-1, 0], [-1, 1], [2, 0], [2, 1], [0, -1], [1, -1], [0, 2], [1, 2]] }
      ];

      let flakes = [], timer = 0, t = 0;
      const rnd = (a, b) => a + Math.random() * (b - a);

      function makeFlake(v) {
        return {
          u: Math.random(),                          // Position in der Breite (0…1)
          v,                                         // Position in der Höhe (0…1)
          fall: rnd(0.04, 0.07) * speed,             // Anteil der Höhe pro Sekunde
          amp: rnd(0.6, 1.8),                        // Seitwärts-Schwingung in Rasterpixeln
          freq: rnd(0.8, 1.6),
          phase: rnd(0, Math.PI * 2),
          shape: Math.random() < 0.7 ? SHAPES[0] : SHAPES[1]
        };
      }

      return {
        init() {
          // Beim Ändern der Fenstergröße bleiben die Flocken erhalten
          if (flakes.length) return;
          flakes = Array.from({ length: 3 }, () => makeFlake(Math.random()));   // gleich ein paar im Bild
          timer = rnd(every[0], every[1]);
        },

        update(e, dt) {
          if (reduced) return;
          t += dt;
          const W = e.cols, H = e.rows;
          const limit = options.max ?? Math.max(8, Math.min(14, Math.round((W * H) / 4000)));

          timer -= dt;
          if (timer <= 0) {
            timer = rnd(every[0], every[1]);
            if (flakes.length < limit) flakes.push(makeFlake(-rnd(0.01, 0.05)));
          }

          const wind = Math.sin(t * 0.12) * 0.004;   // leichter Wind (Anteil der Breite pro Sekunde)
          for (let k = flakes.length - 1; k >= 0; k--) {
            const f = flakes[k];
            f.v += f.fall * dt;
            f.u += wind * dt;
            if (f.u < 0) f.u += 1;
            else if (f.u >= 1) f.u -= 1;
            if (f.v > 1.02) { flakes.splice(k, 1); continue; }   // unten angekommen

            const x = Math.round(f.u * W + Math.sin(t * f.freq + f.phase) * f.amp);
            const y = Math.round(f.v * H);
            for (const [dx, dy] of f.shape.edge) {
              e.overlay(x + dx, y + dy, EDGE[0], EDGE[1], EDGE[2], EDGE_ALPHA, true);
            }
            for (const [dx, dy] of f.shape.core) {
              e.overlay(x + dx, y + dy, CORE[0], CORE[1], CORE[2], 1, true);
            }
          }
        }
      };
    },

    /*
     * Fledermäuse: ab und zu fliegt eine kleine Gruppe quer durchs Bild und flattert dabei.
     * Gezeichnet als Overlay; die Farbe bleibt im Dark Mode so, wie sie ist (keep).
     *
     * Optionen:
     *   every  – [min, max] Sekunden zwischen zwei Auftritten
     *   color  – Farbe [r, g, b]
     *   pixel  – Größe eines Sprite-Pixels in Rasterpixeln
     *
     * Bei "Bewegung reduzieren" im Betriebssystem fliegt keine Fledermaus.
     */
    bats(options = {}) {
      const every = options.every ?? [7, 14];
      const color = options.color ?? [130, 70, 190];
      const S = options.pixel ?? 1;
      const reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const FRAMES = [
        ['#.......#', '##.###.##', '#.#####.#', '..##.##..'],   // Flügel oben
        ['.........', '#.......#', '##.###.##', '#.#####.#']    // Flügel unten
      ];

      let bats = [], timer = 2 + Math.random() * 3, t = 0;
      const rnd = (a, b) => a + Math.random() * (b - a);

      // Eine Gruppe von 1 bis 3 Fledermäusen, von links oder rechts, in gleicher Höhe
      function spawnGroup() {
        const fromLeft = Math.random() < 0.5, dir = fromLeft ? 1 : -1;
        const n = 1 + Math.floor(Math.random() * 3);
        const v = rnd(0.12, 0.45), speed = rnd(0.05, 0.09) * dir;   // Anteile: Höhe, Breite pro Sekunde
        for (let i = 0; i < n; i++) {
          bats.push({
            u: (fromLeft ? -0.05 : 1.05) - dir * i * rnd(0.04, 0.07),
            v: v + rnd(-0.03, 0.03) + i * 0.02,
            speed: speed * rnd(0.9, 1.1),
            phase: Math.random() * 10
          });
        }
      }

      function drawSprite(e, rows, x, y) {
        for (let r = 0; r < rows.length; r++) {
          for (let k = 0; k < rows[r].length; k++) {
            if (rows[r][k] !== '#') continue;
            for (let sy = 0; sy < S; sy++) {
              for (let sx = 0; sx < S; sx++) {
                e.overlay(x + k * S + sx, y + r * S + sy, color[0], color[1], color[2], 1, true);
              }
            }
          }
        }
      }

      return {
        update(e, dt) {
          if (reduced) return;
          t += dt;
          timer -= dt;
          if (timer <= 0) {
            timer = rnd(every[0], every[1]);
            spawnGroup();
          }

          const W = e.cols, H = e.rows;
          for (let k = bats.length - 1; k >= 0; k--) {
            const b = bats[k];
            b.u += b.speed * dt;
            if (b.u < -0.1 || b.u > 1.1) { bats.splice(k, 1); continue; }

            const x = Math.round(b.u * W);
            const y = Math.round(b.v * H + Math.sin(t * 2 + b.phase) * 2);   // sanftes Auf und Ab
            const rows = FRAMES[Math.floor((t + b.phase) / 0.22) % 2];        // Flügelschlag
            drawSprite(e, rows, x, y);
          }
        }
      };
    },

    /*
     * Geister: ab und zu steigt ein kleiner Geist langsam von unten auf und wabert dabei
     * seitlich. Sie werden unten und oben weich ein- und ausgeblendet. Gezeichnet als Overlay
     * in Lavendel; die Farbe bleibt im Dark Mode so, wie sie ist (keep).
     *
     * Optionen:
     *   every  – [min, max] Sekunden zwischen zwei neuen Geistern
     *   max    – höchstens so viele Geister gleichzeitig
     *   color  – Farbe [r, g, b]
     *   alpha  – Deckkraft (0…1)
     *
     * Bei "Bewegung reduzieren" im Betriebssystem erscheinen keine Geister.
     */
    ghosts(options = {}) {
      const every = options.every ?? [4, 9];
      const max = options.max ?? 3;
      const color = options.color ?? [150, 130, 200];
      const alpha = options.alpha ?? 0.8;
      const reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // Löcher (.) sind die Augen und der Wellenrand unten
      const GHOST = ['.###.', '#####', '#.#.#', '#####', '#####', '#.#.#'];

      let ghosts = [], timer = 1 + Math.random() * 2, t = 0;
      const rnd = (a, b) => a + Math.random() * (b - a);

      return {
        update(e, dt) {
          if (reduced) return;
          t += dt;
          timer -= dt;
          if (timer <= 0) {
            timer = rnd(every[0], every[1]);
            if (ghosts.length < max) {
              ghosts.push({
                u: rnd(0.1, 0.9),     // Position in der Breite (Anteil)
                v: 1.05,              // Position in der Höhe (Anteil), startet unten
                rise: rnd(0.025, 0.04),
                sway: rnd(0.6, 1.6),
                phase: Math.random() * 10
              });
            }
          }

          const W = e.cols, H = e.rows;
          // Auf dem Bildschirm ist ein Pixel des Geists so groß wie 2 Rasterpixel, am Handy 1
          const S = W >= 200 ? 2 : 1;
          for (let k = ghosts.length - 1; k >= 0; k--) {
            const g = ghosts[k];
            g.v -= g.rise * dt;
            if (g.v < -0.15) { ghosts.splice(k, 1); continue; }

            const x = Math.round(g.u * W + Math.sin(t * g.sway + g.phase) * 3);
            const y = Math.round(g.v * H);
            // Weich ein- und ausblenden, am unteren und oberen Rand
            const fade = Math.max(0, Math.min(1, (1.05 - g.v) * 6, (g.v + 0.15) * 6));
            for (let r = 0; r < GHOST.length; r++) {
              for (let c = 0; c < GHOST[r].length; c++) {
                if (GHOST[r][c] !== '#') continue;
                for (let sy = 0; sy < S; sy++) {
                  for (let sx = 0; sx < S; sx++) {
                    e.overlay(x + c * S + sx, y + r * S + sy, color[0], color[1], color[2], alpha * fade, true);
                  }
                }
              }
            }
          }
        }
      };
    },

    /*
     * Osterhasen: ab und zu hoppelt ein kleiner Hase unten quer durchs Bild. Bei jedem
     * Hopser hebt er kurz ab. Gezeichnet als Overlay; die Farbe bleibt im Dark Mode so,
     * wie sie ist (keep).
     *
     * Optionen:
     *   every  – [min, max] Sekunden zwischen zwei Auftritten
     *   color  – Farbe [r, g, b]
     *
     * Bei "Bewegung reduzieren" im Betriebssystem hoppelt niemand.
     */
    bunnies(options = {}) {
      const every = options.every ?? [8, 16];
      const color = options.color ?? [150, 105, 75];
      const reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // Front-Ansicht: Ohren, Kopf, Körper. Beim Sprung sind die Füße eingezogen.
      const AIR = ['.#...#.', '.#...#.', '#######', '#.###.#', '#######', '.#...#.'];
      const LAND = ['.#...#.', '.#...#.', '#######', '#.###.#', '#######', '##...##'];
      const HOP = 0.8;   // Sekunden pro Hopser
      const AIR_PART = 0.6;   // Anteil des Hopsers, in dem der Hase in der Luft ist

      let bunnies = [], timer = 3 + Math.random() * 4, t = 0;
      const rnd = (a, b) => a + Math.random() * (b - a);

      function spawn() {
        const fromLeft = Math.random() < 0.5;
        bunnies.push({
          u: fromLeft ? -0.05 : 1.05,
          dir: fromLeft ? 1 : -1,
          speed: rnd(0.05, 0.08),   // Anteil der Breite pro Sekunde
          phase: Math.random() * 10
        });
      }

      return {
        update(e, dt) {
          if (reduced) return;
          t += dt;
          timer -= dt;
          if (timer <= 0) {
            timer = rnd(every[0], every[1]);
            spawn();
          }

          const W = e.cols, H = e.rows;
          const S = W >= 200 ? 2 : 1;   // auf dem großen Bildschirm etwas größer
          for (let k = bunnies.length - 1; k >= 0; k--) {
            const b = bunnies[k];
            b.u += b.dir * b.speed * dt;
            if (b.u < -0.1 || b.u > 1.1) { bunnies.splice(k, 1); continue; }

            const cyc = ((t + b.phase) % HOP) / HOP;           // 0…1 innerhalb eines Hopsers
            const inAir = cyc < AIR_PART;
            const lift = inAir ? Math.sin(Math.PI * cyc / AIR_PART) * 4 * S : 0;
            const x = Math.round(b.u * W);
            const y = Math.round(H * 0.9 - 6 * S - lift);      // Füße knapp über dem unteren Rand
            paintRows(e, inAir ? AIR : LAND, x, y, S, color, 1);
          }
        }
      };
    },

    /*
     * Ostereier: ab und zu taucht irgendwo im Bild ein bemaltes Ei auf, blendet weich ein,
     * bleibt kurz und blendet wieder aus. Die Farben kommen aus den Optionen (z. B. die
     * Saisonfarben), die Farbe bleibt im Dark Mode so, wie sie ist (keep).
     *
     * Optionen:
     *   every  – [min, max] Sekunden zwischen zwei neuen Eiern
     *   max    – höchstens so viele Eier gleichzeitig
     *   colors – Liste von Farben [[r, g, b], …], eine davon wird zufällig genommen
     *
     * Bei "Bewegung reduzieren" im Betriebssystem erscheinen keine Eier.
     */
    eggs(options = {}) {
      const every = options.every ?? [1.5, 4];
      const max = options.max ?? 6;
      const colors = options.colors ?? [[110, 200, 165], [140, 195, 235], [200, 160, 230], [240, 135, 185], [250, 205, 95]];
      const reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const EGG = ['.#.', '###', '###', '.#.'];

      let eggs = [], timer = 1 + Math.random(), t = 0;
      const rnd = (a, b) => a + Math.random() * (b - a);

      return {
        update(e, dt) {
          if (reduced) return;
          t += dt;
          timer -= dt;
          if (timer <= 0) {
            timer = rnd(every[0], every[1]);
            if (eggs.length < max) {
              eggs.push({
                u: rnd(0.05, 0.95),
                v: rnd(0.1, 0.9),
                life: 0,
                dur: rnd(3, 4.5),
                color: colors[Math.floor(Math.random() * colors.length)]
              });
            }
          }

          const W = e.cols, H = e.rows;
          const S = W >= 200 ? 2 : 1;
          for (let k = eggs.length - 1; k >= 0; k--) {
            const g = eggs[k];
            g.life += dt;
            if (g.life >= g.dur) { eggs.splice(k, 1); continue; }

            // Weich einblenden, dann kurz stehen, dann ausblenden
            const fade = Math.max(0, Math.min(1, g.life / 0.6, (g.dur - g.life) / 0.8));
            const x = Math.round(g.u * W), y = Math.round(g.v * H);
            paintRows(e, EGG, x, y, S, g.color, fade);
          }
        }
      };
    },

    /*
     * Herzen: ab und zu steigt ein kleines Herz langsam von unten auf, wiegt sich dabei
     * seitlich und pulsiert leicht. Oben und unten wird es weich ein- und ausgeblendet.
     * Gezeichnet als Overlay; die Farbe bleibt im Dark Mode so, wie sie ist (keep).
     *
     * Optionen:
     *   every  – [min, max] Sekunden zwischen zwei neuen Herzen
     *   max    – höchstens so viele Herzen gleichzeitig
     *   color  – Farbe [r, g, b]
     *
     * Bei "Bewegung reduzieren" im Betriebssystem erscheinen keine Herzen.
     */
    hearts(options = {}) {
      const every = options.every ?? [2.5, 6];
      const max = options.max ?? 6;
      const color = options.color ?? [225, 60, 110];
      const reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];

      let hearts = [], timer = 1 + Math.random() * 2, t = 0;
      const rnd = (a, b) => a + Math.random() * (b - a);

      return {
        update(e, dt) {
          if (reduced) return;
          t += dt;
          timer -= dt;
          if (timer <= 0) {
            timer = rnd(every[0], every[1]);
            if (hearts.length < max) {
              hearts.push({
                u: rnd(0.08, 0.92),   // Position in der Breite (Anteil)
                v: 1.05,              // Position in der Höhe (Anteil), startet unten
                rise: rnd(0.03, 0.045),
                sway: rnd(0.8, 1.8),
                phase: Math.random() * 10
              });
            }
          }

          const W = e.cols, H = e.rows;
          const S = W >= 200 ? 2 : 1;
          for (let k = hearts.length - 1; k >= 0; k--) {
            const h = hearts[k];
            h.v -= h.rise * dt;
            if (h.v < -0.15) { hearts.splice(k, 1); continue; }

            const x = Math.round(h.u * W + Math.sin(t * h.sway + h.phase) * 3);
            const y = Math.round(h.v * H);
            const fade = Math.max(0, Math.min(1, (1.05 - h.v) * 6, (h.v + 0.15) * 6));
            const pulse = 0.85 + 0.15 * Math.sin(t * 4 + h.phase);   // leichtes Pulsieren
            paintRows(e, HEART, x, y, S, color, pulse * fade);
          }
        }
      };
    },

    /*
     * Feuerwerk: ab und zu steigt eine Rakete von unten auf und platzt oben in einem bunten
     * Kreis aus Funken, die langsam fallen und verblassen. Gezeichnet als Overlay; die Farben
     * bleiben im Dark Mode so, wie sie sind (keep).
     *
     * Optionen:
     *   every  – [min, max] Sekunden zwischen zwei Raketen
     *   colors – Liste von Farben [[r, g, b], …], eine davon pro Rakete
     *
     * Bei "Bewegung reduzieren" im Betriebssystem gibt es kein Feuerwerk.
     */
    fireworks(options = {}) {
      const every = options.every ?? [1.5, 3.5];
      const colors = options.colors ?? [[255, 210, 90], [240, 70, 70], [90, 170, 255], [255, 150, 60]];
      const reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

      let rockets = [], sparks = [], timer = 1, t = 0;
      const rnd = (a, b) => a + Math.random() * (b - a);
      const pick = list => list[Math.floor(Math.random() * list.length)];

      // Ein Punkt der Grafik: S x S Rasterpixel (auf großen Bildschirmen größer)
      const blob = (e, x, y, S, c, a) => {
        for (let sy = 0; sy < S; sy++) {
          for (let sx = 0; sx < S; sx++) e.overlay(x + sx, y + sy, c[0], c[1], c[2], a, true);
        }
      };

      // Funken rechnen in Anteilen der Fläche; das Seitenverhältnis sorgt dafür, dass der Kreis rund bleibt
      function burst(e, u, v, color) {
        const n = 16 + Math.floor(Math.random() * 7);
        const aspect = e.rows / e.cols;
        const parts = [];
        for (let i = 0; i < n; i++) {
          const angle = (i / n) * Math.PI * 2 + rnd(-0.1, 0.1);
          const speed = rnd(0.15, 0.3);   // Anteil der Höhe pro Sekunde
          parts.push({ u, v, du: Math.cos(angle) * speed * aspect, dv: Math.sin(angle) * speed });
        }
        sparks.push({ parts, color, age: 0, life: rnd(1.0, 1.4) });
      }

      return {
        update(e, dt) {
          if (reduced) return;
          t += dt;
          timer -= dt;
          if (timer <= 0) {
            timer = rnd(every[0], every[1]);
            rockets.push({ u: rnd(0.15, 0.85), v: 1.02, rise: rnd(0.5, 0.8), target: rnd(0.12, 0.45), color: pick(colors) });
          }

          const W = e.cols, H = e.rows;
          const S = W >= 200 ? 2 : 1;
          for (let k = rockets.length - 1; k >= 0; k--) {
            const r = rockets[k];
            r.v -= r.rise * dt;
            if (r.v <= r.target) {   // oben angekommen: platzen
              burst(e, r.u, r.v, r.color);
              rockets.splice(k, 1);
              continue;
            }
            const x = Math.round(r.u * W), y = Math.round(r.v * H);
            blob(e, x, y, S, r.color, 1);
            blob(e, x, y + S, S, r.color, 0.5);   // kurze Spur
          }

          for (let k = sparks.length - 1; k >= 0; k--) {
            const s = sparks[k];
            s.age += dt;
            if (s.age >= s.life) { sparks.splice(k, 1); continue; }
            const fade = 1 - s.age / s.life;
            for (const p of s.parts) {
              p.u += p.du * dt;
              p.v += p.dv * dt;
              p.dv += 0.25 * dt;   // Schwerkraft
              blob(e, Math.round(p.u * W), Math.round(p.v * H), S, s.color, fade);
            }
          }
        }
      };
    },

    /*
     * Streiche: ruft in unregelmäßigen Abständen eine Funktion auf, z. B. um Name und Logo mit
     * einer anderen Animation neu aufzubauen. Hat selbst keine Darstellung.
     *
     * Optionen:
     *   every   – [min, max] Sekunden zwischen zwei Streichen
     *   onTrick – Funktion, die bei jedem Streich läuft
     *
     * Bei "Bewegung reduzieren" im Betriebssystem gibt es keine Streiche.
     */
    tricks(options = {}) {
      const every = options.every ?? [25, 45];
      const onTrick = options.onTrick ?? (() => {});
      const reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const rnd = (a, b) => a + Math.random() * (b - a);

      let timer = rnd(10, 20);   // der erste Streich kommt bald nach dem Laden
      return {
        update(e, dt) {
          if (reduced) return;
          timer -= dt;
          if (timer <= 0) {
            timer = rnd(every[0], every[1]);
            onTrick();
          }
        }
      };
    },

    /*
     * Konfetti: bunte Schnipsel fallen von oben nach unten und wehen dabei hin und her.
     * Wie der Schnee, aber in Farbe und mit mehr Teilchen. Gezeichnet als Overlay; die Farben
     * bleiben im Dark Mode so, wie sie sind (keep).
     *
     * Optionen:
     *   every  – [min, max] Sekunden zwischen zwei neuen Schnipseln
     *   max    – höchstens so viele gleichzeitig (Standard: je nach Fläche)
     *   colors – Liste von Farben [[r, g, b], …]
     *   speed  – Faktor auf die Fallgeschwindigkeit (1 = normal)
     *
     * Bei "Bewegung reduzieren" im Betriebssystem fällt kein Konfetti.
     */
    confetti(options = {}) {
      const every = options.every ?? [0.5, 1.5];
      const colors = options.colors ?? [[220, 40, 50], [250, 200, 40], [60, 170, 80], [50, 120, 230], [230, 90, 180]];
      const speed = options.speed ?? 1;
      const reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // Schnipsel: ein Punkt, ein waagerechter oder ein senkrechter Strich
      const SHAPES = [[[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]]];

      let pieces = [], timer = 0.5, t = 0;
      const rnd = (a, b) => a + Math.random() * (b - a);
      const pick = list => list[Math.floor(Math.random() * list.length)];

      function makePiece(v) {
        return {
          u: Math.random(),                       // Position in der Breite (Anteil)
          v,                                      // Position in der Höhe (Anteil)
          fall: rnd(0.05, 0.09) * speed,          // Anteil der Höhe pro Sekunde
          amp: rnd(0.8, 2.5),                     // Seitwärts-Schwingung in Rasterpixeln
          freq: rnd(0.8, 1.8),
          phase: rnd(0, Math.PI * 2),
          color: pick(colors),
          shape: pick(SHAPES)
        };
      }

      return {
        init() {
          // Beim Ändern der Fenstergröße bleiben die Schnipsel erhalten
          if (pieces.length) return;
          pieces = Array.from({ length: 6 }, () => makePiece(Math.random()));
        },

        update(e, dt) {
          if (reduced) return;
          t += dt;
          const W = e.cols, H = e.rows;
          const S = W >= 200 ? 2 : 1;   // auf großen Bildschirmen etwas größer
          const limit = options.max ?? Math.max(14, Math.min(30, Math.round((W * H) / 2000)));

          timer -= dt;
          if (timer <= 0) {
            timer = rnd(every[0], every[1]);
            if (pieces.length < limit) pieces.push(makePiece(-rnd(0.01, 0.05)));
          }

          const wind = Math.sin(t * 0.25) * 0.01;   // leichter Wind (Anteil der Breite pro Sekunde)
          for (let k = pieces.length - 1; k >= 0; k--) {
            const p = pieces[k];
            p.v += p.fall * dt;
            p.u += wind * dt;
            if (p.u < 0) p.u += 1;
            else if (p.u >= 1) p.u -= 1;
            if (p.v > 1.02) { pieces.splice(k, 1); continue; }   // unten angekommen

            const x = Math.round(p.u * W + Math.sin(t * p.freq + p.phase) * p.amp);
            const y = Math.round(p.v * H);
            for (const [dx, dy] of p.shape) {
              for (let sy = 0; sy < S; sy++) {
                for (let sx = 0; sx < S; sx++) {
                  e.overlay(x + dx * S + sx, y + dy * S + sy, p.color[0], p.color[1], p.color[2], 1, true);
                }
              }
            }
          }
        }
      };
    },

    /*
     * Blumen: ab und zu wächst unten im Bild eine kleine Tulpe. Sie wächst von unten nach oben,
     * blüht kurz und verblasst wieder. Gezeichnet als Overlay; die Farben bleiben im Dark Mode
     * so, wie sie sind (keep).
     *
     * Optionen:
     *   every  – [min, max] Sekunden zwischen zwei neuen Blumen
     *   max    – höchstens so viele gleichzeitig
     *   colors – Liste von Farben [[r, g, b], …], eine davon pro Blume
     *
     * Bei "Bewegung reduzieren" im Betriebssystem wächst keine Blume.
     */
    flowers(options = {}) {
      const every = options.every ?? [1, 3];
      const max = options.max ?? 7;
      const colors = options.colors ?? [[235, 95, 140], [250, 160, 185], [200, 130, 215], [250, 215, 110], [240, 120, 90]];
      const reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // Tulpe, 5 breit und 6 hoch; die Blüte ist oben, der Stiel unten
      const FLOWER = ['#.#.#', '#####', '.###.', '..#..', '..#..', '.#.#.'];
      const ROWS = FLOWER.length;
      const GROW = 1.8, FADE = 1.0;   // Sekunden zum Wachsen und zum Verblassen

      let flowers = [], timer = 1;
      const rnd = (a, b) => a + Math.random() * (b - a);

      return {
        update(e, dt) {
          if (reduced) return;
          timer -= dt;
          if (timer <= 0) {
            timer = rnd(every[0], every[1]);
            if (flowers.length < max) {
              flowers.push({
                u: rnd(0.05, 0.95),
                base: rnd(0.8, 0.94),    // Anteil der Höhe, an dem der Stiel steht
                age: 0,
                hold: rnd(3, 5),
                color: colors[Math.floor(Math.random() * colors.length)]
              });
            }
          }

          const W = e.cols, H = e.rows;
          const S = W >= 200 ? 2 : 1;
          for (let k = flowers.length - 1; k >= 0; k--) {
            const f = flowers[k];
            f.age += dt;
            const total = GROW + f.hold + FADE;
            if (f.age >= total) { flowers.splice(k, 1); continue; }

            // Von unten nach oben sichtbar werden
            const visible = Math.max(1, Math.ceil(Math.min(1, f.age / GROW) * ROWS));
            const start = ROWS - visible;
            const alpha = Math.min(1, (total - f.age) / FADE);
            const x = Math.round(f.u * W) - 2 * S;
            const yTop = Math.round(f.base * H) - ROWS * S + start * S;
            paintRows(e, FLOWER.slice(start), x, yTop, S, f.color, alpha);
          }
        }
      };
    },

    /*
     * Gedrückt halten: Von der Maus aus wachsen Ranken nach außen, wie Wurzeln oder Efeu.
     * Sie schlängeln sich, verzweigen sich ab und zu und werden zu den Spitzen hin heller.
     * Beim Loslassen (oder wenn sie ausgewachsen sind) lösen sie sich Pixel für Pixel
     * langsam auf. Es gibt immer nur ein Gewächs – solange es noch da ist, startet
     * Drücken kein neues.
     *
     * Optionen:
     *   maxPx    – maximale Länge der Ranken in CSS-px
     *   grow     – Sekunden, bis die Ranken ausgewachsen sind
     *   dissolve – Sekunden zum Auflösen
     *   shades   – Grautöne, von der Mitte (dunkel) nach außen (hell)
     */
    holdBloom(options = {}) {
      const maxPx = options.maxPx ?? 160;
      const grow = options.grow ?? 1.8;
      const dissolve = options.dissolve ?? 1.4;
      const shades = options.shades ?? [
        [120, 120, 120], [146, 146, 146], [172, 172, 172], [198, 198, 198], [222, 222, 222]
      ];
      const rnd = (a, b) => a + Math.random() * (b - a);

      // Fester Zufallswert (0…1) je Rasterpixel, damit das Muster nicht flimmert
      const hash = (i, seed) => {
        const v = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
        return v - Math.floor(v);
      };

      let bloom = null;   // { col, row, age, holding, fade, seed, maxR, walkers, cells }

      // Alle Ranken wachsen Zelle für Zelle; ab und zu zweigt eine ab
      function growBranches(b, engine, dt) {
        const speed = b.maxR / grow;   // Zellen pro Sekunde, damit sie in "grow" Sekunden fertig sind
        for (const w of b.walkers) {
          if (w.dead) continue;
          w.acc += speed * dt;
          while (w.acc >= 1 && !w.dead) {
            w.acc -= 1;
            w.ang += rnd(-0.45, 0.45);   // schlängeln
            w.x += Math.cos(w.ang);
            w.y += Math.sin(w.ang);
            w.len += 1;
            const cx = Math.round(w.x), cy = Math.round(w.y);
            const i = engine.index(cx, cy);
            if (i >= 0 && !b.cells.has(i)) {
              const d = Math.hypot(cx - b.col, cy - b.row) / b.maxR;   // 0 = Mitte, 1 = Ende der Ranke
              const k = Math.min(shades.length - 1, Math.floor(d * shades.length));
              b.cells.set(i, [cx, cy, k]);
            }
            if (w.len >= w.maxLen) { w.dead = true; break; }
            // Ab und zu eine Abzweigung, die den Rest der Strecke zu 60 % weiterwächst
            if (b.walkers.length < 120 && Math.random() < 0.03) {
              b.walkers.push({
                x: w.x, y: w.y,
                ang: w.ang + (Math.random() < 0.5 ? -1 : 1) * rnd(0.6, 1.2),
                len: w.len, maxLen: w.len + (w.maxLen - w.len) * 0.6, acc: 0, dead: false
              });
            }
          }
        }
      }

      return {
        init() { bloom = null; },

        press(engine, i, col, row) {
          if (bloom) return;   // kein Spammen: erst wenn das alte Gewächs weg ist
          if (engine.zoneAt(col, row)) return;   // auf Buttons nur klicken, keine Ranken
          const maxR = (maxPx * engine.dpr) / engine.cellPx;
          const n = 14 + Math.floor(Math.random() * 6);
          const walkers = [];
          for (let k = 0; k < n; k++) {
            walkers.push({
              x: col, y: row, ang: (k / n) * Math.PI * 2 + rnd(-0.2, 0.2),
              len: 0, maxLen: maxR * rnd(0.6, 1), acc: rnd(0, 1), dead: false
            });
          }
          bloom = {
            col, row, age: 0, holding: true, fade: 0, seed: Math.random() * 100,
            maxR, walkers, cells: new Map()
          };
        },

        release() {
          if (bloom) bloom.holding = false;
        },

        update(engine, dt) {
          if (!bloom) return;
          const b = bloom;
          if (b.holding) {
            b.age += dt;
            growBranches(b, engine, dt);
            if (b.age >= grow) b.holding = false;   // ausgewachsen -> löst sich auf
          } else {
            b.fade += dt / dissolve;
            if (b.fade >= 1) { bloom = null; return; }
          }
          // Gezeichnet werden alle Zellen, die noch nicht aufgelöst sind
          for (const [i, [x, y, k]] of b.cells) {
            if (hash(i, b.seed + 1) < b.fade) continue;   // beim Auflösen zufällig weg
            const c = shades[k];
            engine.overlay(x, y, c[0], c[1], c[2], 1);
          }
        }
      };
    },

    /*
     * Klick-Welle: Vom angeklickten Pixel läuft ein Ring nach außen.
     * Jeder Pixel, den der Ring erreicht, blitzt kurz in `flash` auf und
     * gleitet dann in die Farbe, die `color(i, engine)` liefert.
     */
    clickRipple(options = {}) {
      const speed = options.speed ?? 160;     // Rasterpixel pro Sekunde
      const maxRadius = options.maxRadius ?? 60;
      const flash = options.flash ?? [255, 255, 255];
      const color = options.color ?? randomRGB;
      let waves = [];

      return {
        init() { waves = []; },
        click(engine, i, col, row) {
          waves.push({ col, row, radius: -0.5, prev: -1 });
        },
        update(engine, dt) {
          if (!waves.length) return;
          for (const w of waves) {
            w.prev = w.radius;
            w.radius += speed * dt;
            // Nur den Ring zwischen altem und neuem Radius einfärben
            engine.forEachInRadius(w.col, w.row, Math.min(w.radius, maxRadius), (j, c, r, d) => {
              if (d <= w.prev) return;
              engine.setColorNow(j, flash[0], flash[1], flash[2], 1);
              const [cr, cg, cb] = color(j, engine);
              engine.setColor(j, cr, cg, cb, 1);
            });
          }
          waves = waves.filter(w => w.radius < maxRadius);
        }
      };
    },

    /*
     * Zeigt eine Form aus js/shapes.js (z. B. Shapes.name) auf dem Raster an
     * und baut sie beim Laden animiert auf.
     *
     * Optionen:
     *   color      – Farbe der Form [r, g, b] (wenn keine palette angegeben ist)
     *   palette    – mehrere Farben [[r, g, b], …], z. B. Grautöne von dunkel nach hell
     *   shading    – wie die palette verteilt wird: 'bands' (waagerechte Streifen von oben
     *                nach unten), 'diagonal' (schräge Streifen), 'noise' (zufällig je Pixel)
     *   flash      – Farbe, in der ein Pixel beim Erscheinen kurz aufblitzt
     *   background – Funktion (i, engine) => [r, g, b]: Hintergrund, auf den replay() zurücksetzt
     *   scale      – Rasterpixel pro Formpixel (Zahl oder Funktion (engine, shape) => Zahl);
     *                Standard: so groß, dass die Form ca. `fit` der Breite füllt
     *   fit        – Anteil der Rasterbreite für die automatische Skalierung (0…1)
     *   anchor     – Punkt auf dem Raster, an dem die Form hängt, als Anteil [x, y] (0.5 = Mitte)
     *   align      – welcher Punkt der Form am Anker liegt, als Anteil [x, y] (0.5 = Mitte)
     *   offset     – zusätzliche Verschiebung in Rasterpixeln [x, y]
     *   intro      – Aufbau-Animation, siehe Behaviors.INTROS
     *   duration   – Dauer des Aufbaus in Sekunden (Standard: passend zum Intro)
     *   speed      – Faktor auf die Standarddauer (0.5 = doppelt so schnell)
     *   delay      – Wartezeit vor dem Aufbau in Sekunden
     *   scatter    – true: Pixel unter der Maus werden durcheinandergewirbelt und kommen
     *                zurück, wenn die Maus weiterzieht (immer auf dem Raster)
     *   scatterPx  – Radius um die Maus in CSS-px, in dem Pixel verstreut werden
     *   scatterAmount – wie weit die Pixel maximal wegspringen, als Anteil des Radius
     *   onClick    – Funktion: macht die Form klickbar (Hand als Mauszeiger, keine Blase darauf)
     *
     * Das zurückgegebene Objekt hat zusätzlich replay(intro?), um den Aufbau
     * (optional mit einem anderen Intro) neu abzuspielen.
     */
    shape(source, options = {}) {
      // source: eine Form oder eine Funktion (engine) => Form, z. B. um am Handy eine kleinere zu nehmen
      const pick = typeof source === 'function' ? source : () => source;
      const color = options.color ?? [20, 20, 20];
      const palette = options.palette ?? [color];
      // keepColors: die Palettenfarben bleiben im Dark Mode so, wie sie sind (nicht umgedreht)
      const keep = options.keepColors === true;
      const shading = options.shading ?? 'bands';
      const background = options.background ?? randomRGB;
      const fit = options.fit ?? 0.6;
      const anchor = options.anchor ?? [0.5, 0.5];
      const align = options.align ?? [0.5, 0.5];
      const offset = options.offset ?? [0, 0];
      const speed = options.speed ?? 1;
      const delay = options.delay ?? 0;
      const scatter = options.scatter ?? false;
      const scatterPx = options.scatterPx ?? 70;
      const scatterAmount = options.scatterAmount ?? 0.8;
      const scatterSpeed = options.scatterSpeed ?? 12;

      let data = null, W = 0, H = 0;
      const MATRIX_FALL = 0.5;    // Anteil der Dauer, den ein Matrix-Tropfen für die Form braucht
      const MATRIX_TRAIL = 14;    // Länge der Matrix-Spur in Formpixeln

      let intro = options.intro ?? 'write';
      let duration = options.duration ?? INTRO_DURATION[intro] * speed;

      let engine, s, cells, active, arrive, fromX, fromY;
      let offX, offY, jitX, jitY;  // aktuelle Verschiebung und fester Zufallsanteil je Formpixel
      let moved;                   // 1 = Formpixel ist gerade verschoben
      let ptCol;                   // Farbe je Formpixel (aus der palette)
      let travel = 0;              // Anteil der Dauer, den ein Pixel unterwegs ist (Regen, Zusammenfliegen)
      let startTime = null, played = false;
      let hiddenNow = false;       // ausgeblendet, siehe hide() / show()
      let byArrive = null;         // Formpixel nach Ankunft sortiert (Fräskopf)
      let colStart = null;         // Matrix: Startzeitpunkt je Spalte
      let particles = [];          // Späne der Fräse
      const glitch = { tick: -1 }; // aktueller Glitch-Zustand (wechselt ca. 18x pro Sekunde)
      const zone = { col: 0, row: 0, w: 0, h: 0 };   // Klickbereich, falls onClick gesetzt ist

      // Schlangen: mehrere Köpfe starten in der Mitte und fressen sich durch die Form.
      // Bleibt ein Kopf stecken, springt er zum freien Pixel, das der Mitte am nächsten ist –
      // so wächst die Form insgesamt langsam von innen nach außen.
      function snakeOrder() {
        const n = data.count;
        const lookup = new Int32Array(W * H).fill(-1);
        for (let k = 0; k < n; k++) lookup[data.y[k] * W + data.x[k]] = k;
        const cx = (W - 1) / 2, cy = (H - 1) / 2;
        const byDist = Array.from({ length: n }, (_, k) => k)
          .sort((a, b) => Math.hypot(data.x[a] - cx, data.y[a] - cy) - Math.hypot(data.x[b] - cx, data.y[b] - cy));
        const visited = new Uint8Array(n);
        let ptr = 0;
        const nearestFree = () => {
          while (ptr < n && visited[byDist[ptr]]) ptr++;
          return ptr < n ? byDist[ptr] : -1;
        };

        let step = 0, remaining = n;
        const heads = [];
        const count = Math.max(3, Math.round(n / 300));
        for (let h = 0; h < count && remaining > 0; h++) {
          const k = nearestFree();
          visited[k] = 1; arrive[k] = 0; remaining--;
          const a = Math.random() * Math.PI * 2;
          heads.push({ k, dx: Math.cos(a), dy: Math.sin(a) });
        }
        while (remaining > 0) {
          step++;
          for (const h of heads) {
            if (remaining === 0) break;
            const x = data.x[h.k], y = data.y[h.k];
            let best = -1, bestScore = -Infinity, bdx = 0, bdy = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                const nk = lookup[ny * W + nx];
                if (nk < 0 || visited[nk]) continue;
                // Möglichst geradeaus weiter, mit etwas Zufall -> Schlängeln
                const score = (dx * h.dx + dy * h.dy) / Math.hypot(dx, dy) + Math.random() * 0.9;
                if (score > bestScore) { bestScore = score; best = nk; bdx = dx; bdy = dy; }
              }
            }
            if (best < 0) {
              best = nearestFree();
              if (best < 0) continue;
            } else {
              h.dx = bdx; h.dy = bdy;
            }
            visited[best] = 1;
            arrive[best] = step;
            remaining--;
            h.k = best;
          }
        }
        for (let k = 0; k < n; k++) arrive[k] /= Math.max(1, step);
      }

      // Für jeden Formpixel festlegen, wann (0…1) er ankommt und woher er kommt
      function prepareIntro() {
        const n = data.count;
        const cx = (W - 1) / 2, cy = (H - 1) / 2, R = Math.hypot(cx, cy);
        travel = intro === 'rain' ? 0.35 : intro === 'assemble' ? 0.45 : 0;
        particles = [];
        glitch.tick = -1;

        if (intro === 'matrix') colStart = Float32Array.from({ length: W }, () => Math.random() * 0.45);
        if (intro === 'snakes') { snakeOrder(); return; }

        for (let k = 0; k < n; k++) {
          const x = data.x[k], y = data.y[k];
          switch (intro) {
            case 'write':
            case 'mill': arrive[k] = data.order[k] / 1000; break;
            case 'sweep': arrive[k] = x / W; break;
            case 'center': arrive[k] = Math.hypot(x - cx, y - cy) / R; break;
            case 'random': arrive[k] = Math.random(); break;
            case 'rain':
              // Untere Reihen landen zuerst -> die Form "füllt sich" von unten wie Sand
              arrive[k] = travel + (1 - travel) * (0.75 * (1 - y / H) + 0.25 * Math.random());
              fromY[k] = -2 - Math.random() * 14;   // Start über dem oberen Rand
              break;
            case 'assemble':
              arrive[k] = travel + (1 - travel) * Math.random();
              fromX[k] = Math.random() * engine.cols;
              fromY[k] = Math.random() * engine.rows;
              break;
            case 'print': {
              // Schicht für Schicht von unten nach oben, der Druckkopf fährt abwechselnd hin und her
              const layer = H - 1 - y;
              const along = layer % 2 ? 1 - x / Math.max(1, W - 1) : x / Math.max(1, W - 1);
              arrive[k] = (layer + along) / H;
              break;
            }
            case 'matrix':
              // Pixel rastet ein, sobald der Tropfen seiner Spalte vorbeikommt
              arrive[k] = colStart[x] + MATRIX_FALL * (y + MATRIX_TRAIL) / (H + MATRIX_TRAIL);
              break;
            case 'glitch': arrive[k] = Math.random() * 0.5; break;
            default: arrive[k] = 0;
          }
        }
        if (intro === 'mill') byArrive = Array.from({ length: n }, (_, k) => k).sort((a, b) => arrive[a] - arrive[b]);
      }

      // Einen Formpixel (s x s Rasterpixel) an eine beliebige Stelle ins Overlay malen
      function stamp(x, y, c, a) {
        const x0 = Math.round(x), y0 = Math.round(y);
        for (let sy = 0; sy < s; sy++) {
          for (let sx = 0; sx < s; sx++) engine.overlay(x0 + sx, y0 + sy, c[0], c[1], c[2], a, keep);
        }
      }

      // Formpixel, der gerade unterwegs ist (u = 0 Start … 1 Ankunft)
      function drawMoving(k, u) {
        const tx = api.col + data.x[k] * s, ty = api.row + data.y[k] * s;
        if (intro === 'rain') {
          const y = fromY[k] + (ty - fromY[k]) * u * u;   // beschleunigt wie mit Schwerkraft
          stamp(tx, y, ptCol[k], 1);
          stamp(tx, y - s, ptCol[k], 0.35 * u);
          stamp(tx, y - 2 * s, ptCol[k], 0.15 * u);
        } else if (intro === 'assemble') {
          const e = 1 - (1 - u) ** 3;                       // schnell los, sanft ankommen
          stamp(fromX[k] + (tx - fromX[k]) * e, fromY[k] + (ty - fromY[k]) * e, ptCol[k], 0.3 + 0.7 * u);
        }
      }

      // Glitch-Zustand: verschobene Streifen + Störblöcke, wird mit der Zeit ruhiger
      function glitchState(p, time) {
        const tick = Math.floor(time * 18);
        if (tick === glitch.tick) return glitch;
        glitch.tick = tick;
        const I = Math.max(0, 1 - p) ** 1.5;
        glitch.I = I;
        glitch.bandH = Math.max(1, Math.round(H / 10));
        const nb = Math.ceil(H / glitch.bandH);
        glitch.bands = new Int16Array(nb);
        const jolt = Math.random() < I * 0.25 ? Math.round((Math.random() * 2 - 1) * 6 * I) : 0;
        for (let b = 0; b < nb; b++) {
          glitch.bands[b] = jolt + (Math.random() < I * 0.6 ? Math.round((Math.random() * 2 - 1) * W * 0.12 * I) : 0);
        }
        glitch.noise = [];
        const blocks = Math.round(I * 8);
        for (let b = 0; b < blocks; b++) {
          glitch.noise.push({
            x: Math.floor(Math.random() * W), y: Math.floor(Math.random() * H),
            w: 4 + Math.floor(Math.random() * 30), h: 1 + Math.floor(Math.random() * 3),
            c: palette[Math.floor(Math.random() * palette.length)]
          });
        }
        return glitch;
      }

      // Rasterlinie von (x0, y0) nach (x1, y1)
      function line(x0, y0, x1, y1, fn) {
        const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx + dy, t = 0;
        const len = Math.max(dx, -dy) || 1;
        for (;;) {
          fn(x0, y0, t++ / len);
          if (x0 === x1 && y0 === y1) break;
          const e2 = 2 * err;
          if (e2 >= dy) { err += dy; x0 += sx; }
          if (e2 <= dx) { err += dx; y0 += sy; }
        }
      }

      // Zusätzliche Effekte der Intros, die nicht an einem Formpixel hängen
      function drawEffects(p, dt, time) {
        const running = p >= 0 && p < 1;

        if (intro === 'print' && running) {
          // Druckkopf: fährt die aktuelle Schicht entlang, darüber die Führungsschiene
          const layer = Math.min(H - 1, Math.floor(p * H));
          const frac = p * H - layer;
          const along = layer % 2 ? 1 - frac : frac;
          const hx = Math.round(api.col + along * (W - 1) * s);
          const hy = api.row + (H - 1 - layer) * s;
          const rail = hy - 4 * s;
          for (let x = api.col - 2 * s; x < api.col + (W + 2) * s; x++) engine.overlay(x, rail, 150, 150, 150, 0.6);
          for (let y = rail + 1; y < hy - s; y++) {
            for (let x = hx - s; x < hx + 2 * s; x++) engine.overlay(x, y, 70, 70, 70, 1);
          }
          stamp(hx, hy - s, [40, 40, 40], 1);   // Düse
        }

        if (intro === 'matrix' && running) {
          const flick = Math.floor(time * 12);
          const reach = 1 + MATRIX_TRAIL / (H + MATRIX_TRAIL);
          for (let x = 0; x < W; x++) {
            const u = (p - colStart[x]) / MATRIX_FALL;
            if (u < 0 || u > reach) continue;
            const head = Math.floor(-MATRIX_TRAIL + u * (H + MATRIX_TRAIL));
            for (let t = 0; t <= MATRIX_TRAIL; t++) {
              const y = head - t;
              if (y >= H) continue;
              // Flackern wie wechselnde Zeichen
              if (t > 0 && hash2(x * 131 + y, flick) < 0.3) continue;
              const g = t === 0 ? 60 : 120 + (110 * t) / MATRIX_TRAIL;
              stamp(api.col + x * s, api.row + y * s, [g, g, g], t === 0 ? 1 : 0.9 * (1 - t / MATRIX_TRAIL));
            }
          }
        }

        if (intro === 'glitch' && running) {
          const g = glitchState(p, time);
          for (const b of g.noise) {
            for (let y = 0; y < b.h; y++) {
              for (let x = 0; x < b.w; x++) stamp(api.col + (b.x + x) * s, api.row + (b.y + y) * s, b.c, 0.85);
            }
          }
        }

        if (intro === 'mill' && running && byArrive.length) {
          // Fräskopf = der zuletzt gefräste Pixel
          let lo = 0, hi = byArrive.length - 1;
          while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (arrive[byArrive[mid]] <= p) lo = mid; else hi = mid - 1;
          }
          const k = byArrive[lo];
          const hx = Math.round(api.col + data.x[k] * s + s / 2);
          const hy = Math.round(api.row + data.y[k] * s + s / 2);

          // Strahl aus der oberen rechten Ecke, zum Kopf hin dunkler
          line(engine.cols - 1, 0, hx, hy, (x, y, t) => {
            engine.overlay(x, y, 120, 120, 120, 0.25 + 0.5 * t);
            engine.overlay(x, y + 1, 170, 170, 170, 0.15 * t);
          });
          engine.forEachInRadius(hx, hy, 1.5 + s, (i, c, r, d) => engine.overlay(c, r, 60, 60, 60, 1 - d / (2.5 + s)));

          // Späne fliegen weg
          const spawn = Math.max(1, Math.round(160 * dt));
          for (let n = 0; n < spawn; n++) {
            particles.push({
              x: hx, y: hy,
              vx: (Math.random() - 0.5) * 60, vy: -8 - Math.random() * 40,
              age: 0, life: 0.3 + Math.random() * 0.5,
              c: palette[Math.floor(Math.random() * palette.length)]
            });
          }
        }

        for (const pt of particles) {
          pt.age += dt;
          pt.vy += 150 * dt;
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          engine.overlay(Math.round(pt.x), Math.round(pt.y), pt.c[0], pt.c[1], pt.c[2], 1 - pt.age / pt.life, keep);
        }
        particles = particles.filter(pt => pt.age < pt.life);
      }

      const api = {
        scale: 1, col: 0, row: 0,

        init(e) {
          engine = e;
          data = pick(engine);
          W = data.width;
          H = data.height;
          s = typeof options.scale === 'function'
            ? options.scale(engine, data)
            : options.scale ?? Math.max(1, Math.floor((engine.cols * fit) / W));
          api.scale = s;
          api.col = Math.round(engine.cols * anchor[0] - W * s * align[0] + offset[0]);
          api.row = Math.round(engine.rows * anchor[1] - H * s * align[1] + offset[1]);
          if (options.onClick) {
            zone.col = api.col; zone.row = api.row; zone.w = W * s; zone.h = H * s;
            if (!engine.zones.includes(zone)) engine.zones.push(zone);
          }

          // Jeder Formpixel k belegt s x s Rasterpixel: cells[k*s*s … (k+1)*s*s - 1]
          const n = data.count;
          cells = new Int32Array(n * s * s);
          active = new Uint8Array(n);
          arrive = new Float32Array(n);
          fromX = new Float32Array(n);
          fromY = new Float32Array(n);
          offX = new Float32Array(n);
          offY = new Float32Array(n);
          moved = new Uint8Array(n);
          ptCol = new Array(n);
          for (let k = 0; k < n; k++) {
            const x = data.x[k] / Math.max(1, W - 1), y = data.y[k] / Math.max(1, H - 1);
            const t = shading === 'noise' ? Math.random()
              : shading === 'diagonal' ? (x + y) / 2
              : y;
            ptCol[k] = palette[Math.min(palette.length - 1, Math.floor(t * palette.length))];
          }
          jitX = Float32Array.from({ length: n }, () => Math.random() * 2 - 1);
          jitY = Float32Array.from({ length: n }, () => Math.random() * 2 - 1);
          for (let k = 0, c = 0; k < n; k++) {
            const x0 = api.col + data.x[k] * s, y0 = api.row + data.y[k] * s;
            for (let sy = 0; sy < s; sy++) {
              for (let sx = 0; sx < s; sx++, c++) cells[c] = engine.index(x0 + sx, y0 + sy);
            }
          }
          prepareIntro();

          // Nach einem Resize nicht nochmal aufbauen, sondern direkt fertig zeigen
          if (played) {
            active.fill(1);
            for (let c = 0; c < cells.length; c++) {
              const pc = ptCol[(c / (s * s)) | 0];
              engine.setColorNow(cells[c], pc[0], pc[1], pc[2], 1, keep);
            }
          }
        },

        update(e, dt, time) {
          if (hiddenNow) return;
          if (startTime === null) startTime = time;
          const elapsed = time - startTime - delay;
          const p = duration > 0 ? elapsed / duration : (elapsed >= 0 ? Infinity : -1);
          const s2 = s * s;
          const flash = options.flash ?? [255, 255, 255];
          const g = intro === 'glitch' && p >= 0 && p < 1 ? glitchState(p, time) : null;

          // Maus in Rasterkoordinaten für den Verstreu-Effekt
          const m = engine.mouse;
          const R = (scatterPx * engine.dpr) / engine.cellPx;
          const ease = 1 - Math.exp(-scatterSpeed * dt);

          let done = true;
          for (let k = 0; k < data.count; k++) {
            if (!active[k]) {
              if (p < arrive[k]) {
                done = false;
                if (travel > 0 && p > arrive[k] - travel) drawMoving(k, 1 - (arrive[k] - p) / travel);
                continue;
              }
              active[k] = 1;
              for (let c = k * s2; c < (k + 1) * s2; c++) engine.setColorNow(cells[c], flash[0], flash[1], flash[2], 1, keep);
            }

            const hx = api.col + data.x[k] * s, hy = api.row + data.y[k] * s;
            let ox = 0, oy = 0;
            if (scatter) {
              // Ziel: nahe der Maus weggeschubst + zufällig verwirbelt, sonst zurück an den Platz
              let tx = 0, ty = 0;
              if (m.inside) {
                const dx = hx + s / 2 - m.col, dy = hy + s / 2 - m.row;
                const d = Math.hypot(dx, dy);
                if (d < R) {
                  const push = (1 - d / R) * R * scatterAmount;
                  const nx = d > 0 ? dx / d : 0, ny = d > 0 ? dy / d : 0;
                  tx = (nx * 0.6 + jitX[k]) * push;
                  ty = (ny * 0.6 + jitY[k]) * push;
                }
              }
              offX[k] += (tx - offX[k]) * ease;
              offY[k] += (ty - offY[k]) * ease;
              // Auf ganze Formpixel runden, damit alles im Raster bleibt
              ox = Math.round(offX[k] / s) * s;
              oy = Math.round(offY[k] / s) * s;
            }

            // Glitch: ganze Streifen springen seitlich, einzelne Pixel fallen kurz aus
            let hidden = false;
            if (g) {
              ox += g.bands[(data.y[k] / g.bandH) | 0] * s;
              hidden = hash2(k, g.tick) < g.I * 0.25;
            }

            if (hidden || ox || oy) {
              // Pixel ist verschoben: Heimatplatz zeigt den Hintergrund, der Pixel selbst
              // wird an der neuen Rasterposition gezeichnet
              for (let c = k * s2; c < (k + 1) * s2; c++) {
                if (cells[c] < 0) continue;
                const [r, gg, b] = background(cells[c], engine);
                engine.setColorNow(cells[c], r, gg, b, 1);
              }
              if (!hidden) stamp(hx + ox, hy + oy, ptCol[k], 1);
              moved[k] = 1;
              continue;
            }
            const pc = ptCol[k];
            if (moved[k]) {
              // Gerade zurückgekommen: sofort wieder an seinem Platz zeigen
              moved[k] = 0;
              for (let c = k * s2; c < (k + 1) * s2; c++) engine.setColorNow(cells[c], pc[0], pc[1], pc[2], 1, keep);
            }
            // Jeden Frame neu setzen, damit Hover die Form nicht überschreibt
            for (let c = k * s2; c < (k + 1) * s2; c++) engine.setColor(cells[c], pc[0], pc[1], pc[2], 1, keep);
          }

          drawEffects(p, dt, time);
          if (done && !particles.length) played = true;
        },

        click(e, i, col, row) {
          if (options.onClick && engine.zoneAt(col, row) === zone) options.onClick();
        },

        // Form ausblenden: die Pixel zeigen wieder den Hintergrund, bis show() sie zurückholt
        hide() {
          if (!engine || hiddenNow) return;
          hiddenNow = true;
          for (let c = 0; c < cells.length; c++) {
            if (cells[c] < 0) continue;
            const [r, g, b] = background(cells[c], engine);
            engine.setColorNow(cells[c], r, g, b, 1);
          }
        },

        // Form wieder einblenden, mit dem Aufbau-Effekt
        show() {
          if (!hiddenNow) return;
          hiddenNow = false;
          api.replay();
        },

        replay(newIntro) {
          if (!engine) return;
          if (newIntro) {
            intro = newIntro;
            duration = INTRO_DURATION[intro] * speed;
          }
          startTime = null;
          played = false;
          active.fill(0);
          prepareIntro();
          for (let c = 0; c < cells.length; c++) {
            if (cells[c] < 0) continue;
            const [r, g, b] = background(cells[c], engine);
            engine.setColorNow(cells[c], r, g, b, 1);
          }
        }
      };
      return api;
    }
  };

  Behaviors.INTROS = Object.keys(INTRO_DURATION);
  Behaviors.Icons = Icons;
  global.Behaviors = Behaviors;
  global.randomRGB = randomRGB;
})(window);
