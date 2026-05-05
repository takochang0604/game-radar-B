/**
 * 遊戲產品競爭力分析 — 前端應用邏輯
 * 從 data.js 中的 APP_DATA 全域變數讀取資料（不需伺服器）
 */

// ============ 平台 Icon ============
const ICON_ANDROID = '<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align:-2px;fill:#3DDC84"><path d="M17.6 11.5c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v4.9c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-4.9zm-14.4 0c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v4.9c0 .9-.7 1.6-1.6 1.6S3.2 17.3 3.2 16.4v-4.9zm3.3-.6h11v7.2c0 .9-.7 1.6-1.6 1.6H15v2.7c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-2.7h-1.6v2.7c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-2.7h-.9c-.9 0-1.6-.7-1.6-1.6v-7.2zM16.1 4l1.3-2.1c.1-.2.1-.5-.1-.6s-.5-.1-.6.1L15.3 3.6c-.9-.4-2-.7-3.3-.7s-2.3.2-3.3.7L7.4 1.4c-.2-.2-.4-.3-.6-.1s-.3.4-.1.6L8 4C5.9 5.1 4.5 7.2 4.5 9.6V10h15V9.6c0-2.4-1.4-4.5-3.4-5.6zM9 7.5c-.4 0-.8-.3-.8-.8s.3-.8.8-.8.8.3.8.8-.4.8-.8.8zm6 0c-.4 0-.8-.3-.8-.8s.3-.8.8-.8.8.3.8.8-.4.8-.8.8z"/></svg>';
const ICON_IOS = '<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-1px;fill:#999"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>';

// ============ 設定 ============
const MARKETS = [
  { code: 'us', name: '美國',   flag: '🇺🇸', hasGooglePlay: true },
  { code: 'jp', name: '日本',   flag: '🇯🇵', hasGooglePlay: true },
  { code: 'kr', name: '韓國',   flag: '🇰🇷', hasGooglePlay: true },
  { code: 'cn', name: '中國',   flag: '🇨🇳', hasGooglePlay: false },
  { code: 'tw', name: '台灣',   flag: '🇹🇼', hasGooglePlay: true },
  { code: 'th', name: '泰國',   flag: '🇹🇭', hasGooglePlay: true },
  { code: 'vn', name: '越南',   flag: '🇻🇳', hasGooglePlay: true },
  { code: 'ph', name: '菲律賓', flag: '🇵🇭', hasGooglePlay: true },
];

// ============ 狀態 ============
let state = {
  market: 'all',
  platform: 'all',
  chartType: 'topfree',
  selectedDate: null, // 目前選擇的日期
  snapshots: {},
  darkhorses: [],
  analysis: {},
  reports: {},
  availableDates: [],
  trendApps: [],
  trendPreset: 'top10', // top10 | risers | drops | custom
};

let trendChart = null;

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', () => {
  initControls();
  initTabs();
  initModal();
  initDateSelector();
  initScoreInfo();
  loadData();
  renderAppMagicLinks();
});

// ============ Controls ============
function initControls() {
  const marketPills = document.getElementById('marketPills');

  // 「全部」按鈕（黑馬 tab 跨市場總覽用）
  const allBtn = document.createElement('button');
  allBtn.className = 'pill active';
  allBtn.dataset.market = 'all';
  allBtn.innerHTML = '<span class="flag">🌍</span>全部';
  allBtn.onclick = () => selectPill('market', 'all', allBtn);
  marketPills.appendChild(allBtn);

  MARKETS.forEach((m) => {
    const btn = document.createElement('button');
    btn.className = 'pill';
    btn.dataset.market = m.code;
    btn.innerHTML = `<span class="flag">${m.flag}</span>${m.name}`;
    btn.onclick = () => selectPill('market', m.code, btn);
    marketPills.appendChild(btn);
  });

  document.querySelectorAll('#platformPills .pill').forEach(btn => {
    btn.onclick = () => selectPill('platform', btn.dataset.platform, btn);
  });
  document.querySelectorAll('#chartTypePills .pill').forEach(btn => {
    btn.onclick = () => selectPill('chartType', btn.dataset.chart, btn);
  });
}

function selectPill(type, value, btn) {
  const group = btn.parentElement;
  group.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  if (type === 'market') state.market = value;
  if (type === 'platform') state.platform = value;
  if (type === 'chartType') state.chartType = value;
  renderAll();
}

// ============ Tabs ============
function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    };
  });
}

// ============ 信心分數說明 ============
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
      <h3>⚡ 信心分數說明</h3>
      <p style="font-size:13px;color:var(--text-secondary);line-height:1.7;margin:0 0 16px">
        信心分數代表該遊戲「真正是潛力黑馬」的可信程度，<strong>分數越高 = 越值得關注</strong>。<br>
        由系統根據以下因素自動計算：
      </p>
      <table>
        <tr><th>因素</th><th>加分條件</th></tr>
        <tr><td>📈 排名急升幅度</td><td>從低名次衝到高名次，升幅越大分數越高</td></tr>
        <tr><td>🆕 新進榜遊戲</td><td>前一天不在榜上，今天突然出現</td></tr>
        <tr><td>📊 連續上升天數</td><td>連續多天排名持續爬升</td></tr>
        <tr><td>🌍 多市場出現</td><td>同時在多個國家被偵測為黑馬</td></tr>
        <tr><td>⭐ 評分門檻</td><td>評分 ≥ 4.0 的遊戲更有參考價值</td></tr>
      </table>
      <p style="font-size:12px;color:var(--text-muted);margin:14px 0 0;line-height:1.6">
        📌 一般而言，<strong style="color:var(--accent-green)">≥ 3.0</strong> 值得留意，<strong style="color:var(--accent-yellow)">≥ 5.0</strong> 建議深入調查。
      </p>
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
}
function closeModal() { document.getElementById('analysisModal').classList.remove('active'); }

// ============ 日期選擇器 ============
function initDateSelector() {
  const select = document.getElementById('dateSelect');
  const btnPrev = document.getElementById('btnPrevDate');
  const btnNext = document.getElementById('btnNextDate');

  select.onchange = () => {
    state.selectedDate = select.value;
    renderAll();
  };
  btnPrev.onclick = () => {
    const idx = state.availableDates.indexOf(state.selectedDate);
    if (idx > 0) {
      state.selectedDate = state.availableDates[idx - 1];
      select.value = state.selectedDate;
      renderAll();
    }
  };
  btnNext.onclick = () => {
    const idx = state.availableDates.indexOf(state.selectedDate);
    if (idx < state.availableDates.length - 1) {
      state.selectedDate = state.availableDates[idx + 1];
      select.value = state.selectedDate;
      renderAll();
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
  renderTrendChart();
}

function renderStats() {
  document.getElementById('statSnapshots').textContent = state.availableDates.length;
  const current = state.selectedDate;
  let appCount = 0;
  if (current && state.snapshots[current]) {
    Object.values(state.snapshots[current]).forEach(market => {
      Object.values(market).forEach(platform => {
        Object.values(platform).forEach(chart => {
          appCount += (chart.data || []).length;
        });
      });
    });
  }
  document.getElementById('statApps').textContent = appCount;
  document.getElementById('statDarkhorses').textContent = state.darkhorses.length;
  document.getElementById('dhCount').textContent = state.darkhorses.length;
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
    if (state.market !== 'all') {
      const dhMarkets = dh.markets ? dh.markets.map(m => m.code) : [dh.market];
      if (!dhMarkets.includes(state.market)) return false;
    }
    if (state.platform !== 'all' && dh.platform !== state.platform) return false;
    if (dh.chartType !== state.chartType) return false;
    return true;
  });

  // 按信心分數排序（高→低）
  filtered.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><p>${
      state.darkhorses.length === 0
        ? '尚無黑馬資料。請累積數天排行數據後，執行 <code>npm run analyze</code>。'
        : searchTerm ? `找不到「${searchTerm}」相關的黑馬。` : '當前篩選條件下無黑馬。嘗試切換市場或平台。'
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
    // 上架日期
    const rawReleased = state.analysis[dh.appId]?.detail?.released || '';
    const releasedDate = rawReleased ? (() => { try { const d = new Date(rawReleased); return isNaN(d) ? rawReleased : d.toISOString().split('T')[0]; } catch { return rawReleased; } })() : '';
    // 多市場標籤：如果有 markets 陣列就顯示所有市場旗幟
    const marketTags = dh.markets && dh.markets.length > 1
      ? dh.markets.map(m => `<span class="dh-tag market" title="${m.name} #${m.rank}">${m.flag}</span>`).join('')
      : `<span class="dh-tag market">${dh.marketFlag} ${dh.marketName}</span>`;
    return `
    <div class="dh-card ${hasAnalysis ? 'has-analysis' : ''} ${hasReport ? 'has-report' : ''}" onclick="showAnalysis('${dh.appId}', '${dh.platform}')">
      <div class="dh-header">
        <div class="dh-rank-badge">#${idx + 1}</div>
        <img class="dh-icon" src="${dh.icon || ''}" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23333%22 width=%22100%22 height=%22100%22 rx=%2220%22/><text x=%2250%22 y=%2258%22 text-anchor=%22middle%22 fill=%22%23888%22 font-size=%2240%22>🎮</text></svg>'">
        <div class="dh-info">
          <div class="dh-name">${dh.name}</div>
          <div class="dh-developer">${dh.developer || ''}</div>
        </div>
        <div class="dh-rank">
          <div class="dh-rank-num">#${dh.currentRank}</div>
          <div class="dh-rank-label">排名</div>
        </div>
      </div>
      <div class="dh-meta">
        ${marketTags}
        <span class="dh-tag platform">${dh.platform === 'android' ? ICON_ANDROID : ICON_IOS} ${dh.platform}</span>
        ${scoreBadge}
        ${reportBadge}
      </div>
      <div class="dh-chart-mini"><canvas id="mini-${dh.appId.replace(/[^a-zA-Z0-9]/g,'_')}-${dh.platform}"></canvas></div>
      <div class="dh-card-footer">
        <div class="dh-triggers">
          ${dh.triggers.map(t => `<div class="dh-trigger-item">${t.detail}</div>`).join('')}
        </div>
        ${releasedDate ? `<div class="dh-released">上架 ${releasedDate}</div>` : ''}
      </div>
    </div>
  `;
  }).join('');

  setTimeout(() => {
    filtered.forEach(dh => {
      const canvasId = `mini-${dh.appId.replace(/[^a-zA-Z0-9]/g,'_')}-${dh.platform}`;
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      renderMiniChart(canvas, dh.rankHistory || []);
    });
  }, 100);
}

function renderMiniChart(canvas, history) {
  const ctx = canvas.getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: history.map(h => h.date ? h.date.substring(5) : ''),
      datasets: [{
        data: history.map(h => h.rank),
        borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)',
        borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { display: false }, y: { display: false, reverse: true } },
    },
  });
}

async function renderRankingsAsync() {
  const tbody = document.getElementById('rankingsBody');
  if (state.firebaseMode && state.market !== 'all' && state.selectedDate) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><p>⏳ 載入中...</p></div></td></tr>';
    const currentIdx = state.availableDates.indexOf(state.selectedDate);
    const prev = currentIdx > 0 ? state.availableDates[currentIdx - 1] : null;
    await ensureSnapshotLoaded(state.selectedDate, state.market);
    if (prev) await ensureSnapshotLoaded(prev, state.market);
  }
  renderRankings();
}

function renderRankings() {
  const tbody = document.getElementById('rankingsBody');
  const current = state.selectedDate;
  const currentIdx = state.availableDates.indexOf(current);
  const prev = currentIdx > 0 ? state.availableDates[currentIdx - 1] : null;

  // 排行榜不支援「全部市場」，提示使用者選擇
  if (state.market === 'all') {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="icon">🌍</div><p>排行榜需選擇特定市場查看。<br>請在上方市場篩選器中選擇一個國家。</p></div></td></tr>';
    return;
  }

  if (!current || !state.snapshots[current]) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="icon">📊</div><p>尚無排行資料</p></div></td></tr>';
    return;
  }

  let apps = [];
  const marketData = state.snapshots[current][state.market];
  if (!marketData) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><p>此市場無資料</p></div></td></tr>';
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
  if (prev && state.snapshots[prev] && state.snapshots[prev][state.market]) {
    const pMarket = state.snapshots[prev][state.market];
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
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><p>此篩選條件下無資料</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = apps.map(app => {
    const lookupKey = app.appId;
    const prevRank = prevApps[lookupKey];
    let changeHtml = '<span class="rank-same">—</span>';
    if (prevRank != null) {
      const diff = prevRank - app.rank;
      if (diff > 0) changeHtml = `<span class="rank-up">▲${diff}</span>`;
      else if (diff < 0) changeHtml = `<span class="rank-down">▼${Math.abs(diff)}</span>`;
    } else if (state.availableDates.length >= 2) {
      changeHtml = '<span class="rank-up" style="color:var(--accent-cyan)">NEW</span>';
    }
    const cat = (app.category || '').replace('GAME_', '').replace(/^GAME$/i, '遊戲').replace(/^Games$/i, '遊戲');
    const scoreStr = app.score ? app.score.toFixed(1) : '-';
    const platformIcon = app._platform === 'android' ? ICON_ANDROID : ICON_IOS;
    const safeName = app.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');

    return `<tr onclick="showGameInfo('${app.appId}','${app._platform}')" style="cursor:pointer" title="點擊查看遊戲資訊">
      <td class="rank-cell">${app.rank}</td>
      <td class="rank-change">${changeHtml}</td>
      <td><div class="app-cell">
        <img src="${app.icon || ''}" alt="" onerror="this.style.display='none'">
        <div class="app-cell-info"><div class="app-cell-name">${app.name}</div><div class="app-cell-dev">${app.developer || ''}</div></div>
      </div></td>
      <td><span class="category-tag">${cat}</span></td>
      <td class="score-cell">⭐ ${scoreStr}</td>
      <td class="released-cell" style="font-size:12px;color:var(--text-muted);white-space:nowrap">${app.released || '-'}</td>
      <td>${platformIcon}</td>
    </tr>`;
  }).join('');

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
  if (state.market === 'all') return [];
  if (!date || !state.snapshots[date] || !state.snapshots[date][state.market]) return [];
  const marketData = state.snapshots[date][state.market];
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

  const colors = ['#3b82f6','#ef4444','#10b981','#f97316','#8b5cf6','#06b6d4','#eab308','#ec4899','#f43f5e','#14b8a6'];
  const datasets = appsToShow.map((app, i) => {
    const data = state.availableDates.map(date => {
      const snap = state.snapshots[date];
      if (!snap || !snap[state.market]) return null;
      const pList = [app.platform];
      for (const p of pList) {
        if (snap[state.market][p] && snap[state.market][p][state.chartType]) {
          const found = snap[state.market][p][state.chartType].data?.find(a => a.appId === app.appId);
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
        y: { reverse: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 11 } },
          title: { display: true, text: '排名 (越低越好)', color: '#64748b' } },
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
function buildSearchLinksHTML(gameName, storeUrl) {
  const q = encodeURIComponent(gameName);
  const qReview = encodeURIComponent(gameName + ' review');
  const qMobile = encodeURIComponent(gameName + ' mobile game');
  const linkStyle = `display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:var(--radius-sm);background:rgba(255,255,255,0.04);border:1px solid var(--border-glass);color:var(--text-secondary);text-decoration:none;font-size:12px;transition:var(--transition);white-space:nowrap`;
  const hoverIn = `this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.15)'`;
  const hoverOut = `this.style.background='rgba(255,255,255,0.04)';this.style.borderColor='var(--border-glass)'`;

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
        ${storeUrl ? `<a href="${storeUrl}" target="_blank" style="${linkStyle}" onmouseover="${hoverIn}" onmouseout="${hoverOut}">
          <span style="font-size:16px">🔗</span> 商店頁面
        </a>` : ''}
      </div>
    </div>`;
}

// ============ 遊戲資訊 Modal ============
function showGameInfo(appId, platform) {
  const date = state.selectedDate;
  if (!date || !state.snapshots[date] || !state.snapshots[date][state.market]) return;
  const marketData = state.snapshots[date][state.market];
  let app = null;
  if (marketData[platform] && marketData[platform][state.chartType]) {
    app = marketData[platform][state.chartType].data.find(a => a.appId === appId);
  }
  if (!app) return;

  const safeName = app.name.replace(/'/g, "\\'");
  const analysis = state.analysis[appId];
  const dh = state.darkhorses.find(d => d.appId === appId && d.platform === platform);

  const priceStr = app.free === false ? `$${app.price || '?'}` : '免費';

  const body = document.getElementById('modalBody');
  let html = `
    <div class="modal-app-header">
      <img src="${app.icon || ''}" alt="" style="width:72px;height:72px;border-radius:16px" onerror="this.style.display='none'">
      <div>
        <div class="modal-app-title">${app.name}</div>
        <div class="modal-app-dev">${app.developer || '未知開發商'}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin:20px 0">
      <div class="stat-card"><div class="stat-label">上架日期</div><div class="stat-value" style="font-size:15px">${app.released || '—'}</div></div>
      <div class="stat-card"><div class="stat-label">最近更新</div><div class="stat-value" style="font-size:15px">${app.updated || '—'}</div></div>
      <div class="stat-card"><div class="stat-label">內容分級</div><div class="stat-value" style="font-size:15px">${app.contentRating || '—'}</div></div>
      <div class="stat-card"><div class="stat-label">價格</div><div class="stat-value" style="font-size:15px">${priceStr}</div></div>
    </div>
    ${app.summary ? `<div class="analysis-section"><h4>📝 遊戲簡介</h4><div class="reason-card" style="border-left-color:var(--accent-purple);font-size:13px;line-height:1.7;color:var(--text-secondary)">${app.summary}</div></div>` : ''}`;

  // 黑馬觸發條件
  if (dh && dh.triggers && dh.triggers.length > 0) {
    html += `<div class="analysis-section">
      <h4>🐴 黑馬觸發條件</h4>
      ${dh.triggers.map(t => `<div class="reason-card"><div class="reason-label">${t.label}</div><div class="reason-detail">${t.detail}</div></div>`).join('')}
    </div>`;
  }

  // AI 分析摘要
  if (analysis && analysis.aiSummary) {
    html += `<div class="analysis-section">
      <h4>📋 AI 分析摘要</h4>
      <div class="reason-card" style="border-left-color:var(--accent-cyan);font-size:14px;line-height:1.7;color:var(--text-primary)">${analysis.aiSummary}</div>
    </div>`;
  }

  // 評論星等分布
  if (analysis && analysis.reviewAnalysis) {
    const ra = analysis.reviewAnalysis;
    const sc = ra.starCounts || {};
    html += `<div class="analysis-section">
      <h4>💬 評論星等分布</h4>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">
        <div class="stat-card" style="flex:1;min-width:60px"><div class="stat-label">⭐5</div><div class="stat-value" style="color:var(--accent-green)">${sc[5] || 0}</div></div>
        <div class="stat-card" style="flex:1;min-width:60px"><div class="stat-label">⭐4</div><div class="stat-value" style="color:#a3e635">${sc[4] || 0}</div></div>
        <div class="stat-card" style="flex:1;min-width:60px"><div class="stat-label">⭐3</div><div class="stat-value" style="color:var(--accent-yellow)">${sc[3] || 0}</div></div>
        <div class="stat-card" style="flex:1;min-width:60px"><div class="stat-label">⭐2</div><div class="stat-value" style="color:var(--accent-orange)">${sc[2] || 0}</div></div>
        <div class="stat-card" style="flex:1;min-width:60px"><div class="stat-label">⭐1</div><div class="stat-value" style="color:var(--accent-red)">${sc[1] || 0}</div></div>
      </div>
      <div style="font-size:12px;color:var(--text-muted)">取樣 ${ra.total || 0} 則最新評論${ra.positiveRatio != null ? ` · 好評率 ${ra.positiveRatio}%` : ''}</div>
    </div>`;
  }

  // 相關報導
  if (analysis && analysis.newsArticles && analysis.newsArticles.length > 0) {
    html += `<div class="analysis-section">
      <h4>📰 相關報導</h4>
      ${analysis.newsArticles.map(n => `<a href="${n.url}" target="_blank" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:var(--radius-sm);background:rgba(255,255,255,0.03);margin-bottom:6px;text-decoration:none;color:var(--text-secondary);transition:var(--transition)" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
        <span style="font-size:11px;color:var(--text-muted);min-width:60px">${n.source}</span>
        <span style="flex:1;color:var(--text-primary);font-size:13px">${n.title}</span>
      </a>`).join('')}
    </div>`;
  }

  // 操作按鈕
  html += `<div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">
    <button onclick="addToTrend('${appId}','${safeName}','${platform}');document.getElementById('analysisModal').classList.remove('active')" style="flex:1;padding:10px 16px;border-radius:var(--radius-sm);border:1px solid var(--accent-blue);background:rgba(59,130,246,0.1);color:var(--accent-blue);cursor:pointer;font-size:13px;transition:var(--transition)" onmouseover="this.style.background='rgba(59,130,246,0.2)'" onmouseout="this.style.background='rgba(59,130,246,0.1)'">📈 加入趨勢圖</button>
  </div>`;
  html += buildSearchLinksHTML(app.name, app.url);

  body.innerHTML = html;
  document.getElementById('analysisModal').classList.add('active');
}

window.showGameInfo = showGameInfo;

// ============ 深度分析 Modal ============
function showAnalysis(appId, platform) {
  const dh = state.darkhorses.find(d => d.appId === appId && d.platform === platform);
  const analysis = state.analysis[appId];
  if (!dh) return;

  const body = document.getElementById('modalBody');
  body.innerHTML = `
    <div class="modal-app-header">
      <img src="${dh.icon || ''}" alt="" style="width:72px;height:72px;border-radius:16px" onerror="this.style.display='none'">
      <div>
        <div class="modal-app-title">${dh.name}</div>
        <div class="modal-app-dev">${dh.developer || ''} · ${dh.marketFlag} ${dh.marketName} · ${dh.platform}${analysis?.detail?.released ? ` · 📅 上架 ${(() => { try { const d = new Date(analysis.detail.released); return isNaN(d) ? analysis.detail.released : d.toISOString().split('T')[0]; } catch { return analysis.detail.released; } })()}` : ''}</div>
      </div>
    </div>
    <div class="analysis-section">
      <h4>🐴 黑馬觸發條件</h4>
      ${dh.triggers.map(t => `<div class="reason-card"><div class="reason-label">${t.label}</div><div class="reason-detail">${t.detail}</div></div>`).join('')}
    </div>
    <div class="analysis-section">
      <h4>📈 排名歷史</h4>
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
            <div class="reason-detail">${r.detail}</div>
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
      <div class="analysis-section">
        <h4>💬 評論星等分布</h4>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">
          ${(() => { const sc = analysis.reviewAnalysis?.starCounts || {}; return `
          <div class="stat-card" style="flex:1;min-width:60px"><div class="stat-label">⭐5</div><div class="stat-value" style="color:var(--accent-green)">${sc[5] || 0}</div></div>
          <div class="stat-card" style="flex:1;min-width:60px"><div class="stat-label">⭐4</div><div class="stat-value" style="color:#a3e635">${sc[4] || 0}</div></div>
          <div class="stat-card" style="flex:1;min-width:60px"><div class="stat-label">⭐3</div><div class="stat-value" style="color:var(--accent-yellow)">${sc[3] || 0}</div></div>
          <div class="stat-card" style="flex:1;min-width:60px"><div class="stat-label">⭐2</div><div class="stat-value" style="color:var(--accent-orange)">${sc[2] || 0}</div></div>
          <div class="stat-card" style="flex:1;min-width:60px"><div class="stat-label">⭐1</div><div class="stat-value" style="color:var(--accent-red)">${sc[1] || 0}</div></div>
          `; })()}
        </div>
        <div style="font-size:12px;color:var(--text-muted)">取樣 ${analysis.reviewAnalysis?.total || 0} 則最新評論${analysis.reviewAnalysis?.positiveRatio != null ? ` · 好評率 ${analysis.reviewAnalysis.positiveRatio}%` : ''}</div>
      </div>
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
    ${findReport(dh.name) ? `
    <div class="analysis-section" style="margin-top:16px">
      <button class="report-btn" onclick="event.stopPropagation();showReport('${dh.name.replace(/'/g, "\\'")}')">📄 查看完整評測報告</button>
    </div>` : ''}
    ${buildSearchLinksHTML(dh.name, dh.url)}`;

  document.getElementById('analysisModal').classList.add('active');

  setTimeout(() => {
    const canvas = document.getElementById('modalChart');
    if (!canvas || !dh.rankHistory) return;
    new Chart(canvas, {
      type: 'line',
      data: {
        labels: dh.rankHistory.map(h => h.date ? h.date.substring(5) : ''),
        datasets: [{
          label: '排名', data: dh.rankHistory.map(h => h.rank),
          borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)',
          borderWidth: 2, fill: true, tension: 0.3, pointBackgroundColor: '#3b82f6', pointRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } },
          y: { reverse: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } },
        },
      },
    });
  }, 200);
}

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
  // 正規化函式：轉小寫 + 去除特殊符號 + 壓縮空白
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af ]/g, '').replace(/\s+/g, ' ').trim();
  const nameNorm = normalize(gameName);
  for (const key of Object.keys(state.reports)) {
    const keyNorm = normalize(key);
    // 正規化後精確匹配 或 任一方包含另一方
    if (keyNorm === nameNorm || keyNorm.includes(nameNorm) || nameNorm.includes(keyNorm)) {
      return state.reports[key];
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
    renderer.link = function({ href, title, text }) {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    };
    body.innerHTML = `<div class="report-content">${marked.parse(md, { renderer })}</div>`;
  } else {
    // fallback：以 <pre> 顯示原始 markdown
    body.innerHTML = `<div class="report-content"><pre style="white-space:pre-wrap;font-size:13px;line-height:1.8;color:var(--text-secondary)">${md.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre></div>`;
  }

  document.getElementById('analysisModal').classList.add('active');
}

window.showReport = showReport;
window.findReport = findReport;
