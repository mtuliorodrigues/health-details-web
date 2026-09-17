const form = document.getElementById('accessForm');
const status = document.getElementById('accessStatus');
const submitButton = form.querySelector('button[type="submit"]');
const reason = new URLSearchParams(window.location.search).get('reason');
if (reason === 'expired') status.textContent = 'Sua sessão expirou. Entre novamente.';
if (reason === 'logout') status.textContent = 'Você saiu da aplicação.';
fetch('/api/auth/session', { cache: 'no-store' }).then(async (response) => {
  if (!response.ok) throw new Error();
  const session = await response.json();
  if (!session.required || session.authenticated) window.location.replace('/');
}).catch(() => { status.textContent = 'Não foi possível verificar o acesso. Tente novamente.'; });
let retryAt = 0;
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitButton.disabled || Date.now() < retryAt) return;
  submitButton.disabled = true;
  status.textContent = 'Verificando…';
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: form.password.value })
    });
    form.password.value = '';
    const result = await response.json();
    if (response.ok) { window.location.replace('/'); return; }
    if (response.status === 429) {
      const seconds = Math.min(900, Math.max(1, Number(response.headers.get('Retry-After')) || 60));
      retryAt = Date.now() + seconds * 1000;
      const update = () => {
        const remaining = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
        status.textContent = remaining ? `Limite de tentativas atingido. Tente novamente em ${remaining}s.` : 'Você já pode tentar novamente.';
        if (!remaining) { submitButton.disabled = false; clearInterval(timer); }
      };
      const timer = setInterval(update, 1000);
      update();
    } else status.textContent = result.message || 'Não foi possível entrar.';
  } catch {
    status.textContent = 'Não foi possível conectar. Tente novamente.';
  } finally {
    form.password.value = '';
    if (Date.now() >= retryAt) submitButton.disabled = false;
  }
});
