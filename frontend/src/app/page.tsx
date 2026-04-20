'use client'

import { useState, useRef, useEffect } from 'react'

type Mode = 'auto' | 'chat' | 'json'

interface Message {
  role: 'user' | 'assistant' | 'error'
  content: string
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<Mode>('auto')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return

    const userMessage: Message = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const body: { message: string; mode?: 'chat' | 'json' } = { message: text }
      if (mode !== 'auto') body.mode = mode

      const res = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}: ${res.statusText}`)
      }

      const data = await res.json()
      const reply = data.reply ?? data.response ?? data.content ?? data.message ?? ''
      const modeUsed = data.mode_used ?? 'chat'

      // For JSON mode, display the structured output formatted
      let content: string
      if (modeUsed === 'json') {
        try {
          const parsed = JSON.parse(reply)
          content = JSON.stringify(parsed, null, 2)
        } catch {
          content = reply
        }
      } else {
        content = reply
      }

      setMessages((prev) => [...prev, { role: 'assistant', content }])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.'
      setMessages((prev) => [...prev, { role: 'error', content: msg }])
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

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex-shrink-0">
        <h1 className="text-xl font-semibold tracking-tight text-white">Cortex Studio</h1>
        <p className="text-sm text-gray-400 mt-0.5">AI-powered chat platform</p>
      </header>

      {/* Chat history */}
      <main className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 text-sm">Send a message to get started.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-2xl w-full rounded-lg px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white ml-12'
                  : msg.role === 'error'
                  ? 'bg-red-900/60 border border-red-700 text-red-300 mr-12'
                  : 'bg-gray-800 text-gray-100 mr-12'
              }`}
            >
              <p className="text-xs font-medium mb-1 opacity-60">
                {msg.role === 'user' ? 'You' : msg.role === 'error' ? 'Error' : 'Cortex'}
              </p>
              <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed">
                {msg.content}
              </pre>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-lg px-4 py-3 text-sm text-gray-400 mr-12">
              <p className="text-xs font-medium mb-1 opacity-60">Cortex</p>
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Input area */}
      <footer className="border-t border-gray-800 px-4 py-4 flex-shrink-0">
        <div className="max-w-4xl mx-auto flex gap-3 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
            rows={3}
            disabled={loading}
            className="flex-1 resize-none rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
          />

          <div className="flex flex-col gap-2">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
              disabled={loading}
              className="rounded-lg bg-gray-800 border border-gray-700 text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <option value="auto">Auto</option>
              <option value="chat">Chat</option>
              <option value="json">JSON</option>
            </select>

            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-5 py-2 text-sm transition-colors"
            >
              {loading ? 'Thinking…' : 'Send'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}
