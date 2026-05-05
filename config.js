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
// Google Play 子分類
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
  lookbackDays: 7,           // 回溯天數
  rankJumpThreshold: 30,     // 排名急升門檻（上升 N 名以上）
  consecutiveRiseDays: 5,    // 持續攀升天數
  newEntryDays: 7,           // 新進榜判定天數
  newEntryMaxRank: 30,       // 新進榜最高排名限制（只有 Top N 才算黑馬）
  newEntryMinNulls: 4,       // 新進榜前面至少要有 N 天不在榜上
  minHistoryDays: 4,         // 該市場至少要有 N 天快照才進行偵測
  minScore: 3.5,             // 最低評分門檻（低於此分的遊戲直接排除）
  minConfidence: 1.5,        // 最低信心分數（低於此分的不列為黑馬）
  maxCurrentRank: 50,        // 當前排名必須在 Top N 以內才算黑馬
};

// ============ AppMagic 連結模板 ============
export const APPMAGIC_BASE_URL = 'https://appmagic.rocks';
export const APPMAGIC_TOP_CHARTS_URL = `${APPMAGIC_BASE_URL}/top-charts/apps`;

// ============ 資料路徑 ============
export const DATA_DIR = './data';
export const SNAPSHOTS_DIR = `${DATA_DIR}/snapshots`;
export const DARKHORSE_DIR = `${DATA_DIR}/darkhorse`;
export const ANALYSIS_DIR = `${DATA_DIR}/analysis`;
export const REPORTS_DIR = './評測報告';
