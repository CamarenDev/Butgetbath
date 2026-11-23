const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

// Compares against a throwaway hash when the account is missing so timing doesn't reveal which emails exist.
const dummyHash = hashPassword('not-a-real-password');
async function verifyPassword(password, stored) {
  const [scheme, salt, hash] = (stored || await dummyHash).split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected) && Boolean(stored);
}

module.exports = { sha256, randomToken, hashPassword, verifyPassword };
