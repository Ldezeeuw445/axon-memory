# Axon Memory on the Samsung

How a change in this repo ends up on the phone. Follow it top to bottom; every
step says how to check it worked, because "it built" and "it is on the phone"
are different claims and this project has been bitten by treating them as one.

---

## The shape of it

```
this repo  ──push main──▶  Cloudflare Pages  ──▶  app.axon-memory.com
                                                        │
                                                        │ the APK is a window
                                                        │ onto this URL
                                                        ▼
                                                  Samsung (TWA)
```

The Android app is a **TWA** — a Trusted Web Activity. It contains no copy of
the site. It is a signed shell that opens `app.axon-memory.com` full-screen
without browser chrome.

**The consequence, and it is the thing worth knowing:** for anything that is
HTML, CSS or JavaScript, you never rebuild the APK. Push, wait for the deploy,
reopen the app. The APK only needs rebuilding when something about the *app
itself* changes — icon, name, package id, or the URL it points at.

---

## A. Normal change (the 95% case)

```bash
npm run lint && npm run build      # must both pass
git push origin main
```

Cloudflare Pages builds from `main` on push.

**Verify it actually shipped** — do not trust the dashboard, ask the site:

```bash
curl -s https://app.axon-memory.com | grep -o '<link[^>]*manifest[^>]*>'
curl -sI https://app.axon-memory.com/sw.js | head -1
```

On the phone: open the app, pull down to refresh. If the change is not there,
the service worker is holding the old shell — Settings → Apps → AXON → Storage
→ Clear cache. (Not Clear data; that signs you out.)

> **This exact trap has already happened here.** As of 2026-08-22 the live site
> served no manifest link while `index.html` in this repo had one. Production
> was months behind `main`. A green CI badge says the code compiles, not that
> anyone deployed it.

---

## B. Rebuilding the APK

Only needed for: the icon, the app name, the package id, the target URL, or
the very first install.

### Once, on this Mac

```bash
npm i -g @bubblewrap/cli
```

Bubblewrap wants a JDK and the Android SDK. Both are already here from the AXE
Core shell:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
```

### Generate the project

```bash
mkdir -p ~/Downloads/AxonAndroid && cd ~/Downloads/AxonAndroid
bubblewrap init --manifest=https://app.axon-memory.com/manifest.webmanifest
```

It reads the live manifest, so `name`, `short_name`, colours and icons come
from `public/manifest.webmanifest` in this repo. Answers that matter:

| Prompt | Answer | Why |
|---|---|---|
| Application ID | `com.axonmemory.app` | Permanent. Play Store identity is the package id, and it can never be changed after the first upload. |
| Display mode | `standalone` | Matches the manifest. |
| Signing key | create one, **back it up** | Lose this and you cannot ever update the app on Play. Not recoverable, not by anyone. |

### Build and install

```bash
bubblewrap build
~/Library/Android/sdk/platform-tools/adb install -r app-release-signed.apk
```

Confirm it is actually the new build rather than the old one still sitting there:

```bash
~/Library/Android/sdk/platform-tools/adb shell dumpsys package com.axonmemory.app | grep -E "versionCode|lastUpdateTime"
```

---

## C. Digital Asset Links — the step that is skipped and then debugged for an hour

Without this the app opens **with a browser address bar across the top**. It
still works, which is why it gets missed; it just does not look like an app.

`bubblewrap init` prints an `assetlinks.json`. It must be served at exactly:

```
https://app.axon-memory.com/.well-known/assetlinks.json
```

Put it in `public/.well-known/assetlinks.json` in this repo so Vite copies it
into `dist/`, then deploy. Verify:

```bash
curl -s https://app.axon-memory.com/.well-known/assetlinks.json | head -5
```

Then force-stop and reopen the app. The address bar disappears. Android caches
the verification, so if it does not, clear the app's cache and reopen.

---

## D. Play Store (€25, once)

1. Pay the one-off €25 developer registration.
2. `bubblewrap build` produces `app-release-bundle.aab` — upload that, not the APK.
3. Internal testing track first. It reaches your own device in minutes instead
   of waiting on review.
4. Icon, feature graphic and screenshots come from the store listing, not from
   this repo.

---

## What is already done

- `manifest.webmanifest` — `scope` and `id` present, four icons, standalone.
  Missing `scope` was a real bug: without it the scope defaults to the
  *directory* of `start_url`, and a TWA hands any navigation outside it to
  Chrome. On a phone that reads as the app randomly ejecting you.
- `sw.js` — offline shell. Deliberately does **not** cache Supabase or
  `/auth`: memory is the product, and a stale answer that looks current is
  worse than a visible offline state.
- Icons in two sets. `any` keeps the rounded plate; `maskable` is full-bleed
  with the mountain inside the 80% safe zone, because Android crops maskable
  icons to the launcher's own shape and would otherwise slice the corners off
  artwork that already has corners.
- Mobile CSS: `dvh`, safe-area insets, 44px targets, 16px inputs, cheaper
  blur, no hover-stick on touch, `prefers-reduced-motion`.

## What is not

- **Nothing is deployed.** This work is on the `mobile-and-pwa` branch. Merging
  to `main` is what triggers Cloudflare, and that is a production deploy of a
  live site, so it is a decision rather than a step.
- No APK has been built yet — that needs the site deployed first, since
  `bubblewrap init` reads the live manifest.
- No `assetlinks.json` (see C — it does not exist until the signing key does).
