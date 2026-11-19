/* ==========================================================================
   EuroMillions – volgende trekking
   Toont de datum en de jackpot van de volgende EuroMillions-trekking
   op basis van het NLO "nextdraw" API-antwoord.

   API: https://lonalo.enco.io/lonalo/nextdraw/1.2.0/Elot?language=nl
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------ config --- */

  var API_URL = 'https://lonalo.enco.io/lonalo/nextdraw/1.2.0/Elot?language=nl';

  // De originele banner breekt af na 1000 ms. Voor mobiel eerste-byte is dat
  // te krap, dus we nemen ruimer de tijd.
  var TIMEOUT_MS = 5000;

  var LOCALE = 'nl-BE';                 // nl-BE en nl-NL geven beide "37.000.000"

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
   * "20/11/2026" -> "vrijdag 20 november"
   * Intl levert de Nederlandse dagnamen en maandnamen aan.
   * De hoofdletter van de weekdag komt uit CSS (::first-letter).
   */
  function formatDrawDate(value) {
    var date = parseDrawDate(value);

    if (!date) {
      return '';
    }

    return new Intl.DateTimeFormat(LOCALE, {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(date);
  }

  /**
   * 37000000 -> "37.000.000"
   * Punt als duizendtallen-scheider, geen decimalen.
   */
  function formatAmount(value) {
    var number = Number(value);

    if (!isFinite(number)) {
      return '';
    }

    return new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      useGrouping: true
    }).format(number);
  }

  /**
   * Bouwt de regel "Jackpot van zo'n" op basis van estimatedjackpotprefix.
   * Bij een lege of ontbrekende prefix blijft het bij "Jackpot van".
   */
  function buildJackpotLabel(prefix) {
    var clean = typeof prefix === 'string' ? prefix.trim() : '';

    return clean ? 'Jackpot van ' + clean : 'Jackpot van';
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

    elDate.textContent = dateText || 'Datum onbekend';
    elLabel.textContent = buildJackpotLabel(maindraw.estimatedjackpotprefix);

    // Regel 3: het euroteken vóór het bedrag, met een spatie ertussen.
    // In de sprite-font worden dit losse glyphs: € 3 7 . 0 0 0 . 0 0 0
    if (amountText) {
      var full = '\u20AC ' + amountText;
      renderSpriteText(full, elJackpot);
      // Voor screenreaders en als de sprite niet laadt.
      elJackpot.setAttribute('aria-label', 'Jackpot: ' + full);
      elJackpot.setAttribute('role', 'img');
    } else {
      elJackpot.textContent = 'Bedrag onbekend';
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
          showStatus(
            'Er is momenteel geen actieve EuroMillions-trekking gepland. Probeer het later opnieuw.',
            true
          );
          return;
        }

        render(events[0]);
        setState('ok');
      })
      .catch(function (error) {
        setState('error');
        showStatus(
          'De gegevens van de volgende trekking konden niet worden geladen.',
          true
        );
        // Detail enkel in de console, niet op de pagina.
        if (window.console && console.error) {
          console.error('EuroMillions nextdraw mislukt:', error);
        }
      });
  }

  elRetry.addEventListener('click', load);

  load();
})();
