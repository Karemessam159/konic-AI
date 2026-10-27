// قراءة وكتابة ملف server/.env بدون أي مكتبات إضافية
import fs from 'node:fs';

export const ENV_PATH = new URL('./.env', import.meta.url);

// يقرأ .env ويضيف القيم لـ process.env (من غير ما يلغي متغيرات موجودة أصلًا، زي أسرار الاستضافة)
export function loadEnv() {
  let text = '';
  try { text = fs.readFileSync(ENV_PATH, 'utf8'); } catch { return; }
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const name = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(name in process.env)) process.env[name] = value;
  }
}

// يبدّل قيمة موجودة أو يضيفها، ويحافظ على باقي الأسطر
export function saveEnvValue(name, value) {
  let text = '';
  try { text = fs.readFileSync(ENV_PATH, 'utf8'); } catch { /* ملف جديد */ }
  const line = `${name}=${value}`;
  const re = new RegExp(`^[ \\t]*${name}[ \\t]*=.*$`, 'm'); // مسافات/تاب فقط (مش \\s) عشان ما نبلعش نهاية السطر
  if (re.test(text)) text = text.replace(re, line);
  else text = (text && !text.endsWith('\n') ? text + '\n' : text) + line + '\n';
  fs.writeFileSync(ENV_PATH, text, { mode: 0o600 });
}
