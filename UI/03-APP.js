/* ============================================================
AO-002 | FIL-ID: UI/UI-03-APP.js
Stam-login + roll-routing v1 (admin, employee)
UPPDATERING:
- Employee redirectar till ROOT-gren: ../employee/home.html
- Stöd för URL-parametrar: ?name=...&empNo=...&password=...
  - Autofyller login-fält
  - Auto-login om alla tre finns och name ej tomt
Policy:
- Ingen backend (v1)
- Generiskt fel (ingen kontoläckage)
- UI-cooldown efter X misslyckade försök
- Enkel sessionflagga (refresh stannar i rätt vy)
- PIN ej implementerad, men hook finns
============================================================ */

(function () {
  "use strict";

  const APP_STATE = {
    route: "#login",
    auth: {
      isAuthed: false,
      role: null,           // "admin" | "employee"
      displayName: null,    // ej känsligt
      empNo: null,          // anställningsnummer (policy: sökbart i v1)
      pinRequired: false    // hook (ingen PIN i v1)
    },
    abuse: {
      attempts: 0,
      cooldownUntil: 0
    }
  };

  const STORAGE_KEY = "AO-001_LOGIN_V1";
  const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6h (client only)

  const MAX_FAILS = 5;
  const COOLDOWN_MS = 30 * 1000;

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

  function now() { return Date.now(); }

  function setNavCurrent(hash) {
    document.querySelectorAll("[data-nav]").forEach((a) => {
      const target = "#" + a.getAttribute("data-nav");
      a.setAttribute("aria-current", target === hash ? "page" : "false");
    });
  }

  function showMessage(kind, text) {
    loginMessage.className = "message" + (kind ? " " + kind : "");
    loginMessage.textContent = text || "";
  }

  function sanitizeText(s) {
    return String(s || "").trim().replace(/\s+/g, " ");
  }

  function sanitizeEmpNo(s) {
    return String(s || "").trim().replace(/[^\d]/g, "");
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

  // Demo-auth (v1)
  function demoAuth(empNo, password) {
    // admin: empNo 9999, lösen "admin"
    // employee: empNo != 9999, lösen "employee"
    const isAdmin = empNo === "9999" && password === "admin";
    const isEmployee = empNo !== "9999" && password === "employee";
    if (isAdmin) return { ok: true, role: "admin" };
    if (isEmployee) return { ok: true, role: "employee" };
    return { ok: false, role: null };
  }

  function goToEmployeeHome() {
    // Vi står i UI/ -> employee-grenen ligger i repo-root
    window.location.assign("../employee/home.html");
  }

  // URL-parametrar: ?name=&empNo=&password=
  function getLoginParamsFromUrl() {
    try {
      const u = new URL(window.location.href);
      const sp = u.searchParams;
      const name = sanitizeText(sp.get("name"));
      const empNo = sanitizeEmpNo(sp.get("empNo"));
      const password = String(sp.get("password") || "");
      const hasAny = !!(sp.has("name") || sp.has("empNo") || sp.has("password"));
      return { hasAny, name, empNo, password };
    } catch (e) {
      return { hasAny: false, name: "", empNo: "", password: "" };
    }
  }

  function fillLoginFormFromParams(p) {
    if (!p || !p.hasAny) return;
    if (inpName) inpName.value = p.name || "";
    if (inpEmpNo) inpEmpNo.value = p.empNo || "";
    if (inpPassword) inpPassword.value = p.password || "";
  }

  function render() {
    const hash = window.location.hash || "#login";
    APP_STATE.route = hash;

    setNavCurrent(hash);

    viewLogin.hidden = true;
    viewAdmin.hidden = true;
    viewEmployee.hidden = true;

    if (!APP_STATE.auth.isAuthed && (hash === "#admin" || hash === "#employee")) {
      window.location.hash = "#login";
      return;
    }

    if (APP_STATE.auth.isAuthed) {
      if (APP_STATE.auth.role === "employee") {
        goToEmployeeHome();
        return;
      }
      if (APP_STATE.auth.role === "admin") {
        if (hash !== "#admin") {
          window.location.hash = "#admin";
          return;
        }
      }
    }

    if (hash === "#admin") {
      viewAdmin.hidden = false;
      adminWho.textContent = APP_STATE.auth.displayName || "—";
      adminRole.textContent = APP_STATE.auth.role || "—";
      return;
    }

    if (hash === "#employee") {
      // säkerhetsnät
      if (APP_STATE.auth.isAuthed && APP_STATE.auth.role === "employee") {
        goToEmployeeHome();
        return;
      }
      viewEmployee.hidden = false;
      employeeWho.textContent = APP_STATE.auth.displayName || "—";
      employeeRole.textContent = APP_STATE.auth.role || "—";
      return;
    }

    viewLogin.hidden = false;

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

    // kräver name+empNo+password i v1
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
    // TODO (AO-001): PIN-steg senare om pinRequired true.

    APP_STATE.abuse.attempts = 0;
    APP_STATE.abuse.cooldownUntil = 0;

    persistState();

    if (res.role === "employee") {
      goToEmployeeHome();
      return;
    }
    window.location.hash = "#admin";
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

  function tryAutoLoginFromUrlParams() {
    if (APP_STATE.auth.isAuthed) return;

    const p = getLoginParamsFromUrl();
    if (!p.hasAny) return;

    // Autofyll alltid om params finns
    fillLoginFormFromParams(p);

    // Auto-login endast om ALLA tre finns och name ej tomt
    const canAuto = !!(p.name && p.empNo && p.password);
    if (!canAuto) {
      // generiskt meddelande utan kontoläckage
      showMessage("err", "Felaktiga inloggningsuppgifter.");
      return;
    }

    // Försök auto-submit (respektera cooldown)
    if (isCoolingDown()) {
      render();
      return;
    }

    // Syntetiskt submit (använder samma validering/logik)
    onLoginSubmit({ preventDefault: function () {} });
  }

  function init() {
    loadState();

    loginForm.addEventListener("submit", onLoginSubmit);
    btnReset.addEventListener("click", onReset);

    if (btnLogoutAdmin) btnLogoutAdmin.addEventListener("click", onLogout);
    if (btnLogoutEmployee) btnLogoutEmployee.addEventListener("click", onLogout);

    window.addEventListener("hashchange", render);

    // Refresh efter login: employee går alltid till employee/home.html
    if (APP_STATE.auth.isAuthed && APP_STATE.auth.role === "employee") {
      goToEmployeeHome();
      return;
    }

    if (!window.location.hash) window.location.hash = "#login";

    render();

    // Efter första render: prova URL-parametrar
    // (så att inputfält finns och UI-meddelanden syns)
    tryAutoLoginFromUrlParams();
  }

  init();
})();
