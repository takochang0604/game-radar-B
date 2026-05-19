/**
 * 遊戲產品競爭力分析 — 前端應用邏輯
 * 從 data.js 中的 APP_DATA 全域變數讀取資料（不需伺服器）
 */

// ============ 平台 Icon ============
const ICON_ANDROID = '<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align:-2px;fill:#3DDC84"><path d="M17.6 11.5c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v4.9c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-4.9zm-14.4 0c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v4.9c0 .9-.7 1.6-1.6 1.6S3.2 17.3 3.2 16.4v-4.9zm3.3-.6h11v7.2c0 .9-.7 1.6-1.6 1.6H15v2.7c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-2.7h-1.6v2.7c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-2.7h-.9c-.9 0-1.6-.7-1.6-1.6v-7.2zM16.1 4l1.3-2.1c.1-.2.1-.5-.1-.6s-.5-.1-.6.1L15.3 3.6c-.9-.4-2-.7-3.3-.7s-2.3.2-3.3.7L7.4 1.4c-.2-.2-.4-.3-.6-.1s-.3.4-.1.6L8 4C5.9 5.1 4.5 7.2 4.5 9.6V10h15V9.6c0-2.4-1.4-4.5-3.4-5.6zM9 7.5c-.4 0-.8-.3-.8-.8s.3-.8.8-.8.8.3.8.8-.4.8-.8.8zm6 0c-.4 0-.8-.3-.8-.8s.3-.8.8-.8.8.3.8.8-.4.8-.8.8z"/></svg>';
const ICON_IOS = '<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-1px;fill:#999"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>';

// ============ 設定 ============
const MARKETS = [
  { code: 'us', name: '美國', flag: '🇺🇸', hasGooglePlay: true },
  { code: 'jp', name: '日本', flag: '🇯🇵', hasGooglePlay: true },
  { code: 'kr', name: '韓國', flag: '🇰🇷', hasGooglePlay: true },
  { code: 'cn', name: '中國', flag: '🇨🇳', hasGooglePlay: false },
  { code: 'tw', name: '台灣', flag: '🇹🇼', hasGooglePlay: true },
  { code: 'th', name: '泰國', flag: '🇹🇭', hasGooglePlay: true },
  { code: 'vn', name: '越南', flag: '🇻🇳', hasGooglePlay: true },
  { code: 'ph', name: '菲律賓', flag: '🇵🇭', hasGooglePlay: true },
];

// ============ 狀態 ============
let state = {
  dhMarket: 'all',       // 黑馬 Tab 專用市場
  rankMarket: 'tw',      // 排行榜 Tab 專用市場
  trackedMarket: 'all',  // 追蹤 Tab 專用市場
  platform: 'ios',
  chartType: 'topfree',
  dhChartFilter: 'all',
  selectedDate: null,
  snapshots: {},
  darkhorses: [],
  analysis: {},
  reports: {},
  availableDates: [],
  trendApps: [],
  trendPreset: 'top10',
  dhReportFilter: 'all',
  trackedReportFilter: 'all',
  activeTab: 'darkhorse',
  rankPage: 1,
  rankPageSize: 50,
};

let trendChart = null;
let modalChart = null;

// ============ 黑馬追蹤（Firestore 同步 + localStorage 快取）============
const TRACKED_KEY = 'gameRadar_trackedDarkhorses';
let _trackedList = null; // 記憶體快取
let _trackedReady = false;

function getTrackedList() {
  if (_trackedList) return _trackedList;
  try { _trackedList = JSON.parse(localStorage.getItem(TRACKED_KEY)) || []; } catch { _trackedList = []; }
  return _trackedList;
}
function saveTrackedListLocal(list) {
  _trackedList = list;
  localStorage.setItem(TRACKED_KEY, JSON.stringify(list));
}
function isTracked(appId) { return getTrackedList().some(t => t.appId === appId); }

/**
 * 起始同步：從 Firestore 拉取追蹤清單，與本機 localStorage 合併
 */
async function initTrackedSync() {
  if (!state.firebaseMode) return;
  try {
    const { loadTrackedGames } = await import('./firebase-data.js');
    const remoteList = await loadTrackedGames(true); // forceRefresh
    const localList = getTrackedList();

    // 合併：以 appId 去重，遠端優先
    const merged = new Map();
    localList.forEach(g => merged.set(g.appId, g));
    remoteList.forEach(g => merged.set(g.appId, g)); // 遠端覆蓋本機
    const mergedList = Array.from(merged.values());

    saveTrackedListLocal(mergedList);
    _trackedReady = true;

    // 如果合併後有差異，回寫 Firestore
    if (mergedList.length !== remoteList.length) {
      const { saveTrackedGames } = await import('./firebase-data.js');
      await saveTrackedGames(mergedList);
    }

    renderTracked();
  } catch (err) {
    console.warn('追蹤同步失敗，使用 localStorage:', err);
    _trackedReady = true;
  }
}

/** Firestore 非同步儲存（火忘即發，UI 不等待） */
function saveTrackedToFirestore(list) {
  if (!state.firebaseMode) return;
  import('./firebase-data.js').then(({ saveTrackedGames }) => {
    saveTrackedGames(list).catch(err => console.warn('Firestore 儲存失敗:', err));
  });
}

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', () => {
  initControls();
  initTabs();
  initModal();
  initDateSelector();
  initScoreInfo();
  loadData();
});


// ============ Controls — 各 tab 獨立篩選器 ============
function initControls() {
  // ---- 黑馬 tab 篩選器 ----
  buildMarketPills('dhMarketPills', true, (val) => { state.dhMarket = val; renderActive(); });

  // ---- 追蹤 tab 篩選器 ----
  buildMarketPills('trackedMarketPills', true, (val) => { state.trackedMarket = val; renderTracked(); });

  // ---- 排行榜 tab 篩選器 ----
  buildMarketPills('rankMarketPills', false, (val) => { state.rankMarket = val; state.rankPage = 1; renderActive(); });
  buildPlatformPills('rankPlatformPills', (val) => { state.platform = val; state.rankPage = 1; renderActive(); });
  document.querySelectorAll('#rankChartPills .pill').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#rankChartPills .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.chartType = btn.dataset.chart;
      state.rankPage = 1;
      renderActive();
    };
  });
}

// ---- 已評測篩選 ----
function setDhReportFilter(val) {
  state.dhReportFilter = val;
  document.querySelectorAll('[data-dh-report]').forEach(b => b.classList.toggle('active', b.dataset.dhReport === val));
  renderDarkhorses();
}
function setTrackedReportFilter(val) {
  state.trackedReportFilter = val;
  document.querySelectorAll('[data-tracked-report]').forEach(b => b.classList.toggle('active', b.dataset.trackedReport === val));
  renderTracked();
}

function buildMarketPills(containerId, hasAll, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (hasAll) {
    const allBtn = document.createElement('button');
    allBtn.className = 'pill active';
    allBtn.dataset.market = 'all';
    allBtn.innerHTML = '<span class="flag">🌍</span>全部';
    allBtn.onclick = () => { pillSelect(container, allBtn); onChange('all'); };
    container.appendChild(allBtn);
  }
  MARKETS.forEach(m => {
    const btn = document.createElement('button');
    btn.className = `pill ${!hasAll && m.code === 'tw' ? 'active' : ''}`;
    btn.dataset.market = m.code;
    btn.innerHTML = `<span class="flag">${m.flag}</span>${m.name}`;
    btn.onclick = () => { pillSelect(container, btn); onChange(m.code); };
    container.appendChild(btn);
  });
}

function buildPlatformPills(containerId, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const ICON_IOS_BTN = `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-1px;fill:currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg> iOS`;
  const ICON_AND_BTN = `<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align:-2px;fill:#3DDC84"><path d="M17.6 11.5c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v4.9c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-4.9zm-14.4 0c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v4.9c0 .9-.7 1.6-1.6 1.6S3.2 17.3 3.2 16.4v-4.9zm3.3-.6h11v7.2c0 .9-.7 1.6-1.6 1.6H15v2.7c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-2.7h-1.6v2.7c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-2.7h-.9c-.9 0-1.6-.7-1.6-1.6v-7.2zM16.1 4l1.3-2.1c.1-.2.1-.5-.1-.6s-.5-.1-.6.1L15.3 3.6c-.9-.4-2-.7-3.3-.7s-2.3.2-3.3.7L7.4 1.4c-.2-.2-.4-.3-.6-.1s-.3.4-.1.6L8 4C5.9 5.1 4.5 7.2 4.5 9.6V10h15V9.6c0-2.4-1.4-4.5-3.4-5.6zM9 7.5c-.4 0-.8-.3-.8-.8s.3-.8.8-.8.8.3.8.8-.4.8-.8.8zm6 0c-.4 0-.8-.3-.8-.8s.3-.8.8-.8.8.3.8.8-.4.8-.8.8z"/></svg> Android`;

  const iosBtn = document.createElement('button');
  iosBtn.className = 'pill active';
  iosBtn.innerHTML = ICON_IOS_BTN;
  iosBtn.onclick = () => { pillSelect(container, iosBtn); onChange('ios'); };
  container.appendChild(iosBtn);

  const andBtn = document.createElement('button');
  andBtn.className = 'pill';
  andBtn.innerHTML = ICON_AND_BTN;
  andBtn.onclick = () => { pillSelect(container, andBtn); onChange('android'); };
  container.appendChild(andBtn);
}

function pillSelect(container, activeBtn) {
  container.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  activeBtn.classList.add('active');
}

// ============ Tabs ============
function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const tabId = tab.dataset.tab;
      document.getElementById(`tab-${tabId}`).classList.add('active');
      state.activeTab = tabId;
      renderStats();
      renderActive();
    };
  });
}

// ============ 黑馬偵測說明（ⓘ 按鈕彈窗）============
function initScoreInfo() {
  const btn = document.getElementById('scoreInfoBtn');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const existing = document.querySelector('.score-info-popup');
    if (existing) { existing.remove(); document.querySelector('.score-overlay')?.remove(); return; }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay score-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000';
    overlay.onclick = () => { popup.remove(); overlay.remove(); };

    const popup = document.createElement('div');
    popup.className = 'score-info-popup';
    popup.innerHTML = `
      <button class="close-btn" onclick="this.parentElement.remove();document.querySelector('.score-overlay')?.remove()">&times;</button>
      <h3 style="font-size:17px;margin-bottom:16px;display:flex;align-items:center;gap:8px">🐴 什麼是黑馬遊戲？</h3>

      <p style="font-size:13px;line-height:1.7;color:var(--text-secondary);margin-bottom:20px">
        系統每天自動追蹤 <strong style="color:var(--text-primary)">8 個市場</strong>（美、日、韓、中、台、泰、越、菲）的 iOS 與 Android 遊戲排行榜（免費下載＋營收），從各市場 Top 100 中，找出近 7 天內<strong style="color:var(--text-primary)">排名異常竄升</strong>的遊戲。
      </p>

      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border-glass);border-radius:var(--radius-md);padding:16px;margin-bottom:16px">
        <h4 style="font-size:14px;font-weight:700;color:var(--accent-cyan);margin-bottom:10px">怎樣算黑馬？</h4>
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">符合以下<strong>任一條件</strong>就會被標記：</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--text-secondary)">
            <span style="font-size:15px;flex-shrink:0">🚀</span>
            <div><strong style="color:var(--text-primary)">排名急升</strong><span style="color:var(--text-muted);margin-left:4px">—</span> 7 天內排名上升 30 名以上</div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--text-secondary)">
            <span style="font-size:15px;flex-shrink:0">🆕</span>
            <div><strong style="color:var(--text-primary)">新進榜</strong><span style="color:var(--text-muted);margin-left:4px">—</span> 之前不在榜上，突然衝進 Top 30</div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--text-secondary)">
            <span style="font-size:15px;flex-shrink:0">📈</span>
            <div><strong style="color:var(--text-primary)">持續攀升</strong><span style="color:var(--text-muted);margin-left:4px">—</span> 連續 5 天以上排名一直往上爬</div>
          </div>
        </div>
        <p style="color:var(--text-muted);font-size:11px;margin-top:10px;padding-top:8px;border-top:1px solid var(--border-glass)">
          評分低於 3.5、排名不在 Top 50 以內的遊戲會自動排除。<br>同一款遊戲在多個國家同時出現時，會合併成一張卡片。
        </p>
      </div>

      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border-glass);border-radius:var(--radius-md);padding:16px;margin-bottom:16px">
        <h4 style="font-size:14px;font-weight:700;color:var(--accent-yellow);margin-bottom:10px">信心分數 ⚡ 是什麼？</h4>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">
          每張卡片上的 <strong style="color:var(--accent-yellow)">⚡ 數字</strong> 代表這款遊戲<strong style="color:var(--text-primary)">多值得關注</strong>：
        </p>
        <div style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--text-secondary);padding-left:4px">
          <div style="display:flex;align-items:center;gap:6px"><span style="color:var(--accent-cyan)">▸</span> 觸發越多條件、排名升幅越大 → 分數越高</div>
          <div style="display:flex;align-items:center;gap:6px"><span style="color:var(--accent-cyan)">▸</span> 排名越前面（例如 Top 5）→ 額外加分</div>
          <div style="display:flex;align-items:center;gap:6px"><span style="color:var(--accent-cyan)">▸</span> 在大市場（美、日）出現 → 額外加分</div>
          <div style="display:flex;align-items:center;gap:6px"><span style="color:var(--accent-cyan)">▸</span> 同時出現在多個國家 → 更值得注意</div>
        </div>
      </div>

      <div style="display:flex;gap:12px;justify-content:center;padding:10px 0 0">
        <div style="display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2)">
          <span style="font-size:14px">📌</span>
          <span style="font-size:12px;font-weight:600;color:var(--accent-green)">≥ 3.0 值得留意</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;background:rgba(234,179,8,0.1);border:1px solid rgba(234,179,8,0.2)">
          <span style="font-size:14px">🔥</span>
          <span style="font-size:12px;font-weight:600;color:var(--accent-yellow)">≥ 5.0 建議深入</span>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.appendChild(popup);
  });
}

// ============ Modal ============
function initModal() {
  document.getElementById('modalClose').onclick = closeModal;
  document.getElementById('analysisModal').onclick = (e) => {
    if (e.target === e.currentTarget) closeModal();
  };
  // #8 ESC 鍵關閉 Modal（WCAG 無障礙標準）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}
function closeModal() { document.getElementById('analysisModal').classList.remove('active'); }

// ============ 日期選擇器 ============
function initDateSelector() {
  const select = document.getElementById('dateSelect');
  const btnPrev = document.getElementById('btnPrevDate');
  const btnNext = document.getElementById('btnNextDate');

  select.onchange = () => {
    state.selectedDate = select.value;
    state.rankPage = 1;
    renderActive();
  };
  btnPrev.onclick = () => {
    const idx = state.availableDates.indexOf(state.selectedDate);
    if (idx > 0) {
      state.selectedDate = state.availableDates[idx - 1];
      select.value = state.selectedDate;
      state.rankPage = 1;
      renderActive();
    }
  };
  btnNext.onclick = () => {
    const idx = state.availableDates.indexOf(state.selectedDate);
    if (idx < state.availableDates.length - 1) {
      state.selectedDate = state.availableDates[idx + 1];
      select.value = state.selectedDate;
      state.rankPage = 1;
      renderActive();
    }
  };
}

function populateDateSelector() {
  const select = document.getElementById('dateSelect');
  select.innerHTML = state.availableDates.map(d => {
    const isToday = d === state.availableDates[state.availableDates.length - 1];
    const label = isToday ? `${d} (最新)` : d;
    return `<option value="${d}"${d === state.selectedDate ? ' selected' : ''}>${label}</option>`;
  }).join('');
}

// ============ 載入資料（Firebase 優先，data.js fallback）============
async function loadData() {
  // Firebase 模式
  if (typeof FIREBASE_MODE !== 'undefined' && FIREBASE_MODE) {
    try {
      updateStatus('⏳ 正在從 Firebase 載入...');
      const { loadInitialData } = await import('./firebase-data.js');
      const data = await loadInitialData();
      state.availableDates = data.availableDates || [];
      state.snapshots = {}; // 快照按需載入
      state.darkhorses = data.darkhorses || [];
      state.analysis = data.analysis || {};
      state.reports = data.reports || {};
      state.firebaseMode = true;

      state.selectedDate = state.availableDates[state.availableDates.length - 1] || null;
      populateDateSelector();
      updateStatus();
      renderAll();

      // 同步追蹤清單（Firestore ↔ localStorage）
      initTrackedSync();

      // 背景預載所有市場快照，讓「今日更新」數字盡快顯示
      if (state.selectedDate) {
        preloadAllMarketSnapshots(state.selectedDate);
      }

      return;
    } catch (err) {
      console.error('Firebase 載入失敗，嘗試 data.js fallback:', err);
    }
  }

  // data.js fallback 模式
  if (typeof APP_DATA === 'undefined' || APP_DATA === null) {
    updateStatus('❌ 找不到資料 — 請先執行 npm run upload 或 npm run build');
    return;
  }

  state.availableDates = APP_DATA.availableDates || [];
  state.snapshots = APP_DATA.snapshots || {};
  state.darkhorses = APP_DATA.darkhorses || [];
  state.analysis = APP_DATA.analysis || {};
  state.reports = APP_DATA.reports || {};
  state.firebaseMode = false;

  state.selectedDate = state.availableDates[state.availableDates.length - 1] || null;
  populateDateSelector();
  updateStatus();
  renderAll();
}

/**
 * 確保指定日期+市場的快照已載入（Firebase 模式按需載入）
 */
async function ensureSnapshotLoaded(date, market) {
  if (!date || !state.firebaseMode) return;
  if (state.snapshots[date] && state.snapshots[date][market]) return;

  const { loadMarketSnapshots } = await import('./firebase-data.js');
  const hasGP = market !== 'cn';
  const platforms = hasGP ? ['android', 'ios'] : ['ios'];
  const chartTypes = ['topfree', 'grossing'];

  const result = await loadMarketSnapshots(date, market, platforms, chartTypes);
  if (!state.snapshots[date]) state.snapshots[date] = {};
  state.snapshots[date][market] = result;
}

/**
 * 背景預載所有市場快照（用於 Firebase 模式，讓「今日更新」統計盡快顯示）
 */
async function preloadAllMarketSnapshots(date) {
  const promises = MARKETS.map(m => ensureSnapshotLoaded(date, m.code).catch(() => {}));
  await Promise.all(promises);
  renderStats(); // 全部載完後刷新統計數字
}

function updateStatus(msg) {
  const el = document.getElementById('statusText');
  if (msg) { el.textContent = msg; return; }
  const days = state.availableDates.length;
  if (days === 0) {
    el.textContent = '尚無資料 — 請執行 npm run daily';
  } else {
    const latest = state.availableDates[state.availableDates.length - 1];
    const mode = state.firebaseMode ? '🔥' : '📦';
    el.textContent = `${mode} 最新: ${latest} | 已累積 ${days} 天`;
  }
}

// ============ 渲染 ============
function renderAll() {
  renderStats();
  renderDarkhorses();
  renderRankingsAsync();
  renderTracked();
  renderReportsTab();
}

// ★ 只渲染當前可見 Tab（效能優化）
function renderActive() {
  renderStats();
  switch (state.activeTab) {
    case 'darkhorse': renderDarkhorses(); break;
    case 'tracked': renderTracked(); break;
    case 'reports': renderReportsTab(); break;
    case 'rankings': renderRankingsAsync(); break;
  }
}

function renderStats() {
  const dates = [...state.availableDates].sort();
  const snapEl = document.getElementById('statSnapshots');
  const snapSubEl = document.getElementById('statSnapshotsSub');
  if (dates.length > 0) {
    const first = dates[0].substring(5);
    const last = dates[dates.length - 1].substring(5);
    if (snapEl) snapEl.textContent = `${first}～${last}`;
    if (snapSubEl) snapSubEl.textContent = `共 ${dates.length} 天快照`;
  }

  // 去重邏輯：以名稱為基礎，使其與下方卡片合併後的數量一致
  const getUniqueCount = (dhList) => {
    const seen = new Set();
    dhList.forEach(dh => {
      const name = (dh.name || '').split(/\s*[:\-\|]/)[0].toLowerCase().trim();
      seen.add(name);
    });
    return seen.size;
  };

  // 今日新黑馬
  const newEntryList = state.darkhorses.filter(dh => dh.triggers?.some(t => t.strategy === 'new_entry'));
  const statNewDhEl = document.getElementById('statNewDh');
  if (statNewDhEl) statNewDhEl.textContent = getUniqueCount(newEntryList);

  // 已評測黑馬
  const reportedList = state.darkhorses.filter(dh => !!findReport(dh.name));
  const statAppsEl = document.getElementById('statApps');
  if (statAppsEl) statAppsEl.textContent = getUniqueCount(reportedList);
  const statAppsSub = document.getElementById('statAppsSub');
  
  const totalUnique = getUniqueCount(state.darkhorses);
  if (statAppsSub) statAppsSub.textContent = `/ ${totalUnique} 匹`;

  // 偵測黑馬
  const statDhEl = document.getElementById('statDarkhorses');
  if (statDhEl) statDhEl.textContent = totalUnique;

  // dhCount 會在 renderDarkhorses 時被覆寫，這裡可以先給個預設值
  const dhCountEl = document.getElementById('dhCount');
  if (dhCountEl) dhCountEl.textContent = totalUnique;
}

function renderDarkhorses() {
  const grid = document.getElementById('darkhorseGrid');
  const searchTerm = (document.getElementById('dhSearch')?.value || '').toLowerCase().trim();

  let filtered = state.darkhorses.filter(dh => {
    // 搜尋篩選
    if (searchTerm) {
      const nameMatch = dh.name.toLowerCase().includes(searchTerm);
      const devMatch = (dh.developer || '').toLowerCase().includes(searchTerm);
      if (!nameMatch && !devMatch) return false;
    }
    // 市場篩選：支援新的 markets 陣列
    if (state.dhMarket !== 'all') {
      const dhMarkets = dh.markets ? dh.markets.map(m => m.code) : [dh.market];
      if (!dhMarkets.includes(state.dhMarket)) return false;
    }
    // 已評測篩選（只過濾黑馬中有報告的）
    if (state.dhReportFilter === 'reported' && !findReport(dh.name)) return false;
    if (state.dhReportFilter === 'unreported' && findReport(dh.name)) return false;
    if (state.dhReportFilter === 'new_entry' && !dh.triggers?.some(t => t.strategy === 'new_entry')) return false;
    return true;
  });

  // ============ 跨平台/跨排行/跨市場合併 ============
  const mergedMap = new Map();

  function getMergeKey(dh) {
    // 取冒號/破折號前的主標題，避免雙平台副標題不同導致無法合併
    const coreName = dh.name.split(/\s*[:\uff1a\-\u2014\u2013\|]\s*/)[0];
    return coreName.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '').substring(0, 30);
  }

  for (const dh of filtered) {
    let targetKey = null;
    const nameKey = getMergeKey(dh);
    const dhDev = (dh.developer || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const [existingKey, existingDh] of mergedMap) {
      const exNameKey = getMergeKey(existingDh);
      const exDev = (existingDh.developer || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const sameName = exNameKey === nameKey;
      const sameDev = exDev && dhDev && (exDev.includes(dhDev) || dhDev.includes(exDev));
      
      // 若名稱相同且開發商相似（或有一方缺開發商），則視為同遊戲跨市場/平台
      if (sameName && (!exDev || !dhDev || sameDev)) {
        targetKey = existingKey;
        break;
      }
    }

    if (targetKey) {
      const existing = mergedMap.get(targetKey);
      // 合併平台
      if (!existing._platforms.includes(dh.platform)) existing._platforms.push(dh.platform);
      
      // 合併市場陣列 (markets)
      if (dh.markets) {
        if (!existing.markets) existing.markets = [...dh.markets];
        else {
          dh.markets.forEach(m => {
            if (!existing.markets.find(em => em.code === m.code)) existing.markets.push(m);
          });
        }
      } else if (dh.market) {
        if (!existing.markets) existing.markets = [{ code: dh.market, flag: dh.marketFlag, name: dh.marketName, rank: dh.currentRank }];
        else if (!existing.markets.find(em => em.code === dh.market)) existing.markets.push({ code: dh.market, flag: dh.marketFlag, name: dh.marketName, rank: dh.currentRank });
      }

      // 合併排行資訊
      const chartLabel = dh.chartType === 'grossing' ? '營收' : '免費';
      if (!existing._chartRanks.find(cr => cr.chartLabel === chartLabel && cr.platform === dh.platform && cr.marketFlag === (dh.marketFlag || ''))) {
        existing._chartRanks.push({ chartLabel, platform: dh.platform, rank: dh.currentRank, marketFlag: dh.marketFlag || '' });
      }
      // 取較高信心分數
      if ((dh.confidenceScore || 0) > (existing.confidenceScore || 0)) {
        existing.confidenceScore = dh.confidenceScore;
      }
      // 合併 triggers
      const srcChartLabel = dh.chartType === 'grossing' ? '營收' : '免費';
      const srcPlatformName = dh.platform === 'android' ? 'Android' : 'iOS';
      const srcPlatform = dh.platform;
      const srcMarketPrefix = dh.markets && dh.markets.length > 1 ? `${dh.marketFlag} ` : '';
      dh.triggers.forEach(t => {
        let triggerSrc = `${srcMarketPrefix}${srcPlatformName} ${srcChartLabel}`;
        if (t.label && (t.label.includes('雙榜') || t.detail?.includes('雙榜'))) triggerSrc = `${srcMarketPrefix}雙榜`;
        if (t.label && (t.label.includes('雙平台') || t.detail?.includes('雙平台'))) triggerSrc = `${srcMarketPrefix}雙平台`;
        const tagged = { ...t, _src: triggerSrc, _srcPlatform: srcPlatform };
        if (!existing.triggers.find(et => et.detail === t.detail && et._src === triggerSrc && et._srcPlatform === srcPlatform)) {
          existing.triggers.push(tagged);
        }
      });
      // 合併 rankHistory
      if (dh.rankHistory) {
        if (!existing._rankHistoryByLine) existing._rankHistoryByLine = {};
        const lineKey = `${dh.platform}_${dh.chartType}`;
        if (!existing._rankHistoryByLine[lineKey]) {
          existing._rankHistoryByLine[lineKey] = { platform: dh.platform, chartType: dh.chartType, data: [] };
        }
        dh.rankHistory.forEach(h => {
          if (!existing._rankHistoryByLine[lineKey].data.find(eh => eh.date === h.date)) {
            existing._rankHistoryByLine[lineKey].data.push(h);
          }
        });
      }
    } else {
      const key = dh.appId + '_' + dh.platform + '_' + dh.market;
      const chartLabel = dh.chartType === 'grossing' ? '營收' : '免費';
      const platformName = dh.platform === 'android' ? 'Android' : 'iOS';
      const marketPrefix = dh.markets && dh.markets.length > 1 ? `${dh.marketFlag} ` : '';
      const taggedTriggers = dh.triggers.map(t => {
        let src = `${marketPrefix}${platformName} ${chartLabel}`;
        if (t.label && (t.label.includes('雙榜') || t.detail?.includes('雙榜'))) src = `${marketPrefix}雙榜`;
        if (t.label && (t.label.includes('雙平台') || t.detail?.includes('雙平台'))) src = `${marketPrefix}雙平台`;
        return { ...t, _src: src, _srcPlatform: dh.platform };
      });
      
      const initialMarkets = dh.markets ? [...dh.markets] : (dh.market ? [{ code: dh.market, flag: dh.marketFlag, name: dh.marketName, rank: dh.currentRank }] : []);
      
      mergedMap.set(key, {
        ...dh,
        markets: initialMarkets,
        triggers: taggedTriggers,
        _platforms: [dh.platform],
        _chartRanks: [{ chartLabel, platform: dh.platform, rank: dh.currentRank, marketFlag: dh.marketFlag || '' }],
        _rankHistoryByLine: dh.rankHistory ? {
          [`${dh.platform}_${dh.chartType}`]: { platform: dh.platform, chartType: dh.chartType, data: dh.rankHistory }
        } : {}
      });
    }
  }

  filtered = Array.from(mergedMap.values());
  filtered.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

  // 後處理：多國卡片的 trigger 若沒有國旗，補上主市場旗幟
  for (const card of filtered) {
    if (!card.markets || card.markets.length <= 1) continue;
    const flag = card.marketFlag || '';
    if (!flag) continue;
    card.triggers = card.triggers.map(t => {
      // 已經有國旗 emoji 開頭的跳過
      if (/^[\u{1F1E0}-\u{1F1FF}]/u.test(t._src || '')) return t;
      return { ...t, _src: `${flag} ${t._src || ''}`.trim() };
    });
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><p>${state.darkhorses.length === 0
      ? '尚無黑馬資料。請累積數天排行數據後，執行 <code>npm run analyze</code>。'
      : searchTerm ? `找不到「${searchTerm}」相關的黑馬。` : '當前篩選條件下無黑馬。'
      }</p></div>`;
    document.getElementById('dhCount').textContent = '0';
    return;
  }

  document.getElementById('dhCount').textContent = filtered.length;

  grid.innerHTML = filtered.map((dh, idx) => {

    const hasAnalysis = !!state.analysis[dh.appId];
    const hasReport = !!findReport(dh.name);
    const reportBadge = hasReport
      ? '<span class="dh-tag report-ready" title="已有評測報告">📄 已評測</span>'
      : '';
    const scoreBadge = dh.confidenceScore
      ? `<span class="dh-confidence" title="信心分數：越高越可能是真正的黑馬">${dh.confidenceScore.toFixed(1)}⚡</span>`
      : '';
    // 黑馬分類標籤
    const triggerTypes = dh.triggers.map(t => t.strategy);
    const isRetained = !!dh._retained;
    const classBadge = isRetained
      ? `<span class="dh-tag dh-class-watch" title="首偵日：${dh._retainedFrom || '未知'}，仍在榜上持續觀察">👀 觀察中</span>`
      : triggerTypes.includes('new_entry')
        ? '<span class="dh-tag dh-class-new" title="首次進入排行榜">🆕 新進</span>'
        : triggerTypes.includes('growth_multiplier')
          ? '<span class="dh-tag dh-class-accel" title="排名加速上升中">🔥 加速中</span>'
          : triggerTypes.includes('consecutive_rise') || triggerTypes.includes('rank_jump')
            ? '<span class="dh-tag dh-class-rising" title="持續上升中">📈 上升中</span>'
            : '';
    // 上架日期
    const rawReleased = state.analysis[dh.appId]?.detail?.released || '';
    const releasedDate = rawReleased ? (() => { try { const d = new Date(rawReleased); return isNaN(d) ? rawReleased : d.toISOString().split('T')[0]; } catch { return rawReleased; } })() : '';
    // 多市場標籤
    const marketTags = dh.markets && dh.markets.length > 1
      ? dh.markets.map(m => `<span class="dh-tag market" title="${m.name} #${m.rank}">${m.flag}</span>`).join('')
      : `<span class="dh-tag market">${dh.marketFlag} ${dh.marketName}</span>`;
    // 平台顯示（合併後可能多平台）
    const platforms = dh._platforms || [dh.platform];
    const platformLabel = platforms.length >= 2
      ? `${ICON_IOS} ${ICON_ANDROID}`
      : `${platforms[0] === 'android' ? ICON_ANDROID : ICON_IOS}`;
    // 排名顯示（合併後可能多排行）
    let chartRanks = dh._chartRanks || [{ chartLabel: dh.chartType === 'grossing' ? '營收' : '免費', platform: dh.platform, rank: dh.currentRank, marketFlag: dh.marketFlag || '' }];
    
    // 排序：營收優先 > 排名數字越小越前面
    chartRanks.sort((a, b) => {
      if (a.chartLabel !== b.chartLabel) return a.chartLabel === '營收' ? -1 : 1;
      return a.rank - b.rank;
    });

    const hasMultiMarkets = dh.markets && dh.markets.length > 1;
    const displayRanks = chartRanks.slice(0, 2);
    const hiddenRanks = chartRanks.slice(2);

    let rankHtml = displayRanks.map(cr => {
      const pIcon = cr.platform === 'android' ? ICON_ANDROID : ICON_IOS;
      const rtCls = cr.chartLabel === '營收' ? 'rt-grossing' : 'rt-free';
      const mFlag = hasMultiMarkets && cr.marketFlag ? `<span style="font-size:11px;margin-right:2px">${cr.marketFlag}</span>` : '';
      return `<div class="dh-rank-row">${mFlag}<span class="dh-rank-type ${rtCls}">${cr.chartLabel}</span>${pIcon}<span class="dh-rank-num">#${cr.rank}</span></div>`;
    }).join('');

    if (hiddenRanks.length > 0) {
      const tooltipText = hiddenRanks.map(cr => `${cr.marketFlag || ''} ${cr.platform === 'android' ? 'Android' : 'iOS'} ${cr.chartLabel} #${cr.rank}`).join('&#10;');
      rankHtml += `<div class="dh-rank-row" style="justify-content:flex-end;opacity:0.6;font-size:10px;cursor:help;margin-top:2px" title="${tooltipText}">+${hiddenRanks.length} 個排行</div>`;
    }

    return `
    <div class="dh-card ${hasAnalysis ? 'has-analysis' : ''} ${hasReport ? 'has-report' : ''}" onclick="showAnalysis('${dh.appId}', '${dh.platform}')">
      <div class="dh-header">
        <img class="dh-icon" src="${dh.icon || ''}" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23333%22 width=%22100%22 height=%22100%22 rx=%2220%22/><text x=%2250%22 y=%2258%22 text-anchor=%22middle%22 fill=%22%23888%22 font-size=%2240%22>🎮</text></svg>'">
        <div class="dh-info">
          <div class="dh-name" style="display:flex;align-items:center;gap:6px">
            <button class="pin-btn dh-pin-btn ${isTracked(dh.appId) ? 'pinned' : ''}" style="position:static;flex-shrink:0" onclick="event.stopPropagation();toggleTrack(this, ${JSON.stringify({
      appId: dh.appId, name: dh.name, icon: dh.icon || '', developer: dh.developer || '',
      platform: dh.platform, market: dh.market, marketFlag: dh.marketFlag, marketName: dh.marketName,
      chartType: dh.chartType, confidenceScore: dh.confidenceScore,
      currentRank: dh.currentRank, _chartRanks: dh._chartRanks, _platforms: dh._platforms || [dh.platform],
    }).replace(/"/g, '&quot;')})" title="${isTracked(dh.appId) ? '取消追蹤' : '追蹤此黑馬'}">📌</button>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${dh.name}</span>
          </div>
          <div class="dh-developer">${dh.developer || ''}</div>
        </div>
        <div class="dh-rank-block">${rankHtml}</div>
      </div>
      <div class="dh-meta">
        ${marketTags}
        <span class="dh-tag platform">${platformLabel}</span>
        ${classBadge}
        ${scoreBadge}
        ${reportBadge}
        ${detectBuyChart(dh, state.analysis[dh.appId], dh)}
      </div>
      <div class="dh-chart-mini"><canvas id="mini-${dh.appId.replace(/[^a-zA-Z0-9]/g, '_')}-${dh.platform}"></canvas></div>
      <div class="dh-card-footer">
        <div class="dh-signals">
          ${(() => {
        // 去重：同 strategy 只保留分數最高的一筆
        const byStrategy = new Map();
        dh.triggers.forEach(t => {
          const key = t.strategy || t.label;
          if (!byStrategy.has(key) || (t.score || 0) > (byStrategy.get(key).score || 0)) {
            byStrategy.set(key, t);
          }
        });
        return Array.from(byStrategy.values()).filter(t => t.strategy !== 'new_entry').map(t => {
          let shortLabel = '';
          if (t.strategy === 'rank_jump') {
            const match = t.detail.match(/↑(\d+)/);
            shortLabel = `🚀 ↑${match ? match[1] : ''}`;
          } else if (t.strategy === 'consecutive_rise') {
            const match = t.detail.match(/連續 (\d+) 天/);
            shortLabel = `📈 ${match ? match[1] : ''}天↑`;
          } else if (t.strategy === 'growth_multiplier') {
            const match = t.detail.match(/([\d.]+)×/);
            shortLabel = `📊 ${match ? match[1] : ''}×`;
          } else {
            shortLabel = t.label || t.detail.substring(0, 10);
          }
          return `<span class="dh-signal-pill" title="${t.detail}">${shortLabel}</span>`;
        }).join('');
      })()}
        </div>
        ${releasedDate ? `<div class="dh-released">上架 ${releasedDate}</div>` : ''}
      </div>
    </div>
  `;
  }).join('');

  setTimeout(() => {
    const canvasMap = new Map();
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const canvas = entry.target;
          const dh = canvasMap.get(canvas);
          if (dh) {
            let miniHistory = dh.rankHistory || [];
            if (dh._rankHistoryByLine) {
              const primaryKey = `${dh.platform}_${dh.chartType}`;
              if (dh._rankHistoryByLine[primaryKey] && dh._rankHistoryByLine[primaryKey].data.length > 0) {
                miniHistory = dh._rankHistoryByLine[primaryKey].data;
              } else {
                const firstLine = Object.values(dh._rankHistoryByLine)[0];
                if (firstLine && firstLine.data) miniHistory = firstLine.data;
              }
            }
            if (miniHistory.length < 3) {
              canvas.parentElement.style.display = 'none';
            } else {
              const sortedMini = [...miniHistory].sort((a, b) => a.date.localeCompare(b.date));
              renderMiniChart(canvas, sortedMini.slice(-7));
            }
          }
          obs.unobserve(canvas);
        }
      });
    }, { rootMargin: '100px' });

    filtered.forEach(dh => {
      const canvasId = `mini-${dh.appId.replace(/[^a-zA-Z0-9]/g, '_')}-${dh.platform}`;
      const canvas = document.getElementById(canvasId);
      if (canvas) {
        canvasMap.set(canvas, dh);
        observer.observe(canvas);
      }
    });
  }, 100);
}

function renderMiniChart(canvas, history) {
  const ctx = canvas.getContext('2d');
  
  // 強制對齊全域最近 7 天，營造「未入榜時從底部衝上來」的視覺
  const recent7Dates = state.availableDates.slice(-7);
  
  let actualMaxRank = 0;
  history.forEach(h => {
    if (h.rank > actualMaxRank) actualMaxRank = h.rank;
  });
  const chartMax = Math.max(100, Math.ceil(actualMaxRank / 10) * 10);
  const OFF_CHART_RANK = chartMax + 10;

  const dataMap = new Map(history.map(h => [h.date, h.rank]));
  
  const labels = recent7Dates.map(d => d.substring(5));
  const ranks = recent7Dates.map(d => {
    const val = dataMap.get(d);
    return (val === null || val === undefined) ? OFF_CHART_RANK : val;
  });

  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: ranks,
        borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)',
        borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { 
        x: { display: false }, 
        y: { display: false, reverse: true, min: 1, max: chartMax } 
      },
    },
  });
}

async function renderRankingsAsync() {
  const tbody = document.getElementById('rankingsBody');
  if (state.firebaseMode && state.selectedDate) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><p>⏳ 載入中...</p></div></td></tr>';
    const currentIdx = state.availableDates.indexOf(state.selectedDate);
    const prev = currentIdx > 0 ? state.availableDates[currentIdx - 1] : null;
    await ensureSnapshotLoaded(state.selectedDate, state.rankMarket);
    if (prev) await ensureSnapshotLoaded(prev, state.rankMarket);
  }
  renderRankings();
}

function renderRankings() {
  const tbody = document.getElementById('rankingsBody');
  const current = state.selectedDate;
  const currentIdx = state.availableDates.indexOf(current);
  const prev = currentIdx > 0 ? state.availableDates[currentIdx - 1] : null;

  // 排行榜不支援「全部市場」，提示使用者選擇
  if (state.rankMarket === 'all') {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="icon">🌍</div><p>排行榜需選擇特定市場查看。<br>請在上方市場篩選器中選擇一個國家。</p></div></td></tr>';
    return;
  }

  if (!current || !state.snapshots[current]) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="icon">📊</div><p>尚無排行資料</p></div></td></tr>';
    return;
  }

  let apps = [];
  const marketData = state.snapshots[current][state.rankMarket];
  if (!marketData) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>此市場無資料</p></div></td></tr>';
    return;
  }

  const platforms = state.platform === 'all' ? Object.keys(marketData) : [state.platform];
  platforms.forEach(p => {
    if (marketData[p] && marketData[p][state.chartType]) {
      (marketData[p][state.chartType].data || []).forEach(app => apps.push({ ...app, _platform: p }));
    }
  });

  // 跨平台去重 key：同一款遊戲在 Android/iOS 的 appId 不同，改用正規化名稱去重
  function dedupeKey(app) {
    return app.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '').substring(0, 30);
  }

  if (state.platform === 'all') {
    // 按排名合併：用名稱去重，取最佳排名，再重新編號
    const appMap = new Map();
    apps.forEach(a => {
      const key = dedupeKey(a);
      const existing = appMap.get(key);
      if (!existing || a.rank < existing.rank) appMap.set(key, a);
    });
    apps = Array.from(appMap.values());
    apps.sort((a, b) => a.rank - b.rank);
    apps = apps.slice(0, 100);
    apps.forEach((a, i) => a.rank = i + 1);
  }

  // 排名變化：必須用與今日相同的邏輯處理昨日資料
  let prevApps = {};
  if (prev && state.snapshots[prev] && state.snapshots[prev][state.rankMarket]) {
    const pMarket = state.snapshots[prev][state.rankMarket];
    let prevList = [];
    platforms.forEach(p => {
      if (pMarket[p] && pMarket[p][state.chartType]) {
        (pMarket[p][state.chartType].data || []).forEach(app => prevList.push({ ...app, _platform: p }));
      }
    });
    if (state.platform === 'all') {
      // 同樣：按排名合併，取最佳排名
      const prevMap = new Map();
      prevList.forEach(a => {
        const key = dedupeKey(a);
        const existing = prevMap.get(key);
        if (!existing || a.rank < existing.rank) prevMap.set(key, a);
      });
      prevList = Array.from(prevMap.values());
      prevList.sort((a, b) => a.rank - b.rank);
      prevList = prevList.slice(0, 100);
      prevList.forEach((a, i) => a.rank = i + 1);
    }
    prevList.forEach(app => { prevApps[app.appId] = app.rank; });
  }

  if (apps.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>此篩選條件下無資料</p></div></td></tr>';
    return;
  }

  // ★ 分頁切割
  const pageStart = (state.rankPage - 1) * state.rankPageSize;
  const pageEnd = pageStart + state.rankPageSize;
  const pagedApps = apps.slice(pageStart, pageEnd);

  tbody.innerHTML = pagedApps.map(app => {
    const lookupKey = app.appId;
    const prevRank = prevApps[lookupKey];
    let changeHtml = '<span class="rank-change rank-change--same">—</span>';
    if (prevRank != null) {
      const diff = prevRank - app.rank;
      const ARROW_UP_SM = '<svg width="10" height="10" viewBox="0 0 10 10" style="vertical-align:-1px"><path d="M5 1L9 6H1Z" fill="currentColor"/></svg>';
      const ARROW_DOWN_SM = '<svg width="10" height="10" viewBox="0 0 10 10" style="vertical-align:-1px"><path d="M5 9L1 4H9Z" fill="currentColor"/></svg>';
      if (diff > 0) changeHtml = `<span class="rank-change rank-change--up">${ARROW_UP_SM} ${diff}</span>`;
      else if (diff < 0) changeHtml = `<span class="rank-change rank-change--down">${ARROW_DOWN_SM} ${Math.abs(diff)}</span>`;
    } else if (state.availableDates.length >= 2) {
      changeHtml = '<span class="rank-change rank-change--up" style="color:var(--accent-cyan);background:rgba(6,182,212,0.12)">NEW</span>';
    }
    const scoreStr = app.score ? app.score.toFixed(1) : '-';
    const platformIcon = app._platform === 'android' ? ICON_ANDROID : ICON_IOS;
    const safeName = app.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');

    // ★ 排行榜標籤（已評測 + 黑馬）
    const rankReportBadge = findReport(app.name)
      ? '<span class="rank-report-badge" title="已有評測報告">📄 已評測</span>'
      : '';
    const isDarkhorse = state.darkhorses.some(d => {
      const dName = d.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '').substring(0, 20);
      const aName = app.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '').substring(0, 20);
      return dName === aName || d.appId === app.appId;
    });
    const rankDhBadge = isDarkhorse
      ? '<span class="rank-dh-badge" title="黑馬遊戲">🐴 黑馬</span>'
      : '';

    return `<tr onclick="showGameInfo('${app.appId}','${app._platform}')" style="cursor:pointer" title="點擊查看遊戲資訊">
      <td class="rank-cell">${app.rank}</td>
      <td class="rank-change">${changeHtml}</td>
      <td><div class="app-cell">
        <img src="${app.icon || ''}" alt="" onerror="this.style.display='none'">
        <div class="app-cell-info">
          <div style="display:flex; align-items:center;">
            <button class="pin-btn rank-pin-btn ${isTracked(app.appId) ? 'pinned' : ''}" onclick="event.stopPropagation();toggleTrack(this, ${JSON.stringify({
              appId: app.appId, name: app.name, icon: app.icon || '', developer: app.developer || '',
              platform: app._platform, market: state.rankMarket, marketFlag: MARKETS.find(m => m.code === state.rankMarket)?.flag || '', marketName: MARKETS.find(m => m.code === state.rankMarket)?.name || state.rankMarket,
              chartType: state.chartType, currentRank: app.rank, _platforms: [app._platform]
            }).replace(/"/g, '&quot;')})" title="${isTracked(app.appId) ? '取消追蹤' : '追蹤此遊戲'}">📌</button>
            <div class="app-cell-name" title="${safeName}">${app.name}</div>
            <div style="display:flex; flex-shrink:0;">${rankDhBadge}${rankReportBadge}</div>
          </div>
          <div class="app-cell-dev">${app.developer || ''}</div>
        </div>
      </div></td>
      <td class="score-cell">⭐ ${scoreStr}</td>
      <td class="released-cell" style="font-size:12px;color:var(--text-muted);white-space:nowrap">${app.released || '-'}</td>
      <td>${platformIcon}</td>
    </tr>`;
  }).join('');

  // ★ 分頁控制
  const totalPages = Math.ceil(apps.length / state.rankPageSize);
  if (totalPages > 1) {
    const paginationHtml = `
      <tr class="rank-pagination"><td colspan="7">
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;padding:12px 0">
          <button onclick="state.rankPage=Math.max(1,state.rankPage-1);renderRankings()" 
            style="padding:6px 14px;border-radius:8px;border:1px solid var(--border-glass);background:var(--bg-glass);color:var(--text-secondary);cursor:pointer;font-size:12px" 
            ${state.rankPage <= 1 ? 'disabled style="opacity:0.3;cursor:default"' : ''}>◀ 上一頁</button>
          <span style="font-size:12px;color:var(--text-muted)">${state.rankPage} / ${totalPages}</span>
          <button onclick="state.rankPage=Math.min(${totalPages},state.rankPage+1);renderRankings()" 
            style="padding:6px 14px;border-radius:8px;border:1px solid var(--border-glass);background:var(--bg-glass);color:var(--text-secondary);cursor:pointer;font-size:12px" 
            ${state.rankPage >= totalPages ? 'disabled style="opacity:0.3;cursor:default"' : ''}>下一頁 ▶</button>
        </div>
      </td></tr>`;
    tbody.innerHTML += paginationHtml;
  }

  // 重新套用搜尋過濾
  filterRankings();
}

// 排行榜搜尋過濾
function filterRankings() {
  const term = (document.getElementById('rankSearch')?.value || '').toLowerCase().trim();
  const rows = document.querySelectorAll('#rankingsBody tr');
  rows.forEach(row => {
    if (!term) { row.style.display = ''; return; }
    const name = row.querySelector('.app-cell-name')?.textContent?.toLowerCase() || '';
    const dev = row.querySelector('.app-cell-dev')?.textContent?.toLowerCase() || '';
    row.style.display = (name.includes(term) || dev.includes(term)) ? '' : 'none';
  });
}
window.filterRankings = filterRankings;

// ============ 趨勢圖 ============

// 預設模式切換
document.querySelectorAll('.trend-presets .pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.trend-presets .pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.trendPreset = btn.dataset.preset;
    renderTrendChart();
  });
});

function addToTrend(appId, name, platform) {
  // 切換到自選模式
  state.trendPreset = 'custom';
  document.querySelectorAll('.trend-presets .pill').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-preset="custom"]').classList.add('active');

  if (state.trendApps.find(a => a.appId === appId && a.platform === platform)) return;
  if (state.trendApps.length >= 10) { alert('最多比較 10 款遊戲'); return; }
  state.trendApps.push({ appId, name, platform });
  renderTrendChart();
  // 切換到趨勢 tab
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-tab="trends"]').classList.add('active');
  document.getElementById('tab-trends').classList.add('active');
}

function removeFromTrend(appId, platform) {
  state.trendApps = state.trendApps.filter(a => !(a.appId === appId && a.platform === platform));
  renderTrendChart();
}

document.getElementById('btnClearTrend')?.addEventListener('click', () => {
  state.trendApps = [];
  renderTrendChart();
});

/**
 * 根據預設模式取得要顯示的遊戲清單
 */
function getTrendApps() {
  if (state.trendPreset === 'custom') return state.trendApps;
  if (state.availableDates.length === 0) return [];

  const current = state.selectedDate;
  const currentIdx = state.availableDates.indexOf(current);
  const prev = currentIdx > 0 ? state.availableDates[currentIdx - 1] : null;

  // 取得當前日期的排行
  let apps = getCurrentApps(current);
  if (apps.length === 0) return [];

  if (state.trendPreset === 'top10') {
    return apps.slice(0, 10).map(a => ({ appId: a.appId, name: a.name, platform: a._platform, icon: a.icon }));
  }

  // 計算排名變化
  if (!prev) return apps.slice(0, 10).map(a => ({ appId: a.appId, name: a.name, platform: a._platform, icon: a.icon }));
  const prevApps = getCurrentApps(prev);
  const prevMap = {};
  prevApps.forEach(a => { prevMap[a.appId] = a.rank; });

  const withChange = apps.map(a => ({
    ...a,
    prevRank: prevMap[a.appId] || null,
    change: prevMap[a.appId] ? prevMap[a.appId] - a.rank : 0,
  }));

  if (state.trendPreset === 'risers') {
    return withChange
      .filter(a => a.change > 0)
      .sort((a, b) => b.change - a.change)
      .slice(0, 10)
      .map(a => ({ appId: a.appId, name: a.name, platform: a._platform, icon: a.icon }));
  }

  if (state.trendPreset === 'drops') {
    return withChange
      .filter(a => a.change < 0)
      .sort((a, b) => a.change - b.change)
      .slice(0, 10)
      .map(a => ({ appId: a.appId, name: a.name, platform: a._platform, icon: a.icon }));
  }

  return [];
}

/** 取得某天的排行清單 */
function getCurrentApps(date) {
  if (state.rankMarket === 'all') return [];
  if (!date || !state.snapshots[date] || !state.snapshots[date][state.rankMarket]) return [];
  const marketData = state.snapshots[date][state.rankMarket];
  const platforms = state.platform === 'all' ? Object.keys(marketData) : [state.platform];
  let apps = [];
  platforms.forEach(p => {
    if (marketData[p] && marketData[p][state.chartType]) {
      (marketData[p][state.chartType].data || []).forEach(app => apps.push({ ...app, _platform: p }));
    }
  });
  if (state.platform === 'all') {
    // 按排名合併：用名稱去重（跨平台 appId 不同）
    function dedupeKeyLocal(app) {
      return app.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '').substring(0, 30);
    }
    const appMap = new Map();
    apps.forEach(a => {
      const key = dedupeKeyLocal(a);
      const existing = appMap.get(key);
      if (!existing || a.rank < existing.rank) appMap.set(key, a);
    });
    apps = Array.from(appMap.values());
    apps.sort((a, b) => a.rank - b.rank);
    apps.forEach((a, i) => a.rank = i + 1);
  }
  return apps;
}

function renderTrendChart() {
  const canvas = document.getElementById('trendChart');
  if (trendChart) { trendChart.destroy(); trendChart = null; }

  const appsToShow = getTrendApps();
  if (appsToShow.length === 0 || state.availableDates.length === 0) {
    renderTrendLegend([]);
    return;
  }

  const colors = ['#3b82f6', '#ef4444', '#10b981', '#f97316', '#8b5cf6', '#06b6d4', '#eab308', '#ec4899', '#f43f5e', '#14b8a6'];
  const datasets = appsToShow.map((app, i) => {
    const data = state.availableDates.map(date => {
      const snap = state.snapshots[date];
      if (!snap || !snap[state.rankMarket]) return null;
      const pList = [app.platform];
      for (const p of pList) {
        if (snap[state.rankMarket][p] && snap[state.rankMarket][p][state.chartType]) {
          const found = snap[state.rankMarket][p][state.chartType].data?.find(a => a.appId === app.appId);
          if (found) return found.rank;
        }
      }
      return null;
    });
    // 截短名稱用於終點標籤
    const shortName = app.name.length > 12 ? app.name.substring(0, 12) + '…' : app.name;
    return {
      label: app.name, data, _shortName: shortName,
      borderColor: colors[i % colors.length], backgroundColor: colors[i % colors.length] + '20',
      borderWidth: 2.5, tension: 0.3, fill: false, pointRadius: 0, pointHoverRadius: 5,
    };
  });

  // 終點標籤 plugin
  const endLabelPlugin = {
    id: 'endLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      chart.data.datasets.forEach((ds, i) => {
        const meta = chart.getDatasetMeta(i);
        if (meta.hidden) return;
        // 找到最後一個有值的點
        let lastPoint = null;
        for (let j = meta.data.length - 1; j >= 0; j--) {
          if (ds.data[j] != null) { lastPoint = meta.data[j]; break; }
        }
        if (!lastPoint) return;
        ctx.save();
        ctx.font = '11px Inter, sans-serif';
        ctx.fillStyle = ds.borderColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(ds._shortName, lastPoint.x + 6, lastPoint.y);
        ctx.restore();
      });
    },
  };

  trendChart = new Chart(canvas, {
    type: 'line',
    data: { labels: state.availableDates.map(d => d.substring(5)), datasets },
    plugins: [endLabelPlugin],
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 100 } }, // 給終點標籤留空間
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items[0]?.label || '',
            label: (item) => `${item.dataset.label}: #${item.raw}`,
          },
        },
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 11 } } },
        y: {
          reverse: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 11 } },
          title: { display: true, text: '排名 (越低越好)', color: '#64748b' }
        },
      },
    },
  });

  renderTrendLegend(appsToShow, colors);
}

function renderTrendLegend(apps, colors = []) {
  const legend = document.getElementById('trendLegend');
  if (!apps || apps.length === 0) {
    legend.innerHTML = '';
    return;
  }

  // 計算每個 app 的排名變化
  const current = state.selectedDate;
  const currentIdx = state.availableDates.indexOf(current);
  const prev = currentIdx > 0 ? state.availableDates[currentIdx - 1] : null;
  const currentApps = getCurrentApps(current);
  const prevApps = prev ? getCurrentApps(prev) : [];
  const prevMap = {};
  prevApps.forEach(a => { prevMap[a.appId] = a.rank; });
  const curMap = {};
  currentApps.forEach(a => { curMap[a.appId] = a.rank; });

  legend.innerHTML = apps.map((app, i) => {
    const color = colors[i % colors.length] || '#888';
    const curRank = curMap[app.appId];
    const prevRank = prevMap[app.appId];
    let changeHtml = '';
    if (curRank && prevRank) {
      const diff = prevRank - curRank;
      if (diff > 0) changeHtml = `<span class="change up">▲${diff}</span>`;
      else if (diff < 0) changeHtml = `<span class="change down">▼${Math.abs(diff)}</span>`;
    }
    const rankStr = curRank ? `#${curRank}` : '';
    const removeBtn = state.trendPreset === 'custom' ? `<span class="remove" onclick="event.stopPropagation();removeFromTrend('${app.appId}','${app.platform}')">✕</span>` : '';
    const iconUrl = app.icon || currentApps.find(a => a.appId === app.appId)?.icon || '';
    return `<div class="trend-legend-item" data-index="${i}">
      <span class="dot" style="background:${color}"></span>
      <img class="legend-icon" src="${iconUrl}" alt="" onerror="this.style.display='none'">
      <span class="name">${app.name}</span>
      <span class="rank">${rankStr}</span>
      ${changeHtml || '<span></span>'}
      ${removeBtn || '<span></span>'}
    </div>`;
  }).join('');

  // 綁定 hover 高亮
  legend.querySelectorAll('.trend-legend-item').forEach(item => {
    item.addEventListener('mouseenter', () => {
      if (!trendChart) return;
      const idx = parseInt(item.dataset.index);
      trendChart.data.datasets.forEach((ds, i) => {
        ds.borderWidth = i === idx ? 4 : 1;
        ds.borderColor = i === idx
          ? colors[i % colors.length]
          : colors[i % colors.length] + '30';
        ds.pointRadius = i === idx ? 4 : 0;
      });
      trendChart.update('none');
    });
    item.addEventListener('mouseleave', () => {
      if (!trendChart) return;
      trendChart.data.datasets.forEach((ds, i) => {
        ds.borderWidth = 2.5;
        ds.borderColor = colors[i % colors.length];
        ds.pointRadius = 0;
      });
      trendChart.update('none');
    });
  });
}

window.removeFromTrend = removeFromTrend;

// ============ 搜尋快捷連結 ============
function buildSearchLinksHTML(gameName, storeUrl, appId, platform) {
  const q = encodeURIComponent(gameName);
  const qReview = encodeURIComponent(gameName + ' review');
  const qMobile = encodeURIComponent(gameName + ' mobile game');
  const linkStyle = `display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:var(--radius-sm);background:rgba(255,255,255,0.04);border:1px solid var(--border-glass);color:var(--text-secondary);text-decoration:none;font-size:12px;transition:var(--transition);white-space:nowrap`;
  const hoverIn = `this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.15)'`;
  const hoverOut = `this.style.background='rgba(255,255,255,0.04)';this.style.borderColor='var(--border-glass)'`;

  // 自動產生商店連結
  let finalStoreUrl = storeUrl;
  if (!finalStoreUrl && appId) {
    if (platform === 'ios') {
      finalStoreUrl = `https://apps.apple.com/app/id${appId}`;
    } else {
      finalStoreUrl = `https://play.google.com/store/apps/details?id=${appId}`;
    }
  }

  return `
    <div class="analysis-section" style="margin-top:20px">
      <h4>🔎 快速調查</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">
        <a href="https://www.youtube.com/results?search_query=${q}+gameplay" target="_blank" style="${linkStyle}" onmouseover="${hoverIn}" onmouseout="${hoverOut}">
          <span style="font-size:16px">🎬</span> YouTube 實機畫面
        </a>
        <a href="https://www.google.com/search?q=${qReview}" target="_blank" style="${linkStyle}" onmouseover="${hoverIn}" onmouseout="${hoverOut}">
          <span style="font-size:16px">📝</span> Google 評測文
        </a>
        ${finalStoreUrl ? `<a href="${finalStoreUrl}" target="_blank" style="${linkStyle}" onmouseover="${hoverIn}" onmouseout="${hoverOut}">
          <span style="font-size:16px">🔗</span> 商店頁面
        </a>` : ''}
      </div>
    </div>`;
}

function showGameInfo(appId, platform) {
  showAnalysis(appId, platform);
}

window.showGameInfo = showGameInfo;

// ============ 深度分析 Modal ============
function showAnalysis(appId, platform) {
  // 找出同遊戲的所有 darkhorse（可能有多個：不同平台、不同排行）
  const allDh = state.darkhorses.filter(d => d.appId === appId || (d.name && state.darkhorses.find(x => x.appId === appId)?.name === d.name));
  
  // 補上追蹤名單中可能留存的「歷史黑馬」資訊（如果現在已經跌出榜，但當初追蹤時有存 triggers）
  const trackedList = getTrackedList();
  const trackedMatches = trackedList.filter(t => t.appId === appId || (t.name && allDh[0] && t.name === allDh[0].name));
  trackedMatches.forEach(t => {
    if (t.triggers && t.triggers.length > 0 && !allDh.find(d => d.appId === t.appId && d.platform === t.platform)) {
      allDh.push(t);
    }
  });

  let dh = allDh.find(d => d.appId === appId && d.platform === platform) || allDh[0];
  const analysis = state.analysis[appId];

  // 如果沒有 darkhorse 資料，從排行榜快照取基本資訊
  if (!dh) {
    const date = state.selectedDate;
    let app = null;
    if (date && state.snapshots[date] && state.snapshots[date][state.rankMarket]) {
      const md = state.snapshots[date][state.rankMarket];
      if (md[platform] && md[platform][state.chartType]) {
        app = md[platform][state.chartType].data.find(a => a.appId === appId);
      }
    }
    if (!app) return;
    // 建立一個偽 dh 物件，讓後面的渲染邏輯通用
    dh = {
      appId, platform, name: app.name, developer: app.developer, icon: app.icon,
      marketFlag: MARKETS.find(m => m.code === state.rankMarket)?.flag || '',
      marketName: MARKETS.find(m => m.code === state.rankMarket)?.name || state.rankMarket,
      triggers: [], rankHistory: [],
    };
    // 也把 detail 資訊存到 analysis
    if (!analysis) {
      // 沒有 analysis，用排行榜資料模擬 detail
    }
  }

  // 動態擴充與更新 dh._rankHistoryByLine，確保即使是跌出黑馬榜的追蹤遊戲，排名圖表也會更新
  if (dh) {
    if (!dh._rankHistoryByLine) {
      dh._rankHistoryByLine = {};
      // 從 allDh (包含雙平台原始資料) 中提取原本已經存好的完整 14 天 rankHistory
      allDh.forEach(d => {
        if (d.rankHistory) {
          const lineKey = `${d.platform}_${d.chartType}`;
          if (!dh._rankHistoryByLine[lineKey]) {
            dh._rankHistoryByLine[lineKey] = { platform: d.platform, chartType: d.chartType, data: [...d.rankHistory] };
          }
        }
      });
    }
    
    const targetMarket = dh.market || dh.marketCode || state.rankMarket;
    // 將該遊戲所有已知的平台都掃一遍（如果它橫跨雙平台）
    const platformsToScan = Array.from(new Set(allDh.map(d => d.platform).concat([dh.platform])));
    
    state.availableDates.forEach(date => {
      const snap = state.snapshots[date];
      if (!snap || !snap[targetMarket]) return;
      
      platformsToScan.forEach(plat => {
        ['topfree', 'grossing'].forEach(chartType => {
          const chartData = snap[targetMarket][plat]?.[chartType]?.data || [];
          const found = chartData.find(a => a.appId === appId);
          if (found) {
            const lineKey = `${plat}_${chartType}`;
            if (!dh._rankHistoryByLine[lineKey]) {
              dh._rankHistoryByLine[lineKey] = { platform: plat, chartType, data: [] };
            }
            const line = dh._rankHistoryByLine[lineKey];
            if (!line.data.find(d => d.date === date)) {
              line.data.push({ date, rank: found.rank });
            }
          }
        });
      });
    });
  }

  // 合併所有 trigger 並標記來源（以 strategy+label 去重，避免重複顯示）
  const mergedTriggers = [];
  const seenTriggerKeys = new Set();
  const seenPlatforms = new Set();
  allDh.forEach(d => {
    seenPlatforms.add(d.platform);
    const baseChartLabel = d.chartType === 'grossing' ? '營收' : '免費';
    const platformName = d.platform === 'android' ? 'Android' : 'iOS';
    d.triggers.forEach(t => {
      let triggerSrc = t._src || `${platformName} ${baseChartLabel}`;
      if (!t._src) {
        if (t.label && (t.label.includes('雙榜') || t.detail?.includes('雙榜'))) triggerSrc = '雙榜';
        if (t.label && (t.label.includes('雙平台') || t.detail?.includes('雙平台'))) triggerSrc = '雙平台';
      }
      // 用 strategy+src 去重：同一個來源的同一種策略只顯示一次
      const dedupeKey = `${t.strategy || t.label}|${triggerSrc}`;
      if (!seenTriggerKeys.has(dedupeKey)) {
        seenTriggerKeys.add(dedupeKey);
        mergedTriggers.push({ ...t, _src: triggerSrc, _srcPlatform: d.platform });
      }
    });
  });

  // 平台顯示
  const platformArr = Array.from(seenPlatforms);
  if (platformArr.length === 0 && platform) platformArr.push(platform);
  const platformDisplay = platformArr.length >= 2
    ? `${ICON_IOS} ${ICON_ANDROID} iOS+Android`
    : `${platformArr[0] === 'android' ? ICON_ANDROID : ICON_IOS} ${platformArr[0] === 'android' ? 'Android' : 'iOS'}`;

  // 首次偵測日期格式化
  const detectedAtStr = (() => {
    const raw = dh.detectedAt || dh._retainedFrom || '';
    if (!raw) return null;
    try { return new Date(raw).toISOString().split('T')[0]; } catch { return raw.split('T')[0]; }
  })();
  const isRetainedModal = !!dh._retained;

  const body = document.getElementById('modalBody');
  body.innerHTML = `
    <div class="modal-app-header">
      <img src="${dh.icon || ''}" alt="" style="width:72px;height:72px;border-radius:16px" onerror="this.style.display='none'">
      <div>
        <div class="modal-app-title">${dh.name}</div>
        <div class="modal-app-dev">${dh.developer || ''} · ${dh.marketFlag} ${dh.marketName} · ${platformDisplay}</div>
        ${detectedAtStr ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">${isRetainedModal ? '👀 首次偵測' : '🆕 偵測日期'}：${detectedAtStr}${isRetainedModal ? ' · 持續觀察中' : ''}</div>` : ''}
      </div>
    </div>
    ${findReport(dh.name) ? `<button class="report-btn" style="margin-bottom:16px" onclick="event.stopPropagation();showReport('${dh.name.replace(/'/g, "\\'")}')">📄 查看完整評測報告</button>` : ''}
    ${(() => {
      // 從 analysis.detail 取基本資訊，或從排行榜快照 fallback
      let detail = analysis?.detail || {};
      // 排行榜快照 fallback
      if (!detail.released) {
        const date = state.selectedDate;
        if (date && state.snapshots[date] && state.snapshots[date][state.rankMarket]) {
          const md = state.snapshots[date][state.rankMarket];
          for (const p of ['ios', 'android']) {
            for (const ct of ['topfree', 'grossing']) {
              if (md[p] && md[p][ct]) {
                const found = md[p][ct].data.find(a => a.appId === appId);
                if (found) { detail = { ...detail, released: found.released, updated: found.updated, contentRating: found.contentRating, free: found.free, price: found.price, summary: found.summary || detail.summary }; break; }
              }
            }
            if (detail.released) break;
          }
        }
      }
      const released = detail.released ? (() => { try { const d = new Date(detail.released); return isNaN(d) ? detail.released : d.toISOString().split('T')[0]; } catch { return detail.released; } })() : '—';
      const updated = detail.updated ? (() => { try { const d = new Date(detail.updated); return isNaN(d) ? detail.updated : d.toISOString().split('T')[0]; } catch { return detail.updated; } })() : '—';
      const contentRating = detail.contentRating || '—';
      const priceStr = detail.free === false ? `$${detail.price || '?'}` : '免費';
      return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin:20px 0">
        <div class="stat-card"><div class="stat-label">上架日期</div><div class="stat-value" style="font-size:15px">${released}</div></div>
        <div class="stat-card"><div class="stat-label">最近更新</div><div class="stat-value" style="font-size:15px">${updated}</div></div>
        <div class="stat-card"><div class="stat-label">內容分級</div><div class="stat-value" style="font-size:15px">${contentRating}</div></div>
        <div class="stat-card"><div class="stat-label">價格</div><div class="stat-value" style="font-size:15px">${priceStr}</div></div>
      </div>`;
    })()}
    ${(() => {
      const summary = analysis?.detail?.summary || (() => {
        const date = state.selectedDate;
        if (date && state.snapshots[date] && state.snapshots[date][state.rankMarket]) {
          const md = state.snapshots[date][state.rankMarket];
          for (const p of ['ios', 'android']) {
            for (const ct of ['topfree', 'grossing']) {
              if (md[p] && md[p][ct]) { const f = md[p][ct].data.find(a => a.appId === appId); if (f && f.summary) return f.summary; }
            }
          }
        }
        return '';
      })();
      return summary ? `<div class="analysis-section"><h4>📝 遊戲簡介</h4><div class="reason-card" style="border-left-color:var(--accent-purple);font-size:13px;line-height:1.7;color:var(--text-secondary)">${summary}</div></div>` : '';
    })()}
    ${mergedTriggers.length > 0 ? `
    <div class="analysis-section">
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">
        <h4 style="margin:0">🐴 黑馬觸發條件</h4>
        ${detectedAtStr ? `<span style="font-size:11px;color:var(--text-muted)">偵測快照：${detectedAtStr}</span>` : ''}
      </div>
      ${mergedTriggers.map(t => {
      const srcCls = t._src?.includes('營收') ? 'src-grossing' : t._src === '雙榜' ? 'src-dual' : t._src === '雙平台' ? 'src-cross' : 'src-free';
      const rcCls = srcCls.replace('src-', 'rc-');
      const srcTag = `<span class="trigger-src ${srcCls}">${t._src}</span>`;
      return `<div class="reason-card ${rcCls}"><div class="reason-label">${srcTag}${t.label}</div><div class="reason-detail">${t.detail}</div></div>`;
    }).join('')}
    </div>` : ''}
    <div class="analysis-section">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <h4 style="margin:0">📈 排名歷史</h4>
        <div id="chartRangePresets" style="display:flex;gap:4px">
          ${[7,14,30].map(d => `<button
            onclick="renderModalChart(window._currentDh, ${d}, this)"
            data-days="${d}"
            style="padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.2s;
              background:${d===7?'rgba(59,130,246,0.2)':'var(--bg-glass)'};
              border:1px solid ${d===7?'var(--accent-blue)':'var(--border-glass)'};
              color:${d===7?'var(--accent-blue)':'var(--text-muted)'};"
          >${d}天</button>`).join('')}
        </div>
      </div>
      <div class="chart-container"><canvas id="modalChart"></canvas></div>
    </div>
    ${analysis ? `
      ${analysis.aiSummary ? `
      <div class="analysis-section">
        <h4>📋 AI 分析摘要</h4>
        <div class="reason-card" style="border-left-color:var(--accent-cyan);font-size:14px;line-height:1.7;color:var(--text-primary)">
          ${analysis.aiSummary}
        </div>
      </div>` : ''}
      <div class="analysis-section">
        <h4>🔍 推測竄升原因</h4>
        ${(analysis.inferredReasons || []).map(r => `
          <div class="reason-card" style="border-left-color:${r.confidence === 'high' ? 'var(--accent-green)' : r.confidence === 'medium' ? 'var(--accent-yellow)' : 'var(--text-muted)'}">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <div class="reason-label">${r.label}</div>
              <span style="font-size:10px;padding:2px 8px;border-radius:8px;background:${r.confidence === 'high' ? 'rgba(16,185,129,0.15)' : r.confidence === 'medium' ? 'rgba(234,179,8,0.15)' : 'rgba(100,116,139,0.15)'};color:${r.confidence === 'high' ? 'var(--accent-green)' : r.confidence === 'medium' ? 'var(--accent-yellow)' : 'var(--text-muted)'}">${r.confidence === 'high' ? '高信心' : r.confidence === 'medium' ? '中信心' : '低信心'}</span>
            </div>
            <div class="reason-detail">${r.detail.replace(/(\d+\.\d{2})\d+/g, (m, p1) => parseFloat(m).toFixed(1))}</div>
            ${r.sources ? `<div style="margin-top:4px;font-size:11px">${r.sources.map(s => `<a href="${s}" target="_blank" style="color:var(--accent-blue);margin-right:8px">${new URL(s).hostname}</a>`).join('')}</div>` : ''}
          </div>`).join('')}
      </div>
      ${(analysis.newsArticles || []).length > 0 ? `
      <div class="analysis-section">
        <h4>📰 相關報導</h4>
        ${analysis.newsArticles.map(n => `
          <a href="${n.url}" target="_blank" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:var(--radius-sm);background:rgba(255,255,255,0.03);margin-bottom:6px;text-decoration:none;color:var(--text-secondary);transition:var(--transition)" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
            <span style="font-size:11px;color:var(--text-muted);min-width:80px">${n.source}</span>
            <span style="flex:1;color:var(--text-primary);font-size:13px">${n.title}</span>
            <span style="font-size:11px;color:var(--text-muted)">${n.date || ''}</span>
          </a>`).join('')}
      </div>` : ''}
      ${(analysis.reviewAnalysis && analysis.reviewAnalysis.total > 0) ? `
      <div class="analysis-section">
        <h4>💬 評論星等分布</h4>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">
          ${(() => {
        const sc = analysis.reviewAnalysis?.starCounts || {}; return `
          <div class="stat-card" style="flex:1;min-width:60px"><div class="stat-label">⭐5</div><div class="stat-value" style="color:var(--accent-green)">${sc[5] || 0}</div></div>
          <div class="stat-card" style="flex:1;min-width:60px"><div class="stat-label">⭐4</div><div class="stat-value" style="color:#a3e635">${sc[4] || 0}</div></div>
          <div class="stat-card" style="flex:1;min-width:60px"><div class="stat-label">⭐3</div><div class="stat-value" style="color:var(--accent-yellow)">${sc[3] || 0}</div></div>
          <div class="stat-card" style="flex:1;min-width:60px"><div class="stat-label">⭐2</div><div class="stat-value" style="color:var(--accent-orange)">${sc[2] || 0}</div></div>
          <div class="stat-card" style="flex:1;min-width:60px"><div class="stat-label">⭐1</div><div class="stat-value" style="color:var(--accent-red)">${sc[1] || 0}</div></div>
          `;
      })()}
        </div>
        <div style="font-size:12px;color:var(--text-muted)">最新 ${analysis.reviewAnalysis?.total || 0} 則評論取樣${analysis.reviewAnalysis?.positiveRatio != null ? ` · 好評率 ${analysis.reviewAnalysis.positiveRatio}%` : ''} <span style="opacity:0.6">（僅反映近期趨勢，非整體評價）</span></div>
      </div>` : ''}
      ${analysis.detail?.recentChanges ? `
      <div class="analysis-section">
        <h4>📝 最近更新內容</h4>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:var(--radius-sm)">${analysis.detail.recentChanges}</div>
      </div>` : ''}
      ${(analysis.suggestions || []).length > 0 ? `
      <div class="analysis-section">
        <h4>🎯 建議觀察方向</h4>
        ${analysis.suggestions.map(s => `<div style="display:flex;gap:8px;margin-bottom:6px;font-size:13px;color:var(--text-secondary)"><span style="color:var(--accent-cyan)">▸</span>${s}</div>`).join('')}
      </div>` : ''}
    ` : '<div class="analysis-section"><h4>🔍 深度分析</h4><p style="color:var(--text-muted)">尚未分析此遊戲。請在對話中輸入「分析 [遊戲名稱] 黑馬」。</p></div>'}
    ${buildSearchLinksHTML(dh.name, dh.url, dh.appId, dh.platform)}`;

  document.getElementById('analysisModal').classList.add('active');

  setTimeout(() => {
    // 儲存當前 dh 供 preset 按鈕使用
    window._currentDh = dh;
    // 預設顯示 7 天，並 highlight 對應按鈕
    renderModalChart(dh, 7);
    // 初始化後補上按鈕 highlight
    setTimeout(() => {
      const btn7 = document.querySelector('#chartRangePresets button[data-days="7"]');
      if (btn7) renderModalChart(dh, 7, btn7);
    }, 50);

    // 觸發非同步拉取 14 天快照並重繪圖表
    // 無論是否為黑馬，都需要拉取快照，因為黑馬的備份可能只含有觸發條件的那個榜單（如免費榜）的歷史，
    // 要看到另一個榜單（如營收榜）的完整歷史走勢，必須靠快照補齊。
    if (state.firebaseMode) {
      setTimeout(async () => {
        let loadedNew = false;
        const targetMarket = dh.market || dh.marketCode || state.rankMarket;
        const datesToLoad = [...state.availableDates].slice(-14);
        
        for (const date of datesToLoad) {
          if (!state.snapshots[date] || !state.snapshots[date][targetMarket]) {
            try {
              await ensureSnapshotLoaded(date, targetMarket);
              loadedNew = true;
            } catch (e) { /* ignore */ }
          }
        }

        // 重新掃描快照補齊資料並重繪
        if (loadedNew && window._currentDh && window._currentDh.appId === appId) {
          const platformsToScan = Array.from(new Set((allDh || []).map(d => d.platform).concat([dh.platform])));
          datesToLoad.forEach(date => {
            const snap = state.snapshots[date];
            if (!snap || !snap[targetMarket]) return;
            platformsToScan.forEach(plat => {
              ['topfree', 'grossing'].forEach(chartType => {
                const chartData = snap[targetMarket][plat]?.[chartType]?.data || [];
                const found = chartData.find(a => a.appId === appId);
                if (found) {
                  const lineKey = `${plat}_${chartType}`;
                  if (!dh._rankHistoryByLine[lineKey]) dh._rankHistoryByLine[lineKey] = { platform: plat, chartType, data: [] };
                  const line = dh._rankHistoryByLine[lineKey];
                  if (!line.data.find(d => d.date === date)) {
                    line.data.push({ date, rank: found.rank });
                  }
                }
              });
            });
          });
          
          const activeBtn = document.querySelector('#chartRangePresets button[style*="rgba(59, 130, 246, 0.2)"]');
          const days = activeBtn ? parseInt(activeBtn.getAttribute('data-days')) : 7;
          renderModalChart(dh, days, activeBtn);
        }
      }, 0);
    }
  }, 200);
}

// ============ Modal 圖表渲染（支援日期區間篩選）============
function renderModalChart(dh, days, activeBtn) {
  if (modalChart) { modalChart.destroy(); modalChart = null; }
  const canvas = document.getElementById('modalChart');
  if (!canvas) return;

  // 更新 preset 按鈕樣式
  if (activeBtn) {
    document.querySelectorAll('#chartRangePresets button').forEach(btn => {
      const selected = btn === activeBtn;
      btn.style.background = selected ? 'rgba(59,130,246,0.2)' : 'var(--bg-glass)';
      btn.style.borderColor = selected ? 'var(--accent-blue)' : 'var(--border-glass)';
      btn.style.color = selected ? 'var(--accent-blue)' : 'var(--text-muted)';
    });
  }

  const LINE_STYLES = {
    'ios_topfree':     { color: '#3b82f6', label: '🍎 iOS 免費' },
    'ios_grossing':    { color: '#8b5cf6', label: '🍎 iOS 營收' },
    'android_topfree': { color: '#10b981', label: '🤖 Android 免費' },
    'android_grossing':{ color: '#f59e0b', label: '🤖 Android 營收' },
  };

  const historyByLine = dh._rankHistoryByLine;
  const lines = [];

  if (historyByLine && Object.keys(historyByLine).length > 0) {
    Object.entries(historyByLine).forEach(([key, lineData]) => {
      const style = LINE_STYLES[key] || { color: '#64748b', label: key };
      const sortedData = [...(lineData.data || [])].sort((a, b) => a.date.localeCompare(b.date));
      lines.push({ key, label: style.label, color: style.color, data: sortedData });
    });
  } else if (dh.rankHistory && dh.rankHistory.length > 0) {
    const grouped = {};
    dh.rankHistory.forEach(h => {
      const k = `${h.platform || dh.platform}_${h.chartType || dh.chartType}`;
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(h);
    });
    Object.entries(grouped).forEach(([key, data]) => {
      const style = LINE_STYLES[key] || { color: '#3b82f6', label: '排名' };
      const sortedData = [...data].sort((a, b) => a.date.localeCompare(b.date));
      lines.push({ key, label: style.label, color: style.color, data: sortedData });
    });
  }

  const chartSection = canvas.closest('.analysis-section');
  if (lines.length === 0) {
    if (chartSection) chartSection.style.display = 'none';
    return;
  }

  // 統一 X 軸日期，並按 days 篩選最後 N 天
  let allDates = [...new Set(lines.flatMap(l => l.data.map(h => h.date)))].sort();
  const totalDays = allDates.length;

  // 更新 preset 按鈕的 disabled 狀態
  document.querySelectorAll('#chartRangePresets button').forEach(btn => {
    const d = parseInt(btn.dataset.days);
    if (d > totalDays) {
      btn.disabled = true;
      btn.style.opacity = '0.3';
      btn.style.cursor = 'not-allowed';
    } else {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    }
  });

  // 切片最後 N 天
  // 切片最後 N 天
  if (days && allDates.length > days) {
    allDates = allDates.slice(-days);
  }

  // 計算實際最大排名，決定榜外基準線 (保底 100)
  let actualMaxRank = 0;
  lines.forEach(line => line.data.forEach(h => {
    if (h.rank > actualMaxRank) actualMaxRank = h.rank;
  }));
  const chartMax = Math.max(100, Math.ceil(actualMaxRank / 10) * 10);
  const OFF_CHART_RANK = chartMax + 10; // 將未知排名設定在圖表最底端之外，營造由下往上衝的效果

  const labels = allDates.map(d => d.substring(5));
  const datasets = lines.map(line => {
    const dataMap = new Map(line.data.map(h => [h.date, h.rank]));
    return {
      label: line.label,
      data: allDates.map(d => {
        const val = dataMap.get(d);
        return (val === null || val === undefined) ? OFF_CHART_RANK : val;
      }),
      borderColor: line.color,
      backgroundColor: line.color + '18',
      borderWidth: 2,
      fill: false,
      tension: 0.3,
      pointBackgroundColor: line.color,
      pointRadius: 4,
      spanGaps: true,
    };
  });

  modalChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          display: datasets.length > 1,
          position: 'top',
          labels: { color: '#94a3b8', usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            title: (items) => `📅 ${allDates[items[0].dataIndex] || items[0].label}`,
            label: (item) => {
              const rank = item.raw;
              if (rank === OFF_CHART_RANK) return `${item.dataset.label}: 榜外 (未入榜)`;
              return `${item.dataset.label}: 第 #${rank} 名`;
            },
          },
          backgroundColor: 'rgba(15,23,42,0.92)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#94a3b8',
          bodyColor: '#e2e8f0',
          padding: 10,
        },
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } },
        y: { 
          reverse: true, 
          min: -3, 
          max: chartMax, 
          grid: { color: 'rgba(255,255,255,0.05)' }, 
          ticks: { color: '#64748b' }, 
          afterBuildTicks(axis) { 
            const t = [{value: 1}];
            for (let v = 10; v <= chartMax; v += 10) t.push({value: v});
            axis.ticks = t; 
          } 
        },
      },
    },
  });
}
window.renderModalChart = renderModalChart;

// ============ AppMagic Links ============
function renderAppMagicLinks() {
  const container = document.getElementById('appmagicLinks');
  container.innerHTML = MARKETS.map(m => `
    <a href="https://appmagic.rocks/top-charts/apps?country=${m.code}" target="_blank"
       style="display:flex;align-items:center;gap:8px;padding:12px 16px;border-radius:var(--radius-sm);background:var(--bg-glass);border:1px solid var(--border-glass);color:var(--text-secondary);text-decoration:none;transition:var(--transition);font-size:13px"
       onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='var(--bg-glass)'">
      <span style="font-size:20px">${m.flag}</span><span>${m.name}排行</span><span style="margin-left:auto">→</span>
    </a>`).join('');
}

window.showAnalysis = showAnalysis;
window.addToTrend = addToTrend;

// ============ 評測報告 ============

/**
 * 模糊匹配報告名稱：去除特殊符號後比對
 * 解決遊戲名有 !、:、- 等符號但資料夾名沒有的匹配問題
 */
function findReport(gameName) {
  if (!state.reports || !gameName) return null;
  // 正規化：轉小寫 → 只保留字母數字與中日韓文字（去掉所有空白符號括號）
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af\u3400-\u4dbf]/g, '');
  // 只保留拉丁字母數字（用來跨語言比較共同前綴）
  const latinOnly = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nameNorm = normalize(gameName);
  const nameLatin = latinOnly(gameName);
  // 若 normalize 後為空字串（如泰文、阿拉伯文等非 CJK/拉丁字元），
  // 不可用 includes 比對，否則任何報告都會 match（includes("") 永遠 true）
  if (!nameNorm) return null;
  for (const key of Object.keys(state.reports)) {
    const keyNorm = normalize(key);
    if (!keyNorm) continue; // 報告 key 同樣保護
    // 完整正規化比較
    if (keyNorm === nameNorm || keyNorm.includes(nameNorm) || nameNorm.includes(keyNorm)) {
      return state.reports[key];
    }
    // 跨語言比較：只比拉丁字母部分（解決同款遊戲不同語言名稱的問題）
    const keyLatin = latinOnly(key);
    if (keyLatin.length >= 6 && nameLatin.length >= 6) {
      if (keyLatin === nameLatin || keyLatin.includes(nameLatin) || nameLatin.includes(keyLatin)) {
        return state.reports[key];
      }
    }
  }
  return null;
}

/**
 * 顯示評測報告 Modal
 */
function showReport(gameName) {
  const md = findReport(gameName);
  if (!md) return;

  const body = document.getElementById('modalBody');
  // 使用 marked.js 渲染 Markdown（已在 index.html 中引入）
  if (typeof marked !== 'undefined') {
    // 所有連結另開分頁
    const renderer = new marked.Renderer();
    renderer.link = function ({ href, title, text }) {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    };
    let html = marked.parse(md, { renderer });
    // 修正狀態 icon 歪掉：td 只含狀態符號時強制置中
    html = html.replace(/<td[^>]*>\s*(✅|⚠️|❌|❓)\s*<\/td>/g,
      '<td style="text-align:center;font-size:16px;vertical-align:middle">$1</td>');
    // 支援 marked.js align 屬性（確保置中對齊生效）
    html = html.replace(/<td align="center"/g, '<td style="text-align:center"');
    html = html.replace(/<th align="center"/g, '<th style="text-align:center"');
    // ★ 下載按鈕（放在報告內容上方，左側對齊，與關閉按鈕保持距離）
    const safeGameName = gameName.replace(/'/g, "\\'");
    const downloadBtn = `<div style="margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.06)"><button onclick="event.stopPropagation();downloadReportHTML('${safeGameName}')" style="display:inline-flex;align-items:center;gap:8px;padding:8px 18px;border-radius:8px;border:1px solid rgba(59,130,246,0.3);background:rgba(59,130,246,0.1);color:#60a5fa;cursor:pointer;font-size:13px;font-weight:600;transition:all 0.2s" onmouseover="this.style.background='rgba(59,130,246,0.25)'" onmouseout="this.style.background='rgba(59,130,246,0.1)'">⬇ 下載評測報告（HTML）</button></div>`;
    body.innerHTML = `${downloadBtn}<div class="report-content">${html}</div>`;
    // 4 欄以上的寬表格：加 wide-table class 啟用橫捲；窄表格正常換行
    body.querySelectorAll('.report-content table').forEach(table => {
      const firstRow = table.querySelector('tr');
      if (!firstRow) return;
      const cols = firstRow.querySelectorAll('th, td').length;
      if (cols >= 4) {
        table.classList.add('wide-table');
      }
    });
  } else {
    // fallback：以 <pre> 顯示原始 markdown
    body.innerHTML = `<div class="report-content"><pre style="white-space:pre-wrap;font-size:13px;line-height:1.8;color:var(--text-secondary)">${md.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></div>`;
  }

  document.getElementById('analysisModal').classList.add('active');
}

/**
 * ★ 下載評測報告為自包含 HTML 檔案
 */
function downloadReportHTML(gameName) {
  const md = findReport(gameName);
  if (!md || typeof marked === 'undefined') return;

  const renderer = new marked.Renderer();
  renderer.link = function ({ href, title, text }) {
    const titleAttr = title ? ` title="${title}"` : '';
    return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
  };
  let html = marked.parse(md, { renderer });
  html = html.replace(/<td[^>]*>\s*(✅|⚠️|❌|❓)\s*<\/td>/g,
    '<td style="text-align:center;font-size:16px;vertical-align:middle">$1</td>');

  const fullHTML = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${gameName} — 產品競爭力評測</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans TC', sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.7; padding: 32px 20px; }
  .container { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 24px; margin-bottom: 16px; color: #f8fafc; }
  h2 { font-size: 20px; margin: 28px 0 12px; color: #f1f5f9; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px; }
  h3 { font-size: 16px; margin: 20px 0 8px; color: #cbd5e1; }
  h4 { font-size: 14px; margin: 16px 0 6px; color: #94a3b8; }
  p { margin: 8px 0; color: #cbd5e1; }
  a { color: #60a5fa; text-decoration: none; }
  a:hover { text-decoration: underline; }
  img { max-width: 100%; border-radius: 12px; }
  blockquote { border-left: 3px solid #3b82f6; padding: 8px 16px; margin: 12px 0; background: rgba(59,130,246,0.08); border-radius: 0 8px 8px 0; color: #94a3b8; font-size: 13px; }
  code { background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; font-size: 13px; color: #e2e8f0; }
  pre { background: rgba(255,255,255,0.04); padding: 16px; border-radius: 8px; overflow-x: auto; margin: 12px 0; }
  pre code { background: none; padding: 0; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
  th { background: rgba(255,255,255,0.06); color: #94a3b8; padding: 10px 12px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.1); font-weight: 600; }
  td { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: #cbd5e1; vertical-align: top; }
  tr:hover { background: rgba(255,255,255,0.02); }
  strong { color: #f1f5f9; }
  hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 24px 0; }
  ul, ol { padding-left: 20px; margin: 8px 0; }
  li { margin: 4px 0; color: #cbd5e1; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08); color: #64748b; font-size: 11px; text-align: center; }
  @media print { body { background: #fff; color: #1e293b; } h1,h2,h3,strong { color: #0f172a; } p,td,li { color: #334155; } th { background: #f1f5f9; color: #475569; } blockquote { background: #f8fafc; color: #64748b; } }
</style>
</head>
<body>
<div class="container">
${html}
<div class="footer">遊戲產品競爭力分析工具 — 報告產出日期 ${new Date().toISOString().split('T')[0]}</div>
</div>
</body>
</html>`;

  const blob = new Blob([fullHTML], { type: 'text/html;charset=utf-8' });
  const fileName = `${gameName} — 產品競爭力評測.html`;

  // 針對手機端：如果支援 Web Share API，優先使用分享功能讓使用者可以傳到 LINE 或存檔
  try {
    const file = new File([blob], fileName, { type: 'text/html' });
    if (window.innerWidth <= 768 && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({
        files: [file],
        title: `${gameName} 評測報告`
      }).catch(e => {
        console.log('Share canceled or failed, fallback to download');
        fallbackDownload(blob, fileName);
      });
      return; // 成功呼叫 share 後直接 return
    }
  } catch (e) {
    // 忽略錯誤，繼續走傳統下載
  }

  fallbackDownload(blob, fileName);
}

function fallbackDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

window.showReport = showReport;
window.findReport = findReport;
window.downloadReportHTML = downloadReportHTML;

// ============ 黑馬追蹤功能 ============

function toggleTrack(btn, gameData) {
  const list = getTrackedList();
  const idx = list.findIndex(t => t.appId === gameData.appId);
  if (idx >= 0) {
    list.splice(idx, 1);
    btn.classList.remove('pinned');
    btn.title = '追蹤此遊戲';
  } else {
    // 嘗試從今日黑馬名單中尋找並保留黑馬特徵與排名歷史
    const currentDh = state.darkhorses.find(d => d.appId === gameData.appId);
    let extraData = {};
    if (currentDh) {
      extraData = {
        triggers: currentDh.triggers,
        confidenceScore: currentDh.confidenceScore,
        _rankHistoryByLine: currentDh._rankHistoryByLine
      };
    }
    list.push({ ...gameData, ...extraData, trackedAt: new Date().toISOString().split('T')[0] });
    btn.classList.add('pinned');
    btn.title = '取消追蹤';
  }
  saveTrackedListLocal(list);
  saveTrackedToFirestore(list);
  updateTrackedBadge();
  renderTracked();
}

function updateTrackedBadge() {
  const badge = document.getElementById('trackedBadge');
  const count = getTrackedList().length;
  badge.textContent = count > 0 ? count : '';
}

async function renderTracked() {
  updateTrackedBadge();
  const grid = document.getElementById('trackedGrid');
  if (!grid) return;
  const allList = getTrackedList();
  const searchTerm = (document.getElementById('trackedSearch')?.value || '').toLowerCase().trim();

  // 篩選
  const list = allList.filter(t => {
    // 搜尋
    if (searchTerm) {
      const nameMatch = t.name.toLowerCase().includes(searchTerm);
      const devMatch = (t.developer || '').toLowerCase().includes(searchTerm);
      if (!nameMatch && !devMatch) return false;
    }
    // 市場
    if (state.trackedMarket !== 'all' && t.market !== state.trackedMarket) return false;
    // 已評測篩選
    if (state.trackedReportFilter === 'reported' && !findReport(t.name)) return false;
    if (state.trackedReportFilter === 'unreported' && findReport(t.name)) return false;
    return true;
  });

  document.getElementById('trackedCount').textContent = `${list.length} / ${allList.length}`;

  if (list.length === 0) {
    grid.innerHTML = allList.length === 0
      ? `<div class="empty-state"><div class="icon">📌</div><p>尚未追蹤任何黑馬。<br>在黑馬卡片上點擊 📌 即可追蹤。</p></div>`
      : `<div class="empty-state"><div class="icon">🔍</div><p>沒有符合篩選條件的追蹤遊戲。</p></div>`;
    return;
  }

  // Firebase 模式：確保追蹤遊戲所在市場的快照已載入
  if (state.firebaseMode) {
    const latestDate = state.availableDates[state.availableDates.length - 1];
    if (latestDate) {
      const marketsToLoad = [...new Set(list.map(t => t.market).filter(Boolean))];
      for (const market of marketsToLoad) {
        try { await ensureSnapshotLoaded(latestDate, market); } catch (e) { console.warn('快照載入失敗:', market, e); }
      }
    }
  }

  grid.innerHTML = list.map(t => {
    // 檢查是否仍在今日黑馬名單中（appId 或名稱模糊匹配），並取得最新排名
    const _norm = s => (s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '').substring(0, 20);
    const dhMatch = state.darkhorses.find(d => d.appId === t.appId) ||
      state.darkhorses.find(d => _norm(d.name) === _norm(t.name) && d.market === t.market);
    const stillDarkhorse = !!dhMatch;

    // 排名來源：1) 今日黑馬資料 2) 快照查詢 3) 存檔排名
    let currentRank = dhMatch ? dhMatch.currentRank : null;

    // 快照 fallback
    if (!currentRank) {
      const latestDate = state.availableDates[state.availableDates.length - 1];
      if (latestDate && state.snapshots[latestDate]) {
        const marketData = state.snapshots[latestDate][t.market];
        if (marketData) {
          for (const p of (t._platforms || [t.platform])) {
            for (const ct of ['topfree', 'grossing']) {
              if (marketData[p] && marketData[p][ct]) {
                const found = marketData[p][ct].data?.find(a => a.appId === t.appId);
                if (found && (currentRank === null || found.rank < currentRank)) {
                  currentRank = found.rank;
                }
              }
            }
          }
        }
      }
    }

    const rankChange = currentRank && t.currentRank ? t.currentRank - currentRank : null;
    const ARROW_UP = '<svg width="10" height="10" viewBox="0 0 10 10" style="vertical-align:-1px"><path d="M5 1L9 6H1Z" fill="currentColor"/></svg>';
    const ARROW_DOWN = '<svg width="10" height="10" viewBox="0 0 10 10" style="vertical-align:-1px"><path d="M5 9L1 4H9Z" fill="currentColor"/></svg>';
    const rankChangeHtml = rankChange !== null
      ? rankChange > 0 ? `<span class="rank-change rank-change--up">${ARROW_UP} ${rankChange}</span>`
        : rankChange < 0 ? `<span class="rank-change rank-change--down">${ARROW_DOWN} ${Math.abs(rankChange)}</span>`
          : `<span class="rank-change rank-change--same">— 持平</span>`
      : '';

    const statusBadge = stillDarkhorse
      ? '<span class="tracked-status tracked-status--darkhorse">🐴 仍是黑馬</span>'
      : currentRank && currentRank <= (t.currentRank || 999)
        ? '<span class="tracked-status tracked-status--stable">📊 排名穩定</span>'
        : currentRank
          ? '<span class="tracked-status tracked-status--onChart">📉 排名下滑</span>'
          : '<span class="tracked-status tracked-status--dropped">⚠️ 已跌出榜</span>';

    const platforms = t._platforms || [t.platform];
    const platformLabel = platforms.length >= 2
      ? `${ICON_IOS} ${ICON_ANDROID}`
      : `${platforms[0] === 'android' ? ICON_ANDROID : ICON_IOS}`;

    // 排行排名明細（跟黑馬卡片一樣的 rank block）
    const chartRanks = dhMatch?._chartRanks || t._chartRanks || [];
    const chartLabel = t.chartType === 'grossing' ? '營收' : '免費';
    const rankHtml = chartRanks.length > 0
      ? chartRanks.map(cr => {
        const typeClass = cr.chartLabel === '營收' ? 'rt-grossing' : 'rt-free';
        const pIcon = cr.platform === 'android' ? ICON_ANDROID : ICON_IOS;
        return `<div class="dh-rank-row"><span class="dh-rank-type ${typeClass}">${pIcon} ${cr.chartLabel}</span><span class="dh-rank-num">#${cr.rank}</span></div>`;
      }).join('')
      : `<span class="dh-rank-num" style="font-size:22px">${currentRank ? '#' + currentRank : '—'}</span>`;

    // 買榜分析
    const analysisData = state.analysis[t.appId];
    const buyChartBadge = detectBuyChart(t, analysisData, dhMatch);

    // 報告 badge
    const hasReport = !!findReport(t.name);
    const reportBadge = hasReport
      ? '<span class="dh-tag report-ready" title="已有評測報告">📄 已評測</span>'
      : '';

    // 市場標籤
    const marketTag = `<span class="dh-tag market">${t.marketFlag || ''} ${t.marketName || ''}</span>`;

    return `
    <div class="dh-card tracked-card" onclick="showAnalysis('${t.appId}', '${t.platform}')">
      <div class="dh-header">
        <img class="dh-icon" src="${t.icon || ''}" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23333%22 width=%22100%22 height=%22100%22 rx=%2220%22/><text x=%2250%22 y=%2258%22 text-anchor=%22middle%22 fill=%22%23888%22 font-size=%2240%22>🎮</text></svg>'">
        <div class="dh-info">
          <div class="dh-name" style="display:flex;align-items:center;gap:6px">
            <button class="pin-btn dh-pin-btn pinned" style="position:static;flex-shrink:0" onclick="event.stopPropagation();untrack('${t.appId}')" title="取消追蹤">📌</button>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.name}</span>
          </div>
          <div class="dh-developer">${t.developer || ''}</div>
        </div>
        <div class="dh-rank-block">${rankHtml}</div>
      </div>
      <div class="dh-meta">
        ${marketTag}
        <span class="dh-tag platform">${platformLabel}</span>
        ${statusBadge}
        ${reportBadge}
        ${buyChartBadge}
      </div>
      <div class="dh-card-footer" style="justify-content:space-between;align-items:center">
        <div style="font-size:11px;color:var(--text-muted)">追蹤時 #${t.currentRank} → 現在 ${currentRank ? '#' + currentRank : '已離榜'} ${rankChangeHtml}</div>
        <div style="font-size:11px;color:var(--text-muted)">${t.trackedAt}</div>
      </div>
    </div>`;
  }).join('');
}

/**
 * 買榜分析：根據多重信號判斷是否有買榜疑慮
 * 需至少 2 個信號才標記；信心分數高的遊戲直接跳過（排名趨勢已確認真實）
 */
function detectBuyChart(trackedGame, analysisData, dhMatch) {
  // 信心分數 >= 4 代表黑馬信號強烈，不太可能是買榜
  const confidence = trackedGame.confidenceScore || dhMatch?.confidenceScore || 0;
  if (confidence >= 4) return '';

  const signals = [];
  const score = analysisData?.detail?.score || trackedGame.score || 0;
  const rank = trackedGame.currentRank;
  const reviewCount = analysisData?.detail?.ratings || analysisData?.detail?.reviews || 0;

  // 信號 1: 評分極低但排名極高（低於 3.5 分卻在 Top 5）
  if (score > 0 && score < 3.5 && rank && rank <= 5) {
    signals.push('低評分高排名');
  }

  // 信號 2: 評論數極少但排名極高（< 100 則且 Top 5）
  if (reviewCount > 0 && reviewCount < 100 && rank && rank <= 5) {
    signals.push('評論數極少');
  }

  // 信號 3: 排名鋸齒分析（Sawtooth Pattern）— 多次大幅震盪
  // 參考：Adjust / AppsFlyer 的安裝詐欺偵測方法論
  if (dhMatch && dhMatch.rankHistory) {
    const validHistory = dhMatch.rankHistory.filter(h => h.rank !== null);
    if (validHistory.length >= 3) {
      let bigSwings = 0;
      for (let i = 1; i < validHistory.length; i++) {
        const diff = Math.abs(validHistory[i].rank - validHistory[i - 1].rank);
        if (diff >= 30) bigSwings++;
      }
      if (bigSwings >= 2) {
        signals.push('排名鋸齒波動');
      }
    }
  }

  // 信號 4: 跨市場排名不一致（某市場 Top 5 但完全沒出現在其他市場）
  if (dhMatch && dhMatch.markets && dhMatch.markets.length === 1 && rank && rank <= 5) {
    // 只在一個市場出現且排名極高，可能是地區性買榜
    signals.push('僅單一市場上榜');
  }

  // 需至少 2 個信號才標記
  if (signals.length < 2) return '';

  const tipText = signals.join('、');
  return `<span class="tracked-status tracked-status--buyChart" title="疑似買榜信號：${tipText}">💰 買榜疑慮</span>`;
}

function untrack(appId) {
  const list = getTrackedList().filter(t => t.appId !== appId);
  saveTrackedListLocal(list);
  saveTrackedToFirestore(list);
  renderDarkhorses(); // 更新卡片上的 pin 按鈕狀態
  renderTracked();
}

window.toggleTrack = toggleTrack;
window.untrack = untrack;
window.setDhReportFilter = setDhReportFilter;
window.setTrackedReportFilter = setTrackedReportFilter;
window.setReportFilterTag = function(tag) {
  state.reportFilterTag = tag;
  renderReportsTab();
};
window.renderReportsTab = renderReportsTab;

// ============ 評測報告 Tab ============
function renderReportsTab() {
  const grid = document.getElementById('reportsGrid');
  const countEl = document.getElementById('reportsCount');
  const badgeEl = document.getElementById('reportsBadge');
  if (!grid) return;

  const searchTerm = (document.getElementById('reportsSearch')?.value || '').toLowerCase().trim();

  if (!state.reports || Object.keys(state.reports).length === 0) {
    if (countEl) countEl.textContent = '0';
    if (badgeEl) badgeEl.textContent = '';
    grid.innerHTML = '<div class="empty-state"><div class="icon">📄</div><p>尚無評測報告。</p></div>';
    return;
  }

  // 建立報告卡片資料與標籤收集
  const reportCards = [];
  const allTags = new Set();
  
  const GENRE_I18N = {
    'Action': '動作', 'Adventure': '冒險', 'Arcade': '街機', 'Board': '桌遊',
    'Card': '卡牌', 'Casino': '博弈', 'Casual': '休閒', 'Educational': '教育',
    'Music': '音樂', 'Puzzle': '益智', 'Racing': '競速', 'Role Playing': '角色扮演',
    'RPG': '角色扮演', 'Simulation': '模擬', 'Sports': '體育', 'Strategy': '策略',
    'Trivia': '益智問答', 'Word': '文字', 'Point-and-Click Adventure': '點擊冒險',
    'Match-3': '三消', 'Shooter': '射擊', 'MMORPG': 'MMORPG', 'Idle': '放置',
    'Hypercasual': '超休閒', 'Tower Defense': '塔防', 'MOBA': 'MOBA',
    'Battle Royale': '大逃殺'
  };

  for (const [reportName, reportData] of Object.entries(state.reports)) {
    // 萃取 Markdown 中的類型標籤
    const genreMatch = reportData.match(/\|\s*\*\*類型\*\*\s*\|\s*(.+?)\s*\|/);
    const rawTags = genreMatch ? genreMatch[1].split(/[,\/、]/).map(t => t.trim()).filter(Boolean) : [];
    const tags = rawTags.map(t => {
      const lowerT = t.toLowerCase();
      for (const [en, zh] of Object.entries(GENRE_I18N)) {
        if (en.toLowerCase() === lowerT) return zh;
      }
      return t;
    });
    tags.forEach(t => allTags.add(t));
    // 從快照中找遊戲資料
    let appInfo = null;
    const date = state.selectedDate;
    if (date && state.snapshots[date]) {
      for (const market of Object.values(state.snapshots[date])) {
        if (appInfo) break;
        for (const platform of Object.values(market)) {
          if (appInfo) break;
          for (const chart of Object.values(platform)) {
            if (appInfo) break;
            const found = (chart.data || []).find(a => findReport(a.name) === reportData);
            if (found) appInfo = found;
          }
        }
      }
    }
    // 從 analysis 中找
    if (!appInfo) {
      for (const [aid, aData] of Object.entries(state.analysis || {})) {
        if (aData?.detail?.name && findReport(aData.detail.name) === reportData) {
          appInfo = { appId: aid, name: aData.detail.name, icon: aData.detail.icon || '', developer: aData.detail.developer || '' };
          break;
        }
      }
    }
    // 從黑馬中找
    if (!appInfo) {
      const dh = state.darkhorses.find(d => findReport(d.name) === reportData);
      if (dh) appInfo = { appId: dh.appId, name: dh.name, icon: dh.icon || '', developer: dh.developer || '' };
    }

    const gameName = appInfo?.name || reportName;
    const icon = appInfo?.icon || '';
    const developer = appInfo?.developer || '';
    const isDarkhorse = state.darkhorses.some(d => findReport(d.name) === reportData);

    reportCards.push({ reportName, gameName, icon, developer, isDarkhorse, appId: appInfo?.appId, tags });
  }

  // 渲染標籤雲 UI
  const tagsPills = document.getElementById('reportTagsPills');
  if (tagsPills) {
    let pillsHtml = `<button class="pill ${!state.reportFilterTag || state.reportFilterTag === 'all' ? 'active' : ''}" onclick="setReportFilterTag('all')">全部</button>`;
    Array.from(allTags).sort().forEach(tag => {
      const isActive = state.reportFilterTag === tag;
      pillsHtml += `<button class="pill ${isActive ? 'active' : ''}" onclick="setReportFilterTag('${tag}')">${tag}</button>`;
    });
    tagsPills.innerHTML = pillsHtml;
  }

  // 搜尋與標籤篩選
  const filtered = reportCards.filter(r => {
    // 標籤過濾
    if (state.reportFilterTag && state.reportFilterTag !== 'all') {
      if (!r.tags.includes(state.reportFilterTag)) return false;
    }
    // 關鍵字過濾
    if (searchTerm) {
      if (!r.gameName.toLowerCase().includes(searchTerm) && !r.developer.toLowerCase().includes(searchTerm)) return false;
    }
    return true;
  });

  if (countEl) countEl.textContent = filtered.length;
  if (badgeEl) badgeEl.textContent = reportCards.length || '';

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><p>找不到符合的報告</p></div>';
    return;
  }

  grid.innerHTML = filtered.map(r => {
    const safeName = r.gameName.replace(/'/g, "\\'");
    const iconHtml = r.icon
      ? `<img class="dh-icon" src="${r.icon}" alt="" onerror="this.style.display='none'">`
      : `<div style="width:56px;height:56px;border-radius:14px;background:rgba(59,130,246,0.08);display:flex;align-items:center;justify-content:center;font-size:24px;border:2px solid var(--border-glass)">📄</div>`;
    const sourceTag = r.isDarkhorse
      ? '<span class="dh-tag trigger">🐴 黑馬</span>'
      : '<span class="dh-tag platform">🎮 一般遊戲</span>';

    return `
    <div class="dh-card has-report" onclick="showReport('${safeName}')" style="cursor:pointer">
      <div class="dh-header">
        ${iconHtml}
        <div class="dh-info">
          <div class="dh-name">${r.gameName}</div>
          <div class="dh-developer">${r.developer || '未知開發商'}</div>
        </div>
      </div>
      <div class="dh-meta">
        <span class="dh-tag report-ready">📄 已評測</span>
        ${sourceTag}
        ${r.tags.map(t => `<span class="dh-tag" style="background:rgba(255,255,255,0.05);color:var(--text-secondary)">🏷️ ${t}</span>`).join('')}
      </div>
      <div class="dh-card-footer" style="margin-top:auto">
        <div class="dh-signals">
          <span class="dh-signal-pill" style="background:rgba(59,130,246,0.12);border-color:rgba(59,130,246,0.25);color:var(--accent-blue)">點擊查看報告</span>
        </div>
      </div>
    </div>`;
  }).join('');
}
