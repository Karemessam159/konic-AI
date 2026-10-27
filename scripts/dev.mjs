// يشغّل الخادم والموقع مع بعض بأمر واحد: npm run dev:all
// بدون أي مكتبات إضافية، ويشتغل على ويندوز وماك ولينكس. Ctrl+C يقفل الاتنين.
import { spawn, spawnSync } from 'node:child_process';

const isWin = process.platform === 'win32';
const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      if (isWin) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else process.kill(-child.pid, 'SIGTERM');
    } catch { /* اتقفل بالفعل */ }
  }
  process.exit(code);
}

function run(name, script) {
  const child = spawn('npm', ['run', script], { stdio: 'inherit', shell: true, detached: !isWin });
  child.on('exit', code => {
    if (stopping) return;
    console.log(`\n[${name}] وقف (code ${code ?? '?'}). بنقفل الباقي...`);
    stop(code ?? 1);
  });
  children.push(child);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
run('الخادم', 'server');
run('الموقع', 'dev');
