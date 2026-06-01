/**
 * 排行榜快照採集腳本
 * 從 Google Play 和 iOS App Store 抓取各市場遊戲排行
 * 
 * 用法: node scripts/fetch-rankings.js
 */

import gplay from 'google-play-scraper';
import * as appStore from '@perttu/app-store-scraper';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  MARKETS,
  GP_PRIORITY_CATEGORIES,
  IOS_GAME_CATEGORY,
  CHART_TYPES,
  FETCH_CONFIG,
  SNAPSHOTS_DIR,
  DATA_DIR,
} from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ============ 工具函式 ============
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ensureDir(dirPath) {
  const resolved = path.resolve(ROOT, dirPath);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

function log(msg) {
  const time = new Date().toLocaleTimeString('zh-TW');
  console.log(`[${time}] ${msg}`);
}

/**
 * 資料品質驗證：與前一天快照比對 Top 30 appId 重疊率
 * 若重疊率低於門檻，判定為 API 回傳異常（錯誤地區/分類）
 * @returns {boolean} true = 資料正常，false = 異常應跳過
 */
function validateAgainstPrevious(dayDir, filename, newData) {
  const MIN_OVERLAP_RATIO = 0.3; // Top 30 至少 30% 重疊
  const CHECK_TOP_N = 30;

  // 找前一天的快照目錄
  const snapshotsRoot = path.dirname(dayDir);
  const today = path.basename(dayDir);
  const dirs = fs.readdirSync(snapshotsRoot)
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d < today)
    .sort();
  if (dirs.length === 0) return true; // 沒有歷史資料，跳過驗證

  const prevDir = path.join(snapshotsRoot, dirs[dirs.length - 1]);
  const prevFile = path.join(prevDir, filename);
  if (!fs.existsSync(prevFile)) return true; // 前一天沒有這個檔案

  try {
    const prevData = JSON.parse(fs.readFileSync(prevFile, 'utf-8'));
    const prevIds = new Set(prevData.data.slice(0, CHECK_TOP_N).map(a => a.appId));
    const newIds = newData.slice(0, CHECK_TOP_N);

    if (prevIds.size < 10 || newIds.length < 10) return true; // 資料太少不做判斷

    let overlap = 0;
    newIds.forEach(a => { if (prevIds.has(a.appId)) overlap++; });

    const ratio = overlap / Math.min(prevIds.size, newIds.length);

    if (ratio < MIN_OVERLAP_RATIO) {
      log(`  ⚠️ 資料品質異常！Top ${CHECK_TOP_N} 與前日重疊僅 ${overlap}/${Math.min(prevIds.size, newIds.length)}（${(ratio * 100).toFixed(0)}%），疑似 API 回傳錯誤資料`);
      return false;
    }
    return true;
  } catch {
    return true; // 讀取前日失敗，不阻擋
  }
}

// ============ Google Play 抓取 ============
async function fetchGooglePlayRankings(country, chartType) {
  // === 主排名：使用 GAME 整體分類，取得真正的排行順序 ===
  let mainRanking = [];
  try {
    log(`  📱 GP | ${country.toUpperCase()} | GAME (主排名) | ${chartType.id}`);
    const overallResults = await gplay.list({
      collection: gplay.collection[chartType.gpCollection],
      category: gplay.category.GAME,
      country: country,
      num: 200,
      fullDetail: false,
    });

    mainRanking = overallResults.map((app, index) => ({
      rank: index + 1,
      appId: app.appId,
      name: app.title,
      developer: app.developer,
      icon: app.icon,
      score: app.score,
      ratings: app.ratings || 0,
      category: 'GAME',
      url: app.url,
      price: app.price || 0,
      free: app.free,
      platform: 'android',
    }));
    log(`  ✅ 主排名取得 ${mainRanking.length} 筆`);
    await sleep(FETCH_CONFIG.delayBetweenRequests);
  } catch (err) {
    console.error(`    ⚠️ 主排名抓取失敗: ${err.message}`);
  }

  // === 補充：子分類抓取，用於黑馬偵測的廣撈 ===
  const mainAppIds = new Set(mainRanking.map(a => a.appId));
  const supplementary = [];

  for (const category of GP_PRIORITY_CATEGORIES) {
    try {
      log(`  📱 GP | ${country.toUpperCase()} | ${category} | ${chartType.id} (補充)`);

      const results = await gplay.list({
        collection: gplay.collection[chartType.gpCollection],
        category: gplay.category[category],
        country: country,
        num: FETCH_CONFIG.numPerCategory,
        fullDetail: false,
      });

      for (const app of results) {
        if (!mainAppIds.has(app.appId)) {
          mainAppIds.add(app.appId);
          supplementary.push({
            appId: app.appId,
            name: app.title,
            developer: app.developer,
            icon: app.icon,
            score: app.score,
            ratings: app.ratings || 0,
            category: category,
            url: app.url,
            price: app.price || 0,
            free: app.free,
            platform: 'android',
          });
        }
      }

      await sleep(FETCH_CONFIG.delayBetweenRequests);
    } catch (err) {
      console.error(`    ⚠️ 錯誤: ${category} - ${err.message}`);
    }
  }

  // 補充遊戲排在主排名之後
  const allApps = [
    ...mainRanking,
    ...supplementary.map((app, index) => ({
      rank: mainRanking.length + index + 1,
      ...app,
    })),
  ];

  return allApps.slice(0, FETCH_CONFIG.topN);
}

// ============ iOS App Store 抓取 ============
async function fetchIOSRankings(country, chartType) {
  try {
    log(`  🍎 iOS | ${country.toUpperCase()} | ${chartType.id}`);

    const results = await appStore.list({
      collection: appStore.collection[chartType.iosCollection],
      category: IOS_GAME_CATEGORY,
      country: country,
      num: FETCH_CONFIG.topN,
    });

    // 過濾掉博弈類（檢查 genres 中是否有 Casino 關鍵字）
    const casinoKeywords = ['casino', 'gambling', 'slot', '博弈', 'カジノ', '카지노'];
    const filtered = results.filter(app => {
      const genres = (app.genres || []).map(g => (typeof g === 'string' ? g : g.name || '').toLowerCase());
      const title = (app.title || '').toLowerCase();
      const desc = (app.description || '').toLowerCase().substring(0, 200);
      
      return !casinoKeywords.some(kw => 
        genres.some(g => g.includes(kw)) || 
        title.includes(kw)
      );
    });

    return filtered.map((app, index) => ({
      rank: index + 1,
      appId: String(app.id),
      name: app.title,
      developer: app.developer || app.developerId || '',
      icon: app.icon,
      score: app.score || 0,
      ratings: app.ratings || 0,
      category: (app.genres && app.genres[0]) || 'Games',
      url: app.url,
      price: app.price || 0,
      free: app.free !== false,
      platform: 'ios',
    })).slice(0, FETCH_CONFIG.topN);

  } catch (err) {
    console.error(`    ⚠️ iOS 錯誤: ${err.message}`);
    return [];
  }
}

// ============ 補充 Top N 詳細資料 ============
const ENRICH_TOP_N = 50;

/**
 * 將各種日期格式統一轉成 YYYY-MM-DD
 * 支援: "2021年10月27日" / "2021년 10월 27일" / "Apr 22, 2026" / "2026-04-22T..." / timestamp
 */
function parseToYMD(raw) {
  if (!raw) return '';
  try {
    // 數字型 timestamp（毫秒或秒）
    if (typeof raw === 'number' || /^\d{10,13}$/.test(String(raw).trim())) {
      const num = Number(raw);
      const ms = num > 9999999999 ? num : num * 1000; // 判斷是秒還是毫秒
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    // 中文格式: "2021年10月27日"
    const cnMatch = String(raw).match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (cnMatch) {
      return `${cnMatch[1]}-${cnMatch[2].padStart(2,'0')}-${cnMatch[3].padStart(2,'0')}`;
    }
    // 韓文格式: "2021년 10월 27일"
    const krMatch = String(raw).match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
    if (krMatch) {
      return `${krMatch[1]}-${krMatch[2].padStart(2,'0')}-${krMatch[3].padStart(2,'0')}`;
    }
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  } catch { return ''; }
}

async function enrichTopApps(apps, platform) {
  const top = apps.slice(0, ENRICH_TOP_N);
  log(`  🔍 補充 Top ${top.length} 詳細資料 (${platform})`);
  let successCount = 0;
  let failCount = 0;

  for (const app of top) {
    let retries = 2;
    let success = false;

    while (retries >= 0 && !success) {
      try {
        if (platform === 'android') {
          const detail = await gplay.app({ appId: app.appId, lang: 'zh-TW' });
          app.summary = (detail.summary || detail.description || '').substring(0, 200);
          app.updated = parseToYMD(detail.updated);
          app.released = parseToYMD(detail.released);
          app.contentRating = detail.contentRating || '';
        } else {
          const detail = await appStore.app({ id: Number(app.appId), lang: 'zh-tw' });
          app.summary = (detail.description || '').substring(0, 200);
          app.updated = detail.currentVersionReleaseDate
            ? parseToYMD(detail.currentVersionReleaseDate)
            : parseToYMD(detail.updated);
          app.released = parseToYMD(detail.released);
          app.contentRating = detail.contentRating || '';
        }
        success = true;
        successCount++;
        await sleep(500);
      } catch (err) {
        retries--;
        if (retries >= 0) {
          await sleep(1000); // 重試前多等一下
        } else {
          // 全部重試失敗，記錄但不中斷
          console.warn(`    ⚠️ 補充失敗 #${app.rank} ${app.name}: ${err.message}`);
          failCount++;
        }
      }
    }
  }
  log(`  📋 補充完成: 成功 ${successCount}/${top.length}${failCount > 0 ? ` (失敗 ${failCount})` : ''}`);
}

// ============ 主程式 ============
async function main() {
  const today = getToday();
  const dayDir = ensureDir(`${SNAPSHOTS_DIR}/${today}`);

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  🎮 遊戲產品競爭力分析 — 排行榜快照採集     ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`📅 日期: ${today}`);
  console.log(`📁 儲存: ${dayDir}`);
  console.log(`📋 GP 子分類: ${GP_PRIORITY_CATEGORIES.length} 個（精簡模式）`);
  console.log('');

  let totalSaved = 0;
  // #11 失敗追蹤
  const failures = [];
  let totalExpected = 0;

  for (const market of MARKETS) {
    console.log(`\n🌍 ${market.flag} ${market.name} (${market.code.toUpperCase()})`);
    console.log('─'.repeat(40));

    for (const chartType of CHART_TYPES) {
      // Google Play（中國除外）
      if (market.hasGooglePlay) {
        totalExpected++;
        try {
          let gpData = await fetchGooglePlayRankings(market.code, chartType);
          const gpFilename = `${market.code}_android_${chartType.id}.json`;
          const gpFile = path.join(dayDir, gpFilename);

          // 資料品質驗證 + 重試
          if (!validateAgainstPrevious(dayDir, gpFilename, gpData)) {
            log(`  🔄 重試一次 GP ${market.code} ${chartType.id}...`);
            await sleep(5000);
            gpData = await fetchGooglePlayRankings(market.code, chartType);
            if (!validateAgainstPrevious(dayDir, gpFilename, gpData)) {
              log(`  ❌ 二次驗證仍異常，跳過 ${gpFilename}`);
              failures.push({ market: market.code, platform: 'android', chartType: chartType.id, error: '資料品質異常（與前日重疊率過低）' });
              continue;
            }
          }

          await enrichTopApps(gpData, 'android');
          fs.writeFileSync(gpFile, JSON.stringify({
            date: today,
            market: market.code,
            platform: 'android',
            chartType: chartType.id,
            chartName: chartType.name,
            count: gpData.length,
            fetchedAt: new Date().toISOString(),
            data: gpData,
          }, null, 2), 'utf-8');
          log(`  ✅ 已儲存 ${gpData.length} 筆 → ${path.basename(gpFile)}`);
          totalSaved++;
        } catch (err) {
          console.error(`  ❌ GP 失敗: ${err.message}`);
          failures.push({ market: market.code, platform: 'android', chartType: chartType.id, error: err.message });
        }
      }

      // iOS App Store
      totalExpected++;
      try {
        let iosData = await fetchIOSRankings(market.code, chartType);
        const iosFilename = `${market.code}_ios_${chartType.id}.json`;
        const iosFile = path.join(dayDir, iosFilename);

        // 資料品質驗證 + 重試
        if (!validateAgainstPrevious(dayDir, iosFilename, iosData)) {
          log(`  🔄 重試一次 iOS ${market.code} ${chartType.id}...`);
          await sleep(5000);
          iosData = await fetchIOSRankings(market.code, chartType);
          if (!validateAgainstPrevious(dayDir, iosFilename, iosData)) {
            log(`  ❌ 二次驗證仍異常，跳過 ${iosFilename}`);
            failures.push({ market: market.code, platform: 'ios', chartType: chartType.id, error: '資料品質異常（與前日重疊率過低）' });
            continue;
          }
        }

        await enrichTopApps(iosData, 'ios');
        fs.writeFileSync(iosFile, JSON.stringify({
          date: today,
          market: market.code,
          platform: 'ios',
          chartType: chartType.id,
          chartName: chartType.name,
          count: iosData.length,
          fetchedAt: new Date().toISOString(),
          data: iosData,
        }, null, 2), 'utf-8');
        log(`  ✅ 已儲存 ${iosData.length} 筆 → ${path.basename(iosFile)}`);
        totalSaved++;
        await sleep(FETCH_CONFIG.delayBetweenRequests);
      } catch (err) {
        console.error(`  ❌ iOS 失敗: ${err.message}`);
        failures.push({ market: market.code, platform: 'ios', chartType: chartType.id, error: err.message });
      }
    }
  }

  console.log('\n' + '═'.repeat(40));
  console.log(`🏁 完成！共儲存 ${totalSaved} 個排行檔案`);
  console.log(`📁 位置: ${dayDir}`);
  if (failures.length > 0) {
    console.log(`⚠️  失敗 ${failures.length}/${totalExpected} 項: ${failures.map(f => `${f.market}_${f.platform}_${f.chartType}`).join(', ')}`);
  }
  console.log('═'.repeat(40));

  // #11 寫入執行狀態
  const statusFile = path.resolve(ROOT, DATA_DIR, 'last-run-status.json');
  fs.writeFileSync(statusFile, JSON.stringify({
    date: today,
    step: 'fetch',
    success: failures.length === 0,
    totalSaved,
    totalExpected,
    failures,
    completedAt: new Date().toISOString(),
  }, null, 2), 'utf-8');

  // 自動寫入 schedule.log（不管是 .bat 排程還是手動 npm run fetch 都會記錄）
  const scheduleLogPath = path.resolve(ROOT, DATA_DIR, 'schedule.log');
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const logTimestamp = `${now.getFullYear()}/${pad(now.getMonth()+1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const logStatus = failures.length > totalExpected * 0.5 ? 'FAIL' : 'OK';
  const logLine = `${logTimestamp} ${logStatus} [fetch] saved=${totalSaved}/${totalExpected}${failures.length > 0 ? ` fail=${failures.length}` : ''}\n`;
  fs.appendFileSync(scheduleLogPath, logLine, 'utf-8');
  log(`📝 已寫入 schedule.log: ${logLine.trim()}`);

  // ===== 產生撈取摘要報告 =====
  const reportLines = [];
  reportLines.push(`# 📊 排程撈取報告 — ${today}`);
  reportLines.push(`> 執行時間：${now.toLocaleString('zh-TW')} | 狀態：${failures.length === 0 ? '✅ 全數成功' : `⚠️ 有 ${failures.length} 項異常`}`);
  reportLines.push('');
  reportLines.push(`## 總覽`);
  reportLines.push(`| 項目 | 數值 |`);
  reportLines.push(`|:---|:---|`);
  reportLines.push(`| 成功儲存 | ${totalSaved} / ${totalExpected} |`);
  reportLines.push(`| 失敗/跳過 | ${failures.length} |`);
  reportLines.push('');

  // 逐市場統計
  reportLines.push(`## 各市場狀態`);
  reportLines.push(`| 市場 | GP 免費 | GP 營收 | iOS 免費 | iOS 營收 |`);
  reportLines.push(`|:---|:---:|:---:|:---:|:---:|`);
  for (const market of MARKETS) {
    const cells = [];
    for (const chartType of CHART_TYPES) {
      if (market.hasGooglePlay) {
        const f = failures.find(x => x.market === market.code && x.platform === 'android' && x.chartType === chartType.id);
        cells.push(f ? `❌ ${f.error.substring(0, 15)}` : '✅');
      } else {
        cells.push('—');
      }
      const fi = failures.find(x => x.market === market.code && x.platform === 'ios' && x.chartType === chartType.id);
      cells.push(fi ? `❌ ${fi.error.substring(0, 15)}` : '✅');
    }
    reportLines.push(`| ${market.flag} ${market.name} | ${cells.join(' | ')} |`);
  }
  reportLines.push('');

  // 資料品質異常
  const qualityFailures = failures.filter(f => f.error.includes('品質異常'));
  if (qualityFailures.length > 0) {
    reportLines.push(`## ⚠️ 資料品質異常（已自動跳過）`);
    qualityFailures.forEach(f => {
      reportLines.push(`- **${f.market.toUpperCase()} ${f.platform} ${f.chartType}**: ${f.error}`);
    });
    reportLines.push('');
  }

  // 其他失敗
  const otherFailures = failures.filter(f => !f.error.includes('品質異常'));
  if (otherFailures.length > 0) {
    reportLines.push(`## ❌ 撈取失敗`);
    otherFailures.forEach(f => {
      reportLines.push(`- **${f.market.toUpperCase()} ${f.platform} ${f.chartType}**: ${f.error}`);
    });
    reportLines.push('');
  }

  // 建議動作
  if (failures.length > 0) {
    reportLines.push(`## 建議動作`);
    if (qualityFailures.length > 0) {
      reportLines.push(`- 品質異常項目已自動跳過，排行榜該市場/日期會顯示無資料，無需手動處理`);
    }
    if (otherFailures.length > 0) {
      reportLines.push(`- 可嘗試重新執行 \`npm run fetch\` 重試失敗項目`);
    }
  } else {
    reportLines.push(`## ✅ 本次撈取無異常，無需額外處理`);
  }

  const reportPath = path.resolve(ROOT, DATA_DIR, `fetch-report-${today}.md`);
  fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf-8');
  log(`📄 撈取摘要報告: ${reportPath}`);

  // 如果超過 50% 市場失敗，回傳非零 exit code
  if (failures.length > totalExpected * 0.5) {
    console.error(`\n❌ 超過半數抓取失敗 (${failures.length}/${totalExpected})，中斷流程`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ 致命錯誤:', err);
  process.exit(1);
});
