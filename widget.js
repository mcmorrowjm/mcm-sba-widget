/* MCM Smart Booking Assistant — Apple UI + Production Logic (v3.0.1)
   - Preserves Apple-style UI (launcher, overlay, panel, list rows)
   - Fixes Calendly routing for "This week" (standard) services
   - Keeps "Urgent — today" -> HOT lead capture (request) by design
   - Uses config.menu_text defaults if blank
   - Uses config.show_urgent_menu to toggle first menu
   - NO runtime document.currentScript usage (only at boot)
*/

(() => {
  const SCRIPT = document.currentScript;
  if (!SCRIPT) return;

  const clientId = (SCRIPT.getAttribute("data-client") || "").trim();
  const apiBase = (SCRIPT.getAttribute("data-api") || "").replace(/\/$/, "").trim();
  const inlineSelector = (SCRIPT.getAttribute("data-inline") || "").trim();

  if (!clientId || !apiBase) {
    console.warn("[MCM SBA] Missing data-client or data-api");
    return;
  }

  const sessionId = getOrCreateSessionId_();
  injectCss_();

  boot_().catch((err) => console.error("[MCM SBA] boot error", err));

  async function boot_() {
    const config = await getConfig_(clientId);
    if (!config || !config.ok) return;

    // Normalize services (ID + booking_url + request_fallback)
    const rawServices = Array.isArray(config.services) ? config.services : [];
    const services = rawServices
      .map((s, i) => normalizeService_(s, i))
      .filter((s) => s && typeof s === "object");

    // Default booking URL: prefer config.booking_url, else first service booking_url
    let defaultUrl = String(config.booking_url || config.calendar_url || "").trim();
    if (!defaultUrl) {
      const firstWithUrl = services.find((s) => String(s.booking_url || "").trim());
      if (firstWithUrl) defaultUrl = String(firstWithUrl.booking_url || "").trim();
    }

    const theme = {
      color: String(config.brand_primary_color || "#111111").trim(),
      label: String(config.primary_cta_label || config.brand_button_label || "Get Scheduled").trim(),
      primaryCta: String(config.primary_cta_label || "Get Scheduled").trim(),
      business: String(config.business_name || "Appointments").trim(),
      bookingMode: String(config.booking_mode || "both").trim(),
      services,
      phone: String(config.business_phone || config.phone_number || config.phone || "").trim(),
      defaultUrl,
      showUrgentMenu: normalizeBool_(config.show_urgent_menu),
      text: (config.menu_text && typeof config.menu_text === "object") ? config.menu_text : {}
    };

    // Build robust service map: map by multiple keys
    const serviceMap = {};
    theme.services.forEach((s, i) => {
      const id = String(s.id || `svc_${i}`);
      const idxId = String(s._idxId || `svc_${i}`);
      const safeId = String(s._safeId || id);
      s.id = id;
      s._safeId = safeId;
      s._idxId = idxId;

      serviceMap[id] = s;
      serviceMap[safeId] = s;
      serviceMap[idxId] = s;
    });

    const state = {
      stack: ["home"],
      data: {
        urgency: "",           // "today" | "standard" | "quote"
        urgencyLabel: "",
        service: null,
        serviceLabel: "",
        bookingAttemptLogged: false
      }
    };

    if (inlineSelector) {
      const mount = document.querySelector(inlineSelector);
      if (mount) {
        renderInline_(mount, theme, state, serviceMap);
        postEvent_("widget_render_inline", {});
        return;
      }
    }

    renderFloating_(theme, state, serviceMap);
    postEvent_("widget_render_floating", {});
  }

  // ---------- RENDER: Floating ----------
  function renderFloating_(theme, state, serviceMap) {
    const launcher = document.createElement("div");
    launcher.id = "mcm-sba-launcher";

    const iconSvg =
      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
      </svg>`;

    launcher.innerHTML = `
      <button class="mcm-sba-btn" style="background:${escapeAttr_(theme.color)}; color:#fff;">
        ${iconSvg}<span>${escapeHtml_(theme.label)}</span>
      </button>
    `;
    document.body.appendChild(launcher);

    const overlay = document.createElement("div");
    overlay.id = "mcm-sba-overlay";
    document.body.appendChild(overlay);

    const panel = document.createElement("div");
    panel.id = "mcm-sba-panel";
    document.body.appendChild(panel);

    const ui = bindPanelLogic_(panel, theme, state, serviceMap);

    const toggle = (open) => {
      const method = open ? "add" : "remove";
      overlay.classList[method]("open");
      panel.classList[method]("open");
      if (open) postEvent_("widget_open", {});
    };

    launcher.querySelector("button").onclick = () => toggle(true);
    overlay.onclick = () => toggle(false);
    ui.closeBtn.onclick = () => toggle(false);

    ui.render();
  }

  // ---------- RENDER: Inline ----------
  function renderInline_(mount, theme, state, serviceMap) {
    const panel = document.createElement("div");
    panel.id = "mcm-sba-panel";
    panel.className = "mcm-sba-inline-panel";
    mount.appendChild(panel);

    const ui = bindPanelLogic_(panel, theme, state, serviceMap);
    ui.render();
  }

  // ---------- PANEL LOGIC ----------
  function bindPanelLogic_(panel, theme, state, serviceMap) {
    panel.innerHTML = `
      <div class="mcm-sba-header">
        <button class="mcm-sba-back" style="display:none;">‹</button>
        <div>
          <p class="mcm-sba-title">${escapeHtml_(theme.business)}</p>
          <p class="mcm-sba-step">Step 1 of 3</p>
        </div>
        <button class="mcm-sba-close">×</button>
      </div>
      <div class="mcm-sba-body"></div>
      <div class="mcm-sba-footer" style="display:none;"></div>
    `;

    const els = {
      title: panel.querySelector(".mcm-sba-title"),
      step: panel.querySelector(".mcm-sba-step"),
      back: panel.querySelector(".mcm-sba-back"),
      close: panel.querySelector(".mcm-sba-close"),
      body: panel.querySelector(".mcm-sba-body"),
      footer: panel.querySelector(".mcm-sba-footer")
    };

    const render = () => {
      const currentView = state.stack[state.stack.length - 1];
      els.body.classList.remove("mcm-sba-no-pad");
      els.footer.style.display = "none";
      els.back.style.display = state.stack.length > 1 ? "inline-flex" : "none";

      if (currentView === "home") viewHome_(els, theme);
      else if (currentView === "services") viewServices_(els, theme);
      else if (currentView === "booking") viewBooking_(els, theme, state.data.service);
      else if (currentView === "request") viewRequest_(els, theme, state.data);
      else if (currentView === "success") viewSuccess_(els, theme);
    };

    panel.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;

      const action = btn.dataset.action;
      const payload = btn.dataset.payload || "";

      try {
        if (action === "back") {
          if (state.stack.length > 1) state.stack.pop();
          render();
          return;
        }

        if (action === "nav-urgent") {
          state.data.urgency = "today";
          state.data.urgencyLabel = safeMenu_(theme, "urgent").label;
          state.data.service = null;
          state.data.serviceLabel = "";
          state.stack.push("request"); // HOT lead capture by design
          render();
          return;
        }

        if (action === "nav-standard") {
          state.data.urgency = "standard";
          state.data.urgencyLabel = safeMenu_(theme, "standard").label;
          state.data.service = null;
          state.data.serviceLabel = "";
          state.stack.push("services");
          render();
          return;
        }

        if (action === "nav-quote") {
          state.data.urgency = "quote";
          state.data.urgencyLabel = safeMenu_(theme, "quote").label;
          state.data.service = null;
          state.data.serviceLabel = "";
          state.stack.push("request");
          render();
          return;
        }

        if (action === "select-service") {
          const key = String(payload || "");
          const svc = serviceMap[key] || null;

          state.data.service = svc;
          state.data.serviceLabel = svc ? String(svc.label || "General") : "General";

          postEvent_("service_selected", { service_id: svc ? svc.id : "" });

          // Decide booking vs request:
          // - If request_fallback is true => request
          // - If urgency is "today" => request
          // - Else if booking_url (or defaultUrl) exists => booking
          const svcFallback = svc ? normalizeBool_(svc.request_fallback) : false;
          const targetUrl = String((svc && svc.booking_url) ? svc.booking_url : theme.defaultUrl || "").trim();

          if (!svcFallback && targetUrl && state.data.urgency !== "today") {
            // booking path
            if (state.data.service) state.data.service.booking_url = targetUrl;
            else state.data.service = { id: "booking", label: "Booking", booking_url: targetUrl };

            state.data.bookingAttemptLogged = false;
            state.stack.push("booking");
          } else {
            // request path
            state.stack.push("request");
          }

          render();
          return;
        }

        if (action === "manual-request") {
          state.data.service = null;
          state.data.serviceLabel = "General Request";
          state.stack.push("request");
          render();
          return;
        }

        if (action === "fallback") {
          state.stack.push("request");
          render();
          return;
        }

        if (action === "submit") {
          handleSubmit_(btn, theme, state, render);
          return;
        }

        if (action === "close-overlay") {
          const ov = document.querySelector("#mcm-sba-overlay");
          if (ov) ov.click();
          return;
        }
      } catch (err) {
        console.error("[MCM SBA Error]", err);
        state.stack.push("request");
        render();
      }
    });

    els.back.setAttribute("data-action", "back");
    return { render, closeBtn: els.close };
  }

  // ---------- VIEWS ----------
  function viewHome_(els, theme) {
    els.title.textContent = theme.business;
    els.step.textContent = "Start";

    const def = {
      urgent:  { label: "Urgent — today", sub: "System down, security issue, or stoppage" },
      standard:{ label: "This week",     sub: "Non-urgent support or follow-up" },
      quote:   { label: "Quote / Question", sub: "Pricing, onboarding, or general info" },
      book:    { label: "Book Appointment", sub: "Schedule a time with us" },
      inquire: { label: "General Inquiry",  sub: "Questions about pricing or services" }
    };

    const txt = theme.text || {};

    if (theme.showUrgentMenu) {
      els.body.innerHTML = `
        <div class="mcm-sba-muted" style="margin-bottom:10px;"><b>Quick question</b> — how quickly do you need help?</div>
        <div class="mcm-sba-list">
          ${renderRowItem_("nav-urgent",  "today", "#FF3B30", (txt.urgent?.label || def.urgent.label),   (txt.urgent?.sub || def.urgent.sub))}
          ${renderRowItem_("nav-standard","week",  "#34C759", (txt.standard?.label || def.standard.label),(txt.standard?.sub || def.standard.sub))}
          ${renderRowItem_("nav-quote",   "quote", "#007AFF", (txt.quote?.label || def.quote.label),     (txt.quote?.sub || def.quote.sub))}
        </div>
      `;
    } else {
      els.body.innerHTML = `
        <div class="mcm-sba-muted" style="margin-bottom:10px;">How can we help you today?</div>
        <div class="mcm-sba-list">
          ${renderRowItem_("nav-standard","book",  "#34C759", (txt.book?.label || def.book.label),       (txt.book?.sub || def.book.sub))}
          ${renderRowItem_("nav-quote",   "inquire","#007AFF",(txt.inquire?.label || def.inquire.label),(txt.inquire?.sub || def.inquire.sub))}
        </div>
      `;
    }
  }

  function viewServices_(els, theme) {
    els.title.textContent = theme.business;
    els.step.textContent = "Select Service";

    const services = Array.isArray(theme.services) ? theme.services : [];

    els.body.innerHTML = `
      <div class="mcm-sba-muted" style="margin-bottom:10px;">Choose what you need help with:</div>
      <div class="mcm-sba-list">
        ${services.map((s) => renderRowItem_("select-service", s._safeId || s.id, null, s.label || "Service", s.description || "")).join("")}
        <button class="mcm-sba-rowitem" data-action="manual-request">
          <div>Something else?</div><span>›</span>
        </button>
      </div>
    `;
  }

  function viewBooking_(els, theme, svc) {
    const url = svc ? String(svc.booking_url || "").trim() : "";

    els.title.textContent = "Select Time";
    els.step.textContent = svc ? String(svc.label || "Booking") : "Booking";

    els.body.classList.add("mcm-sba-no-pad");
    els.body.innerHTML = `
      <iframe class="mcm-sba-iframe" src="${escapeAttr_(url)}" loading="lazy"></iframe>
    `;

    // Ensure height is adequate even if CSS is misloaded/cached (no visual redesign; just prevents tiny iframe)
    const iframe = els.body.querySelector("iframe");
    if (iframe) {
      iframe.style.width = "100%";
      iframe.style.minHeight = "680px";
      iframe.style.border = "0";
      iframe.setAttribute("title", "Scheduling");
      iframe.setAttribute("allow", "clipboard-write; fullscreen");
    }


    // Lite tracking: log "booking attempt" once per booking view (Calendly opened)
    try {
      if (svc && !state.data.bookingAttemptLogged) {
        state.data.bookingAttemptLogged = true;
        fetch(`${apiBase}?action=booking_attempt`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            client_id: clientId,
            session_id: sessionId,
            intent: "booking",
            service_id: String(svc.id || ""),
            service_label: String(svc.label || ""),
            calendly_url: String(url || ""),
            timeframe: String(state.data.urgencyLabel || state.data.urgency || "This week"),
            source_url: location.href,
            referrer: document.referrer || "",
            note: "Booking attempt (Calendly opened)"
          })
        }).catch(() => {});
      }
    } catch (_) {}

    els.footer.style.display = "block";
    els.footer.innerHTML = `
      <div class="mcm-sba-actions" style="margin-top:0;">
        <button class="mcm-sba-secondary" data-action="fallback">Can't find a time?</button>
      </div>
    `;
  }

  function viewRequest_(els, theme, data) {
    els.title.textContent = "Final Step";
    els.step.textContent = "Contact Info";

    const isHot = data.urgency === "today";
    const detailsLabel = isHot ? "Critical Issue Details" : "Details";
    const detailsPlace = isHot ? "Please describe the critical issue..." : "How can we help?";

    els.body.innerHTML = `
      <div class="mcm-sba-muted" style="margin-bottom:10px;">
        <b>${escapeHtml_(theme.primaryCta)}</b> — we’ll contact you ASAP.
        ${isHot ? ` <span class="mcm-sba-pill" style="background:${escapeAttr_(theme.color)};color:#fff;">HOT</span>` : ""}
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
          <input class="mcm-sba-input" id="mcm-phone" placeholder="(555) 123-4567" />
        </div>
      </div>

      <div class="mcm-sba-label">${escapeHtml_(detailsLabel)}</div>
      <textarea class="mcm-sba-input" id="mcm-msg" rows="3" placeholder="${escapeAttr_(detailsPlace)}"></textarea>

      <input id="mcm-hp" style="position:absolute; opacity:0; pointer-events:none; width:1px;" tabindex="-1" />
    `;

    els.footer.style.display = "block";
    els.footer.innerHTML = `
      <div class="mcm-sba-actions">
        <button class="mcm-sba-primary" data-action="submit" style="background:${escapeAttr_(theme.color)};color:#fff;">Send Request</button>
      </div>
      <div class="mcm-sba-muted" id="mcm-status" style="margin-top:10px; text-align:center;"></div>
    `;
  }

  function viewSuccess_(els, theme) {
    els.title.textContent = "Received";
    els.step.textContent = "";

    els.body.innerHTML = `
      <div class="mcm-sba-card" style="text-align:center; padding:30px 20px;">
        <div style="font-size:40px; margin-bottom:10px;">✅</div>
        <div style="font-weight:700; font-size:18px;">Received!</div>
        <div class="mcm-sba-muted" style="margin-top:5px;">We will be in touch shortly.</div>
      </div>
    `;

    els.footer.style.display = "block";
    els.footer.innerHTML = `<button class="mcm-sba-secondary" data-action="close-overlay">Close</button>`;
  }

  // ---------- UI HELPERS ----------
  function renderRowItem_(action, payload, color, title, sub) {
    const dot = color
      ? `<div style="background:${escapeAttr_(color)}; width:12px; height:12px; border-radius:50%; margin-right:12px; flex-shrink:0;"></div>`
      : "";
    return `
      <button class="mcm-sba-rowitem" data-action="${escapeAttr_(action)}" data-payload="${escapeAttr_(String(payload || ""))}" style="display:flex; align-items:center;">
        ${dot}
        <div style="flex:1;">
          ${escapeHtml_(title || "")}
          <span class="mcm-sba-muted" style="display:block; font-size:13px; margin-top:2px;">${escapeHtml_(sub || "")}</span>
        </div>
        <span>›</span>
      </button>
    `;
  }

  function safeMenu_(theme, key) {
    const def = {
      urgent:  { label: "Urgent — today", sub: "System down, security issue, or stoppage" },
      standard:{ label: "This week", sub: "Non-urgent support or follow-up" },
      quote:   { label: "Quote / Question", sub: "Pricing, onboarding, or general info" }
    };
    const t = (theme.text && theme.text[key]) ? theme.text[key] : {};
    return {
      label: String(t.label || def[key]?.label || "").trim(),
      sub: String(t.sub || def[key]?.sub || "").trim()
    };
  }

  // ---------- SUBMIT ----------
  async function handleSubmit_(btn, theme, state, renderFn) {
    btn.textContent = "Sending...";
    btn.disabled = true;

    const val = (sel) => ((document.querySelector(sel) || {}).value || "").trim();

    const payload = {
      client_id: clientId,
      session_id: sessionId,
      intent: state.data.urgency === "today" ? "urgent" : "request",
      service_id: state.data.service ? String(state.data.service.id || "") : "",
      service_label: String(state.data.serviceLabel || "General"),
      name: val("#mcm-name"),
      email: val("#mcm-email"),
      phone: val("#mcm-phone"),
      message: val("#mcm-msg"),
      company_website: val("#mcm-hp"), // honeypot
      source_url: location.href
    };

    try {
      const res = await fetch(`${apiBase}?action=lead`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await res.json().catch(() => ({}));
      if (json && json.ok) {
        state.stack = ["success"];
        renderFn();
        return;
      }

      throw new Error("API error");
    } catch (e) {
      btn.textContent = "Try Again";
      btn.disabled = false;
      const statusEl = document.querySelector("#mcm-status");
      if (statusEl) statusEl.textContent = "Connection error. Please call us.";
    }
  }

  // ---------- NETWORK ----------
  async function getConfig_(client) {
    try {
      const res = await fetch(`${apiBase}?action=config&client=${encodeURIComponent(client)}`, {
        method: "GET",
        cache: "no-store"
      });
      return await res.json();
    } catch (e) {
      return { ok: false };
    }
  }

  function postEvent_(name, meta) {
    // Fire-and-forget, never block UI
    fetch(`${apiBase}?action=event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        session_id: sessionId,
        event_name: name,
        meta: meta || {}
      })
    }).catch(() => {});
  }

  // ---------- NORMALIZATION ----------
  function normalizeService_(s, i) {
    const obj = (s && typeof s === "object") ? { ...s } : {};
    const id = (obj.id !== undefined && obj.id !== null) ? String(obj.id) : `svc_${i}`;

    obj.id = id;
    obj._safeId = String(obj._safeId || id);
    obj._idxId = String(obj._idxId || `svc_${i}`);

    const rawUrl = (obj.booking_url || obj.bookingUrl || obj.calendar_url || obj.url || obj.link || "");
    obj.booking_url = String(rawUrl || "").trim();

    // Normalize request_fallback to boolean
    obj.request_fallback = normalizeBool_(obj.request_fallback);

    // Keep label/description stable
    obj.label = String(obj.label || "").trim();
    obj.description = String(obj.description || "").trim();

    return obj;
  }

  function normalizeBool_(v) {
    if (v === true) return true;
    if (v === false) return false;
    const s = String(v || "").trim().toLowerCase();
    return s === "true" || s === "yes" || s === "1";
  }

  // ---------- UTIL ----------
  function injectCss_() {
    const s = SCRIPT; // only at boot
    const url = (s.getAttribute("data-css") || s.src.replace(/\.js(\?.*)?$/, ".css")).trim();
    if (!url) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    document.head.appendChild(link);
  }

  function getOrCreateSessionId_() {
    let sid = "";
    try { sid = localStorage.getItem("mcm_sba_sid") || ""; } catch (_) {}
    if (!sid) {
      sid = "s_" + Math.random().toString(36).slice(2);
      try { localStorage.setItem("mcm_sba_sid", sid); } catch (_) {}
    }
    return sid;
  }

  function escapeHtml_(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttr_(s) {
    return String(s || "").replace(/"/g, "&quot;");
  }
})();
