/**
 * 手動合併管理工具（擁有者專用）
 *
 * 合併設定 gameTracking/manualPairs 已在 Firestore 規則鎖為「前端唯讀」，
 * 防止公開網址被他人惡意亂合併/解除。合併的新增/移除改由本工具透過
 * Firebase Admin SDK（service account）執行 —— 只有持有 google-credentials.json
 * 的擁有者本機能跑，安全判斷在規則層，不靠前端隱藏。
 *
 * 用法：
 *   node scripts/manage-merges.js list
 *   node scripts/manage-merges.js add "群組名稱" <appId1> <appId2> [<appId3> ...]
 *   node scripts/manage-merges.js remove <groupId>
 *
 * 資料結構（gameTracking/manualPairs doc）：
 *   { groups: [ { id, title, appIds: [...], updatedAt } ] }
 */
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const COLLECTION = 'gameTracking';
const DOC = 'manualPairs';

const credPath = path.resolve(ROOT, 'google-credentials.json');
if (!fs.existsSync(credPath)) {
  console.error('❌ 找不到 google-credentials.json，無法以 Admin SDK 連線。');
  process.exit(1);
}
const serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const ref = db.collection(COLLECTION).doc(DOC);

async function loadGroups() {
  const snap = await ref.get();
  if (!snap.exists) return [];
  const data = snap.data() || {};
  return Array.isArray(data.groups) ? data.groups : [];
}
async function saveGroups(groups) {
  await ref.set({ groups });
}

// 從最新一份本機黑馬偵測結果建立 appId → 名稱 對照，讓 list 易讀
function loadNameMap() {
  const map = {};
  try {
    const dir = path.resolve(ROOT, 'data', 'darkhorse');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
    if (files.length) {
      const data = JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), 'utf-8'));
      for (const dh of (data.darkhorses || [])) {
        if (dh.appId && !map[dh.appId]) map[dh.appId] = `${dh.name} (${dh.platform}/${dh.chartType})`;
      }
    }
  } catch { /* 對照表是加分項，失敗就略過 */ }
  return map;
}

function usage() {
  console.error('用法：');
  console.error('  node scripts/manage-merges.js list');
  console.error('  node scripts/manage-merges.js add "群組名稱" <appId1> <appId2> [<appId3> ...]');
  console.error('  node scripts/manage-merges.js remove <groupId>');
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const groups = await loadGroups();

  if (!cmd || cmd === 'list') {
    const names = loadNameMap();
    if (!groups.length) { console.log('（目前沒有任何手動合併群組）'); return; }
    console.log(`目前共 ${groups.length} 組手動合併：\n`);
    groups.forEach((g, i) => {
      console.log(`${i + 1}. [${g.id}] ${g.title || '(未命名)'}`);
      (g.appIds || []).forEach(id => console.log(`     - ${id}${names[id] ? '  → ' + names[id] : ''}`));
      console.log('');
    });
    return;
  }

  if (cmd === 'add') {
    const title = args[0];
    const appIds = args.slice(1);
    if (!title || appIds.length < 2) {
      console.error('❌ add 需要：一個群組名稱 + 至少兩個 appId\n');
      usage();
      process.exit(1);
    }
    const newGroup = { id: 'g_' + Date.now(), title, appIds, updatedAt: new Date().toISOString() };
    groups.push(newGroup);
    await saveGroups(groups);
    console.log(`✅ 已新增合併群組 [${newGroup.id}] ${title}（${appIds.length} 張卡）`);
    return;
  }

  if (cmd === 'remove') {
    const id = args[0];
    if (!id) { console.error('❌ remove 需要 groupId\n'); usage(); process.exit(1); }
    const next = groups.filter(g => g.id !== id);
    if (next.length === groups.length) { console.error(`❌ 找不到群組 ${id}`); process.exit(1); }
    await saveGroups(next);
    console.log(`✅ 已移除合併群組 ${id}`);
    return;
  }

  console.error(`❌ 未知指令：${cmd}\n`);
  usage();
  process.exit(1);
}

main().then(() => process.exit(0)).catch(err => { console.error('❌ 失敗:', err); process.exit(1); });
