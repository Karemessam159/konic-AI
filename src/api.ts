// مسار الخادم. فاضي = نفس العنوان (الأفضل: يشتغل محليًا وعلى GitHub Codespaces وعلى الاستضافة).
// لو الخادم على عنوان تاني (مثلًا لتطبيق الموبايل) اعمل ملف .env.local فيه VITE_API_URL=https://عنوانك
export const API: string = import.meta.env.VITE_API_URL || ''
