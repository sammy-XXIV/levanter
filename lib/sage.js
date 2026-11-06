const fs = require('fs')

const memoryFile = () => process.env.SAGE_MEMORY_FILE || '/data/sage_memory.json'

function loadMemory() {
  try {
    return JSON.parse(fs.readFileSync(memoryFile(), 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return { hackathons: [], notes: [] }
    throw error
  }
}

function saveMemory(mem) {
  const tmp = `${memoryFile()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(mem, null, 2))
  fs.renameSync(tmp, memoryFile())
}

function daysUntil(dateStr, now = Date.now()) {
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  return Math.ceil((d - now) / 86400000) + 0
}

function buildReminder(hackathons, now = Date.now()) {
  const upcoming = hackathons
    .map((h) => ({ ...h, days: daysUntil(h.deadline, now) }))
    .filter((h) => h.days !== null && h.days >= 0)
    .sort((a, b) => a.days - b.days)
  if (!upcoming.length) return null
  const lines = upcoming.map(
    (h) => `- *${h.name}*: ${h.days === 0 ? 'due TODAY' : `${h.days} day(s) left`} (${h.deadline})`
  )
  return `*Sage daily reminder*\n${lines.join('\n')}`
}

module.exports = { loadMemory, saveMemory, daysUntil, buildReminder }

if (require.main === module) {
  const assert = require('assert')
  const os = require('os')
  const path = require('path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sage-'))
  process.env.SAGE_MEMORY_FILE = path.join(dir, 'memory.json')

  assert.deepStrictEqual(loadMemory(), { hackathons: [], notes: [] })
  saveMemory({ hackathons: [{ name: 'A', deadline: '2026-12-01' }], notes: [] })
  assert.strictEqual(loadMemory().hackathons[0].name, 'A')
  fs.writeFileSync(memoryFile(), '{broken')
  assert.throws(loadMemory, SyntaxError)

  const now = Date.parse('2026-11-06T09:00:00Z')
  assert.strictEqual(daysUntil('2026-11-06', now), 0)
  assert.strictEqual(daysUntil('2026-11-07', now), 1)
  assert.strictEqual(daysUntil('nonsense', now), null)

  const text = buildReminder(
    [
      { name: 'Later', deadline: '2026-11-20' },
      { name: 'Today', deadline: '2026-11-06' },
      { name: 'Gone', deadline: '2026-11-01' },
      { name: 'Bad', deadline: 'soon' },
    ],
    now
  )
  assert.ok(text.indexOf('Today') < text.indexOf('Later'))
  assert.ok(text.includes('due TODAY'))
  assert.ok(!text.includes('Gone') && !text.includes('Bad'))
  assert.strictEqual(buildReminder([{ name: 'Gone', deadline: '2026-11-01' }], now), null)

  fs.rmSync(dir, { recursive: true })
  console.log('sage self-check ok')
}
