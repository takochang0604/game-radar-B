/**
 * 一次性:把評測報告的「國旗+中文」依 Option C 規則正規化
 *  - 上榜市場與排名(對照表那一列):保留「旗+中文」當對照,不動
 *  - 結構化處(小標 ##/###、表格列名 | 🇽🇽、市場擴散順序鏈、排名變化（🇽🇽 國名）):只留國旗
 *  - 其餘(純文字句子、事件敘述):只留中文(去掉國旗)
 * 用法: node scripts/flag-normalize.cjs            (套全部)
 *       node scripts/flag-normalize.cjs --dry      (只看不寫)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPORTS = path.join(ROOT, '評測報告');
const DRY = process.argv.includes('--dry');

const PAIRS = [
  ['🇺🇸', '美國'], ['🇯🇵', '日本'], ['🇰🇷', '韓國'], ['🇨🇳', '中國'],
  ['🇹🇼', '台灣'], ['🇹🇭', '泰國'], ['🇻🇳', '越南'], ['🇵🇭', '菲律賓'],
];
const FLAG_ALT = PAIRS.map(p => p[0]).join('|');
const ROW_LABEL_RE = new RegExp('^\\s*\\|\\s*(' + FLAG_ALT + ')(\\s|\\|)');

function processLine(line) {
  // 對照表那列:保留旗+中文
  if (line.includes('上榜市場與排名')) return line;

  const structured =
    /^#{1,6}\s/.test(line) ||              // 標題小標
    ROW_LABEL_RE.test(line) ||             // 表格列名(以國旗開頭的格子)
    line.includes('市場擴散順序') ||        // 擴散順序鏈
    line.includes('排名變化（');           // 動量分析的排名變化（🇽🇽 國名）

  let out = line;
  for (const [flag, name] of PAIRS) {
    if (structured) {
      out = out.split(flag + ' ' + name).join(flag);  // 旗 中文 → 旗
      out = out.split(flag + name).join(flag);          // 旗中文 → 旗
    } else {
      out = out.split(flag + ' ' + name).join(name);    // 旗 中文 → 中文
      out = out.split(flag + name).join(name);          // 旗中文 → 中文
    }
  }
  return out;
}

const dirs = fs.readdirSync(REPORTS, { withFileTypes: true })
  .filter(d => d.isDirectory()).map(d => d.name);

let totalChanged = 0;
for (const dir of dirs) {
  const file = path.join(REPORTS, dir, '報告.md');
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf-8');
  const lines = src.split('\n');
  let changed = 0;
  const outLines = lines.map(l => {
    const nl = processLine(l);
    if (nl !== l) changed++;
    return nl;
  });
  if (changed > 0) {
    if (!DRY) fs.writeFileSync(file, outLines.join('\n'), 'utf-8');
    console.log(`${DRY ? '[dry] ' : '✅ '}${dir} — ${changed} 行調整`);
    totalChanged += changed;
  } else {
    console.log(`   ${dir} — 無變更`);
  }
}
console.log(`\n${DRY ? '[dry] ' : ''}合計 ${totalChanged} 行${DRY ? '(未寫入)' : '已寫入'}`);
