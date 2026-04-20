'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

/* ── Types ──────────────────────────────────────────────────────────────── */

type Mode = 'auto' | 'chat' | 'json'
type SchemaUsed = 'summarize' | 'sentiment' | 'entities' | null

interface Message {
  role: 'user' | 'assistant' | 'error'
  content: string
  modeUsed?: 'chat' | 'json'
  schemaUsed?: SchemaUsed
  streaming?: boolean
  timestamp: number
}

/* ── Constants ──────────────────────────────────────────────────────────── */

const API_URL    = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const STORAGE_KEY = 'cortex-messages-v2'

const SCHEMA_LABELS: Record<NonNullable<SchemaUsed>, string> = {
  summarize: 'Summary',
  sentiment: 'Sentiment',
  entities:  'Entities',
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/* ── Inline SVG icons (zero dependencies) ────────────────────────────── */

function UserIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4.42 0-8 1.79-8 4v1h16v-1c0-2.21-3.58-4-8-4z" />
    </svg>
  )
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2l1.8 5.5H19l-4.6 3.4 1.8 5.5L12 13l-4.2 3.4 1.8-5.5L5 7.5h5.2z" />
    </svg>
  )
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  )
}

/* ── Empty state illustration ─────────────────────────────────────────── */

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 select-none">
      {/* Glowing orb */}
      <div className="relative">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{
            background: 'radial-gradient(circle, rgba(99,102,241,0.3) 0%, rgba(99,102,241,0.05) 70%)',
            boxShadow: '0 0 40px rgba(99,102,241,0.25)',
          }}
        >
          <SparkleIcon className="w-7 h-7 text-indigo-400" />
        </div>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
            animation: 'pulse 3s ease-in-out infinite',
          }}
        />
      </div>

      <div className="text-center">
        <h2 className="text-gray-300 font-semibold text-lg tracking-tight">
          Start a conversation
        </h2>
        <p className="text-gray-600 text-sm mt-1 max-w-xs">
          Ask anything in Chat mode, or get structured data with JSON mode — the
          router picks the right schema automatically.
        </p>
      </div>

      {/* Mode hints */}
      <div className="flex gap-3">
        {[
          { label: 'Chat', hint: 'Conversational AI', color: 'from-indigo-500/20 to-violet-500/20 border-indigo-500/30 text-indigo-300' },
          { label: 'Summary', hint: '"Summarize AI…"', color: 'from-emerald-500/10 to-teal-500/10 border-emerald-500/25 text-emerald-300' },
          { label: 'Sentiment', hint: '"What\'s the tone?"', color: 'from-amber-500/10 to-orange-500/10 border-amber-500/25 text-amber-300' },
          { label: 'Entities', hint: '"Who is mentioned?"', color: 'from-pink-500/10 to-rose-500/10 border-pink-500/25 text-pink-300' },
        ].map(({ label, hint, color }) => (
          <div
            key={label}
            className={`bg-gradient-to-b ${color} border rounded-xl px-3 py-2.5 text-center hidden sm:block`}
          >
            <p className="text-xs font-semibold">{label}</p>
            <p className="text-[10px] opacity-60 mt-0.5 whitespace-nowrap">{hint}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Schema badge ──────────────────────────────────────────────────────── */

const SCHEMA_STYLES: Record<NonNullable<SchemaUsed>, string> = {
  summarize: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
  sentiment: 'bg-amber-500/15 text-amber-300 border border-amber-500/25',
  entities:  'bg-pink-500/15 text-pink-300 border border-pink-500/25',
}

function SchemaBadge({ schema }: { schema: SchemaUsed }) {
  if (!schema) return null
  return (
    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${SCHEMA_STYLES[schema]}`}>
      {SCHEMA_LABELS[schema]}
    </span>
  )
}

/* ── Main component ──────────────────────────────────────────────────────── */

export default function Home() {
  const [messages, setMessages]         = useState<Message[]>([])
  const [input, setInput]               = useState('')
  const [mode, setMode]                 = useState<Mode>('auto')
  const [loading, setLoading]           = useState(false)
  const [copiedIndex, setCopiedIndex]   = useState<number | null>(null)
  const bottomRef                       = useRef<HTMLDivElement>(null)
  const hasMounted                      = useRef(false)
  const textareaRef                     = useRef<HTMLTextAreaElement>(null)

  /* ── Restore from localStorage ────────────────────────────────────────── */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed: Message[] = JSON.parse(stored)
        setMessages(parsed.map((m) => ({ ...m, streaming: false })))
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
    hasMounted.current = true
  }, [])

  /* ── Persist to localStorage ──────────────────────────────────────────── */
  useEffect(() => {
    if (!hasMounted.current) return
    const stable = messages.filter((m) => !m.streaming)
    if (stable.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stable))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [messages])

  /* ── Auto-scroll ──────────────────────────────────────────────────────── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /* ── Auto-resize textarea ─────────────────────────────────────────────── */
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [input])

  /* ── Copy to clipboard ────────────────────────────────────────────────── */
  const copyMessage = useCallback((content: string, index: number) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    })
  }, [])

  /* ── Clear chat ───────────────────────────────────────────────────────── */
  function clearChat() {
    setMessages([])
    localStorage.removeItem(STORAGE_KEY)
  }

  /* ── Send message ─────────────────────────────────────────────────────── */
  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return

    const history = messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && !m.streaming)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    setMessages((prev) => [
      ...prev,
      { role: 'user',      content: text, timestamp: Date.now() },
      { role: 'assistant', content: '',   timestamp: Date.now(), streaming: true },
    ])
    setInput('')
    setLoading(true)

    try {
      const body: { message: string; mode?: 'chat' | 'json'; history: typeof history } = {
        message: text,
        history,
      }
      if (mode !== 'auto') body.mode = mode

      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok || !res.body) throw new Error(`Server returned ${res.status}: ${res.statusText}`)

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer             = ''
      let accumulatedContent = ''
      let modeUsed: 'chat' | 'json' = 'chat'
      let schemaUsed: SchemaUsed    = null

      const updateAssistant = (content: string, done = false) => {
        setMessages((prev) => {
          const updated = [...prev]
          const idx = updated.findLastIndex((m) => m.role === 'assistant' && m.streaming)
          if (idx !== -1) {
            updated[idx] = { role: 'assistant', content, modeUsed, schemaUsed, streaming: !done, timestamp: updated[idx].timestamp }
          }
          return updated
        })
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const rawData = line.slice(6).trim()
          try {
            const event = JSON.parse(rawData)

            if (event.type === 'meta') {
              modeUsed   = event.mode_used   ?? 'chat'
              schemaUsed = event.schema_used ?? null
            } else if (event.type === 'token') {
              accumulatedContent += event.content
              updateAssistant(accumulatedContent)
            } else if (event.type === 'done') {
              updateAssistant(accumulatedContent, true)
            } else if (event.type === 'error') {
              setMessages((prev) => {
                const updated = [...prev]
                const idx = updated.findLastIndex((m) => m.role === 'assistant' && m.streaming)
                if (idx !== -1) updated[idx] = { role: 'error', content: event.detail, timestamp: Date.now() }
                return updated
              })
            }
          } catch { /* malformed chunk — skip */ }
        }
      }

      // Safety: clear any leftover streaming flags
      setMessages((prev) => prev.map((m) => m.streaming ? { ...m, streaming: false } : m))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.'
      setMessages((prev) => {
        const updated = [...prev]
        const idx = updated.findLastIndex((m) => m.role === 'assistant' && m.streaming)
        if (idx !== -1) updated[idx] = { role: 'error', content: msg, timestamp: Date.now() }
        else             updated.push({ role: 'error', content: msg, timestamp: Date.now() })
        return updated
      })
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  /* ── Render ───────────────────────────────────────────────────────────── */

  const isJson = (msg: Message) => msg.modeUsed === 'json'

  return (
    <div
      className="flex flex-col h-screen text-gray-100 overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 90% 55% at 50% -5%, rgba(99,102,241,0.14) 0%, #07070e 58%)' }}
    >
      {/* ──────────────────────────────── Header ──────────────────────────── */}
      <header
        className="flex-shrink-0 flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)', boxShadow: '0 0 16px rgba(99,102,241,0.4)' }}
          >
            <SparkleIcon className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white leading-none tracking-tight">
              Cortex Studio
            </h1>
            <p className="text-[11px] text-gray-500 mt-0.5">AI-powered chat platform</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors duration-200"
              title="Clear chat"
            >
              <TrashIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
          <a
            href={`${API_URL}/docs`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-gray-600 hover:text-indigo-400 transition-colors duration-200 border rounded px-2 py-1 hidden sm:block"
            style={{ borderColor: 'rgba(255,255,255,0.08)' }}
          >
            API Docs
          </a>
        </div>
      </header>

      {/* ──────────────────────────────── Chat ────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg, i) => {
              const isUser  = msg.role === 'user'
              const isError = msg.role === 'error'
              const isAI    = msg.role === 'assistant'

              return (
                <div
                  key={msg.timestamp + i}
                  className={`flex gap-3 message-enter ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {/* Avatar */}
                  <div className="flex-shrink-0 mt-0.5">
                    {isUser ? (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #6366f1, #7c3aed)' }}
                      >
                        <UserIcon className="w-3.5 h-3.5 text-white" />
                      </div>
                    ) : (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{
                          background: isError
                            ? 'rgba(239,68,68,0.15)'
                            : 'rgba(99,102,241,0.12)',
                          border: `1px solid ${isError ? 'rgba(239,68,68,0.25)' : 'rgba(99,102,241,0.2)'}`,
                        }}
                      >
                        <SparkleIcon className={`w-3.5 h-3.5 ${isError ? 'text-red-400' : 'text-indigo-400'}`} />
                      </div>
                    )}
                  </div>

                  {/* Bubble */}
                  <div className={`flex flex-col gap-1 min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
                    {/* Label row */}
                    <div className={`flex items-center gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
                      <span className="text-[11px] font-medium text-gray-500">
                        {isUser ? 'You' : isError ? 'Error' : 'Cortex'}
                      </span>
                      {isAI && msg.modeUsed === 'json' && (
                        <SchemaBadge schema={msg.schemaUsed ?? 'summarize'} />
                      )}
                      {isAI && msg.modeUsed === 'chat' && !msg.streaming && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          Chat
                        </span>
                      )}
                      <span className="text-[10px] text-gray-700">
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>

                    {/* Content bubble */}
                    <div
                      className={`relative group rounded-2xl px-4 py-3 text-sm max-w-xl ${
                        isUser
                          ? 'rounded-tr-sm text-white'
                          : isError
                          ? 'rounded-tl-sm'
                          : 'rounded-tl-sm'
                      }`}
                      style={
                        isUser
                          ? { background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 4px 24px rgba(99,102,241,0.25)' }
                          : isError
                          ? { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }
                          : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(8px)' }
                      }
                    >
                      {/* Message text */}
                      <pre
                        className={`whitespace-pre-wrap break-words leading-relaxed text-sm ${
                          isError
                            ? 'text-red-300'
                            : isUser
                            ? 'text-white'
                            : 'text-gray-200'
                        } ${isJson(msg) ? 'font-mono-custom text-xs' : 'font-sans'}`}
                      >
                        {msg.content}
                        {msg.streaming && (
                          <span
                            className="cursor-pulse inline-block w-0.5 h-4 bg-indigo-400 ml-0.5 align-middle rounded"
                          />
                        )}
                      </pre>

                      {/* Copy button */}
                      {!msg.streaming && msg.content && (
                        <button
                          onClick={() => copyMessage(msg.content, i)}
                          aria-label="Copy message"
                          className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1.5 rounded-lg"
                          style={{ background: 'rgba(255,255,255,0.06)' }}
                        >
                          {copiedIndex === i ? (
                            <CheckIcon className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <CopyIcon className={`w-3 h-3 ${isUser ? 'text-white/60' : 'text-gray-500'}`} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      {/* ──────────────────────────────── Input ───────────────────────────── */}
      <div
        className="flex-shrink-0 px-4 pb-5 pt-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div
          className="max-w-3xl mx-auto rounded-2xl p-3"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything… Enter to send · Shift+Enter for new line"
            rows={1}
            disabled={loading}
            className="w-full resize-none bg-transparent text-gray-100 placeholder-gray-600 text-sm leading-relaxed focus:outline-none disabled:opacity-40"
            style={{ minHeight: '44px', maxHeight: '160px' }}
          />

          {/* Bottom bar */}
          <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {/* Mode selector */}
            <div className="flex items-center gap-1.5">
              {(['auto', 'chat', 'json'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  disabled={loading}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all duration-150 capitalize ${
                    mode === m
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/35'
                      : 'text-gray-600 hover:text-gray-400'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Send button */}
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="flex items-center gap-2 text-sm font-medium px-4 py-1.5 rounded-xl transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: loading || !input.trim()
                  ? 'rgba(99,102,241,0.15)'
                  : 'linear-gradient(135deg, #6366f1, #7c3aed)',
                boxShadow: loading || !input.trim() ? 'none' : '0 0 16px rgba(99,102,241,0.35)',
                color: '#fff',
              }}
            >
              {loading ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                </>
              ) : (
                <span>Send</span>
              )}
            </button>
          </div>
        </div>
        <p className="text-center text-[10px] text-gray-700 mt-2">
          Cortex Studio v0.4 · Powered by LM Studio
        </p>
      </div>
    </div>
  )
}
