# Konic AI

مساعد ذكي (موقع) مبني بـ React + Vite + Node.js، بيستخدم **Groq (GroqCloud)**.
A small AI chat web app (React + Vite + Node.js) powered by Groq.

دليل المبتدئين بالعربي: [README_AR.md](README_AR.md)

## تشغيل سريع
```bash
npm install
npm run dev:all        # الخادم (3001) + الموقع (5173) مع بعض
```
افتح http://localhost:5173 — أول مرة هيطلب مفتاح Groq من شاشة ⚙️ الإعدادات.
مفتاح من: https://console.groq.com/keys

على ويندوز: دبل كليك على `start.bat`.

## تشغيل من GitHub مباشرة (Codespaces)
Code ← Codespaces ← Create codespace. بيسطّب ويشغّل لوحده. المفتاح: من شاشة الإعدادات، أو أضفه كـ Codespaces secret باسم `GROQ_API_KEY`.

## نسخة إنتاج (بورت واحد)
```bash
npm run build
npm start              # الخادم بيقدّم الموقع المبني كمان على http://localhost:3001
```

## الإعدادات (server/.env أو متغيرات بيئة)
| المتغير | المعنى |
|---|---|
| `GROQ_API_KEY` | المفتاح (أو من شاشة الإعدادات) |
| `GROQ_MODEL` | نموذج النص، الافتراضي `openai/gpt-oss-20b` |
| `GROQ_VISION_MODEL` | نموذج الصور |
| `ENABLE_URL_FETCH` | `false` لإيقاف قراءة الروابط |
| `PORT` / `HOST` | البورت (3001) / العنوان (`127.0.0.1`؛ على الاستضافة `0.0.0.0`) |
| `VITE_API_URL` | عنوان خادم تاني (لتطبيق موبايل مثلًا) |

## أمان — اقرأها قبل النشر العام
- **لا ترفع `server/.env` ولا أي مفتاح.** `.gitignore` بيمنعه، لكن الرفع من واجهة GitHub بالسحب والإفلات **بيتجاهل** `.gitignore`؛ استخدم GitHub Desktop أو git.
- على الاستضافة (`HOST=0.0.0.0`) تغيير المفتاح من الواجهة بيتقفل؛ حط المفتاح في إعدادات البيئة.
- الخادم حاليًا **من غير تسجيل دخول ولا حد استخدام**. أي حد يوصل لموقعك العام هيستهلك رصيد مفتاحك. أضف تسجيل دخول قبل نشره للناس.
