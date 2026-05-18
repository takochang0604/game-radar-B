/**
 * 趨勢圖模組
 * #7 「全部市場」模式改用黑馬 rankHistory 繪圖
 */
import { state, MARKETS, trendChart, setTrendChart, renderAll } from './state.js';

const colors = ['#3b82f6','#ef4444','#10b981','#f97316','#8b5cf6','#06b6d4','#eab308','#ec4899','#f43f5e','#14b8a6'];

export function initTrendPresets() {
  document.querySelectorAll('.trend-presets .pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.trend-presets .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.trendPreset = btn.dataset.preset;
      renderTrendChart();
    });
  });

  document.getElementById('btnClearTrend')?.addEventListener('click', () => {
    state.trendApps = [];
    renderTrendChart();
  });
}

export function addToTrend(appId, name, platform, chartType) {
  state.trendPreset = 'custom';
  document.querySelectorAll('.trend-presets .pill').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-preset="custom"]')?.classList.add('active');

  if (state.trendApps.find(a => a.appId === appId && a.platform === platform)) return;
  if (state.trendApps.length >= 10) { alert('最多比較 10 款遊戲'); return; }
  state.trendApps.push({ appId, name, platform, chartType: chartType || state.rank.chartType });
  renderTrendChart();

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-tab="trends"]')?.classList.add('active');
  document.getElementById('tab-trends')?.classList.add('active');
}

export function removeFromTrend(appId, platform) {
  state.trendApps = state.trendApps.filter(a => !(a.appId === appId && a.platform === platform));
  renderTrendChart();
}

/** 取得某天的排行清單 */
function getCurrentApps(date) {
  if (state.rank.market === 'all') return [];
  if (!date || !state.snapshots[date] || !state.snapshots[date][state.rank.market]) return [];
  const marketData = state.snapshots[date][state.rank.market];
  const platforms = [state.rank.platform];
  let apps = [];
  platforms.forEach(p => {
    if (marketData[p] && marketData[p][state.rank.chartType]) {
      (marketData[p][state.rank.chartType].data || []).forEach(app => apps.push({ ...app, _platform: p }));
    }
  });
  // 不再需要合併平台邏輯
  return apps;
}

/**
 * #7 「全部市場」時用黑馬 rankHistory 顯示趨勢
 */
function getDarkhorseAppsForTrend() {
  const dhs = state.darkhorses.filter(dh => {
    if (dh.platform !== state.rank.platform) return false;
    // 不再篩選 chartType，統一顯示所有排行類型的黑馬
    return true;
  });
  // 去重（同名遊戲只取信心分數最高的）
  const nameMap = new Map();
  dhs.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
  for (const dh of dhs) {
    const key = dh.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '').substring(0, 30);
    if (!nameMap.has(key)) nameMap.set(key, dh);
  }
  return Array.from(nameMap.values()).slice(0, 10);
}

function getTrendApps() {
  if (state.trendPreset === 'custom') return state.trendApps;
  if (state.availableDates.length === 0) return [];

  // #7 全部市場模式 → 用黑馬 rankHistory
  if (state.rank.market === 'all') {
    const dhs = getDarkhorseAppsForTrend();
    return dhs.map(dh => ({
      appId: dh.appId, name: dh.name, platform: dh.platform, icon: dh.icon,
      _darkhorseHistory: dh.rankHistory,
    }));
  }

  const current = state.selectedDate;
  const currentIdx = state.availableDates.indexOf(current);
  const prev = currentIdx > 0 ? state.availableDates[currentIdx - 1] : null;

  let apps = getCurrentApps(current);
  if (apps.length === 0) return [];

  if (state.trendPreset === 'top10') {
    return apps.slice(0, 10).map(a => ({ appId: a.appId, name: a.name, platform: a._platform, icon: a.icon }));
  }

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

export function renderTrendChart() {
  const canvas = document.getElementById('trendChart');
  if (trendChart) { trendChart.destroy(); setTrendChart(null); }

  const appsToShow = getTrendApps();

  // 情境標題
  const ctxEl = document.getElementById('trendContextTitle');
  if (ctxEl) {
    if (state.rank.market === 'all') {
      ctxEl.textContent = '📈 黑馬排名走勢（信心分數最高 Top 10）';
    } else {
      const mObj = MARKETS.find(m => m.code === state.rank.market);
      const flag = mObj?.flag || '';
      const mName = mObj?.name || state.rank.market;
      const pName = state.rank.platform === 'ios' ? 'iOS' : 'Android';
      const cName = state.rank.chartType === 'grossing' ? '營收' : '免費下載';
      ctxEl.textContent = `📈 ${flag} ${mName} · ${pName} · ${cName} 排名走勢`;
    }
  }

  if (appsToShow.length === 0 || state.availableDates.length === 0) {
    renderTrendLegend([]);
    return;
  }

  // #7 判斷是否使用黑馬 rankHistory 模式
  const useDarkhorseHistory = appsToShow.some(a => a._darkhorseHistory);

  let datasets, labels;

  if (useDarkhorseHistory) {
    // 黑馬模式：用 rankHistory 的日期和排名
    const allDates = new Set();
    appsToShow.forEach(a => {
      (a._darkhorseHistory || []).forEach(h => { if (h.date) allDates.add(h.date); });
    });
    labels = Array.from(allDates).sort();

    datasets = appsToShow.map((app, i) => {
      const histMap = {};
      (app._darkhorseHistory || []).forEach(h => { if (h.date) histMap[h.date] = h.rank; });
      const data = labels.map(date => histMap[date] ?? null);
      const shortName = app.name.length > 12 ? app.name.substring(0, 12) + '…' : app.name;
      return {
        label: app.name, data, _shortName: shortName,
        borderColor: colors[i % colors.length], backgroundColor: colors[i % colors.length] + '20',
        borderWidth: 2.5, tension: 0.3, fill: false, pointRadius: 0, pointHoverRadius: 5,
      };
    });
    labels = labels.map(d => d.substring(5));
  } else {
    // 正常模式：從 snapshots 取排名
    labels = state.availableDates.map(d => d.substring(5));
    datasets = appsToShow.map((app, i) => {
      const data = state.availableDates.map(date => {
        const snap = state.snapshots[date];
        if (!snap || !snap[state.rank.market]) return null;
        const chartTypeToUse = app.chartType || state.rank.chartType;
        const pList = [app.platform];
        for (const p of pList) {
          if (snap[state.rank.market][p] && snap[state.rank.market][p][chartTypeToUse]) {
            const found = snap[state.rank.market][p][chartTypeToUse].data?.find(a => a.appId === app.appId);
            if (found) return found.rank;
          }
        }
        return null;
      });
      const shortName = app.name.length > 12 ? app.name.substring(0, 12) + '…' : app.name;
      return {
        label: app.name, data, _shortName: shortName,
        borderColor: colors[i % colors.length], backgroundColor: colors[i % colors.length] + '20',
        borderWidth: 2.5, tension: 0.3, fill: false, pointRadius: 0, pointHoverRadius: 5,
      };
    });
  }

  const endLabelPlugin = {
    id: 'endLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      chart.data.datasets.forEach((ds, i) => {
        const meta = chart.getDatasetMeta(i);
        if (meta.hidden) return;
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

  const chart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    plugins: [endLabelPlugin],
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 100 } },
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
  setTrendChart(chart);

  renderTrendLegend(appsToShow, colors);
}

function renderTrendLegend(apps, legendColors = []) {
  const legend = document.getElementById('trendLegend');
  if (!apps || apps.length === 0) {
    legend.innerHTML = '';
    return;
  }

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
    const color = legendColors[i % legendColors.length] || '#888';
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
      const chart = trendChart;
      if (!chart) return;
      const idx = parseInt(item.dataset.index);
      chart.data.datasets.forEach((ds, i) => {
        ds.borderWidth = i === idx ? 4 : 1;
        ds.borderColor = i === idx
          ? legendColors[i % legendColors.length]
          : legendColors[i % legendColors.length] + '30';
        ds.pointRadius = i === idx ? 4 : 0;
      });
      chart.update('none');
    });
    item.addEventListener('mouseleave', () => {
      const chart = trendChart;
      if (!chart) return;
      chart.data.datasets.forEach((ds, i) => {
        ds.borderWidth = 2.5;
        ds.borderColor = legendColors[i % legendColors.length];
        ds.pointRadius = 0;
      });
      chart.update('none');
    });
  });
}

window.removeFromTrend = removeFromTrend;
window.addToTrend = addToTrend;
