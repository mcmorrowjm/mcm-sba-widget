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

  const VERSION = "1.2.0"; // Production Release (Icon + Nav Fixes)
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
      color: config.brand_primary_color || "#111111",
      label: (config.primary_cta_label || config.brand_button_label || "Get Scheduled"),
      primaryCta: (config.primary_cta_label || "Get Scheduled"),
      business: config.business_name || "Appointments",
      bookingMode: config.booking_mode || "both",
      services: Array.isArray(config.services) ? config.services : [],
      phone: String(config.business_phone || config.phone_number || config.phone || "").trim(),
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

    // ICON RESTORED HERE
    const iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;

    const btn = document.createElement("button");
    btn.className = "mcm-sba-btn";
    btn.innerHTML = `${iconSvg}<span>${theme.label}</span>`;
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
        <button class="mcm-sba-back" id="mcm-sba-back" style="display:none;">‹</button>
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
    state._stack = []; // Now stores FUNCTIONS, not HTML strings
    
    const ui = { 
        panel, 
        body: panel.querySelector("#mcm-sba-body"), 
        footer: panel.querySelector("#mcm-sba-footer"), 
        backBtn: panel.querySelector("#mcm-sba-back") 
    };

    // Initial Render
    renderUrgency_(ui, theme, state);
    return panel;
  }

  // --- NAVIGATION HELPERS (Fixes Freezing) ---
  function navigateTo_(ui, renderFn) {
      // 1. Save current view to stack
      ui._stack.push(ui._currentView); 
      // 2. Render new view
      ui._currentView = renderFn;
      renderFn();
      // 3. Update Back Button
      ui.backBtn.onclick = () => navigateBack_(ui);
      ui.backBtn.style.display = "inline-flex";
  }

  function navigateBack_(ui) {
      const prevFn = ui._stack.pop();
      if (prevFn) {
          ui._currentView = prevFn;
          prevFn(); // Re-run the function to restore live listeners
          ui.backBtn.style.display = ui._stack.length ? "inline-flex" : "none";
      }
  }

  function setHeader_(ui, title, stepText) {
    const t = ui.panel.querySelector("#mcm-sba-title");
    const s = ui.panel.querySelector("#mcm-sba-stepline");
    if (t) t.textContent = title || "";
    if (s) s.textContent = stepText || "";
  }

  // --- VIEW 1: URGENCY ---
  function renderUrgency_(ui, theme, state) {
    ui._currentView = () => renderUrgency_(ui, theme, state); // Set current for stack
    
    setHeader_(ui, theme.business, "Step 1 of 3");
    ui.footer.style.display = "none";
    ui.body.classList.remove("mcm-sba-no-pad");

    ui.body.innerHTML = `
      <div class="mcm-sba-muted" style="margin-bottom:10px;"><b>Quick question</b> — how quickly do you need help?</div>
      <div class="mcm-sba-list">
        <button class="mcm-sba-rowitem" id="mcm-sba-urg-today">
          <div>Urgent — today <span class="mcm-sba-muted" style="display:block; font-size:13px; margin-top:2px;">System down, security issue, or stoppage</span></div>
          <span>›</span>
        </button>
        <button class="mcm-sba-rowitem" id="mcm-sba-urg-week">
          <div>This week <span class="mcm-sba-muted" style="display:block; font-size:13px; margin-top:2px;">Non-urgent support or follow-up</span></div>
          <span>›</span>
        </button>
        <button class="mcm-sba-rowitem" id="mcm-sba-urg-quote">
          <div>Quote / Question <span class="mcm-sba-muted" style="display:block; font-size:13px; margin-top:2px;">Pricing, onboarding, or general info</span></div>
          <span>›</span>
        </button>
      </div>
    `;

    ui.body.querySelector("#mcm-sba-urg-today").onclick = () => {
        state.urgencyKey = "today"; state.urgencyLabel = "Urgent";
        if (theme.phone) navigateTo_(ui, () => renderHotInterstitial_(ui, theme, state));
        else navigateTo_(ui, () => renderServicePicker_(ui, theme, state));
    };

    ui.body.querySelector("#mcm-sba-urg-week").onclick = () => {
        state.urgencyKey = "week"; state.urgencyLabel = "This Week";
        navigateTo_(ui, () => renderServicePicker_(ui, theme, state));
    };

    // FIXED: Quote goes DIRECTLY to Request Form (Bypass Calendar)
    ui.body.querySelector("#mcm-sba-urg-quote").onclick = () => {
        state.urgencyKey = "quote"; state.urgencyLabel = "Quote/Info";
        navigateTo_(ui, () => renderRequestForm_(ui, theme, null, state));
    };
  }

  // --- VIEW 1.5: HOT INTERSTITIAL ---
  function renderHotInterstitial_(ui, theme, state) {
     setHeader_(ui, theme.business, "Urgent Action");
     ui.body.classList.remove("mcm-sba-no-pad");
     ui.body.innerHTML = `
        <div class="mcm-sba-card" style="text-align:center;">
            <div style="font-size:40px; margin-bottom:10px;">🔥</div>
            <b>Urgent request flagged as HOT</b><br/>
            <div class="mcm-sba-muted" style="margin:10px 0;">If this is an emergency, call now. Otherwise, continue to get scheduled.</div>
            <div class="mcm-sba-actions">
                <a href="tel:${escapeAttr_(theme.phone)}" class="mcm-sba-primary" style="background:#34C759; color:#fff; text-decoration:none;">Call Now</a>
                <button class="mcm-sba-secondary" id="mcm-hot-continue">Continue Online</button>
            </div>
        </div>
     `;
     ui.body.querySelector("#mcm-hot-continue").onclick = () => {
         navigateTo_(ui, () => renderServicePicker_(ui, theme, state));
     };
  }

  // --- VIEW 2: SERVICE PICKER ---
  function renderServicePicker_(ui, theme, state) {
    setHeader_(ui, theme.business, "Step 2 of 3");
    ui.body.classList.remove("mcm-sba-no-pad");
    ui.footer.style.display = "none";

    ui.body.innerHTML = `
      <div class="mcm-sba-muted" style="margin-bottom:10px;">Choose what you need help with:</div>
      <div id="mcm-sba-services" class="mcm-sba-list"></div>
    `;

    const servicesEl = ui.body.querySelector("#mcm-sba-services");
    
    theme.services.forEach(svc => {
      const b = document.createElement("button");
      b.className = "mcm-sba-rowitem";
      b.innerHTML = `
        <div>${escapeHtml_(svc.label || "Service")} <span class="mcm-sba-muted" style="display:block; font-size:13px; margin-top:2px;">${escapeHtml_(svc.description || "")}</span></div>
        <span>›</span>
      `;
      b.onclick = () => {
        postEvent_("service_selected", { service_id: svc.id, service_label: svc.label });
        if (svc.booking_url) {
          navigateTo_(ui, () => renderBooking_(ui, theme, svc, state));
        } else {
          navigateTo_(ui, () => renderRequestForm_(ui, theme, svc, state));
        }
      };
      servicesEl.appendChild(b);
    });
    
    // General Option
    const gen = document.createElement("button");
    gen.className = "mcm-sba-rowitem";
    gen.innerHTML = `<div>Something else?</div><span>›</span>`;
    gen.onclick = () => navigateTo_(ui, () => renderRequestForm_(ui, theme, null, state));
    servicesEl.appendChild(gen);
  }

  // --- VIEW 3: BOOKING (CALENDAR) ---
  function renderBooking_(ui, theme, svc, state) {
    setHeader_(ui, theme.business, "Select Time");
    
    // 1. Turn OFF padding for full-width iframe
    ui.body.classList.add("mcm-sba-no-pad");

    ui.body.innerHTML = `<iframe class="mcm-sba-iframe" src="${escapeAttr_(svc.booking_url)}" loading="lazy"></iframe>`;
    
    ui.footer.style.display = "block";
    ui.footer.innerHTML = `
       <div class="mcm-sba-actions" style="margin-top:0;">
           <button class="mcm-sba-secondary" id="mcm-sba-fallback">Can't find a time?</button>
       </div>
    `;
    ui.footer.querySelector("#mcm-sba-fallback").onclick = () => {
        navigateTo_(ui, () => renderRequestForm_(ui, theme, svc, state));
    };
  }

  // --- VIEW 4: REQUEST FORM ---
  function renderRequestForm_(ui, theme, svc, state) {
    setHeader_(ui, theme.business, "Final Step");
    ui.body.classList.remove("mcm-sba-no-pad"); // Restore padding

    const isHot = state.urgencyKey === "today";
    const serviceLabel = svc ? svc.label : (state.urgencyLabel || "General Request");

    ui.body.innerHTML = `
      <div class="mcm-sba-muted" style="margin-bottom:10px;">
        <b>${escapeHtml_(theme.primaryCta)}</b> — we’ll contact you ASAP.
        ${isHot ? ` <span class="mcm-sba-pill" style="background:${theme.color};color:#fff;">HOT</span>` : ""}
      </div>

      <div class="mcm-sba-label">Name</div>
      <input class="mcm-sba-input" id="mcm-name" placeholder="Full name" />

      <div class="mcm-sba-row">
        <div><div class="mcm-sba-label">Email</div><input class="mcm-sba-input" id="mcm-email" placeholder="you@email.com" /></div>
        <div><div class="mcm-sba-label">Phone</div><input class="mcm-sba-input" id="mcm-phone" placeholder="(555) 123-4567" /></div>
      </div>

      <div class="mcm-sba-label">Details</div>
      <textarea class="mcm-sba-input" id="mcm-msg" rows="3" placeholder="How can we help?"></textarea>
      
      <input id="mcm-hp" style="position:absolute; opacity:0; pointer-events:none; width:1px;" tabindex="-1" />
    `;

    ui.footer.style.display = "block";
    ui.footer.innerHTML = `
      <div class="mcm-sba-actions">
        <button class="mcm-sba-primary" id="mcm-send" style="background:${theme.color};color:#fff;">Send Request</button>
      </div>
      <div class="mcm-sba-muted" id="mcm-status" style="margin-top:10px; text-align:center;"></div>
    `;

    ui.footer.querySelector("#mcm-send").onclick = async () => {
        const btn = ui.footer.querySelector("#mcm-send");
        btn.textContent = "Sending...";
        btn.disabled = true;
        
        const payload = {
            client_id: clientId,
            session_id: sessionId,
            intent: isHot ? "urgent" : "request",
            service_id: svc ? svc.id : "",
            service_label: serviceLabel,
            name: val_("#mcm-name"),
            email: val_("#mcm-email"),
            phone: val_("#mcm-phone"),
            message: val_("#mcm-msg"),
            company_website: val_("#mcm-hp"),
            source_url: location.href
        };

        const res = await postLead_(payload);
        if (res.ok) {
            renderSuccess_(ui, theme);
        } else {
            btn.textContent = "Try Again";
            btn.disabled = false;
            ui.footer.querySelector("#mcm-status").textContent = "Error sending. Please call us.";
        }
    };
  }

  function renderSuccess_(ui, theme) {
      ui.footer.style.display = "block"; // Keep footer for Close button
      ui.body.innerHTML = `
        <div class="mcm-sba-card" style="text-align:center; padding:30px 20px;">
            <div style="font-size:40px; margin-bottom:10px;">✅</div>
            <div style="font-weight:700; font-size:18px;">Received!</div>
            <div class="mcm-sba-muted" style="margin-top:5px;">We will be in touch shortly.</div>
        </div>
      `;
      ui.footer.innerHTML = `<button class="mcm-sba-secondary" id="mcm-close-final">Close</button>`;
      ui.footer.querySelector("#mcm-close-final").onclick = () => {
          document.querySelector("#mcm-sba-overlay").click();
      };
      
      // Clear stack so next open is fresh
      ui._stack = [];
      ui.backBtn.style.display = "none";
  }

  // --- API Helpers (Unchanged) ---
  async function getConfig_(client) {
    try { return await (await fetch(`${apiBase}?action=config&client=${client}`)).json(); } catch(e){ return {ok:false}; }
  }
  async function postLead_(data) {
    try { return await (await fetch(`${apiBase}?action=lead`, {method:"POST", body:JSON.stringify(data)})).json(); } catch(e){ return {ok:false}; }
  }
  function postEvent_(name, meta) {
      fetch(`${apiBase}?action=event`, {method:"POST", body:JSON.stringify({client_id:clientId, session_id:sessionId, event_name:name, meta})}).catch(()=>{});
  }
  function injectCss_() {
    const s = SCRIPT;
    const url = s.getAttribute("data-css") || s.src.replace(/\.js$/, ".css");
    const link = document.createElement("link");
    link.rel="stylesheet"; link.href=url;
    document.head.appendChild(link);
  }
  function getOrCreateSessionId_() {
      let sid = localStorage.getItem("mcm_sba_sid");
      if(!sid) { sid="s_"+Math.random().toString(36).slice(2); localStorage.setItem("mcm_sba_sid", sid); }
      return sid;
  }
  function val_(sel) { return (document.querySelector(sel)||{}).value||""; }
  function escapeHtml_(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function escapeAttr_(s) { return String(s||"").replace(/"/g,"&quot;"); }

})();