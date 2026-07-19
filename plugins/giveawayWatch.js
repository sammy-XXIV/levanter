const { bot } = require('../lib')

const TRIGGER_PATTERNS = [
  /first\s*\d+\s*(accounts?|to\s*drop)/i,
  /\d+\s*(naira|₦|k)?\s*for\s*\d+\s*people/i,
  /drop\s*(your\s*)?(aza|acc|account)/i,
  /giveaway/i,
]

const ACCOUNT_MESSAGE = process.env.GIVEAWAY_ACCOUNT_MSG || ''
const COOLDOWN_MS = Number(process.env.GIVEAWAY_COOLDOWN_MIN || 30) * 60 * 1000

const lastTriggered = new Map()

bot({ on: 'text', fromMe: false, type: 'giveawayWatch' }, async (message) => {
  if (!ACCOUNT_MESSAGE || !message.isGroup || !message.text) return

  const hit = TRIGGER_PATTERNS.some((pattern) => pattern.test(message.text))
  if (!hit) return

  const last = lastTriggered.get(message.jid) || 0
  if (Date.now() - last < COOLDOWN_MS) return
  lastTriggered.set(message.jid, Date.now())

  return message.send(ACCOUNT_MESSAGE)
})
