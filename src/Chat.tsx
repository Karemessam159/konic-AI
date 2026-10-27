import { memo, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { ChatMessage } from './App'
import { API } from './api'

type Attachment = { name: string; mimeType: string; data: string; preview?: string }
type SpeechResult = { 0: { transcript: string } }
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> }
type SpeechRecognitionInstance = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: SpeechEvent) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start(): void; stop(): void }
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionInstance; webkitSpeechRecognition?: new () => SpeechRecognitionInstance }
type ChatProps = { messages: ChatMessage[]; onMessagesChange: (messages: ChatMessage[]) => void }

const fileTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'text/markdown', 'text/csv']
const byExtension: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv' }
const MAX_FILE = 4 * 1024 * 1024
const MAX_IMAGE = 3 * 1024 * 1024

// ويندوز أحيانًا يرجّع نوع فاضي لملفات .md أو نوع غريب لـ .csv، فنعتمد على امتداد الملف
function detectType(file: File): string {
  if (fileTypes.includes(file.type)) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  return byExtension[ext] || file.type
}

function readFile(file: File, mimeType: string): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const data = result.split(',')[1]
      if (!data) return reject(new Error('تعذر قراءة الملف'))
      resolve({ name: file.name, mimeType, data, preview: mimeType.startsWith('image/') ? result : undefined })
    }
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'))
    reader.readAsDataURL(file)
  })
}

const MessageItem = memo(function MessageItem({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(message.text); setCopied(true); setTimeout(() => setCopied(false), 1500) }
    catch { /* المتصفح منع النسخ */ }
  }
  return (
    <div className={`chat-message ${message.role}`}>
      <strong>{message.role === 'user' ? 'أنت' : '✦ Konic AI'}</strong>
      <div className="message-content">
        {message.role === 'assistant' ? <ReactMarkdown>{message.text}</ReactMarkdown> : <p>{message.text}</p>}
      </div>
      <button className="copy-message" onClick={() => void copy()} title="نسخ">{copied ? 'تم ✓' : 'نسخ'}</button>
    </div>
  )
})

export default function Chat({ messages, onMessagesChange }: ChatProps) {
  const [input, setInput] = useState('')
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [notice, setNotice] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inFlight = useRef(false)

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [messages.length, loading])
  useEffect(() => () => { if (recognitionRef.current) { recognitionRef.current.onend = null; recognitionRef.current.stop() } }, [])

  async function chooseFile(file?: File) {
    if (!file) return
    const mimeType = detectType(file)
    if (!fileTypes.includes(mimeType)) return setNotice('النوع غير مدعوم: استخدم صورة أو PDF أو TXT أو MD أو CSV')
    const limit = mimeType.startsWith('image/') ? MAX_IMAGE : MAX_FILE
    if (file.size > limit) return setNotice(`الملف أكبر من ${limit / 1024 / 1024} ميجابايت`)
    try { setAttachment(await readFile(file, mimeType)); setNotice('') } catch { setNotice('تعذر قراءة الملف') }
  }

  function toggleMic() {
    if (listening) { recognitionRef.current?.stop(); return }
    const w = window as SpeechWindow
    const Constructor = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!Constructor) return setNotice('الميكروفون غير مدعوم في هذا المتصفح (جرّب Chrome أو Edge)')
    const r = new Constructor()
    r.lang = 'ar-EG'; r.continuous = false; r.interimResults = false
    r.onresult = e => {
      let text = ''
      for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript
      setInput(old => [old, text].filter(Boolean).join(' '))
    }
    r.onerror = () => { setNotice('راجع إذن الميكروفون'); setListening(false) }
    r.onend = () => { setListening(false); recognitionRef.current = null }
    try { recognitionRef.current = r; r.start(); setListening(true) } catch { setNotice('تعذر تشغيل الميكروفون') }
  }

  async function sendMessage() {
    if (inFlight.current || (!input.trim() && !attachment && !url.trim())) return
    inFlight.current = true
    const attachmentNow = attachment
    const urlNow = url.trim()
    const text = input.trim() || (attachmentNow ? `حلل الملف ${attachmentNow.name}` : 'لخص محتوى هذا الرابط')
    const userMessage: ChatMessage = {
      role: 'user',
      text: text + (attachmentNow ? `\n📎 ${attachmentNow.name}` : '') + (urlNow ? `\n🔗 ${urlNow}` : '')
    }
    const next = [...messages, userMessage]
    onMessagesChange(next)
    setInput(''); setAttachment(null); setUrl(''); setNotice(''); setLoading(true)
    try {
      const isImage = Boolean(attachmentNow?.mimeType.startsWith('image/'))
      const body = {
        // نرسل نص الرسالة فقط (بدون سطري 📎 و 🔗 الخاصين بالعرض)
        messages: [...messages.map(m => ({ role: m.role, text: m.text })), { role: 'user', text }],
        ...(attachmentNow && isImage ? { image: { mimeType: attachmentNow.mimeType, data: attachmentNow.data } } : {}),
        ...(attachmentNow && !isImage ? { file: { mimeType: attachmentNow.mimeType, data: attachmentNow.data } } : {}),
        ...(urlNow ? { url: urlNow } : {}),
      }
      const response = await fetch(`${API}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e.error || `خطأ من الخادم (HTTP ${response.status})`) }
      const data = await response.json()
      onMessagesChange([...next, { role: 'assistant', text: String(data.reply || 'لا يوجد رد') }])
    } catch (e) {
      const offline = e instanceof TypeError
      const reason = offline ? 'تعذر الاتصال بالخادم. تأكد إن الخادم شغال (شغّل start.bat) وحاول تاني.' : e instanceof Error ? e.message : 'خطأ غير معروف'
      onMessagesChange([...next, { role: 'assistant', text: `⚠️ ${reason}` }])
    } finally { inFlight.current = false; setLoading(false) }
  }

  return <div className="chat-container">
    <div className="chat-messages" aria-live="polite">
      {!messages.length && <div className="empty-chat"><div className="empty-symbol">✦</div><h2>مساء الإبداع مع Konic</h2><p>اسأل عن أي موضوع، أو ارفع صورة أو ملف، أو أضف رابط صفحة عامة.</p></div>}
      {messages.map((m, i) => <MessageItem key={i} message={m} />)}
      {loading && <div className="chat-message assistant">جاري التفكير...</div>}
      <div ref={endRef} />
    </div>
    {attachment && <div className="attachment-preview">📎 {attachment.name} {attachment.preview && <img src={attachment.preview} alt="معاينة الصورة" />}<button onClick={() => setAttachment(null)}>إزالة</button></div>}
    {url && <div className="attachment-preview">🔗 {url} <button onClick={() => setUrl('')}>إزالة</button></div>}
    {notice && <p role="status" className="warning">{notice}</p>}
    <form className="chat-form" onSubmit={e => { e.preventDefault(); void sendMessage() }}>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,.pdf,.txt,.md,.csv" style={{ display: 'none' }} onChange={e => { void chooseFile(e.target.files?.[0]); e.target.value = '' }} />
      <button type="button" title="رفع صورة أو ملف" onClick={() => fileRef.current?.click()} disabled={loading}>📎</button>
      <button type="button" title="رابط موقع" onClick={() => { const link = window.prompt('ألصق رابط صفحة HTTPS عامة'); if (link !== null) setUrl(link.trim()) }} disabled={loading}>🔗</button>
      <button type="button" title="الميكروفون" onClick={toggleMic}>{listening ? '⏹' : '🎤'}</button>
      <input aria-label="رسالتك" value={input} onChange={e => setInput(e.target.value)} placeholder="اكتب رسالتك إلى Konic AI..." />
      <button type="submit" disabled={loading || (!input.trim() && !attachment && !url.trim())}>{loading ? '...' : 'إرسال'}</button>
    </form>
    <p className="chat-note">المحادثات محفوظة على هذا المتصفح فقط. ملفات PDF المصورة قد تحتاج OCR لاحقًا.</p>
  </div>
}
