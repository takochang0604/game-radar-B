# 黑馬偵測 & 信心分數算法 — 現行版本記錄

> 最後更新:2026-06-09 v3(加入 marketWeight + breadth + decay-aware + timeDecay)
> 此文件記錄目前運作中的算法,供日後決定是否要再改良時參考。

---

## 一、四個偵測策略

每張卡在每個市場各自跑這四條規則,每觸發一條就給一個 `trigger`:

| 策略 ID | 條件 | 分數對應 |
|---|---|---|
| `rank_jump` 🚀 排名急升 | 7 天內排名上升 ≥ 30/50/70 名 | 3 / 5 / 7 |
| `new_entry` 🆕 新進榜 | 首次進入 Top 30,前 4 天都不在榜 | 看當前排名:#1-5 = 7, #6-10 = 6, #11-20 = 5, #21-30 = 4, #31-50 = 3, 更後 = 2 |
| `consecutive_rise` 📈 持續攀升 | 連續 5/8/10+ 天排名上升 | 3 / 5 / 7 |
| `growth_multiplier` 📊 成長加速 | (近 3 天平均排名) ÷ (近 7 天平均排名) ≥ 2.5/3.5/5 倍 | 3 / 5 / 7 |

程式碼:`scripts/detect-darkhorse.js` 行 122-322

---

## 二、信心分數(confidenceScore)— 首爆鎖死

合成公式([detect-darkhorse.js:523-526](scripts/detect-darkhorse.js)):

```
baseScore = max(各觸發策略分數)
bonus = min(觸發數量 - 1, 3)              ← 加成 cap +3
finalScore = min(baseScore + bonus, 10)   ← 封頂 10
```

**重要特性**:
- 首次偵測時算出 `confidenceScore`,寫入 json
- **之後不再重算**(跨日合併只新增觸發、不重新計算)
- 表示「這張卡曾經多猛」的歷史峰值

---

## 三、顯示分(displayScore)— 反映現況的綜合分

> 2026-06-09 v3 升級:加入 marketWeight、breadth、decay-aware、timeDecay 四項業界元素。
> 之後想再改的話,長期 roadmap 是重寫底層 confidenceScore 公式或拆三軸打分。

### 公式

```
displayScore = min(confidenceScore × healthRatio × breadthFactor × timeDecay, 10)
```

寫入 json 的欄位:`confidenceScore`(原值不動)+ `healthRatio` + `breadthFactor` + `timeDecay` + `displayScore`。

### 1. healthRatio — 衰退判別,帶市場權重

```
healthRatio = Σ(trigger.score × marketWeight × rankDecay) / Σ(trigger.score × marketWeight)
```

**marketWeight 分層表**(可日後微調):
```
us, jp           → 1.0   (主市場)
kr, cn           → 0.9
tw               → 0.7
th, vn, ph       → 0.5
```

**rankDecay(triggerRank, todayRank)** — 判別「真衰退」vs 「擴張新市場」:
```
今天比觸發當天更好 (todayRank ≤ triggerRank) → 1.0  (沒衰退)
今天比觸發當天差   → max(triggerRank / todayRank, 0.4)
完全掉榜 (todayRank == null)                 → 0.1
無 triggerRank fallback → marketFactor(todayRank) = 1 / (1 + (rank/20)^1.5)
```

**triggerRank 來源**:
- v3 後的新觸發直接在 trigger 物件記錄
- 舊資料用 `parseTriggerRank(t.detail)` 從字串解析(`升至 #N`、`排名 #N`、`→ #N`、`平均 #N vs`)

**下限保護**:
- 觀察期 < 3 天 → healthRatio = 1.0
- 新黑馬:`max(rawHealth, 0.4)`
- retained 黑馬:`max(rawHealth, 0.5)`
- snapshotMissing(快照漏抓)→ trigger 視為 1.0(不誤判)

### 2. breadthFactor — 廣度加成

```
weightedMarketCount = Σ(marketWeight for each unique market in _topRanks)
breadthFactor = 1 + min(log2(weightedMarketCount) × 0.15, 0.3)
```

- 1 個市場(weight 0.5)→ ≈ 0.85,fallback 1.0
- 2 個主市場(weight 2.0)→ 1.15
- 4 個主市場(weight 4.0)→ 1.30(上限)
- 上限 +30% 乘數,不會無限放大

意義:多市場上榜的真正全球熱潮拿到加成,單市場黑馬只拿基本分。

### 3. timeDecay — 老黑馬自然淡出

```
days = floor((today - detectedAt) / day_ms)
days < 3        → 1.0  (觀察期)
否則 → 1 / (1 + (days - 3) / 30)
```

半衰期 **30 天**(從 detected 後第 3 天起算):
- 3 天: 1.00
- 7 天: 0.88
- 14 天: 0.73
- 21 天: 0.62
- 30 天: 0.52
- 60 天: 0.36

避免老黑馬霸榜,讓新黑馬有機會排到前面。

### 4. 合成範例

**Meowdoku iOS(8 國上榜,主市場 Top 1-3,7 天前偵測)**:
```
confidenceScore = 10
healthRatio    = 1.00  (所有市場今天 ≤ 觸發排名)
breadthFactor  = 1.29  (8 國,weight 加總 4.5)
timeDecay      = 0.88  (7 天)
displayScore   = min(10 × 1.0 × 1.29 × 0.88, 10) = 10  (封頂)
```

**Dragon Village 3 iOS(2 國上榜,TW 從 #1 掉到 #3,7 天前)**:
```
confidenceScore = 10
healthRatio    = 0.68  (TW triggers 觸發衰退判別)
breadthFactor  = 1.10  (僅 KR+TW)
timeDecay      = 0.88
displayScore   = min(10 × 0.68 × 1.10 × 0.88, 10) = 6.58
```

程式碼:`scripts/detect-darkhorse.js` Step 9(行 1029+)

---

## 四、跨日 / 跨市場 / 跨平台合併

### 跨日(同款今天又被偵測)
- Key = `appId + platform + chartType`
- **歷史觸發鎖定**:昨天的 detectedAt / detail 描述 / 排名通通保留
- 今天新策略 → 加入新 trigger
- 今天觸發昨天已有的策略 → 忽略
- 用合併後的 triggers 重新跑信心分數公式

### 跨市場(同款多國上榜)
- Key = `appId + platform + chartType`
- 多市場各自先算 confidenceScore
- 合併時:**保留最高分版本當主體**,markets[] 累積,triggers 合併
- 信心分數**取最高**(不是相加)

### 跨平台手動合併(manualPairs)
- 自動配對失敗時,使用者手動指定
- 結構:Firestore 的 `gameTracking/manualPairs.groups`
- applyManualPairs 套用後重算 confidenceScore(用合併後 triggers 跑同一公式)
- 程式碼:`app.js:applyManualPairs`

---

## 五、保留期(retention)

[detect-darkhorse.js:693-770](scripts/detect-darkhorse.js)

```
retentionDays: 14
retentionMaxRank: 100
```

過去 14 天曾被偵測為黑馬的遊戲:
- 今天仍在 Top 100 → **保留卡片**(打 `_retained: true` 標記)
- 信心分數鎖死,但 displayScore 會反映現況衰退
- 超過 14 天或掉出 Top 100 → 完全移除

---

## 六、入榜門檻(排除規則)

[detect-darkhorse.js:477-483](scripts/detect-darkhorse.js)

```
app.score < 3.0            → 排除(評分太低)
app.rank > 50              → 排除(maxCurrentRank)
isEstablishedGame()        → 排除(已穩定的大作不算黑馬)
```

**Established 定義**:近 14 天裡有 ≥ 10 天排在 Top 20。

---

## 七、跨語言名稱配對

### 自動配對(_siblingAppIds)
- 配對「另一平台同款遊戲」的 appId
- 流程:同開發商 → token + CJK 比對(過濾通用字 game/puzzle/brain/...)→ bestScore ≥ 1 採用
- **逆向驗證**:配對結果還要通過「開發商一致 + token/CJK 交集」才算數
- 程式碼:`scripts/detect-darkhorse.js` 行 781-921

### _topRanks 三層比對
```
1. appId 精確比對
2. 開發商 + 名稱完全一致(去掉 game/puzzle/brain 等通用字後)
3. 開發商 + 核心名稱完全相等
```

### 手動配對(manualPairs)
- 解「奧丁:神叛 TW vs 오딘 KR」這類算法解不掉的 case
- 前端 modal 內「🔗 合併卡片」icon 觸發
- 寫到 Firestore 跨裝置同步

---

## 八、前端顯示邏輯

### 卡片
- **主分**:`displayScore`(fallback `confidenceScore`)
- **排序**:依 displayScore
- **健康度**:只在 hover tooltip 顯示(`顯示分 / 首爆分 / 健康度 NN%`)
- 不加視覺指示(沒有 badge / dot),避免市場 pill 多時擁擠

### Modal 詳細頁
- 顯示完整 triggers 列表(歷史描述,不會跟著現況衰退)
- `_topRanks` 顯示所有上榜市場 × 平台
- 合併管理:點 📌 圖釘 icon 看群組成員、解除合併

---

## 九、v3 解了什麼 / 還剩什麼

### v3(2026-06-09)解了
1. ✅ **市場分層** — marketWeight 表,US/JP=1.0 vs TH/VN/PH=0.5
2. ✅ **廣度加成** — breadthFactor 讓 8 國上榜的全球熱潮拿 +30% 乘數
3. ✅ **衰退判別** — rankDecay 區分「真衰退」(觸發後排名變差) 與「擴張新市場」(本就排在後段)
4. ✅ **時間衰減** — timeDecay 30 天半衰期,老黑馬自然淡出讓新黑馬上位

### 還剩的弱點

1. **底層 confidenceScore 公式太容易頂到 10 分** ⚠️
   - 觸發 1 個 7 分策略 + 任 4 個策略觸發 → 7 + 3 = 10
   - displayScore 在乘上 breadth + decay 後仍會 cap 在 10
   - 真正的全球大爆款跟「普通 4 國黑馬」在 9-10 區間區分力仍弱

2. **免費 / 營收 一視同仁**
   - 營收 #1 的商業意義 ≠ 免費 #1,但分數沒區分

3. **Modal 內 triggers 描述是過時的**
   - displayScore 反映現況,但 modal 內 trigger 描述仍是首爆當天的字串

4. **參數沒實證校準**
   - marketWeight 表、timeDecay 半衰期 30 天、健康度閾值都是憑直覺
   - 應該「平行跑 2 週用實測資料校準」

5. **Cohort 比較沒做**
   - 沒跟同 category 同期間遊戲比相對表現(workflow 點出的)
   - 一款拼圖遊戲在「拼圖類普遍掉」的時候上升,比在拼圖類普遍上升時上升更黑馬

---

## 十、可參考的業界方法論

### 公開算法
- **Hacker News Hot Algorithm**: `score = (votes - 1)^0.8 / (hours + 2)^1.8` — 可借鑒 time decay
- **Reddit Hot**: log(votes) × sign(votes) + seconds / 45000
- **EWMA(指數加權移動平均)**: 嚴謹版的 growth_multiplier

### 業界產品(內部演算法不公開,但定義可參考)
- **AppMagic "Breakout"**: velocity + 廣度 + 品質 三軸
- **Sensor Tower Power Rankings**: 多窗口 + 收入加權
- **GameRefinery Game IQ**: category cohort 相對排名
- **StoreSignal Growth Multiplier**: 我們已部分採用

### 學術
- Bayesian Online Change Point Detection — 排名異常偵測
- Hidden Markov Models — 遊戲生命週期階段

---

## 十一、改良 roadmap(如果之後想動)

按 ROI 排序:

| 動作 | 工程量 | 效益 |
|---|---|---|
| 1. 市場分層 marketWeight | 半天 | 高 |
| 2. 多軸分數(速度/廣度/品質) | 1-2 天 | 中 |
| 3. Hot algo 式 time decay 取代 retention hack | 半天 | 中 |
| 4. Category cohort 比較 | 2-3 天 | 高 |
| 5. 重寫 confidenceScore 解區分力問題 | 中 | 中 |
| 6. 實證校準 healthRatio 參數 | 半天(蒐集 1-2 週後) | 低-中 |

---

## 附錄:相關檔案

| 檔案 | 內容 |
|---|---|
| `scripts/detect-darkhorse.js` | 主算法(每日 Actions 跑) |
| `scripts/repair-topranks.cjs` | 安全 patch 已上線 json 的 _topRanks |
| `scripts/repair-healthratio.cjs` | 安全 patch 已上線 json 的 healthRatio + displayScore |
| `scripts/upload-to-firebase.js` | 上傳 json 到 Firestore(白名單欄位) |
| `app.js` | 前端:applyManualPairs、卡片渲染、modal |
| `firebase-data.js` | Firestore 讀寫(loadInitialData、saveManualPairs) |
| `config.js` | 算法門檻常數(DARKHORSE_CONFIG、ESTABLISHED_THRESHOLD) |
| `DISCUSSION-healthRatio.md` | healthRatio 的原始提案(已棄用,實作版採用 workflow 改良版) |
