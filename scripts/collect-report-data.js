/**
 * 評測報告資料蒐集腳本 v3
 *
 * 用法: node scripts/collect-report-data.js <androidAppId> [iosAppId]
 * 範例: node scripts/collect-report-data.js com.brain.twist.tricky.story 6757844491
 *
 * 輸出: 評測報告/<遊戲名稱>/raw-data.json
 *
 * v3 變更:
 *  - 評論按「實際上榜市場」的語言/國家抓取(修正 v2 只抓英文的樣本偏差)
 *  - 新增 facts 區塊:觸發時間線、市場擴散順序、上架天數、14 天排名走勢
 *    (全部來自系統快照,供報告引用為「觀測事實」而非 AI 推測)
 *  - 新增 cohortBaseline:同品類黑馬的基準統計(上榜國數/存活天數/Top10 比例)
 */

import gplay from 'google-play-scraper';
import * as store from '@perttu/app-store-scraper';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPORTS_ROOT = path.join(ROOT, '評測報告');
const DARKHORSE_DIR = path.join(ROOT, 'data', 'darkhorse');
const SNAPSHOTS_DIR = path.join(ROOT, 'data', 'snapshots');

// 支援兩種模式:
//   node scripts/collect-report-data.js <androidAppId> [iosAppId]   ← Android 為主
//   node scripts/collect-report-data.js --ios <iosAppId>            ← iOS 獨佔遊戲
const iosOnly = process.argv[2] === '--ios';
const androidAppId = iosOnly ? null : process.argv[2];
const iosAppIdArg  = iosOnly ? process.argv[3] : (process.argv[3] || null);

if ((!iosOnly && !androidAppId) || (iosOnly && !iosAppIdArg)) {
  console.error('❌ 用法: node scripts/collect-report-data.js <androidAppId> [iosAppId]');
  console.error('         node scripts/collect-report-data.js --ios <iosAppId>   (iOS 獨佔)');
  process.exit(1);
}

// 市場 → Google Play 評論語言 / App Store 國家
const MARKET_LANG = {
  us: { gpLang: 'en',    iosCountry: 'us', flag: '🇺🇸' },
  jp: { gpLang: 'ja',    iosCountry: 'jp', flag: '🇯🇵' },
  kr: { gpLang: 'ko',    iosCountry: 'kr', flag: '🇰🇷' },
  cn: { gpLang: null,    iosCountry: 'cn', flag: '🇨🇳' }, // 中國無 Google Play
  tw: { gpLang: 'zh-TW', iosCountry: 'tw', flag: '🇹🇼' },
  th: { gpLang: 'th',    iosCountry: 'th', flag: '🇹🇭' },
  vn: { gpLang: 'vi',    iosCountry: 'vn', flag: '🇻🇳' },
  ph: { gpLang: 'en',    iosCountry: 'ph', flag: '🇵🇭' },
};

// ─── 工具函式 ────────────────────────────────────────────────────────────────

async function safe(fn, fallback = null) {
  try { return await fn(); } catch (e) {
    console.warn(`  ⚠️  略過（${e.message?.slice(0, 60)}）`);
    return fallback;
  }
}

async function gplayReviews(appId, sort, num, lang) {
  const result = await gplay.reviews({ appId, lang, sort, num });
  return (result.data || []).map(r => ({
    source: 'google_play', lang,
    userName: r.userName, score: r.score, text: r.text,
    date: r.date, thumbsUp: r.thumbsUp,
  }));
}

async function iosReviews(id, page, country) {
  const numericId = parseInt(String(id).replace(/\D/g, ''), 10);
  const result = await store.reviews({ id: numericId, page, country });
  return (result || []).map(r => ({
    source: 'app_store', country,
    userName: r.userName, score: r.score, text: r.text,
    date: r.updated, version: r.version, url: r.url,
  }));
}

function latestDarkhorseFile() {
  const files = fs.readdirSync(DARKHORSE_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  return files.length ? files[files.length - 1] : null;
}

function listSnapshotDates(limit = 14) {
  if (!fs.existsSync(SNAPSHOTS_DIR)) return [];
  return fs.readdirSync(SNAPSHOTS_DIR)
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().slice(-limit);
}

// ─── facts:從系統資料萃取觀測事實 ───────────────────────────────────────────

function buildFacts(appIdSet) {
  const latestFile = latestDarkhorseFile();
  if (!latestFile) return null;
  const latest = JSON.parse(fs.readFileSync(path.join(DARKHORSE_DIR, latestFile), 'utf-8'));
  const entries = (latest.darkhorses || []).filter(dh =>
    appIdSet.has(String(dh.appId)) ||
    (dh._siblingAppIds || []).some(id => appIdSet.has(String(id)))
  );
  if (!entries.length) return null;

  // 把 sibling appId 也納入比對集合(跨平台/跨語言版本)
  for (const dh of entries) {
    appIdSet.add(String(dh.appId));
    (dh._siblingAppIds || []).forEach(id => appIdSet.add(String(id)));
  }

  // 1) 觸發時間線(逐筆,依日期排序)
  const timeline = [];
  for (const dh of entries) {
    for (const t of (dh.triggers || [])) {
      timeline.push({
        date: (t._detectedAt || dh.detectedAt || '').substring(0, 10),
        market: t.market || dh.market,
        platform: dh.platform,
        chartType: dh.chartType,
        strategy: t.strategy,
        label: t.label,
        detail: t.detail,
      });
    }
  }
  timeline.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // 2) 市場擴散順序(每市場首次觸發日)
  const firstSeen = {};
  for (const t of timeline) {
    if (t.market && t.date && !firstSeen[t.market]) firstSeen[t.market] = t.date;
  }
  const expansionOrder = Object.entries(firstSeen)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([mkt, date]) => ({ market: mkt, firstTriggerDate: date }));

  // 3) 目前上榜市場與排名(取自 _topRanks)
  const currentMarkets = [];
  for (const dh of entries) {
    for (const r of (dh._topRanks || [])) {
      currentMarkets.push({
        market: r.marketCode, platform: r.platform,
        chart: r.chartLabel, rank: r.rank,
      });
    }
  }
  currentMarkets.sort((a, b) => a.rank - b.rank);

  // 4) 近 14 天排名走勢(逐日掃快照)
  const dates = listSnapshotDates(14);
  const rankHistory = {}; // key: market_platform_chartType → [{date, rank|null}]
  const combos = new Set();
  for (const m of currentMarkets) {
    for (const dh of entries) {
      if (dh.platform === m.platform) {
        combos.add(`${m.market}|${m.platform}|${dh.chartType}`);
      }
    }
  }
  for (const combo of combos) {
    const [mkt, plat, chart] = combo.split('|');
    const series = [];
    for (const date of dates) {
      const f = path.join(SNAPSHOTS_DIR, date, `${mkt}_${plat}_${chart}.json`);
      let rank = null;
      if (fs.existsSync(f)) {
        try {
          const snap = JSON.parse(fs.readFileSync(f, 'utf-8'));
          const hit = (snap.data || []).find(a => appIdSet.has(String(a.appId)));
          if (hit) rank = hit.rank;
        } catch {}
      }
      series.push({ date, rank });
    }
    if (series.some(s => s.rank != null)) rankHistory[`${mkt}_${plat}_${chart}`] = series;
  }

  // 5) 偵測資訊
  const main = entries.reduce((a, b) =>
    (b.displayScore ?? b.confidenceScore ?? 0) > (a.displayScore ?? a.confidenceScore ?? 0) ? b : a
  );

  return {
    source: latestFile,
    detectedAt: main.detectedAt,
    category: main.category || null,
    confidenceScore: main.confidenceScore,
    displayScore: main.displayScore ?? null,
    healthRatio: main.healthRatio ?? null,
    entries: entries.map(e => ({ appId: e.appId, platform: e.platform, chartType: e.chartType })),
    chartedMarkets: [...new Set(currentMarkets.map(m => m.market))],
    currentMarkets,
    triggerTimeline: timeline,
    marketExpansionOrder: expansionOrder,
    rankHistory14d: rankHistory,
  };
}

// ─── cohortBaseline:同品類黑馬基準(掃全部歷史 darkhorse json)─────────────────

function buildCohortBaseline(category, appIdSet) {
  if (!fs.existsSync(DARKHORSE_DIR)) return null;
  const files = fs.readdirSync(DARKHORSE_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (files.length < 7) return null; // 資料太少不做基準

  // key = appId|platform|chartType → { firstSeen, lastSeen, maxMarkets, bestRank, category }
  const games = new Map();
  for (const f of files) {
    let json;
    try { json = JSON.parse(fs.readFileSync(path.join(DARKHORSE_DIR, f), 'utf-8')); } catch { continue; }
    const date = f.replace('.json', '');
    for (const dh of (json.darkhorses || [])) {
      const key = `${dh.appId}|${dh.platform}|${dh.chartType}`;
      let g = games.get(key);
      if (!g) {
        g = { firstSeen: date, lastSeen: date, maxMarkets: 0, bestRank: 999, category: dh.category || null };
        games.set(key, g);
      }
      g.lastSeen = date;
      const mkts = new Set((dh._topRanks || []).map(r => r.marketCode));
      if (dh.market) mkts.add(dh.market);
      g.maxMarkets = Math.max(g.maxMarkets, mkts.size);
      for (const r of (dh._topRanks || [])) g.bestRank = Math.min(g.bestRank, r.rank);
      if (dh.currentRank) g.bestRank = Math.min(g.bestRank, dh.currentRank);
    }
  }

  const inCohort = [...games.entries()].filter(([key, g]) =>
    category ? g.category === category : true
  );
  if (inCohort.length < 5) return null; // 同品類樣本太少,基準無意義

  const lifespans = inCohort.map(([, g]) =>
    Math.floor((new Date(g.lastSeen) - new Date(g.firstSeen)) / 86400000) + 1
  ).sort((a, b) => a - b);
  const marketCounts = inCohort.map(([, g]) => g.maxMarkets);
  const top10Count = inCohort.filter(([, g]) => g.bestRank <= 10).length;

  const median = arr => arr[Math.floor(arr.length / 2)];
  const avg = arr => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10;

  // 本作在基準中的位置
  const selfEntries = [...games.entries()].filter(([key]) =>
    appIdSet.has(key.split('|')[0])
  );
  const self = selfEntries.length ? {
    lifespanDays: Math.max(...selfEntries.map(([, g]) =>
      Math.floor((new Date(g.lastSeen) - new Date(g.firstSeen)) / 86400000) + 1)),
    maxMarkets: Math.max(...selfEntries.map(([, g]) => g.maxMarkets)),
    bestRank: Math.min(...selfEntries.map(([, g]) => g.bestRank)),
  } : null;

  return {
    category: category || '(全品類)',
    windowDays: files.length,
    cohortSize: inCohort.length,
    avgMarketCount: avg(marketCounts),
    medianLifespanDays: median(lifespans),
    top10Share: Math.round(top10Count / inCohort.length * 100),
    thisGame: self,
  };
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 蒐集資料 v3${iosOnly ? '(iOS 獨佔模式)' : ''}\n   Android: ${androidAppId ?? '（無,iOS 獨佔）'}\n   iOS:     ${iosAppIdArg ?? '（自動搜尋）'}\n`);

  // [1/7] Google Play 基本資料(iOS 獨佔模式跳過)
  let app = null;
  if (!iosOnly) {
    console.log('📱 [1/7] Google Play 基本資料...');
    app = await gplay.app({ appId: androidAppId, lang: 'en' });
  } else {
    console.log('📱 [1/7] 跳過 Google Play(iOS 獨佔)');
  }

  // [2/7] App Store 基本資料(含自動搜尋/修復)
  console.log('🍎 [2/7] App Store 基本資料...');
  let targetIosAppId = iosAppIdArg;
  let iosApp = null;

  async function autoDiscoverIosId(gameTitle) {
    console.log(`   🔍 App Store 搜尋「${gameTitle}」...`);
    try {
      const searchResults = await store.search({ term: gameTitle, num: 5, country: 'us' });
      if (searchResults?.length) {
        const cleanTitle = gameTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
        const bestMatch = searchResults.find(r => {
          const mt = r.title.toLowerCase().replace(/[^a-z0-9]/g, '');
          return mt.includes(cleanTitle) || cleanTitle.includes(mt);
        }) || searchResults[0];
        console.log(`   🎯 匹配: ${bestMatch.title}（${bestMatch.developer}）id=${bestMatch.id}`);
        return bestMatch.id;
      }
    } catch (e) { console.warn(`   ⚠️ 自動搜尋失敗（${e.message}）`); }
    return null;
  }

  if (targetIosAppId) {
    const numericId = parseInt(String(targetIosAppId).replace(/\D/g, ''), 10);
    iosApp = await safe(() => store.app({ id: numericId, country: 'us' }));
    if (!iosApp && app) {
      const discoveredId = await autoDiscoverIosId(app.title);
      if (discoveredId) {
        targetIosAppId = discoveredId;
        iosApp = await safe(() => store.app({ id: discoveredId, country: 'us' }));
      }
    }
  } else if (app) {
    const discoveredId = await autoDiscoverIosId(app.title);
    if (discoveredId) {
      targetIosAppId = discoveredId;
      iosApp = await safe(() => store.app({ id: discoveredId, country: 'us' }));
    }
  }
  if (iosOnly && !iosApp) {
    console.error('❌ iOS 獨佔模式但 App Store 查無此 app');
    process.exit(1);
  }

  // [3/7] 系統觀測事實(觸發時間線 / 市場擴散 / 14 天走勢)
  console.log('🧾 [3/7] 系統觀測事實(darkhorse + snapshots)...');
  const appIdSet = new Set();
  if (androidAppId) appIdSet.add(String(androidAppId));
  if (targetIosAppId) appIdSet.add(String(targetIosAppId).replace(/\D/g, ''));
  const facts = buildFacts(appIdSet);
  if (facts) {
    console.log(`   偵測於 ${facts.detectedAt?.substring(0, 10)},上榜市場: ${facts.chartedMarkets.join(', ')}`);
    console.log(`   觸發 ${facts.triggerTimeline.length} 筆,走勢序列 ${Object.keys(facts.rankHistory14d).length} 條`);
  } else {
    console.log('   ⚠️ 此遊戲不在當前黑馬名單,facts 區塊為 null');
  }

  // [4/7] 同品類基準
  console.log('📐 [4/7] 同品類黑馬基準...');
  const cohort = buildCohortBaseline(facts?.category, appIdSet);
  if (cohort) {
    console.log(`   ${cohort.category} 共 ${cohort.cohortSize} 匹:平均 ${cohort.avgMarketCount} 國、存活中位 ${cohort.medianLifespanDays} 天、Top10 比例 ${cohort.top10Share}%`);
  } else {
    console.log('   ⚠️ 樣本不足,略過基準');
  }

  // [5/7] 評論 — 按上榜市場的語言/國家抓
  const chartedMarkets = facts?.chartedMarkets?.length ? facts.chartedMarkets : ['us'];
  const gpLangs = [...new Set(chartedMarkets.map(m => MARKET_LANG[m]?.gpLang).filter(Boolean))];
  if (!gpLangs.includes('en')) gpLangs.push('en'); // 英文永遠保底
  const iosCountries = [...new Set(chartedMarkets.map(m => MARKET_LANG[m]?.iosCountry).filter(Boolean))];
  if (!iosCountries.includes('us')) iosCountries.push('us');

  let gpResults = [];
  if (!iosOnly) {
    console.log(`💬 [5/7] Google Play 評論(語言: ${gpLangs.join(', ')})...`);
    const gpJobs = [];
    for (const lang of gpLangs) {
      gpJobs.push(safe(() => gplayReviews(androidAppId, gplay.sort.NEWEST, 80, lang), []));
      gpJobs.push(safe(() => gplayReviews(androidAppId, gplay.sort.HELPFULNESS, 40, lang), []));
    }
    gpResults = (await Promise.all(gpJobs)).flat();
  } else {
    console.log('💬 [5/7] 跳過 Google Play 評論(iOS 獨佔),iOS 評論每國多抓 1 頁');
  }

  console.log(`🍎 [6/7] App Store 評論(國家: ${iosCountries.join(', ')})...`);
  let iosReviewList = [];
  if (targetIosAppId) {
    const iosJobs = [];
    const pagesPerCountry = iosOnly ? [1, 2, 3] : [1, 2];
    for (const country of iosCountries) {
      for (const page of pagesPerCountry) {
        iosJobs.push(safe(() => iosReviews(targetIosAppId, page, country), []));
      }
    }
    iosReviewList = (await Promise.all(iosJobs)).flat();
  }

  // [7/7] 同類遊戲 + 開發者產品線 + 組裝
  console.log('🎯 [7/7] 同類遊戲 + 開發者產品線 + 組裝...\n');
  let similar = [], devApps = [];
  if (!iosOnly) {
    [similar, devApps] = await Promise.all([
      safe(() => gplay.similar({ appId: androidAppId, lang: 'en' }), []),
      safe(() => gplay.developer({ devId: app.developerId, lang: 'en', num: 30 }), []),
    ]);
  } else {
    // iOS 獨佔:改用 App Store 的同類/開發商資料
    const numericId = parseInt(String(targetIosAppId).replace(/\D/g, ''), 10);
    [similar, devApps] = await Promise.all([
      safe(() => store.similar({ id: numericId }), []),
      safe(async () => {
        const devId = iosApp.developerId || (await store.app({ id: numericId, country: 'us' })).developerId;
        return devId ? store.developer({ devId, country: 'us' }) : [];
      }, []),
    ]);
    // App Store 回傳欄位名不同,正規化成與 GP 一致
    similar = (similar || []).map(s => ({ appId: String(s.id), title: s.title, developer: s.developer, score: s.score, icon: s.icon }));
    devApps = (devApps || []).map(d => ({ appId: String(d.id), title: d.title, score: d.score, icon: d.icon }));
  }

  // 合併去重評論(text 前 80 字)
  const seen = new Set();
  const allReviews = [...gpResults, ...iosReviewList].filter(r => {
    if (!r.text || r.text.trim().length < 5) return false;
    const key = r.text.slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const data = {
    collectedAt: new Date().toISOString(),
    collectVersion: 3,

    android: app ? {
      appId: app.appId, title: app.title,
      developer: app.developer, developerId: app.developerId,
      genre: app.genre, score: app.score, ratings: app.ratings,
      installs: app.installs, maxInstalls: app.maxInstalls,
      free: app.free, released: app.released, updated: app.updated,
      version: app.version, contentRating: app.contentRating,
      icon: app.icon, screenshots: app.screenshots || [],
      video: app.video || null, summary: app.summary,
      description: app.description, recentChanges: app.recentChanges,
      developerWebsite: app.developerWebsite,
    } : null,

    ios: iosApp ? {
      id: iosApp.id, appId: iosApp.appId, title: iosApp.title,
      developer: iosApp.developer, score: iosApp.score, reviews: iosApp.reviews,
      free: iosApp.free, released: iosApp.released, updated: iosApp.updated,
      version: iosApp.version, icon: iosApp.icon, genres: iosApp.genres,
      screenshots: iosApp.screenshots || [],
      ipadScreenshots: iosApp.ipadScreenshots || [],
      description: iosApp.description,
    } : null,

    // ── 系統觀測事實(報告中引用為「資料事實」,非推測)──
    facts,

    // ── 同品類基準 ──
    cohortBaseline: cohort,

    // ── 評論彙整(含取樣聲明)──
    reviews: {
      total: allReviews.length,
      googlePlay: allReviews.filter(r => r.source === 'google_play').length,
      appStore: allReviews.filter(r => r.source === 'app_store').length,
      // 取樣聲明:報告 ABSA 段必須引用
      sampling: {
        markets: chartedMarkets,
        gpLanguages: gpLangs,
        iosCountries: targetIosAppId ? iosCountries : [],
        byLang: gpLangs.reduce((acc, l) => {
          acc[l] = allReviews.filter(r => r.lang === l).length; return acc;
        }, {}),
        byCountry: iosCountries.reduce((acc, c) => {
          acc[c] = allReviews.filter(r => r.country === c).length; return acc;
        }, {}),
      },
      distribution: [1, 2, 3, 4, 5].reduce((acc, s) => {
        acc[s] = allReviews.filter(r => r.score === s).length; return acc;
      }, {}),
      positive: allReviews.filter(r => r.score >= 4),
      negative: allReviews.filter(r => r.score <= 2),
      neutral: allReviews.filter(r => r.score === 3),
    },

    similarApps: (similar || []).slice(0, 10).map(s => ({
      appId: s.appId, title: s.title, developer: s.developer,
      score: s.score, icon: s.icon,
    })),

    developerApps: (devApps || []).slice(0, 20).map(d => ({
      appId: d.appId, title: d.title, score: d.score, icon: d.icon,
    })),
  };

  const mainTitle = app?.title || iosApp?.title || 'unknown';
  const safeName = mainTitle.replace(/[<>:"/\\|?*]/g, '').trim();
  const dir = path.join(REPORTS_ROOT, safeName);
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, 'raw-data.json');
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  ✅ 資料蒐集完成 (v3)                         ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`📱 遊戲名稱 : ${mainTitle}`);
  console.log(`👨‍💻 開發商   : ${app?.developer || iosApp?.developer}`);
  if (app) console.log(`⭐ Android  : ${app.score} / 5（${app.ratings?.toLocaleString()} 則）`);
  if (iosApp) console.log(`⭐ iOS      : ${iosApp.score} / 5（${iosApp.reviews?.toLocaleString()} 則）`);
  console.log(`💬 評論     : ${data.reviews.total} 則(GP ${data.reviews.googlePlay} / iOS ${data.reviews.appStore})`);
  console.log(`   GP 語言分布: ${JSON.stringify(data.reviews.sampling.byLang)}`);
  console.log(`🧾 系統事實 : ${facts ? `觸發 ${facts.triggerTimeline.length} 筆 / 走勢 ${Object.keys(facts.rankHistory14d).length} 條` : '無(不在黑馬名單)'}`);
  console.log(`📐 品類基準 : ${cohort ? `${cohort.category} ${cohort.cohortSize} 匹` : '樣本不足'}`);
  console.log(`\n📁 輸出 : ${outPath}`);
  console.log(`\n💡 下一步:把 raw-data.json 交給 AI,依 darkhorse-report SKILL 模板撰寫報告`);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ 發生錯誤:', err.message);
  process.exit(1);
});
