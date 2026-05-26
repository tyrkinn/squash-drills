// Squash Drills — app logic
// =====================================================================

(function () {
  'use strict';

  const { renderCourt, renderLegend } = window.SquashCourt;
  const { renderProse } = window.SquashTermLink;
  const { mountCourt } = window.SquashCourtPlayer;
  const DRILLS = window.DRILLS;

  let _courtPlayer = null; // активный плеер схемы (если дрилл на DSL)
  function destroyCourt() {
    if (_courtPlayer) { _courtPlayer.destroy(); _courtPlayer = null; }
  }

  // Glossary lookup for inline term references (см. CONTEXT.md «Ссылка на термин»)
  let _glossaryById = null;
  function lookupTerm(id) {
    if (!_glossaryById) {
      _glossaryById = new Map((window.GLOSSARY || []).map((t) => [t.id, t]));
    }
    return _glossaryById.get(id) || null;
  }

  // ---------- State ----------
  const state = {
    players: loadPref('players', 1),
    level: loadPref('level', 'all'),
    favorites: loadFavorites(),
    timer: null,            // { id, remaining, total, paused }
  };

  // ---------- DOM ----------
  const $listView   = document.getElementById('view-list');
  const $detailView = document.getElementById('view-detail');
  const $glossView  = document.getElementById('view-glossary');
  const $list       = document.getElementById('drills-list');
  const $empty      = document.getElementById('empty-state');
  const $count      = document.getElementById('masthead-count');
  const $detailBody = document.getElementById('detail-body');
  const $detailTitle= document.getElementById('detail-bar-title');
  const $btnBack    = document.getElementById('btn-back');
  const $btnBackGl  = document.getElementById('btn-back-gloss');
  const $btnFav     = document.getElementById('btn-fav');
  const $btnRandom  = document.getElementById('btn-random');
  const $btnGloss   = document.getElementById('btn-glossary');
  const $btnTimer   = document.getElementById('btn-timer');
  const $timerLabel = document.getElementById('timer-label');
  const $glossNav   = document.getElementById('gloss-nav');
  const $glossCats  = document.getElementById('gloss-categories');
  const $glossCount = document.getElementById('gloss-count');
  const $termSheet  = document.getElementById('term-sheet');
  const $termRu     = document.getElementById('term-sheet-ru');
  const $termEn     = document.getElementById('term-sheet-en');
  const $termDef    = document.getElementById('term-sheet-def');

  // ---------- Storage helpers ----------
  function loadPref(key, fallback) {
    try {
      const v = localStorage.getItem('sq.' + key);
      if (v == null) return fallback;
      return isNaN(v) ? v : Number(v) || v;
    } catch { return fallback; }
  }
  function savePref(key, value) {
    try { localStorage.setItem('sq.' + key, value); } catch {}
  }
  function loadFavorites() {
    try {
      const v = localStorage.getItem('sq.favorites');
      return v ? new Set(JSON.parse(v)) : new Set();
    } catch { return new Set(); }
  }
  function saveFavorites() {
    try { localStorage.setItem('sq.favorites', JSON.stringify([...state.favorites])); } catch {}
  }

  // ---------- Filtering ----------
  function getFilteredDrills() {
    return DRILLS.filter((d) => {
      if (d.players !== state.players) return false;
      if (state.level !== 'all' && d.level !== state.level) return false;
      return true;
    }).sort((a, b) => {
      // sort by level order then difficulty
      const order = { E: 1, D: 2, C: 3, B: 4, A: 5 };
      const la = order[a.level], lb = order[b.level];
      if (la !== lb) return la - lb;
      return a.difficulty - b.difficulty;
    });
  }

  // ---------- Rendering ----------
  function renderStars(n) {
    let html = '<span class="stars">';
    for (let i = 1; i <= 5; i++) {
      html += `<span class="${i <= n ? 'star-on' : 'star-off'}">★</span>`;
    }
    return html + '</span>';
  }

  function renderList() {
    const drills = getFilteredDrills();
    $count.textContent = `${drills.length} ${pluralize(drills.length, ['упражнение', 'упражнения', 'упражнений'])}`;
    if (drills.length === 0) {
      $list.innerHTML = '';
      $empty.hidden = false;
      return;
    }
    $empty.hidden = true;
    $list.innerHTML = drills.map((d) => `
      <article class="drill-card" data-id="${d.id}">
        <div class="drill-card-level lv lv-${d.level}">${d.level}</div>
        <div class="drill-card-body">
          <h3 class="drill-card-name">${escapeHtml(d.name)}</h3>
          <div class="drill-card-meta">
            ${renderStars(d.difficulty)}
            <span class="sep"></span>
            <span>${escapeHtml(d.duration)}</span>
          </div>
        </div>
        <div class="drill-card-chevron">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 6l6 6-6 6"/>
          </svg>
        </div>
      </article>
    `).join('');

    // attach click handlers
    $list.querySelectorAll('.drill-card').forEach((card) => {
      card.addEventListener('click', () => {
        navigateTo('drill/' + card.dataset.id);
      });
    });
  }

  function renderDetail(drill) {
    $detailTitle.textContent = drill.name;
    const isFav = state.favorites.has(drill.id);
    $btnFav.setAttribute('aria-pressed', isFav ? 'true' : 'false');
    $btnFav.classList.toggle('is-on', isFav);

    // figure out which shot types are used for the legend
    const types = drill.diagram?.shots
      ? [...new Set(drill.diagram.shots.map((s) => s.type || 'drive'))]
      : [];

    $detailBody.innerHTML = `
      <header class="detail-header">
        <div class="detail-kicker">
          <span class="masthead-dot" aria-hidden="true" style="width:7px;height:7px;box-shadow:none"></span>
          <span>${drill.players === 1 ? 'Соло' : 'Пара'}</span>
          <span>·</span>
          <span>${drill.duration}</span>
        </div>
        <h1 class="detail-title">${escapeHtml(drill.name)}</h1>
        <div class="detail-meta">
          <span class="meta-pill"><span class="lv lv-${drill.level}">${drill.level}</span>${levelLabel(drill.level)}</span>
          <span class="meta-pill">${renderStars(drill.difficulty)}</span>
        </div>
      </header>

      <section class="diagram-section">
        <div class="diagram-wrap">
          ${drill.scene
            ? '<div class="court-mount"></div>'
            : renderCourt(drill.diagram || {}) + renderLegend(types)}
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">Цели</h2>
        <div class="tag-row">
          ${drill.focus.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">Описание</h2>
        <div class="section-prose">
          <p>${renderProse(drill.description, lookupTerm)}</p>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">Как выполнять</h2>
        <ol class="steps-list">
          ${drill.steps.map((s) => `
            <li class="step-item">
              <span class="step-item-text">${renderProse(s, lookupTerm)}</span>
            </li>
          `).join('')}
        </ol>
      </section>

      <section class="section">
        <h2 class="section-title">Подсказки</h2>
        <ul class="tips-list">
          ${drill.tips.map((t) => `
            <li class="tip-item">
              <span class="tip-item-text">${renderProse(t, lookupTerm)}</span>
            </li>
          `).join('')}
        </ul>
      </section>
    `;

    // mount the animated court if this drill is authored in the DSL
    destroyCourt();
    if (drill.scene) {
      const mount = $detailBody.querySelector('.court-mount');
      if (mount) _courtPlayer = mountCourt(mount, drill.scene, { controls: true });
    }

    // reset timer UI for this drill
    stopTimer();
    setupTimerForDrill(drill);
  }

  function levelLabel(L) {
    return { A: 'Топ', B: 'Продвинутый', C: 'Средний', D: 'Базовый', E: 'Новичок' }[L] || L;
  }

  // ---------- Glossary rendering ----------
  function renderGlossary() {
    const GLOSSARY = window.GLOSSARY || [];
    const CATS = window.GLOSSARY_CATEGORIES || [];
    if (!GLOSSARY.length) return;

    $glossCount.textContent = `${GLOSSARY.length} ${pluralize(GLOSSARY.length, ['термин', 'термина', 'терминов'])}`;

    // Nav chips
    $glossNav.innerHTML = CATS.map((c) =>
      `<button class="gloss-nav-chip" data-cat="${c.id}">${escapeHtml(c.label)}</button>`
    ).join('');

    // Categories with items
    $glossCats.innerHTML = CATS.map((cat, idx) => {
      const items = GLOSSARY.filter((g) => g.category === cat.id);
      if (!items.length) return '';
      const num = String(idx + 1).padStart(2, '0');
      return `
        <section class="gloss-category" id="cat-${cat.id}">
          <header class="gloss-category-head">
            <span class="gloss-category-num">${num}</span>
            <h2 class="gloss-category-name">${escapeHtml(cat.label)}</h2>
            <span class="gloss-category-kicker">${escapeHtml(cat.kicker)}</span>
          </header>
          <p class="gloss-category-desc">${escapeHtml(cat.desc)}</p>
          <div class="gloss-list">
            ${items.map((it) => `
              <article class="gloss-item" id="term-${it.id}">
                <div class="gloss-item-head">
                  <span class="gloss-item-ru">${escapeHtml(it.ru)}</span>
                  <span class="gloss-item-en">${escapeHtml(it.en)}</span>
                </div>
                <p class="gloss-item-def">${escapeHtml(it.def)}</p>
              </article>
            `).join('')}
          </div>
        </section>
      `;
    }).join('');

    // Smooth-scroll chip nav
    $glossNav.querySelectorAll('.gloss-nav-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const id = chip.dataset.cat;
        const target = document.getElementById('cat-' + id);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        $glossNav.querySelectorAll('.gloss-nav-chip').forEach((c) => c.classList.remove('is-active'));
        chip.classList.add('is-active');
      });
    });

    // Auto-highlight active chip on scroll
    setupGlossScrollSpy();
  }

  function setupGlossScrollSpy() {
    const sections = [...$glossCats.querySelectorAll('.gloss-category')];
    if (!sections.length) return;
    const chips = [...$glossNav.querySelectorAll('.gloss-nav-chip')];
    chips[0]?.classList.add('is-active');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const id = e.target.id.replace('cat-', '');
          chips.forEach((c) => c.classList.toggle('is-active', c.dataset.cat === id));
        }
      });
    }, { rootMargin: '-30% 0px -60% 0px' });

    sections.forEach((s) => observer.observe(s));
  }

  function pluralize(n, forms) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
    return forms[2];
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ---------- Term definition sheet ----------
  function openTermSheet(id) {
    const term = lookupTerm(id);
    if (!term) return;
    $termRu.textContent = term.ru;
    $termEn.textContent = term.en;
    $termDef.textContent = term.def;
    $termSheet.hidden = false;
    $termSheet.removeAttribute('hidden');
    requestAnimationFrame(() => $termSheet.classList.add('is-open'));
    document.body.classList.add('sheet-open');
    if (navigator.vibrate) try { navigator.vibrate(8); } catch {}
  }

  function closeTermSheet() {
    if ($termSheet.hidden) return;
    $termSheet.classList.remove('is-open');
    document.body.classList.remove('sheet-open');
    setTimeout(() => {
      $termSheet.hidden = true;
      $termSheet.setAttribute('hidden', '');
    }, 220);
  }

  // Open sheet when a term reference inside drill prose is tapped (event delegation)
  $detailBody.addEventListener('click', (e) => {
    const ref = e.target.closest('.term-ref');
    if (ref) openTermSheet(ref.dataset.term);
  });
  $termSheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeTermSheet();
  });
  document.getElementById('term-sheet-all').addEventListener('click', closeTermSheet);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeTermSheet();
  });

  // ---------- Timer ----------
  function parseDurationToSec(durationStr) {
    // "10 мин", "10–15 мин", "12 мин" — take first number
    const m = String(durationStr).match(/(\d+)/);
    if (!m) return 10 * 60;
    return parseInt(m[1], 10) * 60;
  }

  function setupTimerForDrill(drill) {
    const total = parseDurationToSec(drill.duration);
    state.timer = { id: null, remaining: total, total, paused: true };
    updateTimerUI();
  }

  function updateTimerUI() {
    const t = state.timer;
    if (!t) return;
    const m = Math.floor(t.remaining / 60);
    const s = t.remaining % 60;
    const time = `${m}:${String(s).padStart(2, '0')}`;
    if (t.paused && t.remaining === t.total) {
      $timerLabel.textContent = `Запустить таймер · ${time}`;
      $btnTimer.classList.remove('is-running');
    } else if (t.paused) {
      $timerLabel.textContent = `Продолжить · ${time}`;
      $btnTimer.classList.remove('is-running');
    } else {
      $timerLabel.textContent = `Идёт · ${time}`;
      $btnTimer.classList.add('is-running');
    }
  }

  function toggleTimer() {
    const t = state.timer;
    if (!t) return;
    if (t.paused) {
      t.paused = false;
      t.id = setInterval(() => {
        t.remaining = Math.max(0, t.remaining - 1);
        updateTimerUI();
        if (t.remaining === 0) {
          stopTimer();
          notifyTimerDone();
        }
      }, 1000);
    } else {
      clearInterval(t.id);
      t.id = null;
      t.paused = true;
    }
    updateTimerUI();
  }

  function stopTimer() {
    if (state.timer && state.timer.id) {
      clearInterval(state.timer.id);
      state.timer.id = null;
      state.timer.paused = true;
    }
  }

  function notifyTimerDone() {
    // simple in-app feedback; could be replaced by Notification API
    $timerLabel.textContent = 'Время вышло ✓';
    try {
      if (navigator.vibrate) navigator.vibrate([120, 60, 120, 60, 200]);
    } catch {}
    setTimeout(() => updateTimerUI(), 1800);
  }

  // ---------- Routing (hash-based) ----------
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    if (!h) return { name: 'list' };
    if (h === 'glossary') return { name: 'glossary' };
    const [type, id] = h.split('/');
    if (type === 'drill' && id) return { name: 'drill', id };
    if (type === 'glossary') return { name: 'glossary' };
    return { name: 'list' };
  }

  function navigateTo(path) {
    location.hash = '#/' + path;
  }

  function handleRoute() {
    const route = parseHash();
    if (route.name === 'drill') {
      const drill = DRILLS.find((d) => d.id === route.id);
      if (drill) {
        showDetailView(drill);
        return;
      }
    }
    if (route.name === 'glossary') {
      showGlossaryView();
      return;
    }
    showListView();
  }

  function hideAllViews() {
    $listView.hidden = true; $listView.setAttribute('hidden', '');
    $detailView.hidden = true; $detailView.setAttribute('hidden', '');
    $glossView.hidden = true; $glossView.setAttribute('hidden', '');
  }

  function showListView() {
    hideAllViews();
    $listView.hidden = false; $listView.removeAttribute('hidden');
    stopTimer();
    destroyCourt();
    window.scrollTo(0, 0);
  }

  function showDetailView(drill) {
    hideAllViews();
    $detailView.hidden = false; $detailView.removeAttribute('hidden');
    renderDetail(drill);
    window.scrollTo(0, 0);
  }

  function showGlossaryView() {
    hideAllViews();
    $glossView.hidden = false; $glossView.removeAttribute('hidden');
    stopTimer();
    destroyCourt();
    renderGlossary();
    window.scrollTo(0, 0);
  }

  // ---------- Filter UI wiring ----------
  function applyPlayersUI() {
    document.querySelectorAll('.players-btn').forEach((b) => {
      const active = Number(b.dataset.players) === state.players;
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }
  function applyLevelUI() {
    document.querySelectorAll('.level-chip').forEach((c) => {
      c.classList.toggle('is-active', c.dataset.level === state.level);
    });
  }

  document.querySelectorAll('.players-btn').forEach((b) => {
    b.addEventListener('click', () => {
      state.players = Number(b.dataset.players);
      savePref('players', state.players);
      applyPlayersUI();
      renderList();
    });
  });
  document.querySelectorAll('.level-chip').forEach((c) => {
    c.addEventListener('click', () => {
      state.level = c.dataset.level;
      savePref('level', state.level);
      applyLevelUI();
      renderList();
    });
  });

  // ---------- Header buttons ----------
  $btnBack.addEventListener('click', (e) => {
    e.preventDefault();
    if (history.length > 1) history.back();
    else location.hash = '';
  });

  $btnBackGl.addEventListener('click', (e) => {
    e.preventDefault();
    if (history.length > 1) history.back();
    else location.hash = '';
  });

  $btnGloss.addEventListener('click', () => {
    navigateTo('glossary');
  });

  $btnRandom.addEventListener('click', () => {
    const list = getFilteredDrills();
    const pool = list.length ? list : DRILLS;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    navigateTo('drill/' + pick.id);
  });

  $btnFav.addEventListener('click', () => {
    const route = parseHash();
    if (route.name !== 'drill') return;
    if (state.favorites.has(route.id)) {
      state.favorites.delete(route.id);
    } else {
      state.favorites.add(route.id);
    }
    saveFavorites();
    const on = state.favorites.has(route.id);
    $btnFav.setAttribute('aria-pressed', on ? 'true' : 'false');
    $btnFav.classList.toggle('is-on', on);
    if (on && navigator.vibrate) try { navigator.vibrate(10); } catch {}
  });

  $btnTimer.addEventListener('click', toggleTimer);

  // ---------- Init ----------
  window.addEventListener('hashchange', handleRoute);
  applyPlayersUI();
  applyLevelUI();
  renderList();
  handleRoute();

  // ---------- Service worker (PWA) ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
