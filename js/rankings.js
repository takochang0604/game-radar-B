/**
 * 排行榜模組
 * #9 新增評論數欄位
 * #10 手機版卡片式列表
 */
import { state, ICON_ANDROID, ICON_IOS, MARKETS, ensureSnapshotLoaded } from './state.js';
import { showGameModal } from './modal.js';
import { addToTrend } from './trends.js';

export async function renderRankingsAsync() {
  const tbody = document.getElementById('rankingsBody');
  if (state.firebaseMode && state.selectedDate) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><p>⏳ 載入中...</p></div></td></tr>';
    const currentIdx = state.availableDates.indexOf(state.selectedDate);
    const prev = currentIdx > 0 ? state.availableDates[currentIdx - 1] : null;
    await ensureSnapshotLoaded(state.selectedDate, state.rank.market);
    if (prev) await ensureSnapshotLoaded(prev, state.rank.market);
  }
  renderRankings();
}

function dedupeKey(app) {
  return app.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '').substring(0, 30);
}

export function renderRankings() {
  const tbody = document.getElementById('rankingsBody');
  const mobileList = document.getElementById('rankingsMobileList');
  const current = state.selectedDate;
  const currentIdx = state.availableDates.indexOf(current);
  const prev = currentIdx > 0 ? state.availableDates[currentIdx - 1] : null;

  // 排行榜不再有「全部」市場

  if (!current || !state.snapshots[current]) {
    const msg = '<div class="empty-state"><div class="icon">📊</div><p>尚無排行資料</p></div>';
    tbody.innerHTML = `<tr><td colspan="8">${msg}</td></tr>`;
    if (mobileList) mobileList.innerHTML = msg;
    return;
  }

  let apps = [];
  const marketData = state.snapshots[current][state.rank.market];
  if (!marketData) {
    const msg = '<div class="empty-state"><p>此市場無資料</p></div>';
    tbody.innerHTML = `<tr><td colspan="8">${msg}</td></tr>`;
    if (mobileList) mobileList.innerHTML = msg;
    return;
  }

  const platforms = [state.rank.platform];
  platforms.forEach(p => {
    if (marketData[p] && marketData[p][state.rank.chartType]) {
      (marketData[p][state.rank.chartType].data || []).forEach(app => apps.push({ ...app, _platform: p }));
    }
  });

  // 不再需要合併平台邏輯（每個平台獨立選擇）

  updateRankContextTitle();

  // 排名變化
  let prevApps = {};
  if (prev && state.snapshots[prev] && state.snapshots[prev][state.rank.market]) {
    const pMarket = state.snapshots[prev][state.rank.market];
    let prevList = [];
    platforms.forEach(p => {
      if (pMarket[p] && pMarket[p][state.rank.chartType]) {
        (pMarket[p][state.rank.chartType].data || []).forEach(app => prevList.push({ ...app, _platform: p }));
      }
    });

    prevList.forEach(app => { prevApps[app.appId] = app.rank; });
  }

  if (apps.length === 0) {
    const msg = '<div class="empty-state"><p>此篩選條件下無資料</p></div>';
    tbody.innerHTML = `<tr><td colspan="8">${msg}</td></tr>`;
    if (mobileList) mobileList.innerHTML = msg;
    return;
  }

  // 桌面版表格
  tbody.innerHTML = apps.map(app => {
    const prevRank = prevApps[app.appId];
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
    // #9 評論數
    const ratingsStr = app.ratings ? formatNumber(app.ratings) : '-';

    return `<tr onclick="showGameInfo('${app.appId}','${app._platform}')" style="cursor:pointer" title="點擊查看遊戲資訊">
      <td class="rank-cell">${app.rank}</td>
      <td class="rank-change">${changeHtml}</td>
      <td><div class="app-cell">
        <img src="${app.icon || ''}" alt="" onerror="this.style.display='none'">
        <div class="app-cell-info"><div class="app-cell-name">${app.name}</div><div class="app-cell-dev">${app.developer || ''}</div></div>
      </div></td>
      <td><span class="category-tag">${cat}</span></td>
      <td class="score-cell">⭐ ${scoreStr}</td>
      <td class="ratings-cell">${ratingsStr}</td>
      <td class="released-cell" style="font-size:12px;color:var(--text-muted);white-space:nowrap">${app.released || '-'}</td>
      <td>${platformIcon}</td>
    </tr>`;
  }).join('');

  // #10 手機版卡片式列表
  if (mobileList) {
    mobileList.innerHTML = apps.map(app => {
      const prevRank = prevApps[app.appId];
      let changeHtml = '';
      if (prevRank != null) {
        const diff = prevRank - app.rank;
        if (diff > 0) changeHtml = `<span class="rank-up">▲${diff}</span>`;
        else if (diff < 0) changeHtml = `<span class="rank-down">▼${Math.abs(diff)}</span>`;
      } else if (state.availableDates.length >= 2) {
        changeHtml = '<span class="rank-up" style="color:var(--accent-cyan)">NEW</span>';
      }
      const scoreStr = app.score ? `⭐${app.score.toFixed(1)}` : '';
      const platformIcon = app._platform === 'android' ? ICON_ANDROID : ICON_IOS;

      return `<div class="rank-card" onclick="showGameInfo('${app.appId}','${app._platform}')">
        <div class="rank-card-rank">#${app.rank}</div>
        <img class="rank-card-icon" src="${app.icon || ''}" alt="" onerror="this.style.display='none'">
        <div class="rank-card-info">
          <div class="rank-card-name">${app.name}</div>
          <div class="rank-card-dev">${app.developer || ''}</div>
        </div>
        <div class="rank-card-right">
          <div class="rank-card-change">${changeHtml}</div>
          <div class="rank-card-score">${scoreStr} ${platformIcon}</div>
        </div>
      </div>`;
    }).join('');
  }

  filterRankings();
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num);
}

// 排行榜搜尋過濾
export function filterRankings() {
  const term = (document.getElementById('rankSearch')?.value || '').toLowerCase().trim();
  const rows = document.querySelectorAll('#rankingsBody tr');
  rows.forEach(row => {
    if (!term) { row.style.display = ''; return; }
    const name = row.querySelector('.app-cell-name')?.textContent?.toLowerCase() || '';
    const dev = row.querySelector('.app-cell-dev')?.textContent?.toLowerCase() || '';
    row.style.display = (name.includes(term) || dev.includes(term)) ? '' : 'none';
  });
  // 手機版
  const cards = document.querySelectorAll('#rankingsMobileList .rank-card');
  cards.forEach(card => {
    if (!term) { card.style.display = ''; return; }
    const name = card.querySelector('.rank-card-name')?.textContent?.toLowerCase() || '';
    const dev = card.querySelector('.rank-card-dev')?.textContent?.toLowerCase() || '';
    card.style.display = (name.includes(term) || dev.includes(term)) ? '' : 'none';
  });
}

// ============ 遊戲資訊 Modal（委派給統一 Modal）============
export function showGameInfo(appId, platform) {
  const date = state.selectedDate;
  if (!date || !state.snapshots[date] || !state.snapshots[date][state.rank.market]) return;
  const marketData = state.snapshots[date][state.rank.market];
  let app = null;
  if (marketData[platform] && marketData[platform][state.rank.chartType]) {
    app = marketData[platform][state.rank.chartType].data.find(a => a.appId === appId);
  }
  if (!app) return;

  showGameModal(app, platform);
}

function updateRankContextTitle() {
  const el = document.getElementById('rankContextTitle');
  if (!el) return;
  const mObj = MARKETS.find(m => m.code === state.rank.market);
  const flag = mObj?.flag || '';
  const mName = mObj?.name || state.rank.market;
  const pName = state.rank.platform === 'ios' ? 'iOS' : 'Android';
  const cName = state.rank.chartType === 'grossing' ? '營收排行' : '免費下載';
  el.textContent = `📊 ${flag} ${mName} · ${pName} · ${cName} Top 100 (${state.selectedDate || ''})`;
}

window.showGameInfo = showGameInfo;
window.filterRankings = filterRankings;
