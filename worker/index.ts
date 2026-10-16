import { DurableObject } from 'cloudflare:workers'
import type { PushSubscriptionData, VapidConfig } from './push'
import { sendPush } from './push'

interface Notice {
  readonly at: number
  readonly attempts?: number
  readonly firstAt?: number
  readonly title: string
  readonly body: string
  readonly url: string
}

type ScheduleRequest = { readonly subscription: PushSubscriptionData; readonly reminder: Notice | null }
type TestRequest = { readonly subscription: PushSubscriptionData; readonly delaySeconds: number }

const MAX_AHEAD_MS = 24 * 3_600_000
const TEST_DELAY_LIMIT_S = 120
const MAX_ATTEMPTS = 5
const RETRY_BASE_MS = 15_000

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max

const parseSubscription = (v: unknown): PushSubscriptionData | null => {
  if (!isRecord(v) || !isText(v.endpoint, 2048) || !isRecord(v.keys)) return null
  if (!isText(v.keys.p256dh, 200) || !isText(v.keys.auth, 100)) return null
  try {
    if (new URL(v.endpoint).protocol !== 'https:') return null
  } catch {
    return null
  }
  return { endpoint: v.endpoint, keys: { p256dh: v.keys.p256dh, auth: v.keys.auth } }
}

const parseNotice = (v: unknown, now: number): Notice | null => {
  if (!isRecord(v) || typeof v.at !== 'number' || !isText(v.title, 120) || !isText(v.body, 300) || !isText(v.url, 300)) {
    return null
  }
  if (v.at <= now || v.at > now + MAX_AHEAD_MS) return null
  return { at: v.at, title: v.title, body: v.body, url: v.url }
}

const vapidFrom = (env: Env): VapidConfig => {
  if (!env.VAPID_PRIVATE_JWK) throw new Error('VAPID_PRIVATE_JWK secret is not configured')
  return { publicKey: env.VAPID_PUBLIC_KEY, privateJwk: JSON.parse(env.VAPID_PRIVATE_JWK) as JsonWebKey, subject: env.VAPID_SUBJECT }
}

export class ReminderSchedule extends DurableObject<Env> {
  async schedule(subscription: PushSubscriptionData, reminder: Notice | null): Promise<void> {
    await this.ctx.storage.put('subscription', subscription)
    if (reminder) await this.ctx.storage.put('reminder', reminder)
    else await this.ctx.storage.delete('reminder')
    await this.rearm()
  }

  async scheduleTest(subscription: PushSubscriptionData, notice: Notice): Promise<void> {
    await this.ctx.storage.put('subscription', subscription)
    await this.ctx.storage.put('test', notice)
    await this.rearm()
  }

  async forget(): Promise<void> {
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
  }

  async alarm(): Promise<void> {
    const subscription = await this.ctx.storage.get<PushSubscriptionData>('subscription')
    if (!subscription) return this.forget()
    const now = Date.now()
    for (const key of ['test', 'reminder'] as const) {
      const notice = await this.ctx.storage.get<Notice>(key)
      if (!notice || notice.at > now + 1000) continue
      const outcome = await this.deliver(subscription, key, notice).catch((err: unknown) =>
        err instanceof Error ? err.message : String(err),
      )
      if (outcome === 'gone') return this.forget()
      if (outcome === 'sent') {
        console.log(JSON.stringify({ event: 'push_sent', kind: key, lateMs: now - (notice.firstAt ?? notice.at) }))
        await this.ctx.storage.delete(key)
        continue
      }
      const attempts = (notice.attempts ?? 0) + 1
      console.error(JSON.stringify({ event: 'push_failed', kind: key, attempts, detail: outcome }))
      if (attempts >= MAX_ATTEMPTS) await this.ctx.storage.delete(key)
      else await this.ctx.storage.put(key, { ...notice, at: now + RETRY_BASE_MS * 2 ** attempts, attempts, firstAt: notice.firstAt ?? notice.at })
    }
    await this.rearm()
  }

  private async deliver(subscription: PushSubscriptionData, key: 'test' | 'reminder', notice: Notice): Promise<'sent' | 'gone' | string> {
    const res = await sendPush(subscription, { title: notice.title, body: notice.body, url: notice.url }, vapidFrom(this.env), {
      ttlSeconds: key === 'test' ? 600 : 7200,
      urgency: 'high',
      topic: key === 'test' ? 'test-reminder' : 'feed-reminder',
    })
    if (res.ok) return 'sent'
    if (res.status === 404 || res.status === 410) return 'gone'
    return `Push service answered ${res.status}: ${(await res.text()).slice(0, 300)}`
  }

  private async rearm(): Promise<void> {
    const pending = [await this.ctx.storage.get<Notice>('test'), await this.ctx.storage.get<Notice>('reminder')]
      .filter((n): n is Notice => n !== undefined)
      .map((n) => n.at)
    if (pending.length === 0) await this.ctx.storage.deleteAlarm()
    else await this.ctx.storage.setAlarm(Math.min(...pending))
  }
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const scheduleFor = async (env: Env, subscription: PushSubscriptionData): Promise<DurableObjectStub<ReminderSchedule>> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(subscription.endpoint))
  const name = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return env.REMINDERS.get(env.REMINDERS.idFromName(name))
}

const readJson = async (request: Request): Promise<unknown> => {
  if (Number(request.headers.get('Content-Length') ?? 0) > 8192) throw new Error('Request body too large')
  return request.json()
}

const handleApi = async (request: Request, env: Env, path: string): Promise<Response> => {
  const body = await readJson(request)
  const subscription = isRecord(body) ? parseSubscription(body.subscription) : null
  if (!isRecord(body) || !subscription) return json({ error: 'A valid push subscription is required' }, 400)
  const stub = await scheduleFor(env, subscription)
  const now = Date.now()

  if (path === '/api/push/schedule' && request.method === 'PUT') {
    const req = body as unknown as ScheduleRequest
    const reminder = req.reminder === null ? null : parseNotice(req.reminder, now)
    if (req.reminder !== null && !reminder) return json({ error: 'Reminder must be a future time within 24 hours' }, 400)
    await stub.schedule(subscription, reminder)
    return json({ ok: true, at: reminder?.at ?? null })
  }

  if (path === '/api/push/test' && request.method === 'POST') {
    const req = body as unknown as TestRequest
    const delay = Math.min(Math.max(Number(req.delaySeconds) || 0, 1), TEST_DELAY_LIMIT_S)
    await stub.scheduleTest(subscription, {
      at: now + delay * 1000,
      title: 'Time for a feed',
      body: 'This is a test reminder from milky way. Tap it to start a feed.',
      url: './?start=1',
    })
    return json({ ok: true, at: now + delay * 1000 })
  }

  if (path === '/api/push/subscription' && request.method === 'DELETE') {
    await stub.forget()
    return json({ ok: true })
  }

  return json({ error: 'Not found' }, 404)
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    try {
      return await handleApi(request, env, url.pathname)
    } catch (err) {
      console.error(JSON.stringify({ event: 'api_error', path: url.pathname, message: err instanceof Error ? err.message : String(err) }))
      return json({ error: 'Something went wrong' }, 500)
    }
  },
} satisfies ExportedHandler<Env>
