/**
 * repair-topranks.cjs
 *
 * 一次性修復腳本：只重算指定日期 darkhorse json 的 _siblingAppIds 與 _topRanks，
 * 其他欄位（detectedAt、triggers、confidenceScore、markets…）完全不動。
 *
 * 用途：detect-darkhorse.js 的 sibling pairing 與 _topRanks 策略 3 修好後，
 *      在等 Actions 自動跑之前先把今日 json 的污染清乾淨。
 *
 * 符合 .agents/rules/.../GUIDELINES.md 第 2.2 節「安全 Patch」：
 *   - 用 commonjs (.cjs 副檔名)
 *   - 不 require / import 任何專案腳本（不會觸發 main()）
 *   - 不動 detectedAt，patch 後驗證 newEntry 數量與 patch 前一致
 *
 * 用法：
 *   node scripts/repair-topranks.cjs 2026-06-05
 */
const fs = require('fs');
const path = require('path');

const DATE = process.argv[2];
if (!DATE || !/^\d{4}-\d{2}-\d{2}$/.test(DATE)) {
  console.error('Usage: node scripts/repair-topranks.cjs YYYY-MM-DD');
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '..');
const SNAPSHOTS_DIR = path.join(ROOT, 'data', 'snapshots');
const DARKHORSE_FILE = path.join(ROOT, 'data', 'darkhorse', `${DATE}.json`);

// ============ 設定（與 config.js 同步） ============
const MARKETS = [
  { code: 'us', flag: '🇺🇸', hasGooglePlay: true },
  { code: 'jp', flag: '🇯🇵', hasGooglePlay: true },
  { code: 'kr', flag: '🇰🇷', hasGooglePlay: true },
  { code: 'cn', flag: '🇨🇳', hasGooglePlay: false },
  { code: 'tw', flag: '🇹🇼', hasGooglePlay: true },
  { code: 'th', flag: '🇹🇭', hasGooglePlay: true },
  { code: 'vn', flag: '🇻🇳', hasGooglePlay: true },
  { code: 'ph', flag: '🇵🇭', hasGooglePlay: true },
];
const CHART_TYPES = [
  { id: 'topfree' },
  { id: 'grossing' },
];

// ============ 快照載入 ============
const snapshotCache = new Map();
function loadSnapshot(date, marketCode, platform, chartTypeId) {
  const key = `${date}|${marketCode}|${platform}|${chartTypeId}`;
  if (snapshotCache.has(key)) return snapshotCache.get(key);
  const filePath = path.join(SNAPSHOTS_DIR, date, `${marketCode}_${platform}_${chartTypeId}.json`);
  if (!fs.existsSync(filePath)) { snapshotCache.set(key, null); return null; }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    snapshotCache.set(key, data);
    return data;
  } catch { snapshotCache.set(key, null); return null; }
}

// ============ 名稱正規化（與 detect-darkhorse.js 同步） ============
function normalizeDev(dev) {
  if (!dev) return '';
  return dev.toLowerCase().replace(/[^a-z0-9一-鿿぀-ヿ가-힯]/g, '');
}
function devMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4) {
    if (a.includes(b) || b.includes(a)) return true;
  }
  const minLen = Math.min(a.length, b.length);
  if (minLen >= 5 && a.substring(0, minLen) === b.substring(0, minLen)) return true;
  return false;
}

const GENERIC_TOKENS = new Set([
  'game','games','puzzle','puzzles','brain','casual','idle','tycoon',
  'simulator','sim','adventure','quest','online','mobile','free',
  'the','for','and',
]);
function extractLatinTokens(name) {
  if (!name) return [];
  return (name.toLowerCase().match(/[a-z]{3,}/g) || []).filter(t => !GENERIC_TOKENS.has(t));
}

function normNameForMatch(n) {
  return (n || '').toLowerCase().replace(/[^a-z0-9一-鿿぀-ヿ가-힯฀-๿]/g, '');
}
const GENERIC_WORDS_RE = /\b(game|games|puzzle|puzzles|brain|casual|idle|tycoon|simulator|sim|adventure|quest|online|mobile|free|the|of|and|for)\b/gi;
function coreNameForMatch(n) {
  return (n || '').toLowerCase()
    .replace(GENERIC_WORDS_RE, '')
    .replace(/[^a-z0-9一-鿿぀-ヿ가-힯฀-๿]/g, '');
}

// ============ 主流程 ============
if (!fs.existsSync(DARKHORSE_FILE)) {
  console.error(`darkhorse json not found: ${DARKHORSE_FILE}`);
  process.exit(1);
}
const json = JSON.parse(fs.readFileSync(DARKHORSE_FILE, 'utf-8'));
const dhs = json.darkhorses || [];
console.log(`Loaded ${dhs.length} darkhorses from ${DATE}.json`);

const newEntryBefore = dhs.filter(x => (x.detectedAt || '').substring(0, 10) === DATE).length;
console.log(`newEntry (detectedAt=${DATE}) before: ${newEntryBefore}`);

// 備份
const backupFile = DARKHORSE_FILE + '.backup-' + Date.now();
fs.copyFileSync(DARKHORSE_FILE, backupFile);
console.log(`Backup: ${path.basename(backupFile)}`);

// ============ Step 1: 建立 開發商→遊戲 對照表 ============
const devGameMap = new Map();
for (const market of MARKETS) {
  for (const plat of ['ios', 'android']) {
    if (plat === 'android' && !market.hasGooglePlay) continue;
    for (const ct of CHART_TYPES) {
      const snap = loadSnapshot(DATE, market.code, plat, ct.id);
      if (!snap || !snap.data) continue;
      for (const app of snap.data) {
        if (!app.developer) continue;
        const devKey = normalizeDev(app.developer);
        if (!devKey) continue;
        if (!devGameMap.has(devKey)) devGameMap.set(devKey, []);
        const list = devGameMap.get(devKey);
        if (!list.find(e => e.appId === app.appId)) {
          list.push({ appId: app.appId, platform: plat, name: app.name, developer: app.developer });
        }
      }
    }
  }
}

// ============ Step 2: 重算 _siblingAppIds ============
let pairedCount = 0;
for (const dh of dhs) {
  if (!dh.developer) continue;
  const dhDevKey = normalizeDev(dh.developer);
  const otherPlatform = dh.platform === 'android' ? 'ios' : 'android';

  let candidates = [];
  for (const [devKey, games] of devGameMap) {
    if (devMatch(dhDevKey, devKey)) {
      candidates.push(...games.filter(g => g.platform === otherPlatform));
    }
  }
  const seen = new Set();
  candidates = candidates.filter(c => {
    if (seen.has(c.appId)) return false;
    seen.add(c.appId);
    return true;
  });

  // 清舊值（重算才不會殘留錯配）
  delete dh._siblingAppIds;

  if (candidates.length === 0) continue;

  // 逆向驗證:開發商相同 + (latin token 共通 ≥ 1 或 CJK 字元交集 ≥ 2)
  const pairVerify = (c) => {
    const dhDev2 = normalizeDev(dh.developer);
    const cDev = normalizeDev(c.developer);
    if (!dhDev2 || !cDev) return false;
    if (dhDev2 !== cDev && !(dhDev2.includes(cDev) || cDev.includes(dhDev2))) return false;
    const dhT = extractLatinTokens(dh.name);
    const cT = extractLatinTokens(c.name);
    if (dhT.some(t => cT.includes(t))) return true;
    const dhCJK2 = (dh.name.match(/[一-鿿぀-ヿ가-힯]/g) || []).join('');
    const cCJK2 = (c.name.match(/[一-鿿぀-ヿ가-힯]/g) || []).join('');
    return [...dhCJK2].filter(ch => cCJK2.includes(ch)).length >= 2;
  };

  if (candidates.length === 1) {
    if (pairVerify(candidates[0])) {
      dh._siblingAppIds = [candidates[0].appId];
      pairedCount++;
    }
    continue;
  }

  // 多候選：用過濾通用字後的 token + CJK 比對
  const dhTokens = extractLatinTokens(dh.name);
  let bestMatch = null, bestScore = 0;
  for (const c of candidates) {
    const cTokens = extractLatinTokens(c.name);
    let matchScore = 0;
    for (const t of dhTokens) {
      if (cTokens.includes(t)) matchScore++;
      else if (cTokens.some(ct => ct.includes(t) || t.includes(ct))) matchScore += 0.5;
    }
    const dhCJK = (dh.name.match(/[一-鿿぀-ヿ가-힯]/g) || []).join('');
    const cCJK = (c.name.match(/[一-鿿぀-ヿ가-힯]/g) || []).join('');
    if (dhCJK.length >= 2 && cCJK.length >= 2) {
      const commonCJK = [...dhCJK].filter(ch => cCJK.includes(ch)).length;
      matchScore += commonCJK * 0.3;
    }
    if (matchScore > bestScore) { bestScore = matchScore; bestMatch = c; }
  }
  if (bestMatch && bestScore >= 1 && pairVerify(bestMatch)) {
    dh._siblingAppIds = [bestMatch.appId];
    pairedCount++;
  } else {
    // 策略 B：同 chartType 唯一
    const chartTypeCandidates = [];
    for (const market of MARKETS) {
      if (otherPlatform === 'android' && !market.hasGooglePlay) continue;
      const snap = loadSnapshot(DATE, market.code, otherPlatform, dh.chartType);
      if (!snap || !snap.data) continue;
      for (const app of snap.data) {
        if (!app.developer) continue;
        const appDevKey = normalizeDev(app.developer);
        if (devMatch(dhDevKey, appDevKey) && !chartTypeCandidates.find(c => c.appId === app.appId)) {
          chartTypeCandidates.push({ appId: app.appId, name: app.name, developer: app.developer });
        }
      }
    }
    if (chartTypeCandidates.length === 1 && pairVerify(chartTypeCandidates[0])) {
      dh._siblingAppIds = [chartTypeCandidates[0].appId];
      pairedCount++;
    }
  }
}
console.log(`Re-paired sibling: ${pairedCount} darkhorses`);

// ============ Step 3: 重算 _topRanks ============
for (const dh of dhs) {
  const appIds = new Set([dh.appId, ...(dh._siblingAppIds || [])]);
  const ranks = [];
  const foundMarketPlatform = new Set();
  const dhNorm = normNameForMatch(dh.name);

  for (const market of MARKETS) {
    for (const scanPlatform of ['ios', 'android']) {
      if (scanPlatform === 'android' && !market.hasGooglePlay) continue;
      const snap = loadSnapshot(DATE, market.code, scanPlatform, dh.chartType);
      if (!snap || !snap.data) continue;
      const dedupKey = `${market.code}_${scanPlatform}`;
      let matched = null;

      // 1. appId 精確比對
      for (const appId of appIds) {
        const entry = snap.data.find(a => a.appId === appId);
        if (entry && entry.rank <= 100) { matched = entry; break; }
      }
      // 2. 名稱完全一致（正規化後）+ 開發商可辨識為同一家
      if (!matched && dhNorm.length >= 3 && dh.developer) {
        const dhDev2 = normNameForMatch(dh.developer);
        matched = snap.data.find(a => {
          if (!a.rank || a.rank > 100 || !a.developer) return false;
          if (normNameForMatch(a.name) !== dhNorm) return false;
          const aDev2 = normNameForMatch(a.developer);
          return dhDev2.length >= 3 && aDev2.length >= 3 &&
                 (dhDev2 === aDev2 || dhDev2.includes(aDev2) || aDev2.includes(dhDev2));
        });
        if (matched) appIds.add(matched.appId);
      }
      // 3. 開發商匹配 + 核心名稱完全相等
      if (!matched && dh.name && dh.developer) {
        const dhDev = normNameForMatch(dh.developer);
        const dhCore = coreNameForMatch(dh.name);
        if (dhCore.length >= 3) {
          for (const a of snap.data) {
            if (!a.name || !a.rank || a.rank > 100 || !a.developer) continue;
            const aDev = normNameForMatch(a.developer);
            if (dhDev.length >= 3 && aDev.length >= 3 && (dhDev.includes(aDev) || aDev.includes(dhDev))) {
              const aCore = coreNameForMatch(a.name);
              if (aCore === dhCore) { matched = a; appIds.add(a.appId); break; }
            }
          }
        }
      }

      if (matched && !foundMarketPlatform.has(dedupKey)) {
        foundMarketPlatform.add(dedupKey);
        ranks.push({
          marketCode: market.code,
          marketFlag: market.flag,
          platform: scanPlatform,
          rank: matched.rank,
          chartLabel: dh.chartType === 'grossing' ? '營收' : '免費',
          appId: matched.appId,
        });
      }
    }
  }
  ranks.sort((a, b) => a.rank - b.rank);
  dh._topRanks = ranks;
}

// ============ 驗證 ============
const newEntryAfter = dhs.filter(x => (x.detectedAt || '').substring(0, 10) === DATE).length;
console.log(`newEntry (detectedAt=${DATE}) after: ${newEntryAfter}`);
if (newEntryBefore !== newEntryAfter) {
  console.error(`❌ FAIL: newEntry count changed (${newEntryBefore} → ${newEntryAfter}). Aborting write.`);
  process.exit(1);
}

// ============ 寫回 ============
fs.writeFileSync(DARKHORSE_FILE, JSON.stringify(json, null, 2), 'utf-8');
console.log(`✅ Wrote ${DARKHORSE_FILE}`);
console.log(`   To rollback: copy "${path.basename(backupFile)}" back to ${DATE}.json`);
