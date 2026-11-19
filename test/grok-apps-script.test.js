const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

function script() {
  const context = {
    Utilities: {
      base64DecodeWebSafe(value) {
        if (typeof value !== 'string') throw new Error('Could not decode string.')
        return [...Buffer.from(value, 'base64url')]
      },
      newBlob(bytes) { return { getDataAsString() { return Buffer.from(bytes.map(b => b & 255)).toString('utf8') } } },
    },
  }
  vm.createContext(context)
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../google-apps-script/Code.gs'), 'utf8'), context)
  return context
}

test('reads Gmail advanced-service byte arrays without trying to base64-decode them', () => {
  const source = script()
  const text = 'Daily Hackathon Digest — Prize ₹15 lakh'
  const bytes = [...Buffer.from(text)].map(b => b > 127 ? b - 256 : b)
  assert.equal(source.digestBody_({ mimeType: 'text/plain', body: { data: bytes } }), text)
})

test('also supports a REST base64url body', () => {
  const source = script()
  const text = 'Daily Hackathon Digest'
  assert.equal(source.digestBody_({ mimeType: 'text/plain', body: { data: Buffer.from(text).toString('base64url') } }), text)
})
