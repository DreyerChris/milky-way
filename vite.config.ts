import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const readVapidPublicKey = (): string => {
  const config = JSON.parse(readFileSync(new URL('./wrangler.jsonc', import.meta.url), 'utf8')) as {
    readonly vars?: { readonly VAPID_PUBLIC_KEY?: string }
  }
  const key = config.vars?.VAPID_PUBLIC_KEY
  if (!key) throw new Error('VAPID_PUBLIC_KEY is missing from wrangler.jsonc vars')
  return key
}

export default defineConfig({
  base: './',
  define: {
    'import.meta.env.VITE_VAPID_PUBLIC_KEY': JSON.stringify(readVapidPublicKey()),
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
})
