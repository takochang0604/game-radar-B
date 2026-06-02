# 信心分數 healthRatio 修正討論紀錄

> 日期：2026-06-02
> 狀態：待實作

---

## 一、問題描述

OUTERPLANE 只有 1 個排名（🇯🇵 免費 #5），信心分數 31.84 卻排全站第 3。
高於 Meowdoku（🇺🇸#2 🇯🇵#14，22.9 分）和 Mini Challenges（7 國上榜，31.6 分）。

**根因**：觸發器分數在首次觸發時鎖定，之後只增不減。OUTERPLANE 5/20 在台灣、韓國、日本先後觸發了 5 個策略，但現在台灣和韓國都已掉出 Top 100，只剩日本 #5。分數完全不反映現況。

---

## 二、修正方案：healthRatio

### 公式

```
healthRatio = Σ(trigger.score × marketFactor) / Σ(trigger.score)

marketFactor 依觸發器來源市場的「當前排名」（唯一來源：_topRanks）：
  #1~10   → 1.0
  #11~20  → 0.85
  #21~50  → 0.5
  #51~100 → 0.3
  不在榜   → 0.1

最終信心分數 = confidenceScore × max(healthRatio, 0.4)
```

### ⚠️ 當前排名的唯一來源：`_topRanks`

不可用 `markets` 陣列！`markets` 是歷史資料，可能已過期。
例：OUTERPLANE 的 `markets` 顯示 KR #22、TW #83，但實際都已掉出 Top 100。
`_topRanks` 是從今日快照直接計算的，才是正確的當前排名。

### OUTERPLANE 實算

| 觸發器 | 來源市場 | score | 當前排名 | factor | 加權 |
|--------|---------|:-----:|:-------:|:------:|:----:|
| 🆕 新進榜 | 🇹🇼 台灣 | 3.00 | 不在榜 | 0.1 | 0.30 |
| 🚀 排名急升 | 🇰🇷 韓國 | 2.27 | 不在榜 | 0.1 | 0.23 |
| 🆕 新進榜 | 🇰🇷 韓國 | 3.00 | 不在榜 | 0.1 | 0.30 |
| 📊 成長加速 | 🇰🇷 韓國 | 2.50 | 不在榜 | 0.1 | 0.25 |
| 🆕 新進榜 | 🇯🇵 日本 | 2.50 | #5 | 1.0 | 2.50 |
| **合計** | | **13.27** | | | **3.58** |

```
healthRatio = 3.58 / 13.27 = 0.27 → 觸底 → max(0.27, 0.4) = 0.4
修正後 = 31.84 × 0.4 = 12.74
```

### 5 項保護措施

| # | 措施 | 原因 |
|---|------|------|
| 1 | healthRatio 下限 0.4 | 防止過度懲罰 |
| 2 | 偵測 3 天內不修正 | 新黑馬需要觀察期 |
| 3 | 觸發器無 market 欄位 → factor 1.0 | 舊資料相容 |
| 4 | 只影響顯示分數與排序，不影響黑馬保留判斷 | 保留判斷在 Step 8 已完成 |
| 5 | `_retained` 黑馬跳過 | 避免與衰減機制（0.85^天數）雙重懲罰 |

### 試算結果（含 5 項保護，已驗證）

| 新排名 | 遊戲 | 修正前 | 修正後 | 比率 | 說明 |
|:------:|------|:------:|:------:|:----:|------|
| #1 | 崩壊：スターレイル | 43.9 | 43.9 | 不變 | 觀察期（6/2 偵測 < 3 天） |
| #2 | Pokémon TCG Pocket | 35.3 | 35.3 | 不變 | retained 跳過 |
| #3 | Mini Challenges | 31.6 | 27.7 | 88% | 7 國上榜，排名大部分好 |
| #4 | Meowdoku! | 22.9 | 22.4 | 98% | 🇺🇸#2 表現穩 |
| #5 | ハートピアスローライフ | 31.0 | 22.2 | 72% | 部分市場掉 |
| #6 | Genshin Impact | 21.0 | 21.0 | 不變 | retained 跳過 |
| #9 | **OUTERPLANE** | **31.8** | **12.7** | **40%** | **觸底，🇹🇼🇰🇷 已掉出 Top 100** |

### 統計

- retained 跳過：47 匹
- 觀察期跳過：59 匹
- 實際被修正：34 匹
- 不需修正（healthRatio ≈ 1）：22 匹

---

## 三、交叉驗證結果

| 審查員 | 結論 |
|-------|------|
| 📐 數學驗證 | ✅ 公式正確，healthRatio ∈ (0, 1]，max 下限有效 |
| 🔍 邊界案例 | ✅ `today` 格式 YYYY-MM-DD，origSum=0 已有 continue 保護 |
| ⚠️ 保留機制衝突 | **發現並修復**：retained 黑馬已吃衰減，加保護 5 跳過 |
| ⚠️ 排名來源錯誤 | **發現並修復**：不可用 `markets`（過期），只用 `_topRanks` |

---

## 四、架構問題（獨立議題）

### 現況

同一件事情（遊戲在各市場的排名）有多個資料來源，每次用的時候都在猜該用哪個：

| 來源 | 代表什麼 | 可靠度 |
|------|---------|-------|
| `_topRanks` | 今日快照中 Top 100 的排名 | ✅ 最可靠 |
| `markets[]` | 歷史快照中曾出現的排名 | ⚠️ 可能過期 |
| `_siblingAppIds` | 跨平台同款遊戲 | ⚠️ 可能配不到 |
| raw snapshots | 原始排行榜檔案 | ✅ 原始資料 |

### 建議方向

統一排名資料的單一真實來源（Single Source of Truth）：
- `_topRanks` 定位為「今日各市場排名的唯一來源」
- `markets` 只保留「曾觸發的市場列表」，不帶排名
- 前端需要排名時，統一從 `_topRanks` 取

這個架構調整影響範圍大，需要另外計畫。

---

## 五、實作程式碼

修改檔案：`scripts/detect-darkhorse.js`
插入位置：`_topRanks` 計算區塊結束後、儲存結果前

```javascript
  // ============ Step 9: 觸發市場排名修正（healthRatio） ============
  // 當前排名的唯一來源：_topRanks（今日快照，不用 markets 因為可能過期）
  function getTriggerMarketFactor(rank) {
    if (!rank || rank <= 0) return 0.1;
    if (rank <= 10)  return 1.0;
    if (rank <= 20)  return 0.85;
    if (rank <= 50)  return 0.5;
    if (rank <= 100) return 0.3;
    return 0.1;
  }

  for (const dh of mergedDarkhorses) {
    // 保護 5: retained 黑馬已有衰減機制，不重複懲罰
    if (dh._retained) continue;

    // 保護 2: 偵測 3 天內不修正（新黑馬觀察期）
    const detectedDate = (dh.detectedAt || '').substring(0, 10);
    const daysSinceDetected = detectedDate
      ? Math.floor((new Date(today) - new Date(detectedDate)) / 86400000)
      : 999;
    if (daysSinceDetected < 3) continue;

    // 當前排名只從 _topRanks 取（唯一可靠來源）
    const currentRanks = {};
    if (dh._topRanks) {
      dh._topRanks.forEach(r => {
        if (!currentRanks[r.marketCode] || r.rank < currentRanks[r.marketCode]) {
          currentRanks[r.marketCode] = r.rank;
        }
      });
    }

    // 計算 healthRatio
    let origSum = 0, weightedSum = 0;
    for (const t of (dh.triggers || [])) {
      const s = t.score || 0;
      origSum += s;
      // 保護 3: 無 market 欄位 → factor 1.0（不懲罰）
      if (!t.market) { weightedSum += s; continue; }
      const curRank = currentRanks[t.market];
      weightedSum += s * getTriggerMarketFactor(curRank);
    }

    if (origSum <= 0) continue;
    // 保護 1: 下限 0.4
    const healthRatio = Math.max(weightedSum / origSum, 0.4);
    dh.confidenceScore = Math.round(dh.confidenceScore * healthRatio * 100) / 100;
  }

  // 保護 4: 重新排序但不重新過濾（保留判斷已在 Step 8 完成）
  mergedDarkhorses.sort((a, b) => b.confidenceScore - a.confidenceScore);
```

### 不需改動

- `app.js`：卡片已讀 `confidenceScore` 顯示
- `upload-to-firebase.js`：直接上傳修正後的 JSON
- 保留機制（Step 8）：判斷已完成，不受影響
- 觸發器（triggers）：陣列不變
