import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Mã hoá token trước khi lưu vào bảng connections.
 *
 * ENCRYPTION_KEY là 64 ký tự hex (32 byte). Sinh bằng:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * ĐỔI KHOÁ NÀY LÀ MẤT HẾT TOKEN ĐÃ LƯU. Tạo một lần rồi để yên.
 */
function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error('Thiếu biến môi trường ENCRYPTION_KEY')
  if (raw.length !== 64) {
    throw new Error('ENCRYPTION_KEY phải là 64 ký tự hex (32 byte)')
  }
  return Buffer.from(raw, 'hex')
}

/** Trả về chuỗi "iv:authTag:ciphertext", tất cả base64. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':')
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':')
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Chuỗi mã hoá sai định dạng')
  }
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
