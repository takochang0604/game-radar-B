/**
 * 一次性:把評測報告的「確信度說明」「目標玩家強度欄」統一成 Block Out 樣式
 *  ① 移除「> 確信度等級：…」圖例(⭐ 本身直覺,不需說明)
 *  ② 目標玩家定位「強度」欄:由「圓點+中文(5 分法)」→「純圓點(3 分法)」
 *     對應:極高/高 → 🟣🟣🟣 ‧ 中 → 🟣🟣 ‧ 低/極低 → 🟣
 * 用法: node scripts/legend-dots-normalize.cjs [--dry]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPORTS = path.join(ROOT, '評測報告');
const DRY = process.argv.includes('--dry');

const DOT_MAP = { '極高': '🟣🟣🟣', '高': '🟣🟣🟣', '中': '🟣🟣', '低': '🟣', '極低': '🟣' };

const dirs = fs.readdirSync(REPORTS, { withFileTypes: true })
  .filter(d => d.isDirectory()).map(d => d.name);

let total = 0;
for (const dir of dirs) {
  const file = path.join(REPORTS, dir, '報告.md');
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf-8');
  let out = src;

  // ① 移除確信度等級圖例(連同前後空行,CRLF/LF 皆相容,留單一空行)
  out = out.replace(/(\r?\n)\r?\n[ \t]*>[ \t]*確信度等級：[^\r\n]*\r?\n/g, '$1');

  // ② 強度欄:圓點+中文等級 → 純圓點(3 分法)。順序:極高/極低 要在 高/低 之前
  out = out.replace(/🟣+\s*(極高|極低|高|中|低)/gu, (_, w) => DOT_MAP[w]);

  if (out !== src) {
    if (!DRY) fs.writeFileSync(file, out, 'utf-8');
    // 統計
    const confRemoved = (src.match(/> 確信度等級：/g) || []).length;
    const dotChanged = (src.match(/🟣+\s*(極高|極低|高|中|低)/g) || []).length;
    console.log(`${DRY ? '[dry] ' : '✅ '}${dir} — 移除確信度說明 ${confRemoved} / 強度欄轉換 ${dotChanged} 列`);
    total++;
  } else {
    console.log(`   ${dir} — 無變更`);
  }
}
console.log(`\n${DRY ? '[dry] ' : ''}共 ${total} 份報告調整`);
