/**
 * 遊戲產品競爭力分析工具 — 設定檔
 */

// ============ 追蹤市場 ============
export const MARKETS = [
  { code: 'us', name: '美國',   flag: '🇺🇸', hasGooglePlay: true },
  { code: 'jp', name: '日本',   flag: '🇯🇵', hasGooglePlay: true },
  { code: 'kr', name: '韓國',   flag: '🇰🇷', hasGooglePlay: true },
  { code: 'cn', name: '中國',   flag: '🇨🇳', hasGooglePlay: false }, // 中國無 Google Play，僅追蹤 iOS
  { code: 'tw', name: '台灣',   flag: '🇹🇼', hasGooglePlay: true },
  { code: 'th', name: '泰國',   flag: '🇹🇭', hasGooglePlay: true },
  { code: 'vn', name: '越南',   flag: '🇻🇳', hasGooglePlay: true },
  { code: 'ph', name: '菲律賓', flag: '🇵🇭', hasGooglePlay: true },
];

// ============ 遊戲分類（排除博弈類 GAME_CASINO）============
// Google Play 全子分類（用於完整掃描，目前保留但日常不使用）
export const GP_GAME_CATEGORIES = [
  'GAME_ACTION',
  'GAME_ADVENTURE',
  'GAME_ARCADE',
  'GAME_BOARD',
  'GAME_CARD',
  // 'GAME_CASINO',  ← 排除博弈類
  'GAME_CASUAL',
  'GAME_EDUCATIONAL',
  'GAME_MUSIC',
  'GAME_PUZZLE',
  'GAME_RACING',
  'GAME_ROLE_PLAYING',
  'GAME_SIMULATION',
  'GAME_SPORTS',
  'GAME_STRATEGY',
  'GAME_TRIVIA',
  'GAME_WORD',
];

// #13 精簡子分類：日常抓取只掃主要遊戲類型（從 15 個減為 6 個，節省 ~60% API 呼叫）
export const GP_PRIORITY_CATEGORIES = [
  'GAME_ACTION',
  'GAME_ROLE_PLAYING',
  'GAME_STRATEGY',
  'GAME_CASUAL',
  'GAME_SIMULATION',
  'GAME_ADVENTURE',
];

// iOS 分類（用 app-store-scraper 的 category ID）
export const IOS_GAME_CATEGORY = 6014; // Games 總分類

// ============ 排行類型 ============
export const CHART_TYPES = [
  { id: 'topfree',    name: '免費下載排行', gpCollection: 'TOP_FREE',  iosCollection: 'TOP_FREE_IOS' },
  { id: 'grossing',   name: '營收排行',     gpCollection: 'GROSSING',  iosCollection: 'TOP_GROSSING_IOS' },
];

// ============ 抓取設定 ============
export const FETCH_CONFIG = {
  numPerCategory: 60,    // 每個子分類抓取筆數
  topN: 100,             // 最終保留 Top N
  delayBetweenRequests: 2000, // 請求間隔（毫秒），避免被限流
  maxRetries: 3,         // 最大重試次數
};

// ============ 黑馬偵測門檻 ============
export const DARKHORSE_CONFIG = {
  lookbackDays: 60,          // 回溯天數
  rankJumpThreshold: 30,     // 排名急升門檻（上升 N 名以上）
  consecutiveRiseDays: 5,    // 持續攀升天數
  newEntryDays: 7,           // 新進榜判定天數
  newEntryMaxRank: 30,       // 新進榜最高排名限制（只有 Top N 才算黑馬）
  newEntryMinNulls: 4,       // 新進榜前面至少要有 N 天不在榜上
  minHistoryDays: 4,         // 該市場至少要有 N 天快照才進行偵測
  minScore: 3.0,             // 最低評分門檻（低於此分的遊戲直接排除）
  minConfidence: 1.5,        // 最低信心分數（低於此分的不列為黑馬）
  maxCurrentRank: 100,       // 擴大監測到 Top 100（Mid-Chart 偵測）

  // [未實作] #1 回歸型黑馬（跌出後回升）
  bounceBackMinDrop: 50,     // 曾跌出 Top N（或消失）才算「跌出」
  bounceBackMaxReturn: 20,   // 回歸時必須進入 Top N 以內
  bounceBackWindowDays: 7,   // 在 N 天內發生跌出→回歸

  // [未實作] #2 免費+營收交叉訊號
  crossChartBonus: 1.5,      // 同時在 topfree + grossing 出現的加權倍數

  // [未實作] #4 跨平台一致性加分
  crossPlatformBonus: 1.3,   // 同時在 iOS + Android 竄升的加權倍數

  // [未實作] #5 週末效應調整
  weekendAdjustment: 1.2,    // 週一判定時 rankJumpThreshold 乘以此係數（提高門檻）

  // #6 黑馬保留期
  retentionDays: 60,         // 曾被偵測為黑馬的遊戲，在 N 天內只要仍在榜上就繼續保留

  // #7 Growth Multiplier（成長倍率）
  growthMultiplierThreshold: 2.5,  // 近期排名/長期排名 >= 此值 → 黑馬信號
  growthShortWindow: 3,            // 短期窗口（天）
  growthLongWindow: 7,             // 長期窗口（天）

  // [未實作] #8 排名鋸齒偵測（買榜信號）
  sawtoothSwingThreshold: 30,      // 排名波動 >= N 名算一次「大幅震盪」
  sawtoothMinSwings: 2,            // 短時間內 >= N 次大幅震盪 → 疑似買榜
};

// ============ 市場權重（按排行類型區分）============
// #3 營收排行和免費下載的市場重要性不同
export const MARKET_WEIGHTS = {
  topfree: {
    us: 1.5,  // 美國下載量最大
    jp: 1.2,
    cn: 1.3,  // 中國下載體量大
    kr: 1.1,
    tw: 1.0,
    th: 1.0,
    vn: 1.0,
    ph: 1.0,
  },
  grossing: {
    us: 1.4,
    jp: 1.6,  // 日本 ARPU 全球最高
    cn: 1.3,
    kr: 1.4,  // 韓國重度手遊市場
    tw: 1.0,
    th: 0.9,
    vn: 0.9,
    ph: 0.8,
  },
};

// ============ 自家遊戲追蹤（#15）============
// 填入自家遊戲的 appId，系統會自動追蹤排名變化並標記附近的競爭威脅
// 格式: { name: '遊戲名稱', android: 'com.xxx.yyy', ios: '123456789' }
export const TRACKED_GAMES = [
  // 範例:
  // { name: '明星三缺一', android: 'com.igs.mjstar3', ios: '123456789' },
];

// ============ AppMagic 連結模板 ============
export const APPMAGIC_BASE_URL = 'https://appmagic.rocks';
export const APPMAGIC_TOP_CHARTS_URL = `${APPMAGIC_BASE_URL}/top-charts/apps`;

// ============ 資料路徑 ============
export const DATA_DIR = './data';
export const SNAPSHOTS_DIR = `${DATA_DIR}/snapshots`;
export const DARKHORSE_DIR = `${DATA_DIR}/darkhorse`;
export const ANALYSIS_DIR = `${DATA_DIR}/analysis`;
export const REPORTS_DIR = './評測報告';
