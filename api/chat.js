export default async function handler(req, res) {
  // إعدادات الـ CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'الطلب غير صالح' });
    }

    // تجهيز الرسائل للـ Groq API
    const formattedMessages = messages.map(m => ({
      role: m.role,
      content: m.text || m.content || ''
    }));

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GROQ_API_KEY غير معرف في Vercel' });
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: formattedMessages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'خطأ من Groq API' });
    }

    // ارجاع الرد بالصيغة اللي المنتظرها الكود عندك
    const aiText = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ text: aiText, choices: data.choices });

  } catch (error) {
    return res.status(500).json({ error: error.message || 'حصل خطأ في الخادم' });
  }
}