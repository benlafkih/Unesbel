/* ═══════════════════════════════════════════════
   Orientation Bac Maroc – script.js
   ═══════════════════════════════════════════════ */

'use strict';

/* ─── State ─────────────────────────────────── */
let schoolsData   = [];
let currentResult = null;   // { average, stream, name, regional, national }
let allStudents   = [];     // cached from Firestore

/* ─── DOM Refs ───────────────────────────────── */
const $ = id => document.getElementById(id);

const btnCalculate    = $('btnCalculate');
const btnGoAdmin      = $('btnGoAdmin');
const btnBack         = $('btnBack');
const btnTheme        = $('btnTheme');
const btnThemeAdmin   = $('btnThemeAdmin');
const btnExport       = $('btnExport');
const mainPage        = $('mainPage');
const adminPage       = $('adminPage');
const scoreSection    = $('scoreSection');
const schoolsGrid     = $('schoolsGrid');
const resultsCount    = $('resultsCount');
const searchInput     = $('searchInput');
const filterCategory  = $('filterCategory');
const filterCity      = $('filterCity');
const filterChance    = $('filterChance');
const adminSearch     = $('adminSearch');
const studentsBody    = $('studentsTableBody');
const toast           = $('toast');

/* ═══════════════════════════════════════════════
   1. THEME
   ═══════════════════════════════════════════════ */
function initTheme() {
  const saved = localStorage.getItem('obm-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next    = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('obm-theme', next);
  updateThemeIcon(next);
}
function updateThemeIcon(theme) {
  const icon = theme === 'dark' ? '☀️' : '🌙';
  if (btnTheme)      btnTheme.textContent      = icon;
  if (btnThemeAdmin) btnThemeAdmin.textContent  = icon;
}

btnTheme?.addEventListener('click', toggleTheme);
btnThemeAdmin?.addEventListener('click', toggleTheme);

/* ═══════════════════════════════════════════════
   2. PAGE NAVIGATION
   ═══════════════════════════════════════════════ */
btnGoAdmin?.addEventListener('click', () => {
  mainPage.classList.add('hidden');
  adminPage.classList.add('active');
  loadAdminData();
});
btnBack?.addEventListener('click', () => {
  adminPage.classList.remove('active');
  mainPage.classList.remove('hidden');
});

/* ═══════════════════════════════════════════════
   3. LOAD SCHOOLS DATA
   ═══════════════════════════════════════════════ */
async function loadSchools() {
  try {
    const res  = await fetch('schools.json');
    schoolsData = await res.json();
  } catch (e) {
    showToast('⚠️ Impossible de charger les données des écoles.', 'error');
  }
}

/* ═══════════════════════════════════════════════
   4. CALCULATE
   ═══════════════════════════════════════════════ */
btnCalculate?.addEventListener('click', handleCalculate);

async function handleCalculate() {
  const name     = $('fullName').value.trim();
  const regional = parseFloat($('regionalGrade').value);
  const national = parseFloat($('nationalGrade').value);
  const stream   = $('stream').value;

  /* Validation */
  if (!name)                          return showToast('⚠️ Veuillez saisir votre nom complet.', 'error');
  if (isNaN(regional) || regional < 0 || regional > 20)
                                      return showToast('⚠️ Note régionale invalide (0–20).', 'error');
  if (isNaN(national) || national < 0 || national > 20)
                                      return showToast('⚠️ Note nationale invalide (0–20).', 'error');
  if (!stream)                        return showToast('⚠️ Veuillez sélectionner votre filière.', 'error');

  setLoading(true);

  const average = +(0.25 * regional + 0.75 * national).toFixed(2);

  currentResult = { name, regional, national, average, stream };

  /* Update score UI */
  updateScoreCard(currentResult);

  /* Filter & render schools */
  renderSchools();

  /* Save to Firestore */
  await saveToFirestore({ name, regional, national, average, stream });

  scoreSection.classList.add('visible');
  scoreSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  setLoading(false);
}

function setLoading(on) {
  btnCalculate.classList.toggle('loading', on);
  btnCalculate.disabled = on;
}

/* ═══════════════════════════════════════════════
   5. SCORE CARD & DIAL
   ═══════════════════════════════════════════════ */
function updateScoreCard({ name, regional, national, average, stream }) {
  $('scoreName').textContent   = name;
  $('scoreStream').textContent = streamLabel(stream);
  $('scoreReg').textContent    = regional.toFixed(2);
  $('scoreNat').textContent    = national.toFixed(2);
  $('scoreAvg').textContent    = average.toFixed(2);
  $('scoreDisplay').textContent = average.toFixed(2);

  /* Animate dial */
  const fill   = $('dialFill');
  const r      = 54;
  const circ   = 2 * Math.PI * r;            // ≈ 339.3
  const pct    = Math.min(average / 20, 1);
  const offset = circ - pct * circ;
  // Trigger reflow for animation restart
  fill.style.strokeDashoffset = circ;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fill.style.strokeDashoffset = offset;
    });
  });
}

function streamLabel(s) {
  const map = {
    SM: 'Sciences Mathématiques', SPC: 'Sciences Physiques-Chimie',
    SVT: 'Sciences de la Vie et de la Terre', STE: 'Sciences et Technologies Électriques',
    STM: 'Sciences et Technologies Mécaniques', Eco: 'Sciences Économiques',
    Lettres: 'Lettres et Sciences Humaines'
  };
  return map[s] || s;
}

/* ═══════════════════════════════════════════════
   6. RENDER SCHOOLS
   ═══════════════════════════════════════════════ */
function getChance(average, threshold) {
  if (average >= threshold)              return 'high';
  if (average >= threshold - 0.5)        return 'medium';
  return 'low';
}

function chanceLabel(c) {
  return { high: '🟢 Forte chance', medium: '🟡 Chance moyenne', low: '🔴 Faible chance' }[c];
}
function chanceClass(c) {
  return { high: 'chance-high', medium: 'chance-medium', low: 'chance-low' }[c];
}

function getLatestThreshold(thresholds) {
  const years = Object.keys(thresholds).sort((a,b) => b - a);
  return +thresholds[years[0]];
}

function renderSchools() {
  if (!currentResult) return;

  const { average, stream } = currentResult;
  const searchVal  = (searchInput?.value  || '').toLowerCase();
  const catFilter  = filterCategory?.value || '';
  const cityFilter = filterCity?.value     || '';
  const chFilter   = filterChance?.value   || '';

  /* Filter schools by stream eligibility first */
  let eligible = schoolsData.filter(s => s.streams.includes(stream));

  /* Apply UI filters */
  if (searchVal)  eligible = eligible.filter(s =>
    s.name.toLowerCase().includes(searchVal) ||
    s.shortName.toLowerCase().includes(searchVal) ||
    s.city.toLowerCase().includes(searchVal));
  if (catFilter)  eligible = eligible.filter(s => s.category === catFilter);
  if (cityFilter) eligible = eligible.filter(s => s.city === cityFilter);

  /* Compute chance for each */
  let cards = eligible.map(s => ({
    ...s,
    threshold: getLatestThreshold(s.thresholds),
    chance: getChance(average, getLatestThreshold(s.thresholds))
  }));

  if (chFilter) cards = cards.filter(c => c.chance === chFilter);

  /* Sort: high → medium → low, then by threshold desc */
  const order = { high: 0, medium: 1, low: 2 };
  cards.sort((a,b) => order[a.chance] - order[b.chance] || b.threshold - a.threshold);

  updateResultsCount(cards.length);
  schoolsGrid.innerHTML = cards.length
    ? cards.map(c => schoolCardHTML(c, average)).join('')
    : `<div class="no-results">
         <div class="no-results-icon">🔍</div>
         <h3>Aucune école trouvée</h3>
         <p>Essayez de modifier vos filtres ou votre filière.</p>
       </div>`;

  /* Animate threshold bars after render */
  requestAnimationFrame(() => {
    document.querySelectorAll('.threshold-bar-fill[data-pct]').forEach(el => {
      el.style.width = el.dataset.pct + '%';
    });
  });
}

function schoolCardHTML(school, average) {
  const { name, shortName, city, category, description, thresholds, chance } = school;
  const years = Object.keys(thresholds).sort((a,b) => b - a);
  const maxT  = Math.max(...Object.values(thresholds));

  const thresholdRows = years.map(y => {
    const val = thresholds[y];
    const pct = ((val / 20) * 100).toFixed(1);
    return `
      <div class="threshold-row">
        <span class="threshold-year">${y}</span>
        <div class="threshold-bar-wrap">
          <div class="threshold-bar-fill" data-pct="${pct}" style="width:0%"></div>
        </div>
        <span class="threshold-val">${val}</span>
      </div>`;
  }).join('');

  return `
    <div class="school-card" style="--chance-color: ${chanceColorVar(chance)}">
      <div class="school-card-top">
        <div>
          <div class="school-cat-badge">${category}</div>
        </div>
        <div class="chance-badge ${chanceClass(chance)}">${chanceLabel(chance)}</div>
      </div>

      <div>
        <div class="school-name">${name}</div>
        <div class="school-city">📍 ${city}</div>
      </div>

      <div class="school-desc">${description}</div>

      <div>
        <div class="school-threshold-label">Seuils d'admission (5 ans)</div>
        <div class="threshold-bars">${thresholdRows}</div>
      </div>

      <div class="your-avg-row">
        <span>Votre moyenne</span>
        <span class="avg-num">${average.toFixed(2)} / 20</span>
      </div>
    </div>`;
}

function chanceColorVar(chance) {
  return { high: 'var(--emerald)', medium: 'var(--saffron)', low: 'var(--crimson)' }[chance];
}

function updateResultsCount(n) {
  resultsCount.textContent = `${n} résultat${n !== 1 ? 's' : ''}`;
}

/* ─── Filter listeners ───────────────────────── */
[searchInput, filterCategory, filterCity, filterChance].forEach(el => {
  el?.addEventListener('input', () => { if (currentResult) renderSchools(); });
});

/* ═══════════════════════════════════════════════
   7. FIREBASE – SAVE STUDENT
   ═══════════════════════════════════════════════ */
async function saveToFirestore({ name, regional, national, average, stream }) {
  try {
    if (!window._firebaseReady) {
      showToast('ℹ️ Firebase non configuré – données non sauvegardées.', 'info');
      return;
    }
    const db  = window._db;
    const col = window._collection(db, 'students');
    await window._addDoc(col, {
      fullName:      name,
      regionalGrade: regional,
      nationalGrade: national,
      average:       average,
      stream:        stream,
      createdAt:     window._serverTimestamp()
    });
    showToast('✅ Données sauvegardées avec succès !', 'success');
  } catch (err) {
    console.warn('Firestore save error:', err);
    showToast('⚠️ Erreur de sauvegarde Firebase.', 'error');
  }
}

/* ═══════════════════════════════════════════════
   8. ADMIN DASHBOARD
   ═══════════════════════════════════════════════ */
async function loadAdminData() {
  studentsBody.innerHTML = `<tr><td colspan="7" class="table-loading">
    <div class="loader"></div>
    <div style="color:var(--text-muted);font-size:0.85rem">Chargement…</div>
  </td></tr>`;

  if (!window._firebaseReady) {
    studentsBody.innerHTML = `<tr><td colspan="7" class="table-empty">
      ⚠️ Firebase non configuré. Veuillez remplir la configuration dans index.html.
    </td></tr>`;
    ['statTotal','statCalcs','statAvgMoy','statTopStream'].forEach(id => $(id).textContent = '–');
    return;
  }

  try {
    const db  = window._db;
    const col = window._collection(db, 'students');
    const q   = window._query(col, window._orderBy('createdAt', 'desc'));
    const snap = await window._getDocs(q);

    allStudents = snap.docs.map((doc, i) => ({
      id:     doc.id,
      idx:    i + 1,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || new Date()
    }));

    updateAdminStats(allStudents);
    renderAdminTable(allStudents);
  } catch (err) {
    console.error('Firestore load error:', err);
    studentsBody.innerHTML = `<tr><td colspan="7" class="table-empty">
      ❌ Erreur de chargement : ${err.message}
    </td></tr>`;
  }
}

function updateAdminStats(students) {
  const total = students.length;
  $('statTotal').textContent = total;
  $('statCalcs').textContent = total;

  if (total === 0) {
    $('statAvgMoy').textContent  = '–';
    $('statTopStream').textContent = '–';
    return;
  }

  const avgMoy = (students.reduce((s, st) => s + (st.average || 0), 0) / total).toFixed(2);
  $('statAvgMoy').textContent = avgMoy;

  /* Most common stream */
  const streamCount = {};
  students.forEach(st => {
    streamCount[st.stream] = (streamCount[st.stream] || 0) + 1;
  });
  const topStream = Object.entries(streamCount).sort((a,b) => b[1]-a[1])[0]?.[0] || '–';
  $('statTopStream').textContent = topStream;
}

function renderAdminTable(students) {
  if (!students.length) {
    studentsBody.innerHTML = `<tr><td colspan="7" class="table-empty">Aucun étudiant enregistré.</td></tr>`;
    return;
  }
  studentsBody.innerHTML = students.map((st, i) => `
    <tr>
      <td style="color:var(--text-muted);font-size:0.8rem">${i + 1}</td>
      <td class="table-name">${escHtml(st.fullName || '–')}</td>
      <td><span class="table-stream">${escHtml(st.stream || '–')}</span></td>
      <td>${(st.regionalGrade ?? '–')}</td>
      <td>${(st.nationalGrade ?? '–')}</td>
      <td class="table-avg">${(st.average ?? '–')}</td>
      <td class="table-date">${formatDate(st.createdAt)}</td>
    </tr>`).join('');
}

/* ─── Admin search ───────────────────────────── */
adminSearch?.addEventListener('input', () => {
  const q = adminSearch.value.toLowerCase();
  const filtered = allStudents.filter(s =>
    (s.fullName || '').toLowerCase().includes(q));
  renderAdminTable(filtered);
});

/* ─── CSV Export ─────────────────────────────── */
btnExport?.addEventListener('click', () => {
  if (!allStudents.length) return showToast('⚠️ Aucune donnée à exporter.', 'error');

  const headers = ['#', 'Nom complet', 'Filière', 'Note Régionale', 'Note Nationale', 'Moyenne', 'Date'];
  const rows = allStudents.map((st, i) => [
    i + 1,
    `"${(st.fullName || '').replace(/"/g, '""')}"`,
    st.stream || '',
    st.regionalGrade ?? '',
    st.nationalGrade ?? '',
    st.average ?? '',
    formatDate(st.createdAt)
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `orientation-bac-maroc-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 Export CSV lancé !', 'success');
});

/* ═══════════════════════════════════════════════
   9. TOAST NOTIFICATIONS
   ═══════════════════════════════════════════════ */
let toastTimer;
function showToast(msg, type = 'info') {
  toast.textContent = msg;
  toast.className   = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

/* ═══════════════════════════════════════════════
   10. HELPERS
   ═══════════════════════════════════════════════ */
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function formatDate(d) {
  if (!d) return '–';
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('fr-MA', { day:'2-digit', month:'short', year:'numeric' })
    + ' ' + date.toLocaleTimeString('fr-MA', { hour:'2-digit', minute:'2-digit' });
}

/* ═══════════════════════════════════════════════
   11. INIT
   ═══════════════════════════════════════════════ */
(async function init() {
  initTheme();
  await loadSchools();
})();
