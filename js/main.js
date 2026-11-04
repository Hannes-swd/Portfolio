(function () {
  'use strict';

  const engine = new PixelEngine(document.getElementById('pixels'), {
    // Größe eines Pixels in CSS-px: 2 bis 4 – auf schmalen Bildschirmen kleiner,
    // aber nie 1, damit das Handy nicht zu viele Pixel rechnen muss
    cellSize: w => Math.max(2, Math.min(4, Math.floor((w * 0.8) / Shapes.name.width))),
    easing: 14
  });

  // Dark Mode: dreht alle Pixel um. Startzustand kommt aus index.html (gespeichert oder System)
  const root = document.documentElement;
  engine.setInverted(root.dataset.theme === 'dark', false);

  // Hell/Dunkel umschalten – genutzt vom Pixel-Button und von der Menüleiste (ui.js)
  window.setTheme = dark => {
    engine.setInverted(dark);
    const theme = dark ? 'dark' : 'light';
    root.dataset.theme = theme;
    try { localStorage.setItem('theme', theme); } catch (e) {}
  };

  // Sofort starten – alles Weitere wird nur hinzugefügt. Geht beim Einrichten eines
  // Effekts etwas schief, läuft der Rest trotzdem und das Pixelfeld bleibt nicht leer.
  engine.start();

  function add(label, make) {
    try {
      const behavior = make();
      engine.use(behavior);
      return behavior;
    } catch (err) {
      console.error(`Konnte "${label}" nicht einrichten:`, err);
      return null;
    }
  }

  // Weiße Fläche mit hellgrauen Pixel-Blöcken am Rand
  // blockPx: 0 -> jeder Hintergrund-Pixel ist so fein wie das Raster (wie Name und Logo)
  const field = add('Hintergrund', () => Behaviors.pixelField({
    blockPx: 0,
    gapRatio: 0,
    edge: 0.3,
    structure: 'roots', // Wurzeln wachsen vom Rand nach innen statt zufälliger Pixel
    density: 0.8,
    hoverPx: 40,        // Radius um die Maus, in dem Pixel umgefärbt werden (CSS-px)
    hoverCount: 4,      // so viele zufällige Pixel pro Mausbewegung (verschwinden, wenn die Maus weiterzieht)
    hoverGray: 0.75     // Anteil, der grau wird (der Rest wird wieder weiß)
  }));
  const baseColor = i => (field ? field.baseColor(i) : [255, 255, 255]);

  // Ab und zu fliegt etwas durchs Bild: Vögel, Sternschnuppe, Glider, UFO
  const ambient = add('Himmel', () => Behaviors.ambient({
    every: [3, 8],      // Sekunden zwischen zwei Auftritten (min, max)
    kinds: ['birds', 'comet', 'glider', 'ufo']
  }));

  // Gedrückt halten: Pixelwolke wächst langsam und löst sich danach auf
  add('Ranken', () => Behaviors.holdBloom({
    maxPx: 160,     // maximale Länge der Ranken (in CSS-px)
    grow: 1.8,      // Sekunden, bis sie ausgewachsen sind
    dissolve: 1.4   // Sekunden zum Auflösen
  }));

  // Lade-Animation: bei jedem Laden eine zufällige aus dieser Liste.
  // Für eine feste einfach z. B. const intro = 'rain'; schreiben.
  const intros = ['write', 'rain', 'assemble', 'print', 'snakes', 'matrix', 'glitch', 'mill'];
  const intro = intros[Math.floor(Math.random() * intros.length)];

  // Grautöne für Name und Logo, von oben (dunkel) nach unten (hell)
  const grays = [[34, 34, 34], [62, 62, 62], [92, 92, 92], [124, 124, 124], [158, 158, 158]];

  // Formen kommen nach den anderen Behaviors, damit sie immer obenauf liegen
  // Passt der große Name nicht aufs Raster (Handy), wird die kleine Version genommen
  const nameShape = add('Name', () => Behaviors.shape(e => (e.cols * 0.85 >= Shapes.name.width ? Shapes.name : Shapes.nameSmall), {
    fit: 0.6,
    intro,
    delay: 0.3,
    flash: [150, 150, 150],
    scatter: true,
    palette: grays,
    shading: 'bands',    // 'bands', 'diagonal' oder 'noise'
    background: baseColor
  }));

  const logoShape = add('Logo', () => Behaviors.shape(Shapes.logoSmall, {
    scale: 1,
    anchor: [1, 0],      // obere rechte Ecke
    align: [1, 0],
    offset: [-12, 12],
    intro,
    speed: 0.6,          // kleines Logo ist schneller fertig
    onClick: () => location.reload(),   // Klick aufs Logo lädt die Seite neu
    flash: [150, 150, 150],
    scatter: true,
    palette: grays,
    shading: 'bands',    // 'bands', 'diagonal' oder 'noise'
    background: baseColor
  }));

  // Sprachwahl ganz links oben: zeigt die andere Sprache in Pixelbuchstaben (D, E, N)
  const LETTERS = {
    D: ['###.', '#..#', '#..#', '#..#', '###.'],
    E: ['####', '#...', '###.', '#...', '####'],
    N: ['#..#', '##.#', '#.##', '#..#', '#..#']
  };
  const pixelWord = w => [0, 1, 2, 3, 4].map(r => w.split('').map(ch => LETTERS[ch][r]).join('.'));
  const langButton = add('Sprach-Button', () => Behaviors.pixelButton({
    icon: pixelWord(window.I18N && I18N.lang === 'en' ? 'DE' : 'EN'),
    padding: 3,                         // gleiche Höhe wie der Dark-Mode-Button daneben
    sizePx: 44,
    anchor: [0, 0],
    align: [0, 0],
    offset: [12, 12],                   // gleicher Abstand zum Rand wie das Logo oben rechts
    onClick: () => window.I18N && I18N.toggleLanguage()
  }));

  // Umschalter oben links – ein Button aus Pixeln, direkt im Raster
  const themeButton = add('Dark-Mode-Button', () => Behaviors.pixelButton({
    icon: Behaviors.Icons.contrast(9),  // Symbol 9x9 Pixel, gleich groß wie das GitHub-Logo
    padding: 1,                         // Abstand Rahmen -> Symbol
    sizePx: 44,                         // mindestens so groß, dass man ihn am Handy gut trifft
    rightOf: langButton,
    gap: 4,              // direkt rechts neben dem Sprach-Button
    onClick: () => window.setTheme(!engine.inverted)
  }));

  // GitHub-Link direkt daneben
  const GITHUB_URL = 'https://github.com/Hannes-swd';
  add('GitHub-Button', () => Behaviors.pixelButton({
    icon: Behaviors.Icons.github,
    padding: 1,
    sizePx: 44,
    rightOf: themeButton,  // direkt rechts neben dem Dark-Mode-Schalter
    gap: 4,
    onClick: () => window.open(GITHUB_URL, '_blank', 'noopener')
  }));

  // Menübutton aus Pixeln oben in der Mitte – nur auf schmalen Bildschirmen, wo die
  // Menüpunkte nicht hinpassen. Nach dem Runterscrollen übernimmt der Button in der Leiste.
  add('Menü-Button', () => Behaviors.pixelButton({
    icon: Behaviors.Icons.menu,
    padding: 1,
    sizePx: 44,
    anchor: [0.5, 0],
    align: [0.5, 0],
    offset: [0, 12],
    visible: e => e.width <= 760,
    onClick: () => window.openMenu && window.openMenu()
  }));

  // Bildschirmschoner: nach 5 Minuten ohne Eingabe nach oben scrollen und Szenen zeigen.
  // Kommt als Letztes, damit die Szenen über allem liegen. Beim Aufwachen baut sich
  // der Name mit einer zufälligen Animation neu auf.
  const screensaver = add('Bildschirmschoner', () => Behaviors.screensaver({
    idle: 300,           // Sekunden ohne Eingabe bis zum Start
    sceneTime: 25,       // Sekunden pro Szene
    scenes: ['matrix', 'life', 'bounce', 'stars'],
    logo: Shapes.logoSmall,
    onWake: () => {
      const pick = intros[Math.floor(Math.random() * intros.length)];
      if (nameShape) nameShape.replay(pick);
      if (logoShape) logoShape.replay(pick);
    }
  }));

  // Zum Ausprobieren: Tasten 1–9 und 0 spielen den Aufbau mit einer anderen Animation neu ab
  // (1 write, 2 rain, 3 assemble, 4 print, 5 snakes, 6 matrix, 7 glitch, 8 mill, 9 sweep, 0 center)
  window.addEventListener('keydown', e => {
    if (!/^[0-9]$/.test(e.key)) return;
    const pick = Behaviors.INTROS[(Number(e.key) + 9) % 10];
    if (!pick || pick === 'none') return;
    if (nameShape) nameShape.replay(pick);
    if (logoShape) logoShape.replay(pick);
  });

  // In der Browser-Konsole erreichbar, z. B. nameShape.replay('rain') oder engine.cellSize = 8; engine.resize();
  window.engine = engine;
  window.nameShape = nameShape;
  window.logoShape = logoShape;
  window.ambient = ambient;   // z. B. ambient.spawn('ufo')
  window.screensaver = screensaver;   // z. B. screensaver.start()
})();
