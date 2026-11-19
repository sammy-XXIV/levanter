// Configure BOT_IMPORT_URL and BOT_IMPORT_KEY in Script Properties before install().
function syncGrokDigests() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const url = props.getProperty('BOT_IMPORT_URL');
    const key = props.getProperty('BOT_IMPORT_KEY');
    if (!url || !key || !/^https:\/\//.test(url)) throw new Error('Bot import settings are missing');
    // The overlap catches delayed emails and missed daily runs. Both ends deduplicate.
    const query = 'in:anywhere from:samsonsamuel531@gmail.com to:samsonsamuel531@gmail.com subject:"Daily hackathon digest" newer_than:7d -in:trash -in:spam';
    let pageToken;
    const messages = [];
    do {
      const page = Gmail.Users.Messages.list('me', { q: query, maxResults: 100, pageToken: pageToken });
      Array.prototype.push.apply(messages, page.messages || []);
      pageToken = page.nextPageToken;
    } while (pageToken);
    let imported = 0;
    const started = Date.now();
    for (const item of messages.reverse()) {
      if (Date.now() - started > 240000) break; // Leave time before Apps Script's execution limit.
      if (props.getProperty('done_' + item.id)) continue;
      const message = Gmail.Users.Messages.get('me', item.id, { format: 'full' });
      const header = name => (message.payload.headers || []).find(h => h.name.toLowerCase() === name.toLowerCase());
      const subject = (header('subject') || {}).value || '';
      const text = digestBody_(message.payload);
      if (!/^Daily hackathon digest\b/i.test(subject) || !text.trim()) continue;
      const response = UrlFetchApp.fetch(url, {
        method: 'post', contentType: 'application/json',
        headers: { 'x-sage-import-key': key },
        payload: JSON.stringify({ messageId: item.id, subject: subject, date: new Date(Number(message.internalDate)).toISOString(), text: text }),
        muteHttpExceptions: true,
      });
      if (response.getResponseCode() !== 200) throw new Error('Bot import failed (HTTP ' + response.getResponseCode() + '); email retained for next run');
      const result = JSON.parse(response.getContentText());
      if (typeof result.added !== 'number') throw new Error('Unexpected bot response; email retained for next run');
      props.setProperty('done_' + item.id, String(Date.now()));
      imported++;
      console.log(JSON.stringify({ messageId: item.id, added: result.added, updated: result.updated, duplicate: !!result.duplicate }));
    }
    // Keep only recent local receipts; the bot maintains persistent deduplication too.
    const all = props.getProperties();
    Object.keys(all).forEach(k => {
      if (k.indexOf('done_') === 0 && Number(all[k]) < Date.now() - 30 * 86400000) props.deleteProperty(k);
    });
    props.setProperty('LAST_SUCCESS', new Date().toISOString());
    console.log('Sync complete: ' + imported + ' digest(s) imported');
  } finally {
    lock.releaseLock();
  }
}

function digestBody_(part) {
  if (part.mimeType === 'text/plain' && part.body && part.body.data) {
    return Utilities.newBlob(Array.isArray(part.body.data) ? part.body.data : Utilities.base64DecodeWebSafe(part.body.data)).getDataAsString('UTF-8');
  }
  const children = part.parts || [];
  const plain = children.map(digestBody_).filter(Boolean).join('\n');
  if (plain) return plain;
  if (part.mimeType === 'text/html' && part.body && part.body.data) {
    return Utilities.newBlob(Array.isArray(part.body.data) ? part.body.data : Utilities.base64DecodeWebSafe(part.body.data)).getDataAsString('UTF-8')
      .replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n').replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }
  return '';
}

function install() {
  // Validate the Gmail connection and bot endpoint before enabling the schedule.
  syncGrokDigests();
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncGrokDigests')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncGrokDigests').timeBased().atHour(7).nearMinute(0)
    .everyDays(1).inTimezone('Africa/Lagos').create();
  console.log('Daily import installed: approximately 07:00 Africa/Lagos (Google allows +/-15 minutes)');
}
