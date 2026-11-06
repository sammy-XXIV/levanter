const { bot } = require('../lib/')
bot(
  { pattern: '(.*)', desc: 'catchall', type: 'misc' },
  async (message, match) => {
    process.stdout.write('[CATCHALL] ' + match + '\n')
  }
)
