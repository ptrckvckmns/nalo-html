/* ==========================================================================
   EuroMillions – volgende trekking
   Toont de datum en de jackpot van de volgende EuroMillions-trekking
   op basis van het NLO "nextdraw" API-antwoord.

   API: https://lonalo.enco.io/lonalo/nextdraw/1.2.0/Elot?language=nl
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------ config --- */

  /* De taal komt uit <html lang="…">. Elk HTML-bestand bepaalt dus zijn eigen
     taal en de drie pagina's (nl / fr / de) delen deze ene JS-file. */
  var LANG = (document.documentElement.getAttribute('lang') || 'nl')
    .toLowerCase()
    .slice(0, 2);

  var API_BASE = 'https://lonalo.enco.io/lonalo/nextdraw/1.2.0/Elot';

  // De originele banner breekt af na 1000 ms. Voor mobiel eerste-byte is dat
  // te krap, dus we nemen ruimer de tijd.
  var TIMEOUT_MS = 5000;

  /* Teksten en getalnotatie per taal. De API kent ?language=nl|fr|de. */
  var I18N = {
    nl: {
      locale: 'nl-BE',
      label: 'Jackpot van',
      dateUnknown: 'Datum onbekend',
      amountUnknown: 'Bedrag onbekend',
      breakMsg: 'Er is momenteel geen actieve EuroMillions-trekking gepland. ' +
                'Probeer het later opnieuw.',
      errorMsg: 'De gegevens van de volgende trekking konden niet worden geladen.'
    },
    fr: {
      locale: 'fr-BE',
      label: 'Jackpot de',
      dateUnknown: 'Date inconnue',
      amountUnknown: 'Montant inconnu',
      breakMsg: 'Aucun tirage EuroMillions n\u2019est programmé pour le moment. ' +
                'Réessayez plus tard.',
      errorMsg: 'Les données du prochain tirage n\u2019ont pas pu être chargées.'
    },
    de: {
      locale: 'de-BE',
      label: 'Jackpot von',
      // De API-prefix is voor het Duits "um die", wat achter "von" niet werkt
      // ("Jackpot von um die 37.000.000"). Daarom gebruiken we onze eigen
      // vertaling "etwa": "Jackpot von etwa", en enkel als de API-prefix
      // gevuld is. Is die leeg (exacte jackpot), dan blijft het "Jackpot von".
      prefixOverride: 'etwa',
      dateUnknown: 'Datum unbekannt',
      amountUnknown: 'Betrag unbekannt',
      breakMsg: 'Derzeit ist keine aktive EuroMillions-Ziehung geplant. ' +
                'Versuchen Sie es später erneut.',
      errorMsg: 'Die Daten der nächsten Ziehung konnten nicht geladen werden.'
    }
  };

  var CFG = I18N[LANG] || I18N.nl;

  // Onbekende taal valt terug op Nederlands, ook voor de API-aanroep.
  var API_URL = API_BASE + '?language=' + (I18N[LANG] ? LANG : 'nl');

  // Toegestane achtergrondvarianten (zie css/style.css).
  // Standaard A; test een andere met ?bg=B (of C / D) achter de URL.
  var VARIANTS = ['A', 'B', 'C', 'D'];

  /* ------------------------------------------------------- achtergrond --- */

  /**
   * Leest ?bg= uit de URL en zet data-bg op <body>.
   * Zonder (of met een ongeldige) parameter blijft de standaard uit de HTML staan.
   */
  function applyBackgroundVariant() {
    var match = /[?&]bg=([^&#]*)/.exec(window.location.search);
    var variant = match ? decodeURIComponent(match[1]).toUpperCase() : '';

    if (VARIANTS.indexOf(variant) !== -1) {
      document.body.setAttribute('data-bg', variant);
    }
  }

  applyBackgroundVariant();

  /* --------------------------------------------------------------- DOM --- */

  var card = document.getElementById('em-card');
  var elDate = document.getElementById('em-date');
  var elLabel = document.getElementById('em-label');
  var elJackpot = document.getElementById('em-jackpot');
  var elStatus = document.getElementById('em-status');
  var elRetry = document.getElementById('em-retry');

  if (!card) {
    return;
  }

  /* ---------------------------------------------------------- helpers --- */

  /**
   * Zet de kaart in een bepaalde toestand.
   * @param {'loading'|'ok'|'break'|'error'} state
   */
  function setState(state) {
    card.setAttribute('data-state', state);
  }

  /** Toon een statusmelding en verberg de retry-knop of niet. */
  function showStatus(message, canRetry) {
    if (message) {
      elStatus.textContent = message;
      elStatus.hidden = false;
    } else {
      elStatus.textContent = '';
      elStatus.hidden = true;
    }
    elRetry.hidden = !canRetry;
  }

  /**
   * Parseert de API-datum "DD/MM/JJJJ" (bv. "20/11/2026") naar een Date.
   *
   * LET OP: new Date("20/11/2026") geeft Invalid Date en
   * new Date("09/11/2026") wordt als MM/DD gelezen (11 september!).
   * Daarom splitsen we de string zelf en bouwen we de Date met
   * new Date(jaar, maand-1, dag) — dat is lokale middernacht en dus
   * exact de bedoelde kalenderdag, zonder tijdzone-verschuiving.
   *
   * @param {string} value bv. "20/11/2026"
   * @returns {Date|null} null als het formaat of de datum ongeldig is
   */
  function parseDrawDate(value) {
    if (typeof value !== 'string') {
      return null;
    }

    // Staat zowel "20/11/2026" als "20-11-2026" of "20.11.2026" toe.
    var parts = value.trim().split(/[\/\-.]/);

    if (parts.length !== 3) {
      return null;
    }

    var day = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    var year = parseInt(parts[2], 10);

    if (!isFinite(day) || !isFinite(month) || !isFinite(year)) {
      return null;
    }

    if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    var date = new Date(year, month - 1, day);

    // Vangt onbestaande dagen af, bv. 31/02/2026 dat stilzwijgend
    // zou doorschuiven naar 3 maart.
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    return date;
  }

  /**
   * "20/11/2026" -> "vrijdag 20 november" / "vendredi 20 novembre" /
   * "Freitag, 20. November"
   * Intl levert de juiste dagnamen en maandnamen per taal aan.
   * De hoofdletter van de weekdag komt uit CSS (::first-letter).
   */
  function formatDrawDate(value) {
    var date = parseDrawDate(value);

    if (!date) {
      return '';
    }

    return new Intl.DateTimeFormat(CFG.locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(date);
  }

  /**
   * 37000000 -> "37.000.000" (nl/de) of "37 000 000" (fr)
   * Geen decimalen; het scheidingsteken komt uit de locale.
   */
  function formatAmount(value) {
    var number = Number(value);

    if (!isFinite(number)) {
      return '';
    }

    return new Intl.NumberFormat(CFG.locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      useGrouping: true
    }).format(number);
  }

  /**
   * Frans groepeert met U+202F (smalle vaste spatie) of U+00A0.
   * Die tekens bestaan niet in de sprite, dus voor de sprite-weergave
   * zetten we ze om naar een gewone spatie. Het zichtbare resultaat
   * blijft "37 000 000"; het aria-label houdt de nette Intl-notatie.
   */
  function toSpriteAmount(text) {
    return text.replace(/[\u202F\u00A0\u2009]/g, ' ');
  }

  /**
   * Bouwt regel 2 op basis van estimatedjackpotprefix.
   *
   * nl: "Jackpot van" + "zo'n"    -> "Jackpot van zo'n"
   * fr: "Jackpot de"  + "près de"  -> "Jackpot de près de"
   * de: "Jackpot von" + "etwa"     -> "Jackpot von etwa"
   *     (de API-prefix is daar "um die", wat achter "von" niet werkt, dus
   *      we vervangen hem door onze eigen vertaling via prefixOverride)
   *
   * Is de prefix leeg of ontbreekt hij, dan blijft het bij het label alleen:
   * "Jackpot van" / "Jackpot de" / "Jackpot von".
   */
  function buildJackpotLabel(prefix) {
    var clean = typeof prefix === 'string' ? prefix.trim() : '';

    // Niets te melden: alleen het label.
    if (!clean) {
      return CFG.label;
    }

    // Taal waarbij de API-prefix grammaticaal niet past: eigen tekst gebruiken.
    var shown = CFG.prefixOverride || clean;

    return CFG.label + ' ' + shown;
  }

  /* --------------------------------------------------- sprite-glyphs ----- */

  /**
   * Koppelt elk teken aan zijn glyph-klasse uit de sprite (css_sprites.png).
   * De sprite bevat 15 glyphs: . 1 8 6 9 3 5 4 2 0 7 €
   * Ontbrekende tekens (bv. een letter) worden overgeslagen.
   */
  var GLYPHS = {
    '.': 'g--dot',
    '0': 'g--0',
    '1': 'g--1',
    '2': 'g--2',
    '3': 'g--3',
    '4': 'g--4',
    '5': 'g--5',
    '6': 'g--6',
    '7': 'g--7',
    '8': 'g--8',
    '9': 'g--9',
    '\u20AC': 'g--euro',   // €
    ' ': 'g--space'
  };

  /**
   * Zet een tekst om in sprite-glyphs.
   * Elke glyph is een leeg <span>; de CSS zet de juiste sprite-uitsnede.
   * @param {string} text bv. "€ 37.000.000"
   * @param {HTMLElement} target het element dat gevuld wordt
   */
  function renderSpriteText(text, target) {
    // Eerst leegmaken (textContent wist ook eventuele vorige glyphs).
    target.textContent = '';

    var fragment = document.createDocumentFragment();

    for (var i = 0; i < text.length; i++) {
      var cls = GLYPHS[text.charAt(i)];

      // Teken niet in de sprite (bv. letters): overslaan.
      if (!cls) {
        continue;
      }

      var span = document.createElement('span');
      span.className = 'g ' + cls;
      // Decoratief: de tekst staat als aria-label op het bovenliggende element.
      span.setAttribute('aria-hidden', 'true');
      fragment.appendChild(span);
    }

    target.appendChild(fragment);
  }

  /* ------------------------------------------------------ API-aanroep --- */

  /**
   * Haalt het nextdraw-antwoord op.
   * @returns {Promise<object>} het geparseerde JSON-antwoord
   * @throws {Error} bij netwerkfout, time-out, niet-200 of ongeldige JSON
   */
  function fetchNextDraw() {
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, TIMEOUT_MS);

    return fetch(API_URL, {
      method: 'GET',
      signal: controller.signal,
      // Geen credentials: de API is publiek en stuurt Access-Control-Allow-Origin: *
      credentials: 'omit'
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }

  /* --------------------------------------------------------- weergave --- */

  /** Toont datum, prefix en jackpot. */
  function render(event) {
    var maindraw = event.maindraw || {};

    // Regel 1: de datum komt uit "drawdate" (DD/MM/JJJJ), niet uit iso8601date.
    var dateText = formatDrawDate(event.drawdate);
    var amountText = formatAmount(maindraw.jackpot);

    elDate.textContent = dateText || CFG.dateUnknown;
    elLabel.textContent = buildJackpotLabel(maindraw.estimatedjackpotprefix);

    // Regel 3: het euroteken vóór het bedrag, met een spatie ertussen.
    // In de sprite-font worden dit losse glyphs: € 3 7 . 0 0 0 . 0 0 0
    if (amountText) {
      var full = '\u20AC ' + amountText;
      // De sprite kent alleen '.' en ' ' als scheidingsteken, dus Frans
      // (smalle vaste spatie) wordt voor de weergave omgezet.
      renderSpriteText('\u20AC ' + toSpriteAmount(amountText), elJackpot);
      // Voor screenreaders en als de sprite niet laadt: de nette notatie.
      elJackpot.setAttribute('aria-label', CFG.label + ': ' + full);
      elJackpot.setAttribute('role', 'img');
    } else {
      elJackpot.textContent = CFG.amountUnknown;
      elJackpot.removeAttribute('aria-label');
      elJackpot.removeAttribute('role');
    }
  }

  /* ------------------------------------------------------------ start --- */

  function load() {
    setState('loading');
    showStatus('', false);

    elDate.textContent = '\u00A0';
    elLabel.textContent = '\u00A0';
    elJackpot.textContent = '';
    elJackpot.removeAttribute('aria-label');
    elJackpot.removeAttribute('role');

    fetchNextDraw()
      .then(function (data) {
        var events = data && data.gameevents;

        // Lege of ontbrekende lijst = geen actieve trekking (draw break).
        if (!Array.isArray(events) || events.length === 0) {
          setState('break');
          showStatus(CFG.breakMsg, true);
          return;
        }

        render(events[0]);
        setState('ok');
      })
      .catch(function (error) {
        setState('error');
        showStatus(CFG.errorMsg, true);
        // Detail enkel in de console, niet op de pagina.
        if (window.console && console.error) {
          console.error('EuroMillions nextdraw mislukt:', error);
        }
      });
  }

  elRetry.addEventListener('click', load);

  load();
})();
