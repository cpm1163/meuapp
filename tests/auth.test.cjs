const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Load the actual service with platform/network boundaries replaced, without sending emails.
function setup({ platform = 'ios', browserResult = { type: 'cancel' }, exchangeError = null } = {}) {
  const calls = { exchanges: [], otp: [], oauth: [], browser: [], redirects: [] };
  const auth = {
    exchangeCodeForSession: async (code) => { calls.exchanges.push(code); return { data: { session: {} }, error: exchangeError }; },
    signInWithOtp: async (args) => { calls.otp.push(args); return { error: null }; },
    signInWithOAuth: async (args) => { calls.oauth.push(args); return { data: { url: 'https://auth.example/authorize' }, error: null }; },
  };
  const exports = {};
  const modules = {
    './supabase': { supabase: { auth } },
    'react-native': { Platform: { OS: platform } },
    'expo-linking': { createURL: (path, { scheme }) => `${scheme}://${path}` },
    'expo-web-browser': { openAuthSessionAsync: async (...args) => { calls.browser.push(args); return browserResult; } },
  };
  const source = ts.transpileModule(fs.readFileSync('src/lib/auth.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, require: (name) => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  }, URL, window: { location: { origin: 'https://app.example', assign: (url) => calls.redirects.push(url) } } });
  return { service: exports, calls };
}

test('magic link trims email, allows registration and uses the app callback', async () => {
  const { service, calls } = setup();
  await service.sendMagicLink(' user@example.com ');
  assert.equal(calls.otp[0].email, 'user@example.com');
  assert.equal(calls.otp[0].options.shouldCreateUser, true);
  assert.equal(calls.otp[0].options.emailRedirectTo, 'myapp://auth/callback');
});
test('duplicate callback delivery exchanges the code only once; logout clears it', async () => {
  const { service, calls } = setup();
  await Promise.all([service.exchangeAuthCode('code'), service.exchangeAuthCode('code')]);
  assert.equal(calls.exchanges.length, 1);
  service.clearAuthCallbackState();
  await service.exchangeAuthCode('code');
  assert.equal(calls.exchanges.length, 2);
});
test('invalid or reused code rejects instead of authenticating', async () => {
  const { service } = setup({ exchangeError: new Error('expired') });
  await assert.rejects(service.exchangeAuthCode('expired'), /expired/);
});
test('native OAuth cancellation does not exchange a code', async () => {
  const { service, calls } = setup();
  await service.signInWithSocialProvider('google');
  assert.equal(calls.exchanges.length, 0);
});
test('native OAuth success exchanges the returned code', async () => {
  const { service, calls } = setup({ browserResult: { type: 'success', url: 'myapp://auth/callback?code=valid' } });
  await service.signInWithSocialProvider('google');
  assert.equal(calls.exchanges[0], 'valid');
  assert.equal(calls.oauth[0].options.skipBrowserRedirect, true);
});
test('OAuth error or missing code never establishes a session', async () => {
  for (const query of ['?error=access_denied', '']) {
    const { service, calls } = setup({ browserResult: { type: 'success', url: `myapp://auth/callback${query}` } });
    await assert.rejects(service.signInWithSocialProvider('google'));
    assert.equal(calls.exchanges.length, 0);
  }
});
test('web OAuth uses same-tab navigation and same-origin callback', async () => {
  const { service, calls } = setup({ platform: 'web' });
  await service.signInWithSocialProvider('google');
  assert.equal(calls.oauth[0].options.redirectTo, 'https://app.example/auth/callback');
  assert.equal(calls.redirects.length, 1);
  assert.equal(calls.browser.length, 0);
});
