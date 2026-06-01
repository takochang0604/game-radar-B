/**
 * Game Radar 遊戲雷達 — 前端應用邏輯
 * 從 data.js 中的 APP_DATA 全域變數讀取資料（不需伺服器）
 */

// ============ 主題切換 ============
(function initTheme() {
  const saved = localStorage.getItem('game-radar-theme');
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();

function toggleTheme() {
  const html = document.documentElement;
  const isLight = html.getAttribute('data-theme') === 'light';
  // 加入過渡動畫 class
  html.setAttribute('data-theme-transitioning', '');
  if (isLight) {
    html.removeAttribute('data-theme');
    localStorage.setItem('game-radar-theme', 'dark');
  } else {
    html.setAttribute('data-theme', 'light');
    localStorage.setItem('game-radar-theme', 'light');
  }
  // 移除過渡 class（避免影響後續操作效能）
  setTimeout(() => html.removeAttribute('data-theme-transitioning'), 400);
}

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

// 統一國旗查找：永遠從 MARKETS 常數取 emoji，不依賴資料欄位
const _flagMap = Object.fromEntries(MARKETS.map(m => [m.code, m.flag]));
function getFlag(code) { return _flagMap[code] || ''; }

// ============ 狀態 ============
let state = {
  dhMarket: 'all',       // 黑馬 Tab 專用市場
  rankMarket: 'all',     // 排行榜 Tab 專用市場（不預設，由使用者選）
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
  activeTab: 'darkhorse',
  rankPage: 1,
  rankPageSize: 50,
};

let modalChart = null;

// [已移除] 追蹤功能 — 保留空殼避免其他地方引用報錯
function getTrackedList() { return []; }
function isTracked() { return false; }
function toggleTrack() {}
function renderTracked() {}

/**
 * 統一處理新版與舊版 Schema 的相容性轉換
 */
function sanitizeGameItem(g) {
  if (!g) return;
  if (!g.name && g.gameName) g.name = g.gameName;
  if (!g.appId && g.gameId) g.appId = g.gameId;
  if (!g.market && g.country) g.market = g.country;
  if (!g.marketFlag && g.countryFlag) g.marketFlag = g.countryFlag;
  if (!g.marketName && g.countryName) g.marketName = g.countryName;
  if (!g.detectedAt && g.detectedDate) g.detectedAt = g.detectedDate;
  if (!g.rankHistory && g.trendData) g.rankHistory = g.trendData;
  if (g.confidenceScore === undefined && g.score !== undefined) {
    g.confidenceScore = g.score;
  }
  if (g.triggers) {
    g.triggers.forEach(t => {
      if (!t.market && t.country) t.market = t.country;
      if (!t.marketFlag && t.countryFlag) t.marketFlag = t.countryFlag;
      if (!t.marketName && t.countryName) t.marketName = t.countryName;
    });
  }
}

/**
 * 取得同款遊戲合併與去重比對的模糊 Key
 */
// 跨區域同遊戲名稱對照表（不同地區商店名稱 → 統一 key）
const GAME_ALIASES = {
  '原神': 'genshinimpact',
  'genshinimpact': 'genshinimpact',
  '原神空月の歌': 'genshinimpact',
  '原神空月之歌': 'genshinimpact',
  '崩壊スターレイル': 'honkaistarrail',
  '崩壞星穹鐵道': 'honkaistarrail',
  'honkaistarrail': 'honkaistarrail',
  '崩壊3rd': 'honkaiimpact3rd',
  '崩壞3rd': 'honkaiimpact3rd',
  'honkaiimpact3rd': 'honkaiimpact3rd',
  'nikke': 'nikke',
  '勝利女神nikke': 'nikke',
  'goddessofvictorynikke': 'nikke',
  'メガニケ': 'nikke',
  'ゼンレスゾーンゼロ': 'zenlesszonezero',
  '絕區零': 'zenlesszonezero',
  'zenlesszonezero': 'zenlesszonezero',
  'brainpuzzle3': 'brainpuzzle',
  'brainpuzzle': 'brainpuzzle',
  'pastale': 'pastale',
  '粉彩世界': 'pastale',
  // Game of Thrones: Kingsroad — 跨語言名稱合併
  'gameofthroneskingsroad': 'got_kingsroad',
  '왕좌의게임': 'got_kingsroad',
  'gameofthrones': 'got_kingsroad',
  // 七つの大罪 — 跨語言
  '七つの大罪': 'sevendeadlysins',
  '일곱개의대죄': 'sevendeadlysins',
  // パズル＆ドラゴンズ — 名稱差異
  'パズルドラゴンズ': 'puzzleanddragons',
  'puzzledragons': 'puzzleanddragons',
  'パズルドラゴンズpuzzledragons': 'puzzleanddragons',
  // モンスターストライク — 跨語言
  'モンスターストライク': 'monsterstrike',
  '怪物彈珠': 'monsterstrike',
  // Paranoize / パラノイズ
  'paranoize': 'paranoize',
  'パラノイズ': 'paranoize',
  // UFL — 名稱差異
  'ufl': 'ufl',
  // DRAGON BALL LEGENDS — 跨語言
  'dragonballlegends': 'dblegends',
  'ドラゴンボールレジェンズ': 'dblegends',
  // ONE PIECE Bounty Rush — 跨語言
  'onepiecebountyrush': 'opbountyrush',
  'onepieceバウンティラッシュ': 'opbountyrush',
  // Lucky Defense — 跨語言
  'luckydefense': 'luckydefense',
  '운빨존많겜': 'luckydefense',
  // ドラゴンクエストタクト — 名稱差異
  'ドラゴンクエストタクト': 'dqtact',
  'ドラゴンクエストタクトドラクエのタクティクスrpg': 'dqtact',
  // Snake Puzzle — 名稱差異
  'snakepuzzle': 'snakepuzzle',
  // 呪術廻戦 ファントムパレード — 名稱差異
  '呪術廻戦ファントムパレード': 'jjkphantomparade',
  '呪術廻戦ファントムパレードファンパレ': 'jjkphantomparade',
  // 밤탈출 49일 — 跨平台
  '밤탈출': 'nightescape49',
  // 오늘의 꽃 — 名稱差異
  '오늘의꽃': 'todaysflower',
  // 배고파용 키우기 — 跨平台
  '배고파용키우기': 'hungrydragon',
  // 멀티 키우기 — 跨平台
  '멀티키우기': 'multigrowing',
  // 咲庭 — 跨平台
  '咲庭': 'sakitei',
};

function getMergeKey(dh) {
  if (!dh || !dh.name) return '';
  // 取冒號/破折號前的主標題，避免雙平台副標題不同導致無法合併
  const coreName = dh.name.split(/\s*[:\uff1a\-\u2014\u2013\|]\s*/)[0];
  const normalized = coreName.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '').substring(0, 30);
  // 查對照表：若有匹配，使用統一 key
  return GAME_ALIASES[normalized] || normalized;
}

/**
 * 找出某遊戲所有相關的 darkhorse 條目
 * 統一邏輯：appId 相同 或 getMergeKey 相同 或 siblingAppIds 匹配 即視為同款遊戲
 */
function findRelatedDarkhorses(appId) {
  const targetDh = state.darkhorses.find(x => x.appId === appId);
  const targetMergeKey = targetDh ? getMergeKey(targetDh) : '';
  const targetSiblings = targetDh?._siblingAppIds || [];
  return state.darkhorses.filter(d => {
    if (d.appId === appId) return true;
    if (targetMergeKey && getMergeKey(d) === targetMergeKey) return true;
    // sibling 配對
    if (targetSiblings.includes(d.appId)) return true;
    if ((d._siblingAppIds || []).includes(appId)) return true;
    return false;
  });
}

/**
 * 掃描快照，找出指定 appIds 在各市場的上榜情況
 * @returns Map<appId, [{code, rank, platform, chartType}]>
 */
function findAppInAllMarkets(date, appIds) {
  const result = new Map();
  if (!date || !state.snapshots[date]) return result;
  const idSet = appIds instanceof Set ? appIds : new Set(appIds);
  for (const market of MARKETS) {
    const mData = state.snapshots[date]?.[market.code];
    if (!mData) continue;
    for (const plat of Object.keys(mData)) {
      for (const ct of Object.keys(mData[plat] || {})) {
        const items = mData[plat][ct]?.data || [];
        for (const app of items) {
          if (!app.appId || !app.rank || app.rank > 100) continue;
          if (!idSet.has(app.appId)) continue;
          if (!result.has(app.appId)) result.set(app.appId, []);
          const arr = result.get(app.appId);
          // 同市場+同平台+同榜才算重複（之前只比市場，導致營收榜被跳過）
          if (!arr.find(e => e.code === market.code && e.platform === plat && e.chartType === ct)) {
            arr.push({ code: market.code, rank: app.rank, platform: plat, chartType: ct });
          }
        }
      }
    }
  }
  return result;
}

/**
 * 起始同步：從 Firestore 拉取追蹤清單，與本機 localStorage 合併
 */
async function initTrackedSync() {
  if (!state.firebaseMode) return;
  try {
    const { loadTrackedGames } = await import('./firebase-data.js');
    const remoteList = await loadTrackedGames(true); // forceRefresh
    const localList = getTrackedList();

    // 兼容處理：新版名稱與欄位轉換
    remoteList.forEach(sanitizeGameItem);
    localList.forEach(sanitizeGameItem);

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
    btn.className = 'pill';
    btn.dataset.market = m.code;
    btn.innerHTML = `<span class="flag">${m.flag}</span>${m.name}`;
    btn.onclick = () => { pillSelect(container, btn); onChange(m.code); };
    container.appendChild(btn);
  });
}

function buildPlatformPills(containerId, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const ICON_IOS_BTN = `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-1px;fill:currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>`;
  const ICON_AND_BTN = `<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align:-2px;fill:#3DDC84"><path d="M17.6 11.5c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v4.9c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-4.9zm-14.4 0c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v4.9c0 .9-.7 1.6-1.6 1.6S3.2 17.3 3.2 16.4v-4.9zm3.3-.6h11v7.2c0 .9-.7 1.6-1.6 1.6H15v2.7c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-2.7h-1.6v2.7c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-2.7h-.9c-.9 0-1.6-.7-1.6-1.6v-7.2zM16.1 4l1.3-2.1c.1-.2.1-.5-.1-.6s-.5-.1-.6.1L15.3 3.6c-.9-.4-2-.7-3.3-.7s-2.3.2-3.3.7L7.4 1.4c-.2-.2-.4-.3-.6-.1s-.3.4-.1.6L8 4C5.9 5.1 4.5 7.2 4.5 9.6V10h15V9.6c0-2.4-1.4-4.5-3.4-5.6zM9 7.5c-.4 0-.8-.3-.8-.8s.3-.8.8-.8.8.3.8.8-.4.8-.8.8zm6 0c-.4 0-.8-.3-.8-.8s.3-.8.8-.8.8.3.8.8-.4.8-.8.8z"/></svg>`;

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
        系統每天自動追蹤 <strong style="color:var(--text-primary)">8 個市場</strong>（美、日、韓、中、台、泰、越、菲）的 iOS 與 Android 遊戲排行榜（免費下載＋營收），從各市場 Top 100 中，找出近 14 天內<strong style="color:var(--text-primary)">排名異常竄升</strong>的遊戲。
      </p>

      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border-glass);border-radius:var(--radius-md);padding:16px;margin-bottom:16px">
        <h4 style="font-size:14px;font-weight:700;color:var(--accent-cyan);margin-bottom:10px">怎樣算黑馬？（觸發條件）</h4>
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">符合以下<strong>任一核心條件</strong>即判定為黑馬：</p>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--text-secondary)">
            <span style="font-size:15px;flex-shrink:0">🚀</span>
            <div><strong style="color:var(--text-primary)">排名急升</strong><span style="color:var(--text-muted);margin-left:4px">—</span> 7 天內排名急速上升 30 名以上。</div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--text-secondary)">
            <span style="font-size:15px;flex-shrink:0">🆕</span>
            <div><strong style="color:var(--text-primary)">新進強襲</strong><span style="color:var(--text-muted);margin-left:4px">—</span> 之前不在榜上，首偵以強大爆發力**直接空降衝進 Top 30**。</div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--text-secondary)">
            <span style="font-size:15px;flex-shrink:0">📈</span>
            <div><strong style="color:var(--text-primary)">持續攀升</strong><span style="color:var(--text-muted);margin-left:4px">—</span> 連續 5 天以上排名維持上升，無下跌現象。</div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--text-secondary)">
            <span style="font-size:15px;flex-shrink:0">📊</span>
            <div><strong style="color:var(--text-primary)">成長加速</strong><span style="color:var(--text-muted);margin-left:4px">—</span> 近 3 天平均名次相比近 7 天平均排名，**成長高達 2.5 倍**以上。</div>
          </div>
        </div>

        <h4 style="font-size:13px;font-weight:700;color:var(--accent-purple);margin:14px 0 8px">進階與防噪規則</h4>
        <div style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-muted);padding-left:4px">
          <div><strong style="color:var(--text-secondary)">↩️ 回歸型黑馬</strong>：曾跌出 Top 50 之外，但在 7 天內重新強勢衝回 Top 20。</div>
          <div><strong style="color:var(--text-secondary)">⚠️ 買榜警示 (鋸齒波動)</strong>：短時間內名次暴起暴落（幅度 >= 30 名）達 2 次以上，警示為非自然買量。</div>
          <div><strong style="color:var(--text-secondary)">🛡️ 博弈排除</strong>：全面過濾排除博弈類遊戲 (GAME_CASINO)，維持競爭力分析純度。</div>
          <div><strong style="color:var(--text-secondary)">🛡️ 品質篩選</strong>：商店評分低於 3.5 的遊戲將自動被系統剔除。</div>
        </div>
      </div>

      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border-glass);border-radius:var(--radius-md);padding:16px;margin-bottom:16px">
        <h4 style="font-size:14px;font-weight:700;color:var(--accent-yellow);margin-bottom:10px">信心分數 ⚡ 是什麼？</h4>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">
          每張卡片上的 <strong style="color:var(--accent-yellow)">⚡ 數字</strong> 代表這款黑馬遊戲的**威脅度與關注價值**：
        </p>
        <div style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-secondary);padding-left:4px">
          <div style="display:flex;align-items:center;gap:6px"><span style="color:var(--accent-cyan)">▸</span> 觸發越多核心條件、名次爬升越劇烈 → 基礎分數越高</div>
          <div style="display:flex;align-items:center;gap:6px"><span style="color:var(--accent-cyan)">▸</span> 🏆 **名次頂端加成**：名次越頂尖（特別是空降 Top 5 / Top 3）獲得大幅加分</div>
          <div style="display:flex;align-items:center;gap:6px"><span style="color:var(--accent-cyan)">▸</span> 🌍 **大市場權重**：在商業價值高的大市場（如日、美、韓）出現，加權分越高</div>
          <div style="display:flex;align-items:center;gap:6px"><span style="color:var(--accent-cyan)">▸</span> 🌍 **多市場同步**：同款遊戲在越多市場被偵測為黑馬，每個額外市場貢獻其分數的 **30% 加成**，3 市場以上另有一致性乘數加持</div>
          <div style="display:flex;align-items:center;gap:6px"><span style="color:var(--accent-cyan)">▸</span> 👀 **黑馬保留期**：一經判定，只要仍維持在 **Top 20**，信心分數會隨時間衰減（每天 −15%），分數降至門檻以下才會移出</div>
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

// 動態格式化觸發條件，顯示偵測當下的資訊，不對比今日排行，防折行爆版 RWD
function formatTriggerDetail(detail, latestRank) {
  if (!detail) return '';
  
  // 針對「新進榜」的描述進行強勢修飾優化，提升黑馬的空降震撼力與合理度
  if (detail.includes('首次進入 Top 100')) {
    const match = detail.match(/#(\d+)/);
    if (match) {
      const rank = parseInt(match[1]);
      if (rank === 1) {
        return `🔥 強勢空降冠軍，偵測當下排名 #1`;
      } else if (rank === 2) {
        return `🔥 強勢空降亞軍，偵測當下排名 #2`;
      } else if (rank === 3) {
        return `🔥 強勢空降季軍，偵測當下排名 #3`;
      } else if (rank <= 10) {
        return `⚡ 強勢空降 Top 10，偵測當下排名 #${rank}`;
      } else if (rank <= 30) {
        return `✨ 強勢衝進 Top 30，偵測當下排名 #${rank}`;
      } else {
        return `首次進入 Top 100，偵測當下排名 #${rank}`;
      }
    }
  }

  // 方案 A：將「目前排名 #X」替換為「偵測當下排名 #X」，只保留觸發時當下的名次資訊
  return detail.replace(/目前排名\s*#/, '偵測當下排名 #');
}

function populateDateSelector() {
  const select = document.getElementById('dateSelect');
  select.innerHTML = state.availableDates.map(d => {
    const isToday = d === state.availableDates[state.availableDates.length - 1];
    const label = isToday ? `${d} (最新)` : d;
    return `<option value="${d}"${d === state.selectedDate ? ' selected' : ''}>${label}</option>`;
  }).join('');
}

// ============ 全域淨化黑馬資料（同步最新排行） ============
function sanitizeDarkhorses() {
  if (!state.darkhorses) return;
  state.darkhorses.forEach(dh => {
    // 兼容處理：統一使用 sanitizeGameItem 處理新舊 Schema 差異
    sanitizeGameItem(dh);

    // 注意：不可修改 dh.markets 或 dh.currentRank，原始數據在偵測時已經是正確的

    // 備註：不再於此處就地（in-place）覆寫 triggers[].detail 的排名文字，
    // 以便保留首偵當下的起點排名，改由 formatTriggerDetail 在渲染時動態對比並呈現軌跡。
  });
}

// ============ 載入資料（Firebase 優先，data.js fallback）============
async function loadData() {
  // Firebase 模式
  if (typeof FIREBASE_MODE !== 'undefined' && FIREBASE_MODE) {
    const MAX_RETRIES = 2;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      updateStatus(attempt > 1 ? '🔄 重新連線中...' : '⏳ 正在從 Firebase 載入...');
      const { loadInitialData } = await import('./firebase-data.js');

      // 加上 20 秒 timeout 保護，避免 Firestore 卡住時 loading 永遠不關閉
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Firebase 載入逾時（20秒）')), 20000)
      );
      const data = await Promise.race([loadInitialData(), timeoutPromise]);
      state.availableDates = data.availableDates || [];
      state.snapshots = {}; // 快照按需載入
      state.darkhorses = data.darkhorses || [];
      sanitizeDarkhorses(); // 執行全域黑馬數據修正
      state.analysis = data.analysis || {};
      state.reports = data.reports || {};
      state.firebaseMode = true;

      state.selectedDate = state.availableDates[state.availableDates.length - 1] || null;
      populateDateSelector();
      updateStatus();
      renderAll();
      hideLoadingOverlay();

      // 背景預載所有市場快照，讓「今日更新」數字盡快顯示
      if (state.selectedDate) {
        preloadAllMarketSnapshots(state.selectedDate);
      }

      return;
    } catch (err) {
      console.error(`Firebase 載入失敗 (第${attempt}次):`, err);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2000)); // 等 2 秒再重試
        continue;
      }
      // 全部重試失敗，落入 data.js fallback
    }
    break; // 成功就跳出
    }
  }

  // data.js fallback 模式
  if (typeof APP_DATA === 'undefined' || APP_DATA === null) {
    updateStatus('❌ 找不到資料 — 請先執行 npm run upload 或 npm run build');
    hideLoadingOverlay(); // ← 補上：避免 loading 畫面永遠轉圈
    return;
  }

  state.availableDates = APP_DATA.availableDates || [];
  state.snapshots = APP_DATA.snapshots || {};
  state.darkhorses = APP_DATA.darkhorses || [];
  sanitizeDarkhorses(); // 執行全域黑馬數據修正
  state.analysis = APP_DATA.analysis || {};
  state.reports = APP_DATA.reports || {};
  state.firebaseMode = false;

  state.selectedDate = state.availableDates[state.availableDates.length - 1] || null;
  populateDateSelector();
  updateStatus();
  renderAll();
  hideLoadingOverlay();
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
  enrichDarkhorseMarketsFromSnapshots(date); // 從快照補齊黑馬的市場國旗
  renderStats(); // 全部載完後刷新統計數字
  renderDarkhorses(); // 重新渲染黑馬卡片（國旗 + 排行可能有更新）

}

/**
 * 從快照資料補齊黑馬的 markets 陣列
 * 掃描所有市場的最新快照，找出每個黑馬遊戲在哪些市場的 Top 100 內有上榜
 * 只要有上榜就補上該市場的國旗（只增不減）
 */
function enrichDarkhorseMarketsFromSnapshots(date) {
  if (!state.darkhorses || !state.snapshots[date]) return;
  const allIds = new Set(state.darkhorses.map(d => d.appId));
  const appMarketMap = findAppInAllMarkets(date, allIds);

  for (const dh of state.darkhorses) {
    const found = appMarketMap.get(dh.appId);
    if (!found || found.length === 0) continue;
    if (!dh.markets) dh.markets = [];
    for (const entry of found) {
      if (!dh.markets.find(m => m.code === entry.code)) {
        dh.markets.push({ code: entry.code, flag: getFlag(entry.code), name: MARKETS.find(mk => mk.code === entry.code)?.name || entry.code, rank: entry.rank });
      }
    }
  }
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.add('hidden');
  // Remove from DOM after animation completes
  setTimeout(() => { if (overlay) overlay.remove(); }, 600);
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
    el.innerHTML = `${mode} 最新: ${latest} <span class="status-days">| 已累積 ${days} 天</span>`;
  }
}

// ============ 渲染 ============
function renderAll() {
  renderStats();
  renderDarkhorses();
  renderRankingsAsync();
  renderReportsTab();
}

// ★ 只渲染當前可見 Tab（效能優化）
function renderActive() {
  renderStats();
  switch (state.activeTab) {
    case 'darkhorse': renderDarkhorses(); break;

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

  // 黑馬統計：統一使用 state.mergedDarkhorses（由 renderDarkhorses 合併後設定）
  // 這是唯一真實來源，避免重複實作合併邏輯導致數字不一致
  const merged = state.mergedDarkhorses;
  if (merged) {
    const latestDate = state.availableDates?.[state.availableDates.length - 1] || '';

    // 今日新黑馬
    const newEntryCount = merged.filter(dh => {
      const firstDetected = (dh.detectedAt || '').substring(0, 10);
      return firstDetected === latestDate;
    }).length;
    const statNewDhEl = document.getElementById('statNewDh');
    if (statNewDhEl) statNewDhEl.textContent = newEntryCount;

    // 已評測 / 總數
    const totalUnique = merged.length;
    const reportedCount = merged.filter(dh => !!findReport(dh.name, dh.appId)).length;
    const statAppsEl = document.getElementById('statApps');
    if (statAppsEl) statAppsEl.textContent = `${reportedCount} / ${totalUnique}`;

    // dhCount（會在 renderDarkhorses 篩選後再被覆寫為篩選後數量）
    const dhCountEl = document.getElementById('dhCount');
    if (dhCountEl) dhCountEl.textContent = totalUnique;
  }

  const statAppsSub = document.getElementById('statAppsSub');
  if (statAppsSub) statAppsSub.textContent = '匹已完成評測報告';
}

function renderDarkhorses() {
  const grid = document.getElementById('darkhorseGrid');
  const searchTerm = (document.getElementById('dhSearch')?.value || '').toLowerCase().trim();

  let filtered = state.darkhorses.slice(); // 先用全量做合併，篩選在後處理之後

  // ============ 跨平台/跨排行/跨市場合併 ============
  const mergedMap = new Map();

  for (const dh of filtered) {
    if (!dh || !dh.name) continue; // 健壯性防護：避免髒資料導致整個渲染掛掉
    // 注意：不可修改 dh.markets 或 dh.currentRank（參考 reference 會汙染原始數據）

    let targetKey = null;
    const nameKey = getMergeKey(dh);

    for (const [existingKey, existingDh] of mergedMap) {
      const exNameKey = getMergeKey(existingDh);
      const sameName = exNameKey === nameKey;
      
      // 跨平台 sibling 配對（後端自動偵測的同款遊戲 appId）
      const isSibling = (dh._siblingAppIds || []).includes(existingDh.appId) ||
                         (existingDh._siblingAppIds || []).includes(dh.appId);
      
      // 若名稱相同 或 sibling 配對，視為同遊戲進行合併
      if (sameName || isSibling) {
        targetKey = existingKey;
        break;
      }
    }

    if (targetKey) {
      const existing = mergedMap.get(targetKey);
      // 合併平台
      if (!existing._platforms.includes(dh.platform)) existing._platforms.push(dh.platform);

      // 合併開發商名稱，去重並智能融合相似字串
      if (dh.developer && existing.developer) {
        const parseDevs = (str) => str.split(/\s*[\/|]\s*/).map(s => s.trim()).filter(Boolean);
        const exDevs = parseDevs(existing.developer);
        const dhDevs = parseDevs(dh.developer);
        
        const mergedDevs = [...exDevs];
        dhDevs.forEach(newDev => {
          const newDevLower = newDev.toLowerCase();
          const existingMatchIdx = mergedDevs.findIndex(d => {
            const dLower = d.toLowerCase();
            return dLower.includes(newDevLower) || newDevLower.includes(dLower);
          });
          
          if (existingMatchIdx >= 0) {
            if (newDev.length > mergedDevs[existingMatchIdx].length) {
              mergedDevs[existingMatchIdx] = newDev;
            }
          } else {
            mergedDevs.push(newDev);
          }
        });
        existing.developer = mergedDevs.join(' / ');
      } else if (dh.developer && !existing.developer) {
        existing.developer = dh.developer;
      }
      
      // 合併市場陣列 (markets)
      if (dh.markets) {
        if (!existing.markets) existing.markets = [...dh.markets];
        else {
          dh.markets.forEach(m => {
            if (!existing.markets.find(em => em.code === m.code)) existing.markets.push({ ...m, flag: getFlag(m.code) });
          });
        }
      } else if (dh.market) {
        if (!existing.markets) existing.markets = [{ code: dh.market, flag: getFlag(dh.market), name: dh.marketName, rank: dh.currentRank }];
        else if (!existing.markets.find(em => em.code === dh.market)) existing.markets.push({ code: dh.market, flag: getFlag(dh.market), name: dh.marketName, rank: dh.currentRank });
      }

      // 合併排行資訊 (將 dh.markets 的所有排名都加入 _chartRanks)
      const chartLabel = dh.chartType === 'grossing' ? '營收' : '免費';
      const sourceMarkets = dh.markets || [{ code: dh.market, flag: getFlag(dh.market), rank: dh.currentRank }];
      sourceMarkets.forEach(m => {
        const mf = getFlag(m.code) || m.flag || '';
        if (!existing._chartRanks.find(cr => cr.chartLabel === chartLabel && cr.platform === dh.platform && cr.marketFlag === mf)) {
          existing._chartRanks.push({ chartLabel, platform: dh.platform, rank: m.rank || dh.currentRank, marketFlag: mf, marketCode: m.code || '' });
        }
      });
      // 取較高信心分數
      if ((dh.confidenceScore || 0) > (existing.confidenceScore || 0)) {
        existing.confidenceScore = dh.confidenceScore;
      }
      // 合併 triggers
      const srcChartLabel = dh.chartType === 'grossing' ? '營收' : '免費';
      const srcPlatformIcon = dh.platform === 'android' ? ICON_ANDROID : ICON_IOS;
      const srcPlatform = dh.platform;
      const srcMarketPrefix = dh.markets && dh.markets.length > 1 ? `${dh.marketFlag} ` : '';
      dh.triggers.forEach(t => {
        let triggerSrc = `${srcMarketPrefix}${srcPlatformIcon} ${srcChartLabel}`;
        if (t.label && (t.label.includes('雙榜') || t.detail?.includes('雙榜'))) triggerSrc = `${srcMarketPrefix}雙榜`;
        if (t.label && (t.label.includes('雙平台') || t.detail?.includes('雙平台'))) triggerSrc = `${srcMarketPrefix}雙平台`;
        const tagged = { ...t, _src: triggerSrc, _srcPlatform: srcPlatform };
        if (!existing.triggers.find(et => et.detail === t.detail && et._src === triggerSrc && et._srcPlatform === srcPlatform)) {
          existing.triggers.push(tagged);
        }
      });
      // 合併 rankHistory（key 含市場代碼，避免多國資料混合）
      if (dh.rankHistory) {
        if (!existing._rankHistoryByLine) existing._rankHistoryByLine = {};
        const mktCode = dh.market || dh.marketCode || '';
        const lineKey = `${mktCode}_${dh.platform}_${dh.chartType}`;
        if (!existing._rankHistoryByLine[lineKey]) {
          existing._rankHistoryByLine[lineKey] = { market: mktCode, platform: dh.platform, chartType: dh.chartType, data: [] };
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
      const taggedTriggers = dh.triggers.map(t => {
        let tFlag = t.marketFlag || '';
        if (!tFlag && t.market && dh.markets) {
          const fm = dh.markets.find(m => m.code === t.market);
          if (fm) tFlag = fm.flag || '';
        }
        // 如果還是沒有，且 dh.market 存在，使用 dh.marketFlag 作為歷史 trigger 的備用國旗
        if (!tFlag && dh.market) {
          tFlag = dh.marketFlag || '';
        }
        const prefix = tFlag ? `${tFlag} ` : '';

        let src = `${prefix}${platformName} ${chartLabel}`;
        if (t.label && (t.label.includes('雙榜') || t.detail?.includes('雙榜'))) src = `${prefix}雙榜`;
        if (t.label && (t.label.includes('雙平台') || t.detail?.includes('雙平台'))) src = `${prefix}雙平台`;
        return { ...t, _src: src, _srcPlatform: dh.platform };
      });
      
      const initialMarkets = dh.markets
        ? dh.markets.map(m => ({ ...m, flag: getFlag(m.code) || m.flag }))
        : (dh.market ? [{ code: dh.market, flag: getFlag(dh.market), name: dh.marketName, rank: dh.currentRank }] : []);
      
      mergedMap.set(key, {
        ...dh,
        markets: initialMarkets,
        triggers: taggedTriggers,
        _platforms: [dh.platform],
        _chartRanks: initialMarkets.length > 0
          ? initialMarkets.map(m => ({ chartLabel, platform: dh.platform, rank: m.rank || dh.currentRank, marketFlag: getFlag(m.code) || m.flag || '', marketCode: m.code || '' }))
          : [{ chartLabel, platform: dh.platform, rank: dh.currentRank, marketFlag: getFlag(dh.market) || dh.marketFlag || '', marketCode: dh.market || '' }],
        _rankHistoryByLine: (() => {
          const lines = {};
          // 優先用後端提供的 _rankHistoryByMarket（各市場獨立歷史）
          if (dh._rankHistoryByMarket && typeof dh._rankHistoryByMarket === 'object') {
            for (const [mkt, hist] of Object.entries(dh._rankHistoryByMarket)) {
              if (hist && hist.length > 0) {
                lines[`${mkt}_${dh.platform}_${dh.chartType}`] = { market: mkt, platform: dh.platform, chartType: dh.chartType, data: hist };
              }
            }
          }
          // fallback：用 dh.rankHistory
          if (Object.keys(lines).length === 0 && dh.rankHistory) {
            lines[`${dh.market || ''}_${dh.platform}_${dh.chartType}`] = { market: dh.market || '', platform: dh.platform, chartType: dh.chartType, data: dh.rankHistory };
          }
          return lines;
        })()
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

  // 後處理：從快照補充市場國旗 + 排行資訊（掃描所有可用日期，Top 100 有出現就顯示國旗）
  // 排名一律取「最新日期」的排名，而非歷史最佳排名
  {
    // 收集所有卡片的 appId
    const allCardIds = new Set();
    for (const card of filtered) allCardIds.add(card.appId);
    // 掃描所有日期的快照，合併結果（按日期正序，後者覆蓋前者 = 最新排名）
    const allMarketResults = new Map();
    for (const snapDate of state.availableDates) {
      if (!state.snapshots[snapDate]) continue;
      const dayResults = findAppInAllMarkets(snapDate, allCardIds);
      for (const [aid, entries] of dayResults) {
        if (!allMarketResults.has(aid)) allMarketResults.set(aid, []);
        const arr = allMarketResults.get(aid);
        for (const entry of entries) {
          const existing = arr.find(e => e.code === entry.code && e.platform === entry.platform && e.chartType === entry.chartType);
          if (!existing) {
            arr.push({ ...entry, _snapDate: snapDate });
          } else if (snapDate >= (existing._snapDate || '')) {
            // 用更新日期的排名覆蓋（即使新排名較差）
            existing.rank = entry.rank;
            existing._snapDate = snapDate;
          }
        }
      }
    }

    for (const card of filtered) {
      if (!card.markets) card.markets = [];
      if (!card._chartRanks) card._chartRanks = [];
      const found = allMarketResults.get(card.appId);
      if (!found) continue;
      for (const entry of found) {
        // 補充市場國旗
        const existingMarket = card.markets.find(m => m.code === entry.code);
        if (!existingMarket) {
          card.markets.push({ code: entry.code, flag: getFlag(entry.code), name: MARKETS.find(mk => mk.code === entry.code)?.name || entry.code, rank: entry.rank });
        } else if (entry.rank) {
          existingMarket.rank = entry.rank; // 用最新日期的排名覆蓋
        }
        // 補充排行資訊（_chartRanks）— 同市場同榜同平台才算重複
        const chartLabel = entry.chartType === 'grossing' ? '營收' : '免費';
        const mf = getFlag(entry.code);
        if (!card._chartRanks.find(cr => cr.chartLabel === chartLabel && cr.platform === entry.platform && cr.marketFlag === mf)) {
          card._chartRanks.push({ chartLabel, platform: entry.platform, rank: entry.rank, marketFlag: mf, marketCode: entry.code || '' });
        }
      }
    }
  }

  // 後處理：用最新 rankHistory 更新 markets 排名（消除偵測時間差造成的矛盾）
  for (const card of filtered) {
    if (!card._rankHistoryByLine || !card.markets) continue;
    for (const line of Object.values(card._rankHistoryByLine)) {
      if (!line.data || line.data.length === 0) continue;
      const sorted = [...line.data].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const latestRank = sorted[sorted.length - 1]?.rank;
      if (!latestRank) continue;
      // 更新 markets
      const mkt = card.markets.find(m => m.code === line.market);
      if (mkt) mkt.rank = latestRank;
      // 更新 _chartRanks（必須同時比對 marketFlag + chartLabel + platform，避免免費榜/營收榜排名互相汙染）
      if (card._chartRanks) {
        const mf = getFlag(line.market);
        const chartLabelForLine = line.chartType === 'grossing' ? '營收' : '免費';
        const cr = card._chartRanks.find(c =>
          c.marketFlag === mf &&
          c.chartLabel === chartLabelForLine &&
          c.platform === line.platform
        );
        if (cr) cr.rank = latestRank;
      }
    }
  }

  // 後處理：國旗排序 — 排名最好的市場排前面（第一個會亮起 active）
  for (const card of filtered) {
    if (card.markets && card.markets.length > 1) {
      card.markets.sort((a, b) => {
        const ra = a.rank ?? 9999;
        const rb = b.rank ?? 9999;
        return ra - rb;
      });
    }
  }
  // 存合併後的完整清單供 renderTracked 直接使用（不受搜尋/市場篩選影響）
  state.mergedDarkhorses = filtered;

  // 統計數字由 renderStats() 統一從 state.mergedDarkhorses 計算（單一真實來源）
  // 合併完成後觸發一次 renderStats() 刷新統計
  renderStats();

  // ============ 搜尋 / 市場 / 狀態篩選（僅影響黑馬 tab 顯示）============
  filtered = filtered.filter(dh => {
    if (searchTerm) {
      const nameMatch = dh.name.toLowerCase().includes(searchTerm);
      const devMatch = (dh.developer || '').toLowerCase().includes(searchTerm);
      if (!nameMatch && !devMatch) return false;
    }
    if (state.dhMarket !== 'all') {
      const dhMarkets = dh.markets ? dh.markets.map(m => m.code) : [dh.market];
      if (!dhMarkets.includes(state.dhMarket)) return false;
    }
    if (state.dhReportFilter === 'reported' && !findReport(dh.name, dh.appId)) return false;
    if (state.dhReportFilter === 'unreported' && findReport(dh.name, dh.appId)) return false;
    if (state.dhReportFilter === 'new_entry') {
      const latestDate = state.availableDates?.[state.availableDates.length - 1] || '';
      const firstDetected = (dh.detectedAt || '').substring(0, 10);
      if (firstDetected !== latestDate) return false;
    }
    return true;
  });


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
    const hasReport = !!findReport(dh.name, dh.appId);
    const reportBadge = hasReport
      ? '<span class="dh-tag report-ready" title="已有評測報告">已評測</span>'
      : '';
    const scoreBadge = dh.confidenceScore
      ? `<span class="dh-confidence" title="綜合信心分數：依據所有上榜市場的排名、躍升幅度、上榜天數等綜合計算">⭐ ${dh.confidenceScore.toFixed(1)} 分</span>`
      : '';

    // === 確定 primaryMarket（首次偵測市場，穩定不跳動）===
    const isMultiMarket = dh.markets && dh.markets.length > 1;
    let primaryMarket = null;
    if (dh.market) {
      // 優先用首次偵測市場
      const found = dh.markets?.find(m => m.code === dh.market);
      primaryMarket = found || { code: dh.market, flag: dh.marketFlag, name: dh.marketName, rank: dh.currentRank };
    } else if (dh.markets && dh.markets.length > 0) {
      primaryMarket = dh.markets[0];
    } else {
      primaryMarket = { code: '', flag: dh.marketFlag, name: dh.marketName, rank: dh.currentRank };
    }
    // 存到 dh 上供迷你走勢線使用
    dh._primaryMarket = primaryMarket;

    // === 趨勢標籤：取所有市場中最樂觀的趨勢 ===
    const triggerTypes = dh.triggers.map(t => t.strategy);
    const isRetained = !!dh._retained;
    let classBadge = '';
    let trendTooltip = '';
    if (isRetained) {
      classBadge = `<span class="dh-tag dh-class-watch" title="首偵日：${dh._retainedFrom || '未知'}，仍在榜上持續觀察">觀察中</span>`;
    } else {
      // 遍歷所有市場的 rankHistory，計算每個市場的趨勢，取最樂觀
      const TREND_RANK = { 'accel': 4, 'up': 3, 'stable': 2, 'down': 1 };
      let bestTrend = null;   // 'accel' | 'up' | 'stable' | 'down'
      let bestTrendInfo = null; // { flag, name, first, last, count, market }
      let bestTrendHistory = [];

      const evaluateHistory = (history, marketInfo) => {
        if (!history || history.length < 2) return;
        const recentRanks = history.slice(-3).map(r => r.rank || r.currentRank).filter(Boolean);
        if (recentRanks.length < 2) return;
        const first = recentRanks[0];
        const last = recentRanks[recentRanks.length - 1];
        const diff = first - last; // 正數=排名數字變小=上升
        let trend;
        if (diff > 5) {
          trend = triggerTypes.includes('growth_multiplier') ? 'accel' : 'up';
        } else if (diff < -5) {
          // Top 10 保護：排名 ≤10 且下跌 ≤5 名，視為穩定而非回落
          if (last <= 10 && Math.abs(diff) <= 5) {
            trend = 'stable';
          } else {
            trend = 'down';
          }
        } else {
          trend = 'stable';
        }
        // 取最樂觀的趨勢
        if (!bestTrend || TREND_RANK[trend] > TREND_RANK[bestTrend]) {
          bestTrend = trend;
          bestTrendInfo = { ...marketInfo, first, last, count: recentRanks.length };
          bestTrendHistory = history;
        }
      };

      // 逐市場評估
      if (dh._rankHistoryByLine && Object.keys(dh._rankHistoryByLine).length > 0) {
        for (const [key, line] of Object.entries(dh._rankHistoryByLine)) {
          if (!line.data || line.data.length === 0) continue;
          const mktObj = dh.markets?.find(m => m.code === line.market);
          const marketInfo = {
            market: line.market,
            flag: getFlag(line.market),
            name: MARKETS.find(m => m.code === line.market)?.name || line.market,
          };
          evaluateHistory(line.data, marketInfo);
        }
      }
      // fallback：用原始 rankHistory
      if (!bestTrend && dh.rankHistory && dh.rankHistory.length >= 2) {
        evaluateHistory(dh.rankHistory, {
          market: dh.market, flag: primaryMarket.flag, name: primaryMarket.name
        });
      }

      // 存最樂觀市場供走勢線使用
      dh._trendMarket = bestTrendInfo?.market || primaryMarket.code || dh.market || '';
      dh._trendHistory = bestTrendHistory;

      if (bestTrendInfo) {
        trendTooltip = `${bestTrendInfo.flag} ${bestTrendInfo.name}：近 ${bestTrendInfo.count} 天 #${bestTrendInfo.first} → #${bestTrendInfo.last}`;
      }

      if (bestTrend === 'accel') {
        classBadge = `<span class="dh-tag dh-class-accel" title="${trendTooltip}">加速中</span>`;
      } else if (bestTrend === 'up') {
        classBadge = `<span class="dh-tag dh-class-rising" title="${trendTooltip}">上升中</span>`;
      } else if (bestTrend === 'down') {
        classBadge = `<span class="dh-tag dh-class-cooling" title="${trendTooltip}">回落中</span>`;
      } else if (bestTrend === 'stable') {
        classBadge = `<span class="dh-tag dh-class-watch" title="${trendTooltip}">穩定</span>`;
      } else {
        classBadge = triggerTypes.includes('new_entry')
          ? '<span class="dh-tag dh-class-new" title="首次進入排行榜">新進榜</span>'
          : triggerTypes.includes('rank_jump') || triggerTypes.includes('consecutive_rise')
            ? '<span class="dh-tag dh-class-rising" title="排名急升">上升中</span>'
            : '';
      }
    }
    // 上架日期
    const rawReleased = state.analysis[dh.appId]?.detail?.released || '';
    const releasedDate = rawReleased ? (() => { try { const d = new Date(rawReleased); return isNaN(d) ? rawReleased : d.toISOString().split('T')[0]; } catch { return rawReleased; } })() : '';
    // === 排名計算（必須在國旗 HTML 之前） ===
    // 排名顯示（合併後可能多排行）
    let chartRanks = dh._chartRanks || [{ chartLabel: dh.chartType === 'grossing' ? '營收' : '免費', platform: dh.platform, rank: dh.currentRank, marketFlag: dh.marketFlag || '' }];
    
    // 市場權重（同名次時優先顯示商業價值高的市場）
    const RANK_MARKET_WEIGHTS = {
      '🇯🇵': 1.6, '🇺🇸': 1.5, '🇰🇷': 1.4, '🇨🇳': 1.3,
      '🇹🇼': 1.0, '🇹🇭': 1.0, '🇻🇳': 1.0, '🇵🇭': 0.9,
    };

    // 排序：加權排名（營收 ×0.5、免費 ×1.0）— 營收含金量較高
    chartRanks.sort((a, b) => {
      const wa = a.rank * (a.chartLabel === '營收' ? 0.5 : 1);
      const wb = b.rank * (b.chartLabel === '營收' ? 0.5 : 1);
      if (wa !== wb) return wa - wb;
      return (RANK_MARKET_WEIGHTS[b.marketFlag] || 0.5) - (RANK_MARKET_WEIGHTS[a.marketFlag] || 0.5);
    });

    const hasMultiMarkets = dh.markets && dh.markets.length > 1;
    const displayRanks = chartRanks.slice(0, 2);
    const hiddenRanks = chartRanks.slice(2);

    // 對齊：國旗順序完全跟隨右上角 chartRanks 的加權排序
    const topMarketCode = displayRanks[0]?.marketCode || '';
    if (topMarketCode && dh.markets && dh.markets.length > 1) {
      dh._primaryDisplayMarket = topMarketCode;
      // 依照 chartRanks 排好的順序提取不重複的 marketCode
      const orderedCodes = [];
      for (const cr of chartRanks) {
        if (cr.marketCode && !orderedCodes.includes(cr.marketCode)) {
          orderedCodes.push(cr.marketCode);
        }
      }
      dh.markets.sort((a, b) => {
        const idxA = orderedCodes.indexOf(a.code);
        const idxB = orderedCodes.indexOf(b.code);
        // 有出現在 chartRanks 的排前面，沒出現的排最後
        const posA = idxA >= 0 ? idxA : 9999;
        const posB = idxB >= 0 ? idxB : 9999;
        return posA - posB;
      });
    }
    // 存一份排好的國旗順序供 Modal 使用
    dh._sortedMarketOrder = (dh.markets || []).map(m => m.code);

    // 多市場標籤（hover 顯示該國排名）
    const cardId = `${dh.appId.replace(/[^a-zA-Z0-9]/g, '_')}-${dh.platform}`;
    const marketTags = isMultiMarket
      ? dh.markets.map((m, i) => {
          return `<span class="dh-tag market${i === 0 ? ' active' : ''}" title="${m.name || m.code}：#${m.rank || '?'}">${getFlag(m.code) || m.flag || ''}</span>`;
        }).join('')
      : `<span class="dh-tag market active">${getFlag(dh.market) || dh.marketFlag || ''} ${dh.marketName || ''}</span>`;
    // 平台顯示（合併後可能多平台）
    const platforms = dh._platforms || [dh.platform];
    const platformLabel = platforms.length >= 2
      ? `${ICON_IOS} ${ICON_ANDROID}`
      : `${platforms[0] === 'android' ? ICON_ANDROID : ICON_IOS}`;

    let rankHtml = displayRanks.map(cr => {
      const pIcon = cr.platform === 'android' ? ICON_ANDROID : ICON_IOS;
      const rtCls = cr.chartLabel === '營收' ? 'rt-grossing' : 'rt-free';
      const mFlag = cr.marketFlag ? `<span style="font-size:11px;margin-right:2px">${cr.marketFlag}</span>` : '';
      return `<div class="dh-rank-row">${mFlag}<span class="dh-rank-type ${rtCls}">${cr.chartLabel}</span>${pIcon}<span class="dh-rank-num">#${cr.rank}</span></div>`;
    }).join('');

    if (hiddenRanks.length > 0) {
      const tooltipText = hiddenRanks.map(cr => `${cr.marketFlag || ''} ${cr.chartLabel} #${cr.rank}`).join('&#10;');
      rankHtml += `<div class="dh-rank-row" style="justify-content:flex-end;opacity:0.6;font-size:10px;cursor:help;margin-top:2px" title="${tooltipText}">+${hiddenRanks.length} 個排行</div>`;
    }



    return `
    <div class="dh-card ${hasAnalysis ? 'has-analysis' : ''} ${hasReport ? 'has-report' : ''}" onclick="showAnalysis('${dh.appId}', '${dh.platform}')">
      <div class="dh-header">
        <img class="dh-icon" src="${dh.icon || ''}" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23333%22 width=%22100%22 height=%22100%22 rx=%2220%22/><text x=%2250%22 y=%2258%22 text-anchor=%22middle%22 fill=%22%23888%22 font-size=%2240%22>🎮</text></svg>'">
        <div class="dh-info">
          <div class="dh-name">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${dh.name}</span>
          </div>
          <div class="dh-developer">${dh.developer || ''}</div>
          <div class="dh-platform-inline">${platformLabel}</div>
        </div>
        <div class="dh-rank-block">${rankHtml}</div>
      </div>
      <div class="dh-meta">
        ${marketTags}
        ${scoreBadge}
        ${detectBuyChart(dh, state.analysis[dh.appId], dh)}
      </div>
      <div class="dh-chart-mini"><canvas id="mini-${cardId}"></canvas></div>
      <div class="dh-card-footer">${releasedDate ? `<div class="dh-released">上架 ${releasedDate}</div>` : '<div></div>'}${reportBadge}</div>
    </div>
  `;
  }).join('');

  // 強制瀏覽器重繪 emoji 國旗（解決大量卡片渲染時 emoji 消失問題）
  requestAnimationFrame(() => {
    listEl.querySelectorAll('.dh-tag.market, .dh-rank-row').forEach(el => {
      el.style.willChange = 'contents';
    });
    requestAnimationFrame(() => {
      listEl.querySelectorAll('.dh-tag.market, .dh-rank-row').forEach(el => {
        el.style.willChange = '';
      });
    });
  });

  setTimeout(() => {
    const canvasMap = new Map();
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const canvas = entry.target;
          const dh = canvasMap.get(canvas);
          if (dh) {
            // 迷你圖：優先用右上角排名第一名的國家資料（與國旗順序一致）
            let miniHistory = [];
            const primaryMkt = dh._primaryDisplayMarket;
            if (primaryMkt && dh._rankHistoryByLine) {
              // 在該國的所有線中取資料最長的
              let bestLine = null;
              for (const line of Object.values(dh._rankHistoryByLine)) {
                if (line.market === primaryMkt && line.data && line.data.length > 0) {
                  if (!bestLine || line.data.length > bestLine.data.length) bestLine = line;
                }
              }
              if (bestLine) miniHistory = bestLine.data;
            }
            // fallback 1：用 _trendHistory 或 rankHistory（注意空陣列是 truthy）
            if (miniHistory.length === 0) {
              miniHistory = (dh._trendHistory && dh._trendHistory.length > 0) ? dh._trendHistory : [];
            }
            if (miniHistory.length === 0) {
              miniHistory = dh.rankHistory || [];
            }
            // fallback 2：_rankHistoryByLine 取任意最長線
            if (miniHistory.length === 0 && dh._rankHistoryByLine) {
              let bestLine = null;
              for (const line of Object.values(dh._rankHistoryByLine)) {
                if (line.data && line.data.length > 0 && (!bestLine || line.data.length > bestLine.data.length)) bestLine = line;
              }
              if (bestLine) miniHistory = bestLine.data;
            }
            if (miniHistory.length < 3) {
              canvas.style.display = 'none';
              canvas.parentElement.innerHTML = `
                <div style="height:50px;display:flex;align-items:center;justify-content:center;border:1px dashed rgba(255,255,255,0.08);border-radius:var(--radius-sm);background:rgba(255,255,255,0.01);color:var(--text-secondary);opacity:0.7;font-size:11px;gap:6px;letter-spacing:0.3px;width:100%">
                  新進榜首日，正累積歷史軌跡
                </div>
              `;
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
  const rawRanks = recent7Dates.map(d => {
    const val = dataMap.get(d);
    return (val === null || val === undefined) ? null : val;
  });
  // 填補 null（無快照的日期）：沿用前一天的排名，避免線條暴跌到底部
  let lastKnown = null;
  const ranks = rawRanks.map(r => {
    if (r !== null) { lastKnown = r; return r; }
    return lastKnown !== null ? lastKnown : OFF_CHART_RANK;
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
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>⏳ 載入中...</p></div></td></tr>';
    const currentIdx = state.availableDates.indexOf(state.selectedDate);
    await ensureSnapshotLoaded(state.selectedDate, state.rankMarket);

    // 往前找最近一天有該市場資料的快照並預載
    const market = state.rankMarket;
    const platform = state.platform;
    const chartType = state.chartType;
    const platforms = platform === 'all' ? ['android', 'ios'] : [platform];
    for (let i = currentIdx - 1; i >= 0; i--) {
      const prevDate = state.availableDates[i];
      await ensureSnapshotLoaded(prevDate, market);
      const snap = state.snapshots[prevDate];
      if (snap && snap[market]) {
        const mData = snap[market];
        const hasData = platforms.some(p => mData[p] && mData[p][chartType] && mData[p][chartType].data && mData[p][chartType].data.length > 0);
        if (hasData) break;
      }
    }
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
    return getMergeKey(app);
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

  // 排名變化：往前找最近一天有該市場/平台/榜型資料的快照
  let prevApps = {};
  {
    let prevIdx = currentIdx - 1;
    while (prevIdx >= 0) {
      const prevDate = state.availableDates[prevIdx];
      const prevSnap = state.snapshots[prevDate];
      if (prevSnap && prevSnap[state.rankMarket]) {
        const pMarket = prevSnap[state.rankMarket];
        // 確認該市場有對應平台+榜型的資料
        const hasData = platforms.some(p => pMarket[p] && pMarket[p][state.chartType] && pMarket[p][state.chartType].data && pMarket[p][state.chartType].data.length > 0);
        if (hasData) {
          let prevList = [];
          platforms.forEach(p => {
            if (pMarket[p] && pMarket[p][state.chartType]) {
              (pMarket[p][state.chartType].data || []).forEach(app => prevList.push({ ...app, _platform: p }));
            }
          });
          if (state.platform === 'all') {
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
          break;
        }
      }
      prevIdx--;
    }
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
      ? '<span class="rank-report-badge" title="已有評測報告">評測</span>'
      : '';
    const isDarkhorse = state.darkhorses.some(d => {
      const dName = d.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '').substring(0, 20);
      const aName = app.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '').substring(0, 20);
      return dName === aName || d.appId === app.appId;
    });
    const rankDhBadge = isDarkhorse
      ? '<span class="rank-dh-badge" title="黑馬遊戲">黑馬</span>'
      : '';

    return `<tr onclick="showGameInfo('${app.appId}','${app._platform}')" style="cursor:pointer" title="點擊查看遊戲資訊">
      <td class="rank-cell">${app.rank}</td>
      <td class="rank-change">${changeHtml}</td>
      <td><div class="app-cell">
        <img src="${app.icon || ''}" alt="" onerror="this.style.display='none'">
        <div class="app-cell-info">
          <div style="display:flex; align-items:center;">
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
      <tr class="rank-pagination"><td colspan="6">
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
  // 找出同遊戲的所有 darkhorse（可能有多個：不同平台、不同排行、不同包名）
  const allDh = findRelatedDarkhorses(appId);

  // 修正：動態同步 allDh 的 currentRank 及其 triggers 的名次為最新排名，解決彈窗黑馬觸發條件名次過期的問題
  // ⚠️ 重要：不可直接修改原始 dh 物件（它是 state.darkhorses 的 reference），否則會汙染卡片渲染的排名
  allDh.forEach(dh => {
    // 優先從當日排行榜快照獲取最新排名，以確保最新最準確
    let latestRank = null;
    const targetMarket = dh.market || dh.marketCode || state.rankMarket;
    const date = state.selectedDate;
    if (date && state.snapshots[date] && state.snapshots[date][targetMarket]) {
      const md = state.snapshots[date][targetMarket];
      const plat = dh.platform;
      const chartType = dh.chartType || 'topfree';
      if (md[plat] && md[plat][chartType]) {
        const found = md[plat][chartType].data.find(a => a.appId === dh.appId);
        if (found) latestRank = found.rank;
      }
    }
    // 如果快照找不到，退而求其次使用 dh.currentRank
    if (!latestRank) latestRank = dh.currentRank;

    // 只設定 _latestRank 供 modal 內渲染用，不修改 currentRank 和 markets
    dh._modalLatestRank = latestRank;
    if (dh.triggers) {
      dh.triggers.forEach(t => {
        // 動態儲存最新排名，在渲染時才進行格式化，不破壞底層原始偵測資料
        t._latestRank = latestRank;
        });
    }
  });

  const allAppIds = Array.from(new Set(allDh.map(d => d.appId).concat([appId])));
  let dh = allDh.find(d => d.appId === appId && d.platform === platform) || allDh.find(d => allAppIds.includes(d.appId)) || allDh[0];
  // 優先使用合併後的 dh（state.mergedDarkhorses），因為它才有完整的 _chartRanks 資料
  // 原始 state.darkhorses 的 dh 沒有經過合併與快照補充，排序資訊不完整
  if (state.mergedDarkhorses) {
    const mergedDh = state.mergedDarkhorses.find(d => d.appId === appId) || state.mergedDarkhorses.find(d => allAppIds.includes(d.appId));
    if (mergedDh && mergedDh._chartRanks && mergedDh._chartRanks.length > 0) {
      dh = mergedDh;
    }
  }
  
  let analysis = null;
  for (const aid of allAppIds) {
    if (state.analysis[aid]) {
      analysis = state.analysis[aid];
      break;
    }
  }

  // 如果沒有 darkhorse 資料，從排行榜快照取基本資訊
  if (!dh) {
    const date = state.selectedDate;
    let app = null;
    if (date && state.snapshots[date] && state.snapshots[date][state.rankMarket]) {
      const md = state.snapshots[date][state.rankMarket];
      if (md[platform] && md[platform][state.chartType]) {
        app = md[platform][state.chartType].data.find(a => allAppIds.includes(a.appId));
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

  // 找出該遊戲所有上榜的市場（dh.markets 已由 enrichDarkhorseMarketsFromSnapshots 統一補齊）
  const uniqueMarketsMap = new Map();

  // 從所有相關 darkhorse 條目收集市場
  allDh.forEach(d => {
    if (d.markets && d.markets.length > 0) {
      d.markets.forEach(m => {
        if (m && m.code) {
          const existing = uniqueMarketsMap.get(m.code);
          const newRank = m.rank ?? null;
          if (!existing || (newRank && (!existing.rank || newRank < existing.rank))) {
            uniqueMarketsMap.set(m.code, {
              code: m.code,
              flag: getFlag(m.code) || m.flag || '',
              name: m.name || MARKETS.find(x => x.code === m.code)?.name || m.code,
              rank: newRank || (existing?.rank ?? null)
            });
          }
        }
      });
    }
    const mCode = d.market || d.marketCode;
    if (mCode && !uniqueMarketsMap.has(mCode)) {
      const marketObj = MARKETS.find(x => x.code === mCode);
      uniqueMarketsMap.set(mCode, {
        code: mCode,
        flag: getFlag(mCode) || d.marketFlag || '',
        name: d.marketName || marketObj?.name || mCode,
        rank: d.currentRank || null
      });
    }
  });

  // 補充：從快照掃描所有日期（Top 100 出現過就要顯示國旗）
  const allAppIds2 = new Set(allDh.map(d => d.appId).concat([appId]));
  for (const snapDate of state.availableDates) {
    if (!state.snapshots[snapDate]) continue;
    const snapshotMarkets = findAppInAllMarkets(snapDate, allAppIds2);
    for (const [, entries] of snapshotMarkets) {
      for (const entry of entries) {
        const existing = uniqueMarketsMap.get(entry.code);
        if (!existing) {
          uniqueMarketsMap.set(entry.code, {
            code: entry.code, flag: getFlag(entry.code), name: MARKETS.find(x => x.code === entry.code)?.name || entry.code, rank: entry.rank
          });
        } else if (entry.rank && (!existing.rank || entry.rank < existing.rank)) {
          existing.rank = entry.rank;
        }
      }
    }
  }

  const modalMarkets = Array.from(uniqueMarketsMap.values());
  if (modalMarkets.length === 0) {
    const marketObj = MARKETS.find(x => x.code === state.rankMarket) || { flag: '', name: state.rankMarket };
    modalMarkets.push({
      code: state.rankMarket,
      flag: marketObj.flag,
      name: marketObj.name
    });
  }
  // 按卡片外層相同的加權排序邏輯排列（直接重算，不依賴 _sortedMarketOrder）
  // 與卡片渲染 L1172-1198 完全相同的邏輯
  const MODAL_RANK_MARKET_WEIGHTS = {
    '🇯🇵': 1.6, '🇺🇸': 1.5, '🇰🇷': 1.4, '🇨🇳': 1.3,
    '🇹🇼': 1.0, '🇹🇭': 1.0, '🇻🇳': 1.0, '🇵🇭': 0.9,
  };
  // 從 _chartRanks 計算每個國家的最佳加權分數
  const chartRanks = dh._chartRanks || [];
  const marketBestScore = {}; // code -> best weighted score
  chartRanks.forEach(cr => {
    const code = cr.marketCode || '';
    if (!code) return;
    const weighted = cr.rank * (cr.chartLabel === '營收' ? 0.5 : 1);
    if (marketBestScore[code] === undefined || weighted < marketBestScore[code]) {
      marketBestScore[code] = weighted;
    }
  });
  modalMarkets.sort((a, b) => {
    const sa = marketBestScore[a.code] ?? 9999;
    const sb = marketBestScore[b.code] ?? 9999;
    if (sa !== sb) return sa - sb;
    // 同分時按市場權重排
    const flagA = getFlag(a.code) || '';
    const flagB = getFlag(b.code) || '';
    return (MODAL_RANK_MARKET_WEIGHTS[flagB] || 0.5) - (MODAL_RANK_MARKET_WEIGHTS[flagA] || 0.5);
  });

  // 決定初始市場：取排名最好的市場（與外層卡片排序一致）
  let initialMarketCode = modalMarkets.length > 0 ? modalMarkets[0].code : (dh.market || dh.marketCode || state.rankMarket);
  if (!uniqueMarketsMap.has(initialMarketCode) && modalMarkets.length > 0) {
    initialMarketCode = modalMarkets[0].code;
  }
  state.modalActiveMarket = initialMarketCode;

  // 動態擴充與更新 dh._rankHistoryByLine，確保即使是跌出黑馬榜的追蹤遊戲，排名圖表也會更新
  if (dh) {
    rebuildModalRankHistory(dh, allDh, state.modalActiveMarket);
  }

  // 合併所有 trigger 並標記來源（以 strategy+label 去重，避免重複顯示）
  const mergedTriggers = [];
  const seenTriggerKeys = new Set();
  const seenPlatforms = new Set();
  allDh.forEach(d => {
    seenPlatforms.add(d.platform);
    const baseChartLabel = d.chartType === 'grossing' ? '營收' : '免費';
    const platformName = d.platform === 'android' ? 'Android' : 'iOS';
    
    // 取得該平台黑馬的首次偵測日期
    const triggerDate = (() => {
      const raw = d.detectedAt || d._retainedFrom || '';
      if (!raw) return '';
      try { return new Date(raw).toISOString().split('T')[0]; } catch { return raw.split('T')[0]; }
    })();

    d.triggers.forEach(t => {
      // 尋找此 trigger 所屬的市場資訊
      let tFlag = t.marketFlag || '';
      let tName = t.marketName || '';
      
      // 如果 trigger 物件本身沒有，且含有 t.market，從 d.markets 中找
      if (!tFlag && t.market && d.markets) {
        const fm = d.markets.find(m => m.code === t.market);
        if (fm) {
          tFlag = fm.flag || '';
          tName = fm.name || '';
        }
      }
      
      // 如果還是沒有，且 d.market 存在，使用 d.marketFlag 與 d.marketName 作為歷史 trigger 的備用市場資訊
      if (!tFlag && d.market) {
        tFlag = d.marketFlag || '';
        tName = d.marketName || '';
      }

      const marketSuffix = (tFlag && tName) ? ` ‧ ${tFlag} ${tName}` : '';
      let triggerSrc = t._src;
      
      if (!triggerSrc) {
        let baseSrc = `${d.platform === 'android' ? ICON_ANDROID : ICON_IOS} ${baseChartLabel}`;
        if (t.label && (t.label.includes('雙榜') || t.detail?.includes('雙榜'))) baseSrc = '雙榜';
        if (t.label && (t.label.includes('雙平台') || t.detail?.includes('雙平台'))) baseSrc = '雙平台';
        
        triggerSrc = `${baseSrc}${marketSuffix}`;
      } else {
        // 如果 t._src 已經有了，但沒有包含 ‧ 且我們找得到市場資訊，也可以補上
        if (!triggerSrc.includes(' ‧ ') && (tFlag && tName)) {
          triggerSrc = `${triggerSrc}${marketSuffix}`;
        }
      }

      // 用 strategy+src 去重：同一個來源的同一種策略只顯示一次
      const dedupeKey = `${t.strategy || t.label}|${triggerSrc}`;
      if (!seenTriggerKeys.has(dedupeKey)) {
        seenTriggerKeys.add(dedupeKey);
        mergedTriggers.push({ ...t, _src: triggerSrc, _srcPlatform: d.platform, _detectedAt: t._detectedAt || triggerDate });
      }
    });
  });

  dh.mergedTriggers = mergedTriggers;

  // 平台顯示：從黑馬條目收集，同時掃描快照用名稱匹配發現跨平台
  const platformArr = Array.from(seenPlatforms);
  if (platformArr.length === 0 && platform) platformArr.push(platform);
  // 檢查快照中是否有另一個平台（例如只偵測到 Android 但 iOS 也有上榜）
  if (platformArr.length < 2) {
    const otherPlat = platformArr[0] === 'android' ? 'ios' : 'android';
    const mergeKey = typeof getMergeKey === 'function' ? getMergeKey(dh) : '';
    if (mergeKey) {
      const checkDates = state.availableDates.slice(-7);
      outer: for (const date of checkDates) {
        const snap = state.snapshots[date];
        if (!snap) continue;
        for (const mktCode of Object.keys(snap)) {
          for (const ct of ['topfree', 'grossing']) {
            const chartData = snap[mktCode][otherPlat]?.[ct]?.data || [];
            for (const app of chartData) {
              const appKey = typeof getMergeKey === 'function' ? getMergeKey({ name: app.name }) : '';
              if (appKey && appKey === mergeKey) {
                platformArr.push(otherPlat);
                break outer;
              }
            }
          }
        }
      }
    }
  }
  const platformDisplay = platformArr.length >= 2
    ? `${ICON_IOS} ${ICON_ANDROID}`
    : `${platformArr[0] === 'android' ? ICON_ANDROID : ICON_IOS}`;

  // 首次偵測日期格式化
  const detectedAtStr = (() => {
    const raw = dh.detectedAt || dh._retainedFrom || '';
    if (!raw) return null;
    try { return new Date(raw).toISOString().split('T')[0]; } catch { return raw.split('T')[0]; }
  })();
  const isRetainedModal = !!dh._retained;
  const isDarkhorseMode = mergedTriggers.length > 0;

  // 1. AI 深度研判與摘要 (Unified block)
  let aiSectionHtml = '';
  const reportMd = findReport(dh.name, dh.appId);

  // Extract Markdown summary if report exists
  let extractedSummary = '';
  if (reportMd) {
    // 嘗試匹配各種「一句話」格式
    const summaryMatch = reportMd.match(/> ?\*\*📌 一句話評語\*\*[：:](.*)/) 
                      || reportMd.match(/> ?🚀 \*\*一句話[：:]\*\* ?(.*)/)
                      || reportMd.match(/> ?\*\*一句話[：:]\*\* ?(.*)/);
    if (summaryMatch) {
      extractedSummary = summaryMatch[1].trim();
    } else {
      const reportLines = reportMd.split('\n');
      for (const line of reportLines) {
        if (line.startsWith('> ') && !line.includes('評測依據') && !line.includes('評測方法') && !line.includes('確信度') && !line.trim().startsWith('> |')) {
          extractedSummary = line
            .replace(/^>\s*/, '')
            .replace(/^🚀\s*/, '')
            .replace(/^\*\*📌?\s*一句話[評語]*\*\*[：:]\s*/, '')
            .replace(/^\*\*一句話[：:]\*\*\s*/, '')
            .trim();
          break;
        }
      }
    }
  }

  // Determine main summary text
  let mainSummary = '';
  if (extractedSummary) {
    mainSummary = extractedSummary;
  } else if (analysis && analysis.aiSummary) {
    mainSummary = analysis.aiSummary;
  } else if (reportMd) {
    mainSummary = "此遊戲已完成完整產品評測與市場表現研判。";
  }

  if (mainSummary) {
    aiSectionHtml = `
      <div class="analysis-section">
        <h4>📋 深度研判與摘要</h4>
        <div class="ai-conclusion-card">
          <div class="ai-conclusion-summary">
            ${mainSummary}
          </div>
        </div>
      </div>
    `;
  } else {
    aiSectionHtml = `
      <div class="analysis-section">
        <h4>📋 深度研判與摘要</h4>
        <div class="ai-conclusion-card" style="border-left-color: var(--text-muted);">
          <p style="color:var(--text-muted); margin:0; font-size:13px;">尚未分析此遊戲。請在對話中輸入「分析 [遊戲名稱]」。</p>
        </div>
      </div>
    `;
  }

  // 2. 黑馬偵測快照與「生命軌跡時間軸」
  let triggersTimelineHtml = '';
  if (isDarkhorseMode) {
    const timelineGroups = {};
    mergedTriggers.forEach(t => {
      const raw = t._detectedAt || '歷史偵測';
      // 將 ISO 時間戳格式化為 YYYY-MM-DD
      const dKey = raw === '歷史偵測' ? raw : raw.substring(0, 10);
      if (!timelineGroups[dKey]) timelineGroups[dKey] = [];
      timelineGroups[dKey].push(t);
    });

    const sortedDates = Object.keys(timelineGroups).sort((a, b) => {
      if (a === '歷史偵測') return 1;
      if (b === '歷史偵測') return -1;
      return b.localeCompare(a);
    });

    triggersTimelineHtml = `
    <div class="analysis-section">
      <h4>📅 歷史偵測生命軌跡時間軸</h4>
      <div class="timeline">
        ${sortedDates.map((date, dateIdx) => {
          const triggersInDate = timelineGroups[date];
          const isLatest = dateIdx === 0;
          const collapsed = !isLatest;
          return `
            <div class="timeline-item${collapsed ? ' collapsed' : ''}">
              <div class="timeline-badge"></div>
              <div class="timeline-date timeline-toggle" onclick="this.parentElement.classList.toggle('collapsed')" style="cursor:pointer;user-select:none;display:flex;align-items:center;gap:6px">
                ${date}
                <span style="font-size:10px;opacity:0.5" class="toggle-arrow">▼</span>
                <span style="font-size:10px;opacity:0.4;margin-left:auto">${triggersInDate.length} 筆</span>
              </div>
              <div class="timeline-content" style="gap: 4px;">
                ${triggersInDate.map(t => {
                  const srcCls = t._src?.includes('營收') ? 'src-grossing' : t._src === '雙榜' ? 'src-dual' : t._src === '雙平台' ? 'src-cross' : 'src-free';
                  const srcTag = `<span class="trigger-src ${srcCls}">${t._src}</span>`;
                  const formattedDetail = formatTriggerDetail(t.detail, t._latestRank || dh.currentRank);
                  return `
                    <div class="timeline-row">
                      <div class="timeline-row-title">${srcTag} <strong>${t.label}</strong></div>
                      <div class="timeline-row-detail">${formattedDetail}</div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>`;
  }

  // 3. 基礎 4 項數據縮小為底部橫條
  let detail = analysis?.detail || {};
  if (!detail.released) {
    const date = state.selectedDate;
    if (date && state.snapshots[date] && state.snapshots[date][state.rankMarket]) {
      const md = state.snapshots[date][state.rankMarket];
      for (const p of ['ios', 'android']) {
        for (const ct of ['topfree', 'grossing']) {
          if (md[p] && md[p][ct]) {
            const found = md[p][ct].data.find(a => allAppIds.includes(a.appId));
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

  const footerMetadataHtml = `
    <div class="modal-footer-metadata">
      <span>📅 上架日期：${released}</span>
      <span>🔄 最近更新：${updated}</span>
      <span>🔞 內容分級：${contentRating}</span>
      <span>💰 價格定位：${priceStr}</span>
    </div>
  `;

  // 4. 其它區塊 (遊戲簡介, 相關報導, 評分分布, 觀察方向, AppMagic Links 等)
  const summary = analysis?.detail?.summary || (() => {
    const date = state.selectedDate;
    if (date && state.snapshots[date] && state.snapshots[date][state.rankMarket]) {
      const md = state.snapshots[date][state.rankMarket];
      for (const p of ['ios', 'android']) {
        for (const ct of ['topfree', 'grossing']) {
          if (md[p] && md[p][ct]) { const f = md[p][ct].data.find(a => allAppIds.includes(a.appId)); if (f && f.summary) return f.summary; }
        }
      }
    }
    return '';
  })();
  const introductionHtml = summary ? `<div class="analysis-section"><h4>📝 遊戲簡介</h4><div class="reason-card" style="border-left-color:var(--accent-purple);font-size:13px;line-height:1.7;color:var(--text-secondary)">${summary}</div></div>` : '';

  const newsHtml = (analysis?.newsArticles || []).length > 0 ? `
    <div class="analysis-section">
      <h4>📰 相關報導</h4>
      ${analysis.newsArticles.map(n => `
        <a href="${n.url}" target="_blank" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:var(--radius-sm);background:rgba(255,255,255,0.03);margin-bottom:6px;text-decoration:none;color:var(--text-secondary);transition:var(--transition)" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
          <span style="font-size:11px;color:var(--text-muted);min-width:80px">${n.source}</span>
          <span style="flex:1;color:var(--text-primary);font-size:13px">${n.title}</span>
          <span style="font-size:11px;color:var(--text-muted)">${n.date || ''}</span>
        </a>`).join('')}
    </div>` : '';

  const ratingsHtml = (analysis?.reviewAnalysis && analysis.reviewAnalysis.total > 0) ? `
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
    </div>` : '';

  const recentChangesHtml = analysis?.detail?.recentChanges ? `
    <div class="analysis-section">
      <h4>📝 最近更新內容</h4>
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:var(--radius-sm)">${analysis.detail.recentChanges}</div>
    </div>` : '';

  const suggestionsHtml = (analysis?.suggestions || []).length > 0 ? `
    <div class="analysis-section">
      <h4>🎯 建議觀察方向</h4>
      ${analysis.suggestions.map(s => `<div style="display:flex;gap:8px;margin-bottom:6px;font-size:13px;color:var(--text-secondary)"><span style="color:var(--accent-cyan)">▸</span>${s}</div>`).join('')}
    </div>` : '';

  const body = document.getElementById('modalBody');
  body.innerHTML = `
    <div class="modal-app-header" style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px; position: relative;">
      <img src="${dh.icon || ''}" alt="" style="width:72px;height:72px;border-radius:16px" onerror="this.style.display='none'">
      <div style="flex: 1; min-width: 0; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap;">
        <div style="min-width: 200px; flex: 1;">
          <div class="modal-app-title" style="word-wrap: break-word; overflow-wrap: break-word; white-space: normal;">${dh.name}</div>
          <div class="modal-app-dev">${dh.developer || ''} · ${modalMarkets.map(m => getFlag(m.code)).filter(Boolean).join(' ')} · ${platformDisplay}</div>
          ${detectedAtStr ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">${isRetainedModal ? '👀 首次偵測' : '🆕 偵測日期'}：${detectedAtStr}${isRetainedModal ? ' · 持續觀察中' : ''}</div>` : ''}
        </div>
        ${findReport(dh.name, dh.appId) ? `
          <button class="report-btn-sleek" style="align-self: flex-start; margin-top: 4px;" onclick="event.stopPropagation();showReport('${dh.name.replace(/'/g, "\\'")}','${dh.appId}','${dh.platform}')">
            📄 查看完整報告
          </button>
        ` : ''}
      </div>
    </div>
    
    <!-- AI 置頂分析區 -->
    ${aiSectionHtml}
    
    <!-- 黑馬歷史偵測生命軌跡時間軸 -->
    ${triggersTimelineHtml}
    
    <!-- 歷史排行走勢圖 -->
    <div class="analysis-section">
      <div class="modal-chart-header">
        <h4 style="margin:0;white-space:nowrap">📈 排名歷史 <span id="modalChartMarketLabel" style="font-weight:500; font-size:13px; color:var(--accent-cyan); margin-left:6px;">(${MARKETS.find(m => m.code === state.modalActiveMarket)?.flag || ''} ${MARKETS.find(m => m.code === state.modalActiveMarket)?.name || state.modalActiveMarket}市場)</span></h4>
        <div id="chartRangePresets" class="chart-range-presets">
          ${[7,14,30].map(d => `<button
            onclick="renderModalChart(window._currentDh, ${d}, this)"
            data-days="${d}"
            class="chart-range-btn${d===7?' active':''}"
          >${d}天</button>`).join('')}
        </div>
      </div>

      <!-- 多國上榜時的市場切換器 -->
      ${modalMarkets.length > 1 ? `
        <div id="modalMarketSelector" class="modal-market-selector">
          ${modalMarkets.map(m => {
            const isActive = m.code === state.modalActiveMarket;
            return `
              <button class="market-tab-btn${isActive ? ' active' : ''}" 
                onclick="switchModalMarket('${m.code}')" 
                data-market="${m.code}"
              >
                ${m.flag} ${m.name}
              </button>
            `;
          }).join('')}
        </div>
      ` : ''}

      <div class="chart-container"><canvas id="modalChart"></canvas></div>
      <div id="chartLegend" class="chart-legend"></div>
    </div>

    <!-- 其它分析細節 -->
    ${introductionHtml}
    ${newsHtml}
    ${ratingsHtml}
    ${recentChangesHtml}
    ${suggestionsHtml}
    
    <!-- 底部收斂橫向 Metadata 文字條 -->
    ${footerMetadataHtml}
    
    <!-- AppMagic 與商店搜尋連結 -->
    ${buildSearchLinksHTML(dh.name, dh.url, dh.appId, dh.platform)}
  `;

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

    // 觸發非同步拉取所有市場 14 天快照，載完後重建國旗 + 市場標籤 + 圖表
    if (state.firebaseMode) {
      setTimeout(async () => {
        let loadedNew = false;
        const datesToLoad = [...state.availableDates].slice(-14);
        
        // 載入所有市場的快照（並行載入加速）
        for (const date of datesToLoad) {
          const loadPromises = MARKETS.map(async (m) => {
            if (!state.snapshots[date] || !state.snapshots[date][m.code]) {
              try {
                await ensureSnapshotLoaded(date, m.code);
                loadedNew = true;
              } catch (e) { /* ignore */ }
            }
          });
          await Promise.all(loadPromises);
        }

        // 載完後：重建 modal 國旗列表 + 市場標籤
        if (loadedNew && window._currentDh && window._currentDh.appId === appId) {
          // 重新掃描所有快照補齊市場國旗
          const refreshedMarkets = new Map();
          // 從 darkhorse 資料
          allDh.forEach(d => {
            if (d.markets) d.markets.forEach(m => { if (m && m.code && !refreshedMarkets.has(m.code)) refreshedMarkets.set(m.code, { code: m.code, flag: getFlag(m.code), name: MARKETS.find(x => x.code === m.code)?.name || m.code, rank: m.rank }); });
            const mc = d.market || d.marketCode;
            if (mc && !refreshedMarkets.has(mc)) refreshedMarkets.set(mc, { code: mc, flag: getFlag(mc), name: d.marketName || MARKETS.find(x => x.code === mc)?.name || mc, rank: d.currentRank });
          });
          // 從所有快照
          const allIds = new Set(allDh.map(d => d.appId).concat([appId]));
          for (const snapDate of state.availableDates) {
            if (!state.snapshots[snapDate]) continue;
            const dayResults = findAppInAllMarkets(snapDate, allIds);
            for (const [, entries] of dayResults) {
              for (const entry of entries) {
                const ex = refreshedMarkets.get(entry.code);
                if (!ex) refreshedMarkets.set(entry.code, { code: entry.code, flag: getFlag(entry.code), name: MARKETS.find(x => x.code === entry.code)?.name || entry.code, rank: entry.rank });
                else if (entry.rank && (!ex.rank || entry.rank < ex.rank)) ex.rank = entry.rank;
              }
            }
          }

          const newModalMarkets = Array.from(refreshedMarkets.values());
          const refreshChartRanks = dh._chartRanks || [];
          const refreshBestScore = {};
          refreshChartRanks.forEach(cr => {
            const code = cr.marketCode || '';
            if (!code) return;
            const weighted = cr.rank * (cr.chartLabel === '營收' ? 0.5 : 1);
            if (refreshBestScore[code] === undefined || weighted < refreshBestScore[code]) {
              refreshBestScore[code] = weighted;
            }
          });
          const REFRESH_MARKET_WEIGHTS = {
            '🇯🇵': 1.6, '🇺🇸': 1.5, '🇰🇷': 1.4, '🇨🇳': 1.3,
            '🇹🇼': 1.0, '🇹🇭': 1.0, '🇻🇳': 1.0, '🇵🇭': 0.9,
          };
          newModalMarkets.sort((a, b) => {
            const sa = refreshBestScore[a.code] ?? 9999;
            const sb = refreshBestScore[b.code] ?? 9999;
            if (sa !== sb) return sa - sb;
            const flagA = getFlag(a.code) || '';
            const flagB = getFlag(b.code) || '';
            return (REFRESH_MARKET_WEIGHTS[flagB] || 0.5) - (REFRESH_MARKET_WEIGHTS[flagA] || 0.5);
          });

          // 更新市場標籤按鈕
          const selectorEl = document.getElementById('modalMarketSelector');
          if (selectorEl && newModalMarkets.length > 1) {
            selectorEl.innerHTML = newModalMarkets.map(m => `
              <button class="market-tab-btn${m.code === state.modalActiveMarket ? ' active' : ''}" 
                onclick="switchModalMarket('${m.code}')" data-market="${m.code}">
                ${m.flag} ${m.name}
              </button>`).join('');
          } else if (!selectorEl && newModalMarkets.length > 1) {
            // 原本沒有 selector（因為只有1個市場），現在有多個了，插入
            const chartHeader = document.querySelector('.modal-chart-header');
            if (chartHeader) {
              const newSelector = document.createElement('div');
              newSelector.id = 'modalMarketSelector';
              newSelector.className = 'modal-market-selector';
              newSelector.innerHTML = newModalMarkets.map(m => `
                <button class="market-tab-btn${m.code === state.modalActiveMarket ? ' active' : ''}" 
                  onclick="switchModalMarket('${m.code}')" data-market="${m.code}">
                  ${m.flag} ${m.name}
                </button>`).join('');
              chartHeader.after(newSelector);
            }
          }

          // 更新 header 國旗
          const devEl = document.querySelector('.modal-app-dev');
          if (devEl) {
            const flagStr = newModalMarkets.map(m => getFlag(m.code)).filter(Boolean).join(' ');
            devEl.innerHTML = devEl.innerHTML.replace(/(?:[\u{1F1E0}-\u{1F1FF}]{2}\s*)+/u, flagStr + ' ');
          }

          // 重建當前市場的排名歷史並重繪圖表
          rebuildModalRankHistory(dh, allDh, state.modalActiveMarket);
          const activeBtn = document.querySelector('#chartRangePresets button.chart-range-btn.active');
          const days = activeBtn ? parseInt(activeBtn.getAttribute('data-days')) : 7;
          renderModalChart(dh, days, activeBtn);
        }
      }, 0);
    }
  }, 200);
}

// ============ 排名歷史重建與市場切換 ============
function rebuildModalRankHistory(dh, allDh, marketCode) {
  dh._rankHistoryByLine = {};

  // 1. From allDh, find any existing rank history for this market
  allDh.forEach(d => {
    const dMarket = d.market || d.marketCode;
    if (dMarket === marketCode && d.rankHistory) {
      const lineKey = `${d.platform}_${d.chartType}`;
      if (!dh._rankHistoryByLine[lineKey]) {
        dh._rankHistoryByLine[lineKey] = { platform: d.platform, chartType: d.chartType, data: [...d.rankHistory] };
      }
    }
  });

  // 2. Scan state.snapshots for the specified marketCode
  // 永遠掃描 iOS + Android 雙平台（即使黑馬只有單平台偵測到）
  const platformsToScan = ['ios', 'android'];
  const allAppIds = new Set(allDh.map(d => d.appId).concat([dh.appId]));
  
  // 從快照中用名稱匹配找出跨平台的 appId（例如 Android 版叫 Genshin Impact，iOS 版叫原神）
  const mergeKey = typeof getMergeKey === 'function' ? getMergeKey(dh) : '';
  if (mergeKey) {
    // 掃描最近幾天的快照，找出名稱匹配的其他 appId
    const recentDates = state.availableDates.slice(-7);
    for (const date of recentDates) {
      const snap = state.snapshots[date];
      if (!snap || !snap[marketCode]) continue;
      for (const plat of platformsToScan) {
        for (const ct of ['topfree', 'grossing']) {
          const chartData = snap[marketCode][plat]?.[ct]?.data || [];
          for (const app of chartData) {
            if (allAppIds.has(app.appId)) continue;
            // 用 getMergeKey 比對名稱
            const appKey = typeof getMergeKey === 'function' ? getMergeKey({ name: app.name }) : '';
            if (appKey && appKey === mergeKey) {
              allAppIds.add(app.appId);
            }
          }
        }
      }
    }
  }
  
  const appIdArr = Array.from(allAppIds);
  
  state.availableDates.forEach(date => {
    const snap = state.snapshots[date];
    if (!snap || !snap[marketCode]) return;
    
    platformsToScan.forEach(plat => {
      ['topfree', 'grossing'].forEach(chartType => {
        const chartData = snap[marketCode][plat]?.[chartType]?.data || [];
        const found = chartData.find(a => appIdArr.includes(a.appId));
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

function switchModalMarket(marketCode) {
  const dh = window._currentDh;
  if (!dh) return;

  state.modalActiveMarket = marketCode;

  // 1. Update the title / label with active flag & name
  const activeMarket = MARKETS.find(m => m.code === marketCode) || { flag: '', name: marketCode };
  const labelEl = document.getElementById('modalChartMarketLabel');
  if (labelEl) {
    labelEl.innerHTML = `(${activeMarket.flag} ${activeMarket.name}市場)`;
  }

  // 2. Update active tab style
  document.querySelectorAll('.market-tab-btn').forEach(btn => {
    const isActive = btn.getAttribute('data-market') === marketCode;
    btn.classList.toggle('active', isActive);
  });

  // 3. Rebuild rank history for this market
  const allDh = findRelatedDarkhorses(dh.appId);

  rebuildModalRankHistory(dh, allDh, marketCode);

  // 4. Render chart (using active preset days)
  const activePresetBtn = document.querySelector('#chartRangePresets button.chart-range-btn.active') || document.querySelector('#chartRangePresets button');
  const days = activePresetBtn ? parseInt(activePresetBtn.getAttribute('data-days')) : 7;
  renderModalChart(dh, days, activePresetBtn);

  // 5. Asynchronously lazyload snapshots for the selected market
  if (state.firebaseMode) {
    const datesToLoad = [...state.availableDates].slice(-14);
    (async () => {
      let loadedNew = false;
      for (const date of datesToLoad) {
        if (!state.snapshots[date] || !state.snapshots[date][marketCode]) {
          try {
            await ensureSnapshotLoaded(date, marketCode);
            loadedNew = true;
          } catch (e) { /* ignore */ }
        }
      }
      
      if (loadedNew && window._currentDh && window._currentDh.appId === dh.appId && state.modalActiveMarket === marketCode) {
        rebuildModalRankHistory(dh, allDh, marketCode);
        const currentActivePresetBtn = document.querySelector('#chartRangePresets button.chart-range-btn.active') || document.querySelector('#chartRangePresets button');
        const currentDays = currentActivePresetBtn ? parseInt(currentActivePresetBtn.getAttribute('data-days')) : 7;
        renderModalChart(dh, currentDays, currentActivePresetBtn);
      }
    })();
  }
}
window.switchModalMarket = switchModalMarket;

// ============ Modal 圖表渲染（支援日期區間篩選）============
function renderModalChart(dh, days, activeBtn) {
  if (modalChart) { modalChart.destroy(); modalChart = null; }
  const canvas = document.getElementById('modalChart');
  if (!canvas) return;

  // 更新 preset 按鈕樣式
  if (activeBtn) {
    document.querySelectorAll('#chartRangePresets button').forEach(btn => {
      btn.classList.toggle('active', btn === activeBtn);
    });
  }

  const LINE_STYLES = {
    'ios_topfree':     { color: '#3b82f6', label: '免費', platform: 'ios' },
    'ios_grossing':    { color: '#8b5cf6', label: '營收', platform: 'ios' },
    'android_topfree': { color: '#10b981', label: '免費', platform: 'android' },
    'android_grossing':{ color: '#f59e0b', label: '營收', platform: 'android' },
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

  // 統一 X 軸日期 (基於系統可用日期序列以確保各市場的時間線起點與長度一致)，並按 days 篩選最後 N 天
  let endIdx = state.availableDates.indexOf(state.selectedDate);
  if (endIdx === -1) endIdx = state.availableDates.length - 1;
  let allDates = state.availableDates.slice(0, endIdx + 1);
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
      pointStyle: 'circle',
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: line.color,
      pointBorderColor: line.color,
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
          display: false,
        },
        tooltip: {
          enabled: false,
          external: function(context) {
            let el = document.getElementById('chartTooltip');
            if (!el) {
              el = document.createElement('div');
              el.id = 'chartTooltip';
              el.className = 'chart-tooltip';
              document.body.appendChild(el);
            }
            const tooltip = context.tooltip;
            if (tooltip.opacity === 0) { el.style.opacity = '0'; return; }
            let html = `<div class="chart-tooltip-title">📅 ${allDates[tooltip.dataPoints?.[0]?.dataIndex] || ''}</div>`;
            tooltip.dataPoints?.forEach(dp => {
              const rank = dp.raw;
              const color = dp.dataset.borderColor;
              const style = Object.values(LINE_STYLES).find(s => s.color === color);
              const icon = style && style.platform === 'android' ? ICON_ANDROID : ICON_IOS;
              const rankText = rank === OFF_CHART_RANK ? '榜外' : `第 #${rank} 名`;
              html += `<div class="chart-tooltip-row"><span class="chart-legend-dot" style="background:${color}"></span>${icon} ${dp.dataset.label}: ${rankText}</div>`;
            });
            el.innerHTML = html;
            el.style.opacity = '1';
            el.style.transform = 'none'; // reset for measurement
            const pos = context.chart.canvas.getBoundingClientRect();
            let left = pos.left + window.scrollX + tooltip.caretX;
            let top = pos.top + window.scrollY + tooltip.caretY;
            // Measure tooltip size
            const tw = el.offsetWidth;
            const th = el.offsetHeight;
            // Clamp horizontally: keep within viewport
            const vw = window.innerWidth;
            left = Math.max(8, Math.min(left - tw / 2, vw - tw - 8));
            // Position above caret, fallback below if too high
            top = top - th - 10;
            if (top < window.scrollY + 4) top = pos.top + window.scrollY + tooltip.caretY + 10;
            el.style.left = left + 'px';
            el.style.top = top + 'px';
          },
        },
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
        y: { 
          reverse: true, 
          min: -3, 
          max: chartMax, 
          grid: { color: 'rgba(255,255,255,0.05)' }, 
          ticks: { color: '#94a3b8' }, 
          afterBuildTicks(axis) { 
            const t = [{value: 1}];
            for (let v = 10; v <= chartMax; v += 10) t.push({value: v});
            axis.ticks = t; 
          } 
        },
      },
    },
  });

  // 自訂 HTML Legend（使用 SVG icon 取代 emoji）
  const legendEl = document.getElementById('chartLegend');
  if (legendEl && datasets.length > 1) {
    legendEl.innerHTML = datasets.map(ds => {
      const style = Object.values(LINE_STYLES).find(s => s.color === ds.borderColor);
      const icon = style && style.platform === 'android' ? ICON_ANDROID : ICON_IOS;
      return `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:${ds.borderColor}"></span>${icon} ${ds.label}</span>`;
    }).join('');
    legendEl.style.display = 'flex';
  } else if (legendEl) {
    legendEl.style.display = 'none';
  }
}
window.renderModalChart = renderModalChart;


window.showAnalysis = showAnalysis;

// ============ 評測報告 ============

/**
 * 模糊匹配報告名稱：去除特殊符號後比對
 * 解決遊戲名有 !、:、- 等符號但資料夾名沒有的匹配問題
 */
function findReport(gameName, appId) {
  if (!state.reports || !gameName) return null;
  // 正規化：轉小寫 → 只保留字母數字與中日韓文字（去掉所有空白符號括號）
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af\u3400-\u4dbf]/g, '');
  // 只保留拉丁字母數字（用來跨語言比較共同前綴）
  const latinOnly = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nameNorm = normalize(gameName);
  const nameLatin = latinOnly(gameName);

  // ---- 1. appId 直接比對（最準確）----
  const meta = state.reports?.['_meta'];
  if (appId && meta) {
    for (const [key, m] of Object.entries(meta)) {
      if (m.appIds && m.appIds.includes(appId)) {
        return state.reports[key] || null;
      }
    }
  }

  // ---- 2. _meta aliases 比對（解決跨語言名稱問題，如 フォートナイト ↔ Fortnite）----
  if (meta) {
    for (const [key, m] of Object.entries(meta)) {
      if (m.aliases) {
        for (const alias of m.aliases) {
          const aliasNorm = normalize(alias);
          if (aliasNorm && nameNorm && (aliasNorm === nameNorm || aliasNorm.includes(nameNorm) || nameNorm.includes(aliasNorm))) {
            return state.reports[key] || null;
          }
          const aliasLatin = latinOnly(alias);
          if (aliasLatin.length >= 4 && nameLatin.length >= 4 && (aliasLatin === nameLatin || aliasLatin.includes(nameLatin) || nameLatin.includes(aliasLatin))) {
            return state.reports[key] || null;
          }
        }
      }
      // appIds 也嘗試用 gameName 中可能包含的數字 ID 匹配
      if (m.appIds && m.appIds.includes(gameName)) {
        return state.reports[key] || null;
      }
    }
  }

  // ---- 3. 原有的 key 比對 ----
  // 若 normalize 後為空字串（如泰文、阿拉伯文等非 CJK/拉丁字元），
  // 不可用 includes 比對，否則任何報告都會 match（includes("") 永遠 true）
  if (!nameNorm) return null;
  for (const key of Object.keys(state.reports)) {
    if (key === '_meta') continue; // 跳過 meta 欄位
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
function showReport(gameName, appId, platform) {
  const md = findReport(gameName, appId);
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
    // 替換平台圖示為網頁專屬 SVG
    html = html.replace(/🤖/g, ICON_ANDROID).replace(/🍎/g, ICON_IOS);
    // 修正狀態 icon 歪掉：td 只含狀態符號時強制置中
    html = html.replace(/<td[^>]*>\s*(✅|⚠️|❌|❓)\s*<\/td>/g,
      '<td style="text-align:center;font-size:16px;vertical-align:middle">$1</td>');
    // 支援 marked.js align 屬性（確保置中對齊生效）
    html = html.replace(/<td align="center"/g, '<td style="text-align:center"');
    html = html.replace(/<th align="center"/g, '<th style="text-align:center"');
    // ★ 報告工具列與下載按手配置 (方案 A：下載按鈕移至報告標題旁，頂部僅留對稱導覽)
    const safeGameName = gameName.replace(/'/g, "\\'");
    
    // 返回按鈕：無文字，純精美圓形 SVG，與右上角關閉按鈕對稱且樣式一致
    const backBtnHtml = appId
      ? `<button class="report-back-btn" onclick="event.stopPropagation();showAnalysis('${appId}','${platform}')" title="返回">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
         </button>`
      : '';
      
    // 渲染基礎內容
    body.innerHTML = `${backBtnHtml}<div class="report-content">${html}</div>`;
    
    // 動態將 Markdown 的第一個 <h1> 改造為包含「下載報告」的雙欄 Hero Header
    const h1 = body.querySelector('.report-content h1');
    if (h1) {
      const headerHero = document.createElement('div');
      headerHero.className = 'report-header-hero';
      
      const titleText = h1.innerHTML;
      headerHero.innerHTML = `
        <h1 class="report-hero-title">${titleText}</h1>
        <button class="report-download-btn" onclick="event.stopPropagation();downloadReportHTML('${safeGameName}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>下載報告
        </button>
      `;
      h1.parentNode.replaceChild(headerHero, h1);
    }
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
  const md = findReport(gameName);  // downloadReportHTML 不帶 appId，靠名稱匹配即可
  if (!md || typeof marked === 'undefined') return;

  const renderer = new marked.Renderer();
  renderer.link = function ({ href, title, text }) {
    const titleAttr = title ? ` title="${title}"` : '';
    return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
  };
  let html = marked.parse(md, { renderer });
  // 替換平台圖示為網頁專屬 SVG
  html = html.replace(/🤖/g, ICON_ANDROID).replace(/🍎/g, ICON_IOS);
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
<div class="footer">Game Radar 遊戲雷達 — 報告產出日期 ${new Date().toISOString().split('T')[0]}</div>
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

// ============ [已移除] 黑馬追蹤功能 ============

/**
 * 買榜分析：根據多重信號判斷是否有買榜疑慮
 * 需至少 2 個信號才標記；信心分數高的遊戲直接跳過（排名趨勢已確認真實）
 */
function detectBuyChart(trackedGame, analysisData, dhMatch) {
  const confidence = trackedGame.confidenceScore || dhMatch?.confidenceScore || 0;
  if (confidence >= 4) return '';
  const signals = [];
  const score = analysisData?.detail?.score || trackedGame.score || 0;
  const rank = trackedGame.currentRank;
  const reviewCount = analysisData?.detail?.ratings || analysisData?.detail?.reviews || 0;
  if (score > 0 && score < 3.5 && rank && rank <= 5) signals.push('低評分高排名');
  if (reviewCount > 0 && reviewCount < 100 && rank && rank <= 5) signals.push('評論數極少');
  if (dhMatch && dhMatch.rankHistory) {
    const validHistory = dhMatch.rankHistory.filter(h => h.rank !== null);
    if (validHistory.length >= 3) {
      let bigSwings = 0;
      for (let i = 1; i < validHistory.length; i++) {
        if (Math.abs(validHistory[i].rank - validHistory[i - 1].rank) >= 30) bigSwings++;
      }
      if (bigSwings >= 2) signals.push('排名鋸齒波動');
    }
  }
  if (dhMatch && dhMatch.markets && dhMatch.markets.length === 1 && rank && rank <= 5) signals.push('僅單一市場上榜');
  if (signals.length < 2) return '';
  const tipText = signals.join('、');
  return `<span class="tracked-status tracked-status--buyChart" title="疑似買榜信號：${tipText}">💰 買榜疑慮</span>`;
}

window.setDhReportFilter = setDhReportFilter;
window.setReportFilterTag = function(tag) {
  state.reportFilterTag = tag;
  renderReportsTab();
};
window.renderReportsTab = renderReportsTab;

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

  const standardizeTag = (tag) => {
    const t = tag.trim();
    const tLower = t.toLowerCase();
    
    // 1. LBS / 地理定位
    if (tLower.includes('lbs') || tLower.includes('location-based') || tLower.includes('ar') || t === 'AR' || t.includes('地理定位') || t.includes('定位') || t.includes('散步') || t.includes('步行') || t.includes('地圖') || t.includes('gps')) {
      return 'LBS / 地理定位';
    }
    // 2. 益智問答
    if (['腦筋急轉彎', '益智問答', '問答', 'trivia', '文字', 'word', 'brain teaser', 'quiz', '數獨', 'sudoku'].some(k => tLower.includes(k))) {
      return '益智問答';
    }
    // 3. 解謎冒險
    if (['解謎', '點擊解謎', '故事解謎', '點擊冒險', 'point-and-click', '冒險', 'adventure', '隱藏物件', 'hidden object', 'puzzle', '益智'].some(k => tLower.includes(k))) {
      return '解謎冒險';
    }
    // 4. 休閒
    if (['休閒', 'casual', '超休閒', 'hypercasual', '放置', 'idle', '養成', '街機', 'arcade', '音樂', 'music', '一般遊戲', '一般'].some(k => tLower.includes(k))) {
      return '休閒';
    }
    // 5. 角色扮演 (RPG)
    if (['角色扮演', 'rpg', 'mmorpg', 'role playing', '冒險rpg', '卡牌rpg', '放置rpg'].some(k => tLower.includes(k))) {
      return '角色扮演 (RPG)';
    }
    // 6. 策略模擬
    if (['策略', 'strategy', '模擬', 'simulation', '經營', '經營模擬', 'tycoon', '塔防', 'tower defense', 'moba', 'slg'].some(k => tLower.includes(k))) {
      return '策略模擬';
    }
    // 7. 動作射擊
    if (['動作', 'action', '射擊', 'shooter', 'fps', 'tps', '大逃殺', 'battle royale', '格鬥', 'fighting'].some(k => tLower.includes(k))) {
      return '動作射擊';
    }
    // 8. 卡牌桌遊
    if (['卡牌', 'card', '桌遊', 'board', '棋牌', '麻將', 'chess'].some(k => tLower.includes(k))) {
      return '卡牌桌遊';
    }
    // 9. 體育競速
    if (['體育', 'sports', '競速', 'racing', '運動', '賽車'].some(k => tLower.includes(k))) {
      return '體育競速';
    }
    // 10. 博弈
    if (['博弈', 'casino', 'slots', '老虎機', '拉霸'].some(k => tLower.includes(k))) {
      return '博弈';
    }
    return t;
  };

  const PREFERRED_ORDER = [
    'LBS / 地理定位',
    '益智問答',
    '解謎冒險',
    '休閒',
    '角色扮演 (RPG)',
    '策略模擬',
    '動作射擊',
    '卡牌桌遊',
    '體育競速',
    '博弈'
  ];

  for (const [reportName, reportData] of Object.entries(state.reports)) {
    if (reportName === '_meta' || typeof reportData !== 'string') continue; // 跳過 meta 欄位
    // 萃取 Markdown 中的類型標籤
    const genreMatch = reportData.match(/\|\s*\|\s*\*\*(?:遊戲)?類型\*\*\s*\|\s*(.+?)\s*\|/) || reportData.match(/\|\s*\*\*(?:遊戲)?類型\*\*\s*\|\s*(.+?)\s*\|/);
    const rawTags = genreMatch ? genreMatch[1].split(/[,\/、]/).map(t => t.trim()).filter(Boolean) : [];
    
    const tagsSet = new Set();
    rawTags.forEach(t => {
      let mapped = t;
      const lowerT = t.toLowerCase();
      for (const [en, zh] of Object.entries(GENRE_I18N)) {
        if (en.toLowerCase() === lowerT) {
          mapped = zh;
          break;
        }
      }
      const std = standardizeTag(mapped);
      if (std) tagsSet.add(std);
    });
    
    const tags = Array.from(tagsSet);
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
      const dh = state.darkhorses.find(d => findReport(d.name, d.appId) === reportData);
      if (dh) appInfo = { appId: dh.appId, name: dh.name, icon: dh.icon || '', developer: dh.developer || '' };
    }

    const gameName = appInfo?.name || reportName;
    const icon = appInfo?.icon || '';
    const developer = appInfo?.developer || '';
    const isDarkhorse = state.darkhorses.some(d => findReport(d.name, d.appId) === reportData);

    // 萃取評測日期
    const dateMatch = reportData.match(/評測日期.*?(\d{4}[-\/]\d{2}[-\/]\d{2})/)
                   || reportData.match(/\|\s*\*\*評測日期\*\*\s*\|\s*(\d{4}[-\/]\d{2}[-\/]\d{2})/);
    const reportDate = dateMatch ? dateMatch[1].replace(/\//g, '-') : '';

    reportCards.push({ reportName, gameName, icon, developer, isDarkhorse, appId: appInfo?.appId, tags, reportDate });
  }

  // 依評測日期排序（越新越前面）
  reportCards.sort((a, b) => (b.reportDate || '').localeCompare(a.reportDate || ''));

  // 渲染標籤雲 UI
  const tagsPills = document.getElementById('reportTagsPills');
  if (tagsPills) {
    let pillsHtml = `<button class="pill ${!state.reportFilterTag || state.reportFilterTag === 'all' ? 'active' : ''}" onclick="setReportFilterTag('all')">全部</button>`;
    Array.from(allTags).sort((a, b) => {
      const idxA = PREFERRED_ORDER.indexOf(a);
      const idxB = PREFERRED_ORDER.indexOf(b);
      const orderA = idxA >= 0 ? idxA : 999;
      const orderB = idxB >= 0 ? idxB : 999;
      return orderA - orderB || a.localeCompare(b);
    }).forEach(tag => {
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
      ? '<span class="dh-tag trigger">黑馬</span>'
      : '<span class="dh-tag benchmark">市場基準</span>';

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
        ${sourceTag}
        ${r.tags.map(t => `<span class="dh-tag" style="background:rgba(255,255,255,0.05);color:var(--text-secondary)">${t}</span>`).join('')}
      </div>
      <div class="dh-card-footer" style="margin-top:auto">
        ${r.reportDate ? `<div class="dh-released">評測 ${r.reportDate}</div>` : '<div></div>'}
        <div class="dh-signals">
          <span class="dh-signal-pill" style="background:rgba(59,130,246,0.12);border-color:rgba(59,130,246,0.25);color:var(--accent-blue)">點擊查看報告</span>
        </div>
      </div>
    </div>`;
  }).join('');
}
