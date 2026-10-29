import { generateAIResponse } from '../server/ai.js';
import { validateImage, extractFile, fetchPage, UserError } from '../server/index.js'; // أو استدعاء الدوال الحالية

export default async function handler(req, res) {
  // إضافة إعدادات الـ CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url, method } = req;

  // Route: Health/Settings Check
  if (method === 'GET' && (url.includes('/health') || url.includes('/settings'))) {
    const key = (process.env.GROQ_API_KEY || '').trim();
    return res.status(200).json({
      ok: true,
      service: 'Konic AI',
      hasKey: /^gsk_\S{16,}$/.test(key),
      canChangeKey: false
    });
  }

  // Route: Chat Execution
  if (method === 'POST' && url.includes('/chat')) {
    try {
      const data = req.body;
      if (!data || !Array.isArray(data.messages)) {
        return res.status(400).json({ error: 'الطلب غير صالح' });
      }

      const image = validateImage(data.image);
      const fileText = await extractFile(data.file);
      let pageText = '';
      if (data.url && process.env.ENABLE_URL_FETCH !== 'false') {
        pageText = await fetchPage(data.url);
      }

      const messages = data.messages.map(m => ({ role: m.role, text: m.text }));
      if (fileText) messages.at(-1).text += `\n\n[محتوى الملف المرفق]\n${fileText}`;
      if (pageText) messages.at(-1).text += `\n\n[محتوى الصفحة العامة]\n${pageText}`;

      const response = await generateAIResponse({ messages, image });
      return res.status(200).json(response);
    } catch (error) {
      return res.status(500).json({ error: error.message || 'حصل خطأ في الخادم' });
    }
  }

  return res.status(404).json({ error: 'غير موجود' });
}