// Konic AI v0.3.2 - Groq provider
// يرسل المحادثة إلى Groq ويرجع الرد النهائي فقط.

const TEXT_MODEL = () => process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const BASE_URL = () => process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
const VISION_MODEL = () => process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';

const SYSTEM = [
  'You are Konic AI, a helpful AI assistant.',
  'Reply in the same language as the user.',
  'For Arabic users, respond in clear natural Arabic (Egyptian dialect is fine if the user writes in it).',
  'Provide a direct final answer.',
  'Do not claim to be another company.'
].join(' ');

// خطأ برسالة عربية آمنة تظهر للمستخدم مباشرة
function publicError(message, status) {
  return Object.assign(new Error(message), { status, publicMessage: message });
}

function messageForStatus(status) {
  if (status === 401 || status === 403) return 'مفتاح Groq غير صالح أو منتهي. غيّر GROQ_API_KEY في ملف server/.env.';
  if (status === 404) return 'اسم النموذج غير موجود في Groq. راجع GROQ_MODEL في server/.env.';
  if (status === 413) return 'الطلب كبير على Groq. جرّب ملفًا أو صورة أصغر.';
  if (status === 429) return 'وصلت للحد المسموح في Groq (429). استنى دقيقة وجرّب تاني.';
  if (status >= 500) return 'خدمة Groq مشغولة حاليًا. جرّب بعد شوية.';
  return `Groq رفض الطلب (HTTP ${status}).`;
}

export function currentModelInfo() {
  return { model: TEXT_MODEL(), vision: Boolean(VISION_MODEL()) };
}

async function callGroq(body, key) {
  let response;
  try {
    response = await fetch(`${BASE_URL()}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000)
    });
  } catch (err) {
    console.error('Groq connection error:', err?.name, err?.message);
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw publicError('Groq تأخر في الرد (أكتر من 60 ثانية). جرّب تاني.', 504);
    }
    throw publicError('تعذر الاتصال بـ Groq. تأكد إن الإنترنت شغال.', 502);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Groq API error:', { status: response.status, code: payload?.error?.code, type: payload?.error?.type, message: payload?.error?.message, model: body.model });
    throw publicError(messageForStatus(response.status), response.status);
  }
  return payload;
}

export async function generateAIResponse({ messages, image = null }) {
  const key = (process.env.GROQ_API_KEY || '').trim();
  if (!key) throw publicError('GROQ_API_KEY ناقص. حطه في ملف server/.env ثم أعد تشغيل الخادم.', 503);

  const history = messages.slice(-16).map(m => ({ role: m.role, content: m.text }));

  // لو في صورة: نحول آخر رسالة لصيغة (نص + صورة) ونستخدم نموذج يفهم الصور
  if (image) {
    const last = history.at(-1);
    history[history.length - 1] = {
      role: 'user',
      content: [
        { type: 'text', text: last.content },
        { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } }
      ]
    };
  }

  const model = image ? VISION_MODEL() : TEXT_MODEL();
  const body = {
    model,
    messages: [{ role: 'system', content: SYSTEM }, ...history],
    max_completion_tokens: 4096,
    temperature: 0.7
  };
  // نماذج gpt-oss تستخدم include_reasoning (وليس reasoning_format) لإخفاء التفكير
  if (/gpt-oss/i.test(model)) { body.reasoning_effort = 'low'; body.include_reasoning = false; }

  const payload = await callGroq(body, key);
  const choice = payload?.choices?.[0];
  const reply = choice?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) {
    console.error('Groq empty final answer:', { finish_reason: choice?.finish_reason, model });
    throw publicError('النموذج لم يرجع إجابة. جرّب تكتب سؤالك بشكل مختلف.', 502);
  }
  return { reply: reply.trim(), provider: 'groq', model, fallback: false };
}

// يتأكد إن المفتاح شغال (بطلب خفيف لقائمة النماذج، بدون استهلاك توكنات)
export async function verifyKey(key) {
  let response;
  try {
    response = await fetch(`${BASE_URL()}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
  } catch {
    throw publicError('تعذر الاتصال بـ Groq للتأكد من المفتاح. تأكد من الإنترنت وجرّب تاني.', 502);
  }
  if (response.status === 401 || response.status === 403) throw publicError('المفتاح ده مش مقبول من Groq (غلط أو ملغي). اتأكد إنك نسخته كامل.', 401);
  if (!response.ok && response.status !== 429) throw publicError(messageForStatus(response.status), response.status);
  return true; // 429 معناها المفتاح سليم بس وصلت للحد مؤقتًا
}
