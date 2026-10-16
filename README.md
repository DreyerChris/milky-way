# milky way

A gentle breastfeeding timer and log, built as an installable web app (PWA).

Live: https://milky-way.christiaanldreyer.workers.dev

## Features

- Start a feed on either side. After the first feed, it suggests the side you finished on last time, and you can still pick the other one.
- Separate timers for each side plus an overall session timer. Pause, resume and switch sides at any time.
- History grouped by day, with the last feed and last side shown prominently.
- Optional pumped milk amount (ml) per feed.
- Feed reminders: 3 hours after the last feed started during the day, 5 hours at night (day and night hours are adjustable). Reminders are sent as Web Push from a Cloudflare Worker, so they arrive while the app is closed. Tapping one starts a new feed.
- Works offline and can be added to the home screen. Follows the phone's light or dark mode.
- Soft 3D icons modelled and rendered with the Blender command line.

## Privacy

Feed history is stored only in the browser's local storage on the device. There is no account and no sync.
The server only stores what it needs to send reminders: the device's push subscription and the time and text of the next reminder. Turning reminders off deletes both.

## Stack

- [Preact](https://preactjs.com/) + TypeScript, bundled with [Vite](https://vite.dev/)
- Cloudflare Workers with static assets, and a Durable Object per device that holds the next reminder and uses an alarm to send it
- Web Push (VAPID signing and `aes128gcm` payload encryption) implemented with the Web Crypto API, without dependencies

## Development

```bash
npm install
npm run dev
```

The app runs at http://localhost:5173. Push reminders need the Worker, so in local development the app falls back to on-device reminders.

## Deploying your own copy

1. Generate a VAPID key pair (ECDSA P-256). Put the raw public key, base64url-encoded, in `vars.VAPID_PUBLIC_KEY` in `wrangler.jsonc`, and change `VAPID_SUBJECT` to your own URL.
2. Store the private key, as a JWK JSON string, as the secret `VAPID_PRIVATE_JWK`:
   ```bash
   npx wrangler secret put VAPID_PRIVATE_JWK
   ```
3. Change `name` in `wrangler.jsonc` if you want a different Worker name, then deploy:
   ```bash
   npm run deploy
   ```

Changing the VAPID key later is safe. The app notices the new key and subscribes again the next time it opens.

## Icons

The icons are modelled procedurally in `blender/render_icons.py` and post-processed by `blender/postprocess.py`. That script builds the app icons and crops the UI icons. Blender 5.x and `cwebp` are required.

```bash
npm run icons
/Applications/Blender.app/Contents/MacOS/Blender -b -P blender/postprocess.py
for f in blender/out/ui/*.png; do cwebp -q 88 -alpha_q 90 -resize 192 192 "$f" -o "public/icons/$(basename "$f" .png).webp"; done
```

## Project layout

```
src/            Preact app (feeds logic, storage, reminders, components)
worker/         Cloudflare Worker: API, reminder Durable Object, Web Push
public/         Manifest, service worker, icons
blender/        Icon modelling and post-processing scripts
```
