# 🛡️ 資料管線操作守則

> 此文件記錄過去操作中踩過的坑與對應規範。  
> **所有 AI agent 在操作本專案資料時，必須先閱讀本文件。**

---

## 一、絕對禁止事項

### 1. 禁止本機重跑偵測覆蓋 Actions 資料

```
❌ node scripts/detect-darkhorse.js
❌ node scripts/detect-darkhorse.js 2026-06-02
```

**為什麼**：GitHub Actions 每天 19:10 (TW) 自動執行偵測並 commit。本機重跑會重新產生 `detectedAt` 時間戳，導致「新進榜」數量錯誤（曾從 21 匹暴增到 54 匹），且歷史偵測日期被覆寫，不可逆。

**唯一例外**：確認 Actions 尚未跑過該日期，且 `data/darkhorse/{date}.json` 不存在。

---

### 2. 禁止 require / import detect-darkhorse.js

```
❌ require('./scripts/detect-darkhorse.js')
❌ import('./scripts/detect-darkhorse.js')
```

**為什麼**：`detect-darkhorse.js` 模組載入時會自動執行 `main()`，觸發完整偵測並覆寫 JSON。即使只想讀 `MARKETS` 常數也會觸發。

**替代**：在 inline 腳本中自行定義需要的常數。

---

### 3. 禁止未 git pull 就上傳 Firebase

```
❌ 直接跑 node scripts/upload-to-firebase.js
```

**為什麼**：Actions 產出（snapshot + darkhorse JSON）commit 在遠端。未 pull 會上傳舊資料或空資料。

---

## 二、正確操作流程

### 日常更新 Firebase

```bash
# 1. 拉取 Actions 產出
git pull

# 2. 驗證資料正確性（改 DATE 為目標日期）
node --input-type=commonjs -e "
  const d=JSON.parse(require('fs').readFileSync('./data/darkhorse/DATE.json','utf-8'));
  console.log('新進榜:', d.darkhorses.filter(x=>(x.detectedAt||'').substring(0,10)==='DATE').length);
  console.log('總計:', d.darkhorses.length);
"

# 3. 上傳
node scripts/upload-to-firebase.js
```

### 安全 Patch darkhorse JSON（只改 _topRanks，不動 detectedAt）

當需要補充 `_topRanks` 的 `appId` 欄位時：

1. **用 `--input-type=commonjs`**（package.json 是 ESM）
2. **只讀寫 JSON 資料**，不 require 任何專案腳本
3. **patch 完驗證 newEntry 數量**與 patch 前一致

完整範本見 `.agents/skills/data-pipeline-safety/SKILL.md` 第 2.2 節。

### 還原被覆蓋的 Actions 資料

```bash
git checkout origin/main -- data/darkhorse/{DATE}.json
```

---

## 三、跨語言遊戲比對

### 問題

同一款遊戲在不同市場可能有：
- **不同 appId**：奧丁 TW Android `com.kakaogames.twodin`、KR iOS `1520354659`
- **不同名稱**：台灣「奧丁：神叛」、韓國「오딘: 발할라 라이징」

### 解法

`_topRanks` 每個條目帶 `appId` 欄位，存入該市場快照中實際比對到的 appId。

**後端**（`detect-darkhorse.js`）：先用 appId 比對，找不到再用名稱正規化比對。

**前端**（`app.js`）三處使用 `_topRanks`：
1. 卡片國旗補充 — `enrichDarkhorseMarketsFromSnapshots`
2. Modal 市場 tab — `showAnalysis` 的 `uniqueMarketsMap`
3. 排名歷史圖表 — `rebuildModalRankHistory` 的 `allAppIds`

### 市場資料來源優先順序

```
_topRanks（後端今日快照掃描，最可靠）
  ↓
markets（黑馬偵測時的市場，可能不完整）
  ↓
快照掃描（前端懶載入）
```

---

## 四、快照載入範圍

```javascript
// ✅ 正確：載入全部日期
const datesToLoad = [...state.availableDates];

// ❌ 錯誤：只載 14 天，老資料會遺失
const datesToLoad = [...state.availableDates].slice(-14);
```

---

## 五、自我檢查清單

每次操作 darkhorse 資料前：

- [ ] 先 `git pull` 了嗎？
- [ ] 會不會觸發 `detect-darkhorse.js` 的 `main()`？
- [ ] 修改後 `detectedAt` 是否與修改前一致？
- [ ] 新進榜數量是否與修改前一致？
- [ ] inline 腳本用了 `--input-type=commonjs` 嗎？
