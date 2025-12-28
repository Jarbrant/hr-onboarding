/* ============================================================
AO-002 | FIL-ID: UI/UI-03-APP.js
Stam-login + roll-routing v1 + Medarbetar-dashboard routes (UI-only)
- Ingen backend (v1)
- Generiskt fel (ingen kontoläckage)
- UI-cooldown efter X misslyckade försök
- Enkel sessionflagga (refresh stannar i vy)
- Medarbetare: hash-routes #employee/#tasks/#questions/#schedule/#docs/#report/#profile
- PIN ej implementerad, men hook finns (pinRequired=false + TODO)
============================================================ */

(function () {
  "use strict";

  // =========================
  // AO-002: State (låst, minimalt)
  // =========================
  const APP_STATE = {
    route: "#login",
    auth: {
      isAuthed: false,
      role: null,           // "admin" | "employee"
      displayName: null,    // ej känsligt
      empNo: null,          // anställningsnummer (policy: sökbart i v1)
      pinRequired: false    // hook
      // TODO (AO-001/AO-002): Om pinRequired i framtiden -> route till #pin
    },
    abuse: {
      attempts: 0,
      cooldownUntil: 0
    }
  };

  // AO-002: En (1) lagringsnyckel (oförändrad från AO-001)
  const STORAGE_KEY = "AO-001_LOGIN_V1";
  const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6h (client only)

  // AO-002: Rate-limit (light, client only)
  const MAX_FAILS = 5;
  const COOLDOWN_MS = 30 * 1000;

  // =========================
  // DOM helpers
  // =========================
  const $ = (sel) => document.querySelector(sel);

  const viewLogin = $("#view-login");
  const viewAdmin = $("#view-admin");
  const viewEmployee = $("#view-employee");

  const loginForm = $("#loginForm");
  const inpName = $("#inpName");
  const inpEmpNo = $("#inpEmpNo");
  const inpPassword = $("#inpPassword");
  const btnLogin = $("#btnLogin");
  const btnReset = $("#btnReset");
  const loginMessage = $("#loginMessage");

  const btnLogoutAdmin = $("#btnLogoutAdmin");
  const btnLogoutEmployee = $("#btnLogoutEmployee");

  const adminWho = $("#adminWho");
  const adminRole = $("#adminRole");

  const employeeWho = $("#employeeWho");
  const employeeRole = $("#employeeRole");

  // Employee routes sections
  const empHome = $("#emp-home");
  const empTasks = $("#emp-tasks");
  const empQuestions = $("#emp-questions");
  const empSchedule = $("#emp-schedule");
  const empDocs = $("#emp-docs");
  const empReport = $("#emp-report");
  const empProfile = $("#emp-profile");

  // Report UI
  const techInfo = $("#techInfo");
  const reportForm = $("#reportForm");
  const reportText = $("#reportText");
  const reportStatus = $("#reportStatus");

  // Profile UI
  const profileName = $("#profileName");
  const profileEmpNo = $("#profileEmpNo");
  const profileRole = $("#profileRole");
  const pwStatus = $("#pwStatus");

  // =========================
  // Helpers
  // =========================
  function now() { return Date.now(); }

  function sanitizeText(s) {
    return String(s || "").trim().replace(/\s+/g, " ");
  }

  function sanitizeEmpNo(s) {
    return String(s || "").trim().replace(/[^\d]/g, "");
  }

  function setTopNavCurrent(hash) {
    document.querySelectorAll("[data-nav]").forEach((a) => {
      const target = "#" + a.getAttribute("data-nav");
      a.setAttribute("aria-current", target === hash ? "page" : "false");
    });
  }

  function setEmployeeSubnavCurrent(hash) {
    const map = {
      "#employee": "employee",
      "#tasks": "tasks",
      "#questions": "questions",
      "#schedule": "schedule",
      "#docs": "docs",
      "#report": "report",
      "#profile": null
    };

    document.querySelectorAll("[data-subnav]").forEach((a) => {
      a.setAttribute("aria-current", "false");
    });

    const key = map[hash] || "employee";
    const el = document.querySelector(`[data-subnav="${key}"]`);
    if (el) el.setAttribute("aria-current", "page");
  }

  function showMessage(kind, text) {
    loginMessage.className = "message" + (kind ? " " + kind : "");
    loginMessage.textContent = text || "";
  }

  function isCoolingDown() {
    return APP_STATE.abuse.cooldownUntil > now();
  }

  function remainingCooldownMs() {
    return Math.max(0, APP_STATE.abuse.cooldownUntil - now());
  }

  function disableLoginUI(disabled) {
    inpName.disabled = disabled;
    inpEmpNo.disabled = disabled;
    inpPassword.disabled = disabled;
    btnLogin.disabled = disabled;
    btnReset.disabled = disabled;
  }

  function persistState() {
    const payload = {
      v: 1,
      savedAt: now(),
      auth: {
        isAuthed: APP_STATE.auth.isAuthed,
        role: APP_STATE.auth.role,
        displayName: APP_STATE.auth.displayName,
        empNo: APP_STATE.auth.empNo,
        pinRequired: !!APP_STATE.auth.pinRequired,
        expiresAt: APP_STATE.auth.isAuthed ? (now() + SESSION_TTL_MS) : 0
      },
      abuse: {
        attempts: APP_STATE.abuse.attempts,
        cooldownUntil: APP_STATE.abuse.cooldownUntil
      }
    };

    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      // Fail-closed: kör utan persist om sessionStorage inte funkar
    }
  }

  function loadState() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || data.v !== 1) return;

      if (data.abuse && typeof data.abuse.attempts === "number") {
        APP_STATE.abuse.attempts = data.abuse.attempts;
      }
      if (data.abuse && typeof data.abuse.cooldownUntil === "number") {
        APP_STATE.abuse.cooldownUntil = data.abuse.cooldownUntil;
      }

      const a = data.auth || null;
      if (a && a.isAuthed && a.expiresAt && a.expiresAt > now()) {
        APP_STATE.auth.isAuthed = true;
        APP_STATE.auth.role = a.role || null;
        APP_STATE.auth.displayName = a.displayName || null;
        APP_STATE.auth.empNo = a.empNo || null;
        APP_STATE.auth.pinRequired = !!a.pinRequired;
      } else {
        APP_STATE.auth.isAuthed = false;
        APP_STATE.auth.role = null;
        APP_STATE.auth.displayName = null;
        APP_STATE.auth.empNo = null;
        APP_STATE.auth.pinRequired = false;
      }
    } catch (e) {}
  }

  function clearState() {
    APP_STATE.auth.isAuthed = false;
    APP_STATE.auth.role = null;
    APP_STATE.auth.displayName = null;
    APP_STATE.auth.empNo = null;
    APP_STATE.auth.pinRequired = false;

    APP_STATE.abuse.attempts = 0;
    APP_STATE.abuse.cooldownUntil = 0;

    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  // =========================
  // AO-002: Demo-auth (ingen backend)
  // =========================
  function demoAuth(empNo, password) {
    // admin: empNo 9999, lösen "admin"
    // employee: empNo != 9999, lösen "employee"
    const isAdmin = empNo === "9999" && password === "admin";
    const isEmployee = empNo !== "9999" && password === "employee";
    if (isAdmin) return { ok: true, role: "admin" };
    if (isEmployee) return { ok: true, role: "employee" };
    return { ok: false, role: null };
  }

  function routeForRole(role) {
    if (role === "admin") return "#admin";
    if (role === "employee") return "#employee";
    return "#login";
  }

  function employeeRoute(hash) {
    const allowed = new Set(["#employee", "#tasks", "#questions", "#schedule", "#docs", "#report", "#profile"]);
    return allowed.has(hash) ? hash : "#employee";
  }

  function hideEmployeeRoutes() {
    empHome.hidden = true;
    empTasks.hidden = true;
    empQuestions.hidden = true;
    empSchedule.hidden = true;
    empDocs.hidden = true;
    empReport.hidden = true;
    empProfile.hidden = true;
  }

  function computeTechInfo() {
    const lang = document.documentElement.lang || navigator.language || "sv";
    const info = {
      page: window.location.href,
      language: lang,
      role: APP_STATE.auth.role || "unknown",
      userAgent: navigator.userAgent,
      time: new Date().toISOString()
    };
    return info;
  }

  function wireDemoButtons() {
    document.querySelectorAll("[data-demo-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-demo-action");
        if (action === "open-docs") window.location.hash = "#docs";
        if (action === "done") alert("Demo: markerad som klar (ingen lagring i v1).");
        if (action === "read") alert("Demo: markerad som läst (ingen lagring i v1).");
        if (action === "send-answer") alert("Demo: svar skickat (ska senare gå till Chef + Admin).");
        if (action === "change-password") {
          if (pwStatus) pwStatus.textContent = "Kräver backend för säker lösenordsändring (placeholder).";
        }
      });
    });
  }

  function renderEmployee(hash) {
    // Fill identity
    employeeWho.textContent = APP_STATE.auth.displayName || "—";
    employeeRole.textContent = APP_STATE.auth.role || "—";

    // Show correct employee route
    const er = employeeRoute(hash);
    setEmployeeSubnavCurrent(er);
    hideEmployeeRoutes();

    if (er === "#tasks") empTasks.hidden = false;
    else if (er === "#questions") empQuestions.hidden = false;
    else if (er === "#schedule") empSchedule.hidden = false;
    else if (er === "#docs") empDocs.hidden = false;
    else if (er === "#report") {
      empReport.hidden = false;
      const info = computeTechInfo();
      if (techInfo) techInfo.textContent = JSON.stringify(info, null, 2);
      if (reportStatus) reportStatus.textContent = "";
    }
    else if (er === "#profile") {
      empProfile.hidden = false;
      if (profileName) profileName.textContent = APP_STATE.auth.displayName || "—";
      if (profileEmpNo) profileEmpNo.textContent = APP_STATE.auth.empNo || "—";
      if (profileRole) profileRole.textContent = APP_STATE.auth.role || "—";
      if (pwStatus) pwStatus.textContent = "";
    }
    else empHome.hidden = false;

    // Demo actions
    wireDemoButtons();
  }

  function render() {
    const hash = window.location.hash || "#login";
    APP_STATE.route = hash;

    setTopNavCurrent(hash);

    // Hide all top views
    viewLogin.hidden = true;
    viewAdmin.hidden = true;
    viewEmployee.hidden = true;

    // Guard: if not authed, prevent protected views
    const protectedHashes = new Set(["#admin", "#employee", "#tasks", "#questions", "#schedule", "#docs", "#report", "#profile"]);
    if (!APP_STATE.auth.isAuthed && protectedHashes.has(hash)) {
      window.location.hash = "#login";
      return;
    }

    // Authed: keep user in correct branch
    if (APP_STATE.auth.isAuthed) {
      const correctBranch = routeForRole(APP_STATE.auth.role);

      // Admin branch
      if (APP_STATE.auth.role === "admin") {
        if (hash !== "#admin") {
          window.location.hash = "#admin";
          return;
        }
      }

      // Employee branch (allow subroutes)
      if (APP_STATE.auth.role === "employee") {
        const employeeHashes = new Set(["#employee", "#tasks", "#questions", "#schedule", "#docs", "#report", "#profile"]);
        if (!employeeHashes.has(hash)) {
          window.location.hash = "#employee";
          return;
        }
      }

      // Authed but on login -> redirect to branch
      if (hash === "#login") {
        window.location.hash = correctBranch;
        return;
      }
    }

    // Render view by hash
    if (hash === "#admin") {
      viewAdmin.hidden = false;
      adminWho.textContent = APP_STATE.auth.displayName || "—";
      adminRole.textContent = APP_STATE.auth.role || "—";
      return;
    }

    // Employee: any employee route should show employee view
    const employeeHashes = new Set(["#employee", "#tasks", "#questions", "#schedule", "#docs", "#report", "#profile"]);
    if (employeeHashes.has(hash)) {
      viewEmployee.hidden = false;
      renderEmployee(hash);
      return;
    }

    // Default: login
    viewLogin.hidden = false;

    // Cooldown UI
    if (isCoolingDown()) {
      const sec = Math.ceil(remainingCooldownMs() / 1000);
      disableLoginUI(true);
      showMessage("warn", `För många försök. Vänta ${sec} sekunder och försök igen.`);
      startCooldownTicker();
    } else {
      disableLoginUI(false);
      if (!loginMessage.textContent) showMessage("", "");
    }
  }

  let cooldownTimer = null;
  function startCooldownTicker() {
    if (cooldownTimer) return;
    cooldownTimer = window.setInterval(() => {
      if (!isCoolingDown()) {
        window.clearInterval(cooldownTimer);
        cooldownTimer = null;
        showMessage("", "");
        disableLoginUI(false);
        persistState();
        return;
      }
      const sec = Math.ceil(remainingCooldownMs() / 1000);
      showMessage("warn", `För många försök. Vänta ${sec} sekunder och försök igen.`);
    }, 250);
  }

  function bumpFail() {
    APP_STATE.abuse.attempts += 1;
    if (APP_STATE.abuse.attempts >= MAX_FAILS) {
      APP_STATE.abuse.cooldownUntil = now() + COOLDOWN_MS;
      APP_STATE.abuse.attempts = 0;
    }
    persistState();
  }

  function onLoginSubmit(e) {
    e.preventDefault();

    if (isCoolingDown()) {
      render();
      return;
    }

    const name = sanitizeText(inpName.value);
    const empNo = sanitizeEmpNo(inpEmpNo.value);
    const password = String(inpPassword.value || "");

    if (!name || !empNo || !password) {
      showMessage("err", "Felaktiga inloggningsuppgifter.");
      return;
    }

    const res = demoAuth(empNo, password);
    if (!res.ok) {
      bumpFail();
      if (isCoolingDown()) { render(); return; }
      showMessage("err", "Felaktiga inloggningsuppgifter.");
      return;
    }

    // Success
    APP_STATE.auth.isAuthed = true;
    APP_STATE.auth.role = res.role;
    APP_STATE.auth.displayName = name;
    APP_STATE.auth.empNo = empNo;
    APP_STATE.auth.pinRequired = false; // hook only
    // TODO (AO-001/AO-002): PIN steg senare om pinRequired true.

    APP_STATE.abuse.attempts = 0;
    APP_STATE.abuse.cooldownUntil = 0;

    persistState();

    // Redirect: admin -> #admin, employee -> #employee (home)
    window.location.hash = routeForRole(res.role);
  }

  function onReset() {
    inpName.value = "";
    inpEmpNo.value = "";
    inpPassword.value = "";
    showMessage("", "");
  }

  function onLogout() {
    clearState();
    showMessage("", "");
    window.location.hash = "#login";
  }

  function onReportSubmit(e) {
    e.preventDefault();
    const text = sanitizeText(reportText ? reportText.value : "");
    if (!text) {
      if (reportStatus) reportStatus.textContent = "Skriv en kort beskrivning innan du skickar.";
      return;
    }
    // UI-only i v1: inget sparas, inget skickas.
    if (reportStatus) reportStatus.textContent = "Demo: rapport skickad (inget sparas i v1).";
    if (reportText) reportText.value = "";
  }

  // =========================
  // Init
  // =========================
  function init() {
    loadState();

    loginForm.addEventListener("submit", onLoginSubmit);
    btnReset.addEventListener("click", onReset);

    btnLogoutAdmin.addEventListener("click", onLogout);
    btnLogoutEmployee.addEventListener("click", onLogout);

    if (reportForm) reportForm.addEventListener("submit", onReportSubmit);

    window.addEventListener("hashchange", render);

    // Refresh after login should keep correct branch (and employee subroutes if present)
    if (APP_STATE.auth.isAuthed) {
      if (APP_STATE.auth.role === "admin") {
        window.location.hash = "#admin";
      } else if (APP_STATE.auth.role === "employee") {
        // If user reloads on a subroute, keep it if valid, otherwise go home
        const h = window.location.hash || "#employee";
        const keep = employeeRoute(h);
        window.location.hash = keep;
      }
    } else if (!window.location.hash) {
      window.location.hash = "#login";
    }

    render();
  }

  init();
})();
