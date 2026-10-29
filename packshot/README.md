# PackShot

Mobile PWA for marketplace product photos: in-browser background removal,
tone adjustments, auto-framing (e.g. 2000×2000 with 5% padding), presets,
batch export and ZIP. No backend, works offline after the first visit.

## Run

```bash
npm install
npm run dev -- --host     # open http://<PC-IP>:5173 on the phone (same Wi-Fi)
npm run build && npm run preview -- --host   # production build + service worker
```

The background-removal model (~80 MB "Quality" / ~40 MB "Fast") downloads from
the IMG.LY CDN on first use and is then cached for offline use
(Background → "Download model for offline use").

## Deploy

Netlify / Vercel: import the repo, set **Base / Root directory = `packshot`**.
`netlify.toml` / `vercel.json` set the build command, output dir and the
COOP/COEP headers that enable multi-threaded background removal.

## License note

`@imgly/background-removal` is AGPL-3.0. Fine for your own use; if you
distribute or host this app for others, the AGPL source obligations apply
unless you get a commercial license from IMG.LY.
