(() => {
  const SCRIPT = document.currentScript;
  if (!SCRIPT) return;

  const clientId = SCRIPT.getAttribute("data-client") || "";
  const apiBase = (SCRIPT.getAttribute("data-api") || "").replace(/\/$/, "");
  const inlineSelector = SCRIPT.getAttribute("data-inline") || ""; 

  if (!clientId || !apiBase) {
    console.warn("[MCM SBA] Missing data-client or data-api");
    return;
  }

  const VERSION = "1.0.0"; // Production Release
  const sessionId = getOrCreateSessionId_();

  injectCss_();
  boot_().catch(err => console.error("[MCM SBA] boot error", err));

  async function boot_() {
    const config = await getConfig_(clientId);
    if (!config || !config.ok) {
      console.warn("[MCM SBA] Config load failed", config);
      return;
    }

    const theme = {
      color: config.brand_primary_color || "#007AFF", // Default to iOS Blue
      label: (config.primary_cta_label || config.brand_button_label || "Get Scheduled"),
      primaryCta: (config.primary_cta_label || "Get Scheduled"),
      business: config.business_name || "Appointments",
      bookingMode: config.booking_mode || "both",
      services: Array.isArray(config.services) ? config.services : [],
      phone: String(config.business_phone || config.phone_number || config.phone || "").trim(),
      // NEW: Custom Message Label (e.g. "Where is the leak?")
      messageLabel: config.message_label 
    };

    const state = { urgencyKey: "", urgencyLabel: "" };

    if (inlineSelector) {
      const mount = document.querySelector(inlineSelector);
      if (mount) {
        renderInline_(mount, theme, state);
        postEvent_("widget_render_inline", {});
      }
    } else {
      renderFloating_(theme, state);
      postEvent_("widget_render_floating", {});
    }
  }

  function renderFloating_(theme, state) {
    const launcher = document.createElement("div");
    launcher.id = "mcm-sba-launcher";
    
    // Add an icon SVG to the button for polish
    const iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;

    const btn = document.createElement("button");
    btn.className = "mcm-sba-btn";
    btn.innerHTML = `${iconSvg} <span>${theme.label}</span>`;
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
      overlay.classList.add("open");
      panel.classList.add("open");
      postEvent_("widget_open", {});
    };
    const close = () => {
      overlay.classList.remove("open");
      panel.classList.remove("open");
      postEvent_("widget_close", {});
    };

    btn.addEventListener("click", open);
    overlay.addEventListener("click", close);
    panel.querySelector(".mcm-sba-close").addEventListener("click", close);
    
    // Public API to open widget
    window.SBA = { open, close };
  }

  function renderInline_(mount, theme, state) {
    const panel = buildPanel_(theme, { inline: true, state });
    panel.className = "mcm-sba-inline-panel";
    mount.appendChild(panel);
  }

  function buildPanel_(theme, opts = {}) {
    const panel = document.createElement("div");
    panel.id = "mcm-sba-panel";

    panel.innerHTML = `
      <div class="mcm-sba-header">
        <div>
          <p class="mcm-sba-title">${escapeHtml_(theme.business)}</p>
          <p class="mcm-sba-sub">Virtual Assistant</p>
        </div>
        <button class="mcm-sba-close" aria-label="Close">&times;</button>
      </div>
      <div class="mcm-sba-body">
        <div id="mcm-sba-step"></div>
      </div>
    `;

    const step = panel.querySelector("#mcm-sba-step");
    renderUrgency_(step, theme, opts.state || { urgencyKey:"", urgencyLabel:"" });
    return panel;
  }

  function renderUrgency_(container, theme, state) {
    container.innerHTML = `
      <div class="mcm-sba-label" style="margin-top:0">Quick Question</div>
      <div style="font-size:18px; font-weight:700; margin-bottom:16px;">How quickly do you need help?</div>
      
      <button class="mcm-sba-card" id="mcm-sba-urg-today" style="width:100%; display:flex; align-items:center; gap:12px;">
         <div style="background:#FF3B30; width:12px; height:12px; border-radius:50%;"></div>
         <div>
           <div class="mcm-sba-service-title">Today (Urgent)</div>
           <div class="mcm-sba-service-desc">Emergency, stoppage, or leak.</div>
         </div>
      </button>

      <button class="mcm-sba-card" id="mcm-sba-urg-week" style="width:100%; display:flex; align-items:center; gap:12px;">
         <div style="background:#34C759; width:12px; height:12px; border-radius:50%;"></div>
         <div>
           <div class="mcm-sba-service-title">This Week</div>
           <div class="mcm-sba-service-desc">Schedule a future appointment.</div>
         </div>
      </button>

      <button class="mcm-sba-card" id="mcm-sba-urg-quote" style="width:100%; display:flex; align-items:center; gap:12px;">
         <div style="background:#007AFF; width:12px; height:12px; border-radius:50%;"></div>
         <div>
           <div class="mcm-sba-service-title">Pricing / Quote</div>
           <div class="mcm-sba-service-desc">Just looking for information.</div>
         </div>
      </button>
    `;

    const setUrgency = (key, label) => {
      state.urgencyKey = key;
      state.urgencyLabel = label;
      postEvent_("urgency_selected", { urgency: key, urgency_label: label });

      // Hot Lead Redirect (Call Option)
      if (key === "today" && theme.phone) {
        renderHotInterstital_(container, theme, state);
      } else {
        renderServicePicker_(container, theme, state);
      }
    };

    container.querySelector("#mcm-sba-urg-today").addEventListener("click", () => setUrgency("today", "Today (urgent)"));
    container.querySelector("#mcm-sba-urg-week").addEventListener("click", () => setUrgency("week", "This week"));
    container.querySelector("#mcm-sba-urg-quote").addEventListener("click", () => setUrgency("quote", "Just looking for pricing"));
  }

  function renderHotInterstital_(container, theme, state) {
    container.innerHTML = `
      <div style="text-align:center; padding: 20px 0;">
        <div style="font-size:40px; margin-bottom:10px;">🔥</div>
        <h3 style="margin:0 0 10px 0;">This sounds urgent.</h3>
        <p style="color:rgba(0,0,0,0.6); margin-bottom:24px;">For fastest service, we recommend calling now.</p>
        
        <a href="tel:${escapeAttr_(theme.phone)}" class="mcm-sba-primary" style="background:#34C759; color:#fff; text-decoration:none; margin-bottom:12px;">
          Call Now (${escapeHtml_(theme.phone)})
        </a>
        <button class="mcm-sba-secondary" id="mcm-sba-continue">No, I prefer to book online</button>
      </div>
    `;
    container.querySelector("#mcm-sba-continue").addEventListener("click", () => renderServicePicker_(container, theme, state));
  }

  function renderServicePicker_(container, theme, state) {
    container.innerHTML = `
      <div class="mcm-sba-label" style="margin-top:0">Services</div>
      <div style="font-size:18px; font-weight:700; margin-bottom:16px;">What do you need?</div>
      <div id="mcm-sba-services"></div>
      
      <div class="mcm-sba-actions">
        <button class="mcm-sba-secondary" id="mcm-sba-back">Back</button>
      </div>
    `;

    const list = container.querySelector("#mcm-sba-services");
    const mode = String(theme.bookingMode || "both").toLowerCase();

    theme.services.forEach(svc => {
      const b = document.createElement("div");
      b.className = "mcm-sba-service";
      b.innerHTML = `
        <div class="mcm-sba-service-title">${escapeHtml_(svc.label || "Service")}</div>
        <div class="mcm-sba-service-desc">${escapeHtml_(svc.description || "")}</div>
      `;
      b.addEventListener("click", () => {
        postEvent_("service_selected", { service_id: svc.id, service_label: svc.label });
        const url = String(svc.booking_url || "").trim();
        
        if (url) {
          renderBooking_(container, theme, svc, state);
        } else if (mode !== "instant") {
          renderRequestForm_(container, theme, svc, state);
        } else {
           // Fallback for instant-only mode with no link
           alert("Online booking not available for this service. Please call us.");
        }
      });
      list.appendChild(b);
    });
    
    // Optional "General Request" button at bottom
    if (mode !== "instant") {
      const gen = document.createElement("div");
      gen.className = "mcm-sba-service";
      gen.style.background = "transparent"; 
      gen.style.border = "1px dashed rgba(0,0,0,0.2)";
      gen.innerHTML = `<div class="mcm-sba-service-title" style="text-align:center; color:rgba(0,0,0,0.5);">Something else?</div>`;
      gen.addEventListener("click", () => renderRequestForm_(container, theme, null, state));
      list.appendChild(gen);
    }

    container.querySelector("#mcm-sba-back").addEventListener("click", () => renderUrgency_(container, theme, state));
  }

  function renderBooking_(container, theme, svc, state) {
    const url = svc.booking_url;
    container.innerHTML = `
      <div style="height:100%; display:flex; flex-direction:column;">
         <iframe src="${escapeAttr_(url)}" style="flex:1; width:100%; border:0; border-radius:12px; background:#f9f9f9;" loading="lazy"></iframe>
         <div class="mcm-sba-actions">
           <button class="mcm-sba-secondary" id="mcm-sba-back">Back</button>
           <button class="mcm-sba-secondary" id="mcm-sba-fallback">Can't find a time?</button>
         </div>
      </div>
    `;
    container.querySelector("#mcm-sba-back").addEventListener("click", () => renderServicePicker_(container, theme, state));
    container.querySelector("#mcm-sba-fallback").addEventListener("click", () => renderRequestForm_(container, theme, svc, state));
  }

  function renderRequestForm_(container, theme, svc, state) {
    const isUrgent = state.urgencyKey === "today";
    const label = svc ? svc.label : "General Request";

    container.innerHTML = `
      <div class="mcm-sba-label" style="margin-top:0">
        ${isUrgent ? '<span class="mcm-sba-urgent-flag">HOT LEAD</span>' : "Request"}
      </div>
      <div style="font-size:18px; font-weight:700; margin-bottom:16px;">
        ${escapeHtml_(theme.primaryCta)}
      </div>

      <div class="mcm-sba-label">Contact Info</div>
      <input class="mcm-sba-input" id="mcm-name" placeholder="Full Name" />
      <div style="height:10px"></div>
      <div class="mcm-sba-row">
        <input class="mcm-sba-input" id="mcm-phone" placeholder="Phone (Mobile)" type="tel" />
        <input class="mcm-sba-input" id="mcm-email" placeholder="Email" type="email" />
      </div>

      <div class="mcm-sba-label">Timing</div>
      <input class="mcm-sba-input" id="mcm-time" placeholder="When do you need this?" value="${isUrgent ? 'ASAP / Emergency' : ''}" />

      <div class="mcm-sba-label">${escapeHtml_(theme.messageLabel || "What's going on?")}</div>
      <textarea class="mcm-sba-input" id="mcm-msg" placeholder="Please describe the issue..."></textarea>

      <input id="mcm-hp" style="position:absolute; opacity:0; pointer-events:none; width:1px; height:1px;" tabindex="-1" />

      <div class="mcm-sba-actions">
        <button class="mcm-sba-primary" id="mcm-send" style="background:${theme.color}; color:#fff;">
          Send Request
        </button>
        <button class="mcm-sba-secondary" id="mcm-back">Back</button>
      </div>
      <div id="mcm-status" style="margin-top:10px; font-size:13px; text-align:center; color:rgba(0,0,0,0.5);"></div>
    `;

    container.querySelector("#mcm-back").addEventListener("click", () => renderServicePicker_(container, theme, state));
    
    container.querySelector("#mcm-send").addEventListener("click", async (e) => {
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = "Sending...";
      
      const payload = {
        client_id: clientId,
        session_id: sessionId,
        intent: isUrgent ? "urgent" : "request",
        service_id: svc ? svc.id : "",
        service_label: label,
        name: val_("#mcm-name"),
        email: val_("#mcm-email"),
        phone: val_("#mcm-phone"),
        preferred_time: val_("#mcm-time"),
        message: val_("#mcm-msg"),
        company_website: val_("#mcm-hp"),
        source_url: location.href,
        referrer: document.referrer || ""
      };

      const res = await postLead_(payload);
      if (res && res.ok) {
        container.innerHTML = `
          <div style="text-align:center; padding:40px 20px;">
            <div style="font-size:48px; margin-bottom:16px;">✅</div>
            <h3 style="margin:0;">Request Sent!</h3>
            <p style="color:rgba(0,0,0,0.6);">We have received your details and will contact you shortly.</p>
            <button class="mcm-sba-secondary" id="mcm-close-final">Close</button>
          </div>
        `;
        container.querySelector("#mcm-close-final").addEventListener("click", () => {
           const overlay = document.querySelector("#mcm-sba-overlay");
           if(overlay) overlay.click();
        });
      } else {
        btn.disabled = false;
        btn.textContent = "Try Again";
        container.querySelector("#mcm-status").textContent = "Error sending. Please call us directly.";
      }
    });
  }

  async function getConfig_(client) {
    try {
      const res = await fetch(`${apiBase}?action=config&client=${encodeURIComponent(client)}`);
      return await res.json();
    } catch (e) { return null; }
  }

  async function postLead_(payload) {
    try {
      const res = await fetch(`${apiBase}?action=lead`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (e) { return { ok: false }; }
  }

  async function postEvent_(name, meta) {
    try {
      fetch(`${apiBase}?action=event`, {
        method: "POST",
        body: JSON.stringify({
          client_id: clientId,
          session_id: sessionId,
          event_name: name,
          meta: meta,
          source_url: location.href
        })
      });
    } catch (_) {}
  }

  function injectCss_() {
    const s = SCRIPT;
    const href = s.getAttribute("data-css");
    if (href) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
      return;
    }
    // Auto-detect CSS if not provided
    const url = new URL(s.src);
    url.pathname = url.pathname.replace(/\.js$/, ".css");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url.toString();
    document.head.appendChild(link);
  }

  function getOrCreateSessionId_() {
    const k = "mcm_sba_sid";
    let sid = localStorage.getItem(k);
    if (!sid) {
      sid = "s_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(k, sid);
    }
    return sid;
  }

  function val_(sel) {
    const el = document.querySelector(sel);
    return el ? el.value.trim() : "";
  }

  function escapeHtml_(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escapeAttr_(str) {
    return String(str || "").replace(/"/g, "&quot;");
  }
})();