/**
 * 模擬歷史資料產生器
 * 基於今日實際排行資料，往回推算 14 天的模擬排名
 * 讓儀表板能立即展示趨勢圖與黑馬偵測效果
 * 
 * ⚠️ 模擬資料僅供展示用，真實資料需靠每日 npm run daily 累積
 * 
 * 用法: node scripts/generate-history.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  MARKETS,
  SNAPSHOTS_DIR,
} from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function getDateStr(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

function ensureDir(dirPath) {
  const resolved = path.resolve(ROOT, dirPath);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

/**
 * 模擬排名變動
 * 大部分遊戲排名小幅波動，少數製造大幅變動（模擬黑馬）
 */
function simulateRankChange(currentRank, totalApps, dayIndex, appIndex) {
  // 選幾款遊戲作為「黑馬」— 從低排名急升
  const isDarkhorse = appIndex % 17 === 0; // 大約每 17 款中有 1 款
  const isNewEntry = appIndex % 23 === 0;   // 大約每 23 款中有 1 款

  if (isDarkhorse && dayIndex > 0) {
    // 黑馬：從很後面逐步竄升
    const baseRank = Math.min(currentRank + 35 + Math.floor(Math.random() * 20), totalApps);
    const progress = dayIndex / 14; // 0→1
    return Math.round(baseRank - (baseRank - currentRank) * (1 - progress));
  }

  if (isNewEntry && dayIndex > 7) {
    // 新進榜：前幾天不存在
    return null;
  }

  // 一般遊戲：小幅隨機波動
  const fluctuation = Math.floor(Math.random() * 7) - 3; // -3 ~ +3
  const simulatedRank = Math.max(1, Math.min(currentRank + fluctuation, totalApps));
  return simulatedRank;
}

async function main() {
  const today = getDateStr(0);
  const snapshotsRoot = path.resolve(ROOT, SNAPSHOTS_DIR);
  
  // 讀取今天的快照
  const todayDir = path.join(snapshotsRoot, today);
  if (!fs.existsSync(todayDir)) {
    console.log('❌ 找不到今日快照！請先執行 npm run fetch');
    process.exit(1);
  }

  const todayFiles = fs.readdirSync(todayDir).filter(f => f.endsWith('.json'));
  if (todayFiles.length === 0) {
    console.log('❌ 今日快照為空！');
    process.exit(1);
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  🕐 模擬歷史資料產生器（往回推 14 天）        ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`📅 基準日: ${today}`);
  console.log(`📄 今日快照: ${todayFiles.length} 個檔案`);
  console.log('');

  // 往回產生 1~14 天的模擬資料
  for (let daysAgo = 1; daysAgo <= 14; daysAgo++) {
    const dateStr = getDateStr(daysAgo);
    const dayDir = ensureDir(`${SNAPSHOTS_DIR}/${dateStr}`);

    // 跳過已有真實資料的日期
    if (fs.readdirSync(dayDir).some(f => f.endsWith('.json'))) {
      console.log(`  ⏭️ ${dateStr} — 已有資料，跳過`);
      continue;
    }

    for (const file of todayFiles) {
      const todayData = JSON.parse(fs.readFileSync(path.join(todayDir, file), 'utf-8'));
      const simulatedApps = [];

      todayData.data.forEach((app, idx) => {
        const simRank = simulateRankChange(app.rank, todayData.data.length, daysAgo, idx);
        if (simRank === null) return; // 新進榜的前幾天不存在

        simulatedApps.push({
          ...app,
          rank: simRank,
          // 稍微調整評分（模擬歷史評分）
          score: app.score ? Math.round((app.score + (Math.random() - 0.5) * 0.2) * 100) / 100 : app.score,
        });
      });

      // 按排名重新排序
      simulatedApps.sort((a, b) => a.rank - b.rank);
      simulatedApps.forEach((a, i) => a.rank = i + 1);

      const simSnapshot = {
        ...todayData,
        date: dateStr,
        fetchedAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
        count: simulatedApps.length,
        data: simulatedApps,
        _simulated: true, // 標記為模擬資料
      };

      const outFile = path.join(dayDir, file);
      fs.writeFileSync(outFile, JSON.stringify(simSnapshot, null, 2), 'utf-8');
    }

    console.log(`  ✅ ${dateStr} — 已產生 ${todayFiles.length} 個模擬快照`);
  }

  console.log('\n🏁 完成！已產生 14 天模擬歷史');
  console.log('💡 接下來執行:');
  console.log('   npm run analyze   → 偵測黑馬');
  console.log('   npm run build     → 打包 data.js');
  console.log('   然後開啟 index.html 就能看到趨勢圖了！');
  console.log('');
  console.log('⚠️ 注意：模擬資料僅供展示，真實資料會隨每日執行 npm run daily 逐步累積替換。');
}

main().catch(err => {
  console.error('❌ 致命錯誤:', err);
  process.exit(1);
});
