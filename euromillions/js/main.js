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
  var TIME_ZONE = 'Europe/Brussels';    // trekkingstijden zijn Belgische tijd

  /* --------------------------------------------------------------- DOM --- */

  var card = document.getElementById('em-card');
  var elDate = document.getElementById('em-date');
  var elLabel = document.getElementById('em-label');
  var elAmount = document.getElementById('em-amount');
  var elLegal = document.getElementById('em-legal');
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
   * "2026-11-20T19:59:59+01:00" -> "donderdag 20 november"
   * Intl geeft de Nederlandse namen al correct; we zetten enkel de eerste
   * letter van de weekdag in hoofdletters via CSS (::first-letter).
   */
  function formatDrawDate(isoString) {
    var date = new Date(isoString);

    if (!isoString || isNaN(date.getTime())) {
      return '';
    }

    return new Intl.DateTimeFormat(LOCALE, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: TIME_ZONE
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

    var dateText = formatDrawDate(event.iso8601date);
    var amountText = formatAmount(maindraw.jackpot);

    elDate.textContent = dateText || 'Datum onbekend';
    elLabel.textContent = buildJackpotLabel(maindraw.estimatedjackpotprefix);
    // Euroteken vóór het bedrag, met een vaste spatie erna: "€ 37.000.000"
    elAmount.textContent = amountText ? '\u20AC\u00A0' + amountText : 'Bedrag onbekend';

    // Juridische vermelding is verplicht wanneer de API die aanlevert.
    var legal = maindraw.islegalmentionneeded === false
      ? ''
      : (maindraw.legalmention || '').trim();

    if (legal) {
      elLegal.textContent = legal;
      elLegal.hidden = false;
    } else {
      elLegal.textContent = '';
      elLegal.hidden = true;
    }
  }

  /* ------------------------------------------------------------ start --- */

  function load() {
    setState('loading');
    showStatus('', false);

    elDate.textContent = '\u00A0';
    elLabel.textContent = '\u00A0';
    elAmount.textContent = '\u00A0';
    elLegal.hidden = true;

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
