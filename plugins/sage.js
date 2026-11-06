const { bot } = require('../lib')
const { CronJob } = require('cron')
const { loadMemory, saveMemory, daysUntil, buildReminder } = require('../lib/sage')

const GEMINI_MODEL = process.env.SAGE_GEMINI_MODEL || 'gemini-3.5-flash'

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
    const apiKey = ctx.GEMINI_API_KEY || process.env.SAGE_GEMINI_API_KEY
    if (!apiKey) return message.send('*Sage:* Set GEMINI_API_KEY or SAGE_GEMINI_API_KEY env var.')
    if (!match) return message.send('*Sage:* Tell me something or ask me anything.')

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

Always respond with this JSON structure:
{
  "reply": "<your WhatsApp-formatted response, use *bold* for emphasis>",
  "save": null | { "name": "<event name>", "deadline": "<YYYY-MM-DD>", "details": "<optional extra info>" }
}
If saving, also include the save confirmation in reply.`

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: match }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    )

    const data = await res.json()
    if (data.error) return message.send(`*Sage error:* ${data.error.message}`)

    let parsed
    try {
      const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '{}'
      parsed = JSON.parse(raw)
    } catch {
      const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || 'No response.'
      return message.send(raw, { quoted: message.data })
    }

    if (parsed.save) {
      const existing = mem.hackathons.findIndex((h) => h.name.toLowerCase() === parsed.save.name.toLowerCase())
      if (existing >= 0) {
        mem.hackathons[existing] = { ...mem.hackathons[existing], ...parsed.save }
      } else {
        mem.hackathons.push(parsed.save)
      }
      saveMemory(mem)
    }

    await message.send(parsed.reply || 'Done.', { quoted: message.data })
  }
)
