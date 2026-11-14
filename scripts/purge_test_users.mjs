/**
 * Delete the throwaway test accounts from the live project.
 *
 * The probe scripts create a user, use it, and delete it. One of them
 * could not clean up after itself — its password was generated at
 * random and never kept, so `deleteUser` could not sign in to delete
 * it.
 *
 * The Firebase CLI's own session on this machine holds a refresh
 * token for the project. Exchanging it for an access token gives the
 * Identity Toolkit admin API the rights needed to remove a user
 * directly.
 *
 * The OAuth client below is the one the installed firebase-tools
 * uses. It is not the same client that `firebase login` presents on
 * the consent screen, so a refresh with the login client fails with
 * `invalid_client` — this is the one that works.
 *
 * The token is never printed.
 *
 *   node scripts/purge_test_users.mjs [email-prefix]
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const CONFIG = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
const PROJECT = 'pokemarket-255c6';
const PREFIX = process.argv[2] ?? 'hermes.';

// The OAuth client the installed firebase-tools refreshes with.
const CLIENT_ID =
  '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
const SCOPE =
  'https://www.googleapis.com/auth/cloud-platform ' +
  'https://www.googleapis.com/auth/firebase';

if (!fs.existsSync(CONFIG)) {
  console.error(`  no Firebase CLI session at ${CONFIG} — run firebase login`);
  process.exit(1);
}

const refreshToken = JSON.parse(fs.readFileSync(CONFIG, 'utf-8'))?.tokens
  ?.refresh_token;
if (!refreshToken) {
  console.error('  the Firebase CLI session has no refresh token');
  process.exit(1);
}

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: SCOPE,
  }),
});
const tokenJson = await tokenRes.json();
if (!tokenJson.access_token) {
  console.error(`  could not get an access token: ${tokenJson.error}`);
  process.exit(1);
}
const authz = { Authorization: `Bearer ${tokenJson.access_token}` };

async function call(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...authz, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// List every account. The query expression does not support a
// wildcard on the email, so the filtering happens here.
const users = [];
let pageToken;
for (let i = 0; i < 20; i += 1) {
  const payload = { maxResults: 1000, returnUserInfo: true };
  if (pageToken) payload.nextPageToken = pageToken;
  const { status, body } = await call(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`,
    payload,
  );
  if (status !== 200) {
    console.error(`  query failed: ${JSON.stringify(body).slice(0, 300)}`);
    process.exit(1);
  }
  users.push(...(body.userInfo ?? []));
  pageToken = body.nextPageToken;
  if (!pageToken) break;
}

console.log(`  專案共 ${users.length} 個帳號`);

const targets = users.filter((u) =>
  String(u.email ?? '').toLowerCase().startsWith(PREFIX.toLowerCase()),
);
const anonymous = users.filter((u) => !u.email);
console.log(`  其中測試帳號 ${targets.length} 個，冇 email 嘅 ${anonymous.length} 個`);
console.log('  （冇 email 嘅係 app 自動匿名登入留低嘅 session，唔會郁）\n');

let deleted = 0;
for (const u of targets) {
  const { status, body } = await call(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`,
    { localId: u.localId },
  );
  if (status === 200 && !body.error) {
    deleted += 1;
    console.log(`  ✅ 刪除 ${u.email}`);
  } else {
    console.log(`  ⚠️  ${u.email}: ${body.error?.message ?? 'failed'}`);
  }
}

console.log(`\n  完成：刪除 ${deleted} / ${targets.length}`);
