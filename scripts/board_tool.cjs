const http = require('http');

const auth = 'Bearer ManchesterUnited';

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: body ? JSON.parse(body) : null });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function getBoard() {
  const res = await request({
    host: '127.0.0.1',
    port: 8766,
    path: '/api/board?project=kiosk',
    method: 'GET',
    headers: { Authorization: auth }
  });
  return res.data;
}

async function moveTask(taskId, column) {
  const data = JSON.stringify({ column, movedBy: 'Antigravity' });
  const res = await request({
    host: '127.0.0.1',
    port: 8766,
    path: `/api/board/tasks/${taskId}/move?project=kiosk`,
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  }, data);
  return res;
}

async function addComment(taskId, content) {
  const data = JSON.stringify({ author: 'Antigravity', content });
  const res = await request({
    host: '127.0.0.1',
    port: 8766,
    path: `/api/board/tasks/${taskId}/comments?project=kiosk`,
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  }, data);
  return res;
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'status') {
    const board = await getBoard();
    const cols = board.columns || [];
    const tasks = board.tasks || [];
    for (const col of cols) {
      const colTasks = tasks.filter(t => t.column === col);
      console.log(`[${col}] (${colTasks.length})`);
      for (const t of colTasks) {
        console.log(`  - ${t.id}: ${t.title}`);
      }
    }
  } else if (cmd === 'task') {
    const taskId = process.argv[3];
    const board = await getBoard();
    const found = (board.tasks || []).find(t => t.id === taskId);
    if (found) {
      console.log(JSON.stringify(found, null, 2));
    } else {
      console.log('Not found:', taskId);
    }
  } else if (cmd === 'move') {
    const taskId = process.argv[3];
    const col = process.argv[4];
    const res = await moveTask(taskId, col);
    console.log(`Move ${taskId} -> ${col}:`, res.status, res.data || res.raw);
  } else if (cmd === 'comment') {
    const taskId = process.argv[3];
    const comment = process.argv[4];
    const res = await addComment(taskId, comment);
    console.log(`Comment on ${taskId}:`, res.status, res.data || res.raw);
  }
}

main().catch(console.error);
