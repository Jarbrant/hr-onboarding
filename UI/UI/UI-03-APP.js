/* ============================================================
AO-001 | FIL-ID: UI/UI-03-APP.js
Stam-login + roll-routing v1 (admin, employee)
- Ingen backend (v1)
- Generiskt fel (ingen kontoläckage)
- UI-cooldown efter X misslyckade försök
- Enkel sessionflagga (refresh stannar i vy)
- PIN ej implementerad, men hook finns (pinRequired=false + TODO)
============================================================ */

(function () {
  "use strict";

  // =========================
  // AO-001: State (låst, minimalt)
  // =========================
  const APP_STATE = {
    route: "#login",
    auth: {
      isAuthed: false,
      role: null,           // "admin" | "employee"
      displayName: null,    // ej känsligt (användarens inmatade namn)
      empNo: null,          // anställningsnummer (policy: sökbart i v1)
      pinRequired: false    // AO-001 hook (ingen PIN i v1)
      // TODO (AO-001): Om pinRequired i framtiden -> route till #pin
    },
    abuse: {
      attempts: 0,
      cooldownUntil: 0
    }
  };

  // AO-001: En (1) lagringsnyckel (ingen känslig data, ingen lösenord)
  const STORAGE_KEY = "AO-001_LOGIN_V1";
  const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6h (client only)

  // AO-001: Rate-limit (light, client only)
  const MAX_FAILS = 5;
  const COOLDOWN_MS = 30 * 1000;

  // =========================
  // DOM
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

  // =========================
  // Helpers
  // =========================
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
      // Fail-closed: om sessionStorage inte funkar -> kör utan persist
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
    } catch (e) {
      // ignore
    }
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
  // AO-001: Demo-auth (v1, ingen backend)
  // =========================
  function demoAuth(name, empNo, password) {
    // V1-klientstub för "0 → inloggad".
    // admin: empNo 9999, lösen "admin"
    // employee: alla andra empNo, lösen "employee"
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

  function render() {
    const hash = window.location.hash || "#login";
    APP_STATE.route = hash;

    setNavCurrent(hash);

    viewLogin.hidden = true;
    viewAdmin.hidden = true;
    viewEmployee.hidden = true;

    // Guard: ej authed => tvinga login om någon försöker #admin/#employee
    if (!APP_STATE.auth.isAuthed && (hash === "#admin" || hash === "#employee")) {
      window.location.hash = "#login";
      return;
    }

    // Guard: authed => korrigera route till rätt gren
    if (APP_STATE.auth.isAuthed) {
      const correct = routeForRole(APP_STATE.auth.role);

      // Authed men i fel vy -> korrigera
      if ((hash === "#admin" || hash === "#employee") && hash !== correct) {
        window.location.hash = correct;
        return;
      }

      // Authed men kvar på #login -> skicka vidare
      if (hash === "#login") {
        window.location.hash = correct;
        return;
      }
    }

    if (hash === "#admin") {
      viewAdmin.hidden = false;
      adminWho.textContent = APP_STATE.auth.displayName || "—";
      adminRole.textContent = APP_STATE.auth.role || "—";
      return;
    }

    if (hash === "#employee") {
      viewEmployee.hidden = false;
      employeeWho.textContent = APP_STATE.auth.displayName || "—";
      employeeRole.textContent = APP_STATE.auth.role || "—";
      return;
    }

    // Default: login
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

    // Minimal validering
    if (!name || !empNo || !password) {
      showMessage("err", "Felaktiga inloggningsuppgifter.");
      return;
    }

    const res = demoAuth(name, empNo, password);

    if (!res.ok) {
      bumpFail();
      if (isCoolingDown()) {
        render();
        return;
      }
      showMessage("err", "Felaktiga inloggningsuppgifter.");
      return;
    }

    // Success
    APP_STATE.auth.isAuthed = true;
    APP_STATE.auth.role = res.role;
    APP_STATE.auth.displayName = name;
    APP_STATE.auth.empNo = empNo;

    // AO-001 hook: PIN ska ej implementeras i v1
    APP_STATE.auth.pinRequired = false;
    // TODO (AO-001): Om pinRequired blir true i framtiden, route till #pin innan slut-routing.

    APP_STATE.abuse.attempts = 0;
    APP_STATE.abuse.cooldownUntil = 0;

    persistState();

    // Redirect till rätt vy
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

  // =========================
  // Init
  // =========================
  function init() {
    loadState();

    loginForm.addEventListener("submit", onLoginSubmit);
    btnReset.addEventListener("click", onReset);

    btnLogoutAdmin.addEventListener("click", onLogout);
    btnLogoutEmployee.addEventListener("click", onLogout);

    window.addEventListener("hashchange", render);

    // Test 5: refresh ska stanna i rätt vy om session finns
    if (APP_STATE.auth.isAuthed) {
      window.location.hash = routeForRole(APP_STATE.auth.role);
    } else if (!window.location.hash) {
      window.location.hash = "#login";
    }

    render();
  }

  init();
})();

