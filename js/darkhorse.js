/**
 * 黑馬偵測模組 — 黑馬卡片渲染
 * v2: 排名小表格 + 內部排行篩選 + triggers merge + 脫離全域 chartType
 */
import { state, ICON_ANDROID, ICON_IOS, MARKETS } from './state.js';
import { findReport, showGameModal } from './modal.js';
import { addToTrend } from './trends.js';

// 黑馬 tab 使用 state.dh 作為篩選狀態



export function renderDarkhorses() {
  const grid = document.getElementById('darkhorseGrid');
  const searchTerm = (document.getElementById('dhSearch')?.value || '').toLowerCase().trim();

  // ============ 篩選（不受全域 chartType 影響）============
  let filtered = state.darkhorses.filter(dh => {
    if (searchTerm) {
      const nameMatch = dh.name.toLowerCase().includes(searchTerm);
      const devMatch = (dh.developer || '').toLowerCase().includes(searchTerm);
      if (!nameMatch && !devMatch) return false;
    }
    if (state.dh.market !== 'all') {
      if (dh.market !== state.dh.market) return false;
    }
    // 平台篩選
    const dhPlatforms = dh.platforms || [dh.platform];
    if (!dhPlatforms.includes(state.dh.platform)) return false;
    // 排行篩選
    if (state.dh.chartType === 'topfree' && dh.chartType !== 'topfree') return false;
    if (state.dh.chartType === 'grossing' && dh.chartType !== 'grossing') return false;
    return true;
  });

  // ============ 前端去重合併 ============
  // key = name + market（跨 chartType 合併）
  const mergedMap = new Map();
  for (const dh of filtered) {
    const namePart = dh.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '').substring(0, 30);
    const keyMarket = state.dh.market === 'all' ? '' : (dh.market || '');
    const key = namePart + '|' + keyMarket;

    const chartLabel = dh.chartType === 'grossing' ? '營收' : '免費';
    const rbp = dh.rankByPlatform || { [dh.platform]: dh.currentRank };

    if (!mergedMap.has(key)) {
      mergedMap.set(key, {
        ...dh,
        platforms: dh.platforms ? [...dh.platforms] : [dh.platform],
        marketFlags: [{ code: dh.market, flag: dh.marketFlag, name: dh.marketName, rank: dh.currentRank }],
        chartRanks: [{ chartType: dh.chartType, chartLabel, rankByPlatform: { ...rbp }, marketFlag: dh.marketFlag || '' }],
        _chartTypes: new Set([dh.chartType]),
        // 標記 triggers 來源
        triggers: (dh.triggers || []).map(t => ({ ...t, chartLabel: t.chartLabel || chartLabel })),
      });
    } else {
      const existing = mergedMap.get(key);
      if (!existing.platforms) existing.platforms = [existing.platform];
      if (!existing.marketFlags) existing.marketFlags = [{ code: existing.market, flag: existing.marketFlag, name: existing.marketName, rank: existing.currentRank }];
      if (!existing.chartRanks) {
        const erbp = existing.rankByPlatform || { [existing.platform]: existing.currentRank };
        existing.chartRanks = [{ chartType: existing.chartType, chartLabel: existing.chartType === 'grossing' ? '營收' : '免費', rankByPlatform: { ...erbp }, marketFlag: existing.marketFlag || '' }];
      }
      if (!existing._chartTypes) existing._chartTypes = new Set([existing.chartType]);

      // 追加平台
      const newPlatforms = dh.platforms || [dh.platform];
      for (const p of newPlatforms) {
        if (!existing.platforms.includes(p)) existing.platforms.push(p);
      }
      // 追加市場標記
      if (!existing.marketFlags.find(m => m.code === dh.market)) {
        existing.marketFlags.push({ code: dh.market, flag: dh.marketFlag, name: dh.marketName, rank: dh.currentRank });
      }
      // 追加排行類型（不同 chartType 就追加）
      if (!existing._chartTypes.has(dh.chartType)) {
        existing._chartTypes.add(dh.chartType);
        existing.chartRanks.push({ chartType: dh.chartType, chartLabel, rankByPlatform: { ...rbp }, marketFlag: dh.marketFlag || '' });
      }
      // ★ Merge triggers（去重 by strategy，標記來源 chartLabel）
      if (dh.triggers) {
        if (!existing.triggers) existing.triggers = [];
        for (const t of dh.triggers) {
          if (!existing.triggers.find(mt => mt.strategy === t.strategy)) {
            existing.triggers.push({ ...t, chartLabel: t.chartLabel || chartLabel });
          }
        }
      }
      // 保留最高信心分數的版本作為基礎，但保持已合併的資訊
      if ((dh.confidenceScore || 0) > (existing.confidenceScore || 0)) {
        const platforms = existing.platforms;
        const marketFlags = existing.marketFlags;
        const chartRanks = existing.chartRanks;
        const _chartTypes = existing._chartTypes;
        const triggers = existing.triggers;
        Object.assign(existing, dh, { platforms, marketFlags, chartRanks, _chartTypes, triggers });
      }
    }
  }
  filtered = Array.from(mergedMap.values());

  // ============ 雙榜篩選 ============
  if (dhChartFilter === 'dual') {
    filtered = filtered.filter(dh => dh._chartTypes && dh._chartTypes.size >= 2);
  }

  // ============ 前端觸發條件互斥 ============
  for (const dh of filtered) {
    if (!dh.triggers) continue;
    const hasBounce = dh.triggers.some(t => t.strategy === 'bounce_back');
    const hasNewEntry = dh.triggers.some(t => t.strategy === 'new_entry');
    const hasJump = dh.triggers.some(t => t.strategy === 'rank_jump');

    if (hasBounce && hasNewEntry) {
      dh.triggers = dh.triggers.filter(t => t.strategy !== 'new_entry');
    }
    if (hasBounce && hasJump) {
      const jumpT = dh.triggers.find(t => t.strategy === 'rank_jump');
      const bounceT = dh.triggers.find(t => t.strategy === 'bounce_back');
      if (jumpT && bounceT) {
        if ((jumpT.score || 0) >= (bounceT.score || 0)) {
          dh.triggers = dh.triggers.filter(t => t.strategy !== 'bounce_back');
        } else {
          dh.triggers = dh.triggers.filter(t => t.strategy !== 'rank_jump');
        }
      }
    }
  }

  filtered.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

  // ============ 情境標題 ============
  const ctxEl = document.getElementById('dhContextTitle');
  if (ctxEl) {
    const mObj = MARKETS.find(m => m.code === state.dh.market);
    const marketInfo = state.dh.market === 'all' ? '全部市場' :
      `${mObj?.flag || ''} ${mObj?.name || state.dh.market}`;
    const chartInfo = state.dh.chartType === 'all' ? '' : state.dh.chartType === 'dual' ? ' · 雙榜' : state.dh.chartType === 'topfree' ? ' · 免費下載' : ' · 營收';
    const platformInfo = ` · ${state.dh.platform === 'ios' ? 'iOS' : 'Android'}`;
    ctxEl.textContent = `🐴 ${marketInfo}${platformInfo}${chartInfo} · ${filtered.length} 匹黑馬`;
  }

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
  const statDhEl = document.getElementById('statDarkhorses');
  if (statDhEl) statDhEl.textContent = filtered.length;

  grid.innerHTML = filtered.map((dh, idx) => {
    const hasAnalysis = !!state.analysis[dh.appId];
    const hasReport = !!findReport(dh.name);
    const reportBadge = hasReport
      ? '<span class="dh-tag report-ready" title="已有評測報告">📄 已評測</span>'
      : '';
    const scoreBadge = dh.confidenceScore
      ? `<span class="dh-confidence" title="信心分數：越高越可能是真正的黑馬">${dh.confidenceScore.toFixed(1)}⚡</span>`
      : '';
    const rawReleased = state.analysis[dh.appId]?.detail?.released || '';
    const releasedDate = rawReleased ? (() => { try { const d = new Date(rawReleased); return isNaN(d) ? rawReleased : d.toISOString().split('T')[0]; } catch { return rawReleased; } })() : '';
    const summaryText = dh.summary || state.analysis[dh.appId]?.detail?.description || '';
    const summaryTruncated = summaryText.length > 40 ? summaryText.substring(0, 40) + '…' : summaryText;
    const marketTag = dh.marketFlags && dh.marketFlags.length > 1
      ? dh.marketFlags.map(m => `<span class="dh-tag market" title="${m.name} #${m.rank}">${m.flag}</span>`).join('')
      : `<span class="dh-tag market">${dh.marketFlag || ''} ${dh.marketName || ''}</span>`;

    // ★ 排名小表格
    const rankTable = buildRankTable(dh);

    return `
    <div class="dh-card ${hasAnalysis ? 'has-analysis' : ''} ${hasReport ? 'has-report' : ''}" onclick="showDarkhorse('${dh.appId}', '${dh.platform}', '${dh.market || ''}')">
      <div class="dh-header">
        <img class="dh-icon" src="${dh.icon || ''}" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23333%22 width=%22100%22 height=%22100%22 rx=%2220%22/><text x=%2250%22 y=%2258%22 text-anchor=%22middle%22 fill=%22%23888%22 font-size=%2240%22>🎮</text></svg>'">
        <div class="dh-info">
          <div class="dh-name">${dh.name}</div>
          <div class="dh-developer">${dh.developer || ''}</div>
        </div>
        ${rankTable}
      </div>
      ${summaryTruncated ? `<div class="dh-summary">${summaryTruncated}</div>` : ''}
      <div class="dh-meta">
        ${marketTag}
        <span class="dh-tag platform">${(() => { const ps = dh.platforms || [dh.platform]; return ps.map(p => p === 'android' ? ICON_ANDROID : ICON_IOS).join(' ') + ' ' + (ps.length >= 2 ? 'iOS+Android' : ps[0]); })()}</span>
        ${scoreBadge}
        ${reportBadge}
      </div>
      <div class="dh-chart-mini"><canvas id="mini-${dh.appId.replace(/[^a-zA-Z0-9]/g,'_')}-${dh.platform}"></canvas></div>
      <div class="dh-card-footer">
        <div class="dh-triggers">
          ${dh.triggers.map(t => {
            const needsLabel = !['cross_chart', 'cross_platform'].includes(t.strategy);
            const suffix = needsLabel && t.chartLabel ? ` <span style="font-size:10px;opacity:0.6">(${t.chartLabel})</span>` : '';
            return `<div class="dh-trigger-item">${t.detail}${suffix}</div>`;
          }).join('')}
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
      // 取得迷你圖資料：優先 _rankHistoryByLine，fallback 到 rankHistory
      let miniHistory = dh.rankHistory || [];
      if (dh._rankHistoryByLine) {
        const firstLine = Object.values(dh._rankHistoryByLine)[0];
        if (firstLine && firstLine.data) miniHistory = firstLine.data;
      }
      renderMiniChart(canvas, miniHistory);
    });
  }, 100);
}

/**
 * 構建排名顯示 HTML
 */
function buildRankTable(dh) {
  const chartRanks = dh.chartRanks;
  const showMarket = state.dh.market === 'all';

  if (!chartRanks || chartRanks.length === 0) {
    const rbp = dh.rankByPlatform || { [dh.platform]: dh.currentRank };
    const best = getBestRank(rbp);
    const label = dh.chartType === 'grossing' ? '營收' : '免費';
    const flag = showMarket ? (dh.marketFlag || '') + ' ' : '';
    return `<div class="dh-rank">
      <span class="dh-rank-type">${label}</span><span class="platform-icon">${flag}${best.icon}</span><span class="dh-rank-num">#${best.rank}</span>
    </div>`;
  }

  let html = '<div class="dh-rank">';
  for (const cr of chartRanks) {
    const rbp = cr.rankByPlatform || {};
    const best = getBestRank(rbp);
    if (!best) continue;
    const flag = showMarket ? (cr.marketFlag || '') + ' ' : '';
    html += `<span class="dh-rank-type">${cr.chartLabel}</span><span class="platform-icon">${flag}${best.icon}</span><span class="dh-rank-num">#${best.rank}</span>`;
  }
  html += '</div>';
  return html;
}

/** 從 rankByPlatform 取最好的排名 */
function getBestRank(rbp) {
  if (!rbp || Object.keys(rbp).length === 0) return null;
  let bestPlatform = null, bestRank = Infinity;
  for (const [p, r] of Object.entries(rbp)) {
    if (r < bestRank) { bestRank = r; bestPlatform = p; }
  }
  return { platform: bestPlatform, rank: bestRank, icon: bestPlatform === 'ios' ? ICON_IOS : ICON_ANDROID };
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

function showDarkhorse(appId, platform, market) {
  let dh;
  if (market) {
    dh = state.darkhorses.find(d => d.appId === appId && d.market === market);
  }
  if (!dh) {
    dh = state.darkhorses.find(d => d.appId === appId && d.platform === platform);
  }
  if (!dh) {
    dh = state.darkhorses.find(d => d.appId === appId);
  }
  if (!dh) return;

  const app = {
    appId: dh.appId, name: dh.name, developer: dh.developer, icon: dh.icon,
    score: dh.score, category: dh.category, url: dh.url,
    summary: dh.summary || '', released: '', updated: '',
    contentRating: '', free: true, ratings: 0,
  };

  showGameModal(app, dh.platform || platform, dh.market || market);
}

window.showDarkhorse = showDarkhorse;
window.addToTrend = addToTrend;
window.renderDarkhorses = renderDarkhorses;
