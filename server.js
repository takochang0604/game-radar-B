/**
 * 本地靜態伺服器（供 pm2 背景執行）
 * 啟動: pm2 start server.js --name game-dashboard
 * 停止: pm2 stop game-dashboard
 * 查看: pm2 list
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  
  // 安全檢查：防止目錄穿越
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end('Not Found'); return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮 遊戲競爭力分析儀表板`);
  console.log(`   http://localhost:${PORT}`);
});
