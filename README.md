# MCM Smart Booking Assistant (Widget)

This repo contains the embeddable widget assets:

- `widget.js` — the widget loader + UI (floating button + slide-over, or inline)
- `widget.css` — styling
- `embed.html` — iframe fallback host page

## Quick Test Embed (floating widget)

Replace `YOUR_WIDGET_HOST` with your GitHub Pages URL (or CDN URL), then paste into a page:

```html
<script
  src="YOUR_WIDGET_HOST/widget.js"
  data-css="YOUR_WIDGET_HOST/widget.css"
  data-client="mcm-test"
  data-api="https://mcm-sba-proxy.mcmorrow-james-m.workers.dev"
  defer
></script>
```

## Inline Embed

```html
<div id="mcm-sba-inline"></div>
<script
  src="YOUR_WIDGET_HOST/widget.js"
  data-css="YOUR_WIDGET_HOST/widget.css"
  data-client="mcm-test"
  data-api="https://mcm-sba-proxy.mcmorrow-james-m.workers.dev"
  data-inline="#mcm-sba-inline"
  defer
></script>
```

## iFrame Fallback

```html
<iframe
  src="YOUR_WIDGET_HOST/embed.html?client=mcm-test&api=https%3A%2F%2Fmcm-sba-proxy.mcmorrow-james-m.workers.dev"
  style="width:100%;height:720px;border:0;border-radius:16px;overflow:hidden;"
  loading="lazy"
></iframe>
```

## Publishing via GitHub Pages

1. Create a new repo (e.g. `mcm-sba-widget`)
2. Add these files at repo root
3. GitHub → Settings → Pages → Deploy from branch `main` → `/ (root)`
4. Your widget host URL will look like:
   `https://YOURUSERNAME.github.io/mcm-sba-widget/`

