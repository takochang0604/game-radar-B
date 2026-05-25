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
  MARKET_WEIGHTS,
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
  return OVERRIDE_DATE || formatLocalDate(new Date());
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
 * 7 天內排名上升 ≥ 30 名
 * gapInfo: snapshot 斷層資訊，有斷層時提高門檻避免誤判
 */
function detectRankJump(app, history, gapInfo) {
  const validHistory = history.filter(h => h.rank !== null);
  if (validHistory.length < 2) return null;

  const currentRank = validHistory[validHistory.length - 1].rank;
  const oldestRank = validHistory[0].rank;

  if (oldestRank === null || currentRank === null) return null;

  // 有 snapshot 斷層時提高門檻（斷層可能導致中間的漸進式變化被忽略）
  let threshold = DARKHORSE_CONFIG.rankJumpThreshold;
  if (gapInfo && gapInfo.hasSignificantGap) {
    threshold = Math.ceil(threshold * 1.5);
  }

  const jump = oldestRank - currentRank;
  if (jump >= threshold) {
    const gapNote = (gapInfo && gapInfo.hasSignificantGap) ? '（⚠️ 有快照斷層，門檻已提高）' : '';
    return {
      strategy: 'rank_jump',
      label: '🚀 排名急升',
      detail: `排名從 #${oldestRank} 升至 #${currentRank}（↑${jump} 名）${gapNote}`,
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
 * gapInfo: snapshot 斷層資訊，有斷層時要求更多 confirmedNulls
 */
function detectNewEntry(app, history, gapInfo) {
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

  // 有 snapshot 斷層時，要求更多天數確認（避免斷層期間的遊戲被誤判）
  let requiredNulls = DARKHORSE_CONFIG.newEntryMinNulls;
  if (gapInfo && gapInfo.hasSignificantGap) {
    requiredNulls = Math.ceil(requiredNulls * 1.5);
  }

  // 前面必須有足夠天數確認不在榜上
  if (confirmedNulls >= requiredNulls && validHistory.length <= DARKHORSE_CONFIG.newEntryDays) {
    const gapNote = (gapInfo && gapInfo.hasSignificantGap) ? '（⚠️ 有快照斷層，門檻已提高）' : '';
    return {
      strategy: 'new_entry',
      label: '🆕 新進榜',
      detail: `首次進入 Top 100，目前排名 #${currentRank}${gapNote}`,
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

  const threshold = DARKHORSE_CONFIG.growthMultiplierThreshold || 2.5;
  if (multiplier >= threshold) {
    const gapNote = (gapInfo && gapInfo.hasSignificantGap) ? '（⚠️ 有快照斷層）' : '';
    return {
      strategy: 'growth_multiplier',
      label: '📊 成長加速',
      detail: `成長倍率 ${multiplier.toFixed(1)}×（近 ${shortWindow} 天平均 #${Math.round(recentAvg)} vs 近 ${longWindow} 天平均 #${Math.round(longAvg)}）${gapNote}`,
      score: Math.min(multiplier / threshold, 2.5),
    };
  }
  return null;
}

/**
 * 排名權重：排名越高（數字越小）越重要
 * 擴展到 Top 100 支援
 */
function getRankWeight(rank) {
  if (rank <= 5)  return 2.0;
  if (rank <= 10) return 1.5;
  if (rank <= 20) return 1.2;
  if (rank <= 50) return 1.0;
  if (rank <= 100) return 0.7;
  return 0.5;
}

// 市場權重已從 config.js 匯入（按榜類型區分：topfree / grossing）

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

    // 按榜類型查詢市場權重（config.js 中定義了 topfree / grossing 各自的權重表）

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

          // 排名急升已觸發時跳過新進榜（避免矛盾：有歷史排名卻說首次進入）
          if (!jumpResult) {
            const newEntryResult = detectNewEntry(app, history, gapInfo);
            if (newEntryResult) {
              newEntryResult._detectedAt = today;
              newEntryResult.market = market.code;
              newEntryResult.marketName = market.name;
              newEntryResult.marketFlag = market.flag;
              triggers.push(newEntryResult);
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
            if (app.score && app.score < DARKHORSE_CONFIG.minScore) continue;
            if (app.rank > DARKHORSE_CONFIG.maxCurrentRank) continue;

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

            const baseScore = triggers.reduce((sum, t) => sum + t.score, 0);
            const rankWeight = getRankWeight(app.rank);
            const marketWeight = (MARKET_WEIGHTS[chartType.id] || {})[market.code] || 1.0;
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

  // 信心分數過濾：低於門檻的不列為黑馬
  const beforeFilter = allDarkhorses.length;
  const filtered = allDarkhorses.filter(d => d.confidenceScore >= DARKHORSE_CONFIG.minConfidence);
  const removedCount = beforeFilter - filtered.length;
  if (removedCount > 0) {
    console.log(`\n🧹 品質過濾: 移除 ${removedCount} 匹（評分 < ${DARKHORSE_CONFIG.minScore} 或信心 < ${DARKHORSE_CONFIG.minConfidence}）`);
  }

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

  // ============ 多市場加分 ============
  // 同一遊戲在越多市場被偵測為黑馬，信心分數越高
  // 加分公式：基礎分（單市場最高分）+ 額外市場數 × 加分係數
  // 加分係數按市場權重加權，大市場（日/美/韓）貢獻更高
  for (const [, dh] of mergedMap) {
    if (dh.markets.length <= 1) continue;

    // 所有市場分數按高到低排序
    const sortedScores = dh.markets.map(m => m.score).sort((a, b) => b - a);
    const baseScore = sortedScores[0]; // 已經是最高分

    // 額外市場加分：每個額外市場貢獻其分數的 30%
    let multiMarketBonus = 0;
    for (let i = 1; i < sortedScores.length; i++) {
      multiMarketBonus += sortedScores[i] * 0.3;
    }

    // 多市場一致性加成：出現在 3+ 市場 = 1.15×，5+ 市場 = 1.3×
    let consistencyMultiplier = 1.0;
    if (dh.markets.length >= 5) {
      consistencyMultiplier = 1.3;
    } else if (dh.markets.length >= 3) {
      consistencyMultiplier = 1.15;
    }

    const newScore = (baseScore + multiMarketBonus) * consistencyMultiplier;
    dh.confidenceScore = Math.round(newScore * 100) / 100;
  }

  // 精簡 rankHistory：走勢線只顯示 7 天，保留最近 7 筆即可
  for (const [, dh] of mergedMap) {
    if (dh.rankHistory && dh.rankHistory.length > 7) {
      dh.rankHistory = dh.rankHistory.slice(-7);
    }
    if (dh._rankHistoryByMarket) {
      for (const mkt of Object.keys(dh._rankHistoryByMarket)) {
        const hist = dh._rankHistoryByMarket[mkt];
        if (hist && hist.length > 7) {
          dh._rankHistoryByMarket[mkt] = hist.slice(-7);
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
  // 過去 N 天曾被偵測為黑馬的遊戲，如果今天仍在榜上且排名夠高，就繼續保留
  // 衰減公式：信心分數 * 0.85^(天數)，越久衰減越多
  const retentionDays = DARKHORSE_CONFIG.retentionDays || 30;
  const retentionMinRank = 20;     // 只保留仍在 Top 20 的
  const retentionMinScore = 3.0;   // 衰減後信心分數需 >= 3.0
  const decayRate = 0.85;          // 每天衰減 15%
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
        // 時間衰減
        const decayedScore = pastDh.confidenceScore * Math.pow(decayRate, daysAgo);
        if (decayedScore < retentionMinScore) continue;
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
          const dateStr = cursor.toISOString().split('T')[0];
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
        // 修正：當黑馬被保留時，除了更新主體的 currentRank，也必須同步更新 markets 陣列中對應主市場的排名
        const updatedMarkets = (pastDh.markets || []).map(m => {
          if (m.code === pastDh.market) {
            return { ...m, rank: todayApp.rank };
          }
          return m;
        });

        const retained = {
          ...pastDh,
          currentRank: todayApp.rank,
          confidenceScore: Math.round(decayedScore * 100) / 100,
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
