/**
 * 黑馬資料查詢工具
 * 用法: node scripts/lookup-darkhorse.js <遊戲名稱或 appId>
 * 
 * 從最新的黑馬資料中精確查詢指定遊戲的完整資訊，
 * 避免用 grep 看 JSON 導致前後文混淆的錯誤。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DARKHORSE_DIR = path.join(ROOT, 'data', 'darkhorse');
const ANALYSIS_DIR = path.join(ROOT, 'data', 'analysis');

const query = process.argv[2];
if (!query) {
  console.log('用法: node scripts/lookup-darkhorse.js <遊戲名稱或 appId>');
  console.log('範例: node scripts/lookup-darkhorse.js EnduranceHomelessGuy');
  console.log('範例: node scripts/lookup-darkhorse.js 6762191054');
  process.exit(1);
}

// 找到最新的黑馬檔
const files = fs.readdirSync(DARKHORSE_DIR).filter(f => f.endsWith('.json')).sort();
if (files.length === 0) {
  console.log('❌ 找不到黑馬資料，請先執行 npm run analyze');
  process.exit(1);
}

const latestFile = files[files.length - 1];
const data = JSON.parse(fs.readFileSync(path.join(DARKHORSE_DIR, latestFile), 'utf-8'));
const searchLower = query.toLowerCase();

// 搜尋：名稱模糊比對 或 appId 精確比對
const matches = data.darkhorses.filter(dh =>
  dh.name.toLowerCase().includes(searchLower) ||
  dh.appId === query
);

if (matches.length === 0) {
  console.log(`\n❌ 在 ${latestFile} 中找不到「${query}」\n`);

  // 模糊搜尋建議
  const suggestions = data.darkhorses
    .filter(dh => dh.name.toLowerCase().includes(searchLower.substring(0, 4)))
    .map(dh => `  - ${dh.name} (${dh.appId})`)
    .slice(0, 5);
  if (suggestions.length > 0) {
    console.log('你是不是要找：');
    suggestions.forEach(s => console.log(s));
  }
  process.exit(1);
}

console.log(`\n📄 資料來源: ${latestFile}`);
console.log(`🔍 找到 ${matches.length} 筆結果\n`);
console.log('═'.repeat(60));

matches.forEach((dh, idx) => {
  console.log(`\n【${idx + 1}】${dh.name}`);
  console.log('─'.repeat(40));
  console.log(`  App ID:    ${dh.appId}`);
  console.log(`  平台:      ${dh.platform}`);
  console.log(`  排行類型:  ${dh.chartName || dh.chartType}`);
  console.log(`  當前排名:  #${dh.currentRank}`);
  console.log(`  評分:      ${dh.score || '無'}`);
  console.log(`  信心分數:  ${dh.confidenceScore}`);
  console.log(`  開發商:    ${dh.developer || '未知'}`);
  console.log(`  分類:      ${dh.category || '未知'}`);

  // 市場資訊
  if (dh.markets && dh.markets.length > 0) {
    console.log(`\n  📍 出現市場 (${dh.markets.length} 個):`);
    dh.markets.forEach(m => {
      console.log(`     ${m.flag} ${m.name}: #${m.rank} (信心 ${m.score})`);
    });
  } else {
    console.log(`\n  📍 市場: ${dh.marketFlag} ${dh.marketName} #${dh.currentRank}`);
  }

  // 觸發策略
  if (dh.triggers && dh.triggers.length > 0) {
    console.log(`\n  ⚡ 觸發策略 (${dh.triggers.length} 個):`);
    dh.triggers.forEach(t => {
      console.log(`     ${t.label}: ${t.detail}`);
    });
  }

  // 排名歷史
  if (dh.rankHistory && dh.rankHistory.length > 0) {
    console.log(`\n  📈 排名走勢:`);
    const historyLine = dh.rankHistory
      .map(h => `${h.date.substring(5)}: ${h.rank ? '#' + h.rank : '—'}`)
      .join(' → ');
    console.log(`     ${historyLine}`);
  }

  // 連結
  if (dh.url) {
    console.log(`\n  🔗 ${dh.url}`);
  }

  // 檢查是否有深度分析
  const analysisFile = path.join(ANALYSIS_DIR, `${dh.appId}.json`);
  if (fs.existsSync(analysisFile)) {
    const analysis = JSON.parse(fs.readFileSync(analysisFile, 'utf-8'));
    console.log(`\n  📊 深度分析:`);
    if (analysis.detail) {
      console.log(`     描述: ${(analysis.detail.description || '').substring(0, 100)}...`);
      console.log(`     上架: ${analysis.detail.released || '未知'}`);
      console.log(`     更新: ${analysis.detail.updated || '未知'}`);
      console.log(`     版本: ${analysis.detail.version || '未知'}`);
    }
    if (analysis.inferredReasons && analysis.inferredReasons.length > 0) {
      console.log(`     推測原因:`);
      analysis.inferredReasons.forEach(r => {
        console.log(`       ${r.label}: ${r.detail} (${r.confidence})`);
      });
    }
  }

  // 檢查是否有評測報告
  const reportDir = path.join(ROOT, '評測報告', dh.name);
  if (fs.existsSync(path.join(reportDir, '報告.md'))) {
    console.log(`\n  📄 已有評測報告: 評測報告/${dh.name}/報告.md`);
  }
});

console.log('\n' + '═'.repeat(60));
