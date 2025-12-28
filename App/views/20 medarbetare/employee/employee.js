/* ============================================================
AO-002 | FIL-ID: employee/employee.js
Projekt: HR Onboarding
Syfte: Medarbetar-gren (home.html) – routing + auth-guard + demo UI
Policy:
- Ingen backend (v1)
- Läser endast session från sessionStorage (AO-001_LOGIN_V1)
- Ingen känslig data lagras
- Om ej inloggad -> redirect tillbaka till stam-login
============================================================ */

(function () {
  "use strict";

  const STORAGE_KEY = "AO-001_LOGIN_V1";

  const $ = (sel) => document.querySelector(sel);

  // Identity fields
  const whoName = $("#whoName");
  const whoEmpNo = $("#whoEmpNo");
  const whoRole = $("#whoRole");

  // Profile fields
  const pName = $("#pName");
  const pEmp = $("#pEmp");
  const pRole = $("#pRole");
  const pwStatus = $("#pwStatus");

  // Logout
  const btnLogout = $("#btnLogout");

  // Routes
  const routeHome = $("#route-home");
  const routeTasks = $("#route-tasks");
  const routeQuestions = $("#route-questions");
  const routeSchedule = $("#route-schedule");
  const routeDocs = $("#route-docs");
  const routeReport = $("#route-report");
  const routeProfile = $("#route-profile");

  // Report
  const reportForm = $("#reportForm");
  const reportText = $("#reportText");
  const techInfo = $("#techInfo");
  const reportStatus = $("#reportStatus");

  function safeJsonParse(raw) {
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function sanitizeText(s) {
    return String(s || "").trim().replace(/\s+/g, " ");
  }

  function setSubnavCurrent(hash) {
    const map = {
      "#home": "home",
      "#tasks": "tasks",
      "#questions": "questions",
      "#schedule": "schedule",
      "#docs": "docs",
      "#report": "report"
    };

    document.querySelectorAll("[data-subnav]").forEach((a) => {
      a.setAttribute("aria-current", "false");
    });

    const key = map[hash] || "home";
    const el = document.querySelector(`[data-subnav="${key}"]`);
    if (el) el.setAttribute("aria-current", "page");
  }

  function hideAllRoutes() {
    routeHome.hidden = true;
    routeTasks.hidden = true;
    routeQuestions.hidden = true;
    routeSchedule.hidden = true;
    routeDocs.hidden = true;
    routeReport.hidden = true;
    routeProfile.hidden = true;
  }

  function allowedHash(h) {
    const allowed = new Set(["#home", "#tasks", "#questions", "#schedule", "#docs", "#report", "#profile"]);
    return allowed.has(h) ? h : "#home";
  }

  function computeTechInfo(auth) {
    const lang = document.documentElement.lang || navigator.language || "sv";
    return {
      page: window.location.href,
      language: lang,
      role: auth.role || "employee",
      empNo: auth.empNo || "",
      userAgent: navigator.userAgent,
      time: new Date().toISOString()
    };
  }

  function readSession() {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const data = safeJsonParse(raw);
    if (!data || data.v !== 1 || !data.auth) return null;

    const a = data.auth;
    const expiresAt = Number(a.expiresAt || 0);

    // Kräver giltig session och role employee
    if (!a.isAuthed) return null;
    if (!expiresAt || expiresAt <= Date.now()) return null;
    if (a.role !== "employee") return null;

    return {
      displayName: a.displayName || "—",
      empNo: a.empNo || "—",
      role: a.role || "employee"
    };
  }

  function redirectToLogin() {
    // Vi är i /employee/ så login ligger i /UI/
    window.location.assign("../UI/UI-01-SKELETON.html#login");
  }

  function render(auth) {
    const h = allowedHash(window.location.hash || "#home");

    // Identity
    if (whoName) whoName.textContent = auth.displayName || "—";
    if (whoEmpNo) whoEmpNo.textContent = auth.empNo || "—";
    if (whoRole) whoRole.textContent = auth.role || "employee";

    // Profile
    if (pName) pName.textContent = auth.displayName || "—";
    if (pEmp) pEmp.textContent = auth.empNo || "—";
    if (pRole) pRole.textContent = auth.role || "employee";

    // Nav highlight (profile har ingen subnav-knapp; vi låter den falla tillbaka på Hem i highlight)
    setSubnavCurrent(h === "#profile" ? "#home" : h);

    hideAllRoutes();

    if (h === "#tasks") routeTasks.hidden = false;
    else if (h === "#questions") routeQuestions.hidden = false;
    else if (h === "#schedule") routeSchedule.hidden = false;
    else if (h === "#docs") routeDocs.hidden = false;
    else if (h === "#report") {
      routeReport.hidden = false;
      if (techInfo) techInfo.textContent = JSON.stringify(computeTechInfo(auth), null, 2);
      if (reportStatus) reportStatus.textContent = "";
    }
    else if (h === "#profile") {
      routeProfile.hidden = false;
      if (pwStatus) pwStatus.textContent = "";
    }
    else routeHome.hidden = false;

    wireDemoButtons();
  }

  function wireDemoButtons() {
    document.querySelectorAll("[data-demo-action]").forEach((btn) => {
      // undvik dubbelbindning
      if (btn.dataset.bound === "1") return;
      btn.dataset.bound = "1";

      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-demo-action");

        if (action === "goto-docs") window.location.hash = "#docs";
        if (action === "done") alert("Demo: markerad som klar (ingen lagring i v1).");
        if (action === "read") alert("Demo: markerad som läst (ingen lagring i v1).");
        if (action === "send-answer") alert("Demo: svar skickat (ska senare gå till Chef + Admin).");
        if (action === "change-password") {
          if (pwStatus) pwStatus.textContent = "Kräver backend för säker lösenordsändring (placeholder).";
        }
      });
    });
  }

  function onLogout() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
    redirectToLogin();
  }

  function onReportSubmit(e, auth) {
    e.preventDefault();
    const text = sanitizeText(reportText ? reportText.value : "");

    if (!text) {
      if (reportStatus) reportStatus.textContent = "Skriv en kort beskrivning innan du skickar.";
      return;
    }

    // UI-only: inget skickas, inget sparas.
    // Vi visar bara en bekräftelse.
    if (reportStatus) reportStatus.textContent = "Demo: rapport skickad (inget sparas i v1).";
    if (reportText) reportText.value = "";

    // Teknikinfo uppdateras (så man ser aktuell tid)
    if (techInfo) techInfo.textContent = JSON.stringify(computeTechInfo(auth), null, 2);
  }

  function init() {
    const auth = readSession();
    if (!auth) {
      redirectToLogin();
      return;
    }

    // Default hash
    if (!window.location.hash) window.location.hash = "#home";

    if (btnLogout) btnLogout.addEventListener("click", onLogout);

    if (reportForm) {
      reportForm.addEventListener("submit", (e) => onReportSubmit(e, auth));
    }

    window.addEventListener("hashchange", () => render(auth));

    render(auth);
  }

  init();
})();

