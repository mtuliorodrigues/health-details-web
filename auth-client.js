(() => {
  let required = false;
  let leaving = false;
  let expiryTimer;
  let pendingCheck;
  function endSession(reason = 'expired') {
    if (leaving) return;
    leaving = true;
    clearTimeout(expiryTimer);
    window.dispatchEvent(new Event('health-session-ended'));
    document.querySelector('.app-shell')?.setAttribute('hidden', '');
    window.location.replace(`/login.html?reason=${reason}`);
  }
  async function check() {
    if (leaving) return false;
    if (pendingCheck) return pendingCheck;
    pendingCheck = (async () => {
      const response = await fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Não foi possível verificar a sessão. Tente novamente.');
      const session = await response.json();
      required = session.required;
      const button = document.getElementById('logoutButton');
      if (button) button.hidden = !required;
      clearTimeout(expiryTimer);
      if (required && !session.authenticated) { endSession(); return false; }
      if (required && Number.isFinite(session.expiresAt)) {
        expiryTimer = setTimeout(() => endSession(), Math.max(0, session.expiresAt - Date.now()));
      }
      return true;
    })();
    try { return await pendingCheck; } finally { pendingCheck = null; }
  }
  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, credentials: 'same-origin' });
    if (response.status === 401) {
      // Distinguish an expired app session from a rejected internal agent key.
      if (!(await check())) throw new Error('Sua sessão expirou. Entre novamente.');
    }
    return response;
  }
  document.getElementById('logoutButton')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('Não foi possível sair. Tente novamente.');
      endSession('logout');
    } catch (error) {
      window.alert(error.message);
      button.disabled = false;
    }
  });
  const refresh = () => { if (required && !document.hidden) check().catch(() => {}); };
  window.addEventListener('focus', refresh);
  window.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', refresh);
  setInterval(refresh, 60000);
  window.HealthAccess = { check, request };
})();
