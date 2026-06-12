/**
 * Firebase 上傳腳本 v2
 * 將本地 JSON 資料上傳到 Firestore，供前端按需讀取
 * 
 * v2 改進：
 *  - #8 黑馬歷史保留（darkhorseHistory 子集合）
 *  - #11 Pipeline 狀態寫入（pipelineStatus doc）
 *  - #12 reports/analysis 改為子集合
 *  - #15 追蹤遊戲排名上傳
 * 
 * 用法: node scripts/upload-to-firebase.js
 */

import admin from 'firebase-admin';
import gplay from 'google-play-scraper';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  MARKETS,
  TRACKED_GAMES,
  SNAPSHOTS_DIR,
  DARKHORSE_DIR,
  ANALYSIS_DIR,
  REPORTS_DIR,
} from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ============ Firebase Admin 初始化 ============
const credPath = path.resolve(ROOT, 'google-credentials.json');
if (!fs.existsSync(credPath)) {
  console.error('❌ 找不到 google-credentials.json');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// 頂層集合
const COLLECTION = 'gameAnalysis-dev';  // dev 分支用獨立 collection，不影響正式版

function resolveDir(dir) {
  return path.resolve(ROOT, dir);
}

// ============ 上傳函式 ============

/**
 * 上傳 meta 資料（可用日期列表）
 */
async function uploadMeta(dates) {
  await db.collection(COLLECTION).doc('meta').set({
    availableDates: dates,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`  ✅ meta（${dates.length} 天）`);
}

/**
 * 上傳快照資料
 * 每個市場+平台+排行類型 = 一個文件
 */
async function uploadSnapshots(dates) {
  const snapshotsRoot = resolveDir(SNAPSHOTS_DIR);
  let uploaded = 0;

  for (const date of dates) {
    const dayDir = path.join(snapshotsRoot, date);
    if (!fs.existsSync(dayDir)) continue;
    const files = fs.readdirSync(dayDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(dayDir, file), 'utf-8'));
        const docId = `${date}_${file.replace('.json', '')}`;
        // 快照子集合
        await db.collection(COLLECTION).doc('snapshots').collection('items').doc(docId).set(content);
        uploaded++;
      } catch (err) {
        console.error(`  ⚠️ 快照上傳失敗: ${file} - ${err.message}`);
      }
    }
  }
  console.log(`  ✅ 快照（${uploaded} 個檔案）`);
}

/**
 * 上傳黑馬資料（最新一天）
 * #8 同時保留歷史記錄到 darkhorseHistory 子集合
 */
async function uploadDarkhorses() {
  const darkhorseRoot = resolveDir(DARKHORSE_DIR);
  if (!fs.existsSync(darkhorseRoot)) return;

  const dhFiles = fs.readdirSync(darkhorseRoot)
    .filter(f => f.endsWith('.json'))
    .sort();
  if (dhFiles.length === 0) return;

  const latestDH = dhFiles[dhFiles.length - 1];
  const dhData = JSON.parse(fs.readFileSync(path.join(darkhorseRoot, latestDH), 'utf-8'));
  const darkhorses = dhData.darkhorses || [];

  // 黑馬資料存為單一文件（最新）— 精簡欄位避免超出 Firestore 1MB 限制
  const date = latestDH.replace('.json', '');
  const slimDarkhorses = darkhorses.map(dh => ({
    appId: dh.appId,
    name: dh.name,
    platform: dh.platform,
    chartType: dh.chartType,
    chartName: dh.chartName,
    currentRank: dh.currentRank,
    confidenceScore: dh.confidenceScore,
    market: dh.market,
    marketFlag: dh.marketFlag,
    marketName: dh.marketName,
    triggers: (dh.triggers || []).map(t => ({
      strategy: t.strategy,
      label: t.label,
      detail: t.detail,
      score: t.score,
      _detectedAt: t._detectedAt,
      chartLine: t.chartLine,
      src: t.src,
      market: t.market,
      marketName: t.marketName,
      marketFlag: t.marketFlag,
    })),
    markets: dh.markets || [{ code: dh.market, flag: dh.marketFlag, name: dh.marketName, rank: dh.currentRank }],
    icon: dh.icon,
    detectedAt: dh.detectedAt,
    developer: dh.developer,
    category: dh.category,
    rankHistory: (dh.rankHistory || []).slice(-14),
    // sibling 保留 appId 即可，前端用 appId 找回
    ...(dh.sibling ? { sibling: { appId: dh.sibling.appId, name: dh.sibling.name, platform: dh.sibling.platform } } : {}),
    // 跨平台配對 appId
    ...(dh._siblingAppIds ? { _siblingAppIds: dh._siblingAppIds } : {}),
    // 今日快照實際排名（已按名次排序）
    ...(dh._topRanks ? { _topRanks: dh._topRanks } : {}),
    // 各市場排名歷史（精簡為最近 14 天，供圖表使用）
    ...(dh._rankHistoryByMarket ? {
      _rankHistoryByMarket: Object.fromEntries(
        Object.entries(dh._rankHistoryByMarket).map(([mkt, hist]) => [mkt, (hist || []).slice(-14)])
      )
    } : {}),
    // v3 評分系統四欄位 — confidence × health × breadth × decay = displayScore
    // 前端只用 displayScore 顯示,其他三個給 debug / tooltip 用
    ...(dh.healthRatio != null ? { healthRatio: dh.healthRatio } : {}),
    ...(dh.breadthFactor != null ? { breadthFactor: dh.breadthFactor } : {}),
    ...(dh.timeDecay != null ? { timeDecay: dh.timeDecay } : {}),
    ...(dh.displayScore != null ? { displayScore: dh.displayScore } : {}),
    // _retained 標記也帶上,前端 / debug 用
    ...(dh._retained ? { _retained: dh._retained, _retainedFrom: dh._retainedFrom } : {}),
  }));
  
  const payload = {
    date,
    count: slimDarkhorses.length,
    config: dhData.config || {},
    darkhorses: slimDarkhorses,
  };
  const payloadSize = Buffer.byteLength(JSON.stringify(payload), 'utf-8');
  console.log(`  📏 黑馬文件大小: ${(payloadSize / 1024).toFixed(1)} KB（Firestore 限制 1024 KB）`);

  if (payloadSize > 900 * 1024) {
    // 超過 900KB → 拆分成多個 chunk
    console.log(`  ⚠️ 文件過大，啟動分片上傳...`);
    const CHUNK_SIZE = 50; // 每個 chunk 最多 50 匹
    const chunks = [];
    for (let i = 0; i < slimDarkhorses.length; i += CHUNK_SIZE) {
      chunks.push(slimDarkhorses.slice(i, i + CHUNK_SIZE));
    }

    // 主文件只放第一個 chunk + metadata
    const mainPayload = {
      date,
      count: slimDarkhorses.length,
      config: dhData.config || {},
      darkhorses: chunks[0],
      _chunked: true,
      _totalChunks: chunks.length,
    };
    await db.collection(COLLECTION).doc('darkhorses').set(mainPayload);
    console.log(`  ✅ 黑馬主文件（chunk 1/${chunks.length}，${chunks[0].length} 匹）`);

    // 其餘 chunk 寫入子集合
    for (let i = 1; i < chunks.length; i++) {
      await db.collection(COLLECTION).doc('darkhorses').collection('chunks').doc(`chunk_${i}`).set({
        index: i,
        darkhorses: chunks[i],
      });
      console.log(`  ✅ 黑馬 chunk ${i + 1}/${chunks.length}（${chunks[i].length} 匹）`);
    }
  } else {
    payload._chunked = false;
    await db.collection(COLLECTION).doc('darkhorses').set(payload);
    console.log(`  ✅ 黑馬（${slimDarkhorses.length} 匹，${latestDH}）`);
  }

  // #8 黑馬歷史：額外保留每天的黑馬到子集合（最多保留 60 天）
  await db.collection(COLLECTION).doc('darkhorseHistory').collection('items').doc(date).set({
    date,
    count: darkhorses.length,
    // 只保留精簡資訊（不含 rankHistory，減少儲存量）
    darkhorses: darkhorses.map(dh => ({
      appId: dh.appId,
      name: dh.name,
      platform: dh.platform,
      chartType: dh.chartType,
      chartName: dh.chartName,
      currentRank: dh.currentRank,
      confidenceScore: dh.confidenceScore,
      triggers: dh.triggers.map(t => ({
        strategy: t.strategy,
        label: t.label,
        detail: t.detail,
        score: t.score,
        _detectedAt: t._detectedAt,
        chartLine: t.chartLine,
        src: t.src,
        market: t.market,
        marketName: t.marketName,
        marketFlag: t.marketFlag,
      })),
      markets: dh.markets || [{ code: dh.market, flag: dh.marketFlag }],
      icon: dh.icon,
      detectedAt: dh.detectedAt,
      developer: dh.developer,
      category: dh.category,
    })),
  });
  console.log(`  ✅ 黑馬歷史（${date}）`);

  return { darkhorses, date };
}

/**
 * #12 上傳分析資料 — 改為子集合 analysis/items/{appId}
 * 同時保留舊的單一文件格式用於向後相容
 */
async function uploadAnalysis(currentDhAppIds) {
  const analysisRoot = resolveDir(ANALYSIS_DIR);
  if (!fs.existsSync(analysisRoot)) return;

  const analysis = {};

  // 載入 summary 檔
  const summaryFiles = fs.readdirSync(analysisRoot)
    .filter(f => f.startsWith('summary_') && f.endsWith('.json'))
    .sort();
  if (summaryFiles.length > 0) {
    try {
      const summaryData = JSON.parse(
        fs.readFileSync(path.join(analysisRoot, summaryFiles[summaryFiles.length - 1]), 'utf-8')
      );
      (summaryData.results || []).forEach(r => {
        if (currentDhAppIds.has(r.appId)) {
          analysis[r.appId] = r;
        }
      });
    } catch {}
  }

  // 載入個別分析檔
  const individualFiles = fs.readdirSync(analysisRoot)
    .filter(f => f.endsWith('.json') && !f.startsWith('summary_'));
  for (const f of individualFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(analysisRoot, f), 'utf-8'));
      if (data.appId && currentDhAppIds.has(data.appId)) {
        analysis[data.appId] = data;
      }
    } catch {}
  }

  // #12 寫入子集合
  let subCount = 0;
  for (const [appId, data] of Object.entries(analysis)) {
    // 安全的 doc ID（appId 可能含有 . 或 /）
    const safeId = appId.replace(/\//g, '_').replace(/\./g, '_');
    await db.collection(COLLECTION).doc('analysis').collection('items').doc(safeId).set({
      ...data,
      _originalAppId: appId,
    });
    subCount++;
  }

  // 同時保留舊格式（向後相容，初始載入用）
  await db.collection(COLLECTION).doc('analysis').set(analysis);
  console.log(`  ✅ 分析（${Object.keys(analysis).length} 筆，含子集合 ${subCount} 筆）`);
}

/**
 * 刷新報告中的 Google Play 圖片 URL(play-lh.googleusercontent.com 會輪替失效)
 * 每次上傳時向 GP 重新取得 icon / 截圖的新鮮 URL,positional 置換報告中的舊 URL。
 * 因為每日排程都會跑 upload,等於圖片連結每天自動保鮮。
 * 失敗時保留原 URL,不影響上傳。
 *
 * 回傳: { md, freshIcon, replaced }
 */
async function refreshReportImages(md, raw) {
  const result = { md, freshIcon: null, replaced: 0 };
  if (!raw?.android?.appId) return result;
  let fresh;
  try {
    fresh = await gplay.app({ appId: raw.android.appId, lang: 'en' });
  } catch {
    return result; // 抓不到(下架/網路)就保留原 URL
  }
  result.freshIcon = fresh.icon || null;

  // icon:報告中 =sNNN 結尾的 play-lh URL → 換成新 icon base
  const freshIconBase = (fresh.icon || '').split('=')[0];
  if (freshIconBase) {
    result.md = result.md.replace(
      /https:\/\/play-lh\.googleusercontent\.com\/[^"'\s=)]+(?==s\d)/g,
      () => { result.replaced++; return freshIconBase; }
    );
  }
  // 截圖:=wNNN-hNNN 結尾的依出現順序換成新截圖序列
  const freshShots = (fresh.screenshots || []).map(u => u.split('=')[0]);
  if (freshShots.length) {
    let i = 0;
    result.md = result.md.replace(
      /https:\/\/play-lh\.googleusercontent\.com\/[^"'\s=)]+(?==w\d+-h\d+)/g,
      (m) => {
        if (i < freshShots.length) { result.replaced++; return freshShots[i++]; }
        return m;
      }
    );
  }
  return result;
}

/**
 * 從報告 Markdown 解析結構化 metadata(評測日期 / 一句話 / POWERSCORE 等第)
 * 供前端報告列表顯示與排序,不必載入整份 Markdown 解析
 */
function parseReportMd(content) {
  const meta = {};
  let m = content.match(/\|\s*\*\*評測日期\*\*\s*\|\s*(\d{4}-\d{2}-\d{2})/);
  if (m) meta.reportDate = m[1];
  m = content.match(/\*\*一句話[:：]\*\*\s*(.+)/);
  if (m) meta.tagline = m[1].trim().substring(0, 120);
  // POWERSCORE 六維等第
  const psSection = content.split(/##\s*📊\s*綜合評測/)[1];
  if (psSection) {
    const grades = {};
    const dims = [
      ['core', 'Core Game'], ['meta', 'Meta Game'],
      ['monetization', '變現健康度'], ['momentum', '市場動量'],
      ['longevity', '長線潛力'], ['satisfaction', '用戶滿意度'],
    ];
    for (const [key, label] of dims) {
      const gm = psSection.match(new RegExp(label + '\\s*\\|\\s*\\*{0,2}([A-F][+\\-]?)\\*{0,2}\\s*\\|'));
      if (gm) grades[key] = gm[1];
    }
    if (Object.keys(grades).length) meta.grades = grades;
  }
  return meta;
}

/**
 * #12 上傳評測報告 — 改為子集合 reports/items/{gameName}
 */
async function uploadReports() {
  const reportsRoot = resolveDir(REPORTS_DIR);
  if (!fs.existsSync(reportsRoot)) return;

  const reports = {};
  const reportMeta = {};  // gameName → { appIds, aliases, reportDate, tagline, grades, icon }
  const dirs = fs.readdirSync(reportsRoot, { withFileTypes: true })
    .filter(d => d.isDirectory());

  for (const dir of dirs) {
    const dirPath = path.join(reportsRoot, dir.name);
    const mdFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
    if (mdFiles.length > 0) {
      try {
        let content = fs.readFileSync(path.join(dirPath, mdFiles[0]), 'utf-8');

        // 從 Markdown 解析結構化 metadata
        reportMeta[dir.name] = { aliases: [dir.name], ...parseReportMd(content) };

        // 讀取 raw-data.json 提取 appId 和別名（用於跨語言名稱匹配）
        const rawPath = path.join(dirPath, 'raw-data.json');
        let raw = null;
        if (fs.existsSync(rawPath)) {
          try {
            raw = JSON.parse(fs.readFileSync(rawPath, 'utf-8'));
            const appIds = [];
            const aliases = reportMeta[dir.name].aliases;
            if (raw.android?.appId) appIds.push(raw.android.appId);
            if (raw.ios?.id) appIds.push(String(raw.ios.id));
            if (raw.ios?.appId) appIds.push(raw.ios.appId);
            if (raw.android?.title && !aliases.includes(raw.android.title)) aliases.push(raw.android.title);
            if (raw.ios?.title && !aliases.includes(raw.ios.title)) aliases.push(raw.ios.title);
            reportMeta[dir.name].appIds = appIds;
            const icon = raw.android?.icon || raw.ios?.icon;
            if (icon) reportMeta[dir.name].icon = icon;
          } catch {}
        }

        // 刷新 GP 圖片 URL(play-lh 連結會輪替失效,每次上傳自動保鮮)
        try {
          const refreshed = await refreshReportImages(content, raw);
          content = refreshed.md;
          if (refreshed.freshIcon) reportMeta[dir.name].icon = refreshed.freshIcon;
          if (refreshed.replaced > 0) {
            console.log(`  🖼️ ${dir.name}: 刷新 ${refreshed.replaced} 個圖片 URL`);
          }
        } catch {}

        reports[dir.name] = content;
      } catch {}
    }
  }

  // #12 寫入子集合
  let subCount = 0;
  for (const [gameName, content] of Object.entries(reports)) {
    const safeId = gameName.replace(/[/\\#$[\]]/g, '_');
    const meta = reportMeta[gameName] || {};
    await db.collection(COLLECTION).doc('reports').collection('items').doc(safeId).set({
      gameName,
      content,
      ...(meta.appIds?.length ? { appIds: meta.appIds } : {}),
      ...(meta.aliases?.length ? { aliases: meta.aliases } : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    subCount++;
  }

  // 同時保留舊格式（向後相容） — 加入 _meta 欄位供前端使用
  reports['_meta'] = reportMeta;
  await db.collection(COLLECTION).doc('reports').set(reports);
  console.log(`  ✅ 報告（${Object.keys(reports).length - 1} 份，含子集合 ${subCount} 筆，含 meta）`);
}

/**
 * #15 上傳追蹤遊戲排名
 * 從每日 snapshot 中提取追蹤遊戲的排名寫入 tracked doc
 */
async function uploadTrackedGames(dates) {
  if (!TRACKED_GAMES || TRACKED_GAMES.length === 0) {
    console.log('  ⏭️ 無追蹤遊戲，跳過');
    return;
  }

  const snapshotsRoot = resolveDir(SNAPSHOTS_DIR);
  const tracked = {};

  for (const game of TRACKED_GAMES) {
    tracked[game.name] = {
      name: game.name,
      androidId: game.android || null,
      iosId: game.ios || null,
      rankings: {}, // key: "market_platform_chartType", value: [{date, rank}]
    };
  }

  // 掃描所有日期的 snapshot，提取追蹤遊戲的排名
  for (const date of dates) {
    const dayDir = path.join(snapshotsRoot, date);
    if (!fs.existsSync(dayDir)) continue;
    const files = fs.readdirSync(dayDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(dayDir, file), 'utf-8'));
        if (!content.data) continue;

        for (const game of TRACKED_GAMES) {
          const targetId = content.platform === 'android' ? game.android : game.ios;
          if (!targetId) continue;

          const found = content.data.find(app => app.appId === targetId);
          const key = `${content.market}_${content.platform}_${content.chartType}`;
          if (!tracked[game.name].rankings[key]) tracked[game.name].rankings[key] = [];
          tracked[game.name].rankings[key].push({
            date,
            rank: found ? found.rank : null,
          });
        }
      } catch {}
    }
  }

  await db.collection(COLLECTION).doc('tracked').set({
    games: Object.values(tracked),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`  ✅ 追蹤遊戲（${TRACKED_GAMES.length} 款）`);
}

/**
 * #11 上傳 Pipeline 狀態 + 歷史紀錄
 */
async function uploadPipelineStatus(success, details = {}) {
  const docRef = db.collection(COLLECTION).doc('pipelineStatus');

  // 讀取現有歷史
  let history = [];
  try {
    const existing = await docRef.get();
    if (existing.exists() && existing.data().history) {
      history = existing.data().history;
    }
  } catch {}

  // 新增本次紀錄
  const entry = {
    date: details.date || new Date().toISOString().split('T')[0],
    success,
    totalSaved: details.totalSaved || 0,
    totalExpected: details.totalExpected || 0,
    darkhorseCount: details.darkhorseCount || 0,
    failures: details.failures || [],
    error: details.error || null,
    completedAt: new Date().toISOString(),
  };
  history.push(entry);

  // 只保留最近 30 筆
  if (history.length > 30) history = history.slice(-30);

  await docRef.set({
    success,
    ...details,
    history,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ============ 主流程 ============

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  🔥 上傳資料至 Firebase Firestore v2          ║');
  console.log('╚══════════════════════════════════════════════╝');

  // 掃描可用日期（最多保留 60 天）
  const MAX_DAYS = 60;
  const snapshotsRoot = resolveDir(SNAPSHOTS_DIR);
  let allDates = [];
  if (fs.existsSync(snapshotsRoot)) {
    allDates = fs.readdirSync(snapshotsRoot)
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
  }
  const dates = allDates.slice(-MAX_DAYS);
  console.log(`📅 日期: ${dates.join(', ')}`);

  try {
    // 上傳各類資料
    console.log('\n📤 上傳中...');
    await uploadMeta(dates);
    await uploadSnapshots(dates);
    const dhResult = await uploadDarkhorses();
    
    if (dhResult) {
      const currentDhAppIds = new Set(dhResult.darkhorses.map(d => d.appId));
      await uploadAnalysis(currentDhAppIds);
    }
    
    await uploadReports();
    await uploadTrackedGames(dates);

    // #11 寫入成功狀態（含詳細抓取結果）
    let fetchDetails = {};
    try {
      const statusPath = path.resolve(ROOT, 'data', 'last-run-status.json');
      if (fs.existsSync(statusPath)) {
        const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
        fetchDetails = {
          totalSaved: statusData.totalSaved || 0,
          totalExpected: statusData.totalExpected || 0,
          failures: statusData.failures || [],
        };
      }
    } catch (e) {
      console.warn('⚠️ 無法讀取 last-run-status.json:', e.message);
    }
    await uploadPipelineStatus(true, {
      date: dates[dates.length - 1] || '',
      totalDates: dates.length,
      darkhorseCount: dhResult?.darkhorses?.length || 0,
      ...fetchDetails,
    });

    console.log('\n✅ 全部上傳完成！');
  } catch (err) {
    // #11 寫入失敗狀態
    console.error(`\n❌ 上傳失敗: ${err.message}`);
    try {
      await uploadPipelineStatus(false, {
        error: err.message,
        date: dates[dates.length - 1] || '',
      });
    } catch {}
    throw err;
  }

  // 同時產生精簡版 data.js（只含 meta 資訊，作為 fallback）
  const fallback = `/** Fallback - 資料已遷移至 Firebase */
const APP_DATA = null;
const FIREBASE_MODE = true;
`;
  fs.writeFileSync(path.resolve(ROOT, 'data.js'), fallback, 'utf-8');
  console.log('📄 已更新 data.js（Firebase 模式標記）');

  process.exit(0);
}

main().catch(err => {
  console.error('❌ 上傳失敗:', err);
  process.exit(1);
});
