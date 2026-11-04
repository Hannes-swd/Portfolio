/*
 * Inhalte der Seite – hier trägst du alles ein, der Rest baut sich automatisch.
 *
 * Bilder und Videos kommen in den Ordner assets/ (z. B. assets/projekte/spiel.mp4)
 * und werden hier mit ihrem Pfad angegeben. Fehlt ein Bild, zeigt die Seite
 * einen Pixel-Platzhalter.
 *
 * Alles, was mit "TODO" beginnt, ist ein Platzhalter zum Ersetzen.
 */
window.CONTENT = {
  // Menüpunkte = Bereiche der Seite (id muss zum Bereich passen)
  sections: [
    { id: 'projekte', label: 'Projekte' },
    { id: 'ueber-mich', label: 'Über mich' },
    { id: 'skills', label: 'Skills' },
    { id: 'kontakt', label: 'Kontakt' }
  ],

  // GitHub-Benutzername: daraus holt die Seite die zuletzt geänderten öffentlichen Repos
  githubUser: 'Hannes-swd',

  /*
   * Projekte – jedes wird zu einer Karte, ein Klick öffnet die Detailansicht.
   *   title    Name des Projekts
   *   year     Jahr
   *   tags     2–3 Stichworte (Technik)
   *   image    Vorschaubild für die Karte (optional; ohne Bild zeigt die Seite ein Pixel-Motiv)
   *   portrait true, wenn das Bild hochkant ist (z. B. Handy-Screenshot): dann steht es links
   *            neben dem Text statt in einem Querformat-Kasten (wirkt am besten im breiten ersten Projekt)
   *   video    kurzes Video, läuft stumm in Schleife (optional, ersetzt das Bild)
   *   summary  höchstens 1–2 Sätze, steht auf der Karte und in der Detailansicht
   * Das erste Projekt in der Liste wird über die ganze Breite gezeigt.
   *   gallery  weitere Bilder für das Projekt (optional). Hat ein Projekt eine Galerie, wechselt
   *            das Bild in der Karte und in der Detailansicht automatisch durch alle Bilder
   *   links    { github: '…', live: '…' } (beides optional)
   */
  projects: [
    {
      title: 'hanneslauncher',
      year: 2026,
      tags: ['Flutter', 'Android', 'Dart'],
      image: 'assets/projekte/hanneslauncher.png',
      portrait: true,
      video: '',
      summary: 'Minimalistischer Android-Launcher mit Flutter: eine Uhr, ein paar Apps und ein Buchstabenband am Rand. Alles andere liegt eine Geste entfernt.',
      gallery: [],
      links: { github: 'https://github.com/Hannes-swd/Hanneslauncher', live: 'https://hanneslauncher.vercel.app' }
    },
    {
      title: 'XERO Electric',
      year: 2026,
      tags: ['Blender', 'Web', '3D-Rendering'],
      image: 'assets/projekte/xero-electric.jpg',
      video: '',
      summary: 'Webseite für einen Elektro- und Automationsbetrieb aus Südtirol. Alle 3D-Modelle und Renderings habe ich in Blender gemacht.',
      gallery: [],
      links: { github: '', live: 'https://new.xeroelectric.it/' }
    },
    {
      title: 'Presi 3D',
      year: 2026,
      tags: ['C++', 'Qt6', 'OpenGL'],
      image: 'assets/projekte/presi3d-3d.png',
      video: '',
      summary: 'Ein Präsentationstool wie PowerPoint, aber die Folien lassen sich frei im 3D-Raum platzieren, skalieren und per Kamera abfliegen. Exportiert wird als Impress.js-Webseite.',
      gallery: ['assets/projekte/presi3d-shapes.png', 'assets/projekte/presi3d-charts.png'],
      links: { github: 'https://github.com/Hannes-swd/Presi3D.exe', live: '' }
    }
  ],

  // Über mich – ein Satz und ein paar Zahlen
  about: {
    intro: 'Ich arbeite meistens mit KI, manchmal auch ohne. Und wenn ohne, dann mit C++.',
    stats: [
      // codingSince: [Jahr, Monat], mit dem du angefangen hast. Die Jahre rechnet die Seite selbst aus
      { codingSince: [2023, 9], label: 'Jahre Coden' },
      { value: 'C++', label: 'Gerade am Lernen mit Qt/QML' },
      { value: 'Raylib', label: 'Spiele gemacht' }
    ]
  },

  /*
   * Skills – nur Namen, ohne Bewertung. Optional ein Icon-Bild (z. B. assets/icons/js.png),
   * sonst steht ein kleiner Pixel-Punkt davor.
   */
  skills: [
    { name: 'C++', icon: '' },
    { name: 'Git/GitHub', icon: '' },
    { name: 'Ubuntu', icon: '' },
    { name: 'Claude AI', icon: '' }
  ],

  // Kontakt – große Buttons. icon: 'mail', 'github' oder 'link'
  contact: [
    { label: 'GitHub', href: 'https://github.com/Hannes-swd', icon: 'github' }
  ],

  footer: '© 2026 Hannes'
};
