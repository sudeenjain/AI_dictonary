/* ===========================
   LEXIS AI — MAIN APP
   =========================== */

const API = '/api';
let currentToken = localStorage.getItem('lexis_token');
let currentUser = JSON.parse(localStorage.getItem('lexis_user') || 'null');
let currentWord = null;
let isFavorite = false;
let studyFavorites = [];
let studyIndex = 0;
let recognition = null;
let isListening = false;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initVoiceSearch();
  initStudyMode();
  updateAuthUI();
  await loadWordOfTheDay();
  await loadPopularWords();
  setupSearch();

  document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
  document.getElementById('navToggle')?.addEventListener('click', toggleMobileNav);

  if (currentToken) {
    const valid = await verifyToken();
    if (!valid) {
      currentToken = null;
      currentUser = null;
      localStorage.removeItem('lexis_token');
      localStorage.removeItem('lexis_user');
      updateAuthUI();
    }
  }
});

function initTheme() {
  const saved = localStorage.getItem('lexis_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('lexis_theme', next);
}

function toggleMobileNav() {
  const nav = document.querySelector('.nav-actions');
  const btn = document.getElementById('navToggle');
  const open = nav.classList.toggle('nav-open');
  btn.setAttribute('aria-expanded', String(open));
}

// ===== AUTH =====
function updateAuthUI() {
  const authButtons = document.getElementById('authButtons');
  const userMenu = document.getElementById('userMenu');
  const userInitial = document.getElementById('userInitial');

  if (currentToken && currentUser) {
    authButtons.classList.add('hidden');
    userMenu.classList.remove('hidden');
    userInitial.textContent = (currentUser.username || 'U')[0].toUpperCase();
  } else {
    authButtons.classList.remove('hidden');
    userMenu.classList.add('hidden');
  }
}

async function verifyToken() {
  try {
    const res = await fetch(`${API}/auth/verify`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    return data.valid;
  } catch { return false; }
}

async function login(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');

  errorEl.classList.add('hidden');

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.success) {
      currentToken = data.token;
      currentUser = data.user;
      localStorage.setItem('lexis_token', currentToken);
      localStorage.setItem('lexis_user', JSON.stringify(currentUser));
      hideModal('loginModal');
      updateAuthUI();
      showToast(`Welcome back, ${data.user.username}!`, 'success');
    } else {
      errorEl.textContent = data.error || 'Login failed';
      errorEl.classList.remove('hidden');
    }
  } catch (err) {
    errorEl.textContent = 'Network error. Please try again.';
    errorEl.classList.remove('hidden');
  }
}

async function register(e) {
  e.preventDefault();
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value;
  const errorEl = document.getElementById('regError');

  errorEl.classList.add('hidden');

  try {
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.success) {
      currentToken = data.token;
      currentUser = data.user;
      localStorage.setItem('lexis_token', currentToken);
      localStorage.setItem('lexis_user', JSON.stringify(currentUser));
      hideModal('registerModal');
      updateAuthUI();
      showToast(`Welcome to Lexis AI, ${data.user.username}!`, 'success');
    } else {
      errorEl.textContent = data.error || 'Registration failed';
      errorEl.classList.remove('hidden');
    }
  } catch (err) {
    errorEl.textContent = 'Network error. Please try again.';
    errorEl.classList.remove('hidden');
  }
}

function logout() {
  currentToken = null;
  currentUser = null;
  localStorage.removeItem('lexis_token');
  localStorage.removeItem('lexis_user');
  updateAuthUI();
  showView('homeView');
  showToast('Signed out successfully');
}

// ===== SEARCH =====
function setupSearch() {
  const input = document.getElementById('searchInput');
  
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchWord();
  });

  input.addEventListener('input', debounce(handleSuggestions, 300));

  document.getElementById('resultSearchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchWordFromResult();
  });
}

async function searchWord() {
  const input = document.getElementById('searchInput');
  const word = input.value.trim();
  if (!word) return;
  await lookupAndShow(word);
}

async function searchWordFromResult() {
  const input = document.getElementById('resultSearchInput');
  const word = input.value.trim();
  if (!word) return;
  input.value = '';
  await lookupAndShow(word);
}

async function quickSearch(word) {
  document.getElementById('searchInput').value = word;
  await lookupAndShow(word);
}

async function lookupAndShow(word) {
  showLoading(true, `Looking up "${word}"...`);

  try {
    const headers = {};
    if (currentToken) headers['Authorization'] = `Bearer ${currentToken}`;

    const res = await fetch(`${API}/dictionary/lookup/${encodeURIComponent(word)}`, { headers });
    const data = await res.json();

    if (data.success) {
      currentWord = data.data;
      renderResult(data.data);
      showView('resultView');
      document.getElementById('resultSearchInput').value = '';

      if (currentToken) {
        await checkFavorite(word);
      }
    } else {
      showToast(data.error || 'Word not found', 'error');
    }
  } catch (err) {
    showToast('Failed to lookup word. Please try again.', 'error');
  } finally {
    showLoading(false);
  }
}

function renderResult(data) {
  const container = document.getElementById('wordResult');

  const synonymsHtml = (data.synonyms || []).map(w =>
    `<span class="word-tag syn" onclick="quickSearch('${escHtml(w)}')">${escHtml(w)}</span>`
  ).join('');

  const antonymsHtml = (data.antonyms || []).map(w =>
    `<span class="word-tag ant" onclick="quickSearch('${escHtml(w)}')">${escHtml(w)}</span>`
  ).join('');

  const relatedHtml = (data.relatedWords || []).map(w =>
    `<span class="word-tag rel" onclick="quickSearch('${escHtml(w)}')">${escHtml(w)}</span>`
  ).join('');

  const rhymesHtml = (data.rhymes || []).map(w =>
    `<span class="word-tag rhyme" onclick="quickSearch('${escHtml(w)}')">${escHtml(w)}</span>`
  ).join('');

  const adjHtml = (data.adjectives || []).map(w =>
    `<span class="word-tag adj" onclick="quickSearch('${escHtml(w)}')">${escHtml(w)}</span>`
  ).join('');

  const favBtn = currentToken ? `
    <button class="fav-btn" id="favBtn" onclick="toggleFavorite()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
      Save
    </button>
  ` : '';

  container.innerHTML = `
    <div class="result-header">
      <div class="result-word-block">
        <div class="result-word">${escHtml(data.word)}</div>
        <div class="result-meta">
          ${data.partOfSpeech ? `<span class="tag tag-pos">${escHtml(data.partOfSpeech)}</span>` : ''}
          ${data.difficulty ? `<span class="tag tag-difficulty">${escHtml(data.difficulty)}</span>` : ''}
          ${data.category ? `<span class="tag tag-category">${escHtml(data.category)}</span>` : ''}
        </div>
        ${data.pronunciation ? `<div class="pronunciation">/${escHtml(data.pronunciation)}/</div>` : ''}
      </div>
      <div class="result-actions">
        <button class="btn btn-ghost btn-sm speak-btn" type="button" onclick="speakCurrentWord()" title="Listen">🔊</button>
        ${favBtn}
      </div>
    </div>

    <div class="result-grid">
      <div class="result-card full-width">
        <div class="card-label">Definition</div>
        <div class="card-text">${escHtml(data.definition || 'Definition not available')}</div>
      </div>

      ${data.example ? `
      <div class="result-card full-width">
        <div class="card-label">Example</div>
        <div class="card-example">"${escHtml(data.example)}"</div>
      </div>` : ''}

      ${data.etymology ? `
      <div class="result-card">
        <div class="card-label">Etymology</div>
        <div class="card-etymology">${escHtml(data.etymology)}</div>
      </div>` : ''}

      ${synonymsHtml ? `
      <div class="result-card">
        <div class="card-label">Synonyms</div>
        <div class="word-tags">${synonymsHtml}</div>
      </div>` : ''}

      ${antonymsHtml ? `
      <div class="result-card">
        <div class="card-label">Antonyms</div>
        <div class="word-tags">${antonymsHtml}</div>
      </div>` : ''}

      ${relatedHtml ? `
      <div class="result-card">
        <div class="card-label">Related Words</div>
        <div class="word-tags">${relatedHtml}</div>
      </div>` : ''}

      ${rhymesHtml ? `
      <div class="result-card">
        <div class="card-label">Rhymes</div>
        <div class="word-tags">${rhymesHtml}</div>
      </div>` : ''}

      ${adjHtml ? `
      <div class="result-card">
        <div class="card-label">Related Adjectives</div>
        <div class="word-tags">${adjHtml}</div>
      </div>` : ''}

      ${data.wikiExtract ? `
      <div class="result-card full-width">
        <div class="card-label">Wikipedia</div>
        <div class="card-text">${escHtml(data.wikiExtract)}</div>
        ${data.wikiUrl ? `<a class="wiki-link" href="${escHtml(data.wikiUrl)}" target="_blank" rel="noopener noreferrer">Read more</a>` : ''}
      </div>` : ''}
    </div>
  `;
}

function speakCurrentWord() {
  if (!currentWord) return;
  const text = `${currentWord.word}. ${currentWord.partOfSpeech || ''}. ${currentWord.definition}. ${currentWord.example || ''}`;
  speakText(text);
}

function speakText(text) {
  if (!window.speechSynthesis) {
    showToast('Text-to-speech not supported in this browser', 'error');
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.92;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find((v) => v.lang.startsWith('en'));
  if (preferred) utterance.voice = preferred;
  window.speechSynthesis.speak(utterance);
}

function initVoiceSearch() {
  const micBtn = document.getElementById('micBtn');
  const indicator = document.getElementById('listeningIndicator');
  const input = document.getElementById('searchInput');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition || !micBtn) {
    if (micBtn) micBtn.style.display = 'none';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add('active');
    indicator?.classList.remove('hidden');
    if (input) input.placeholder = 'Listening…';
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.trim();
    const word = transcript.split(/\s+/)[0].replace(/[^a-zA-Z'-]/g, '');
    if (word) {
      if (input) input.value = word;
      lookupAndShow(word);
    } else {
      showToast('Could not detect a valid word', 'error');
    }
  };

  recognition.onerror = () => showToast('Microphone error', 'error');
  recognition.onend = stopListening;

  micBtn.addEventListener('click', () => {
    if (isListening) recognition.stop();
    else recognition.start();
  });

  function stopListening() {
    isListening = false;
    micBtn.classList.remove('active');
    indicator?.classList.add('hidden');
    if (input) input.placeholder = 'Search any word...';
  }
}

function initStudyMode() {
  const btn = document.getElementById('studyModeBtn');
  const flashcard = document.getElementById('flashcard');
  document.getElementById('studyPrevBtn')?.addEventListener('click', () => moveStudyCard(-1));
  document.getElementById('studyNextBtn')?.addEventListener('click', () => moveStudyCard(1));
  flashcard?.addEventListener('click', () => flashcard.classList.toggle('is-flipped'));
  flashcard?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      flashcard.classList.toggle('is-flipped');
    }
  });
  btn?.addEventListener('click', openStudyModal);
}

function openStudyModal() {
  if (!studyFavorites.length) {
    showToast('Save words to favorites first', 'error');
    return;
  }
  studyIndex = 0;
  updateStudyCard();
  document.getElementById('flashcard')?.classList.remove('is-flipped');
  showModal('studyModal');
}

function hideStudyModal() {
  hideModal('studyModal');
}

function moveStudyCard(delta) {
  const next = studyIndex + delta;
  if (next < 0 || next >= studyFavorites.length) return;
  studyIndex = next;
  document.getElementById('flashcard')?.classList.remove('is-flipped');
  setTimeout(updateStudyCard, 120);
}

function updateStudyCard() {
  const fav = studyFavorites[studyIndex];
  document.getElementById('studyTotalCards').textContent = studyFavorites.length;
  document.getElementById('studyCurrentIndex').textContent = studyIndex + 1;
  document.getElementById('studyWordFront').textContent = fav.word;
  document.getElementById('studyWordBack').textContent = fav.word;
  document.getElementById('studyDefinitionBack').textContent =
    fav.data?.definition || 'Definition not available.';
}

// ===== WORD OF THE DAY =====
async function loadWordOfTheDay() {
  try {
    const res = await fetch(`${API}/dictionary/word-of-the-day`);
    const data = await res.json();

    if (data.success) {
      const w = data.data;
      document.getElementById('wotdCard').innerHTML = `
        <div class="wotd-word" onclick="quickSearch('${escHtml(w.word)}')">${escHtml(w.word)}</div>
        <div class="wotd-meta">
          ${w.partOfSpeech ? `<span class="wotd-pos">${escHtml(w.partOfSpeech)}</span>` : ''}
          ${w.pronunciation ? `<span class="wotd-pronunciation">/${escHtml(w.pronunciation)}/</span>` : ''}
        </div>
        <div class="wotd-definition">${escHtml(w.definition || '')}</div>
        ${w.example ? `<div class="wotd-example">"${escHtml(w.example)}"</div>` : ''}
        <button class="wotd-btn" onclick="quickSearch('${escHtml(w.word)}')">
          Explore this word
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
      `;
    }
  } catch (err) {
    document.getElementById('wotdCard').innerHTML = `<div class="card-text" style="color:var(--text-3)">Word of the day unavailable</div>`;
  }
}

// ===== POPULAR WORDS =====
async function loadPopularWords() {
  try {
    const res = await fetch(`${API}/dictionary/popular`);
    const data = await res.json();

    const grid = document.getElementById('popularGrid');
    if (data.success && data.popular.length > 0) {
      grid.innerHTML = data.popular.map(p =>
        `<button class="popular-pill" onclick="quickSearch('${escHtml(p.word)}')">
          ${escHtml(p.word)}
          <span class="popular-count">${p.count}</span>
        </button>`
      ).join('');
    } else {
      // Default popular words
      const defaults = ['ephemeral', 'serendipity', 'resilience', 'labyrinth', 'euphoria'];
      grid.innerHTML = defaults.map(w =>
        `<button class="popular-pill" onclick="quickSearch('${w}')">${w}</button>`
      ).join('');
    }
  } catch {
    document.getElementById('popularGrid').innerHTML = '';
  }
}

// ===== SUGGESTIONS =====
async function handleSuggestions(e) {
  const val = e.target.value.trim();
  const container = document.getElementById('searchSuggestions');

  if (val.length < 2) {
    container.classList.add('hidden');
    return;
  }

  // Recent searches as suggestions (if logged in)
  const suggs = container;
  suggs.classList.remove('hidden');
  // We'll just show a "press enter" hint for simplicity
  suggs.innerHTML = `<div class="suggestion-item">
    <span class="suggestion-icon">↵</span>
    Press Enter to lookup "<strong>${escHtml(val)}</strong>"
  </div>`;
}

// ===== FAVORITES =====
async function checkFavorite(word) {
  if (!currentToken) return;
  try {
    const res = await fetch(`${API}/dictionary/favorites/check/${encodeURIComponent(word)}`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    isFavorite = data.isFavorite;
    updateFavBtn();
  } catch {}
}

function updateFavBtn() {
  const btn = document.getElementById('favBtn');
  if (!btn) return;
  if (isFavorite) {
    btn.classList.add('active');
    btn.querySelector('svg').setAttribute('fill', '#e06c75');
    btn.innerHTML = btn.innerHTML.replace('Save', 'Saved');
  } else {
    btn.classList.remove('active');
    btn.querySelector('svg').setAttribute('fill', 'none');
    btn.innerHTML = btn.innerHTML.replace('Saved', 'Save');
  }
}

async function toggleFavorite() {
  if (!currentToken) {
    showModal('loginModal');
    return;
  }
  if (!currentWord) return;

  const word = currentWord.word;
  try {
    if (isFavorite) {
      await fetch(`${API}/dictionary/favorites/${encodeURIComponent(word)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      isFavorite = false;
      showToast('Removed from favorites');
    } else {
      await fetch(`${API}/dictionary/favorites/${encodeURIComponent(word)}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      isFavorite = true;
      showToast('Added to favorites!', 'success');
    }
    updateFavBtn();
  } catch {
    showToast('Failed to update favorites', 'error');
  }
}

async function loadFavorites() {
  if (!currentToken) {
    showModal('loginModal');
    return;
  }

  const list = document.getElementById('favoritesList');
  list.innerHTML = '<div class="card-text" style="color:var(--text-3)">Loading...</div>';

  try {
    const res = await fetch(`${API}/dictionary/favorites`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();

    if (data.favorites && data.favorites.length > 0) {
      studyFavorites = data.favorites.filter((f) => f.data);
      document.getElementById('studyModeBtn')?.classList.remove('hidden');

      list.innerHTML = data.favorites.map(f => {
        const def = f.data ? f.data.definition : '';
        const time = formatTime(f.timestamp);
        return `
          <div class="fav-item" onclick="quickSearch('${escHtml(f.word)}')">
            <div>
              <div class="fav-word">${escHtml(f.word)}</div>
              ${def ? `<div class="fav-def">${escHtml(def)}</div>` : ''}
            </div>
            <span class="item-time">${time}</span>
          </div>
        `;
      }).join('');
    } else {
      studyFavorites = [];
      document.getElementById('studyModeBtn')?.classList.add('hidden');
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">♡</div>
          <div class="empty-title">No favorites yet</div>
          <div class="empty-sub">Search for words and save them here</div>
        </div>
      `;
    }
  } catch {
    list.innerHTML = '<div class="card-text" style="color:var(--red)">Failed to load favorites</div>';
  }
}

// ===== HISTORY =====
async function loadHistory() {
  if (!currentToken) {
    showModal('loginModal');
    return;
  }

  const list = document.getElementById('historyList');
  list.innerHTML = '<div class="card-text" style="color:var(--text-3)">Loading...</div>';

  try {
    const res = await fetch(`${API}/dictionary/history`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();

    if (data.history && data.history.length > 0) {
      list.innerHTML = data.history.map(h => `
        <div class="history-item" onclick="quickSearch('${escHtml(h.word)}')">
          <div class="history-word">${escHtml(h.word)}</div>
          <span class="item-time">${formatTime(h.timestamp)}</span>
        </div>
      `).join('');
    } else {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">◷</div>
          <div class="empty-title">No history yet</div>
          <div class="empty-sub">Your search history will appear here</div>
        </div>
      `;
    }
  } catch {
    list.innerHTML = '<div class="card-text" style="color:var(--red)">Failed to load history</div>';
  }
}

async function clearHistory() {
  if (!currentToken) return;
  try {
    await fetch(`${API}/dictionary/history`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    showToast('History cleared');
    loadHistory();
  } catch {
    showToast('Failed to clear history', 'error');
  }
}

// ===== VIEWS =====
function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  window.scrollTo(0, 0);

  if (viewId === 'favoritesView') loadFavorites();
  if (viewId === 'historyView') loadHistory();
  if (viewId === 'homeView') loadPopularWords();
}

// ===== MODALS =====
function showModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function hideModal(id) {
  document.getElementById(id).classList.add('hidden');
  // Clear errors
  const errEl = document.querySelector(`#${id} .form-error`);
  if (errEl) errEl.classList.add('hidden');
}

function switchModal(fromId, toId) {
  hideModal(fromId);
  showModal(toId);
}

// ===== LOADING =====
let loadingMessages = [
  'Consulting AI intelligence...',
  'Exploring etymology...',
  'Gathering synonyms...',
  'Building context...'
];

function showLoading(show, msg) {
  const overlay = document.getElementById('loadingOverlay');
  const msgEl = document.getElementById('loadingMsg');

  if (show) {
    overlay.classList.remove('hidden');
    if (msg) msgEl.textContent = msg;

    // Cycle messages
    let i = 0;
    window._loadingInterval = setInterval(() => {
      i = (i + 1) % loadingMessages.length;
      msgEl.textContent = loadingMessages[i];
    }, 1500);
  } else {
    overlay.classList.add('hidden');
    clearInterval(window._loadingInterval);
  }
}

// ===== TOAST =====
let toastTimeout;
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ===== UTILS =====
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
  return d.toLocaleDateString();
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Close suggestions when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-container')) {
    document.getElementById('searchSuggestions').classList.add('hidden');
  }
});

// Close modals on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
  }
});
