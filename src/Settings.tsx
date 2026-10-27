import { useState } from 'react'
import { API } from './api'

export type ServerStatus = { online: boolean; model?: string; hasKey?: boolean; keyHint?: string; canChangeKey?: boolean }
type Props = { open: boolean; status: ServerStatus; onClose: () => void; onSaved: (status: ServerStatus) => void }

export default function Settings({ open, status, onClose, onSaved }: Props) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  if (!open) return null

  async function save() {
    if (!key.trim() || busy) return
    setBusy(true); setMessage(null)
    try {
      const response = await fetch(`${API}/api/settings/key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key.trim() }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || `خطأ من الخادم (HTTP ${response.status})`)
      onSaved({ online: true, model: data.model, hasKey: data.hasKey, keyHint: data.keyHint, canChangeKey: data.canChangeKey })
      setKey('')
      setMessage({ ok: true, text: data.warning || 'تمام! المفتاح الجديد اشتغل وبدّل القديم. تقدر تبدأ تكتب.' })
    } catch (e) {
      const offline = e instanceof TypeError
      setMessage({ ok: false, text: offline ? 'تعذر الاتصال بالخادم. تأكد إن نافذة الخادم شغالة (start.bat).' : e instanceof Error ? e.message : 'خطأ غير معروف' })
    } finally { setBusy(false) }
  }

  return <div className="modal-overlay" onClick={onClose}>
    <div className="modal" role="dialog" aria-modal="true" aria-label="الإعدادات" onClick={e => e.stopPropagation()}>
      <h2>⚙️ الإعدادات</h2>
      <p className="modal-label">مفتاح Groq</p>
      <p className="modal-status">{status.hasKey ? `✅ المفتاح الحالي: ${status.keyHint}` : '⚠️ مفيش مفتاح متسجل لسه'}</p>
      {status.canChangeKey ? <>
        <p className="modal-help">حط مفتاح جديد هنا. بنتأكد إنه شغال، وبعدين بيبدّل القديم أوتوماتيك. المفتاح بيتحفظ على جهازك بس.</p>
        <input className="modal-input" type="password" dir="ltr" autoComplete="off" spellCheck={false} placeholder="gsk_..." value={key} onChange={e => setKey(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void save() }} />
        {message && <p className={message.ok ? 'modal-ok' : 'modal-error'} role="status">{message.text}</p>}
        <div className="modal-actions">
          <button className="primary" onClick={() => void save()} disabled={busy || !key.trim()}>{busy ? 'بنتأكد...' : 'حفظ المفتاح'}</button>
          <button onClick={onClose}>إغلاق</button>
        </div>
        <p className="modal-help">مفتاح جديد من: console.groq.com/keys</p>
      </> : <>
        <p className="modal-help">على الاستضافة المفتاح بيتحط من إعدادات البيئة (GROQ_API_KEY) مش من هنا.</p>
        <div className="modal-actions"><button onClick={onClose}>إغلاق</button></div>
      </>}
    </div>
  </div>
}
