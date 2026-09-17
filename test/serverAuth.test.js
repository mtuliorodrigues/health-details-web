const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSessionToken, verifySessionToken, verifySharedPassword } = require('../lib/serverAuth');

test('aceita somente uma sessão assinada e ainda válida', () => {
  const token = createSessionToken('segredo-de-teste', 1_000);
  assert.equal(verifySessionToken(token, 'segredo-de-teste', 1_001), true);
  assert.equal(verifySessionToken(token, 'segredo-diferente', 1_001), false);
  assert.equal(verifySessionToken(token, 'segredo-de-teste', 8 * 60 * 60 * 1000 + 1_001), false);
});

test('valida senha contra hash scrypt', async () => {
  const salt = Buffer.from('salt-de-teste');
  const derived = crypto.scryptSync('senha-de-teste', salt, 32);
  const encoded = `scrypt:${salt.toString('base64url')}:${derived.toString('base64url')}`;
  assert.equal(await verifySharedPassword('senha-de-teste', encoded), true);
  assert.equal(await verifySharedPassword('senha-invalida', encoded), false);
});
