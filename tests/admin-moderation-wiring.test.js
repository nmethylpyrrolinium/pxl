const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

assert.match(app, /VISITOR_KEY = 'alams_dump_visitor_id'/, 'visitor ID uses the required localStorage key');
assert.match(app, /rpc\('submit_guest_wall_photo',[\s\S]*p_visitor_id: getVisitorId\(\)/, 'guest uploads include visitor ID');
assert.match(app, /rpc\('get_active_notices', \{ p_visitor_id: getVisitorId\(\) \}\)/, 'public page checks active notices');
assert.match(app, /profile\?\.account_type === 'admin'/, 'admin authorization uses profiles.account_type');
assert.match(app, /window\.location\.hash === '#admin'/, 'admin entry is hash-routed');
assert.match(app, /from\('approved_wall_photos'\)/, 'public wall reads from the approved-only view');
assert.match(app, /approve: 'approved', hide: 'archived', remove: 'rejected', restore: 'approved'/, 'moderation actions use soft-delete status mappings');
assert.doesNotMatch(app, /service[_-]?role/i, 'frontend does not mention or expose a service-role key');
assert.match(html, /id="adminView"/, 'admin view mount exists');
assert.match(html, /id="noticeDialog"/, 'visitor notice dialog exists');

console.log('admin moderation wiring tests passed');
