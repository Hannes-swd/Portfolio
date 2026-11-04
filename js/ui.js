/*
 * Die Website rund um das Pixelfeld: baut Menü und Bereiche aus js/content.js,
 * kümmert sich um feste Leiste, aktiven Menüpunkt, Handy-Menü, Detailansicht
 * und das Einblenden beim Scrollen.
 */
(function () {
  'use strict';

  const C = window.CONTENT;
  const Icons = window.Behaviors ? Behaviors.Icons : {};
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, root = document) => root.querySelector(sel);

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ---------- Pixel-Symbole als SVG ---------- */

  // Zeilen wie ['.##.', '#..#'] -> Pfad nur für das Zeichen ch, waagerechte Läufe werden zu einem Rechteck
  function pixelPath(rows, ch) {
    let d = '';
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== ch) continue;
        let run = 1;
        while (row[x + run] === ch) run++;
        d += `M${x} ${y}h${run}v1h-${run}z`;
        x += run - 1;
      }
    });
    return d;
  }

  function pixelSvg(rows) {
    if (!rows) return '';
    const w = rows[0].length, h = rows.length;
    return `<svg class="pixel-icon" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path fill="currentColor" d="${pixelPath(rows, '#')}"/></svg>`;
  }

  // Ohne Bild: eine Pixel-Landschaft (Sonne und Hügel). Der Titel ist der Startwert,
  // so sieht jedes Projekt anders aus, aber immer gleich bei jedem Laden
  function pixelCover(seed) {
    const W = 32, H = 18;
    let s = 7;
    for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

    const rows = Array.from({ length: H }, () => Array(W).fill('.'));
    const sx = 6 + Math.floor(rnd() * (W - 12));
    const sy = 3 + Math.floor(rnd() * 3);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if ((x - sx) ** 2 + (y - sy) ** 2 <= 9) rows[y][x] = 's';
      }
    }
    let h = 10;
    for (let x = 0; x < W; x++) {
      h = Math.min(H - 4, Math.max(6, h + Math.floor(rnd() * 3) - 1));
      for (let y = h; y < H; y++) rows[y][x] = 'g';
    }

    const cover = el('div', 'cover');
    cover.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges" aria-hidden="true">`
      + `<path class="cover__sun" d="${pixelPath(rows, 's')}"/>`
      + `<path class="cover__ground" d="${pixelPath(rows, 'g')}"/></svg>`;
    return cover;
  }

  // Form aus js/shapes.js (Punktliste) -> Zeilen
  function shapeRows(shape) {
    const rows = Array.from({ length: shape.height }, () => Array(shape.width).fill('.'));
    for (let k = 0; k < shape.count; k++) rows[shape.y[k]][shape.x[k]] = '#';
    return rows.map(r => r.join(''));
  }

  function icon(name) {
    if (name === 'contrast') return pixelSvg(Icons.contrast ? Icons.contrast(9) : null);
    return pixelSvg(Icons[name]);
  }

  /* ---------- Theme & Links ---------- */

  const githubUrl = (C.contact.find(c => c.icon === 'github') || {}).href || 'https://github.com/';

  function toggleTheme() {
    const dark = document.documentElement.dataset.theme !== 'dark';
    if (window.setTheme) window.setTheme(dark);
    else document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }

  function setupTools(root) {
    root.querySelectorAll('[data-action="theme"]').forEach(btn => {
      btn.innerHTML = icon('contrast');
      btn.addEventListener('click', toggleTheme);
    });
    // Sprache: zeigt die andere Sprache an und lädt die Seite in ihr neu
    root.querySelectorAll('[data-action="lang"]').forEach(btn => {
      btn.textContent = I18N.other.toUpperCase();
      btn.setAttribute('aria-label', I18N.t('langAria'));
      btn.addEventListener('click', () => I18N.toggleLanguage());
    });
    root.querySelectorAll('[data-action="github"]').forEach(a => {
      a.innerHTML = icon('github');
      a.href = githubUrl;
    });
  }

  /* ---------- Navigation ---------- */

  const nav = $('#nav');
  const menu = $('#menu');
  const burger = $('.nav__burger');

  function buildNav() {
    $('.nav__home').innerHTML = window.Shapes ? pixelSvg(shapeRows(Shapes.logoSmall)) : '';

    for (const container of [$('.nav__links'), $('.menu__links')]) {
      for (const s of C.sections) {
        const a = el('a', null, s.label);
        a.href = '#' + s.id;
        a.dataset.section = s.id;
        container.append(a);
      }
    }

    // Handy-Menü bekommt dieselben Werkzeuge wie die Leiste
    $('.menu__tools').append(...Array.from($('.nav__tools').children, n => n.cloneNode(true)));
    setupTools(document);

    burger.innerHTML = icon('menu');
    burger.addEventListener('click', () => {
      // Öffnet der Pixel-Button das Menü, schickt der Browser nach dem Loslassen noch einen Klick.
      // Der landet auf dem Burger, der genau an dieser Stelle gerade erschienen ist, und würde
      // das Menü sofort wieder schließen. Deshalb kurz nach dem Öffnen ignorieren.
      if (performance.now() - openedAt < 400) return;
      menu.hidden ? openMenu() : closeMenu();
    });
    menu.addEventListener('click', e => { if (e.target.closest('a')) closeMenu(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) closeMenu(); });
    // Wird das Fenster breit genug für die Menüpunkte, verschwindet das Handy-Menü sofort –
    // so ist immer nur eines von beiden zu sehen
    matchMedia('(min-width: 761px)').addEventListener('change', e => {
      if (e.matches) closeMenu({ animate: false });
    });
  }

  // Zeitpunkt, zu dem das Menü zuletzt geöffnet wurde (siehe Burger-Klick oben)
  let openedAt = 0;

  function openMenu() {
    openedAt = performance.now();
    menu.classList.remove('is-closing');
    menu.hidden = false;
    nav.classList.add('menu-open');
    burger.innerHTML = icon('close');
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', I18N.t('menuClose'));
    document.body.style.overflow = 'hidden';
  }

  // Schließen mit derselben Animation rückwärts; erst danach wirklich ausblenden
  function closeMenu({ animate = true } = {}) {
    if (menu.hidden || menu.classList.contains('is-closing')) return;
    const finish = () => {
      if (animate && !menu.classList.contains('is-closing')) return;   // wurde inzwischen wieder geöffnet
      menu.classList.remove('is-closing');
      menu.hidden = true;
      nav.classList.remove('menu-open');
    };
    if (animate && !reducedMotion) {
      menu.classList.add('is-closing');
      menu.addEventListener('animationend', finish, { once: true });
      setTimeout(finish, 450);   // falls der Browser das Animationsende nicht meldet
    } else {
      finish();
    }
    burger.innerHTML = icon('menu');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', I18N.t('menuOpen'));
    document.body.style.overflow = '';
  }

  // Feste Leiste, sobald das Pixelfeld unter der Leiste verschwunden ist
  function watchHero() {
    const navH = () => nav.offsetHeight;
    new IntersectionObserver(([entry]) => {
      nav.classList.toggle('is-solid', !entry.isIntersecting);
    }, { rootMargin: `-${navH()}px 0px 0px 0px` }).observe($('.hero'));
  }

  // Menüpunkt des Bereichs markieren, der gerade die Bildschirmmitte kreuzt
  function watchSections() {
    const links = document.querySelectorAll('.nav__links a');
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        links.forEach(a => a.classList.toggle('is-active', a.dataset.section === entry.target.id));
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    C.sections.forEach(s => { const sec = document.getElementById(s.id); if (sec) observer.observe(sec); });

    // Zurück im Pixelfeld: nichts markieren
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) links.forEach(a => a.classList.remove('is-active'));
    }, { rootMargin: '-45% 0px -50% 0px' }).observe($('.hero'));
  }

  /* ---------- Übergang Pixelfeld -> Inhalt ---------- */

  // Kleines Bild aus verblassenden grauen Pixeln. Es nimmt genau das Raster des Pixelfelds
  // auf (gleiche Pixelgröße, gleicher Versatz), damit zwischen beiden keine Naht bleibt
  function buildHeroFade() {
    const fade = $('.hero-fade');
    const hero = $('.hero');
    const draw = () => {
      const engine = window.engine;
      const cell = engine ? engine.cellPx / engine.dpr : 4;
      // Das Pixelfeld zentriert sein Raster; hier liegen dessen linker Rand und unteres Ende (CSS-px)
      const gridLeft = engine ? engine.offsetX / engine.dpr : 0;
      const gridBottom = engine ? (engine.offsetY + engine.rows * engine.cellPx) / engine.dpr : hero.offsetHeight;
      // Der Rest unter dem Raster (durch Rundung) wird vom Übergang nach oben überdeckt
      fade.style.marginTop = `${-Math.max(0, hero.offsetHeight - gridBottom)}px`;

      const cols = Math.ceil(fade.offsetWidth / cell) + 1;
      const rows = Math.ceil(fade.offsetHeight / cell);
      const canvas = document.createElement('canvas');
      canvas.width = cols;
      canvas.height = rows;
      const ctx = canvas.getContext('2d');
      const shades = [236, 226, 214, 198, 176];
      for (let y = 0; y < rows; y++) {
        // Oberste Zeile voll gefüllt: darunter liegen im Pixelfeld zwei weiße Rasterzeilen,
        // die sonst als helle Naht durchscheinen würden
        const p = y === 0 ? 1 : 0.6 * (1 - y / rows) ** 2.2;
        for (let x = 0; x < cols; x++) {
          if (Math.random() >= p) continue;
          const g = shades[Math.floor(Math.random() * shades.length)];
          ctx.fillStyle = `rgb(${g},${g},${g})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
      fade.style.backgroundImage = `url(${canvas.toDataURL()})`;
      fade.style.backgroundSize = `${cols * cell}px ${rows * cell}px`;
      fade.style.backgroundPosition = `${gridLeft}px 0`;
    };
    draw();
    let timer;
    window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(draw, 200); });
  }

  /* ---------- Medien ---------- */

  const isVideo = src => /\.(mp4|webm|mov|ogg)$/i.test(src);

  function placeholder(text) {
    const box = el('div', 'placeholder');
    box.append(el('span', null, text));
    return box;
  }

  function media(src, { controls = false } = {}) {
    if (!src) return placeholder('Bild folgt');
    if (isVideo(src)) {
      const v = el('video');
      v.src = src;
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = 'metadata';
      v.controls = controls;
      return v;
    }
    const img = el('img');
    img.src = src;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    return img;
  }

  // Videos nur abspielen, solange sie zu sehen sind
  const videoObserver = 'IntersectionObserver' in window && new IntersectionObserver(entries => {
    for (const entry of entries) {
      const v = entry.target;
      if (entry.isIntersecting && !reducedMotion) v.play().catch(() => {});
      else v.pause();
    }
  }, { threshold: 0.4 });

  // Mehrere Bilder übereinander: immer nur eines ist sichtbar, alle paar Sekunden wechselt es
  // weich. stop() hält den Wechsel an, z. B. wenn die Detailansicht schließt
  function slideshow(srcs, interval = 4000) {
    const box = el('div', 'slides');
    const frames = srcs.map((src, i) => {
      const m = media(src);
      m.classList.add('slides__frame');
      if (i === 0) m.classList.add('is-on');
      box.append(m);
      return m;
    });
    let current = 0;
    let timer = null;
    box.stop = () => clearInterval(timer);
    // Bei "Bewegung reduzieren" bleibt das erste Bild stehen
    if (frames.length > 1 && !reducedMotion) {
      timer = setInterval(() => {
        frames[current].classList.remove('is-on');
        current = (current + 1) % frames.length;
        frames[current].classList.add('is-on');
      }, interval);
    }
    return box;
  }

  /* ---------- Bereiche ---------- */

  function tagRow(p, className) {
    const row = el('div', className);
    (p.tags || []).forEach(t => row.append(el('span', 'tag', t)));
    return row;
  }

  function buildProjects() {
    const list = $('.projects');
    C.projects.forEach((p, i) => {
      // Das erste Projekt bekommt die ganze Breite; Hochformat-Bilder stehen links neben dem Text
      const classes = ['card'];
      if (i === 0) classes.push('card--wide');
      if (p.portrait) classes.push('card--portrait');
      const card = el('button', classes.join(' '));
      card.type = 'button';
      card.style.setProperty('--i', i % 3);
      card.setAttribute('aria-label', `${p.title} – ${I18N.t('details')}`);

      const box = el('div', 'card__media');
      const images = [p.image, ...(p.gallery || [])].filter(Boolean);
      if (!p.video && images.length > 1) {
        box.append(slideshow(images));
      } else if (p.video || p.image) {
        const m = media(p.video || p.image);
        box.append(m);
        if (m.tagName === 'VIDEO' && videoObserver) videoObserver.observe(m);
      } else {
        box.append(pixelCover(p.title));
      }

      const head = el('div', 'card__head');
      head.append(el('span', 'card__index', String(i + 1).padStart(2, '0')), el('span', 'card__year', p.year ? String(p.year) : ''));

      const body = el('div', 'card__body');
      body.append(head, el('h3', 'card__title', p.title));
      if (p.summary) body.append(el('p', 'card__summary', p.summary));
      body.append(tagRow(p, 'card__tags'));

      card.append(box, body);
      card.addEventListener('click', () => openProject(p));
      list.append(card);
    });
  }

  function meta(p, className) {
    const row = el('div', className);
    if (p.year) row.append(el('span', null, String(p.year)));
    (p.tags || []).forEach(t => row.append(el('span', 'tag', t)));
    return row;
  }

  // Volle Jahre seit [Jahr, Monat] bis heute (Monat 1–12)
  function yearsSince([year, month]) {
    const now = new Date();
    let years = now.getFullYear() - year;
    if (now.getMonth() + 1 < month) years--;
    return Math.max(0, years);
  }

  function buildAbout() {
    const a = C.about;
    $('.about__intro').textContent = a.intro;
    a.stats.forEach((s, i) => {
      const box = el('div', 'stat');
      box.style.setProperty('--i', i);
      const value = s.codingSince ? String(yearsSince(s.codingSince)) : s.value;
      box.append(el('span', 'stat__value', value), el('span', 'stat__label', s.label));
      $('.stats').append(box);
    });
  }

  // Skills ohne Bewertung: nur Name (optional mit Icon), als Pixel-Chips
  function buildSkills() {
    C.skills.forEach((s, i) => {
      const li = el('li', 'skill');
      li.style.setProperty('--i', i % 4);
      if (s.icon) {
        const img = el('img');
        img.src = s.icon;
        img.alt = '';
        li.append(img);
      } else {
        li.append(el('span', 'skill__dot'));
      }
      li.append(el('span', 'skill__name', s.name));
      $('.skills').append(li);
    });
  }

  function linkButton(label, href, iconName) {
    const a = el('a', 'big-btn');
    a.href = href;
    a.innerHTML = icon(iconName);
    a.append(el('span', null, label));
    if (!href.startsWith('mailto:')) {
      a.target = '_blank';
      a.rel = 'noopener';
    }
    return a;
  }

  function buildContact() {
    C.contact.forEach((c, i) => {
      const a = linkButton(c.label, c.href, c.icon);
      a.style.setProperty('--i', i);
      $('.contact').append(a);
    });
    $('.footer').textContent = C.footer;
  }

  /* ---------- Detailansicht ---------- */

  const dialog = $('#project-dialog');

  // Wechsel-Anzeige der Detailansicht (siehe slideshow): anhalten, wenn ein einzelnes Bild gezeigt wird
  let dialogSlides = null;
  function stopDialogSlides() {
    if (dialogSlides) dialogSlides.stop();
    dialogSlides = null;
  }

  function showMedia(src) {
    stopDialogSlides();
    const box = $('.dialog__media', dialog);
    box.replaceChildren(media(src, { controls: true }));
    const v = box.querySelector('video');
    if (v && !reducedMotion) v.play().catch(() => {});
  }

  function openProject(p) {
    const main = p.video || p.image;
    const images = [p.image, ...(p.gallery || [])].filter(Boolean);
    if (!p.video && images.length > 1) {
      stopDialogSlides();
      dialogSlides = slideshow(images);
      $('.dialog__media', dialog).replaceChildren(dialogSlides);
    } else if (main) {
      showMedia(main);
    } else {
      stopDialogSlides();
      $('.dialog__media', dialog).replaceChildren(pixelCover(p.title));
    }
    $('.dialog__title', dialog).textContent = p.title;
    $('.dialog__meta', dialog).replaceWith(meta(p, 'dialog__meta'));
    $('.dialog__summary', dialog).textContent = p.summary || '';

    const gallery = $('.dialog__gallery', dialog);
    gallery.replaceChildren();
    const items = [main, ...(p.gallery || [])].filter(Boolean);
    if (items.length > 1) {
      for (const src of items) {
        const t = el('button', 'thumb');
        t.type = 'button';
        t.setAttribute('aria-label', I18N.t('show'));
        t.append(media(src));
        t.addEventListener('click', () => showMedia(src));
        gallery.append(t);
      }
    }

    const links = $('.dialog__links', dialog);
    links.replaceChildren();
    if (p.links && p.links.github) links.append(linkButton('Code', p.links.github, 'github'));
    if (p.links && p.links.live) links.append(linkButton('Live', p.links.live, 'link'));

    dialog.classList.toggle('dialog--portrait', !!p.portrait);
    // Solange die Detailansicht offen ist, scrollt die Seite dahinter nicht mit (wie beim Menü)
    document.body.style.overflow = 'hidden';
    dialog.showModal();
  }

  function setupDialog() {
    const close = $('.dialog__close', dialog);
    close.innerHTML = icon('close');
    close.addEventListener('click', () => dialog.close());
    // Klick auf den abgedunkelten Hintergrund schließt ebenfalls
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {
      stopDialogSlides();
      $('.dialog__media', dialog).replaceChildren();
      document.body.style.overflow = '';
    });
  }

  /* ---------- Einblenden beim Scrollen ---------- */

  function setupReveal() {
    if (reducedMotion || !('IntersectionObserver' in window)) return;
    const items = document.querySelectorAll('.card, .stat, .skill, .big-btn, .about__intro');
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -10% 0px' });
    items.forEach(item => {
      item.classList.add('reveal');
      observer.observe(item);
    });
  }

  /* ---------- Woran ich gerade arbeite ---------- */

  const relTime = new Intl.RelativeTimeFormat(I18N.lang, { numeric: 'auto' });
  function relativeDate(iso) {
    const days = Math.round((new Date(iso) - Date.now()) / 86400000);
    return Math.abs(days) < 30 ? relTime.format(days, 'day') : relTime.format(Math.round(days / 30), 'month');
  }

  // Die zuletzt gepushten öffentlichen Repos von GitHub (ohne Forks und ohne das Profil-Repo)
  async function buildNow() {
    const section = $('#gerade');
    try {
      const res = await fetch(`https://api.github.com/users/${C.githubUser}/repos?sort=pushed&per_page=10`);
      if (!res.ok) return;
      const repos = (await res.json())
        .filter(r => !r.fork && r.name.toLowerCase() !== C.githubUser.toLowerCase())
        .slice(0, 3);
      if (!repos.length) return;
      const list = $('.now__list');
      for (const r of repos) {
        const a = el('a', 'now__link', r.name);
        a.href = r.html_url;
        a.target = '_blank';
        a.rel = 'noopener';
        const meta = el('span', 'now__meta', [r.language, relativeDate(r.pushed_at)].filter(Boolean).join(' · '));
        const li = el('li', 'now__item');
        li.append(a, meta);
        list.append(li);
      }
      section.hidden = false;
    } catch {
      // Ohne Verbindung oder bei GitHub-Limit bleibt der Bereich einfach ausgeblendet
    }
  }

  /* ---------- Start ---------- */

  // Für den Pixel-Menübutton im Pixelfeld (main.js)
  window.openMenu = openMenu;

  buildNav();
  buildProjects();
  buildAbout();
  buildSkills();
  buildContact();
  buildNow();
  setupDialog();
  buildHeroFade();
  watchHero();
  watchSections();
  setupReveal();
})();
