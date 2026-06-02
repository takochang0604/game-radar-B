/**
 * Firebase 前端初始化 + 資料讀取模組 v2
 * 按需從 Firestore 載入資料，內建快取避免重複查詢
 * 
 * v2 新增：
 *  - #8  loadDarkhorseHistory() — 黑馬歷史查詢
 *  - #11 loadPipelineStatus() — pipeline 執行狀態
 *  - #12 子集合載入（向後相容）
 *  - #15 loadTrackedGames() — 追蹤遊戲
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteField,
  query, orderBy, limit,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// ============ Firebase 初始化 ============
const firebaseConfig = {
  apiKey:            "AIzaSyBAc8rrFgqOSmrImCZU8vPzJeKIaTTftj4",
  authDomain:        "memorandum-3abaa.firebaseapp.com",
  projectId:         "memorandum-3abaa",
  storageBucket:     "memorandum-3abaa.firebasestorage.app",
  messagingSenderId: "339882662542",
  appId:             "1:339882662542:web:a01cd406296720318c07df",
  measurementId:     "G-MW4W68Y6KT"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const COLLECTION = 'gameAnalysis-dev';  // dev 分支用獨立 collection，不影響正式版

// ============ 快取 ============
const cache = {
  meta: null,
  darkhorses: null,
  analysis: null,
  reports: null,
  pipelineStatus: null,
  tracked: null,
  darkhorseHistory: {},  // key: date
  snapshots: {}, // key: "date_market_platform_chartType"
};

// ============ 資料讀取 API ============

/**
 * 載入 meta（可用日期列表）
 */
export async function loadMeta() {
  if (cache.meta) return cache.meta;
  const snap = await getDoc(doc(db, COLLECTION, 'meta'));
  if (snap.exists()) {
    cache.meta = snap.data();
    return cache.meta;
  }
  return { availableDates: [] };
}

/**
 * 載入黑馬資料
 */
export async function loadDarkhorses() {
  if (cache.darkhorses) return cache.darkhorses;
  const snap = await getDoc(doc(db, COLLECTION, 'darkhorses'));
  if (snap.exists()) {
    cache.darkhorses = snap.data();
    return cache.darkhorses;
  }
  return { darkhorses: [], date: null };
}

/**
 * #8 載入黑馬歷史（指定日期）
 */
export async function loadDarkhorseHistory(date) {
  if (cache.darkhorseHistory[date]) return cache.darkhorseHistory[date];
  const snap = await getDoc(
    doc(db, COLLECTION, 'darkhorseHistory', 'items', date)
  );
  if (snap.exists()) {
    cache.darkhorseHistory[date] = snap.data();
    return cache.darkhorseHistory[date];
  }
  return null;
}

/**
 * #8 載入所有可用的黑馬歷史日期清單（最近 14 天）
 */
export async function loadDarkhorseHistoryDates() {
  const historyRef = collection(db, COLLECTION, 'darkhorseHistory', 'items');
  const snap = await getDocs(historyRef);
  const dates = [];
  snap.forEach(doc => dates.push(doc.id));
  dates.sort();
  return dates;
}

/**
 * 載入分析資料
 */
export async function loadAnalysis() {
  if (cache.analysis) return cache.analysis;
  const snap = await getDoc(doc(db, COLLECTION, 'analysis'));
  if (snap.exists()) {
    cache.analysis = snap.data();
    return cache.analysis;
  }
  return {};
}

/**
 * 載入評測報告
 */
export async function loadReports() {
  if (cache.reports) return cache.reports;
  const snap = await getDoc(doc(db, COLLECTION, 'reports'));
  if (snap.exists()) {
    cache.reports = snap.data();
    return cache.reports;
  }
  return {};
}

/**
 * #11 載入 Pipeline 執行狀態
 */
export async function loadPipelineStatus() {
  if (cache.pipelineStatus) return cache.pipelineStatus;
  const snap = await getDoc(doc(db, COLLECTION, 'pipelineStatus'));
  if (snap.exists()) {
    cache.pipelineStatus = snap.data();
    return cache.pipelineStatus;
  }
  return null;
}

/**
 * #11 載入 Pipeline 抓取歷程（history 陣列）
 */
export async function loadPipelineHistory() {
  const status = await loadPipelineStatus();
  return status?.history || [];
}

/**
 * #15 載入追蹤遊戲資料（從 gameTracking 集合同步）
 */
const TRACKING_COLLECTION = 'gameTracking';
const TRACKING_DOC = 'trackedList';

export async function loadTrackedGames(forceRefresh = false) {
  if (!forceRefresh && cache.tracked) return cache.tracked;
  cache.tracked = null; // 清除快取
  const snap = await getDoc(doc(db, TRACKING_COLLECTION, TRACKING_DOC));
  if (snap.exists()) {
    const data = snap.data();
    // 將 {appId: gameData, ...} 轉為陣列
    const games = Object.values(data).filter(v => typeof v === 'object' && v.appId);
    cache.tracked = games;
    return games;
  }
  cache.tracked = [];
  return [];
}

/**
 * 儲存整份追蹤清單到 Firestore（覆寫）
 */
export async function saveTrackedGames(list) {
  const payload = {};
  list.forEach(g => { payload[g.appId] = g; });
  await setDoc(doc(db, TRACKING_COLLECTION, TRACKING_DOC), payload);
  cache.tracked = list;
}

/**
 * 載入特定快照（按需載入，切換市場/日期時呼叫）
 * @param {string} date - 日期 YYYY-MM-DD
 * @param {string} market - 市場代碼
 * @param {string} platform - 'android' | 'ios'
 * @param {string} chartType - 'topfree' | 'grossing'
 * @returns {Object|null} 快照資料
 */
export async function loadSnapshot(date, market, platform, chartType) {
  const docId = `${date}_${market}_${platform}_${chartType}`;
  if (cache.snapshots[docId]) return cache.snapshots[docId];

  const snap = await getDoc(
    doc(db, COLLECTION, 'snapshots', 'items', docId)
  );
  if (snap.exists()) {
    cache.snapshots[docId] = snap.data();
    return cache.snapshots[docId];
  }
  return null;
}

/**
 * 批次載入某日期+市場的所有快照（雙平台 × 雙排行 = 最多 4 筆）
 */
export async function loadMarketSnapshots(date, market, platforms, chartTypes) {
  const results = {};
  const promises = [];

  for (const platform of platforms) {
    if (!results[platform]) results[platform] = {};
    for (const chartType of chartTypes) {
      promises.push(
        loadSnapshot(date, market, platform, chartType).then(data => {
          if (data) results[platform][chartType] = data;
        })
      );
    }
  }

  await Promise.all(promises);
  return results;
}

/**
 * 初始載入（頁面啟動時呼叫）
 * 平行載入所有必要資料
 */
export async function loadInitialData() {
  const [meta, dhData, analysis, reports, pipelineStatus, tracked] = await Promise.all([
    loadMeta(),
    loadDarkhorses(),
    loadAnalysis(),
    loadReports(),
    loadPipelineStatus(),
    loadTrackedGames(),
  ]);

  return {
    availableDates: meta.availableDates || [],
    darkhorses: dhData.darkhorses || [],
    analysis,
    reports,
    pipelineStatus,
    tracked,
  };
}
