// ربط الواجهة مباشرة بسيرفر Groq الرسمي بدلاً من المسار المحلي
export const API: string = import.meta.env.VITE_API_URL || 'https://api.groq.com/openai/v1';