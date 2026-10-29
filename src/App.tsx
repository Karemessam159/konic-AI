import { useEffect, useRef, useState } from 'react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import Chat from './Chat'
import Settings from './Settings'
import type { ServerStatus } from './Settings'
import { API } from './api'
import './App.css'
export type ChatMessage = { role: 'user' | 'assistant'; text: string; imagePreview?: string }
export type Conversation = { id: string; title: string; messages: ChatMessage[]; updated: number }
const KEY = 'konic-ai-conversations-v2'
const makeConversation = (): Conversation => ({ id: crypto.randomUUID(), title: 'محادثة جديدة', messages: [], updated: Date.now() })
function initial(): Conversation[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (Array.isArray(saved) && saved.length && saved.every(c => typeof c.id === 'string' && Array.isArray(c.messages))) return saved
  } catch { /* ignore */ }
  return [makeConversation()]
}
export default function App() {
  const [chats, setChats] = useState<Conversation[]>(initial)
  const [activeId, setActiveId] = useState(() => chats[0].id)
  const [storageWarning, setStorageWarning] = useState(false)
  const [server, setServer] = useState<ServerStatus>({ online: false })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const askedForKey = useRef(false)
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(chats)); setStorageWarning(false) }
    catch { setStorageWarning(true) }
  }, [chats])
  useEffect(() => {
    let alive = true
    const check = () => fetch(`${API}/api/health`).then(r => r.json()).then(d => { if (alive) setServer({ online: true, model: d.model, hasKey: d.hasKey, keyHint: d.keyHint, canChangeKey: d.canChangeKey }) }).catch(() => { if (alive) setServer({ online: false }) })
    check()
    const timer = setInterval(check, 15000)
    return () => { alive = false; clearInterval(timer) }
  }, [])
  // أول مرة وماف مفتاح: افتح شاشة الإعدادات لوحدها (مرة واحدة)
  useEffect(() => {
    if (server.online && server.hasKey === false && server.canChangeKey && !askedForKey.current) { askedForKey.current = true; setSettingsOpen(true) }
  }, [server])
  const active = chats.find(c => c.id === activeId) || chats[0]
  function newChat() {
    const chat = makeConversation()
    setChats(previous => [chat, ...previous]); setActiveId(chat.id)
  }
  function updateMessages(messages: ChatMessage[]) {
    setChats(previous => previous.map(c => c.id === activeId ? {
      ...c, messages, updated: Date.now(),
      title: c.title === 'محادثة جديدة' ? (messages.find(m => m.role === 'user')?.text.slice(0, 36) || c.title) : c.title,
    } : c))
  }
  function deleteChat(id: string) {
    if (!window.confirm('حذف المحادثة؟')) return
    const remaining = chats.filter(c => c.id !== id)
    if (!remaining.length) { const c = makeConversation(); setChats([c]); setActiveId(c.id); return }
    setChats(remaining)
    if (id === activeId) setActiveId(remaining[0].id)
  }
  return <>
    <SpeedInsights />
    <div className="app" dir="rtl">
    <aside className="sidebar">
      <div className="brand"><h1><span className="brand-icon">✦</span> Konic</h1><p className="subtitle">مساعدك الذكي لكل شيء</p></div>
      <button className="new-chat-button" onClick={newChat}>＋ محادثة جديدة</button>
      <div className="sidebar-label">المحادثات</div>
      <nav className="chat-list">{chats.map(c => <div key={c.id} className={'history-item ' + (c.id === activeId ? 'selected' : '')}>
        <button onClick={() => setActiveId(c.id)} title={c.title}>{c.title}</button>
        <button className="delete-chat" onClick={() => deleteChat(c.id)} title="حذف">×</button>
      </div>)}</nav>
      <button className="settings-button" onClick={() => setSettingsOpen(true)}>⚙️ الإعدادات</button>
      <div className="sidebar-footer">Konic AI Web v0.3.3 — نسخة تجريبية</div>
    </aside>
    <main className="main"><header className="topbar"><span className="topbar-title">✦ Konic Intelligence</span><span className="provider-label">{!server.online ? '🔴 الخادم غير متصل' : server.hasKey ? `🟢 ${server.model || 'Groq'}` : '🟡 محتاج مفتاح'}</span></header>
      <section className="content">{storageWarning && <p className="warning">مساحة المتصفح ممتلئة؛ قد لا تُحفظ المحادثة. احذف الصور الكبيرة من السجل.</p>}
      <Chat key={active.id} messages={active.messages} onMessagesChange={updateMessages} /></section>
    </main>
    <Settings open={settingsOpen} status={server} onClose={() => setSettingsOpen(false)} onSaved={setServer} />
    </div>
  </>
}
