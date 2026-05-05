/**
 * Firebase 上傳腳本
 * 將本地 JSON 資料上傳到 Firestore，供前端按需讀取
 * 
 * 用法: node scripts/upload-to-firebase.js
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  MARKETS,
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

// 頂層集合
const COLLECTION = 'gameAnalysis';

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

  // 黑馬資料存為單一文件
  const date = latestDH.replace('.json', '');
  await db.collection(COLLECTION).doc('darkhorses').set({
    date,
    count: darkhorses.length,
    config: dhData.config || {},
    darkhorses,
  });
  console.log(`  ✅ 黑馬（${darkhorses.length} 匹，${latestDH}）`);
  return { darkhorses, date };
}

/**
 * 上傳分析資料（只保留當前黑馬的）
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

  // 所有分析存為單一文件
  await db.collection(COLLECTION).doc('analysis').set(analysis);
  console.log(`  ✅ 分析（${Object.keys(analysis).length} 筆）`);
}

/**
 * 上傳評測報告
 */
async function uploadReports() {
  const reportsRoot = resolveDir(REPORTS_DIR);
  if (!fs.existsSync(reportsRoot)) return;

  const reports = {};
  const dirs = fs.readdirSync(reportsRoot, { withFileTypes: true })
    .filter(d => d.isDirectory());

  for (const dir of dirs) {
    const dirPath = path.join(reportsRoot, dir.name);
    const mdFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
    if (mdFiles.length > 0) {
      try {
        const content = fs.readFileSync(path.join(dirPath, mdFiles[0]), 'utf-8');
        reports[dir.name] = content;
      } catch {}
    }
  }

  await db.collection(COLLECTION).doc('reports').set(reports);
  console.log(`  ✅ 報告（${Object.keys(reports).length} 份）`);
}

// ============ 主流程 ============

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  🔥 上傳資料至 Firebase Firestore             ║');
  console.log('╚══════════════════════════════════════════════╝');

  // 掃描可用日期（最多保留 14 天）
  const MAX_DAYS = 14;
  const snapshotsRoot = resolveDir(SNAPSHOTS_DIR);
  let allDates = [];
  if (fs.existsSync(snapshotsRoot)) {
    allDates = fs.readdirSync(snapshotsRoot)
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
  }
  const dates = allDates.slice(-MAX_DAYS);
  console.log(`📅 日期: ${dates.join(', ')}`);

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

  console.log('\n✅ 全部上傳完成！');

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
