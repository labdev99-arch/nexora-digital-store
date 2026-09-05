import 'server-only';

import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';

function key() {
  const source =
    process.env.NOTIFICATION_CONNECTION_ENCRYPTION_KEY ?? process.env.APP_ENCRYPTION_KEY;
  if (!source || source.length < 32) throw new Error('notification_encryption_key_missing');
  return createHash('sha256').update(source).digest();
}
export function hashExternalId(value: string) {
  const salt = process.env.NOTIFICATION_HASH_SALT ?? process.env.REFERRAL_HASH_SALT;
  if (!salt || salt.length < 16) throw new Error('notification_hash_salt_missing');
  return createHash('sha256').update(`${salt}:${value.trim()}`).digest('hex');
}
export function encryptExternalId(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url')
  ].join(':');
}
export function decryptExternalId(value: string | null) {
  if (!value) return null;
  const [version, iv, tag, ciphertext] = value.split(':');
  if (version !== 'v1' || !iv || !tag || !ciphertext)
    throw new Error('notification_connection_invalid');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}
