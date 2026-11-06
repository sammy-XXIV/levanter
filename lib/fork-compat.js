function enableForkCommands(client) {
  for (const session of Object.values(client.sessions)) {
    // loadPlugins ties E to the latest Git commit's author. Fork authors must
    // not disable routing; leave the separate sender/blocklist checks intact.
    Object.defineProperty(session.botState, 'E', {
      enumerable: true,
      configurable: true,
      get: () => true,
      set: () => {},
    })
  }
}

module.exports = { enableForkCommands }
