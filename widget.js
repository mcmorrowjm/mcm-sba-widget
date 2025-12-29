(() => {
  const SCRIPT = document.currentScript;
  if (!SCRIPT) return;

  const clientId = SCRIPT.getAttribute("data-client") || "";
  const apiBase = (SCRIPT.getAttribute("data-api") || "").replace(/\/$/, "");
  const inlineSelector = SCRIPT.getAttribute("data-inline") || ""; // e.g. "#mcm-sba-inline"

  if (!clientId || !apiBase) {
    console.warn("[MCM SBA] Missing data-client or data-api");
    return;
  }

  const VERSION = "0.1.0";
  const sessionId = getOrCreateSessionId_();

  injectCss_();

  // Boot
  boot_().catch(err => console.error("[MCM SBA] boot error", err));

  async function boot_() {
    const config = await getConfig_(clientId);
    if (!config || !config.ok) {
      console.warn("[MCM SBA] Config load failed", config);
      return;
    }

    const theme = {
      color: config.brand_primary_color || "#111111",
      // Floating launcher button label (per-client override)
      label: (config.primary_cta_label || config.brand_button_label || "Get Scheduled"),
      // Primary CTA used inside the panel for request-mode buttons
      primaryCta: (config.primary_cta_label || "Get Scheduled"),
      business: config.business_name || "Appointments",
      bookingMode: config.booking_mode || "both",
      services: Array.isArray(config.services) ? config.services : [],
    };

    if (inlineSelector) {
      const mount = document.querySelector(inlineSelector);
      if (!mount) {
        console.warn("[MCM SBA] Inline mount not found:", inlineSelector);
        return;
      }
      renderInline_(mount, theme);
      postEvent_("widget_render_inline", {});
    } else {
      renderFloating_(theme);
      postEvent_("widget_render_floating", {});
    }
  }

  function renderFloating_(theme) {
    const launcher = document.createElement("div");
    launcher.id = "mcm-sba-launcher";

    const btn = document.createElement("button");
    btn.className = "mcm-sba-btn";
    btn.textContent = theme.label;
    btn.style.background = theme.color;
    btn.style.color = "#fff";

    launcher.appendChild(btn);
    document.body.appendChild(launcher);

    const overlay = document.createElement("div");
    overlay.id = "mcm-sba-overlay";
    document.body.appendChild(overlay);

    const panel = buildPanel_(theme);
    document.body.appendChild(panel);

    const open = () => {
      overlay.style.display = "block";
      panel.classList.add("open");
      postEvent_("widget_open", {});
    };
    const close = () => {
      overlay.style.display = "none";
      panel.classList.remove("open");
      postEvent_("widget_close", {});
    };

    btn.addEventListener("click", open);
    overlay.addEventListener("click", close);
    panel.querySelector(".mcm-sba-close").addEventListener("click", close);
  }

  function renderInline_(mount, theme) {
    const panel = buildPanel_(theme, { inline: true });
    panel.style.position = "relative";
    panel.style.transform = "none";
    panel.style.height = "auto";
    panel.style.width = "100%";
    panel.style.borderRadius = "18px";
    panel.style.boxShadow = "0 10px 25px rgba(0,0,0,.10)";
    panel.classList.add("open");
    mount.appendChild(panel);
  }

  function buildPanel_(theme, opts = {}) {
    const panel = document.createElement("div");
    panel.id = "mcm-sba-panel";

    panel.innerHTML = `
      <div class="mcm-sba-header">
        <div>
          <p class="mcm-sba-title">${escapeHtml_(theme.business)}</p>
          <p class="mcm-sba-sub">Book instantly or get scheduled — we’ll route it right away.</p>
        </div>
        <button class="mcm-sba-close" aria-label="Close">×</button>
      </div>
      <div class="mcm-sba-body">
        <div class="mcm-sba-card" id="mcm-sba-step"></div>
      </div>
    `;

    const step = panel.querySelector("#mcm-sba-step");
    renderServicePicker_(step, theme);
    return panel;
  }

  function renderServicePicker_(container, theme) {
    container.innerHTML = `
      <div class="mcm-sba-muted">What would you like to book?</div>
      <div style="margin-top:10px" id="mcm-sba-services"></div>
      <div class="mcm-sba-actions">
        <button class="mcm-sba-secondary" id="mcm-sba-request">Get Scheduled</button>
      </div>
    `;

    const servicesEl = container.querySelector("#mcm-sba-services");
    const requestBtn = container.querySelector("#mcm-sba-request");

    // Match per-client CTA label
    requestBtn.textContent = theme.primaryCta || "Get Scheduled";
    // Hide request button if booking_mode is strictly instant
    if (String(theme.bookingMode).toLowerCase() === "instant") {
      requestBtn.style.display = "none";
    }

    theme.services.forEach(svc => {
      const b = document.createElement("button");
      b.className = "mcm-sba-service";
      b.innerHTML = `
        <div style="font-weight:800">${escapeHtml_(svc.label || "Service")}</div>
        <div class="mcm-sba-muted">${escapeHtml_(svc.description || "")}</div>
      `;
      b.addEventListener("click", () => {
        postEvent_("service_selected", { service_id: svc.id || "", service_label: svc.label || "" });

        const bookingUrl = String(svc.booking_url || "").trim();
        const canFallback = svc.request_fallback !== false;
        const mode = String(theme.bookingMode || "both").toLowerCase();

        // If a booking URL exists, show the embedded calendar/booking iframe
        if (bookingUrl) {
          renderBooking_(container, theme, svc);
          return;
        }

        // If no booking URL, automatically fall back to request flow (unless disabled / instant-only)
        if (canFallback && mode !== "instant") {
          postEvent_("request_mode_open", { service_id: svc.id || "", service_label: svc.label || "" });
          renderRequestForm_(container, theme, svc);
          return;
        }

        // Graceful fallback
        container.innerHTML = `
          <div class="mcm-sba-card">
            <b>${escapeHtml_(svc.label || "Service")}</b><br/>
            Online booking is not available for this service. Please contact us and we’ll help you get scheduled.
          </div>
          <div class="mcm-sba-actions">
            <button class="mcm-sba-secondary" id="mcm-sba-back">Back</button>
          </div>
        `;
        container.querySelector("#mcm-sba-back").addEventListener("click", () => renderServicePicker_(container, theme));
      });servicesEl.appendChild(b);
    });

    requestBtn.addEventListener("click", () => {
      postEvent_("request_mode_open", {});
      renderRequestForm_(container, theme, null);
    });
  }

  function renderBooking_(container, theme, svc) {
    const bookingUrl = String(svc.booking_url || "").trim();
    const canFallback = svc.request_fallback !== false;

    container.innerHTML = `
      <div class="mcm-sba-muted"><b>${escapeHtml_(svc.label || "Booking")}</b></div>
      ${bookingUrl ? `<iframe class="mcm-sba-iframe" src="${escapeAttr_(bookingUrl)}" loading="lazy"></iframe>` : `
        <div class="mcm-sba-card">No booking link is configured for this service.</div>
      `}
      <div class="mcm-sba-actions">
        <button class="mcm-sba-secondary" id="mcm-sba-back">Back</button>
        <button class="mcm-sba-secondary" id="mcm-sba-done">Done</button>
        ${canFallback ? `<button class="mcm-sba-primary" id="mcm-sba-request" style="background:${theme.color};color:#fff;">Can’t find a time? ${escapeHtml_(theme.primaryCta || "Get Scheduled")}</button>` : ""}
      </div>
    `;

    // Track booking view (best-effort; true completion requires provider webhooks)
    postEvent_("booking_opened", { service_id: svc.id || "", service_label: svc.label || "" });

    container.querySelector("#mcm-sba-back").addEventListener("click", () => {
      renderServicePicker_(container, theme);
    });

    container.querySelector("#mcm-sba-done").addEventListener("click", () => {
      const panel = container.closest("#mcm-sba-panel");
      const closeBtn = panel && panel.querySelector(".mcm-sba-close");
      if (closeBtn) closeBtn.click();
    });

    const req = container.querySelector("#mcm-sba-request");
    if (req) {
      req.addEventListener("click", () => {
        postEvent_("request_fallback_opened", { service_id: svc.id || "", service_label: svc.label || "" });
        renderRequestForm_(container, theme, svc);
      });
    }
  }

  function renderRequestForm_(container, theme, svc) {
    const serviceId = svc?.id || "";
    const serviceLabel = svc?.label || "";

    container.innerHTML = `
      <div class="mcm-sba-muted"><b>${escapeHtml_(theme.primaryCta || "Get Scheduled")}</b> — we’ll contact you ASAP.</div>

      <div class="mcm-sba-label">Name</div>
      <input class="mcm-sba-input" id="mcm-name" placeholder="Full name" />

      <div class="mcm-sba-row">
        <div>
          <div class="mcm-sba-label">Email</div>
          <input class="mcm-sba-input" id="mcm-email" placeholder="you@email.com" />
        </div>
        <div>
          <div class="mcm-sba-label">Phone</div>
          <input class="mcm-sba-input" id="mcm-phone" placeholder="(707) 555-1212" />
        </div>
      </div>

      <div class="mcm-sba-label">Preferred time</div>
      <input class="mcm-sba-input" id="mcm-time" placeholder="Tomorrow afternoon / ASAP / next week" />

      <div class="mcm-sba-label">What’s going on?</div>
      <textarea class="mcm-sba-input" id="mcm-msg" rows="4" placeholder="Quick details help us route this properly"></textarea>

      <!-- Honeypot (spam trap): keep hidden -->
      <div style="position:absolute;left:-5000px;top:auto;width:1px;height:1px;overflow:hidden;">
        <label>Company website</label>
        <input id="mcm-hp" />
      </div>

      <div class="mcm-sba-actions">
        <button class="mcm-sba-secondary" id="mcm-back">Back</button>
        <button class="mcm-sba-primary" id="mcm-send" style="background:${theme.color};color:#fff;">Send request</button>
      </div>

      <div class="mcm-sba-muted" id="mcm-status" style="margin-top:10px;"></div>
    `;

    container.querySelector("#mcm-back").addEventListener("click", () => {
      renderServicePicker_(container, theme);
    });

    container.querySelector("#mcm-send").addEventListener("click", async () => {
      const name = val_("#mcm-name");
      const email = val_("#mcm-email");
      const phone = val_("#mcm-phone");
      const preferred_time = val_("#mcm-time");
      const message = val_("#mcm-msg");
      const hp = val_("#mcm-hp");

      const status = container.querySelector("#mcm-status");
      status.textContent = "Sending…";

      const payload = {
        client_id: clientId,
        session_id: sessionId,
        intent: "request",
        service_id: serviceId,
        service_label: serviceLabel,
        name,
        email,
        phone,
        preferred_time,
        message,
        company_website: hp,
        source_url: location.href,
        referrer: document.referrer || ""
      };

      const res = await postLead_(payload);
      if (res && res.ok) {
        postEvent_("lead_submitted", { intent: "request", lead_id: res.lead_id || "" });
        status.textContent = "✅ Sent. We’ll reach out shortly.";
      } else {
        status.textContent = "⚠️ Something went wrong. Please try again.";
      }
    });
  }

  async function getConfig_(client) {
    const url = `${apiBase}?action=config&client=${encodeURIComponent(client)}`;
    const r = await fetch(url, { method: "GET" });
    return await r.json();
  }

  async function postEvent_(event_name, meta) {
    try {
      const url = `${apiBase}?action=event`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          session_id: sessionId,
          event_name,
          service_id: meta?.service_id || "",
          meta: { ...meta, v: VERSION },
          source_url: location.href,
          referrer: document.referrer || ""
        })
      });
    } catch (_) {}
  }

  async function postLead_(payload) {
    try {
      const url = `${apiBase}?action=lead`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      return await r.json();
    } catch (_) {
      return { ok: false };
    }
  }

  function injectCss_() {
    const href = SCRIPT.getAttribute("data-css") || "";
    if (href) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
      return;
    }

    // Default assumes widget.css is alongside widget.js
    const jsUrl = new URL(SCRIPT.src);
    jsUrl.pathname = jsUrl.pathname.replace(/widget\.js$/, "widget.css");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = jsUrl.toString();
    document.head.appendChild(link);
  }

  function getOrCreateSessionId_() {
    const key = "mcm_sba_session_id";
    try {
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      const sid = "s_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
      localStorage.setItem(key, sid);
      return sid;
    } catch (_) {
      return "s_" + Math.random().toString(16).slice(2);
    }
  }

  function val_(sel) {
    const el = document.querySelector(sel);
    return el ? String(el.value || "").trim() : "";
  }

  function escapeHtml_(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  function escapeAttr_(s) {
    return String(s || "").replace(/"/g, "%22");
  }
})();
