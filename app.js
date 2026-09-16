const byId = (id) => document.getElementById(id);
const ipInput = byId('ipInput');
const vendorInput = byId('vendorInput');
const scanButton = byId('scanButton');
const scanStatus = byId('scanStatus');
const healthBadge = byId('healthBadge');
const pingButton = byId('pingButton');
const tracertButton = byId('tracertButton');
const themeToggle = byId('themeToggle');
const themeIcon = byId('themeIcon');
const apiBaseUrl = window.HEALTH_DETAILS_API_URL?.replace(/\/$/, '') || '';

function apiUrl(path) {
  return `${apiBaseUrl}${path}`;
}

function isValidPrivateIp(ip) {
  const parts = ip.trim().split('.');
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) return false;
  const [first, second] = parts.map(Number);
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function setText(id, value) {
  const element = byId(id);
  if (element) element.textContent = value ?? 'n/a';
}

function setRadioDetails(value) {
  ['deviceSignalTx', 'deviceSignalRx', 'deviceCcq'].forEach((id) => setText(id, value));
}

function renderCommandOutput(targetId, output, fallback) {
  const target = byId(targetId);
  if (!target) return;
  target.replaceChildren();
  const pre = document.createElement('pre');
  pre.className = 'monitor-output';
  pre.textContent = output || fallback;
  target.appendChild(pre);
}

function renderPing(ping) {
  renderCommandOutput('pingValue', ping?.output, 'Ping não retornou saída.');
}

function renderTraceroute(traceroute) {
  renderCommandOutput('tracertValue', traceroute?.output, 'Tracert não retornou saída.');
}

function renderCollectionData({ device, clients }) {
  const clientCount = clients?.length || 0;
  setText('deviceSignalTx', device.identity || device.vendorLabel);
  setText('deviceSignalRx', device.uptime);
  setText('deviceCcq', String(clientCount));
  setText('detectedDevice', `— ${device.vendorLabel}`);
  renderClients(clients, device.vendor);
  if (healthBadge) {
    healthBadge.textContent = clientCount ? `${clientCount} cliente(s)` : 'Sem clientes';
    healthBadge.className = 'panel__badge';
  }
}

function renderClients(clients = [], vendor) {
  const body = byId('clientsTableBody');
  const badge = byId('clientsBadge');
  if (!body) return;
  body.replaceChildren();
  const header = body.closest('table')?.querySelector('thead tr');
  if (header) {
    const labels = vendor === 'ubiquiti-m5' ? ['Device Name', 'Connection Time', 'Tx Signal', 'Rx Signal', 'CCQ%'] : vendor?.startsWith('ubiquiti') ? ['Device Name', 'Signal', 'Remote Signal', 'Connection Time'] : ['Radio Name', 'MAC Address', 'Uptime', 'Tx/Rx Signal Strength', 'Tx/Rx CCQ'];
    header.replaceChildren(...labels.map((label) => { const cell = document.createElement('th'); cell.textContent = label; return cell; }));
  }
  if (!clients.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = vendor === 'ubiquiti-m5' ? 5 : vendor?.startsWith('ubiquiti') ? 4 : 5;
    cell.textContent = 'Nenhum cliente conectado foi encontrado.';
    row.appendChild(cell);
    body.appendChild(row);
  } else {
    clients.forEach((client) => {
      const row = document.createElement('tr');
      (vendor === 'ubiquiti-m5' ? [client.radioName, client.uptime, client.txRxSignalStrength, client.rxSignal, client.txRxCcq] : vendor?.startsWith('ubiquiti') ? [client.radioName, client.txRxSignalStrength, client.txRxCcq, client.uptime] : [client.radioName, client.mac, client.uptime, client.txRxSignalStrength, client.txRxCcq])
        .forEach((value) => { const cell = document.createElement('td'); cell.textContent = value ?? '—'; row.appendChild(cell); });
      body.appendChild(row);
    });
  }
  if (badge) badge.textContent = `${clients.length} cliente(s)`;
}

function appendCollectionLog(message) {
  const log = byId('collectionLog');
  if (!log) return;
  const line = document.createElement('div');
  line.textContent = `[${new Date().toLocaleTimeString('pt-BR')}] ${message}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function collectWithLiveLog(ip, vendor) {
  return new Promise((resolve, reject) => {
    const source = new EventSource(apiUrl(`/api/devices/collect/stream?ip=${encodeURIComponent(ip)}&vendor=${encodeURIComponent(vendor)}`));
    let completed = false;
    source.addEventListener('log', (event) => appendCollectionLog(JSON.parse(event.data).message));
    source.addEventListener('result', (event) => {
      completed = true;
      source.close();
      resolve(JSON.parse(event.data));
    });
    source.addEventListener('error', (event) => {
      if (completed) return;
      source.close();
      try { reject(new Error(JSON.parse(event.data).message)); } catch { reject(new Error('A conexão da coleta foi encerrada.')); }
    });
  });
}

async function runDiagnostic(type) {
  const button = type === 'ping' ? pingButton : tracertButton;
  const ip = ipInput?.value.trim();
  if (!ip || !button) return;
  button.disabled = true;
  button.textContent = 'Consultando…';
  try {
    const response = await fetch(apiUrl(`/api/devices/diagnostics/${type}`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'Falha no diagnóstico.');
    if (type === 'ping') renderPing(payload.ping);
    else renderTraceroute(payload.traceroute);
  } finally {
    button.disabled = false;
    button.textContent = type === 'ping' ? 'Executar ping' : 'Executar tracert';
  }
}

async function verifyDevice() {
  const ip = ipInput?.value.trim() || '';
  if (!isValidPrivateIp(ip)) {
    scanStatus.textContent = 'Informe um IPv4 privado válido (10/8, 172.16/12 ou 192.168/16).';
    return;
  }

  scanButton.disabled = true;
  pingButton.disabled = true;
  tracertButton.disabled = true;
  setRadioDetails('n/a');
  scanStatus.textContent = 'Consultando dispositivo…';
  const log = byId('collectionLog');
  if (log) log.replaceChildren();
  try {
    const payload = await collectWithLiveLog(ip, vendorInput?.value || 'mikrotik');
    renderCollectionData(payload);
    pingButton.disabled = false;
    tracertButton.disabled = false;
    scanStatus.textContent = `Consulta concluída às ${new Date(payload.device.collectedAt).toLocaleTimeString('pt-BR')}.`;
  } catch (error) {
    setRadioDetails('err');
    scanStatus.textContent = error.message || 'Não foi possível consultar o dispositivo.';
  } finally {
    scanButton.disabled = false;
  }
}

function applyTheme(theme) {
  const dark = theme === 'dark';
  document.body.classList.toggle('dark-theme', dark);
  themeToggle?.setAttribute('aria-pressed', String(dark));
  if (themeIcon) themeIcon.textContent = dark ? '☀️' : '🌙';
  localStorage.setItem('healthDetailsTheme', theme);
}

scanButton?.addEventListener('click', verifyDevice);
pingButton?.addEventListener('click', () => runDiagnostic('ping'));
tracertButton?.addEventListener('click', () => runDiagnostic('traceroute'));
ipInput?.addEventListener('keydown', (event) => { if (event.key === 'Enter') verifyDevice(); });
themeToggle?.addEventListener('click', () => applyTheme(document.body.classList.contains('dark-theme') ? 'light' : 'dark'));
applyTheme(localStorage.getItem('healthDetailsTheme') || 'light');
