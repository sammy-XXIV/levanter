const { bot, lang } = require('../lib')

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest'
console.log(`[gemini.js] custom direct-API build loaded, model=${GEMINI_MODEL}`)

bot(
  {
    pattern: 'gemini ?(.*)',
    desc: lang.plugins.gemini.desc,
    type: 'ai',
  },
  async (message, match, ctx) => {
    if (!ctx.GEMINI_API_KEY) {
      return await message.send(lang.plugins.gemini.Key)
    }

    if (!match && !(message.reply_message && message.reply_message.image)) {
      return await message.send(lang.plugins.gemini.example)
    }

    const parts = [{ text: match || 'Describe this image.' }]

    if (message.reply_message && message.reply_message.image) {
      const buffer = await message.reply_message.downloadMediaMessage()
      parts.push({
        inlineData: {
          mimeType: message.reply_message.mimetype,
          data: buffer.toString('base64'),
        },
      })
    }

    const apiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${ctx.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] }),
      }
    )
    const data = await apiRes.json()

    if (data.error) {
      return await message.send(`Gemini error: ${data.error.message}`)
    }

    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || 'No response.'
    await message.send(text, { quoted: message.data })
  }
)
