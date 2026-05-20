/**
 * 評測報告資料蒐集腳本 v2
 *
 * 用法: node scripts/collect-report-data.js <androidAppId> [iosAppId]
 * 範例: node scripts/collect-report-data.js com.brain.twist.tricky.story 6757844491
 *
 * 輸出: 評測報告/<遊戲名稱>/raw-data.json
 * 蒐集：商店基本資料、Google Play 評論 200 則（正/負各 100）、
 *        App Store 評論 200 則、同類遊戲、開發者產品線
 */

import gplay from 'google-play-scraper';
import * as store from '@perttu/app-store-scraper';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const androidAppId = process.argv[2];
const iosAppId     = process.argv[3] || null;   // 選填；可純數字或 id123456789

if (!androidAppId) {
  console.error('❌ 用法: node scripts/collect-report-data.js <androidAppId> [iosAppId]');
  console.error('   範例: node scripts/collect-report-data.js com.brain.twist.tricky.story 6757844491');
  process.exit(1);
}

const REPORTS_ROOT = path.resolve(__dirname, '..', '評測報告');

// ─── 工具函式 ────────────────────────────────────────────────────────────────

/** 安全執行，失敗回傳 fallback */
async function safe(fn, fallback = null) {
  try { return await fn(); } catch (e) {
    console.warn(`  ⚠️  略過（${e.message?.slice(0, 60)}）`);
    return fallback;
  }
}

/** 抓 Google Play 評論（指定排序） */
async function gplayReviews(appId, sort, num) {
  const result = await gplay.reviews({ appId, lang: 'en', sort, num });
  return (result.data || []).map(r => ({
    source: 'google_play',
    userName: r.userName,
    score: r.score,
    text: r.text,
    date: r.date,
    thumbsUp: r.thumbsUp,
  }));
}

/** 抓 App Store 評論（指定頁數） */
async function iosReviews(id, page = 1, country = 'us') {
  const numericId = parseInt(String(id).replace(/\D/g, ''), 10);
  const result = await store.reviews({ id: numericId, page, country });
  return (result || []).map(r => ({
    source: 'app_store',
    userName: r.userName,
    score: r.score,
    text: r.text,
    date: r.updated,
    version: r.version,
    url: r.url,
  }));
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 正在蒐集資料...\n   Android: ${androidAppId}\n   iOS:     ${iosAppId ?? '（未提供，將自動在 App Store 搜尋匹配）'}\n`);

  // 1. Google Play 基本資料
  console.log('📱 [1/6] Google Play 基本資料...');
  const app = await gplay.app({ appId: androidAppId, lang: 'en' });

  // ── 自動搜尋/修復 iOS App ID 邏輯 ──
  let targetIosAppId = iosAppId;
  let iosApp = null;

  async function autoDiscoverIosId(gameTitle) {
    console.log(`   🔍 正在 App Store 上搜尋與「${gameTitle}」最匹配的項目...`);
    try {
      const searchResults = await store.search({ term: gameTitle, num: 5, country: 'us' });
      if (searchResults && searchResults.length > 0) {
        const cleanTitle = gameTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
        // 優先尋找名稱高度匹配或包含的
        const bestMatch = searchResults.find(r => {
          const matchTitle = r.title.toLowerCase().replace(/[^a-z0-9]/g, '');
          return matchTitle.includes(cleanTitle) || cleanTitle.includes(matchTitle);
        }) || searchResults[0];

        console.log(`   🎯 自動匹配成功！`);
        console.log(`      - iOS 項目: ${bestMatch.title}`);
        console.log(`      - 開發商:   ${bestMatch.developer}`);
        console.log(`      - App ID:   ${bestMatch.id}`);
        return bestMatch.id;
      }
    } catch (e) {
      console.warn(`   ⚠️  自動搜尋 iOS 項目失敗（${e.message}）`);
    }
    return null;
  }

  // 4. App Store 基本資料 (提前載入以核對/修復 ID)
  console.log('📊 [4/6] 獲取 App Store 基本資料...');
  if (targetIosAppId) {
    const numericId = parseInt(String(targetIosAppId).replace(/\D/g, ''), 10);
    iosApp = await safe(() => store.app({ id: numericId, country: 'us' }));
    if (!iosApp) {
      console.log(`   ⚠️ 手動提供的 iOS ID (${targetIosAppId}) 無效，啟動自動修復機制...`);
      const discoveredId = await autoDiscoverIosId(app.title);
      if (discoveredId) {
        targetIosAppId = discoveredId;
        iosApp = await safe(() => store.app({ id: discoveredId, country: 'us' }));
      }
    }
  } else {
    const discoveredId = await autoDiscoverIosId(app.title);
    if (discoveredId) {
      targetIosAppId = discoveredId;
      iosApp = await safe(() => store.app({ id: discoveredId, country: 'us' }));
    }
  }

  // 2. Google Play 評論：最新 100 則 + 最高評分 50 則 + 最低評分 50 則
  console.log('💬 [2/6] Google Play 評論（200 則）...');
  const [gpNewest, gpHighest, gpLowest] = await Promise.all([
    safe(() => gplayReviews(androidAppId, gplay.sort.NEWEST,  100), []),
    safe(() => gplayReviews(androidAppId, gplay.sort.RATING,   50), []),
    safe(() => gplayReviews(androidAppId, gplay.sort.HELPFULNESS, 50), []),
  ]);

  // 3. App Store 評論（若有 targetIosAppId）
  console.log('🍎 [3/6] App Store 評論（最多 200 則）...');
  let iosReviewList = [];
  if (targetIosAppId) {
    // App Store 每頁約 50 則，抓 4 頁
    const pages = await Promise.all([1, 2, 3, 4].map(p =>
      safe(() => iosReviews(targetIosAppId, p, 'us'), [])
    ));
    iosReviewList = pages.flat();

    // 補抓韓國（黑馬市場）
    const krPages = await Promise.all([1, 2].map(p =>
      safe(() => iosReviews(targetIosAppId, p, 'kr'), [])
    ));
    iosReviewList = [...iosReviewList, ...krPages.flat()];
  }

  // 5. 同類遊戲 & 開發者產品線
  console.log('🎯 [5/6] 同類遊戲 + 開發者產品線...');
  const [similar, devApps] = await Promise.all([
    safe(() => gplay.similar({ appId: androidAppId, lang: 'en' }), []),
    safe(() => gplay.developer({ devId: app.developerId, lang: 'en', num: 30 }), []),
  ]);

  // 6. 組裝
  console.log('📦 [6/6] 組裝輸出...\n');

  // 合併去重評論（以 text 前 80 字去重）
  const seen = new Set();
  const allReviews = [...gpNewest, ...gpHighest, ...gpLowest, ...iosReviewList]
    .filter(r => {
      if (!r.text || r.text.trim().length < 5) return false;
      const key = r.text.slice(0, 80);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const data = {
    collectedAt: new Date().toISOString(),

    // ── Android ──
    android: {
      appId:         app.appId,
      title:         app.title,
      developer:     app.developer,
      developerId:   app.developerId,
      genre:         app.genre,
      score:         app.score,
      ratings:       app.ratings,
      installs:      app.installs,
      maxInstalls:   app.maxInstalls,
      free:          app.free,
      released:      app.released,
      updated:       app.updated,
      version:       app.version,
      contentRating: app.contentRating,
      icon:          app.icon,
      screenshots:   app.screenshots || [],
      video:         app.video || null,
      summary:       app.summary,
      description:   app.description,
      recentChanges: app.recentChanges,
      developerWebsite: app.developerWebsite,
    },

    // ── iOS ──
    ios: iosApp ? {
      id:          iosApp.id,
      appId:       iosApp.appId,
      title:       iosApp.title,
      developer:   iosApp.developer,
      score:       iosApp.score,
      reviews:     iosApp.reviews,
      free:        iosApp.free,
      released:    iosApp.released,
      updated:     iosApp.updated,
      version:     iosApp.version,
      icon:        iosApp.icon,
      genres:      iosApp.genres,
      description: iosApp.description,
    } : null,

    // ── 評論彙整 ──
    reviews: {
      total: allReviews.length,
      googlePlay: allReviews.filter(r => r.source === 'google_play').length,
      appStore:   allReviews.filter(r => r.source === 'app_store').length,
      // 評分分佈
      distribution: [1, 2, 3, 4, 5].reduce((acc, s) => {
        acc[s] = allReviews.filter(r => r.score === s).length;
        return acc;
      }, {}),
      // 依評分分組（ABSA 時更容易取正/負面樣本）
      positive: allReviews.filter(r => r.score >= 4),
      negative: allReviews.filter(r => r.score <= 2),
      neutral:  allReviews.filter(r => r.score === 3),
    },

    // ── 同類遊戲 ──
    similarApps: (similar || []).slice(0, 10).map(s => ({
      appId: s.appId, title: s.title, developer: s.developer,
      score: s.score, icon: s.icon,
    })),

    // ── 開發者產品線 ──
    developerApps: (devApps || []).slice(0, 20).map(d => ({
      appId: d.appId, title: d.title, score: d.score, icon: d.icon,
    })),
  };

  // 儲存
  const safeName = app.title.replace(/[<>:"/\\|?*]/g, '').trim();
  const dir = path.join(REPORTS_ROOT, safeName);
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, 'raw-data.json');
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');

  // 摘要
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  ✅ 資料蒐集完成                              ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`📱 遊戲名稱 : ${app.title}`);
  console.log(`👨‍💻 開發商   : ${app.developer}`);
  console.log(`⭐ Android  : ${app.score} / 5（${app.ratings?.toLocaleString()} 則）`);
  if (iosApp) console.log(`⭐ iOS      : ${iosApp.score} / 5（${iosApp.reviews?.toLocaleString()} 則）`);
  console.log(`📥 安裝量   : ${app.installs}`);
  console.log(`💬 評論總數 : ${data.reviews.total} 則（GP ${data.reviews.googlePlay} + iOS ${data.reviews.appStore}）`);
  console.log(`   正面(4-5⭐): ${data.reviews.positive.length} 則`);
  console.log(`   負面(1-2⭐): ${data.reviews.negative.length} 則`);
  console.log(`   中性(3⭐)  : ${data.reviews.neutral.length} 則`);
  console.log(`🎯 同類遊戲 : ${data.similarApps.length} 款`);
  console.log(`\n📁 輸出檔案 : ${outPath}`);
  console.log(`\n💡 下一步：把 raw-data.json 交給 AI，進行 ABSA 分析並生成報告`);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ 發生錯誤:', err.message);
  process.exit(1);
});
