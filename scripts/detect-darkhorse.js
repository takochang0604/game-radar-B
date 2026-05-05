/**
 * 黑馬偵測引擎
 * 分析排行快照，找出排名突然竄升的遊戲
 * 
 * 用法: node scripts/detect-darkhorse.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  MARKETS,
  CHART_TYPES,
  DARKHORSE_CONFIG,
  SNAPSHOTS_DIR,
  DARKHORSE_DIR,
} from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function getDateStr(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

function ensureDir(dirPath) {
  const resolved = path.resolve(ROOT, dirPath);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

/**
 * 載入某天某市場某平台某排行類型的快照
 */
function loadSnapshot(date, marketCode, platform, chartTypeId) {
  const filePath = path.resolve(ROOT, SNAPSHOTS_DIR, date, `${marketCode}_${platform}_${chartTypeId}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * 取得指定遊戲在過去N天的排名歷史
 * hasSnapshot: 該天是否有快照資料（區分「沒資料」vs「有資料但不在榜上」）
 */
function getRankHistory(appId, marketCode, platform, chartTypeId, days) {
  const history = [];
  for (let i = days; i >= 0; i--) {
    const date = getDateStr(i);
    const snapshot = loadSnapshot(date, marketCode, platform, chartTypeId);
    if (snapshot && snapshot.data) {
      const found = snapshot.data.find(app => app.appId === appId);
      history.push({
        date,
        rank: found ? found.rank : null,
        hasSnapshot: true,
      });
    } else {
      history.push({ date, rank: null, hasSnapshot: false });
    }
  }
  return history;
}

/**
 * 偵測策略 1: 排名急升
 * 7 天內排名上升 ≥ 30 名
 */
function detectRankJump(app, history) {
  const validHistory = history.filter(h => h.rank !== null);
  if (validHistory.length < 2) return null;

  const currentRank = validHistory[validHistory.length - 1].rank;
  const oldestRank = validHistory[0].rank;

  if (oldestRank === null || currentRank === null) return null;

  const jump = oldestRank - currentRank;
  if (jump >= DARKHORSE_CONFIG.rankJumpThreshold) {
    return {
      strategy: 'rank_jump',
      label: '🚀 排名急升',
      detail: `排名從 #${oldestRank} 升至 #${currentRank}（↑${jump} 名）`,
      score: Math.min(jump / DARKHORSE_CONFIG.rankJumpThreshold, 3),
    };
  }
  return null;
}

/**
 * 偵測策略 2: 新進榜
 * 過去 N 天內首次出現在 Top 100
 * 條件：前面至少 minNulls 天「有快照但不在榜上」+ 排名在 maxRank 以內
 * 關鍵：只有 hasSnapshot===true 且 rank===null 才算「確認不在榜上」
 *       hasSnapshot===false（沒有快照資料）不算，避免首次收集時誤判
 */
function detectNewEntry(app, history) {
  const validHistory = history.filter(h => h.rank !== null);
  if (validHistory.length === 0) return null;

  const currentRank = validHistory[validHistory.length - 1].rank;

  // 排名必須在 Top N 以內才算黑馬
  if (currentRank > DARKHORSE_CONFIG.newEntryMaxRank) return null;

  // 找第一次出現的日期
  const firstAppearance = history.findIndex(h => h.rank !== null);

  // 只計算「有快照但不在榜上」的天數（不是「沒有快照」的天數）
  const confirmedNulls = history.slice(0, firstAppearance)
    .filter(h => h.hasSnapshot === true && h.rank === null).length;

  // 前面必須有足夠天數確認不在榜上
  if (confirmedNulls >= DARKHORSE_CONFIG.newEntryMinNulls && validHistory.length <= DARKHORSE_CONFIG.newEntryDays) {
    return {
      strategy: 'new_entry',
      label: '🆕 新進榜',
      detail: `首次進入 Top 100，目前排名 #${currentRank}`,
      score: currentRank <= 10 ? 3 : currentRank <= 20 ? 2.5 : 2,
    };
  }

  return null;
}

/**
 * 偵測策略 3: 持續攀升
 * 連續 N 天排名上升
 */
function detectConsecutiveRise(app, history) {
  const validHistory = history.filter(h => h.rank !== null);
  if (validHistory.length < DARKHORSE_CONFIG.consecutiveRiseDays) return null;

  let consecutiveRise = 0;
  for (let i = validHistory.length - 1; i > 0; i--) {
    if (validHistory[i].rank < validHistory[i - 1].rank) {
      consecutiveRise++;
    } else {
      break;
    }
  }

  if (consecutiveRise >= DARKHORSE_CONFIG.consecutiveRiseDays) {
    const firstRank = validHistory[validHistory.length - consecutiveRise - 1].rank;
    const currentRank = validHistory[validHistory.length - 1].rank;
    return {
      strategy: 'consecutive_rise',
      label: '📈 持續攀升',
      detail: `連續 ${consecutiveRise} 天上升（#${firstRank} → #${currentRank}）`,
      score: Math.min(consecutiveRise / DARKHORSE_CONFIG.consecutiveRiseDays, 2),
    };
  }
  return null;
}

/**
 * 排名權重：排名越高（數字越小）越重要
 */
function getRankWeight(rank) {
  if (rank <= 5)  return 2.0;
  if (rank <= 10) return 1.5;
  if (rank <= 20) return 1.2;
  if (rank <= 50) return 1.0;
  return 0.7;
}

/**
 * 市場權重：大市場的黑馬更值得關注
 */
const MARKET_WEIGHTS = {
  us: 1.5,  // 全球最大手遊市場
  jp: 1.4,  // 亞洲最大付費市場
  cn: 1.3,  // 規模大但封閉
  kr: 1.2,  // 重度手遊市場
  tw: 1.0,  // 基準
  th: 1.0,
  vn: 1.0,
  ph: 1.0,
};

/**
 * 主偵測邏輯
 */
async function main() {
  const today = getToday();
  const darkhorseDir = ensureDir(DARKHORSE_DIR);
  const platforms = ['android', 'ios'];

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  🐴 黑馬偵測引擎                             ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`📅 日期: ${today}`);
  console.log(`🔍 回溯: ${DARKHORSE_CONFIG.lookbackDays} 天`);
  console.log('');

  const allDarkhorses = [];

  for (const market of MARKETS) {
    // 檢查該市場是否有足夠的歷史快照
    let marketSnapshotDays = 0;
    for (let i = DARKHORSE_CONFIG.lookbackDays; i >= 0; i--) {
      const date = getDateStr(i);
      const testFile = path.resolve(ROOT, SNAPSHOTS_DIR, date, `${market.code}_ios_topfree.json`);
      if (fs.existsSync(testFile)) marketSnapshotDays++;
    }
    if (marketSnapshotDays < DARKHORSE_CONFIG.minHistoryDays) {
      console.log(`  ⏭️  跳過 ${market.flag} ${market.name}（歷史僅 ${marketSnapshotDays} 天，需 ≥${DARKHORSE_CONFIG.minHistoryDays} 天）`);
      continue;
    }

    const marketWeight = MARKET_WEIGHTS[market.code] || 1.0;

    for (const chartType of CHART_TYPES) {
      const marketPlatforms = market.hasGooglePlay ? platforms : ['ios'];

      for (const platform of marketPlatforms) {
        const todaySnapshot = loadSnapshot(today, market.code, platform, chartType.id);
        if (!todaySnapshot || !todaySnapshot.data) continue;

        for (const app of todaySnapshot.data) {
          const history = getRankHistory(
            app.appId, market.code, platform, chartType.id,
            DARKHORSE_CONFIG.lookbackDays
          );

          const triggers = [];

          const jumpResult = detectRankJump(app, history);
          if (jumpResult) triggers.push(jumpResult);

          const newEntryResult = detectNewEntry(app, history);
          if (newEntryResult) triggers.push(newEntryResult);

          const riseResult = detectConsecutiveRise(app, history);
          if (riseResult) triggers.push(riseResult);

          if (triggers.length > 0) {
            // 品質過濾
            if (app.score && app.score < DARKHORSE_CONFIG.minScore) continue;
            if (app.rank > DARKHORSE_CONFIG.maxCurrentRank) continue;

            const baseScore = triggers.reduce((sum, t) => sum + t.score, 0);
            const rankWeight = getRankWeight(app.rank);
            const finalScore = baseScore * rankWeight * marketWeight;
            allDarkhorses.push({
              market: market.code,
              marketName: market.name,
              marketFlag: market.flag,
              platform,
              chartType: chartType.id,
              chartName: chartType.name,
              appId: app.appId,
              name: app.name,
              developer: app.developer,
              icon: app.icon,
              currentRank: app.rank,
              score: app.score,
              category: app.category,
              url: app.url,
              triggers,
              confidenceScore: Math.round(finalScore * 100) / 100,
              rankHistory: history,
              detectedAt: new Date().toISOString(),
            });
          }
        }
      }
    }
  }

  // 按信心分數排序
  allDarkhorses.sort((a, b) => b.confidenceScore - a.confidenceScore);

  // 信心分數過濾：低於門檻的不列為黑馬
  const beforeFilter = allDarkhorses.length;
  const filtered = allDarkhorses.filter(d => d.confidenceScore >= DARKHORSE_CONFIG.minConfidence);
  const removedCount = beforeFilter - filtered.length;
  if (removedCount > 0) {
    console.log(`\n🧹 品質過濾: 移除 ${removedCount} 匹（評分 < ${DARKHORSE_CONFIG.minScore} 或信心 < ${DARKHORSE_CONFIG.minConfidence}）`);
  }

  // ============ 跨市場合併 ============
  // 同一款遊戲（同名+同平台）在多個市場出現時，合併為一張卡片
  function normalizeGameName(name) {
    return name.toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '')
      .substring(0, 30);
  }

  const mergedMap = new Map();
  for (const dh of filtered) {
    const key = normalizeGameName(dh.name) + '|' + dh.platform + '|' + dh.chartType;
    if (!mergedMap.has(key)) {
      // 第一次出現：建立合併結構
      mergedMap.set(key, {
        ...dh,
        markets: [{ code: dh.market, name: dh.marketName, flag: dh.marketFlag, rank: dh.currentRank, score: dh.confidenceScore }],
      });
    } else {
      // 已存在：追加市場資訊，保留最高分的版本為主體
      const existing = mergedMap.get(key);
      existing.markets.push({ code: dh.market, name: dh.marketName, flag: dh.marketFlag, rank: dh.currentRank, score: dh.confidenceScore });
      if (dh.confidenceScore > existing.confidenceScore) {
        // 用更高分的版本替換主體，但保留累積的 markets
        const markets = existing.markets;
        Object.assign(existing, dh, { markets });
      }
    }
  }

  const mergedDarkhorses = Array.from(mergedMap.values());
  mergedDarkhorses.sort((a, b) => b.confidenceScore - a.confidenceScore);

  const mergedCount = filtered.length - mergedDarkhorses.length;
  if (mergedCount > 0) {
    console.log(`🔀 跨市場合併: ${filtered.length} → ${mergedDarkhorses.length}（合併 ${mergedCount} 筆重複）`);
  }

  // 儲存結果
  const outputFile = path.join(darkhorseDir, `${today}.json`);
  fs.writeFileSync(outputFile, JSON.stringify({
    date: today,
    totalBeforeMerge: allDarkhorses.length,
    count: mergedDarkhorses.length,
    config: DARKHORSE_CONFIG,
    darkhorses: mergedDarkhorses,
  }, null, 2), 'utf-8');

  console.log(`\n🐴 偵測到 ${mergedDarkhorses.length} 匹黑馬`);
  
  if (mergedDarkhorses.length > 0) {
    console.log('\n🏆 Top 10 黑馬:');
    console.log('─'.repeat(60));
    mergedDarkhorses.slice(0, 10).forEach((dh, i) => {
      const marketFlags = dh.markets.map(m => m.flag).join('');
      const triggerLabels = dh.triggers.map(t => t.label).join(' ');
      console.log(`  ${i + 1}. ${marketFlags} [${dh.platform}] ${dh.name}`);
      console.log(`     排名 #${dh.currentRank} | ${triggerLabels}`);
      console.log(`     ${dh.triggers.map(t => t.detail).join(' | ')}`);
    });
  }

  console.log(`\n📁 結果已儲存: ${outputFile}`);
}

main().catch(err => {
  console.error('❌ 致命錯誤:', err);
  process.exit(1);
});
