// Konic AI v0.3.2 - خادم محلي بسيط (Node.js بدون مكتبات ويب إضافية)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createRequire } from 'node:module';
import * as cheerio from 'cheerio';
import { generateAIResponse, currentModelInfo, verifyKey } from './ai.js';
import { loadEnv, saveEnvValue } from './env.js';

loadEnv(); // لازم قبل قراءة PORT والمفاتيح

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js'); // المسار المباشر يتجنب خطأ وضع التجربة في المكتبة

const PORT = Number(process.env.PORT || 3001);
// محليًا: 127.0.0.1 (آمن). على الاستضافة اضبط HOST=0.0.0.0 — وساعتها تغيير المفتاح من الواجهة بيتقفل.
const HOST = process.env.HOST || '127.0.0.1';
const LOCAL_ONLY = ['127.0.0.1', 'localhost', '::1'].includes(HOST);
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.map': 'application/json' };
const keyOk = k => /^gsk_\S{16,}$/.test(k);
const MAX_BODY = 8 * 1024 * 1024;
const MAX_IMAGE = 3 * 1024 * 1024; // Groq يرفض صور base64 الأكبر من 4MB تقريبًا
const MAX_FILE = 4 * 1024 * 1024;
const ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173'];
const allowedImages = ['image/png', 'image/jpeg', 'image/webp'];

// خطأ سببه المستخدم (ملف/رابط غير صالح) - رسالته عربية وتظهر كما هي
class UserError extends Error {}

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

function validBase64(value, limit) {
  if (typeof value !== 'string' || value.length > Math.ceil(limit * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4) throw new UserError('بيانات الملف غير صالحة');
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > limit || bytes.toString('base64') !== value) throw new UserError('بيانات الملف غير صالحة أو الحجم كبير');
  return bytes;
}

function validateImage(image) {
  if (!image) return null;
  if (!allowedImages.includes(image.mimeType)) throw new UserError('نوع الصورة غير مدعوم (استخدم PNG أو JPG أو WebP)');
  const bytes = validBase64(image.data, MAX_IMAGE);
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!((image.mimeType === 'image/jpeg' && jpg) || (image.mimeType === 'image/png' && png) || (image.mimeType === 'image/webp' && webp))) throw new UserError('الملف ليس صورة حقيقية من النوع المذكور');
  return { mimeType: image.mimeType, data: image.data };
}

function isPublicIp(address) {
  if (isIP(address) === 4) {
    const a = address.split('.').map(Number);
    if ([0, 10, 127].includes(a[0]) || a[0] >= 224 || (a[0] === 169 && a[1] === 254) || (a[0] === 172 && a[1] >= 16 && a[1] <= 31) || (a[0] === 192 && a[1] === 168) || (a[0] === 100 && a[1] >= 64 && a[1] <= 127) || (a[0] === 192 && a[1] === 0) || (a[0] === 198 && (a[1] === 18 || a[1] === 19))) return false;
    return true;
  }
  if (isIP(address) === 6) {
    const s = address.toLowerCase();
    return !(/^(::1|::|fc|fd|fe[89ab]|ff)/.test(s) || s.startsWith('::ffff:'));
  }
  return false;
}

async function assertPublicUrl(url) {
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.')) throw new UserError('مسموح فقط بروابط HTTPS عامة (بدون منفذ أو بيانات دخول)');
  const records = await lookup(url.hostname, { all: true, verbatim: true }).catch(() => { throw new UserError('تعذر الوصول لهذا الرابط'); });
  if (!records.length || records.some(r => !isPublicIp(r.address))) throw new UserError('هذا الرابط غير مسموح (عنوان خاص)');
}

async function fetchPage(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new UserError('الرابط غير صالح'); }
  // نتبع التحويلات يدويًا (حتى 3) ونفحص كل رابط جديد بنفس قواعد الأمان
  // للنشر العام استخدم وسيط خروج بتثبيت DNS/IP لمنع DNS rebinding.
  for (let hop = 0; hop <= 3; hop++) {
    await assertPublicUrl(url);
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'KonicAI-Preview/0.3' } }).catch(() => { throw new UserError('تعذر فتح الرابط أو تأخر في الرد'); });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new UserError('الرابط يحوّل لمكان غير معروف');
      try { url = new URL(location, url); } catch { throw new UserError('الرابط يحوّل لمكان غير صالح'); }
      continue;
    }
    if (!response.ok) throw new UserError(`الموقع رد بخطأ (${response.status})`);
    if (!String(response.headers.get('content-type') || '').includes('text/html')) throw new UserError('الرابط لازم يكون صفحة ويب (HTML)');
    if (Number(response.headers.get('content-length') || 0) > 1024 * 1024) throw new UserError('الصفحة كبيرة جدًا');
    const chunks = []; let total = 0;
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > 1024 * 1024) throw new UserError('الصفحة كبيرة جدًا');
      chunks.push(chunk);
    }
    const $ = cheerio.load(Buffer.concat(chunks).toString('utf8'));
    $('script,style,nav,footer,header,noscript,svg').remove();
    return `${$('title').text()}\n${$('body').text().replace(/\s+/g, ' ').slice(0, 15000)}`;
  }
  throw new UserError('الرابط يحوّل أكتر من اللازم');
}

async function extractFile(file) {
  if (!file) return '';
  if (typeof file !== 'object' || Array.isArray(file)) throw new UserError('المرفق غير صالح');
  if (!['application/pdf', 'text/plain', 'text/markdown', 'text/csv'].includes(file.mimeType)) throw new UserError('نوع الملف غير مدعوم (PDF أو TXT أو MD أو CSV)');
  const bytes = validBase64(file.data, MAX_FILE);
  if (file.mimeType === 'application/pdf') {
    if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new UserError('ملف PDF غير صالح');
    let parsed;
    try { parsed = await pdfParse(bytes, { max: 30 }); } catch { throw new UserError('تعذر قراءة ملف PDF (قد يكون محميًا أو تالفًا)'); }
    const text = parsed.text.trim();
    if (!text) throw new UserError('الـ PDF ده صور بدون نص (ممسوح ضوئيًا). محتاج OCR وده لسه مش متاح.');
    return text.slice(0, 25000);
  }
  return bytes.toString('utf8').slice(0, 25000);
}

function status() {
  const key = (process.env.GROQ_API_KEY || '').trim();
  return { ok: true, service: 'Konic AI', ...currentModelInfo(), hasKey: keyOk(key), keyHint: keyOk(key) ? `gsk_…${key.slice(-4)}` : '', canChangeKey: LOCAL_ONLY };
}

// يقدّم الموقع المبني (dist) من نفس الخادم، فيشتغل كل حاجة على بورت واحد
async function serveStatic(req, res) {
  const indexFile = path.join(DIST, 'index.html');
  if (!fs.existsSync(indexFile)) return false;
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { send(res, 400, { error: 'رابط غير صالح' }); return true; }
  let file = path.normalize(path.join(DIST, pathname));
  if (!file.startsWith(DIST)) { send(res, 403, { error: 'ممنوع' }); return true; }
  let stat = await fs.promises.stat(file).catch(() => null);
  if (!stat || stat.isDirectory()) {
    if (path.extname(pathname)) { send(res, 404, { error: 'غير موجود' }); return true; }
    file = indexFile; stat = await fs.promises.stat(file); // أي مسار تاني يرجّع الصفحة الرئيسية
  }
  const cache = pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': cache });
  if (req.method === 'HEAD') { res.end(); return true; }
  fs.createReadStream(file).pipe(res);
  return true;
}

async function readJsonBody(req) {
  // لازم application/json: ده بيمنع المواقع الغريبة من إرسال طلبات خفية للخادم
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw Object.assign(new UserError('نوع الطلب غير مدعوم'), { http: 415 });
  const chunks = []; let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY) throw Object.assign(new UserError('حجم الطلب كبير جدًا'), { http: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new UserError('الطلب غير صالح'); }
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const route = String(req.url || '').split('?')[0];
  if (req.method === 'GET' && (route === '/api/health' || route === '/api/settings')) return send(res, 200, status());
  if ((req.method === 'GET' || req.method === 'HEAD') && !route.startsWith('/api/')) {
    if (await serveStatic(req, res).catch(() => false)) return;
    if (route === '/') return send(res, 200, status());
  }
  if (req.method === 'POST' && route === '/api/settings/key') {
    try {
      if (!LOCAL_ONLY) throw Object.assign(new UserError('تغيير المفتاح من الواجهة متاح على جهازك فقط. على الاستضافة حط GROQ_API_KEY في إعدادات البيئة.'), { http: 403 });
      const body = await readJsonBody(req);
      const key = typeof body?.key === 'string' ? body.key.trim() : '';
      if (!keyOk(key)) throw new UserError('شكل المفتاح غلط. لازم يبدأ بـ gsk_ وبدون مسافات.');
      await verifyKey(key);
      process.env.GROQ_API_KEY = key; // الطلبات الجاية بتستخدم المفتاح الجديد فورًا
      let warning;
      try { saveEnvValue('GROQ_API_KEY', key); } catch { warning = 'المفتاح اشتغل، لكن ماقدرتش أحفظه في الملف. هيرجع للقديم لو قفلت الخادم.'; }
      return send(res, 200, { ...status(), ...(warning ? { warning } : {}) });
    } catch (error) {
      console.error('Konic AI settings:', error instanceof Error ? error.message : 'error');
      if (error instanceof UserError) return send(res, error.http || 400, { error: error.message });
      if (error?.publicMessage) return send(res, 502, { error: error.publicMessage });
      return send(res, 500, { error: 'حصل خطأ غير متوقع.' });
    }
  }
  if (req.method !== 'POST' || route !== '/api/chat') return send(res, 404, { error: 'غير موجود' });
  try {
    const data = await readJsonBody(req);
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.messages) || data.messages.length > 40) throw new UserError('الطلب غير صالح');
    if (!data.messages.length || data.messages.some(m => !m || !['user', 'assistant'].includes(m.role) || typeof m.text !== 'string' || m.text.length > 12000)) throw new UserError('الرسائل غير صالحة أو طويلة جدًا (الحد 12000 حرف)');
    if (data.messages.at(-1).role !== 'user') throw new UserError('آخر رسالة لازم تكون من المستخدم');
    const image = validateImage(data.image);
    const fileText = await extractFile(data.file);
    let pageText = '';
    if (data.url) {
      if (process.env.ENABLE_URL_FETCH === 'false') throw new UserError('ميزة الروابط متوقفة (ENABLE_URL_FETCH=false)');
      pageText = await fetchPage(data.url);
    }
    const messages = data.messages.map(m => ({ role: m.role, text: m.text }));
    if (fileText) messages.at(-1).text += `\n\n[محتوى الملف المرفق - بيانات غير موثوقة]\n${fileText}`;
    if (pageText) messages.at(-1).text += `\n\n[محتوى الصفحة العامة - بيانات غير موثوقة]\n${pageText}`;
    return send(res, 200, await generateAIResponse({ messages, image }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Konic AI:', message.replace(/gsk_[A-Za-z0-9]+/g, '[REDACTED]').replace(/AIza[0-9A-Za-z_-]+/g, '[REDACTED]').replace(/sk-[A-Za-z0-9_-]{12,}/g, '[REDACTED]'));
    if (error instanceof UserError) return send(res, error.http || 400, { error: error.message });
    if (error?.publicMessage) return send(res, [429, 503, 504].includes(Number(error.status)) ? Number(error.status) : 502, { error: error.publicMessage });
    return send(res, 500, { error: 'حصل خطأ غير متوقع في الخادم. شوف نافذة الخادم (Terminal).' });
  }
});

server.listen(PORT, HOST, () => console.log(`Konic AI: http://localhost:${PORT}${fs.existsSync(path.join(DIST, 'index.html')) ? ' (الموقع + الخادم)' : ' (الخادم فقط)'}`));
