/**
 * 全域狀態管理模組
 */

// ============ 平台 Icon ============
export const ICON_ANDROID = '<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align:-2px;fill:#3DDC84"><path d="M17.6 11.5c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v4.9c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-4.9zm-14.4 0c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v4.9c0 .9-.7 1.6-1.6 1.6S3.2 17.3 3.2 16.4v-4.9zm3.3-.6h11v7.2c0 .9-.7 1.6-1.6 1.6H15v2.7c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-2.7h-1.6v2.7c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-2.7h-.9c-.9 0-1.6-.7-1.6-1.6v-7.2zM16.1 4l1.3-2.1c.1-.2.1-.5-.1-.6s-.5-.1-.6.1L15.3 3.6c-.9-.4-2-.7-3.3-.7s-2.3.2-3.3.7L7.4 1.4c-.2-.2-.4-.3-.6-.1s-.3.4-.1.6L8 4C5.9 5.1 4.5 7.2 4.5 9.6V10h15V9.6c0-2.4-1.4-4.5-3.4-5.6zM9 7.5c-.4 0-.8-.3-.8-.8s.3-.8.8-.8.8.3.8.8-.4.8-.8.8zm6 0c-.4 0-.8-.3-.8-.8s.3-.8.8-.8.8.3.8.8-.4.8-.8.8z"/></svg>';
export const ICON_IOS = '<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-1px;fill:#999"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>';

// ============ 市場設定 ============
export const MARKETS = [
  { code: 'us', name: '美國',   flag: '🇺🇸', hasGooglePlay: true },
  { code: 'jp', name: '日本',   flag: '🇯🇵', hasGooglePlay: true },
  { code: 'kr', name: '韓國',   flag: '🇰🇷', hasGooglePlay: true },
  { code: 'cn', name: '中國',   flag: '🇨🇳', hasGooglePlay: false },
  { code: 'tw', name: '台灣',   flag: '🇹🇼', hasGooglePlay: true },
  { code: 'th', name: '泰國',   flag: '🇹🇭', hasGooglePlay: true },
  { code: 'vn', name: '越南',   flag: '🇻🇳', hasGooglePlay: true },
  { code: 'ph', name: '菲律賓', flag: '🇵🇭', hasGooglePlay: true },
];

// ============ 全域狀態 ============
export const state = {
  // --- 各 tab 獨立篩選狀態 ---
  dh:    { market: 'all', platform: 'ios', chartType: 'all' },
  rank:  { market: 'all', platform: 'ios', chartType: 'topfree' },
  trend: { market: 'all', platform: 'ios', chartType: 'topfree' },
  // --- 共用 ---
  selectedDate: null,
  snapshots: {},
  darkhorses: [],
  analysis: {},
  reports: {},
  availableDates: [],
  trendApps: [],
  trendPreset: 'top10',
  firebaseMode: false,
  pipelineStatus: null,
  tracked: null,
  activeTab: 'darkhorse',
};

// ============ 全域圖表引用 ============
export let trendChart = null;
export function setTrendChart(chart) { trendChart = chart; }

// ============ 渲染回調（由 app.js 設定）============
let _renderAll = () => {};
export function setRenderAll(fn) { _renderAll = fn; }
export function renderAll() { _renderAll(); }

// ============ Firebase 按需載入 ============
export async function ensureSnapshotLoaded(date, market) {
  if (!date || !state.firebaseMode) return;
  if (state.snapshots[date] && state.snapshots[date][market]) return;

  const { loadMarketSnapshots } = await import('../firebase-data.js');
  const hasGP = market !== 'cn';
  const platforms = hasGP ? ['android', 'ios'] : ['ios'];
  const chartTypes = ['topfree', 'grossing'];

  const result = await loadMarketSnapshots(date, market, platforms, chartTypes);
  if (!state.snapshots[date]) state.snapshots[date] = {};
  state.snapshots[date][market] = result;
}
