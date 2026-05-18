/**
 * #15 自家遊戲追蹤模組
 */
import { state, MARKETS } from './state.js';

export function renderTrackedGames() {
  const container = document.getElementById('trackedContent');
  if (!container) return;

  if (!state.tracked || !state.tracked.games || state.tracked.games.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">📌</div>
        <p>尚未設定追蹤遊戲。<br>請在 <code>config.js</code> 的 <code>TRACKED_GAMES</code> 陣列中加入你要追蹤的遊戲 appId，<br>然後執行 <code>npm run upload</code>。</p>
      </div>`;
    return;
  }

  const games = state.tracked.games;

  container.innerHTML = games.map(game => {
    // 收集各市場最新排名
    const rankSummary = [];
    for (const market of MARKETS) {
      for (const chartType of ['topfree', 'grossing']) {
        for (const platform of ['android', 'ios']) {
          const key = `${market.code}_${platform}_${chartType}`;
          const history = game.rankings[key];
          if (!history || history.length === 0) continue;
          const latest = history[history.length - 1];
          if (latest.rank) {
            rankSummary.push({
              market: market.flag,
              marketName: market.name,
              platform,
              chartType,
              rank: latest.rank,
              history,
            });
          }
        }
      }
    }

    // 檢查附近是否有黑馬（競爭威脅）
    const threats = [];
    for (const rs of rankSummary) {
      const nearbyDarkhorses = state.darkhorses.filter(dh => {
        if (dh.platform !== rs.platform || dh.chartType !== rs.chartType) return false;
        const dhMarkets = dh.markets ? dh.markets.map(m => m.code) : [dh.market];
        const rsMarketCode = MARKETS.find(m => m.flag === rs.market)?.code;
        if (!dhMarkets.includes(rsMarketCode)) return false;
        // 排名在自家遊戲 ±10 名以內
        return Math.abs(dh.currentRank - rs.rank) <= 10;
      });
      if (nearbyDarkhorses.length > 0) {
        threats.push(...nearbyDarkhorses.map(dh => ({
          name: dh.name,
          rank: dh.currentRank,
          market: rs.market,
          triggers: dh.triggers.map(t => t.label).join(' '),
        })));
      }
    }

    return `
      <div class="tracked-game-card">
        <div class="tracked-header">
          <div class="tracked-name">📌 ${game.name}</div>
          <div class="tracked-ids">
            ${game.androidId ? `<span class="dh-tag platform">Android: ${game.androidId}</span>` : ''}
            ${game.iosId ? `<span class="dh-tag platform">iOS: ${game.iosId}</span>` : ''}
          </div>
        </div>
        ${rankSummary.length > 0 ? `
        <div class="tracked-ranks">
          <h4>📊 各市場排名</h4>
          <div class="tracked-rank-grid">
            ${rankSummary.map(rs => `
              <div class="tracked-rank-item">
                <span class="tracked-rank-market">${rs.market}</span>
                <span class="tracked-rank-num">#${rs.rank}</span>
                <span class="tracked-rank-meta">${rs.platform} · ${rs.chartType === 'topfree' ? '免費' : '營收'}</span>
              </div>
            `).join('')}
          </div>
        </div>` : '<div style="color:var(--text-muted);font-size:13px;padding:12px 0">目前不在任何市場的 Top 100 中</div>'}
        ${threats.length > 0 ? `
        <div class="tracked-threats">
          <h4>⚡ 競爭威脅</h4>
          ${[...new Map(threats.map(t => [t.name, t])).values()].map(t => `
            <div class="threat-item">
              <span class="threat-name">${t.name}</span>
              <span class="threat-rank">#${t.rank}</span>
              <span class="threat-triggers">${t.triggers}</span>
            </div>
          `).join('')}
        </div>` : ''}
      </div>`;
  }).join('');
}
