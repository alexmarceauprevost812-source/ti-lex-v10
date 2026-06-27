// js/tilex-autocorrect.js

/**
 * TilexAutocorrect — Correction de texte fluide sur mobile
 * - Détecte les fautes après pause de frappe (debounce 900ms)
 * - Envoie le texte à l'Edge Function ai-proxy (Claude)
 * - Affiche un chip de suggestion non-intrusif
 * - 100% vanilla JS, zéro dépendance, zéro clé client
 */

const TilexAutocorrect = (() => {

  /* ── CONFIG ─────────────────────────────────────── */
  const CONFIG = {
    debounceMs  : 900,
    minChars    : 8,
    maxChars    : 600,
    endpointUrl : '/api/indar',
    lang        : 'fr-CA',
  };

  /* ── ÉTAT ───────────────────────────────────────── */
  let _timer       = null;
  let _inputEl     = null;
  let _chipEl      = null;
  let _lastText    = '';
  let _suggestion  = '';
  let _isAnalyzing = false;
  let _abortCtrl   = null;

  /* ── INIT ───────────────────────────────────────── */
  function init(inputSelector = '#tilex-input') {
    _inputEl = document.querySelector(inputSelector);
    if (!_inputEl) {
      console.warn('[TilexAutocorrect] Input introuvable:', inputSelector);
      return;
    }
    _buildChip();
    _bindEvents();
    _patchViewportHeight();
    console.info('[TilexAutocorrect] ✅ Initialisé sur', inputSelector);
  }

  /* ── CHIP UI ────────────────────────────────────── */
  function _buildChip() {
    document.getElementById('tilex-correction-chip')?.remove();

    _chipEl = document.createElement('div');
    _chipEl.id        = 'tilex-correction-chip';
    _chipEl.className = 'tilex-correction-chip';
    _chipEl.style.display = 'none';
    _chipEl.setAttribute('role', 'status');
    _chipEl.setAttribute('aria-live', 'polite');

    _chipEl.innerHTML = `
      <span class="chip-text" id="tilex-chip-text"></span>
      <button class="chip-apply"   id="tilex-chip-apply"   aria-label="Appliquer la correction">✓ Appliquer</button>
      <button class="chip-dismiss" id="tilex-chip-dismiss" aria-label="Ignorer">✕</button>
    `;

    // Insère juste au-dessus de la zone d'input
    const zone = _inputEl.closest(
      '.tilex-input-zone, #tilex-input-zone, .input-container, .chat-input-wrapper'
    ) || _inputEl.parentElement;

    zone.style.position = 'relative';
    zone.appendChild(_chipEl);

    document.getElementById('tilex-chip-apply')  .addEventListener('click', _applyCorrection);
    document.getElementById('tilex-chip-dismiss').addEventListener('click', _hideChip);
  }

  /* ── ÉVÉNEMENTS ─────────────────────────────────── */
  function _bindEvents() {
    _inputEl.addEventListener('input', _onInput);

    // Masque le chip si l'utilisateur efface tout
    _inputEl.addEventListener('input', () => {
      if (_inputEl.value.trim().length < CONFIG.minChars) _hideChip();
    });

    // Auto-resize du textarea sur mobile
    _inputEl.addEventListener('input', _autoResize);

    // Masque chip si focus perdu
    _inputEl.addEventListener('blur', () => {
      setTimeout(_hideChip, 200);
    });

    // Envoie avec Entrée sur mobile (Shift+Entrée = saut de ligne)
    _inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && window.innerWidth <= 768) {
        e.preventDefault();
        _hideChip();
        document.getElementById('tilex-send-btn')?.click();
      }
    });
  }

  /* ── DEBOUNCE + ANALYSE ─────────────────────────── */
  function _onInput() {
    clearTimeout(_timer);
    const text = _inputEl.value.trim();

    if (text.length < CONFIG.minChars || text.length > CONFIG.maxChars) return;
    if (text === _lastText) return;

    _timer = setTimeout(() => _analyze(text), CONFIG.debounceMs);
  }

  async function _analyze(text) {
    if (_isAnalyzing) {
      _abortCtrl?.abort();
    }

    _isAnalyzing = true;
    _lastText    = text;
    _abortCtrl   = new AbortController();

    try {
      const prompt = [
        `Tu es un correcteur de texte québécois. Corrige UNIQUEMENT les fautes d'orthographe et de frappe.`,
        `Conserve le ton, le style et les expressions québécoises.`,
        `Si le texte est déjà correct, réponds exactement: [OK]`,
        `Sinon, réponds UNIQUEMENT avec le texte corrigé, sans explication.`,
        `\nTexte à corriger:\n"${text}"`
      ].join('\n');

      const res = await fetch(CONFIG.endpointUrl, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal : _abortCtrl.signal,
        body   : JSON.stringify({
          action  : 'correct',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 300,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      // Support plusieurs formats de réponse proxy
      const corrected = (
        data?.content?.[0]?.text ||
        data?.text              ||
        data?.result            ||
        ''
      ).trim();

      if (!corrected || corrected === '[OK]' || corrected === text) {
        _hideChip();
        return;
      }

      _suggestion = corrected;
      _showChip(corrected);

    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('[TilexAutocorrect] Erreur analyse:', err.message);
      }
    } finally {
      _isAnalyzing = false;
    }
  }

  /* ── CHIP SHOW / HIDE ───────────────────────────── */
  function _showChip(text) {
    const chipText = document.getElementById('tilex-chip-text');
    if (!chipText || !_chipEl) return;

    chipText.textContent  = `✏️ ${text}`;
    _chipEl.style.display = 'flex';
  }

  function _hideChip() {
    if (_chipEl) _chipEl.style.display = 'none';
    _suggestion = '';
  }

  /* ── APPLIQUER LA CORRECTION ────────────────────── */
  function _applyCorrection() {
    if (!_suggestion || !_inputEl) return;

    _inputEl.value = _suggestion;
    _inputEl.focus();

    // Replace le curseur à la fin
    const len = _inputEl.value.length;
    _inputEl.setSelectionRange(len, len);

    _autoResize();
    _hideChip();

    // Feedback haptique si dispo
    navigator.vibrate?.(30);

    console.info('[TilexAutocorrect] ✅ Correction appliquée');
  }

  /* ── AUTO-RESIZE TEXTAREA ───────────────────────── */
  function _autoResize() {
    if (!_inputEl) return;
    _inputEl.style.height = 'auto';
    _inputEl.style.height = Math.min(_inputEl.scrollHeight, 140) + 'px';
  }

  /* ── FIX VIEWPORT MOBILE (iOS Safari) ──────────── */
  function _patchViewportHeight() {
    const setVh = () => {
      document.documentElement.style.setProperty(
        '--vh', `${window.innerHeight * 0.01}px`
      );
    };
    setVh();
    window.addEventListener('resize',            setVh, { passive: true });
    window.addEventListener('orientationchange', setVh, { passive: true });
  }

  /* ── API PUBLIQUE ───────────────────────────────── */
  return {
    init,
    enable : () => { CONFIG.enabled = true;  },
    disable: () => { CONFIG.enabled = false; _hideChip(); },
    setEndpoint: (url) => { CONFIG.endpointUrl = url; },
  };

})();

// Auto-init au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
  TilexAutocorrect.init('#tilex-input');
});
