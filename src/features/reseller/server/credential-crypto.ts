import 'server-only';

import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';

function encryptionKey() {
  const source = process.env.RESELLER_API_ENCRYPTION_KEY ?? process.env.APP_ENCRYPTION_KEY;
  if (!source) throw new Error('RESELLER_API_ENCRYPTION_KEY is not configured.');
  return createHash('sha256').update(source).digest();
}

export function encryptCredential(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptCredential(value: string) {
  const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !encrypted) throw new Error('credential_ciphertext_invalid');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
