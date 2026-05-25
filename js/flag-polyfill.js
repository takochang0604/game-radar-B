/**
 * Flag Emoji Polyfill for Windows
 * Windows 不支援國旗 emoji，此腳本自動偵測並替換為 SVG 國旗圖片
 * 使用 flagcdn.com CDN（免費、無需 API key）
 */
(() => {
  // 國旗 emoji → 國碼 mapping（Regional Indicator Symbols）
  const FLAG_MAP = {
    '🇺🇸': 'us', '🇯🇵': 'jp', '🇰🇷': 'kr', '🇨🇳': 'cn',
    '🇹🇼': 'tw', '🇹🇭': 'th', '🇻🇳': 'vn', '🇵🇭': 'ph',
    '🌍': '_globe', // 全部市場
  };

  // 建立正規表達式，匹配所有國旗 emoji
  const FLAG_REGEX = new RegExp(Object.keys(FLAG_MAP).map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');

  /**
   * 將國旗 emoji 替換為 <img> 標籤
   */
  function flagToImg(flagEmoji, size = 20) {
    const code = FLAG_MAP[flagEmoji];
    if (!code) return flagEmoji;
    if (code === '_globe') {
      // 🌍 用 inline SVG 替代
      return `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 36'%3E%3Ccircle fill='%2355ACEE' cx='18' cy='18' r='16'/%3E%3Cpath fill='%233B88C3' d='M18 2C9.163 2 2 9.163 2 18s7.163 16 16 16 16-7.163 16-16S26.837 2 18 2z'/%3E%3C/svg%3E" alt="🌍" class="flag-icon flag-globe">`;
    }
    return `<img src="https://flagcdn.com/${code}.svg" alt="${flagEmoji}" class="flag-icon">`;
  }

  /**
   * 替換 HTML 字串中的國旗 emoji
   */
  function replaceFlagsInHTML(html) {
    return html.replace(FLAG_REGEX, (match) => flagToImg(match));
  }

  /**
   * 遞迴處理 DOM 節點中的文字國旗
   */
  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      FLAG_REGEX.lastIndex = 0; // 重置 global regex 的 lastIndex，避免連續呼叫時跳過匹配
      if (FLAG_REGEX.test(node.textContent)) {
        const span = document.createElement('span');
        span.innerHTML = node.textContent.replace(FLAG_REGEX, (match) => flagToImg(match));
        node.parentNode.replaceChild(span, node);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // 跳過 script, style, textarea, input
      if (['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT'].includes(node.tagName)) return;
      // 跳過已處理過的
      if (node.classList?.contains('flag-icon') || node.dataset?.flagProcessed) return;

      // 處理 title attribute（tooltip 用）
      if (node.title && FLAG_REGEX.test(node.title)) {
        // title 屬性保留 emoji（因為它是純文字，圖片無法顯示）
        // 改用國碼文字替代
        node.title = node.title.replace(FLAG_REGEX, (match) => {
          const code = FLAG_MAP[match];
          return code ? code.toUpperCase() : match;
        });
      }

      // 處理子節點（從後往前，避免索引偏移）
      const children = Array.from(node.childNodes);
      children.forEach(child => processNode(child));
    }
  }

  /**
   * 掃描整個頁面，替換國旗
   */
  function scanAndReplace() {
    processNode(document.body);
  }

  // 初始載入完成後執行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(scanAndReplace, 100));
  } else {
    setTimeout(scanAndReplace, 100);
  }

  // MutationObserver：監聽 DOM 變化，自動處理新增內容
  let debounceTimer = null;
  const observer = new MutationObserver((mutations) => {
    // 防抖：避免大量 DOM 更新時重複掃描
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
            processNode(node);
          }
        });
      });
    }, 50);
  });

  // 延遲啟動 observer，等 app.js 初始渲染完成
  setTimeout(() => {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }, 500);

  // 匯出給其他模組使用（可選）
  window.flagToImg = flagToImg;
  window.replaceFlagsInHTML = replaceFlagsInHTML;
})();
