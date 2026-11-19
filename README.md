# levanter

A WhatsApp multi-device bot built on [lyfe00011/levanter](https://github.com/lyfe00011/levanter), extended with AI, memory, and automation plugins.

## Features

- **Sage** — AI assistant (powered by [Orbio](https://orbio.so)) with persistent memory, hackathon/deadline tracking, tweet fetching, cross-message context, and daily reminders
- **Giveaway Watch** — auto-detects giveaway messages in groups and responds with your account info
- **Standard plugins** — ping, menu, sticker, downloader, and more from upstream levanter

## Deploy on Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com)

1. Fork this repo
2. Create a new Railway project from your fork
3. Add a volume mounted at `/data` for persistent storage
4. Set the required environment variables (see below)
5. Generate a session ID from [levanter.site](https://levanter.site) **after** the build succeeds, then set `SESSION_ID`

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SESSION_ID` | Yes | WhatsApp session from levanter.site (generate after build) |
| `DATABASE_URL` | Yes | SQLite path — set to `sqlite:/data/database.db` |
| `SUDO` | Yes | Your WhatsApp number (e.g. `2347012345678`) |
| `API_KEY` | Yes | Internal API key — any random string |
| `ORBIO_API_KEY` | Sage | API key from [orbio.so](https://orbio.so) |
| `SAGE_REMIND_TO` | Sage | Your WhatsApp JID for daily reminders (e.g. `2347012345678@s.whatsapp.net`) |
| `SAGE_REMIND_CRON` | Sage | Cron schedule for reminders (default: `0 9 * * *`) |
| `SAGE_ORBIO_MODEL` | Sage | Override AI model (default: `google/gemini-3.8-flash`) |
| `SAGE_IMPORT_KEY` | Email import | Separate secret for the protected digest importer |
| `SAGE_IMPORT_PORT` | Email import | Import HTTP server port (default: `3001`); route the import domain to this port |
| `TIMEZONE` | Sage | Timezone for reminders (default: `Africa/Lagos`) |
| `GIVEAWAY_ACCOUNT_MSG` | Giveaway | Your account details — enables the giveaway watcher |
| `GIVEAWAY_COOLDOWN_MIN` | Giveaway | Cooldown between triggers per group (default: `30`) |

## Sage Usage

```
.sage what hackathons do I have?
.sage save Monad hackathon deadline 2026-10-13
.sage https://x.com/someone/status/123456789  summarize this
.sage list my upcoming deadlines
```

Sage remembers the last 10 exchanges — follow-up questions work without repeating context.

## Daily Grok email import

`google-apps-script/Code.gs` imports emails from your own Gmail address with subjects beginning `Daily hackathon digest`. These are the detailed digest emails, rather than Grok's separate `noreply@x.ai` notifications.

1. Set `SAGE_IMPORT_KEY` on the bot and route an HTTPS domain to `SAGE_IMPORT_PORT` (3001).
2. Create a Google Apps Script project with `Code.gs` and the supplied `appsscript.json` manifest. The manifest enables Gmail's advanced service with read-only mail access.
3. Set script properties `BOT_IMPORT_URL` to `https://<import-domain>/sage/import-digest` and `BOT_IMPORT_KEY` to the matching secret. Keep secrets out of source control.
4. Run `install` and authorize the Google permissions. It first syncs recent digests, then creates one daily trigger around 07:00 Africa/Lagos. Google allows about 15 minutes of timing variation.

The seven-day search overlap recovers delayed emails or missed runs. Processed Gmail message IDs are stored persistently by the bot, so retries are safe. Entries are merged by name or registration URL. Only explicitly stated exact registration/submission deadlines enter the daily countdown; unknown or approximate deadlines remain null. Event details and source email IDs are retained in Sage memory. Import errors leave an email eligible for a later run; Apps Script reports trigger failures through its standard execution monitoring.

Validate the importer with `node --test test/sage-import.test.js`.

## Notes

- Session expires if generated before the build finishes. Always generate **after** Railway shows `SUCCESS`.
- `/data` volume persists `database.db` and `sage_memory.json` across restarts.
- Giveaway plugin is dormant unless `GIVEAWAY_ACCOUNT_MSG` is set.
