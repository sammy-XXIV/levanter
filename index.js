const { Client, logger } = require('./lib/client')
const { DATABASE, VERSION } = require('./config')
const { stopInstance } = require('./lib/pm2')
const EventEmitter = require('events')

const lidToPN = {}
const ownPN = (process.env.SUDO || '').split(',')[0].replace(/\D/g, '')

function normalizeLID(jid) {
  if (!jid || !jid.endsWith('@lid')) return jid
  const bare = jid.split('@')[0].split(':')[0]
  if (lidToPN[bare]) return lidToPN[bare] + '@s.whatsapp.net'
  if (ownPN) return ownPN + '@s.whatsapp.net'
  return jid
}

const _origEmit = EventEmitter.prototype.emit
EventEmitter.prototype.emit = function (event, ...args) {
  if (event === 'creds.update' || event === 'connection.update') {
    try {
      const d = args[0]
      const me = d && (d.me || (d.legacy && d.legacy.user))
      if (me && me.lid && me.id) {
        const lid = me.lid.split('@')[0].split(':')[0]
        const pn = me.id.split('@')[0].split(':')[0]
        if (lid && pn && !lidToPN[lid]) { lidToPN[lid] = pn; process.stdout.write('[LID] ' + lid + '->' + pn + '\n') }
      }
    } catch (_) {}
  }
  if (event === 'messages.upsert') {
    try {
      const d = args[0]
      if (d && d.messages) {
        d.messages.forEach(m => {
          if (!m || !m.key) return
          if (m.key.remoteJid && m.key.remoteJid.endsWith('@lid')) m.key.remoteJid = normalizeLID(m.key.remoteJid)
          if (m.key.participant && m.key.participant.endsWith('@lid')) m.key.participant = normalizeLID(m.key.participant)
          if (m.key.fromMe && m.key.remoteJid && !m.key.remoteJid.endsWith('@g.us')) m.key.fromMe = false
        })
        if (d.type === 'notify') {
          const m = d.messages[0]
          const txt = m && m.message && (m.message.conversation || (m.message.extendedTextMessage && m.message.extendedTextMessage.text))
          process.stdout.write('[MSG] ' + (m && m.key && m.key.remoteJid) + ' txt=' + txt + '\n')
        }
      }
    } catch (_) {}
  }
  return _origEmit.apply(this, [event, ...args])
}

const start = async () => {
  logger.info(`levanter ${VERSION}`)
  try {
    await DATABASE.authenticate({ retry: { max: 3 } })
  } catch (error) {
    logger.error({ msg: 'Database connection failed', error: error.message, url: process.env.DATABASE_URL })
    return stopInstance()
  }
  const bot = new Client()
  try {
    await bot.connect()
  } catch (error) {
    logger.error({ msg: 'Bot client failed to start', error: error.message })
  }
  return bot
}

const shutdown = async (bot) => {
  try {
    if (bot) await bot.close()
    await DATABASE.close()
    process.exit(0)
  } catch (error) {
    logger.error({ msg: 'Error during shutdown', error: error.message })
    process.exit(1)
  }
}

const init = async () => {
  const bot = await start()
  process.on('SIGINT', () => shutdown(bot))
  process.on('SIGTERM', () => shutdown(bot))
}

init()
