/**
 * 評測報告資料蒐集腳本
 * 
 * 用法: node scripts/collect-report-data.js <appId>
 * 範例: node scripts/collect-report-data.js com.matchinggo.puzzlegames
 * 
 * 輸出: 評測報告/<遊戲名稱>/raw-data.json
 * 自動蒐集：icon、截圖、影片、描述、評分、開發者資料、同類遊戲、使用者評論
 */

import gplay from 'google-play-scraper';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const appId = process.argv[2];
if (!appId) {
  console.error('❌ 用法: node scripts/collect-report-data.js <appId>');
  console.error('   範例: node scripts/collect-report-data.js com.matchinggo.puzzlegames');
  process.exit(1);
}

const REPORTS_ROOT = path.resolve(__dirname, '..', '評測報告');

async function main() {
  console.log(`\n🔍 正在蒐集 ${appId} 的資料...\n`);

  // ============ 1. 遊戲基本資料 ============
  console.log('📱 [1/5] 抓取商店資料...');
  const app = await gplay.app({ appId, lang: 'en' });

  // ============ 2. 使用者評論 ============
  console.log('💬 [2/5] 抓取使用者評論...');
  const reviews = await gplay.reviews({
    appId, lang: 'en', sort: gplay.sort.NEWEST, num: 30,
  });

  // ============ 3. 同類遊戲 ============
  console.log('🎯 [3/5] 抓取同類遊戲...');
  let similar = [];
  try {
    similar = await gplay.similar({ appId, lang: 'en' });
  } catch { /* 部分遊戲可能沒有 similar */ }

  // ============ 4. 開發者其他遊戲 ============
  console.log('👨‍💻 [4/5] 抓取開發者產品線...');
  let devApps = [];
  try {
    devApps = await gplay.developer({ devId: app.developerId, lang: 'en', num: 30 });
  } catch { /* ignore */ }

  // ============ 5. 組裝輸出 ============
  console.log('📦 [5/5] 組裝資料...\n');

  const data = {
    // 基本資訊
    appId: app.appId,
    title: app.title,
    developer: app.developer,
    developerId: app.developerId,
    genre: app.genre,
    genreId: app.genreId,
    score: app.score,
    ratings: app.ratings,
    reviews: app.reviews,
    installs: app.installs,
    maxInstalls: app.maxInstalls,
    free: app.free,
    price: app.price,
    released: app.released,
    updated: app.updated,
    version: app.version,
    contentRating: app.contentRating,
    
    // 視覺素材
    icon: app.icon,
    headerImage: app.headerImage,
    screenshots: app.screenshots || [],
    video: app.video || null,
    videoImage: app.videoImage || null,
    
    // 文字內容
    summary: app.summary,
    description: app.description,
    recentChanges: app.recentChanges,
    
    // 開發者資訊
    developerWebsite: app.developerWebsite,
    developerEmail: app.developerEmail,
    privacyPolicy: app.privacyPolicy,
    
    // 評論（前 30 則）
    userReviews: (reviews.data || []).map(r => ({
      userName: r.userName,
      score: r.score,
      text: r.text,
      date: r.date,
      thumbsUp: r.thumbsUp,
    })),
    
    // 同類遊戲
    similarApps: (similar || []).slice(0, 10).map(s => ({
      appId: s.appId,
      title: s.title,
      developer: s.developer,
      score: s.score,
      icon: s.icon,
    })),
    
    // 開發者其他遊戲
    developerApps: (devApps || []).map(d => ({
      appId: d.appId,
      title: d.title,
      score: d.score,
      icon: d.icon,
    })),
  };

  // ============ 儲存 ============
  // 資料夾名 = 遊戲名（去除檔案系統不支援的字元）
  const safeName = app.title.replace(/[<>:"/\\|?*]/g, '').trim();
  const dir = path.join(REPORTS_ROOT, safeName);
  fs.mkdirSync(dir, { recursive: true });
  
  const outPath = path.join(dir, 'raw-data.json');
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');

  // ============ 摘要輸出 ============
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  ✅ 資料蒐集完成                              ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`📱 遊戲名稱: ${app.title}`);
  console.log(`👨‍💻 開發商: ${app.developer}`);
  console.log(`⭐ 評分: ${app.score} / 5（${app.ratings} 則）`);
  console.log(`📥 安裝量: ${app.installs}`);
  console.log(`🖼️ 截圖: ${data.screenshots.length} 張`);
  console.log(`🎬 影片: ${data.video ? '有' : '無'}`);
  console.log(`💬 評論: ${data.userReviews.length} 則`);
  console.log(`🎯 同類遊戲: ${data.similarApps.length} 款`);
  console.log(`📂 開發者其他遊戲: ${data.developerApps.length} 款`);
  console.log(`\n📁 檔案: ${outPath}`);
  console.log(`\n💡 下一步: AI 會根據此資料 + 網路調查撰寫「報告.md」`);
}

main().catch(err => {
  console.error('❌ 發生錯誤:', err.message);
  process.exit(1);
});
