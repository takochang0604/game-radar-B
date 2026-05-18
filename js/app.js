/**
 * 遊戲產品競爭力分析 — 主入口（模組化版本）
 */
import { state, MARKETS, setRenderAll } from './state.js';
import { initDhFilters, initRankFilters, initTabs, initDateSelector, populateDateSelector, updateStatus, renderStats, renderPipelineStatus, initScoreInfo } from './controls.js';
import { initModal } from './modal.js';
import { renderDarkhorses } from './darkhorse.js';
import { renderRankingsAsync } from './rankings.js';
import { renderTrendChart, initTrendPresets } from './trends.js';
import { renderTrackedGames } from './tracked.js';

// ============ 渲染全部 ============
function renderAllFn() {
  renderStats();
  renderDarkhorses();
  renderRankingsAsync();
  renderTrendChart();
  renderTrackedGames();
}

setRenderAll(renderAllFn);

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initModal();
  initScoreInfo();
  // 各 tab 獨立篩選器
  initDhFilters(() => renderDarkhorses());
  initRankFilters(() => renderRankingsAsync());
  initDateSelector();
  initTrendPresets();
  loadData();
});

// ============ 載入資料 ============
async function loadData() {
  if (typeof FIREBASE_MODE !== 'undefined' && FIREBASE_MODE) {
    try {
      updateStatus('⏳ 正在從 Firebase 載入...');
      const { loadInitialData } = await import('../firebase-data.js');
      const data = await loadInitialData();
      state.availableDates = data.availableDates || [];
      state.snapshots = {};
      state.darkhorses = data.darkhorses || [];
      state.analysis = data.analysis || {};
      state.reports = data.reports || {};
      state.pipelineStatus = data.pipelineStatus || null;
      state.tracked = data.tracked || null;
      state.firebaseMode = true;

      state.selectedDate = state.availableDates[state.availableDates.length - 1] || null;
      populateDateSelector();
      updateStatus();
      renderPipelineStatus();
      renderAllFn();
      return;
    } catch (err) {
      console.error('Firebase 載入失敗，嘗試 data.js fallback:', err);
    }
  }

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
  renderAllFn();
}

// ============ AppMagic 連結 ============
function renderAppMagicLinks() {
  const container = document.getElementById('appmagicLinks');
  if (!container) return;
  container.innerHTML = MARKETS.map(m => `
    <a href="https://appmagic.rocks/top-charts/apps?country=${m.code}" target="_blank"
       style="display:flex;align-items:center;gap:8px;padding:12px 16px;border-radius:var(--radius-sm);background:var(--bg-glass);border:1px solid var(--border-glass);color:var(--text-secondary);text-decoration:none;transition:var(--transition);font-size:13px"
       onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='var(--bg-glass)'">
      <span style="font-size:20px">${m.flag}</span><span>${m.name}排行</span><span style="margin-left:auto">→</span>
    </a>`).join('');
}
