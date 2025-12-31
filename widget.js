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
      phone: String(config.business_phone || config.phone_number || config.phone || "").trim(),
    };

    const state = { urgencyKey: "", urgencyLabel: "" };

    if (inlineSelector) {
      const mount = document.querySelector(inlineSelector);
      if (!mount) {
        console.warn("[MCM SBA] Inline mount not found:", inlineSelector);
        return;
      }
      renderInline_(mount, theme, state);
      postEvent_("widget_render_inline", {});
    } else {
      renderFloating_(theme, state);
      postEvent_("widget_render_floating", {});
    }
  }

  function renderFloating_(theme, state) {
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

    const panel = buildPanel_(theme, { state });
    document.body.appendChild(panel);

    const open = () => {
      overlay.style.display = "block";
      panel.classList.add("open");
      try { document.documentElement.style.overflow = "hidden"; } catch (_) {}
      postEvent_("widget_open", {});
    };
    const close = () => {
      overlay.style.display = "none";
      panel.classList.remove("open");
      try { document.documentElement.style.overflow = ""; } catch (_) {}
      postEvent_("widget_close", {});
    };

    btn.addEventListener("click", open);
    overlay.addEventListener("click", close);
    panel.querySelector(".mcm-sba-close").addEventListener("click", close);
  }

  function renderInline_(mount, theme, state) {
    const panel = buildPanel_(theme, { inline: true, state });
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
      <div class="mcm-sba-grab" aria-hidden="true"></div>
      <div class="mcm-sba-header">
        <button class="mcm-sba-back" id="mcm-sba-back" aria-label="Back" style="display:none;">‹</button>
        <div>
          <p class="mcm-sba-title" id="mcm-sba-title">${escapeHtml_(theme.business)}</p>
          <p class="mcm-sba-step" id="mcm-sba-stepline">Step 1 of 3</p>
        </div>
        <button class="mcm-sba-close" aria-label="Close">×</button>
      </div>
      <div class="mcm-sba-body" id="mcm-sba-body"></div>
      <div class="mcm-sba-footer" id="mcm-sba-footer" style="display:none;"></div>
    `;

    const state = opts.state || { urgencyKey:"", urgencyLabel:"" };
    state._stack = [];
    const body = panel.querySelector("#mcm-sba-body");
    const footer = panel.querySelector("#mcm-sba-footer");
    const backBtn = panel.querySelector("#mcm-sba-back");

    const ui = { panel, body, footer, backBtn };
    renderUrgency_(ui, theme, state);
    return panel;
  }

  function setHeader_(ui, title, stepText, canBack) {
    const t = ui.panel.querySelector("#mcm-sba-title");
    const s = ui.panel.querySelector("#mcm-sba-stepline");
    if (t) t.textContent = title || "";
    if (s) s.textContent = stepText || "";
    if (ui.backBtn) ui.backBtn.style.display = canBack ? "inline-flex" : "none";
  }

  function pushView_(ui, renderFn) {
    // Save current body+footer HTML so Back can restore quickly (no re-fetch)
    ui._prev = ui._prev || [];
    ui._prev.push({ body: ui.body.innerHTML, footer: ui.footer.innerHTML, footerDisplay: ui.footer.style.display });
    ui.backBtn.onclick = () => popView_(ui);
    ui.backBtn.style.display = ui._prev.length ? "inline-flex" : "none";
    renderFn();
  }

  function popView_(ui) {
    ui._prev = ui._prev || [];
    const prev = ui._prev.pop();
    if (!prev) return;
    ui.body.innerHTML = prev.body;
    ui.footer.innerHTML = prev.footer;
    ui.footer.style.display = prev.footerDisplay || "none";
    ui.backBtn.style.display = ui._prev.length ? "inline-flex" : "none";
  }

  function renderUrgency_(ui, theme, state) {
    setHeader_(ui, theme.business, "Step 1 of 3", false);
    ui.footer.style.display = "none";

    ui.body.innerHTML = `
      <div class="mcm-sba-muted" style="margin-bottom:10px;"><b>Quick question</b> — how quickly do you need help?</div>
      <div class="mcm-sba-list" role="listbox" aria-label="Urgency">
        <button class="mcm-sba-rowitem" id="mcm-sba-urg-today" role="option">
          <div>
            Urgent — today
            <span class="sub">System down, security issue, or can’t work</span>
          </div>
          <span class="chev">›</span>
        </button>
        <button class="mcm-sba-rowitem" id="mcm-sba-urg-week" role="option">
          <div>
            This week
            <span class="sub">Non-urgent support or follow-up</span>
          </div>
          <span class="chev">›</span>
        </button>
        <button class="mcm-sba-rowitem" id="mcm-sba-urg-quote" role="option">
          <div>
            Quote / general question
            <span class="sub">Pricing, onboarding, or “do you handle…”</span>
          </div>
          <span class="chev">›</span>
        </button>
      </div>
      <div id="mcm-sba-urg-extra" style="margin-top:10px;"></div>
    `;

    const setUrgency = (key, label) => {
      state.urgencyKey = key;
      state.urgencyLabel = label;
      postEvent_("urgency_selected", { urgency: key, urgency_label: label });

      // Optional HOT helper: show a call-now button if a phone number exists
      const extra = ui.body.querySelector("#mcm-sba-urg-extra");
      if (key === "today" && theme.phone) {
        extra.innerHTML = `
          <div class="mcm-sba-card">
            <b>Urgent request flagged as HOT</b><br/>
            <span class="mcm-sba-muted">If this is an emergency, call now. Otherwise, continue to get scheduled.</span>
            <div class="mcm-sba-actions" style="margin-top:10px;">
              <a class="mcm-sba-btn" href="tel:${escapeAttr_(theme.phone)}" style="background:${escapeAttr_(theme.color)}; color:#fff; text-decoration:none; display:inline-block;">Call now</a>
              <button class="mcm-sba-secondary" id="mcm-sba-urg-continue">Continue</button>
            </div>
          </div>
        `;
        ui.body.querySelector("#mcm-sba-urg-continue").addEventListener("click", () => {
          renderServicePicker_(ui, theme, state);
        });
        return;
      }

      renderServicePicker_(ui, theme, state);
    };

    ui.body.querySelector("#mcm-sba-urg-today").addEventListener("click", () => setUrgency("today", "Urgent — today"));
    ui.body.querySelector("#mcm-sba-urg-week").addEventListener("click", () => setUrgency("week", "This week"));
    ui.body.querySelector("#mcm-sba-urg-quote").addEventListener("click", () => setUrgency("quote", "Quote / general question"));
  }

  function renderServicePicker_(ui, theme, state) {
    setHeader_(ui, theme.business, "Step 2 of 3", true);

    pushView_(ui, () => {
      ui.body.innerHTML = `
        <div class="mcm-sba-muted" style="margin-bottom:10px;">Choose what you need help with:</div>
        <div id="mcm-sba-services"></div>
      `;

      ui.footer.style.display = "block";
      ui.footer.innerHTML = `
        <div class="mcm-sba-muted" style="margin-bottom:8px;">Not sure which option fits?</div>
        <button class="mcm-sba-primary" id="mcm-sba-request" style="background:${escapeAttr_(theme.color)}; color:#fff;">${escapeHtml_(theme.primaryCta || "Get Scheduled")}</button>
      `;

      const servicesEl = ui.body.querySelector("#mcm-sba-services");
      const requestBtn = ui.footer.querySelector("#mcm-sba-request");

      // Hide request button if booking_mode is strictly instant
      if (String(theme.bookingMode).toLowerCase() === "instant") {
        requestBtn.style.display = "none";
        ui.footer.style.display = "none";
      }

      theme.services.forEach(svc => {
        const b = document.createElement("button");
        b.className = "mcm-sba-rowitem";
        b.innerHTML = `
          <div>
            ${escapeHtml_(svc.label || "Service")}
            <span class="sub">${escapeHtml_(svc.description || "")}</span>
          </div>
          <span class="chev">›</span>
        `;
        b.addEventListener("click", () => {
        postEvent_("service_selected", { service_id: svc.id || "", service_label: svc.label || "" });

        const bookingUrl = String(svc.booking_url || "").trim();
        const canFallback = svc.request_fallback !== false;
        const mode = String(theme.bookingMode || "both").toLowerCase();

        // If a booking URL exists, show the embedded calendar/booking iframe
        if (bookingUrl) {
          renderBooking_(ui, theme, svc, state);
          return;
        }

        // If no booking URL, automatically fall back to request flow (unless disabled / instant-only)
        if (canFallback && mode !== "instant") {
          postEvent_("request_mode_open", { service_id: svc.id || "", service_label: svc.label || "" });
          renderRequestForm_(ui, theme, svc, state);
          return;
        }

        // Graceful fallback
        ui.body.innerHTML = `
          <div class="mcm-sba-card">
            <b>${escapeHtml_(svc.label || "Service")}</b><br/>
            Online booking is not available for this service. Please contact us and we’ll help you get scheduled.
          </div>
        `;
        ui.footer.style.display = "block";
        ui.footer.innerHTML = `<button class="mcm-sba-secondary" id="mcm-sba-back2">Back</button>`;
        ui.footer.querySelector("#mcm-sba-back2").addEventListener("click", () => popView_(ui));
      });
        servicesEl.appendChild(b);
      });

      requestBtn.addEventListener("click", () => {
        postEvent_("request_mode_open", {});
        renderRequestForm_(ui, theme, null, state);
      });
    });
  }

  function renderBooking_(ui, theme, svc, state) {
    setHeader_(ui, theme.business, "Step 3 of 3", true);
    const bookingUrl = String(svc.booking_url || "").trim();
    const canFallback = svc.request_fallback !== false;

    pushView_(ui, () => {
      ui.body.innerHTML = `
      <div class="mcm-sba-muted" style="margin-bottom:10px;"><b>${escapeHtml_(svc.label || "Booking")}</b></div>
      ${bookingUrl ? `<iframe class="mcm-sba-iframe" src="${escapeAttr_(bookingUrl)}" loading="lazy"></iframe>` : `
        <div class="mcm-sba-card">No booking link is configured for this service.</div>
      `}
    `;

      ui.footer.style.display = "block";
      ui.footer.innerHTML = `
        <div class="mcm-sba-actions" style="margin-top:0;">
          <button class="mcm-sba-secondary" id="mcm-sba-done">Done</button>
          ${canFallback ? `<button class="mcm-sba-primary" id="mcm-sba-request" style="background:${escapeAttr_(theme.color)};color:#fff;">Can’t find a time? ${escapeHtml_(theme.primaryCta || "Get Scheduled")}</button>` : ""}
        </div>
      `;

    // Track booking view (best-effort; true completion requires provider webhooks)
    postEvent_("booking_opened", { service_id: svc.id || "", service_label: svc.label || "", urgency: state && state.urgencyKey || "", urgency_label: state && state.urgencyLabel || "" });

    const done = ui.footer.querySelector("#mcm-sba-done");
    if (done) done.addEventListener("click", () => {
      const closeBtn = ui.panel.querySelector(".mcm-sba-close");
      if (closeBtn) closeBtn.click();
    });

    const req = ui.footer.querySelector("#mcm-sba-request");
    if (req) {
      req.addEventListener("click", () => {
        postEvent_("request_fallback_opened", { service_id: svc.id || "", service_label: svc.label || "", urgency: state && state.urgencyKey || "", urgency_label: state && state.urgencyLabel || "" });
        renderRequestForm_(ui, theme, svc, state);
      });
    }
    });
  }

  function renderRequestForm_(ui, theme, svc, state) {
    setHeader_(ui, theme.business, "Step 3 of 3", true);
    const serviceId = svc?.id || "";
    const serviceLabel = svc?.label || "";

    pushView_(ui, () => {
    ui.body.innerHTML = `
      <div class="mcm-sba-muted" style="margin-bottom:10px;">
        <b>${escapeHtml_(theme.primaryCta || "Get Scheduled")}</b> — we’ll contact you ASAP.
        ${state && state.urgencyKey === "today" ? ` <span class="mcm-sba-pill" style="background:${escapeAttr_(theme.color)};color:#fff;">HOT</span>` : ""}
      </div>

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

      <div class="mcm-sba-muted" id="mcm-status" style="margin-top:10px;"></div>
    `;

    ui.footer.style.display = "block";
    ui.footer.innerHTML = `
      <div class="mcm-sba-actions" style="margin-top:0;">
        <button class="mcm-sba-secondary" id="mcm-back">Back</button>
        <button class="mcm-sba-primary" id="mcm-send" style="background:${escapeAttr_(theme.color)};color:#fff;">Send request</button>
      </div>
    `;

    ui.footer.querySelector("#mcm-back").addEventListener("click", () => popView_(ui));

    ui.footer.querySelector("#mcm-send").addEventListener("click", async () => {
      const name = val_("#mcm-name");
      const email = val_("#mcm-email");
      const phone = val_("#mcm-phone");
      const preferred_time = val_("#mcm-time");
      const message = val_("#mcm-msg");
      const hp = val_("#mcm-hp");

      const status = ui.body.querySelector("#mcm-status");
      const sendBtn = ui.footer.querySelector("#mcm-send");
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = "Sending…";
      }
      status.textContent = "";

      const payload = {
        client_id: clientId,
        session_id: sessionId,
        intent: (state && state.urgencyKey === "today") ? "urgent" : "request",
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
        postEvent_("lead_submitted", { intent: (state && state.urgencyKey === "today") ? "urgent" : "request", lead_id: res.lead_id || "" });
        renderSuccess_(ui, theme, {
          hot: (state && state.urgencyKey === "today"),
          serviceLabel,
          phone
        });
      } else {
        status.textContent = "⚠️ Something went wrong. Please try again.";
        if (sendBtn) {
          sendBtn.disabled = false;
          sendBtn.textContent = "Send request";
        }
      }
    });
    });
  }

  function renderSuccess_(ui, theme, meta) {
    setHeader_(ui, theme.business, "Done", true);
    ui.body.innerHTML = `
      <div class="mcm-sba-card" style="text-align:center; padding:16px;">
        <div style="font-size:34px; line-height:1;">✅</div>
        <div style="font-weight:900; margin-top:8px;">Request received</div>
        <div class="mcm-sba-muted" style="margin-top:6px;">We’ll reach out ${meta.hot ? "ASAP" : "soon"}.</div>
      </div>
      <div class="mcm-sba-card">
        <div class="mcm-sba-muted" style="margin-bottom:6px;">Summary</div>
        <div><b>Type:</b> ${meta.hot ? "Urgent" : "Request"}</div>
        ${meta.serviceLabel ? `<div style="margin-top:4px;"><b>Service:</b> ${escapeHtml_(meta.serviceLabel)}</div>` : ""}
        ${meta.phone ? `<div style="margin-top:4px;"><b>Phone:</b> ${escapeHtml_(meta.phone)}</div>` : ""}
      </div>
    `;
    ui.footer.style.display = "block";
    ui.footer.innerHTML = `
      <button class="mcm-sba-primary" id="mcm-done" style="background:${escapeAttr_(theme.color)}; color:#fff;">Done</button>
      <div class="mcm-sba-muted" style="margin-top:10px; text-align:center;">
        <a href="#" id="mcm-again" style="color:inherit;">Submit another request</a>
      </div>
    `;
    ui.footer.querySelector("#mcm-done").addEventListener("click", () => {
      const closeBtn = ui.panel.querySelector(".mcm-sba-close");
      if (closeBtn) closeBtn.click();
    });
    ui.footer.querySelector("#mcm-again").addEventListener("click", (e) => {
      e.preventDefault();
      // Reset view stack and start over, keep urgency empty
      ui._prev = [];
      renderUrgency_(ui, theme, { urgencyKey:"", urgencyLabel:"" });
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
