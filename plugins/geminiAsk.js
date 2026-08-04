const { bot } = require('../lib')

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest'

bot(
  {
    pattern: 'ask ?(.*)',
    desc: 'Ask Gemini AI a question, or reply to an image to ask about it',
    type: 'ai',
  },
  async (message, match) => {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return await message.send('Missing GEMINI_API_KEY. Set it with setvar GEMINI_API_KEY = your_api_key')
    }

    if (!match && !(message.reply_message && message.reply_message.image)) {
      return await message.send('*Example:* ask What is the capital of France?')
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
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] }),
      }
    )
    const data = await apiRes.json()

    if (data.error) {
      return await message.send(`AI error: ${data.error.message}`)
    }

    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || 'No response.'
    await message.send(text, { quoted: message.data })
  }
)
