const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

assert.match(app, /VISITOR_KEY = 'alams_dump_visitor_id'/, 'visitor ID uses the required localStorage key');
assert.match(app, /rpc\('submit_guest_wall_photo',[\s\S]*p_visitor_id: getVisitorId\(\)/, 'guest uploads include visitor ID');
assert.match(app, /rpc\('get_active_notices', \{ p_visitor_id: getVisitorId\(\) \}\)/, 'public page checks active notices');
assert.match(app, /const session = await getAuthSession\(\);[\s\S]*if \(!session\)[\s\S]*renderAdminLogin\(\)/, 'admin route checks the session before showing login');
assert.match(app, /auth\.getSession\(\)/, 'admin auth starts by fetching the current session');
assert.match(app, /data-admin-login-form[\s\S]*name=\"email\"[\s\S]*name=\"password\"[\s\S]*data-admin-login>Login</, 'signed-out admin route offers email and password login');
assert.match(app, /auth\.signInWithPassword\(\{[\s\S]*email,[\s\S]*password,[\s\S]*\}\)/, 'admin login uses Supabase email and password auth');
assert.doesNotMatch(app, /signInWithOAuth|provider: ['\"]google['\"]|Login with Google|Sign in with Google/, 'frontend does not offer Google OAuth');
assert.match(app, /from\('profiles'\)\.select\('\*'\)\.eq\('id', userId\)\.maybeSingle\(\)/, 'admin authorization fetches the current user profile');
assert.match(app, /profile\.account_type !== 'admin'/, 'admin authorization uses profiles.account_type');
assert.match(app, /Profile missing\. Try refreshing or contact admin\./, 'missing profiles show actionable guidance');
assert.match(app, /await supabaseClient\.auth\.signOut\(\);[\s\S]*window\.location\.hash = ''/, 'admin logout signs out and returns to the public wall');
assert.match(app, /window\.location\.hash === '#admin'/, 'admin entry is hash-routed');
assert.match(app, /from\('approved_wall_photos'\)/, 'public wall reads from the approved-only view');
assert.match(app, /approve: 'approved', hide: 'archived', remove: 'rejected', restore: 'approved'/, 'moderation actions use soft-delete status mappings');
assert.doesNotMatch(app, /service[_-]?role/i, 'frontend does not mention or expose a service-role key');
assert.doesNotMatch(app, /alfar4864@gmail\.com/i, 'frontend does not hardcode an admin email');
assert.match(html, /id="adminView"/, 'admin view mount exists');
assert.match(html, /id="noticeDialog"/, 'visitor notice dialog exists');

console.log('admin moderation wiring tests passed');
