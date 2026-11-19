const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { importDigest, createImportServer } = require('../lib/sage-import')
const { loadMemory, saveMemory, buildReminder } = require('../lib/sage')

test('imports a digest once, preserves manual data, and makes deadlines available to reminders', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sage-import-'))
  process.env.SAGE_MEMORY_FILE = path.join(dir, 'memory.json')
  try {
    saveMemory({ hackathons: [{ name: 'Manual', deadline: '2026-12-10' }], notes: ['keep'], history: [] })
    const digest = { messageId: 'mail1', subject: 'Daily hackathon digest', text: 'QoreChain closes December 2, 2026. Pi details TBA.' }
    const extract = async () => [
      { name: 'QoreChain', deadline: '2026-12-02', details: 'Submissions close Dec 2', url: 'https://build.qorechain.io' },
      { name: 'Pi Next', deadline: null, details: 'Details TBA', url: 'https://example.com/pi' },
    ]
    assert.equal((await importDigest(digest, { extract })).added, 2)
    assert.equal((await importDigest(digest, { extract: () => { throw Error('must not extract twice') } })).duplicate, true)
    let memory = loadMemory()
    assert.equal(memory.hackathons.length, 3)
    assert.deepEqual(memory.notes, ['keep'])
    assert.equal(memory.hackathons.find(h => h.name === 'Pi Next').deadline, null)
    const reminder = buildReminder(memory.hackathons, Date.parse('2026-11-19'))
    assert.match(reminder, /QoreChain/)
    assert.doesNotMatch(reminder, /Pi Next/)
    await importDigest({ ...digest, messageId: 'mail2' }, { extract: async () => [{ name: 'QoreChain Developer Fest', deadline: null, details: 'Registration open', url: 'https://build.qorechain.io/' }] })
    memory = loadMemory()
    assert.equal(memory.hackathons.length, 3)
    assert.equal(memory.hackathons.find(h => h.url === 'https://build.qorechain.io/').deadline, '2026-12-02')
  } finally {
    delete process.env.SAGE_MEMORY_FILE
    fs.rmSync(dir, { recursive: true })
  }
})

test('invalid extraction cannot modify memory or mark an email processed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sage-import-'))
  process.env.SAGE_MEMORY_FILE = path.join(dir, 'memory.json')
  try {
    saveMemory({ hackathons: [], notes: ['keep'] })
    await assert.rejects(importDigest({ messageId: 'bad', subject: 'Daily hackathon digest', text: 'test' }, { extract: async () => [{ name: 'Bad date', deadline: '2026-02-30' }] }))
    assert.deepEqual(loadMemory(), { hackathons: [], notes: ['keep'] })
  } finally {
    delete process.env.SAGE_MEMORY_FILE
    fs.rmSync(dir, { recursive: true })
  }
})

test('HTTP importer rejects unauthorized and oversized requests before extraction', async () => {
  let calls = 0
  const server = createImportServer({ key: 'test-import-key', import: async () => { calls++; return { added: 1 } } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/sage/import-digest`
  try {
    assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 401)
    assert.equal(calls, 0)
    const headers = { 'x-sage-import-key': 'test-import-key', 'content-type': 'application/json' }
    assert.equal((await fetch(url, { method: 'POST', headers, body: 'x'.repeat(70000) })).status, 413)
    const result = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ messageId: 'a', text: 'digest', subject: 'Daily hackathon digest' }) })
    assert.equal(result.status, 200)
    assert.equal(calls, 1)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
