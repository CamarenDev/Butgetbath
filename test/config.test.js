const test = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig } = require('../lib/config');

test('runtime config validates core settings and degrades incomplete optional integrations', () => {
  assert.throws(() => validateConfig({ PORT: '90000' }), /PORT/);
  assert.throws(() => validateConfig({ SITE_URL: 'file:///tmp/app' }), /http/);
  assert.throws(() => validateConfig({ TRUST_PROXY_IPS: 'not-an-address' }), /TRUST_PROXY_IPS/);

  const warnings = [];
  const config = validateConfig({
    RESEND_API_KEY: 'test-key',
    GOOGLE_CALENDAR_ID: 'calendar-id',
    GOOGLE_SERVICE_ACCOUNT_JSON: '{"not":"complete"}',
    TRUST_PROXY: '1'
  }, { warn: message => warnings.push(message) });
  assert.equal(config.email.enabled, false);
  assert.equal(config.calendar.enabled, false);
  assert.equal(config.trustProxy, true);
  assert.deepEqual(config.trustedProxyIps, []);
  assert.ok(warnings.some(message => /Email is disabled/.test(message)));
  assert.ok(warnings.some(message => /Google Calendar sync is disabled/.test(message)));
  assert.ok(warnings.some(message => /loopback proxies/.test(message)));
});
