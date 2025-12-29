# MCM Smart Booking Assistant  
**Production Widget – Lead & Appointment Conversion Engine**

The **MCM Smart Booking Assistant** is a lightweight, centrally hosted widget that turns website visitors into **booked appointments and qualified leads**.

This is **not a chatbot**.  
It’s a **conversion system** designed for local businesses.

---

## What This Widget Does

✔ Converts website visitors into bookings or appointment requests  
✔ Works with or without a calendar (Calendly, Acuity, Square, etc.)  
✔ Centrally managed (no per-site backend setup)  
✔ Per-client branding, services, routing, and messaging  
✔ Instant email notifications via Brevo  
✔ Logs every lead + event to Google Sheets  
✔ Embeds on **any website** (WordPress, Shopify, Squarespace, Wix, static sites)

---

## Core Features (MVP)

### 1) Appointment Booking (Painkiller)
- Real calendar embed when available
- Automatic fallback to “request appointment” if no calendar exists

### 2) Structured Lead Capture (Bundled)
- Name, email, phone, preferred time, message
- Service + urgency context included

### 3) Light “AI-Style” Assistant Wrapper
- Friendly intro
- Guided service selection
- Urgency triage (feels smart without being fragile)

### 4) Lead Routing
- Email notifications per client
- Per-client From / Reply-To support
- Central Brevo delivery (authenticated + reliable)

### 5) Reporting
- Leads + events logged to Google Sheets
- Easy export to dashboards later

---

## How It Works (High Level)

```
Website Visitor
   ↓
Smart Booking Assistant Widget
   ↓
Service Selection + Triage
   ↓
[Calendar Booking] OR [Request Appointment]
   ↓
Google Sheets + Email Notification
```

---

## Widget Hosting

The widget is hosted via **GitHub Pages** and embedded using a simple `<script>` tag.

Example hosted URL:

```
https://mcmorrowjm.github.io/mcm-sba-widget/
```

---

## Embed Instructions

### Standard Script Embed (Recommended)

Paste **before `</body>`** on the client website:

```html
<script
  src="https://mcmorrowjm.github.io/mcm-sba-widget/widget.js"
  data-client="CLIENT_ID">
</script>
```

Example:

```html
<script
  src="https://mcmorrowjm.github.io/mcm-sba-widget/widget.js"
  data-client="mcm-test">
</script>
```

---

## Client Configuration (Google Sheet)

Each client is configured via a single row in the **Clients** sheet.

### Required Columns

| Column Name | Description |
|------------|------------|
| client_id | Unique client identifier |
| business_name | Displayed name |
| status | active / paused |
| routing_emails | Comma-separated notification emails |
| allowed_domains | Allowed domains (optional) |
| services_json | Services + booking rules |

---

### Optional / Advanced Columns

| Column | Purpose |
|------|--------|
| primary_cta_label | Overrides main button text (default: Get Scheduled) |
| brand_primary_color | Widget accent color |
| brand_button_label | Secondary fallback CTA |
| from_email | Email “From” address |
| from_name | Email “From” name |
| reply_to | Reply-To email |
| booking_mode | instant / request / both |
| timezone | Client timezone |

---

## CTA Logic (Important)

The widget determines button text in this order:

1. `primary_cta_label` (per client)
2. `brand_button_label`
3. Default → **Get Scheduled**

**No redeploy needed** — edit the sheet only.

---

## Booking Behavior Logic

For each service in `services_json`:

| booking_url | request_fallback | Result |
|------------|------------------|--------|
| Present | any | Calendar booking |
| Empty | true | Request appointment |
| Empty | false | Service hidden |

---

## Example `services_json`

### No-Calendar Client (Request-Only)

```json
[
  {
    "id": "emergency-repair",
    "label": "Emergency Repair",
    "description": "Urgent help needed now",
    "booking_url": "",
    "request_fallback": true
  },
  {
    "id": "scheduled-service",
    "label": "Scheduled Service",
    "description": "Non-urgent repair or maintenance",
    "booking_url": "",
    "request_fallback": true
  }
]
```

### Calendar-Ready Client

```json
[
  {
    "id": "scheduled-service",
    "label": "Scheduled Service",
    "description": "Book a standard appointment",
    "booking_url": "https://calendly.com/client/scheduled",
    "request_fallback": true
  }
]
```

---

## Email Delivery

- Emails are sent via **Brevo (Sendinblue)**  
- Authenticated sender domain
- Reliable delivery
- Per-client From / Reply-To support

---

## Debug & Testing

### Test Notification Endpoint
Used to verify routing + email delivery:

```
?action=test_notify&client=CLIENT_ID
```

---

## Supported Platforms

✔ WordPress  
✔ Shopify  
✔ Squarespace  
✔ Wix  
✔ Webflow  
✔ Static HTML sites  

---

## Positioning (Internal)

> “We install a Smart Booking Assistant that turns website visitors into booked appointments and qualified leads — without buying more ads.”

---

## Maintained By

**MCM LLC**  
Smart systems for local business growth.
