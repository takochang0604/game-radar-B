/**
 * repair-healthratio.cjs (v3 — 加 marketWeight + breadth + decay-aware + timeDecay)
 *
 * 對指定日期的 darkhorse json 重算 healthRatio + breadthFactor + timeDecay + displayScore,
 * confidenceScore 維持原值不動。自動備份。
 *
 * 邏輯與 scripts/detect-darkhorse.js Step 9 完全一致。
 *
 * 用法: node scripts/repair-healthratio.cjs 2026-06-09
 * 回滾: 把 2026-06-09.json.backup-pre-healthratio 改回原檔名
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

const MARKET_WEIGHT = {
  us: 1.0, jp: 1.0, kr: 0.9, cn: 0.9,
  tw: 0.7,
  th: 0.5, vn: 0.5, ph: 0.5,
};
const getMarketWeight = (mkt) => (mkt && MARKET_WEIGHT[mkt] != null) ? MARKET_WEIGHT[mkt] : 0.5;

function snapshotExists(market, platform, chartType) {
  const f = path.join(SNAPSHOTS_DIR, DATE, `${market}_${platform}_${chartType}.json`);
  return fs.existsSync(f);
}

function parseTriggerRank(t) {
  if (typeof t.triggerRank === 'number') return t.triggerRank;
  const d = t.detail || '';
  let m = d.match(/升至 #(\d+)/);                   if (m) return parseInt(m[1]);
  m = d.match(/排名 #(\d+)/);                       if (m) return parseInt(m[1]);
  m = d.match(/→ #(\d+)/);                          if (m) return parseInt(m[1]);
  m = d.match(/平均 #(\d+) vs/);                    if (m) return parseInt(m[1]);
  return null;
}

function rankDecay(triggerRank, todayRank) {
  if (todayRank == null || todayRank <= 0) return 0.1;
  if (triggerRank == null) return 1 / (1 + Math.pow(todayRank / 20, 1.5));
  if (todayRank <= triggerRank) return 1.0;
  return Math.max(triggerRank / todayRank, 0.4);
}

function breadthFactor(dh) {
  const seen = new Set();
  let total = 0;
  for (const r of (dh._topRanks || [])) {
    if (!seen.has(r.marketCode)) {
      seen.add(r.marketCode);
      total += getMarketWeight(r.marketCode);
    }
  }
  if (total <= 0) return 1.0;
  return 1 + Math.max(Math.min(Math.log2(total) * 0.15, 0.3), 0);
}

function timeDecay(detectedAt) {
  if (!detectedAt) return 1.0;
  const days = Math.floor((new Date(DATE) - new Date(detectedAt.substring(0, 10))) / 86400000);
  if (days < 3) return 1.0;
  return 1 / (1 + (days - 3) / 30);
}

// ============ 主流程 ============
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

let modified = 0, observationPeriod = 0, retainedAdjusted = 0;
for (const dh of dhs) {
  const detectedDate = (dh.detectedAt || '').substring(0, 10);
  const daysSinceDetected = detectedDate
    ? Math.floor((new Date(DATE) - new Date(detectedDate)) / 86400000)
    : 999;
  if (daysSinceDetected < 3) {
    dh.healthRatio = 1.0;
    dh.displayScore = dh.confidenceScore;
    delete dh.breadthFactor;
    delete dh.timeDecay;
    observationPeriod++;
    continue;
  }

  const currentRanks = {};
  for (const r of (dh._topRanks || [])) {
    if (!currentRanks[r.marketCode] || r.rank < currentRanks[r.marketCode]) {
      currentRanks[r.marketCode] = r.rank;
    }
  }

  let totalWeight = 0, decayedWeight = 0;
  for (const t of (dh.triggers || [])) {
    const mw = getMarketWeight(t.market);
    const sw = (t.score || 0) * mw;
    totalWeight += sw;
    if (!t.market) { decayedWeight += sw; continue; }
    if (!snapshotExists(t.market, dh.platform, dh.chartType)) { decayedWeight += sw; continue; }
    const tRank = parseTriggerRank(t);
    const todayRank = currentRanks[t.market];
    decayedWeight += sw * rankDecay(tRank, todayRank);
  }

  const rawHealth = totalWeight > 0 ? decayedWeight / totalWeight : 1.0;
  const floor = dh._retained ? 0.5 : 0.4;
  const health = Math.max(rawHealth, floor);

  const breadth = breadthFactor(dh);
  const decay = timeDecay(dh.detectedAt);

  dh.healthRatio = Math.round(health * 100) / 100;
  dh.breadthFactor = Math.round(breadth * 100) / 100;
  dh.timeDecay = Math.round(decay * 100) / 100;
  dh.displayScore = Math.round(Math.min(dh.confidenceScore * health * breadth * decay, 10) * 100) / 100;

  if (dh._retained) retainedAdjusted++;
  if (Math.abs(dh.displayScore - dh.confidenceScore) > 0.01) modified++;
}

dhs.sort((a, b) =>
  (b.displayScore ?? b.confidenceScore) - (a.displayScore ?? a.confidenceScore)
);

const newEntryAfter = dhs.filter(x => (x.detectedAt || '').substring(0, 10) === DATE).length;
console.log(`newEntry (detectedAt=${DATE}) after: ${newEntryAfter}`);
if (newEntryBefore !== newEntryAfter) {
  console.error(`❌ FAIL: newEntry count changed (${newEntryBefore} → ${newEntryAfter}). Aborting write.`);
  process.exit(1);
}

fs.writeFileSync(DARKHORSE_FILE, JSON.stringify(json, null, 2), 'utf-8');
console.log(`✅ Wrote ${DARKHORSE_FILE}`);
console.log('');
console.log(`Stats:`);
console.log(`  觀察期跳過 (< 3 days): ${observationPeriod}`);
console.log(`  retained 套用獨立下限: ${retainedAdjusted}`);
console.log(`  實際分數有變動: ${modified}`);
console.log('');
console.log(`回滾: copy "${path.basename(backupFile)}" back to ${DATE}.json`);
