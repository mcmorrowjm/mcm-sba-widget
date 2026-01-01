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

  const VERSION = "1.4.0"; // DOM Element Creation (Fixes Dead Clicks)
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
    state._stack = []; 
    
    const ui = { 
        panel, 
        body: panel.querySelector("#mcm-sba-body"), 
        footer: panel.querySelector("#mcm-sba-footer"), 
        backBtn: panel.querySelector("#mcm-sba-back") 
    };

    renderUrgency_(ui, theme, state);
    return panel;
  }

  // --- NAVIGATION MANAGER ---
  function navigateTo_(ui, renderFn) {
      ui._stack.push(ui._currentView); 
      ui._currentView = renderFn;
      renderFn();
      ui.backBtn.onclick = () => navigateBack_(ui);
      ui.backBtn.style.display = "inline-flex";
  }

  function navigateBack_(ui) {
      const prevFn = ui._stack.pop();
      if (prevFn) {
          ui._currentView = prevFn;
          prevFn(); 
          ui.backBtn.style.display = ui._stack.length ? "inline-flex" : "none";
      }
  }

  function setHeader_(ui, title, stepText) {
    const t = ui.panel.querySelector("#mcm-sba-title");
    const s = ui.panel.querySelector("#mcm-sba-stepline");
    if (t) t.textContent = title || "";
    if (s) s.textContent = stepText || "";
  }

  // --- VIEW 1: URGENCY (Fail-Safe Implementation) ---
  function renderUrgency_(ui, theme, state) {
    ui._currentView = () => renderUrgency_(ui, theme, state);
    
    setHeader_(ui, theme.business, "Step 1 of 3");
    ui.footer.style.display = "none";
    ui.body.classList.remove("mcm-sba-no-pad");
    ui.body.innerHTML = ""; // Clear existing

    // 1. Header Text
    const label = document.createElement("div");
    label.className = "mcm-sba-muted";
    label.style.marginBottom = "10px";
    label.innerHTML = "<b>Quick question</b> — how quickly do you need help?";
    ui.body.appendChild(label);

    // 2. Container
    const list = document.createElement("div");
    list.className = "mcm-sba-list";

    // 3. Create Button Helper (Ensures listener is attached BEFORE render)
    const createBtn = (id, color, title, sub, onClick) => {
        const btn = document.createElement("button");
        btn.className = "mcm-sba-rowitem";
        btn.id = id;
        btn.style.display = "flex";
        btn.style.alignItems = "center";
        
        btn.innerHTML = `
          <div style="background:${color}; width:12px; height:12px; border-radius:50%; margin-right:12px; flex-shrink:0;"></div>
          <div style="flex:1;">${title} <span class="mcm-sba-muted" style="display:block; font-size:13px; margin-top:2px;">${sub}</span></div>
          <span>›</span>
        `;
        
        // DIRECT EVENT ATTACHMENT
        btn.onclick = onClick;
        return btn;
    };

    // 4. Add Buttons
    const btnToday = createBtn("mcm-sba-urg-today", "#FF3B30", "Urgent — today", "System down, security issue, or stoppage", () => {
        state.urgencyKey = "today"; state.urgencyLabel = "Urgent";
        if (theme.phone) navigateTo_(ui, () => renderHotInterstitial_(ui, theme, state));
        else navigateTo_(ui, () => renderServicePicker_(ui, theme, state));
    });

    const btnWeek = createBtn("mcm-sba-urg-week", "#34C759", "This week", "Non-urgent support or follow-up", () => {
        state.urgencyKey = "week"; state.urgencyLabel = "This Week";
        navigateTo_(ui, () => renderServicePicker_(ui, theme, state));
    });

    const btnQuote = createBtn("mcm-sba-urg-quote", "#007AFF", "Quote / Question", "Pricing, onboarding, or general info", () => {
        state.urgencyKey = "quote"; state.urgencyLabel = "Quote/Info";
        navigateTo_(ui, () => renderRequestForm_(ui, theme, null, state));
    });

    list.appendChild(btnToday);
    list.appendChild(btnWeek);
    list.appendChild(btnQuote);
    ui.body.appendChild(list);
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
     const contBtn = ui.body.querySelector("#mcm-hot-continue");
     if (contBtn) contBtn.onclick = () => navigateTo_(ui, () => renderServicePicker_(ui, theme, state));
  }

  // --- VIEW 2: SERVICE PICKER ---
  function renderServicePicker_(ui, theme, state) {
    setHeader_(ui, theme.business, "Step 2 of 3");
    ui.body.classList.remove("mcm-sba-no-pad");
    ui.footer.style.display = "none";
    ui.body.innerHTML = ""; // Clear

    const label = document.createElement("div");
    label.className = "mcm-sba-muted";
    label.style.marginBottom = "10px";
    label.textContent = "Choose what you need help with:";
    ui.body.appendChild(label);

    const list = document.createElement("div");
    list.className = "mcm-sba-list";
    
    theme.services.forEach(svc => {
      const b = document.createElement("button");
      b.className = "mcm-sba-rowitem";
      b.innerHTML = `
        <div style="flex:1;">${escapeHtml_(svc.label || "Service")} <span class="mcm-sba-muted" style="display:block; font-size:13px; margin-top:2px;">${escapeHtml_(svc.description || "")}</span></div>
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
      list.appendChild(b);
    });
    
    // General Option
    const gen = document.createElement("button");
    gen.className = "mcm-sba-rowitem";
    gen.innerHTML = `<div style="flex:1;">Something else?</div><span>›</span>`;
    gen.onclick = () => navigateTo_(ui, () => renderRequestForm_(ui, theme, null, state));
    list.appendChild(gen);
    
    ui.body.appendChild(list);
  }

  // --- VIEW 3: BOOKING (CALENDAR) ---
  function renderBooking_(ui, theme, svc, state) {
    setHeader_(ui, theme.business, "Select Time");
    ui.body.classList.add("mcm-sba-no-pad");

    ui.body.innerHTML = `<iframe class="mcm-sba-iframe" src="${escapeAttr_(svc.booking_url)}" loading="lazy"></iframe>`;
    
    ui.footer.style.display = "block";
    ui.footer.innerHTML = `
       <div class="mcm-sba-actions" style="margin-top:0;">
           <button class="mcm-sba-secondary" id="mcm-sba-fallback">Can't find a time?</button>
       </div>
    `;
    const fbBtn = ui.footer.querySelector("#mcm-sba-fallback");
    if (fbBtn) fbBtn.onclick = () => navigateTo_(ui, () => renderRequestForm_(ui, theme, svc, state));
  }

  // --- VIEW 4: REQUEST FORM ---
  function renderRequestForm_(ui, theme, svc, state) {
    setHeader_(ui, theme.business, "Final Step");
    ui.body.classList.remove("mcm-sba-no-pad");

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

    const sendBtn = ui.footer.querySelector("#mcm-send");
    if (sendBtn) {
        sendBtn.onclick = async () => {
            sendBtn.textContent = "Sending...";
            sendBtn.disabled = true;
            
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
                sendBtn.textContent = "Try Again";
                sendBtn.disabled = false;
                ui.footer.querySelector("#mcm-status").textContent = "Error sending. Please call us.";
            }
        };
    }
  }

  function renderSuccess_(ui, theme) {
      ui.footer.style.display = "block"; 
      ui.body.innerHTML = `
        <div class="mcm-sba-card" style="text-align:center; padding:30px 20px;">
            <div style="font-size:40px; margin-bottom:10px;">✅</div>
            <div style="font-weight:700; font-size:18px;">Received!</div>
            <div class="mcm-sba-muted" style="margin-top:5px;">We will be in touch shortly.</div>
        </div>
      `;
      ui.footer.innerHTML = `<button class="mcm-sba-secondary" id="mcm-close-final">Close</button>`;
      const closeBtn = ui.footer.querySelector("#mcm-close-final");
      if (closeBtn) {
          closeBtn.onclick = () => {
            document.querySelector("#mcm-sba-overlay").click();
          };
      }
      
      ui._stack = [];
      ui.backBtn.style.display = "none";
  }

  // --- API Helpers ---
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