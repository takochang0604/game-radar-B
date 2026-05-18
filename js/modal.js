/**
 * Modal 模組 — 統一遊戲資訊 Modal + 評測報告
 * 排行榜和黑馬都使用同一個 showGameModal()
 */
import { state, ICON_ANDROID, ICON_IOS } from './state.js';
import { addToTrend } from './trends.js';

export function initModal() {
  document.getElementById('modalClose').onclick = closeModal;
  document.getElementById('analysisModal').onclick = (e) => {
    if (e.target === e.currentTarget) closeModal();
  };
}

export function closeModal() {
  document.getElementById('analysisModal').classList.remove('active');
}

/**
 * 模糊匹配報告名稱
 */
export function findReport(gameName) {
  if (!state.reports || !gameName) return null;
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af\u3400-\u4dbf]/g, '');
  const nameNorm = normalize(gameName);
  // 若 normalize 後為空字串（如泰文、阿拉伯文等非 CJK/拉丁字元），
  // 不可用 includes 比對，否則任何報告都會 match → 直接回傳 null
  if (!nameNorm) return null;
  for (const key of Object.keys(state.reports)) {
    const keyNorm = normalize(key);
    if (!keyNorm) continue; // 報告 key 也一樣保護
    if (keyNorm === nameNorm || keyNorm.includes(nameNorm) || nameNorm.includes(keyNorm)) {
      return state.reports[key];
    }
  }
  return null;
}

/**
 * 顯示評測報告 Modal
 */
export function showReport(gameName) {
  const md = findReport(gameName);
  if (!md) return;

  const body = document.getElementById('modalBody');
  if (typeof marked !== 'undefined') {
    const renderer = new marked.Renderer();
    renderer.link = function ({ href, title, text }) {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    };
    body.innerHTML = `<div class="report-content">${marked.parse(md, { renderer })}</div>`;
  } else {
    body.innerHTML = `<div class="report-content"><pre style="white-space:pre-wrap;font-size:13px;line-height:1.8;color:var(--text-secondary)">${md.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></div>`;
  }

  document.getElementById('analysisModal').classList.add('active');
}

/**
 * 統一遊戲資訊 Modal
 * 排行榜和黑馬共用，呈現一致
 * @param {Object} app - snapshot 中的遊戲資料
 * @param {string} platform - 'android' | 'ios'
 * @param {string} [market] - 市場代碼（用於精確匹配黑馬資料）
 */
export function showGameModal(app, platform, market) {
  if (!app) return;

  // 優先用 market 精確匹配，fallback 到 platform
  let dh;
  if (market) {
    dh = state.darkhorses.find(d => d.appId === app.appId && d.market === market);
  }
  if (!dh) {
    dh = state.darkhorses.find(d => d.appId === app.appId && d.platform === platform);
  }
  const analysis = state.analysis[app.appId];
  const safeName = (app.name || '').replace(/'/g, "\\'");
  const platformIcon = platform === 'android' ? ICON_ANDROID : ICON_IOS;

  // 上架日期
  const releasedRaw = analysis?.detail?.released || app.released || dh?.released || '';
  const released = releasedRaw ? formatDateSafe(releasedRaw) : '—';
  const updatedRaw = app.updated || analysis?.detail?.updated || '';
  const updated = updatedRaw ? formatDateSafe(updatedRaw) : '—';
  const contentRating = app.contentRating || analysis?.detail?.contentRating || '—';
  const priceStr = app.free === false ? `$${app.price || '?'}` : '免費';

  // 完整簡介（不截斷）
  const fullSummary = app.summary || dh?.summary || analysis?.detail?.description || '';

  const body = document.getElementById('modalBody');
  let html = '';

  // ============ 1. Header ============
  html += `
    <div class="modal-app-header">
      <img src="${app.icon || dh?.icon || ''}" alt="" style="width:72px;height:72px;border-radius:16px" onerror="this.style.display='none'">
      <div>
        <div class="modal-app-title">${app.name}</div>
        <div class="modal-app-dev">${app.developer || '未知開發商'} · ${platformIcon} ${platform === 'android' ? 'Android' : 'iOS'}</div>
      </div>
    </div>`;

  // ============ 1.5 評測報告按鈕（有報告時，放在最顯眼位置）============
  if (findReport(app.name)) {
    html += `
    <button class="report-btn" style="margin-bottom:16px" onclick="event.stopPropagation();showReport('${safeName}')">📄 查看完整評測報告</button>`;
  }

  // ============ 2. 基本資訊卡片 ============
  html += `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin:20px 0">
      <div class="stat-card"><div class="stat-label">上架日期</div><div class="stat-value" style="font-size:15px">${released}</div></div>
      <div class="stat-card"><div class="stat-label">最近更新</div><div class="stat-value" style="font-size:15px">${updated}</div></div>
      <div class="stat-card"><div class="stat-label">內容分級</div><div class="stat-value" style="font-size:15px">${contentRating}</div></div>
      <div class="stat-card"><div class="stat-label">價格</div><div class="stat-value" style="font-size:15px">${priceStr}</div></div>
    </div>`;

  // ============ 3. 遊戲簡介（完整） ============
  if (fullSummary) {
    html += `
    <div class="analysis-section">
      <h4>📝 遊戲簡介</h4>
      <div class="reason-card" style="border-left-color:var(--accent-purple);font-size:13px;line-height:1.7;color:var(--text-secondary)">${fullSummary}</div>
    </div>`;
  }

  // ============ 4. 黑馬觸發條件（如果是黑馬） ============
  if (dh && dh.triggers && dh.triggers.length > 0) {
    const chartLabel = dh.chartType === 'grossing' ? '營收' : '免費';
    let cleanTriggers = dh.triggers.map(t => ({ ...t, chartLabel: t.chartLabel || chartLabel }));
    const hasBounce = cleanTriggers.some(t => t.strategy === 'bounce_back');
    const hasNewEntry = cleanTriggers.some(t => t.strategy === 'new_entry');
    const hasJump = cleanTriggers.some(t => t.strategy === 'rank_jump');
    if (hasBounce && hasNewEntry) {
      cleanTriggers = cleanTriggers.filter(t => t.strategy !== 'new_entry');
    }
    if (hasBounce && hasJump) {
      const jumpT = cleanTriggers.find(t => t.strategy === 'rank_jump');
      const bounceT = cleanTriggers.find(t => t.strategy === 'bounce_back');
      if (jumpT && bounceT) {
        cleanTriggers = (jumpT.score || 0) >= (bounceT.score || 0)
          ? cleanTriggers.filter(t => t.strategy !== 'bounce_back')
          : cleanTriggers.filter(t => t.strategy !== 'rank_jump');
      }
    }

    html += `
    <div class="analysis-section">
      <h4>🐴 黑馬觸發條件</h4>
      ${cleanTriggers.map(t => {
      const needsLabel = !['cross_chart', 'cross_platform'].includes(t.strategy);
      const suffix = needsLabel && t.chartLabel ? ` <span style="font-size:11px;opacity:0.5">(${t.chartLabel})</span>` : '';
      return `<div class="reason-card"><div class="reason-label">${t.label}${suffix}</div><div class="reason-detail">${t.detail}</div></div>`;
    }).join('')}
    </div>`;
  }

  // ============ 5. 排名歷史圖表（如果是黑馬有 rankHistory） ============
  if (dh && ((dh.rankHistory && dh.rankHistory.length > 0) || (dh._rankHistoryByLine && Object.keys(dh._rankHistoryByLine).length > 0))) {
    const chartLabel = dh.chartType === 'grossing' ? '營收' : '免費下載';
    const pLabel = platform === 'ios' ? 'iOS' : 'Android';
    const mLabel = dh.marketFlag || '';
    html += `
    <div class="analysis-section">
      <h4>📈 排名歷史 <span style="font-size:12px;color:var(--text-muted);font-weight:400">${mLabel} ${pLabel} · ${chartLabel}</span></h4>
      <div class="chart-container"><canvas id="modalChart"></canvas></div>
    </div>`;
  }

  // ============ 6. AI 分析摘要 ============
  if (analysis && analysis.aiSummary) {
    html += `
    <div class="analysis-section">
      <h4>📋 AI 分析摘要</h4>
      <div class="reason-card" style="border-left-color:var(--accent-cyan);font-size:14px;line-height:1.7;color:var(--text-primary)">${analysis.aiSummary}</div>
    </div>`;
  }

  // ============ 7. 推測竄升原因 ============
  if (analysis && analysis.inferredReasons && analysis.inferredReasons.length > 0) {
    html += `
    <div class="analysis-section">
      <h4>🔍 推測竄升原因</h4>
      ${analysis.inferredReasons.map(r => `
        <div class="reason-card" style="border-left-color:${r.confidence === 'high' ? 'var(--accent-green)' : r.confidence === 'medium' ? 'var(--accent-yellow)' : 'var(--text-muted)'}">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <div class="reason-label">${r.label}</div>
            <span style="font-size:10px;padding:2px 8px;border-radius:8px;background:${r.confidence === 'high' ? 'rgba(16,185,129,0.15)' : r.confidence === 'medium' ? 'rgba(234,179,8,0.15)' : 'rgba(100,116,139,0.15)'};color:${r.confidence === 'high' ? 'var(--accent-green)' : r.confidence === 'medium' ? 'var(--accent-yellow)' : 'var(--text-muted)'}">${r.confidence === 'high' ? '高信心' : r.confidence === 'medium' ? '中信心' : '低信心'}</span>
          </div>
          <div class="reason-detail">${r.detail}</div>
          ${r.sources ? `<div style="margin-top:4px;font-size:11px">${r.sources.map(s => `<a href="${s}" target="_blank" style="color:var(--accent-blue);margin-right:8px">${new URL(s).hostname}</a>`).join('')}</div>` : ''}
        </div>`).join('')}
    </div>`;
  }

  // ============ 8. 相關報導 ============
  if (analysis && analysis.newsArticles && analysis.newsArticles.length > 0) {
    html += `
    <div class="analysis-section">
      <h4>📰 相關報導</h4>
      ${analysis.newsArticles.map(n => `
        <a href="${n.url}" target="_blank" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:var(--radius-sm);background:rgba(255,255,255,0.03);margin-bottom:6px;text-decoration:none;color:var(--text-secondary);transition:var(--transition)" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
          <span style="font-size:11px;color:var(--text-muted);min-width:60px">${n.source}</span>
          <span style="flex:1;color:var(--text-primary);font-size:13px">${n.title}</span>
          <span style="font-size:11px;color:var(--text-muted)">${n.date || ''}</span>
        </a>`).join('')}
    </div>`;
  }

  // ============ 9. 評論星等分布 ============
  if (analysis && analysis.reviewAnalysis) {
    const ra = analysis.reviewAnalysis;
    const sc = ra.starCounts || {};
    html += `
    <div class="analysis-section">
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

  // ============ 10. 最近更新內容 ============
  if (analysis && analysis.detail?.recentChanges) {
    html += `
    <div class="analysis-section">
      <h4>📝 最近更新內容</h4>
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:var(--radius-sm)">${analysis.detail.recentChanges}</div>
    </div>`;
  }

  // ============ 11. 建議觀察方向 ============
  if (analysis && analysis.suggestions && analysis.suggestions.length > 0) {
    html += `
    <div class="analysis-section">
      <h4>🎯 建議觀察方向</h4>
      ${analysis.suggestions.map(s => `<div style="display:flex;gap:8px;margin-bottom:6px;font-size:13px;color:var(--text-secondary)"><span style="color:var(--accent-cyan)">▸</span>${s}</div>`).join('')}
    </div>`;
  }

  // ============ 12. 報告按鈕（已移至頂部，此處不重複） ============

  // ============ 13. 操作按鈕列 ============
  html += `
    <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">
      <button onclick="addToTrend('${app.appId}','${safeName}','${platform}');document.getElementById('analysisModal').classList.remove('active')" style="flex:1;padding:10px 16px;border-radius:var(--radius-sm);border:1px solid var(--accent-blue);background:rgba(59,130,246,0.1);color:var(--accent-blue);cursor:pointer;font-size:13px;transition:var(--transition)" onmouseover="this.style.background='rgba(59,130,246,0.2)'" onmouseout="this.style.background='rgba(59,130,246,0.1)'">📈 加入趨勢圖</button>
    </div>`;

  // ============ 14. 快速調查連結 ============
  html += buildSearchLinksHTML(app.name, app.url, app.appId, platform);

  body.innerHTML = html;
  document.getElementById('analysisModal').classList.add('active');

  // ============ 排名歷史圖表繪製 ============
  const hasHistory = dh && (
    (dh._rankHistoryByLine && Object.keys(dh._rankHistoryByLine).length > 0) ||
    (dh.rankHistory && dh.rankHistory.length > 0)
  );
  if (hasHistory) {
    setTimeout(() => {
      if (window._modalChartInstance) { window._modalChartInstance.destroy(); window._modalChartInstance = null; }
      const canvas = document.getElementById('modalChart');
      if (!canvas) return;

      const LINE_STYLES = {
        'ios_topfree': { color: '#3b82f6', label: '🍎 iOS 免費' },
        'ios_grossing': { color: '#8b5cf6', label: '🍎 iOS 營收' },
        'android_topfree': { color: '#10b981', label: '🤖 Android 免費' },
        'android_grossing': { color: '#f59e0b', label: '🤖 Android 營收' },
      };

      const lines = [];
      if (dh._rankHistoryByLine && Object.keys(dh._rankHistoryByLine).length > 0) {
        Object.entries(dh._rankHistoryByLine).forEach(([key, lineData]) => {
          const style = LINE_STYLES[key] || { color: '#64748b', label: key };
          const sortedData = [...(lineData.data || [])].sort((a, b) => a.date.localeCompare(b.date));
          lines.push({ key, label: style.label, color: style.color, data: sortedData });
        });
      } else if (dh.rankHistory && dh.rankHistory.length > 0) {
        const grouped = {};
        dh.rankHistory.forEach(h => {
          const k = `${h.platform || dh.platform || platform}_${h.chartType || dh.chartType || 'topfree'}`;
          if (!grouped[k]) grouped[k] = [];
          grouped[k].push(h);
        });
        Object.entries(grouped).forEach(([key, data]) => {
          const style = LINE_STYLES[key] || { color: '#3b82f6', label: '排名' };
          lines.push({ key, label: style.label, color: style.color, data: [...data].sort((a, b) => a.date.localeCompare(b.date)) });
        });
      }

      if (lines.length === 0) { canvas.closest('.analysis-section')?.style.setProperty('display', 'none'); return; }

      const allDates = [...new Set(lines.flatMap(l => l.data.map(h => h.date)))].sort();
      const datasets = lines.map(line => {
        const dataMap = new Map(line.data.map(h => [h.date, h.rank]));
        return {
          label: line.label, data: allDates.map(d => dataMap.get(d) ?? null),
          borderColor: line.color, backgroundColor: line.color + '18',
          borderWidth: 2, fill: false, tension: 0.3, pointBackgroundColor: line.color, pointRadius: 4, spanGaps: true,
        };
      });

      window._modalChartInstance = new Chart(canvas, {
        type: 'line',
        data: { labels: allDates.map(d => d.substring(5)), datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: datasets.length > 1, position: 'top', labels: { color: '#94a3b8', usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 11 } } } },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } },
            y: { reverse: true, min: -3, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' }, afterBuildTicks(axis) { axis.ticks = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(v => ({ value: v })); } },
          },
        },
      });
    }, 200);
  }
}

/**
 * 日期安全格式化
 */
function formatDateSafe(raw) {
  if (!raw) return '';
  try {
    // 數字型 timestamp（毫秒或秒）
    if (typeof raw === 'number' || /^\d{10,13}$/.test(String(raw).trim())) {
      const num = Number(raw);
      const ms = num > 9999999999 ? num : num * 1000;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    // 已經是 YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return raw;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? String(raw) : d.toISOString().split('T')[0];
  } catch { return String(raw); }
}

/**
 * 搜尋快捷連結 HTML
 */
export function buildSearchLinksHTML(gameName, storeUrl, appId, platform) {
  const q = encodeURIComponent(gameName);
  const qReview = encodeURIComponent(gameName + ' review');
  const linkStyle = `display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:var(--radius-sm);background:rgba(255,255,255,0.04);border:1px solid var(--border-glass);color:var(--text-secondary);text-decoration:none;font-size:12px;transition:var(--transition);white-space:nowrap`;
  const hoverIn = `this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(255,255,255,0.15)'`;
  const hoverOut = `this.style.background='rgba(255,255,255,0.04)';this.style.borderColor='var(--border-glass)'`;

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

// 全域暴露
window.showReport = showReport;
window.findReport = findReport;
window.showGameModal = showGameModal;
window.addToTrend = addToTrend;
