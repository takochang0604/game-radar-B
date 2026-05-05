/**
 * 資料打包腳本
 * 將所有 JSON 快照 + 黑馬 + 分析結果打包成單一 data.js
 * 這樣 HTML 可以直接用 file:// 開啟，不需要伺服器
 * 
 * 用法: node scripts/build-data.js
 */

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

function resolveDir(dir) {
  return path.resolve(ROOT, dir);
}

function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  📦 資料打包 → data.js                       ║');
  console.log('╚══════════════════════════════════════════════╝');

  // ============ 1. 掃描快照日期（最多保留 14 天）============
  const MAX_SNAPSHOT_DAYS = 14;
  const snapshotsRoot = resolveDir(SNAPSHOTS_DIR);
  let allDates = [];
  if (fs.existsSync(snapshotsRoot)) {
    allDates = fs.readdirSync(snapshotsRoot)
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
  }
  // 只保留最近 N 天，避免 data.js 無限膨脹
  const dates = allDates.slice(-MAX_SNAPSHOT_DAYS);
  if (allDates.length > MAX_SNAPSHOT_DAYS) {
    console.log(`📅 發現 ${allDates.length} 天快照，只打包最近 ${MAX_SNAPSHOT_DAYS} 天`);
  }
  console.log(`📅 打包日期: ${dates.join(', ')}`);

  // ============ 2. 載入所有快照 ============
  const snapshots = {};
  let totalApps = 0;

  for (const date of dates) {
    snapshots[date] = {};
    const dayDir = path.join(snapshotsRoot, date);
    const files = fs.readdirSync(dayDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(dayDir, file), 'utf-8'));
        const market = content.market;
        const platform = content.platform;
        const chartType = content.chartType;

        if (!snapshots[date][market]) snapshots[date][market] = {};
        if (!snapshots[date][market][platform]) snapshots[date][market][platform] = {};
        snapshots[date][market][platform][chartType] = content;
        totalApps += (content.data || []).length;
      } catch (err) {
        console.error(`  ⚠️ 讀取失敗: ${file} - ${err.message}`);
      }
    }
  }
  console.log(`📊 共 ${totalApps} 筆遊戲資料`);

  // ============ 3. 載入黑馬資料 ============
  const darkhorseRoot = resolveDir(DARKHORSE_DIR);
  let darkhorses = [];
  if (fs.existsSync(darkhorseRoot)) {
    // 取最新一天的黑馬結果
    const dhFiles = fs.readdirSync(darkhorseRoot)
      .filter(f => f.endsWith('.json'))
      .sort();
    if (dhFiles.length > 0) {
      const latestDH = dhFiles[dhFiles.length - 1];
      try {
        const dhData = JSON.parse(fs.readFileSync(path.join(darkhorseRoot, latestDH), 'utf-8'));
        darkhorses = dhData.darkhorses || [];
        console.log(`🐴 載入 ${darkhorses.length} 匹黑馬 (${latestDH})`);
      } catch {}
    }
  }

  // ============ 4. 載入分析資料（只保留當前黑馬的）============
  const analysisRoot = resolveDir(ANALYSIS_DIR);
  const analysis = {};
  const currentDhAppIds = new Set(darkhorses.map(d => d.appId));

  if (fs.existsSync(analysisRoot)) {
    // 先載入 summary 檔
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

    // 再載入個別分析檔（覆蓋 summary 中的同 appId 資料）
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

    const totalAnalysisFiles = fs.readdirSync(analysisRoot).filter(f => f.endsWith('.json')).length;
    console.log(`🔬 載入 ${Object.keys(analysis).length} 筆分析（篩選自 ${totalAnalysisFiles} 個檔案，只保留當前黑馬）`);
  }

  // ============ 5. 掃描評測報告 ============
  const reportsRoot = resolveDir(REPORTS_DIR);
  const reports = {};
  if (fs.existsSync(reportsRoot)) {
    // 每個子資料夾 = 一款遊戲，資料夾名稱 = 遊戲名稱
    const dirs = fs.readdirSync(reportsRoot, { withFileTypes: true })
      .filter(d => d.isDirectory());
    for (const dir of dirs) {
      const dirPath = path.join(reportsRoot, dir.name);
      // 讀取資料夾內第一個 .md 檔作為報告內容
      const mdFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
      if (mdFiles.length > 0) {
        try {
          const content = fs.readFileSync(path.join(dirPath, mdFiles[0]), 'utf-8');
          reports[dir.name] = content;
        } catch {}
      }
    }
    console.log(`📄 載入 ${Object.keys(reports).length} 份評測報告`);
  }

  // ============ 6. 輸出 data.js ============
  const output = `/**
 * 遊戲產品競爭力分析 — 資料檔（自動產生，請勿手動編輯）
 * 產生時間: ${new Date().toISOString()}
 * 快照天數: ${dates.length}
 * 遊戲總數: ${totalApps}
 * 黑馬數量: ${darkhorses.length}
 * 評測報告: ${Object.keys(reports).length}
 */

const APP_DATA = {
  generatedAt: "${new Date().toISOString()}",
  availableDates: ${JSON.stringify(dates)},
  snapshots: ${JSON.stringify(snapshots)},
  darkhorses: ${JSON.stringify(darkhorses)},
  analysis: ${JSON.stringify(analysis)},
  reports: ${JSON.stringify(reports)},
};
`;

  const outputPath = path.resolve(ROOT, 'data.js');
  fs.writeFileSync(outputPath, output, 'utf-8');

  const sizeKB = Math.round(fs.statSync(outputPath).size / 1024);
  console.log(`\n✅ 已產生 data.js (${sizeKB} KB)`);
  console.log(`📁 位置: ${outputPath}`);
  console.log('\n💡 現在可以直接開啟 index.html 查看資料了！');
}

main();
