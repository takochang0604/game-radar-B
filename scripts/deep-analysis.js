/**
 * 深度分析模組
 * 針對偵測到的黑馬，自動收集更多資訊並推測竄升原因
 * 
 * 用法: node scripts/deep-analysis.js
 */

import gplay from 'google-play-scraper';
import * as appStore from '@perttu/app-store-scraper';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  DARKHORSE_DIR,
  ANALYSIS_DIR,
  FETCH_CONFIG,
} from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function ensureDir(dirPath) {
  const resolved = path.resolve(ROOT, dirPath);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

// ============ 活動/事件關鍵字 ============
const EVENT_KEYWORDS = ['event', 'update', 'collab', 'collaboration', 'anniversary', 'limited', 'new', 'season',
  'イベント', 'コラボ', '周年', '新', 'シーズン', 'アップデート',
  '이벤트', '콜라보', '업데이트', '시즌',
  '活動', '聯動', '合作', '周年', '新版', '賽季', '更新'];

/**
 * 分析評論星等分布
 */
function analyzeReviews(reviews) {
  const starCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const eventMentions = [];

  for (const review of reviews) {
    // 統計星等
    const score = review.score || review.rating || 0;
    if (score >= 1 && score <= 5) {
      starCounts[Math.round(score)]++;
    }

    // 檢查事件/活動提及
    const text = (review.text || review.title || '').toLowerCase();
    const eventHits = EVENT_KEYWORDS.filter(kw => text.includes(kw.toLowerCase()));
    if (eventHits.length > 0) {
      eventMentions.push({ text: text.substring(0, 100), keywords: eventHits });
    }
  }

  const total = reviews.length;
  const positiveStars = starCounts[5] + starCounts[4];
  const negativeStars = starCounts[2] + starCounts[1];

  return {
    total,
    starCounts,
    positiveRatio: total > 0 ? Math.round((positiveStars / total) * 100) : 0,
    negativeRatio: total > 0 ? Math.round((negativeStars / total) * 100) : 0,
    eventMentions: eventMentions.slice(0, 5),
  };
}

/**
 * 推測竄升原因
 */
function inferReasons(appDetail, reviewAnalysis, triggers) {
  const reasons = [];
  const now = new Date();

  // 1. 新遊戲上線熱度
  if (appDetail.released) {
    const releaseDate = new Date(appDetail.released);
    const daysSinceRelease = Math.floor((now - releaseDate) / (1000 * 60 * 60 * 24));
    if (daysSinceRelease <= 30 && (appDetail.score || 0) >= 4.0) {
      reasons.push({
        type: 'new_release',
        label: '🆕 新遊戲上線熱度',
        detail: `上架 ${daysSinceRelease} 天，評分 ${appDetail.score}`,
        confidence: 'high',
      });
    }
  }

  // 2. 重大更新帶動
  if (appDetail.updated) {
    const updateDate = new Date(appDetail.updated);
    const daysSinceUpdate = Math.floor((now - updateDate) / (1000 * 60 * 60 * 24));
    if (daysSinceUpdate <= 14) {
      reasons.push({
        type: 'major_update',
        label: '🔄 重大更新帶動',
        detail: `最近更新: ${daysSinceUpdate} 天前`,
        confidence: daysSinceUpdate <= 7 ? 'high' : 'medium',
      });
    }
  }

  // 3. 限時活動引流
  if (reviewAnalysis.eventMentions.length >= 2) {
    reasons.push({
      type: 'event_driven',
      label: '🎉 限時活動引流',
      detail: `評論中 ${reviewAnalysis.eventMentions.length} 次提及活動/事件`,
      confidence: 'medium',
    });
  }

  // 4. 口碑爆發
  if (reviewAnalysis.positiveRatio >= 80 && reviewAnalysis.total >= 10) {
    reasons.push({
      type: 'word_of_mouth',
      label: '💬 口碑爆發',
      detail: `4-5星評論佔 ${reviewAnalysis.positiveRatio}%`,
      confidence: 'medium',
    });
  }

  // 5. 節慶行銷
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const holidays = [
    { m: 1, d: [1, 2, 3], name: '新年' },
    { m: 2, d: [14], name: '情人節' },
    { m: 10, d: [31], name: '萬聖節' },
    { m: 12, d: [24, 25], name: '聖誕節' },
  ];
  const nearHoliday = holidays.find(h => h.m === month && h.d.some(hd => Math.abs(hd - day) <= 7));
  if (nearHoliday) {
    reasons.push({
      type: 'holiday_marketing',
      label: '🎄 節慶行銷推波',
      detail: `接近 ${nearHoliday.name}`,
      confidence: 'low',
    });
  }

  // 若沒有找到原因
  if (reasons.length === 0) {
    reasons.push({
      type: 'unknown',
      label: '🔍 待深入調查',
      detail: '未能自動推測原因，建議手動查看',
      confidence: 'low',
    });
  }

  return reasons;
}

/**
 * 分析單個黑馬（Google Play）
 */
async function analyzeAndroidApp(darkhorse) {
  try {
    const detail = await gplay.app({ appId: darkhorse.appId, country: darkhorse.market });
    await sleep(1000);

    let reviews = [];
    try {
      reviews = await gplay.reviews({
        appId: darkhorse.appId,
        country: darkhorse.market,
        sort: gplay.sort.NEWEST,
        num: 100,
      });
      reviews = reviews.data || reviews;
    } catch { /* 評論可能抓不到 */ }
    await sleep(1000);

    const reviewAnalysis = analyzeReviews(reviews);

    const reasons = inferReasons(detail, reviewAnalysis, darkhorse.triggers);

    return {
      appId: darkhorse.appId,
      name: darkhorse.name,
      platform: 'android',
      market: darkhorse.market,
      detail: {
        description: (detail.description || '').substring(0, 500),
        released: detail.released,
        updated: detail.updated,
        version: detail.version,
        installs: detail.installs,
        score: detail.score,
        ratings: detail.ratings,
        reviews: detail.reviews,
        developer: detail.developer,
        developerWebsite: detail.developerWebsite,
        genre: detail.genre,
        recentChanges: detail.recentChanges,
      },
      reviewAnalysis,
      inferredReasons: reasons,
      analyzedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`  ⚠️ 分析失敗 [${darkhorse.name}]: ${err.message}`);
    return null;
  }
}

/**
 * 分析單個黑馬（iOS）
 */
async function analyzeIOSApp(darkhorse) {
  try {
    const detail = await appStore.app({ id: parseInt(darkhorse.appId), country: darkhorse.market });
    await sleep(1000);

    let reviews = [];
    try {
      reviews = await appStore.reviews({ id: parseInt(darkhorse.appId), country: darkhorse.market, page: 1 });
    } catch { /* 評論可能抓不到 */ }
    await sleep(1000);

    const reviewAnalysis = analyzeReviews(reviews);

    const reasons = inferReasons(detail, reviewAnalysis, darkhorse.triggers);

    return {
      appId: darkhorse.appId,
      name: darkhorse.name,
      platform: 'ios',
      market: darkhorse.market,
      detail: {
        description: (detail.description || '').substring(0, 500),
        released: detail.released,
        updated: detail.updated,
        version: detail.version,
        score: detail.score,
        ratings: detail.ratings,
        reviews: detail.reviews,
        developer: detail.developer,
        developerUrl: detail.developerUrl,
        genres: detail.genres,
        releaseNotes: detail.releaseNotes,
      },
      reviewAnalysis,
      inferredReasons: reasons,
      analyzedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`  ⚠️ 分析失敗 [${darkhorse.name}]: ${err.message}`);
    return null;
  }
}

// ============ 主程式 ============
async function main() {
  const today = getToday();
  const analysisDir = ensureDir(ANALYSIS_DIR);

  // 載入今日黑馬清單
  const darkhorseFile = path.resolve(ROOT, DARKHORSE_DIR, `${today}.json`);
  if (!fs.existsSync(darkhorseFile)) {
    console.log('❌ 找不到今日黑馬清單，請先執行 npm run analyze');
    process.exit(1);
  }

  const darkhorseData = JSON.parse(fs.readFileSync(darkhorseFile, 'utf-8'));
  const darkhorses = darkhorseData.darkhorses || [];

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  🔬 深度分析模組                             ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`📅 日期: ${today}`);
  console.log(`🐴 黑馬數量: ${darkhorses.length}`);
  console.log('');

  // 按 appId 去重（同一款遊戲在多個市場只分析一次）
  const seenAppIds = new Set();
  const uniqueDarkhorses = [];
  for (const dh of darkhorses) {
    if (!seenAppIds.has(dh.appId)) {
      seenAppIds.add(dh.appId);
      uniqueDarkhorses.push(dh);
    }
  }
  console.log(`🔀 去重後: ${uniqueDarkhorses.length} 款遊戲（原 ${darkhorses.length} 筆）`);

  // 跳過已有最新分析的遊戲（當天已分析過就跳過）
  const toAnalyze = uniqueDarkhorses.filter(dh => {
    const appFile = path.join(analysisDir, `${dh.appId}.json`);
    if (fs.existsSync(appFile)) {
      try {
        const existing = JSON.parse(fs.readFileSync(appFile, 'utf-8'));
        if (existing.analyzedAt && existing.analyzedAt.startsWith(today)) {
          return false; // 今天已分析過，跳過
        }
      } catch {}
    }
    return true;
  });
  console.log(`📋 待分析: ${toAnalyze.length} 款（跳過 ${uniqueDarkhorses.length - toAnalyze.length} 款已分析）`);
  console.log('');

  const results = [];

  for (let i = 0; i < toAnalyze.length; i++) {
    const dh = toAnalyze[i];
    console.log(`[${i + 1}/${toAnalyze.length}] 分析: ${dh.marketFlag} ${dh.name} (${dh.platform})`);

    let analysis = null;
    if (dh.platform === 'android') {
      analysis = await analyzeAndroidApp(dh);
    } else {
      analysis = await analyzeIOSApp(dh);
    }

    if (analysis) {
      results.push(analysis);
      // 個別儲存
      const appFile = path.join(analysisDir, `${dh.appId}.json`);
      fs.writeFileSync(appFile, JSON.stringify(analysis, null, 2), 'utf-8');
    }
  }

  // 儲存彙總
  const summaryFile = path.join(analysisDir, `summary_${today}.json`);
  fs.writeFileSync(summaryFile, JSON.stringify({
    date: today,
    analyzed: results.length,
    results,
  }, null, 2), 'utf-8');

  console.log(`\n✅ 完成！分析了 ${results.length} 個黑馬`);
  console.log(`📁 結果: ${analysisDir}`);
}

main().catch(err => {
  console.error('❌ 致命錯誤:', err);
  process.exit(1);
});
