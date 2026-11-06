const { bot } = require('../lib')
const fs = require('fs')

const MEMORY_FILE = '/tmp/sage_memory.json'
const GEMINI_MODEL = process.env.SAGE_GEMINI_MODEL || 'gemini-3.5-flash'

function loadMemory() {
  try {
    return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'))
  } catch {
    return { hackathons: [], notes: [] }
  }
}

function saveMemory(mem) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(mem, null, 2))
}

function daysUntil(dateStr) {
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  return Math.ceil((d - Date.now()) / 86400000)
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
