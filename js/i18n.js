/*
 * Sprache: Deutsch (Standard) oder Englisch. Die Wahl steht im Browser (localStorage) und
 * wird über den Sprach-Button oben links umgeschaltet. Dabei lädt die Seite neu.
 *
 * Die deutschen Inhalte stehen in js/content.js. Hier stehen die Texte der Oberfläche und
 * die englischen Fassungen der Inhalte. Wenn du etwas ändern willst, steht es hier.
 */
(function () {
  let lang = 'de';
  try { if (localStorage.getItem('lang') === 'en') lang = 'en'; } catch (e) {}

  // Texte der Oberfläche (Schlüssel: de/en)
  const TEXT = {
    de: {
      top: 'Nach oben', menu: 'Hauptmenü', menuOpen: 'Menü öffnen', menuClose: 'Menü schließen',
      theme: 'Dark Mode umschalten', details: 'Details öffnen', close: 'Schließen', show: 'Anzeigen',
      projects: 'Projekte', about: 'Über mich', skills: 'Skills', now: 'Woran ich gerade arbeite',
      contact: 'Kontakt', langAria: 'Sprache wechseln'
    },
    en: {
      top: 'Back to top', menu: 'Main menu', menuOpen: 'Open menu', menuClose: 'Close menu',
      theme: 'Toggle dark mode', details: 'Open details', close: 'Close', show: 'Show',
      projects: 'Projects', about: 'About', skills: 'Skills', now: "What I'm working on",
      contact: 'Contact', langAria: 'Switch language'
    }
  };

  // Englische Inhalte, gleiche Reihenfolge wie in content.js
  const CONTENT_EN = {
    sections: { projekte: 'Projects', 'ueber-mich': 'About', skills: 'Skills', kontakt: 'Contact' },
    projects: [
      {
        summary: 'A minimalist Android launcher made with Flutter: a clock, a few apps and a letter bar along the edge. Everything else is one gesture away.',
        tags: ['Flutter', 'Android', 'Dart']
      },
      {
        summary: 'Website for an electrical and automation company from South Tyrol. I modeled and rendered all the 3D elements in Blender.',
        tags: ['Blender', 'Web', '3D rendering']
      },
      {
        summary: 'Like PowerPoint, but the slides can be placed freely in 3D space, scaled and flown through with a camera. It exports as an Impress.js website.',
        tags: ['C++', 'Qt6', 'OpenGL']
      }
    ],
    about: {
      intro: 'I mostly work with AI, sometimes without. And when I work without AI, I use C++.',
      stats: ['Years coding', 'Currently learning Qt/QML', 'Games made']
    }
  };

  if (lang === 'en' && window.CONTENT) {
    const C = window.CONTENT;
    C.sections.forEach(s => { if (CONTENT_EN.sections[s.id]) s.label = CONTENT_EN.sections[s.id]; });
    C.projects.forEach((p, i) => Object.assign(p, CONTENT_EN.projects[i] || {}));
    C.about.intro = CONTENT_EN.about.intro;
    C.about.stats.forEach((s, i) => { s.label = CONTENT_EN.about.stats[i] || s.label; });
  }

  // Feste Texte im HTML: data-i18n für Text, data-i18n-aria für aria-label
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(node => {
    node.textContent = TEXT[lang][node.dataset.i18n] ?? node.textContent;
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(node => {
    node.setAttribute('aria-label', TEXT[lang][node.dataset.i18nAria] ?? '');
  });

  window.I18N = {
    lang,
    other: lang === 'de' ? 'en' : 'de',
    t: key => (TEXT[lang] && TEXT[lang][key]) || TEXT.de[key] || key,
    toggleLanguage() {
      try { localStorage.setItem('lang', lang === 'de' ? 'en' : 'de'); } catch (e) {}
      location.reload();
    }
  };
})();
