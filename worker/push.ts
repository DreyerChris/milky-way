export interface PushSubscriptionData {
  readonly endpoint: string
  readonly keys: {
    readonly p256dh: string
    readonly auth: string
  }
}

export interface VapidConfig {
  readonly publicKey: string
  readonly privateJwk: JsonWebKey
  readonly subject: string
}

export interface PushOptions {
  readonly ttlSeconds: number
  readonly urgency: 'very-low' | 'low' | 'normal' | 'high'
  readonly topic?: string
}

const encoder = new TextEncoder()

export const base64UrlEncode = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

export const base64UrlDecode = (value: string): Uint8Array => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

const concat = (...parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  parts.reduce((offset, p) => {
    out.set(p, offset)
    return offset + p.length
  }, 0)
  return out
}

const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8)
  return new Uint8Array(bits)
}

export const encryptPayload = async (
  subscription: PushSubscriptionData,
  plaintext: Uint8Array,
): Promise<Uint8Array> => {
  const uaPublic = base64UrlDecode(subscription.keys.p256dh)
  const authSecret = base64UrlDecode(subscription.keys.auth)
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error('Invalid push subscription keys')

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', local.publicKey)) as ArrayBuffer)
  // Workers types name this field `$public`, but the runtime reads the standard `public`.
  const ecdhParams = { name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdhParams, local.privateKey, 256))

  const keyInfo = concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic)
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12)

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const record = concat(plaintext, new Uint8Array([2]))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, record))

  const header = new Uint8Array(21)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = asPublic.length
  return concat(header, asPublic, ciphertext)
}

const vapidJwt = async (audience: string, vapid: VapidConfig): Promise<string> => {
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = base64UrlEncode(
    encoder.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: vapid.subject })),
  )
  const key = await crypto.subtle.importKey('jwk', vapid.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${claims}`))
  return `${header}.${claims}.${base64UrlEncode(new Uint8Array(signature))}`
}

export const sendPush = async (
  subscription: PushSubscriptionData,
  payload: unknown,
  vapid: VapidConfig,
  options: PushOptions,
): Promise<Response> => {
  const body = await encryptPayload(subscription, encoder.encode(JSON.stringify(payload)))
  const jwt = await vapidJwt(new URL(subscription.endpoint).origin, vapid)
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(options.ttlSeconds),
      Urgency: options.urgency,
      ...(options.topic ? { Topic: options.topic } : {}),
    },
    body,
  })
}
