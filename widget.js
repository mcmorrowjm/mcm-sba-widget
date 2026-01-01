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

  // --- VERSION 2.1.0 (Direct Map Lookup) ---
  console.log("[MCM SBA] Widget v2.1.0 Loaded");

  const sessionId = getOrCreateSessionId_();
  injectCss_();
  boot_().catch(err => console.error("[MCM SBA] boot error", err));

  async function boot_() {
    const config = await getConfig_(clientId);
    if (!config || !config.ok) { return; }

    const theme = {
      color: config.brand_primary_color || "#111111",
      label: (config.primary_cta_label || config.brand_button_label || "Get Scheduled"),
      primaryCta: (config.primary_cta_label || "Get Scheduled"),
      business: config.business_name || "Appointments",
      bookingMode: config.booking_mode || "both",
      services: Array.isArray(config.services) ? config.services : [],
      phone: String(config.business_phone || config.phone_number || config.phone || "").trim(),
    };

    // 1. CREATE A SERVICE MAP (The "Dictionary")
    // This creates a reliable way to look up services by a clean ID string
    const serviceMap = {};
    theme.services.forEach((s, i) => {
        // Generate a safe ID if missing
        const safeId = (s.id !== undefined && s.id !== null) ? String(s.id) : ("svc_" + i);
        s._safeId = safeId; // Store it on the object
        serviceMap[safeId] = s; // Add to dictionary
    });

    const state = { 
      stack: ["urgency"], 
      data: { urgency: "", urgencyLabel: "", service: null }
    };

    if (inlineSelector) {
      const mount = document.querySelector(inlineSelector);
      if (mount) {
        renderInline_(mount, theme, state, serviceMap);
        postEvent_("widget_render_inline", {});
      }
    } else {
      renderFloating_(theme, state, serviceMap);
      postEvent_("widget_render_floating", {});
    }
  }

  function renderFloating_(theme, state, serviceMap) {
    const launcher = document.createElement("div");
    launcher.id = "mcm-sba-launcher";
    const iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
    
    launcher.innerHTML = `
      <button class="mcm-sba-btn" style="background:${theme.color}; color:#fff;">
        ${iconSvg}<span>${theme.label}</span>
      </button>`;
    document.body.appendChild(launcher);

    const overlay = document.createElement("div");
    overlay.id = "mcm-sba-overlay";
    document.body.appendChild(overlay);

    const panel = document.createElement("div");
    panel.id = "mcm-sba-panel";
    document.body.appendChild(panel);

    const ui = bindPanelLogic_(panel, theme, state, serviceMap);

    const toggle = (isOpen) => {
        const method = isOpen ? "add" : "remove";
        overlay.classList[method]("open");
        panel.classList[method]("open");
        if(isOpen) postEvent_("widget_open", {});
    };

    launcher.querySelector("button").onclick = () => toggle(true);
    overlay.onclick = () => toggle(false);
    ui.closeBtn.onclick = () => toggle(false);
    
    ui.render();
  }

  function renderInline_(mount, theme, state, serviceMap) {
    const panel = document.createElement("div");
    panel.id = "mcm-sba-panel";
    panel.className = "mcm-sba-inline-panel";
    mount.appendChild(panel);
    const ui = bindPanelLogic_(panel, theme, state, serviceMap);
    ui.render();
  }

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

        if (currentView === "urgency") viewUrgency_(els, theme);
        else if (currentView === "services") viewServices_(els, theme);
        else if (currentView === "booking") viewBooking_(els, theme, state.data.service);
        else if (currentView === "request") viewRequest_(els, theme, state.data);
        else if (currentView === "success") viewSuccess_(els, theme);
    };

    // --- MAIN ROUTER ---
    panel.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;

        const action = btn.dataset.action;
        const payload = btn.dataset.payload; // This is the ID string

        console.log("[MCM SBA] Action:", action, "Payload:", payload);

        try {
            if (action === "back") {
                if (state.stack.length > 1) state.stack.pop();
                render();
            } 
            else if (action === "urgency") {
                state.data.urgency = payload; 
                
                if (payload === "today") {
                    state.data.urgencyLabel = "Urgent";
                    state.stack.push("request"); 
                }
                else if (payload === "week") {
                    state.data.urgencyLabel = "Standard";
                    state.stack.push("services");
                }
                else if (payload === "quote") {
                    state.data.urgencyLabel = "Quote";
                    state.stack.push("request");
                }
                render();
            }
            else if (action === "select-service") {
                // LOOKUP VIA MAP (Fast & Reliable)
                const svc = serviceMap[payload];
                console.log("[MCM SBA] Service Found:", svc);

                state.data.service = svc || null;
                state.data.serviceLabel = svc ? svc.label : "General";
                postEvent_("service_selected", { service_id: svc ? svc.id : "" });

                // Logic: Has Calendar -> Booking. No Calendar -> Request.
                if (svc && svc.booking_url) {
                    console.log("[MCM SBA] Going to Booking URL:", svc.booking_url);
                    state.stack.push("booking");
                } else {
                    console.log("[MCM SBA] No URL, going to Request Form");
                    state.stack.push("request");
                }
                render();
            }
            else if (action === "manual-request") {
                state.data.service = null;
                state.data.serviceLabel = "General Request";
                state.stack.push("request");
                render();
            }
            else if (action === "fallback") {
                state.stack.push("request");
                render();
            }
            else if (action === "submit") {
                handleSubmit_(btn, theme, state, render);
            }
            else if (action === "close-overlay") {
                 document.querySelector("#mcm-sba-overlay").click();
            }
        } catch (err) {
            console.error("[MCM SBA Error]", err);
            // Emergency fallback
            state.stack.push("request");
            render();
        }
    });

    els.back.setAttribute("data-action", "back");
    return { render, closeBtn: els.close };
  }

  // --- VIEWS ---
  
  function viewUrgency_(els, theme) {
      els.title.textContent = theme.business;
      els.step.textContent = "Step 1 of 3";
      els.body.innerHTML = `
        <div class="mcm-sba-muted" style="margin-bottom:10px;"><b>Quick question</b> — how quickly do you need help?</div>
        <div class="mcm-sba-list">
            ${renderRowItem_("urgency", "today", "#FF3B30", "Urgent — today", "System down, security issue, or stoppage")}
            ${renderRowItem_("urgency", "week", "#34C759", "This week", "Non-urgent support or follow-up")}
            ${renderRowItem_("urgency", "quote", "#007AFF", "Quote / Question", "Pricing, onboarding, or general info")}
        </div>`;
  }

  function viewServices_(els, theme) {
      els.title.textContent = theme.business;
      els.step.textContent = "Step 2 of 3";
      
      // Filter out 'Emergency' labels from the standard weekly list
      const services = theme.services.filter(s => !/emergency|urgent/i.test(s.label));

      els.body.innerHTML = `
        <div class="mcm-sba-muted" style="margin-bottom:10px;">Choose what you need help with:</div>
        <div class="mcm-sba-list">
            ${services.map(s => renderRowItem_("select-service", s._safeId, null, s.label, s.description)).join("")}
            <button class="mcm-sba-rowitem" data-action="manual-request">
                <div>Something else?</div><span>›</span>
            </button>
        </div>`;
  }

  function viewBooking_(els, theme, svc) {
      const url = svc ? svc.booking_url : "";
      
      els.title.textContent = "Select Time";
      els.step.textContent = svc ? svc.label : "Booking";
      els.body.classList.add("mcm-sba-no-pad"); 
      els.body.innerHTML = `<iframe class="mcm-sba-iframe" src="${escapeAttr_(url)}" loading="lazy"></iframe>`;
      
      els.footer.style.display = "block";
      els.footer.innerHTML = `
         <div class="mcm-sba-actions" style="margin-top:0;">
             <button class="mcm-sba-secondary" data-action="fallback">Can't find a time?</button>
         </div>`;
  }

  function viewRequest_(els, theme, data) {
      els.title.textContent = "Final Step";
      els.step.textContent = "Contact Info";
      
      const isHot = data.urgency === "today";
      
      // Dynamic Labels
      const detailsLabel = isHot ? "Critical Issue Details" : "Details";
      const detailsPlace = isHot ? "Please describe the critical issue..." : "How can we help?";

      els.body.innerHTML = `
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
          <div class="mcm-sba-label">${detailsLabel}</div>
          <textarea class="mcm-sba-input" id="mcm-msg" rows="3" placeholder="${detailsPlace}"></textarea>
          <input id="mcm-hp" style="position:absolute; opacity:0; pointer-events:none; width:1px;" tabindex="-1" />
      `;

      els.footer.style.display = "block";
      els.footer.innerHTML = `
        <div class="mcm-sba-actions">
            <button class="mcm-sba-primary" data-action="submit" style="background:${theme.color};color:#fff;">Send Request</button>
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
        </div>`;
      els.footer.style.display = "block";
      els.footer.innerHTML = `<button class="mcm-sba-secondary" data-action="close-overlay">Close</button>`;
      els.back.style.display = "none";
  }

  // --- HELPERS ---
  function renderRowItem_(action, payload, color, title, sub) {
      const dot = color ? `<div style="background:${color}; width:12px; height:12px; border-radius:50%; margin-right:12px; flex-shrink:0;"></div>` : "";
      return `
        <button class="mcm-sba-rowitem" data-action="${action}" data-payload="${escapeAttr_(String(payload))}" style="display:flex; align-items:center;">
          ${dot}
          <div style="flex:1;">${escapeHtml_(title)} <span class="mcm-sba-muted" style="display:block; font-size:13px; margin-top:2px;">${escapeHtml_(sub||"")}</span></div>
          <span>›</span>
        </button>`;
  }

  async function handleSubmit_(btn, theme, state, renderFn) {
      btn.textContent = "Sending...";
      btn.disabled = true;
      const val = (id) => (document.querySelector(id)||{}).value||"";
      
      const payload = {
        client_id: document.currentScript.getAttribute("data-client"),
        session_id: getOrCreateSessionId_(),
        intent: state.data.urgency === "today" ? "urgent" : "request",
        service_id: state.data.service ? state.data.service.id : "",
        service_label: state.data.serviceLabel || "General",
        name: val("#mcm-name"),
        email: val("#mcm-email"),
        phone: val("#mcm-phone"),
        message: val("#mcm-msg"),
        company_website: val("#mcm-hp"),
        source_url: location.href
      };

      try {
          const api = document.currentScript.getAttribute("data-api").replace(/\/$/, "");
          const res = await fetch(`${api}?action=lead`, {method:"POST", body:JSON.stringify(payload)});
          const json = await res.json();
          if (json.ok) {
              state.stack = ["success"];
              renderFn();
          } else { throw new Error("API Error"); }
      } catch (e) {
          btn.textContent = "Try Again";
          btn.disabled = false;
          document.querySelector("#mcm-status").textContent = "Connection error. Please call us.";
      }
  }

  // --- UTILS ---
  async function getConfig_(client) {
    const api = document.currentScript.getAttribute("data-api").replace(/\/$/, "");
    try { return await (await fetch(`${api}?action=config&client=${client}`)).json(); } catch(e){ return {ok:false}; }
  }
  function postEvent_(name, meta) {
      const api = document.currentScript.getAttribute("data-api").replace(/\/$/, "");
      const clientId = document.currentScript.getAttribute("data-client");
      fetch(`${api}?action=event`, {method:"POST", body:JSON.stringify({client_id:clientId, session_id:sessionId, event_name:name, meta})}).catch(()=>{});
  }
  function injectCss_() {
    const s = document.currentScript;
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
  function escapeHtml_(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function escapeAttr_(s) { return String(s||"").replace(/"/g,"&quot;"); }

})();