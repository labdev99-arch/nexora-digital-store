import 'server-only';

import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';

function encryptionKey() {
  const source = process.env.SUPPLIER_CREDENTIALS_ENCRYPTION_KEY ?? process.env.APP_ENCRYPTION_KEY;
  if (!source || source.length < 32) throw new Error('supplier_encryption_key_missing');
  return createHash('sha256').update(source).digest();
}

export function encryptSupplierSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSupplierSecret(value: string | null) {
  if (!value) return null;
  const [version, iv, tag, ciphertext] = value.split(':');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('supplier_secret_invalid');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}
