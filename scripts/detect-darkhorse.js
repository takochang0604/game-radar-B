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
  ESTABLISHED_THRESHOLD,
  SNAPSHOTS_DIR,
  DARKHORSE_DIR,
} from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// 支援命令列指定日期：node scripts/detect-darkhorse.js 2026-05-23
const OVERRIDE_DATE = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2])
  ? process.argv[2]
  : null;

// 用 local time 格式化日期，避免 toISOString() 的 UTC 時區差異（UTC+8 下會差一天）
function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getToday() {
  if (OVERRIDE_DATE) return OVERRIDE_DATE;
  return formatLocalDate(new Date());
}

function getDateStr(daysAgo) {
  const base = OVERRIDE_DATE ? new Date(OVERRIDE_DATE + 'T12:00:00') : new Date();
  base.setDate(base.getDate() - daysAgo);
  return formatLocalDate(base);
}

function ensureDir(dirPath) {
  const resolved = path.resolve(ROOT, dirPath);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

const snapshotCache = new Map();
/**
 * 載入某天某市場某平台某排行類型的快照
 */
function loadSnapshot(date, marketCode, platform, chartTypeId) {
  const key = `${date}|${marketCode}|${platform}|${chartTypeId}`;
  if (snapshotCache.has(key)) return snapshotCache.get(key);

  const filePath = path.resolve(ROOT, SNAPSHOTS_DIR, date, `${marketCode}_${platform}_${chartTypeId}.json`);
  if (!fs.existsSync(filePath)) {
    snapshotCache.set(key, null);
    return null;
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    snapshotCache.set(key, data);
    return data;
  } catch {
    snapshotCache.set(key, null);
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
 * 計算近 N 天內的 snapshot 斷層統計
 * 用於偵測策略中判斷資料是否足夠可信
 */
function getSnapshotGapInfo(history, recentDays = 7) {
  const recent = history.slice(-recentDays);
  const missingDays = recent.filter(h => !h.hasSnapshot).length;
  // 計算最長連續缺失天數
  let maxConsecutiveGap = 0;
  let currentGap = 0;
  for (const h of recent) {
    if (!h.hasSnapshot) {
      currentGap++;
      maxConsecutiveGap = Math.max(maxConsecutiveGap, currentGap);
    } else {
      currentGap = 0;
    }
  }
  return { missingDays, maxConsecutiveGap, recentDays, hasSignificantGap: maxConsecutiveGap >= 2 };
}

/**
 * 偵測策略 1: 排名急升
 * 7 天內排名上升 ≥ 30 名，且起始排名必須 ≥ 40（排除原本就在前段的遊戲）
 * gapInfo: snapshot 斷層資訊，有斷層時提高門檻避免誤判
 */
function detectRankJump(app, history, gapInfo) {
  // 只看近 7 天窗口，避免用 60 天前的遠古排名誤判急升
  const windowDays = 7;
  const recentHistory = history.slice(-windowDays);
  const validHistory = recentHistory.filter(h => h.rank !== null);
  if (validHistory.length < 2) return null;

  const currentRank = validHistory[validHistory.length - 1].rank;
  const oldestRank = validHistory[0].rank;

  if (oldestRank === null || currentRank === null) return null;

  // 起始排名必須 ≥ 40，已在 Top 39 的遊戲不算黑馬急升
  if (oldestRank < 40) return null;

  // 有 snapshot 斷層時提高門檻（斷層可能導致中間的漸進式變化被忽略）
  let threshold = DARKHORSE_CONFIG.rankJumpThreshold;
  if (gapInfo && gapInfo.hasSignificantGap) {
    threshold = Math.ceil(threshold * 1.5);
  }

  const jump = oldestRank - currentRank;
  if (jump >= threshold) {
    const gapNote = (gapInfo && gapInfo.hasSignificantGap) ? '（⚠️ 有快照斷層，門檻已提高）' : '';
    // 分段計分：jump 30-50 → 3, 50-70 → 5, 70+ → 7
    let score;
    if (jump >= 70) score = 7;
    else if (jump >= 50) score = 5;
    else score = 3;
    return {
      strategy: 'rank_jump',
      label: '🚀 排名急升',
      detail: `${validHistory.length} 天內排名從 #${oldestRank} 升至 #${currentRank}（↑${jump} 名）${gapNote}`,
      score,
      triggerRank: currentRank,
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
 * gapInfo: snapshot 斷層資訊，有斷層時要求更多 confirmedNulls
 */
function detectNewEntry(app, history, gapInfo) {
  const validHistory = history.filter(h => h.rank !== null);
  if (validHistory.length === 0) return null;

  const currentRank = validHistory[validHistory.length - 1].rank;

  // 排名必須在 Top N 以內才算黑馬
  if (currentRank > DARKHORSE_CONFIG.newEntryMaxRank) return null;

  const maxRank = DARKHORSE_CONFIG.newEntryMaxRank;

  // 分段計分
  function getNewEntryScore(rank) {
    if (rank <= 5) return 7;
    if (rank <= 10) return 6;
    if (rank <= 20) return 5;
    if (rank <= 30) return 4;
    if (rank <= 50) return 3;
    return 2;
  }

  // 情況 B（優先）：首次衝入 Top N（之前在榜但一直在 Top N 外）
  // 例如：grossing 從 #71 衝到 #25，雖然已在 Top 100 但首次進入 Top 30
  if (validHistory.length >= 2 && validHistory.length <= DARKHORSE_CONFIG.newEntryDays) {
    const previousRanks = validHistory.slice(0, -1);
    const allOutsideTopN = previousRanks.every(h => h.rank > maxRank);
    if (allOutsideTopN && currentRank <= maxRank) {
      return {
        strategy: 'new_entry',
        label: '🆕 新進榜',
        detail: `強勢衝進 Top ${maxRank}，偵測當下排名 #${currentRank}`,
        score: getNewEntryScore(currentRank),
        triggerRank: currentRank,
      };
    }
  }

  // 情況 A：首次進入 Top 100
  const firstAppearance = history.findIndex(h => h.rank !== null);
  const confirmedNulls = history.slice(0, firstAppearance)
    .filter(h => h.hasSnapshot === true && h.rank === null).length;

  let requiredNulls = DARKHORSE_CONFIG.newEntryMinNulls;
  if (gapInfo && gapInfo.hasSignificantGap) {
    requiredNulls = Math.ceil(requiredNulls * 1.5);
  }

  if (confirmedNulls >= requiredNulls && validHistory.length <= DARKHORSE_CONFIG.newEntryDays) {
    const gapNote = (gapInfo && gapInfo.hasSignificantGap) ? '（⚠️ 有快照斷層，門檻已提高）' : '';
    return {
      strategy: 'new_entry',
      label: '🆕 新進榜',
      detail: `首次進入 Top 100，目前排名 #${currentRank}${gapNote}`,
      score: getNewEntryScore(currentRank),
      triggerRank: currentRank,
    };
  }

  return null;
}


/**
 * 偵測策略 3: 持續攀升
 * 連續 N 天排名上升，且起始排名必須 ≥ 30（排除原本就在前段的遊戲）
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

    // 起始排名必須 ≥ 30，從 #5→#4→#3→#2→#1 不算黑馬
    if (firstRank < 30) return null;

    // 分段計分：5-7 天 → 3, 8-10 天 → 5, 10+ 天 → 7
    let score;
    if (consecutiveRise > 10) score = 7;
    else if (consecutiveRise >= 8) score = 5;
    else score = 3;

    return {
      strategy: 'consecutive_rise',
      label: '📈 持續攀升',
      detail: `連續 ${consecutiveRise} 天上升（#${firstRank} → #${currentRank}）`,
      score,
      triggerRank: currentRank,
    };
  }
  return null;
}

/**
 * 偵測策略 4: Growth Multiplier（成長倍率）
 * 近 3 天平均排名 vs 近 7 天平均排名的比值
 * 比值越高代表近期加速越快
 * 參考：StoreSignal 的 Growth Multiplier 方法論
 * gapInfo: snapshot 斷層資訊，有斷層時要求更多有效資料
 */
function detectGrowthMultiplier(app, history, gapInfo) {
  const validHistory = history.filter(h => h.rank !== null);

  // 有 snapshot 斷層時要求更多有效資料天數（正常 4 天 → 斷層時 6 天）
  const minRequired = (gapInfo && gapInfo.hasSignificantGap) ? 6 : 4;
  if (validHistory.length < minRequired) return null;

  // 觸發當下的排名（最新一筆有效排名，供 triggerRank 與 detail 使用）
  const currentRank = validHistory[validHistory.length - 1].rank;
  if (currentRank == null) return null;

  const shortWindow = Math.min(DARKHORSE_CONFIG.growthShortWindow || 3, validHistory.length);
  const longWindow = Math.min(DARKHORSE_CONFIG.growthLongWindow || 7, validHistory.length);
  if (shortWindow >= longWindow) return null;

  // 取近 N 天的平均排名（排名越小越好，所以用倒數來算成長倍率）
  const recentRanks = validHistory.slice(-shortWindow).map(h => h.rank);
  const allRanks = validHistory.slice(-longWindow).map(h => h.rank);
  const recentAvg = recentRanks.reduce((a, b) => a + b, 0) / recentRanks.length;
  const longAvg = allRanks.reduce((a, b) => a + b, 0) / allRanks.length;

  // 成長倍率 = 長期平均排名 / 近期平均排名（排名下降=好事）
  if (recentAvg <= 0 || longAvg <= 0) return null;
  const multiplier = longAvg / recentAvg;

  // 近 3 天平均排名必須 ≤ 50（遊戲必須已爬進前半段）
  if (recentAvg > 50) return null;

  const threshold = DARKHORSE_CONFIG.growthMultiplierThreshold || 2.5;
  if (multiplier >= threshold) {
    const gapNote = (gapInfo && gapInfo.hasSignificantGap) ? '（⚠️ 有快照斷層）' : '';
    // 分段計分：multiplier 2.5-3.5 → 3, 3.5-5.0 → 5, 5.0+ → 7
    let score;
    if (multiplier >= 5.0) score = 7;
    else if (multiplier >= 3.5) score = 5;
    else score = 3;
    return {
      strategy: 'growth_multiplier',
      label: '📊 成長加速',
      detail: `成長倍率 ${multiplier.toFixed(1)}×（近 ${shortWindow} 天平均 #${Math.round(recentAvg)} vs 近 ${longWindow} 天平均 #${Math.round(longAvg)}）${gapNote}`,
      score,
      triggerRank: currentRank,
    };
  }
  return null;
}

/**
 * 檢查遊戲是否為「已確立遊戲」（established）
 * 在近 window 天內有 days 天以上排名在 Top maxRank → 排除
 */
function isEstablishedGame(appId, marketCode, platform, chartTypeId) {
  const { days, window, maxRank } = ESTABLISHED_THRESHOLD;
  let topDays = 0;
  for (let i = 0; i < window; i++) {
    const dateStr = getDateStr(i);
    const snapshot = loadSnapshot(dateStr, marketCode, platform, chartTypeId);
    if (!snapshot || !snapshot.data) continue;
    const found = snapshot.data.find(a => a.appId === appId);
    if (found && found.rank <= maxRank) topDays++;
  }
  return topDays >= days;
}

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

  // 全域 snapshot 斷層掃描（近 7 天）
  const recentGapDays = [];
  for (let i = 1; i <= 7; i++) {
    const dateStr = getDateStr(i);
    const snapshotDir = path.resolve(ROOT, SNAPSHOTS_DIR, dateStr);
    if (!fs.existsSync(snapshotDir)) {
      recentGapDays.push(dateStr);
    }
  }
  if (recentGapDays.length > 0) {
    console.log('');
    console.log('⚠️ ═══════════════════════════════════════════════');
    console.log(`⚠️  近 7 天有 ${recentGapDays.length} 天缺少 snapshot：`);
    recentGapDays.forEach(d => console.log(`⚠️    📁 ${d} — 無資料`));
    console.log('⚠️  偵測門檻已自動提高，避免因資料斷層導致誤判');
    console.log('⚠️ ═══════════════════════════════════════════════');
  }
  console.log('');

  const allDarkhorses = [];

  // 載入最近一期的黑馬資料以進行累積與鎖定日期
  let yesterdayData = null;
  let yesterdayDateStr = null;
  for (let i = 1; i <= 7; i++) {
    const dateStr = getDateStr(i);
    const filePath = path.join(darkhorseDir, `${dateStr}.json`);
    if (fs.existsSync(filePath)) {
      try {
        yesterdayData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        yesterdayDateStr = dateStr;
        break;
      } catch (e) {
        // 忽略損壞的檔案
      }
    }
  }

  const yesterdayDhMap = new Map();
  if (yesterdayData && yesterdayData.darkhorses) {
    for (const dh of yesterdayData.darkhorses) {
      const key = dh.appId + '|' + dh.platform + '|' + dh.chartType;
      yesterdayDhMap.set(key, dh);
    }
  }


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

          // 計算近期 snapshot 斷層資訊
          const gapInfo = getSnapshotGapInfo(history, 7);

          const triggers = [];

          const jumpResult = detectRankJump(app, history, gapInfo);
          if (jumpResult) {
            jumpResult._detectedAt = today;
            jumpResult.market = market.code;
            jumpResult.marketName = market.name;
            jumpResult.marketFlag = market.flag;
            triggers.push(jumpResult);
          }

          // new_entry 偵測：即使 rank_jump 已觸發，「首次衝入 Top N」仍然有意義（不同維度信號）
          {
            const newEntryResult = detectNewEntry(app, history, gapInfo);
            if (newEntryResult) {
              // 如果 rank_jump 已觸發，只保留「情況 B：衝入 Top N」，避免「首次進入 Top 100」和 rank_jump 矛盾
              const isBreakthroughTopN = newEntryResult.detail && newEntryResult.detail.includes('衝進 Top');
              if (!jumpResult || isBreakthroughTopN) {
                newEntryResult._detectedAt = today;
                newEntryResult.market = market.code;
                newEntryResult.marketName = market.name;
                newEntryResult.marketFlag = market.flag;
                triggers.push(newEntryResult);
              }
            }
          }

          const riseResult = detectConsecutiveRise(app, history);
          if (riseResult) {
            riseResult._detectedAt = today;
            riseResult.market = market.code;
            riseResult.marketName = market.name;
            riseResult.marketFlag = market.flag;
            triggers.push(riseResult);
          }

          // 策略 4: Growth Multiplier（成長倍率）
          const growthResult = detectGrowthMultiplier(app, history, gapInfo);
          if (growthResult) {
            growthResult._detectedAt = today;
            growthResult.market = market.code;
            growthResult.marketName = market.name;
            growthResult.marketFlag = market.flag;
            triggers.push(growthResult);
          }

          if (triggers.length > 0) {
            // 品質過濾
            if (typeof app.score === 'number' && app.score < DARKHORSE_CONFIG.minScore) continue;
            if (app.rank > DARKHORSE_CONFIG.maxCurrentRank) continue;

            // 已確立遊戲排除：在近 14 天有 10+ 天排名在 Top 20 → 不是黑馬
            if (isEstablishedGame(app.appId, market.code, platform, chartType.id)) continue;

            // 整合歷史偵測觸發器與首次偵測日期鎖定
            const yesterdayKey = app.appId + '|' + platform + '|' + chartType.id;
            const yesterdayDh = yesterdayDhMap.get(yesterdayKey);

            let mergedTriggers = [];
            let originalDetectedAt = new Date().toISOString();

            if (yesterdayDh) {
              originalDetectedAt = yesterdayDh.detectedAt || yesterdayDh._retainedFrom || yesterdayDateStr || originalDetectedAt;
              
              // 載入歷史觸發器
              mergedTriggers = [...(yesterdayDh.triggers || [])];
              
              // 補齊歷史觸發器的偵測日期
              mergedTriggers.forEach(t => {
                if (!t._detectedAt) {
                  t._detectedAt = yesterdayDh.detectedAt || yesterdayDh._retainedFrom || yesterdayDateStr;
                }
              });

              // 整合今日觸發器
              for (const todayT of triggers) {
                // 比對規則：strategy 相同 且 market 相同（或兩者都沒有 market）才視為重複
                const existingIdx = mergedTriggers.findIndex(yT => 
                  yT.strategy === todayT.strategy && 
                  yT.market === todayT.market
                );
                if (existingIdx === -1) {
                  // 全新策略或新市場：加入，日期為今天
                  mergedTriggers.push(todayT);
                }
                // 同策略已存在：完全保留原始觸發資料（日期、描述、排名全部鎖定在首次觸發時的狀態）
              }
            } else {
              mergedTriggers = triggers;
            }

            // 簡化信心分數：最高觸發分 + 額外觸發數 × 1（上限 3），封頂 10
            const triggerScores = mergedTriggers.map(t => t.score || 0);
            const baseScore = Math.max(...triggerScores);
            const bonus = Math.min(triggerScores.length - 1, 3);
            const finalScore = Math.min(baseScore + bonus, 10);

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
              triggers: mergedTriggers,
              confidenceScore: Math.round(finalScore * 100) / 100,
              rankHistory: history.map(h => ({ ...h, platform, chartType: chartType.id })),
              detectedAt: originalDetectedAt,
            });
          }
        }
      }
    }
  }

  // 按信心分數排序
  allDarkhorses.sort((a, b) => b.confidenceScore - a.confidenceScore);

  // 不再按 minConfidence 過濾 — 只要觸發器觸發，就是黑馬
  const filtered = allDarkhorses;

  // ============ 跨市場合併 ============
  // 同一款遊戲（同 appId + 同平台）在多個市場出現時，合併為一張卡片
  const mergedMap = new Map();
  for (const dh of filtered) {
    const key = dh.appId + '|' + dh.platform + '|' + dh.chartType;
    if (!mergedMap.has(key)) {
      // 第一次出現：建立合併結構
      mergedMap.set(key, {
        ...dh,
        markets: [{ code: dh.market, name: dh.marketName, flag: dh.marketFlag, rank: dh.currentRank, score: dh.confidenceScore }],
        _rankHistoryByMarket: { [dh.market]: dh.rankHistory || [] },
      });
    } else {
      // 已存在：追加市場資訊，保留最高分的版本為主體
      const existing = mergedMap.get(key);
      existing.markets.push({ code: dh.market, name: dh.marketName, flag: dh.marketFlag, rank: dh.currentRank, score: dh.confidenceScore });
      
      // 保留該市場的 rankHistory
      if (dh.rankHistory && dh.rankHistory.length > 0) {
        existing._rankHistoryByMarket[dh.market] = dh.rankHistory;
      }

      // 合併所有 triggers（不論分數高低，只要 strategy + market 不同都應該合併）
      const mergedTriggers = [...existing.triggers];
      for (const t of (dh.triggers || [])) {
        if (!mergedTriggers.find(et => et.strategy === t.strategy && et.market === t.market)) {
          mergedTriggers.push(t);
        }
      }

      if (dh.confidenceScore > existing.confidenceScore) {
        // 用更高分的版本替換主體，但保留累積的 markets、rankHistoryByMarket 和合併觸發器
        const markets = existing.markets;
        const rhByMarket = existing._rankHistoryByMarket;
        Object.assign(existing, dh, { markets, triggers: mergedTriggers, _rankHistoryByMarket: rhByMarket });
      } else {
        // 保留原主體，但更新合併後的 triggers
        existing.triggers = mergedTriggers;
      }
    }
  }



  // ============ 市場國旗與排名顯示 ============
  // 規則：所有歷史快照中有撈到（Top 100 以內）就顯示該市場國旗
  // 排名顯示最新一天有上榜的排名（若最新沒上榜則顯示歷史最佳排名）
  // 計分不受影響（confidenceScore 已在上方計算完畢）

  // 先收集所有有快照的日期
  const allSnapshotDates = [];
  for (let i = DARKHORSE_CONFIG.lookbackDays; i >= 0; i--) {
    const dateStr = getDateStr(i);
    const snapshotDir = path.resolve(ROOT, SNAPSHOTS_DIR, dateStr);
    if (fs.existsSync(snapshotDir)) allSnapshotDates.push(dateStr);
  }

  for (const [, dh] of mergedMap) {
    // 保留觸發市場的 score，供 badge 標示
    const triggerScores = {};
    for (const m of dh.markets) {
      if (m.score > 0) triggerScores[m.code] = m.score;
    }
    // 掃描所有歷史日期的快照建立 markets
    const marketMap = new Map();
    for (const market of MARKETS) {
      if (dh.platform === 'android' && !market.hasGooglePlay) continue;
      for (const dateStr of allSnapshotDates) {
        const snap = loadSnapshot(dateStr, market.code, dh.platform, dh.chartType);
        if (!snap || !snap.data) continue;
        const entry = snap.data.find(a => a.appId === dh.appId);
        if (entry && entry.rank <= 100) {
          const existing = marketMap.get(market.code);
          if (!existing) {
            marketMap.set(market.code, {
              code: market.code,
              name: market.name,
              flag: market.flag,
              rank: entry.rank,
              score: triggerScores[market.code] || 0,
              _latestDate: dateStr,
            });
          } else {
            // 保留最新日期的排名（如果排名有效）
            if (dateStr > existing._latestDate) {
              existing.rank = entry.rank;
              existing._latestDate = dateStr;
            }
          }
        }
      }
      // 補充走勢圖歷史資料
      if (marketMap.has(market.code)) {
        if (!dh._rankHistoryByMarket) dh._rankHistoryByMarket = {};
        if (!dh._rankHistoryByMarket[market.code]) {
          const hist = getRankHistory(dh.appId, market.code, dh.platform, dh.chartType, DARKHORSE_CONFIG.lookbackDays);
          dh._rankHistoryByMarket[market.code] = hist.slice(-30).map(h => ({
            ...h, platform: dh.platform, chartType: dh.chartType,
          }));
        }
      }
    }
    // 移除內部用的 _latestDate 欄位
    const snapshotMarkets = Array.from(marketMap.values()).map(({ _latestDate, ...rest }) => rest);
    dh.markets = snapshotMarkets;
  }

  // 精簡 rankHistory：保留最近 30 天（前端支援 7/14/30 天切換）
  for (const [, dh] of mergedMap) {
    if (dh.rankHistory && dh.rankHistory.length > 30) {
      dh.rankHistory = dh.rankHistory.slice(-30);
    }
    if (dh._rankHistoryByMarket) {
      for (const mkt of Object.keys(dh._rankHistoryByMarket)) {
        const hist = dh._rankHistoryByMarket[mkt];
        if (hist && hist.length > 30) {
          dh._rankHistoryByMarket[mkt] = hist.slice(-30);
        }
      }
    }
  }

  const mergedDarkhorses = Array.from(mergedMap.values());
  mergedDarkhorses.sort((a, b) => b.confidenceScore - a.confidenceScore);

  const mergedCount = filtered.length - mergedDarkhorses.length;
  if (mergedCount > 0) {
    console.log(`🔀 跨市場合併: ${filtered.length} → ${mergedDarkhorses.length}（合併 ${mergedCount} 筆重複）`);
  }

  // ============ 黑馬保留機制 ============
  // 過去 14 天曾被偵測為黑馬的遊戲，如果今天仍在 Top 100，保留原始信心分數（不衰減）
  // 超過 14 天：完全移除
  const retentionDays = DARKHORSE_CONFIG.retentionDays || 14;
  const retentionMinRank = DARKHORSE_CONFIG.retentionMaxRank || DARKHORSE_CONFIG.maxCurrentRank || 100;
  const existingIds = new Set(mergedDarkhorses.map(d => d.appId));
  let retainedCount = 0;

  for (let daysAgo = 1; daysAgo <= retentionDays; daysAgo++) {
    const pastDate = getDateStr(daysAgo);
    const pastFile = path.join(darkhorseDir, `${pastDate}.json`);
    if (!fs.existsSync(pastFile)) continue;
    try {
      const pastData = JSON.parse(fs.readFileSync(pastFile, 'utf-8'));
      for (const pastDh of (pastData.darkhorses || [])) {
        if (existingIds.has(pastDh.appId)) continue;
        if (pastDh._retained) continue; // 不重複保留已保留的
        // 檢查該遊戲今天是否仍在榜上且排名夠高
        const todaySnap = loadSnapshot(today, pastDh.market, pastDh.platform, pastDh.chartType);
        if (!todaySnap || !todaySnap.data) continue;
        const todayApp = todaySnap.data.find(a => a.appId === pastDh.appId);
        if (!todayApp || todayApp.rank > retentionMinRank) continue;
        // 補齊 rankHistory：從上次已知日期到今天
        const existingHistory = pastDh.rankHistory || [];
        const lastKnownDate = existingHistory.length > 0
          ? existingHistory[existingHistory.length - 1].date
          : pastDate;
        const extendedHistory = [...existingHistory];
        // 從最後一天的隔天開始，逐日補資料
        const lastDate = new Date(lastKnownDate);
        const todayDate = new Date(today);
        let cursor = new Date(lastDate);
        cursor.setDate(cursor.getDate() + 1);
        while (cursor <= todayDate) {
          const dateStr = formatLocalDate(cursor);
          const snap = loadSnapshot(dateStr, pastDh.market, pastDh.platform, pastDh.chartType);
          if (snap && snap.data) {
            const found = snap.data.find(a => a.appId === pastDh.appId);
            extendedHistory.push({
              date: dateStr,
              rank: found ? found.rank : null,
              hasSnapshot: true,
              platform: pastDh.platform,
              chartType: pastDh.chartType,
            });
          } else {
            extendedHistory.push({ date: dateStr, rank: null, hasSnapshot: false, platform: pastDh.platform, chartType: pastDh.chartType });
          }
          cursor.setDate(cursor.getDate() + 1);
        }
        // 保留黑馬時，掃描今天快照更新「所有市場」的排名
        const updatedMarkets = (pastDh.markets || []).map(m => {
          const snap = loadSnapshot(today, m.code, pastDh.platform, pastDh.chartType);
          if (snap && snap.data) {
            const found = snap.data.find(a => a.appId === pastDh.appId);
            if (found) return { ...m, rank: found.rank };
          }
          return m;
        });

        // 保留原始信心分數，不衰減（限制在 1-10 範圍，兼容舊算法的高分）
        const retained = {
          ...pastDh,
          currentRank: todayApp.rank,
          confidenceScore: Math.min(pastDh.confidenceScore, 10),
          rankHistory: extendedHistory,
          _retained: true,
          _retainedFrom: pastDate,
          markets: updatedMarkets,
        };
        mergedDarkhorses.push(retained);
        existingIds.add(pastDh.appId);
        retainedCount++;
      }
    } catch (e) { /* skip corrupt files */ }
  }

  if (retainedCount > 0) {
    console.log(`\n🔄 黑馬保留: 從過去 ${retentionDays} 天保留 ${retainedCount} 匹仍在 Top ${retentionMinRank} 的黑馬`);
    mergedDarkhorses.sort((a, b) => b.confidenceScore - a.confidenceScore);
  }

  // 總數上限（避免超過 Firestore 1MB 文件限制）
  const MAX_DARKHORSES = 300;
  if (mergedDarkhorses.length > MAX_DARKHORSES) {
    const trimmed = mergedDarkhorses.length - MAX_DARKHORSES;
    mergedDarkhorses.length = MAX_DARKHORSES;
    console.log(`✂️ 黑馬總數限制: 保留前 ${MAX_DARKHORSES} 匹（移除 ${trimmed} 匹低分黑馬）`);
  }

  // ============ 跨平台自動配對 ============
  // 用開發商名稱從快照中找到同款遊戲在另一平台的 appId
  // 解決 iOS/Android 不同名稱（如「原神」vs「Genshin Impact」）無法自動合併的問題
  console.log('\n🔗 跨平台自動配對...');

  // Step 1: 從今天所有快照建立 開發商→遊戲 對照表
  function normalizeDev(dev) {
    if (!dev) return '';
    return dev.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '');
  }
  function devMatch(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    // 子字串匹配（如 "netmarble" vs "netmarblecorporation"）
    if (a.length >= 4 && b.length >= 4) {
      if (a.includes(b) || b.includes(a)) return true;
    }
    // 前綴匹配（至少 5 字元）
    const minLen = Math.min(a.length, b.length);
    if (minLen >= 5 && a.substring(0, minLen) === b.substring(0, minLen)) return true;
    return false;
  }
  // 名稱中提取拉丁字母 token（用於跨語言名稱比對）
  // 過濾通用詞，避免「puzzle / game」這類字讓不同遊戲被誤配
  // 例：'Meowdoku: Brain Puzzle Games' → ['meowdoku']（而非 ['meowdoku','brain','puzzle','games']）
  const GENERIC_TOKENS = new Set([
    'game','games','puzzle','puzzles','brain','casual','idle','tycoon',
    'simulator','sim','adventure','quest','online','mobile','free',
    'the','for','and',
  ]);
  function extractLatinTokens(name) {
    if (!name) return [];
    return (name.toLowerCase().match(/[a-z]{3,}/g) || []).filter(t => !GENERIC_TOKENS.has(t));
  }

  const devGameMap = new Map(); // normalized_dev → [{appId, platform, name, developer}]
  for (const market of MARKETS) {
    for (const plat of ['ios', 'android']) {
      if (plat === 'android' && !market.hasGooglePlay) continue;
      for (const ct of CHART_TYPES) {
        const snap = loadSnapshot(today, market.code, plat, ct.id);
        if (!snap || !snap.data) continue;
        for (const app of snap.data) {
          if (!app.developer) continue;
          const devKey = normalizeDev(app.developer);
          if (!devKey) continue;
          if (!devGameMap.has(devKey)) devGameMap.set(devKey, []);
          const list = devGameMap.get(devKey);
          if (!list.find(e => e.appId === app.appId)) {
            list.push({ appId: app.appId, platform: plat, name: app.name, developer: app.developer });
          }
        }
      }
    }
  }

  // Step 2: 為每個黑馬配對另一平台的 sibling appId
  let pairedCount = 0;
  for (const dh of mergedDarkhorses) {
    if (!dh.developer) continue;
    const dhDevKey = normalizeDev(dh.developer);
    const otherPlatform = dh.platform === 'android' ? 'ios' : 'android';

    // 找所有開發商名稱匹配的候選遊戲
    let candidates = [];
    for (const [devKey, games] of devGameMap) {
      if (devMatch(dhDevKey, devKey)) {
        candidates.push(...games.filter(g => g.platform === otherPlatform));
      }
    }
    // 去重
    const seen = new Set();
    candidates = candidates.filter(c => {
      if (seen.has(c.appId)) return false;
      seen.add(c.appId);
      return true;
    });

    if (candidates.length === 0) continue;

    // 逆向驗證：避免「同開發商但不同款遊戲」被錯誤合併
    // 通過條件（必須同時）：
    //   1. 開發商正規化後完全相等或互含
    //   2. 核心名稱（過濾通用字後）至少有 1 個 latin token 共通，
    //      或 CJK 字元交集 ≥ 2
    // 不同款遊戲的命名通常無法同時通過這兩條
    const pairVerify = (c) => {
      const dhDev2 = normalizeDev(dh.developer);
      const cDev = normalizeDev(c.developer);
      if (!dhDev2 || !cDev) return false;
      if (dhDev2 !== cDev && !(dhDev2.includes(cDev) || cDev.includes(dhDev2))) return false;
      const dhT = extractLatinTokens(dh.name);
      const cT = extractLatinTokens(c.name);
      // token 規則 v2:單一共通 token 不夠(品類詞如 sort/block 會讓同廠不同款誤配,
      // 例:Block Out Color "Sort" ↔ Magic "Sort")。
      // 通過條件:共通 token ≥ 2,或其中一方名稱本身只有 1 個 token 且完全命中(如 Fortnite ↔ Fortnite)
      const common = dhT.filter(t => cT.includes(t));
      if (common.length >= 2) return true;
      if (common.length === 1 && (dhT.length === 1 || cT.length === 1)) return true;
      const dhCJK2 = (dh.name.match(/[一-鿿぀-ヿ가-힯]/g) || []).join('');
      const cCJK2 = (c.name.match(/[一-鿿぀-ヿ가-힯]/g) || []).join('');
      const cjkCommon = [...dhCJK2].filter(ch => cCJK2.includes(ch)).length;
      return cjkCommon >= 2;
    };

    if (candidates.length === 1) {
      // 同開發商在另一平台只有一款遊戲 → 仍需驗證才能配對
      if (pairVerify(candidates[0])) {
        dh._siblingAppIds = [candidates[0].appId];
        pairedCount++;
      }
    } else {
      // 同開發商有多款遊戲 → 多重策略篩選

      // 策略 A：用名稱相似度篩選
      const dhTokens = extractLatinTokens(dh.name);
      let bestMatch = null;
      let bestScore = 0;

      for (const c of candidates) {
        const cTokens = extractLatinTokens(c.name);
        // 計算共有 token 數量
        let matchScore = 0;
        for (const t of dhTokens) {
          if (cTokens.includes(t)) matchScore++;
          // 子字串匹配（如 "genshin" 出現在 candidate 的某個 token 中）
          else if (cTokens.some(ct => ct.includes(t) || t.includes(ct))) matchScore += 0.5;
        }
        // CJK 字元比對（漢字 + 假名 + 韓文）
        const dhCJK = (dh.name.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).join('');
        const cCJK = (c.name.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).join('');
        if (dhCJK.length >= 2 && cCJK.length >= 2) {
          const commonCJK = [...dhCJK].filter(ch => cCJK.includes(ch)).length;
          matchScore += commonCJK * 0.3;
        }

        if (matchScore > bestScore) {
          bestScore = matchScore;
          bestMatch = c;
        }
      }

      if (bestMatch && bestScore >= 1 && pairVerify(bestMatch)) {
        dh._siblingAppIds = [bestMatch.appId];
        pairedCount++;
      } else {
        // 策略 B：同開發商 + 同排行類型在另一平台只有一款遊戲
        // 例如：COGNOSPHERE 的 grossing 在 iOS 上只有「原神」→ 直接配 Android「Genshin Impact」
        const chartTypeCandidates = [];
        for (const market of MARKETS) {
          if (otherPlatform === 'android' && !market.hasGooglePlay) continue;
          const snap = loadSnapshot(today, market.code, otherPlatform, dh.chartType);
          if (!snap || !snap.data) continue;
          for (const app of snap.data) {
            if (!app.developer) continue;
            const appDevKey = normalizeDev(app.developer);
            if (devMatch(dhDevKey, appDevKey) && !chartTypeCandidates.find(c => c.appId === app.appId)) {
              chartTypeCandidates.push({ appId: app.appId, name: app.name, developer: app.developer });
            }
          }
        }
        if (chartTypeCandidates.length === 1 && pairVerify(chartTypeCandidates[0])) {
          dh._siblingAppIds = [chartTypeCandidates[0].appId];
          pairedCount++;
        }
      }
    }
  }

  if (pairedCount > 0) {
    console.log(`🔗 自動配對 ${pairedCount} 匹黑馬的跨平台 sibling`);
  }

  // ============ 計算 _topRanks（今日快照實際排名） ============
  // 直接查今天的排行榜資料，找該遊戲在所有市場×平台的排名
  function normNameForMatch(n) { return (n || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\u0e00-\u0e7f]/g, ''); }

  for (const dh of mergedDarkhorses) {
    const appIds = new Set([dh.appId, ...(dh._siblingAppIds || [])]);
    const ranks = [];
    const foundMarketPlatform = new Set();
    const dhNorm = normNameForMatch(dh.name);

    for (const market of MARKETS) {
      for (const scanPlatform of ['ios', 'android']) {
        if (scanPlatform === 'android' && !market.hasGooglePlay) continue;
        const snap = loadSnapshot(today, market.code, scanPlatform, dh.chartType);
        if (!snap || !snap.data) continue;
        const dedupKey = `${market.code}_${scanPlatform}`;
        let matched = null;

        // 1. appId 精確比對
        for (const appId of appIds) {
          const entry = snap.data.find(a => a.appId === appId);
          if (entry && entry.rank <= 100) { matched = entry; break; }
        }

        // 2. 名稱完全一致（正規化後）+ 開發商可辨識為同一家
        //    例：同款遊戲在 iOS 與 Android 由不同代理商發行，名稱完全一致時仍允許配對
        //    但要求開發商正規化後相等或互含，避免「Brain Out」這類通用名被別家遊戲誤配
        if (!matched && dhNorm.length >= 3 && dh.developer) {
          const dhDev2 = normNameForMatch(dh.developer);
          matched = snap.data.find(a => {
            if (!a.rank || a.rank > 100 || !a.developer) return false;
            if (normNameForMatch(a.name) !== dhNorm) return false;
            const aDev2 = normNameForMatch(a.developer);
            return dhDev2.length >= 3 && aDev2.length >= 3 &&
                   (dhDev2 === aDev2 || dhDev2.includes(aDev2) || aDev2.includes(dhDev2));
          });
          if (matched) appIds.add(matched.appId);
        }

        // 3. 開發商匹配 + 核心名稱完全相等（處理同款遊戲在不同地區的副標題差異）
        //    核心名稱 = 去掉 game / puzzle / brain / ... 等通用字後的剩餘字元
        //    例：Meowdoku! 與 Meowdoku: Brain Puzzle Games 都得到核心 'meowdoku'
        //    舊版用「字元集合 50% 重疊」太鬆，同開發商的 Arrows GO! 會被誤配到 Meowdoku
        //    若同款遊戲跨地區用完全不同名（如奧丁TW vs 오딘KR），需另開 manual-pairs.json 處理
        if (!matched && dh.name && dh.developer) {
          const GENERIC_WORDS_RE = /\b(game|games|puzzle|puzzles|brain|casual|idle|tycoon|simulator|sim|adventure|quest|online|mobile|free|the|of|and|for)\b/gi;
          const coreNameForMatch = (n) => (n || '').toLowerCase()
            .replace(GENERIC_WORDS_RE, '')
            .replace(/[^a-z0-9一-鿿぀-ヿ가-힯฀-๿]/g, '');
          const dhDev = normNameForMatch(dh.developer);
          const dhCore = coreNameForMatch(dh.name);
          if (dhCore.length >= 3) {
            for (const a of snap.data) {
              if (!a.name || !a.rank || a.rank > 100 || !a.developer) continue;
              const aDev = normNameForMatch(a.developer);
              if (dhDev.length >= 3 && aDev.length >= 3 && (dhDev.includes(aDev) || aDev.includes(dhDev))) {
                const aCore = coreNameForMatch(a.name);
                if (aCore === dhCore) { matched = a; appIds.add(a.appId); break; }
              }
            }
          }
        }

        if (matched && !foundMarketPlatform.has(dedupKey)) {
          foundMarketPlatform.add(dedupKey);
          ranks.push({
            marketCode: market.code,
            marketFlag: market.flag,
            platform: scanPlatform,
            rank: matched.rank,
            chartLabel: dh.chartType === 'grossing' ? '營收' : '免費',
            appId: matched.appId,
          });
        }
      }
    }
    // 按名次排序（小的排前面）
    ranks.sort((a, b) => a.rank - b.rank);
    dh._topRanks = ranks;
  }

  // ============ Step 9: 計算 displayScore (v3 — marketWeight + breadth + decay-aware + timeDecay) ============
  // 目的: 反映「當下實際強度」,讓:
  //   - 多市場高排名 → 高分 (廣度加成)
  //   - 大市場 (US/JP) 比次要市場 (TH/VN) 權重高
  //   - 真正衰退 (今天排名比觸發當天差) → 扣分;新擴張到的市場低排名 → 不扣
  //   - 老黑馬隨時間自然淡出 (time decay,半衰期 60 天)
  // confidenceScore 永遠保留原值,新公式只影響 displayScore + 排序

  // 市場分層權重 (可日後微調)
  const MARKET_WEIGHT = {
    us: 1.0, jp: 1.0, kr: 0.9, cn: 0.9,
    tw: 0.7,
    th: 0.5, vn: 0.5, ph: 0.5,
  };
  const getMarketWeight = (mkt) => (mkt && MARKET_WEIGHT[mkt] != null) ? MARKET_WEIGHT[mkt] : 0.5;

  // 從 trigger 解析 triggerRank (新觸發直接有,舊資料從 detail 字串抽)
  function parseTriggerRank(t) {
    if (typeof t.triggerRank === 'number') return t.triggerRank;
    const d = t.detail || '';
    let m = d.match(/升至 #(\d+)/);                   if (m) return parseInt(m[1]);
    m = d.match(/排名 #(\d+)/);                       if (m) return parseInt(m[1]);
    m = d.match(/→ #(\d+)/);                          if (m) return parseInt(m[1]);
    m = d.match(/平均 #(\d+) vs/);                    if (m) return parseInt(m[1]);
    return null;
  }

  // 衰退判別: 今天排名 vs 觸發當天排名
  //   今天比觸發時更好 → 1.0 (沒衰退)
  //   今天比觸發時差 → triggerRank/todayRank,下限 0.4
  //   完全掉榜 → 0.1
  //   無法解析觸發排名 → fallback 用絕對排名 marketFactor (避免無 fallback 時 NaN)
  function rankDecay(triggerRank, todayRank) {
    if (todayRank == null || todayRank <= 0) return 0.1;
    if (triggerRank == null) return 1 / (1 + Math.pow(todayRank / 20, 1.5));
    if (todayRank <= triggerRank) return 1.0;
    return Math.max(triggerRank / todayRank, 0.4);
  }

  // 廣度加成 — 取上榜市場的 weight 加總,做 log2 化,上限 +30% 乘數
  function breadthFactor(dh) {
    const seen = new Set();
    let total = 0;
    for (const r of (dh._topRanks || [])) {
      if (!seen.has(r.marketCode)) {
        seen.add(r.marketCode);
        total += getMarketWeight(r.marketCode);
      }
    }
    if (total <= 0) return 1.0;
    return 1 + Math.max(Math.min(Math.log2(total) * 0.15, 0.3), 0);
  }

  // 時間衰減 — 半衰期 60 天的連續曲線,3 天內觀察期不衰減
  // 1.0 (3 天) → 0.9 (8 天) → 0.83 (14 天) → 0.67 (30 天) → 0.5 (60 天) → 0.33 (120 天)
  function timeDecay(detectedAt) {
    if (!detectedAt) return 1.0;
    const days = Math.floor((new Date(today) - new Date(detectedAt.substring(0, 10))) / 86400000);
    if (days < 3) return 1.0;
    return 1 / (1 + (days - 3) / 30);
  }

  for (const dh of mergedDarkhorses) {
    // 觀察期保護: 偵測 < 3 天的新黑馬不修正
    const detectedDate = (dh.detectedAt || '').substring(0, 10);
    const daysSinceDetected = detectedDate
      ? Math.floor((new Date(today) - new Date(detectedDate)) / 86400000)
      : 999;
    if (daysSinceDetected < 3) {
      dh.healthRatio = 1.0;
      dh.displayScore = dh.confidenceScore;
      continue;
    }

    // 收集每個市場的當前最佳排名 (從 _topRanks 取)
    const currentRanks = {};
    for (const r of (dh._topRanks || [])) {
      if (!currentRanks[r.marketCode] || r.rank < currentRanks[r.marketCode]) {
        currentRanks[r.marketCode] = r.rank;
      }
    }

    // healthRatio: marketWeight × decay 加權
    let totalWeight = 0, decayedWeight = 0;
    for (const t of (dh.triggers || [])) {
      const mw = getMarketWeight(t.market);
      const sw = (t.score || 0) * mw;  // 該 trigger 的權重 = score × market weight
      totalWeight += sw;
      if (!t.market) { decayedWeight += sw; continue; }
      // snapshotMissing: 快照不存在 → 不懲罰
      const snap = loadSnapshot(today, t.market, dh.platform, dh.chartType);
      if (!snap || !snap.data) { decayedWeight += sw; continue; }
      const tRank = parseTriggerRank(t);
      const todayRank = currentRanks[t.market];
      decayedWeight += sw * rankDecay(tRank, todayRank);
    }

    const rawHealth = totalWeight > 0 ? decayedWeight / totalWeight : 1.0;
    // 下限保護: retained 0.5 / 新黑馬 0.4
    const floor = dh._retained ? 0.5 : 0.4;
    const health = Math.max(rawHealth, floor);

    // 廣度與時間衰減
    const breadth = breadthFactor(dh);
    const decay = timeDecay(dh.detectedAt);

    dh.healthRatio = Math.round(health * 100) / 100;
    dh.breadthFactor = Math.round(breadth * 100) / 100;
    dh.timeDecay = Math.round(decay * 100) / 100;
    // 顯示分公式: confidenceScore × health × breadth × timeDecay,封頂 10
    dh.displayScore = Math.round(Math.min(dh.confidenceScore * health * breadth * decay, 10) * 100) / 100;
  }

  // 用 displayScore 重新排序 (不動 confidenceScore 原值)
  mergedDarkhorses.sort((a, b) =>
    (b.displayScore ?? b.confidenceScore) - (a.displayScore ?? a.confidenceScore)
  );

  // 儲存結果
  const outputFile = path.join(darkhorseDir, `${today}.json`);
  fs.writeFileSync(outputFile, JSON.stringify({
    date: today,
    totalBeforeMerge: allDarkhorses.length,
    count: mergedDarkhorses.length,
    retainedCount,
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
