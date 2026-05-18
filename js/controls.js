/**
 * 控制列模組 v3 — 每個 tab 獨立篩選器
 */
import { state, MARKETS, ICON_IOS, ICON_ANDROID, renderAll } from './state.js';

const ICON_IOS_BTN = `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-1px;fill:currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg> iOS`;
const ICON_ANDROID_BTN = `<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align:-2px;fill:#3DDC84"><path d="M17.6 11.5c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v4.9c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-4.9zm-14.4 0c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v4.9c0 .9-.7 1.6-1.6 1.6S3.2 17.3 3.2 16.4v-4.9zm3.3-.6h11v7.2c0 .9-.7 1.6-1.6 1.6H15v2.7c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-2.7h-1.6v2.7c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-2.7h-.9c-.9 0-1.6-.7-1.6-1.6v-7.2zM16.1 4l1.3-2.1c.1-.2.1-.5-.1-.6s-.5-.1-.6.1L15.3 3.6c-.9-.4-2-.7-3.3-.7s-2.3.2-3.3.7L7.4 1.4c-.2-.2-.4-.3-.6-.1s-.3.4-.1.6L8 4C5.9 5.1 4.5 7.2 4.5 9.6V10h15V9.6c0-2.4-1.4-4.5-3.4-5.6zM9 7.5c-.4 0-.8-.3-.8-.8s.3-.8.8-.8.8.3.8.8-.4.8-.8.8zm6 0c-.4 0-.8-.3-.8-.8s.3-.8.8-.8.8.3.8.8-.4.8-.8.8z"/></svg> Android`;

// ============ 市場 pills 生成 ============
function buildMarketPills(containerId, stateObj, hasAll, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (hasAll) {
    const allBtn = document.createElement('button');
    allBtn.className = `pill ${stateObj.market === 'all' ? 'active' : ''}`;
    allBtn.dataset.market = 'all';
    allBtn.innerHTML = '<span class="flag">🌍</span>全部';
    allBtn.onclick = () => { pillSelect(container, allBtn); stateObj.market = 'all'; onChange(); };
    container.appendChild(allBtn);
  }

  MARKETS.forEach(m => {
    const btn = document.createElement('button');
    btn.className = `pill ${stateObj.market === m.code ? 'active' : ''}`;
    btn.dataset.market = m.code;
    btn.innerHTML = `<span class="flag">${m.flag}</span>${m.name}`;
    btn.onclick = () => { pillSelect(container, btn); stateObj.market = m.code; onChange(); };
    container.appendChild(btn);
  });
}

// ============ 平台 pills 生成 ============
function buildPlatformPills(containerId, stateObj, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const iosBtn = document.createElement('button');
  iosBtn.className = `pill ${stateObj.platform === 'ios' ? 'active' : ''}`;
  iosBtn.dataset.platform = 'ios';
  iosBtn.innerHTML = ICON_IOS_BTN;
  iosBtn.onclick = () => { pillSelect(container, iosBtn); stateObj.platform = 'ios'; onChange(); };
  container.appendChild(iosBtn);

  const andBtn = document.createElement('button');
  andBtn.className = `pill ${stateObj.platform === 'android' ? 'active' : ''}`;
  andBtn.dataset.platform = 'android';
  andBtn.innerHTML = ICON_ANDROID_BTN;
  andBtn.onclick = () => { pillSelect(container, andBtn); stateObj.platform = 'android'; onChange(); };
  container.appendChild(andBtn);
}

function pillSelect(container, activeBtn) {
  container.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  activeBtn.classList.add('active');
}

// ============ 黑馬篩選器初始化 ============
export function initDhFilters(onChange) {
  buildMarketPills('dhMarketPills', state.dh, true, onChange);
  buildPlatformPills('dhPlatformPills', state.dh, onChange);

  document.querySelectorAll('#dhChartFilter .pill').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#dhChartFilter .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.dh.chartType = btn.dataset.dhchart;
      onChange();
    };
  });
}

// ============ 排行榜篩選器初始化 ============
export function initRankFilters(onChange) {
  // 排行榜不需要「全部」市場
  buildMarketPills('rankMarketPills', state.rank, false, onChange);
  buildPlatformPills('rankPlatformPills', state.rank, onChange);

  document.querySelectorAll('#rankChartPills .pill').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#rankChartPills .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.rank.chartType = btn.dataset.chart;
      onChange();
    };
  });
}

// ============ 日期選擇器 ============
export function initDateSelector() {
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

export function populateDateSelector() {
  const select = document.getElementById('dateSelect');
  select.innerHTML = state.availableDates.map(d => {
    const isToday = d === state.availableDates[state.availableDates.length - 1];
    const label = isToday ? `${d} (最新)` : d;
    return `<option value="${d}"${d === state.selectedDate ? ' selected' : ''}>${label}</option>`;
  }).join('');
}

// ============ Tabs ============
export function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
      state.activeTab = tab.dataset.tab;
      renderAll();
    };
  });
}

// ============ 共用 ============
export function updateStatus(msg) {
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

export function renderStats() {
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
}

export function renderPipelineStatus() {
  const badge = document.getElementById('pipelineBadge');
  if (!badge || !state.pipelineStatus) return;
  const ps = state.pipelineStatus;
  if (ps.success) {
    badge.style.display = 'none';
  } else {
    badge.style.display = 'inline-flex';
    badge.textContent = '⚠️ 資料更新異常';
    badge.title = `上次更新失敗：${ps.error || '未知錯誤'}（${ps.date || ''})`;
  }
}

// ============ 黑馬偵測說明 ============
export function initScoreInfo() {
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
          <div style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--text-secondary)">
            <span style="font-size:15px;flex-shrink:0">🔄</span>
            <div><strong style="color:var(--text-primary)">跌深回升</strong><span style="color:var(--text-muted);margin-left:4px">—</span> 曾跌出榜外或排名大跌，又快速回歸 Top 20</div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--text-secondary)">
            <span style="font-size:15px;flex-shrink:0">💰</span>
            <div><strong style="color:var(--text-primary)">下載+營收雙榜</strong><span style="color:var(--text-muted);margin-left:4px">—</span> 同時在免費下載與營收排行竄升</div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--text-secondary)">
            <span style="font-size:15px;flex-shrink:0">📱</span>
            <div><strong style="color:var(--text-primary)">雙平台竄升</strong><span style="color:var(--text-muted);margin-left:4px">—</span> iOS 與 Android 同時排名竄升</div>
          </div>
        </div>
        <p style="color:var(--text-muted);font-size:11px;margin-top:10px;padding-top:8px;border-top:1px solid var(--border-glass)">
          評分低於 3.5、排名不在 Top 50 以內的遊戲會自動排除。<br>同一款遊戲在多個國家同時出現時，會合併成一張卡片。<br>週一判定時會自動提高門檻，避免週末效應誤判。
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
          <div style="display:flex;align-items:center;gap:6px"><span style="color:var(--accent-cyan)">▸</span> 免費+營收雙榜竄升 → 信心分數 ×1.5</div>
          <div style="display:flex;align-items:center;gap:6px"><span style="color:var(--accent-cyan)">▸</span> iOS+Android 雙平台竄升 → 信心分數 ×1.3</div>
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
