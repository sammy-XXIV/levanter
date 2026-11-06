const { bot } = require('../lib')
const { CronJob } = require('cron')
const { loadMemory, saveMemory, daysUntil, buildReminder } = require('../lib/sage')

const GROQ_MODEL = process.env.SAGE_GROQ_MODEL || 'qwen/qwen3.8-27b'
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

async function fetchTweet(url) {
  const id = url.match(/status\/(\d+)/)?.[1] || (url.match(/^\d+$/) ? url : null)
  if (!id) return null
  const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')
  const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${token}&lang=en`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) return null
  const t = await res.json()
  if (!t || t.__typename === 'TweetTombstone') return null
  const text = t.note_tweet?.text || t.text || ''
  const author = t.user?.name ? `${t.user.name} (@${t.user.screen_name})` : ''
  return `Tweet by ${author}:\n${text}`
}

async function sendDailyReminder() {
  const text = buildReminder(loadMemory().hackathons)
  if (!text) return
  const res = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.API_KEY },
    body: JSON.stringify({ to: process.env.SAGE_REMIND_TO, type: 'text', text }),
  })
  if (!res.ok) throw new Error(`/api/send returned ${res.status}`)
}

if (process.env.API_KEY && process.env.SAGE_REMIND_TO) {
  new CronJob(
    process.env.SAGE_REMIND_CRON || '0 9 * * *',
    () => sendDailyReminder().catch((error) => console.error('[sage] reminder failed:', error.message)),
    null,
    true,
    process.env.TIMEZONE || 'Africa/Lagos'
  )
}

bot(
  {
    pattern: 'sage ?(.*)',
    desc: 'AI assistant with memory — save hackathons, ask anything',
    type: 'ai',
  },
  async (message, match, ctx) => {
    const apiKey = ctx.GROQ_API_KEY || process.env.SAGE_GROQ_API_KEY
    if (!apiKey) return message.send('*Sage:* Set GROQ_API_KEY or SAGE_GROQ_API_KEY env var.')
    if (!match) return message.send('*Sage:* Tell me something or ask me anything.')

    const tweetUrl = match.match(/https?:\/\/(twitter\.com|x\.com)\/\S+\/status\/\d+/)?.[0]
    let userMessage = match
    if (tweetUrl) {
      const tweetText = await fetchTweet(tweetUrl).catch(() => null)
      if (tweetText) userMessage = `${tweetText}\n\nUser question: ${match.replace(tweetUrl, '').trim() || 'Summarize this tweet.'}`
    }

    const mem = loadMemory()
    const today = new Date().toISOString().split('T')[0]

    const memContext = mem.hackathons.length
      ? mem.hackathons
          .map((h) => {
            const days = daysUntil(h.deadline)
            return `- ${h.name}: deadline ${h.deadline}${days !== null ? ` (${days >= 0 ? days + ' days left' : 'PASSED'})` : ''}${h.details ? ', ' + h.details : ''}`
          })
          .join('\n')
      : '(none saved yet)'

    const system = `You are Sage, a sharp personal assistant embedded in WhatsApp.
Today: ${today}
Saved hackathons:\n${memContext}

When the user wants to save a hackathon/deadline/event, extract the name and deadline date and return a JSON action block.
When the user asks about their hackathons or deadlines, summarize from the saved list above.
Otherwise just answer the question directly.

CRITICAL: Respond ONLY with raw JSON. No markdown, no explanation, no code blocks. Output must be parseable by JSON.parse().
Required structure:
{"reply":"<WhatsApp-formatted response, use *bold* for emphasis>","save":null}
OR when saving:
{"reply":"<confirmation message>","save":{"name":"<event name>","deadline":"<YYYY-MM-DD>","details":"<optional>"}}
The save field must be null or a valid object. Never omit either field.`

    const history = (mem.history || []).slice(-10)

    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: system },
          ...history,
          { role: 'user', content: userMessage },
        ],
      }),
    })

    const data = await res.json()
    if (data.error) {
      const raw = data.error?.failed_generation
      if (!raw) return message.send(`*Sage error:* ${data.error.message}`)
      try {
        const parsed2 = JSON.parse(raw)
        if (parsed2.reply) {
          await message.send(parsed2.reply, { quoted: message.data })
          return
        }
      } catch {}
      return message.send(raw, { quoted: message.data })
    }

    let parsed
    try {
      const raw = data.choices?.[0]?.message?.content || '{}'
      parsed = JSON.parse(raw)
    } catch {
      const raw = data.choices?.[0]?.message?.content || 'No response.'
      return message.send(raw, { quoted: message.data })
    }

    if (parsed.save) {
      const existing = mem.hackathons.findIndex((h) => h.name.toLowerCase() === parsed.save.name.toLowerCase())
      if (existing >= 0) {
        mem.hackathons[existing] = { ...mem.hackathons[existing], ...parsed.save }
      } else {
        mem.hackathons.push(parsed.save)
      }
    }

    if (!mem.history) mem.history = []
    mem.history.push({ role: 'user', content: userMessage })
    mem.history.push({ role: 'assistant', content: parsed.reply || 'Done.' })
    if (mem.history.length > 20) mem.history = mem.history.slice(-20)
    saveMemory(mem)

    await message.send(parsed.reply || 'Done.', { quoted: message.data })
  }
)
