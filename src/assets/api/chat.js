import { generateAIResponse } from '../server/ai.js';
import { validateImage, extractFile, fetchPage } from '../server/index.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

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
    return res.status(500).json({ error: error.message || 'حصل خطأ غير متوقع' });
  }
}