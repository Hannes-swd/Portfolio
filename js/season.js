/*
 * Saisons – prüft das Datum und sagt, ob gerade eine besondere Zeit ist
 * (Silvester, Aprilscherz, Karneval, Ostern, Muttertag, Valentinstag, Halloween, Weihnachten).
 * Die anderen Skripte können darauf reagieren:
 *
 *   Season.current   – Name der aktiven Saison, z. B. 'christmas', oder null
 *   Season.palette   – Pixelfarben der Saison für Name und Logo, oder null
 *   Season.seasonFor(date) – welche Saison an einem bestimmten Datum gilt
 *
 * Zeiträume und Farben stehen unten in SEASONS. Außerdem bekommt <html> das Attribut
 * data-season="christmas", damit CSS darauf reagieren kann.
 *
 * Zum Ausprobieren ohne passendes Datum: ?season=christmas (oder easter, halloween, valentine,
 * newyear, aprilfools, carnival, mothersday) an die Adresse hängen. ?season=off schaltet alles aus.
 */
(function (global) {
  'use strict';

  // Zeiträume: from/to als [Monat, Tag]. Über den Jahreswechsel geht auch,
  // z. B. from [12, 20], to [1, 6]. easter: Tage relativ zu Ostersonntag,
  // z. B. [-7, 1] = Palmsonntag bis Ostermontag. nth: n-ter Wochentag im Monat
  // (weekday 0 = Sonntag), days: Tage relativ dazu, z. B. [-1, 0] = Samstag und Sonntag.
  // Bei Überschneidungen gewinnt die Saison, die weiter oben steht.
  // palette: Farben für Name und Logo, von dunkel (oben) nach hell (unten).
  const SEASONS = [
    {
      id: 'halloween',
      from: [10, 25], to: [10, 31],
      palette: [[100, 40, 140], [130, 60, 170], [200, 70, 20], [235, 115, 30], [250, 160, 60]]
    },
    {
      id: 'christmas',
      from: [12, 21], to: [12, 27],
      palette: [[20, 100, 55], [30, 130, 68], [160, 28, 38], [195, 40, 48], [218, 170, 62]]
    },
    {
      id: 'newyear',
      from: [12, 31], to: [1, 1],
      palette: [[50, 100, 210], [110, 70, 200], [200, 50, 70], [225, 160, 50], [245, 205, 90]]
    },
    {
      id: 'aprilfools',
      from: [4, 1], to: [4, 1],
      palette: [[255, 90, 140], [255, 150, 60], [250, 220, 60], [90, 200, 120], [70, 150, 240]]
    },
    {
      id: 'carnival',
      easter: [-52, -47],   // Weiberfastnacht bis Veilchendienstag
      palette: [[220, 40, 50], [250, 200, 40], [60, 170, 80], [50, 120, 230], [230, 90, 180]]
    },
    {
      id: 'easter',
      easter: [-7, 1],
      palette: [[110, 200, 165], [140, 195, 235], [200, 160, 230], [240, 135, 185], [250, 205, 95]]
    },
    {
      id: 'mothersday',
      nth: { month: 5, weekday: 0, n: 2, days: [-1, 0] },   // zweiter Sonntag im Mai, mit Samstag davor
      palette: [[235, 95, 140], [250, 160, 185], [200, 130, 215], [250, 215, 110], [240, 120, 90]]
    },
    {
      id: 'valentine',
      from: [2, 7], to: [2, 14],
      palette: [[160, 20, 60], [190, 40, 90], [215, 70, 120], [235, 110, 150], [245, 150, 175]]
    }
  ];

  const DAY = 86400000;
  // Tage seit 1970 – so lassen sich Daten vergleichen, ohne Zeitzonen- oder Sommerzeit-Probleme
  const dayOf = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / DAY);

  // Ostersonntag nach Meeus/Jones/Butcher (gregorianischer Kalender), als Tageszahl
  function easterDay(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return dayOf(year, month, day);
  }

  // Tageszahl des n-ten Wochentags in einem Monat (weekday: 0 = Sonntag … 6 = Samstag)
  function nthWeekday(year, month, weekday, n) {
    const first = dayOf(year, month, 1);
    const firstWeekday = new Date(first * DAY).getUTCDay();
    return first + ((weekday - firstWeekday + 7) % 7) + (n - 1) * 7;
  }

  // Liegt das Datum im Zeitraum dieser Saison?
  function inSeason(season, date) {
    const year = date.getFullYear();
    const today = dayOf(year, date.getMonth() + 1, date.getDate());
    if (season.easter) {
      const e = easterDay(year);
      return today >= e + season.easter[0] && today <= e + season.easter[1];
    }
    if (season.nth) {
      const s = nthWeekday(year, season.nth.month, season.nth.weekday, season.nth.n);
      return today >= s + season.nth.days[0] && today <= s + season.nth.days[1];
    }
    const start = dayOf(year, ...season.from), end = dayOf(year, ...season.to);
    return start <= end
      ? today >= start && today <= end
      : today >= start || today <= end;   // über den Jahreswechsel
  }

  // Welche Saison gilt an diesem Datum? (null = keine)
  function seasonFor(date) {
    const found = SEASONS.find(s => inSeason(s, date));
    return found ? found.id : null;
  }

  // ?season=… in der Adresse hat Vorrang vor dem Datum (zum Ausprobieren)
  function chooseSeason(date, search) {
    const forced = new URLSearchParams(search || '').get('season');
    if (forced === 'off') return null;
    if (SEASONS.some(s => s.id === forced)) return forced;
    return seasonFor(date);
  }

  const id = chooseSeason(new Date(), global.location ? global.location.search : '');
  const active = SEASONS.find(s => s.id === id) || null;

  if (id && global.document) document.documentElement.dataset.season = id;

  global.Season = {
    current: id,
    palette: active ? active.palette : null,
    seasonFor
  };
})(window);
