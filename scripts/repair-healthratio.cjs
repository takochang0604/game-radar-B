/**
 * repair-healthratio.cjs
 *
 * 對指定日期的 darkhorse json 計算 healthRatio + displayScore 兩個新欄位,
 * confidenceScore 維持原值不動。自動備份原檔到 .json.backup-pre-healthratio。
 *
 * 用途: detect-darkhorse.js 改完之後,在等 Actions 自動跑之前先把今日 json patch 過。
 *
 * 符合 GUIDELINES.md 第 2.2 節安全 patch 規範:
 *   - 用 commonjs (.cjs)
 *   - 不 require / import 任何專案腳本
 *   - 不動 detectedAt / triggers / confidenceScore 等核心欄位
 *   - 自動備份且驗證 newEntry 數量一致
 *
 * 用法:
 *   node scripts/repair-healthratio.cjs 2026-06-08
 *
 * 回滾:
 *   把 2026-06-08.json.backup-pre-healthratio 改回 2026-06-08.json
 */
const fs = require('fs');
const path = require('path');

const DATE = process.argv[2];
if (!DATE || !/^\d{4}-\d{2}-\d{2}$/.test(DATE)) {
  console.error('Usage: node scripts/repair-healthratio.cjs YYYY-MM-DD');
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '..');
const SNAPSHOTS_DIR = path.join(ROOT, 'data', 'snapshots');
const DARKHORSE_FILE = path.join(ROOT, 'data', 'darkhorse', `${DATE}.json`);

if (!fs.existsSync(DARKHORSE_FILE)) {
  console.error(`darkhorse json not found: ${DARKHORSE_FILE}`);
  process.exit(1);
}

// 快照存在檢查 (用於 snapshotMissing 判別)
function snapshotExists(market, platform, chartType) {
  const f = path.join(SNAPSHOTS_DIR, DATE, `${market}_${platform}_${chartType}.json`);
  return fs.existsSync(f);
}

// 連續函數 marketFactor (同 detect-darkhorse.js)
function marketFactor(rank) {
  if (rank == null || rank <= 0) return 0.1;
  return 1 / (1 + Math.pow(rank / 20, 1.5));
}

// 載入 + 備份
const json = JSON.parse(fs.readFileSync(DARKHORSE_FILE, 'utf-8'));
const dhs = json.darkhorses || [];
console.log(`Loaded ${dhs.length} darkhorses from ${DATE}.json`);

const newEntryBefore = dhs.filter(x => (x.detectedAt || '').substring(0, 10) === DATE).length;
console.log(`newEntry (detectedAt=${DATE}) before: ${newEntryBefore}`);

const backupFile = DARKHORSE_FILE + '.backup-pre-healthratio';
if (!fs.existsSync(backupFile)) {
  fs.copyFileSync(DARKHORSE_FILE, backupFile);
  console.log(`Backup created: ${path.basename(backupFile)}`);
} else {
  console.log(`Backup already exists: ${path.basename(backupFile)} (not overwritten)`);
}

// 對每張卡計算 healthRatio + displayScore
let modified = 0, observationPeriod = 0, retainedAdjusted = 0;
for (const dh of dhs) {
  // 觀察期保護: 偵測 < 3 天
  const detectedDate = (dh.detectedAt || '').substring(0, 10);
  const daysSinceDetected = detectedDate
    ? Math.floor((new Date(DATE) - new Date(detectedDate)) / 86400000)
    : 999;
  if (daysSinceDetected < 3) {
    dh.healthRatio = 1.0;
    dh.displayScore = dh.confidenceScore;
    observationPeriod++;
    continue;
  }

  // 收集每個市場的當前排名 (從 _topRanks)
  const currentRanks = {};
  if (dh._topRanks) {
    dh._topRanks.forEach(r => {
      if (!currentRanks[r.marketCode] || r.rank < currentRanks[r.marketCode]) {
        currentRanks[r.marketCode] = r.rank;
      }
    });
  }

  let origSum = 0, weightedSum = 0;
  for (const t of (dh.triggers || [])) {
    const s = t.score || 0;
    origSum += s;
    if (!t.market) { weightedSum += s; continue; }
    // snapshotMissing 區分
    if (!snapshotExists(t.market, dh.platform, dh.chartType)) {
      weightedSum += s;
      continue;
    }
    const curRank = currentRanks[t.market];
    weightedSum += s * marketFactor(curRank);
  }

  if (origSum <= 0) {
    dh.healthRatio = 1.0;
    dh.displayScore = dh.confidenceScore;
    continue;
  }

  const floor = dh._retained ? 0.5 : 0.4;
  const ratio = Math.max(weightedSum / origSum, floor);

  dh.healthRatio = Math.round(ratio * 100) / 100;
  dh.displayScore = Math.round(dh.confidenceScore * ratio * 100) / 100;

  if (dh._retained) retainedAdjusted++;
  if (Math.abs(dh.displayScore - dh.confidenceScore) > 0.01) modified++;
}

// 用 displayScore 重新排序
dhs.sort((a, b) =>
  (b.displayScore ?? b.confidenceScore) - (a.displayScore ?? a.confidenceScore)
);

// 驗證 newEntry 數量沒變
const newEntryAfter = dhs.filter(x => (x.detectedAt || '').substring(0, 10) === DATE).length;
console.log(`newEntry (detectedAt=${DATE}) after: ${newEntryAfter}`);
if (newEntryBefore !== newEntryAfter) {
  console.error(`❌ FAIL: newEntry count changed (${newEntryBefore} → ${newEntryAfter}). Aborting write.`);
  process.exit(1);
}

// 寫回
fs.writeFileSync(DARKHORSE_FILE, JSON.stringify(json, null, 2), 'utf-8');
console.log(`✅ Wrote ${DARKHORSE_FILE}`);
console.log('');
console.log(`Stats:`);
console.log(`  觀察期跳過 (< 3 days): ${observationPeriod}`);
console.log(`  retained 套用獨立下限: ${retainedAdjusted}`);
console.log(`  實際分數有變動: ${modified}`);
console.log('');
console.log(`回滾: copy "${path.basename(backupFile)}" back to ${DATE}.json`);
