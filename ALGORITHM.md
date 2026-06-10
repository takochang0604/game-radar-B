# 黑馬偵測 & 信心分數算法 — 現行版本記錄

> 最後更新:2026-06-09(commit `c6972ce` 之後)
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

## 三、健康度 + 顯示分(healthRatio / displayScore)— 反映現況

> 加入時間:2026-06-09,作為「過渡補丁」處理 confidenceScore 鎖死問題。
> 多視角 workflow 評估後採用的改良版,長期 roadmap 是重寫 confidenceScore 公式。

### healthRatio 公式

```
healthRatio = Σ(trigger.score × marketFactor) / Σ(trigger.score)
```

**marketFactor(連續函數,無階梯跳動)**:

```
marketFactor(rank) = 1 / (1 + (rank/20)^1.5)
```

各排名對應的 factor:
- #1 → ≈ 0.95
- #10 → ≈ 0.74
- #20 → 0.5
- #50 → ≈ 0.20
- #100 → ≈ 0.08
- 不在榜 → 0.1

**邊界處理**:
1. **觀察期保護**:偵測日期 < 3 天的新黑馬,`healthRatio = 1.0`(不修正)
2. **舊資料相容**:`trigger.market` 欄位不存在 → 該觸發 factor = 1.0
3. **snapshotMissing 區分**:該市場該天快照檔不存在 → factor = 1.0(視為資料缺失,不懲罰)
4. **下限保護**:
   - 新黑馬:`max(healthRatio, 0.4)`
   - retained 黑馬:`max(healthRatio, 0.5)`(避免雙重懲罰)
5. **Σ(trigger.score) ≤ 0** → 直接設 healthRatio = 1.0

### displayScore

```
displayScore = round(confidenceScore × healthRatio, 2)
```

寫入 json:`confidenceScore`(原值,不動)+ `healthRatio` + `displayScore`。

程式碼:`scripts/detect-darkhorse.js` 行 1029-1106

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

## 九、已知弱點(workflow 評估點出的)

優先級由高到低:

1. **底層公式太容易頂到 10 分** ⚠️
   - 觸發 1 個 7 分策略 + 任 4 個策略觸發 → 7 + 3 = 10
   - 真正的全球大爆款跟「普通 4 國黑馬」分數分不出來
   - healthRatio 只能往下拉,**無法拉開頂端區分力**

2. **市場分層沒做**
   - 美國 #1 = 越南 #1 在計算上同分
   - 沒有 `marketWeight` 概念
   - 分析師最在乎的痛點

3. **免費 / 營收 一視同仁**
   - 營收 #1 的商業意義 ≠ 免費 #1

4. **Modal 內 triggers 描述是過時的**
   - displayScore 反映現況,但 modal 內 trigger 描述仍是首爆當天

5. **參數沒實證校準**
   - 觀察期 3 天 / 下限 0.4 / 健康度閾值都是憑直覺
   - 應該「平行跑 2 週用實測資料校準」

6. **Cohort 比較沒做**
   - 沒跟同 category 同期間遊戲比相對表現

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
