const byId = (id) => document.getElementById(id);
const ipInput = byId('ipInput');
const vendorInput = byId('vendorInput');
const scanButton = byId('scanButton');
const scanStatus = byId('scanStatus');
const healthBadge = byId('healthBadge');
const pingButton = byId('pingButton');
const themeToggle = byId('themeToggle');
const themeIcon = byId('themeIcon');
const dashboardNav = byId('dashboardNav');
const historyNav = byId('historyNav');
const collectionLogNav = byId('collectionLogNav');
const dashboardView = byId('dashboardView');
const historyView = byId('historyView');
const collectionLogView = byId('collectionLogView');
const historyList = byId('historyList');
const historyBadge = byId('historyBadge');
const collectionModal = byId('collectionModal');
const collectionModalStatus = byId('collectionModalStatus');
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

function setCollectionModal(visible, message = 'Preparando a coleta…') {
  if (!collectionModal) return;
  collectionModal.hidden = !visible;
  if (collectionModalStatus) collectionModalStatus.textContent = message;
}

function showView(view) {
  const showHistory = view === 'history';
  const showCollectionLog = view === 'collection-log';
  if (dashboardView) dashboardView.hidden = showHistory || showCollectionLog;
  if (historyView) historyView.hidden = !showHistory;
  if (collectionLogView) collectionLogView.hidden = !showCollectionLog;
  dashboardNav?.classList.toggle('active', !showHistory && !showCollectionLog);
  historyNav?.classList.toggle('active', showHistory);
  collectionLogNav?.classList.toggle('active', showCollectionLog);
  if (showHistory) loadHistory();
}

function renderPing(ping) {
  const target = byId('pingValue');
  if (!target) return;
  target.replaceChildren();
  if (!ping) {
    target.textContent = 'Ping não retornou dados.';
    return;
  }
  const summary = document.createElement('div');
  summary.className = 'ping-summary';
  const status = document.createElement('strong');
  status.className = `ping-summary__status ${ping.success ? 'is-online' : 'is-offline'}`;
  status.textContent = ping.success ? 'Online' : 'Sem resposta';
  summary.appendChild(status);
  [
    ['Pacotes recebidos', `${ping.packets?.received ?? 0} de ${ping.packets?.sent ?? 0}`],
    ['Perda', `${ping.packets?.loss ?? 100}%`],
    ['Latência média', ping.latency == null ? 'Indisponível' : `${ping.latency} ms`]
  ].forEach(([label, value]) => {
    const item = document.createElement('div');
    item.className = 'ping-summary__item';
    const itemLabel = document.createElement('span');
    itemLabel.textContent = label;
    const itemValue = document.createElement('strong');
    itemValue.textContent = value;
    item.append(itemLabel, itemValue);
    summary.appendChild(item);
  });
  target.appendChild(summary);
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
  if (collectionModalStatus) collectionModalStatus.textContent = message;
}

function formatCollectedAt(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : 'Data indisponível';
}

function appendHistoryCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = value ?? '—';
  row.appendChild(cell);
}

async function deleteHistoryItem(id, button) {
  if (!window.confirm('Excluir esta coleta do histórico? Esta ação não pode ser desfeita.')) return;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Excluindo…';
  try {
    const response = await fetch(apiUrl(`/api/devices/history/${id}`), { method: 'DELETE' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'Não foi possível excluir a coleta.');
    await loadHistory();
  } catch (error) {
    button.disabled = false;
    button.textContent = originalText;
    window.alert(error.message || 'Não foi possível excluir a coleta.');
  }
}

function renderHistory(history = []) {
  if (!historyList || !historyBadge) return;
  historyList.replaceChildren();
  historyBadge.textContent = `${history.length} coleta(s)`;
  if (!history.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty panel';
    empty.textContent = 'Nenhuma coleta salva ainda.';
    historyList.appendChild(empty);
    return;
  }

  history.forEach((item) => {
    const details = document.createElement('details');
    details.className = 'history-dropdown panel';
    const summary = document.createElement('summary');
    const title = document.createElement('span');
    title.className = 'history-dropdown__title';
    title.textContent = item.identity || item.vendor_label || item.vendor || 'Dispositivo sem nome';
    const meta = document.createElement('span');
    meta.className = 'history-dropdown__meta';
    meta.textContent = `${item.ip} · ${formatCollectedAt(item.collected_at)} · ${item.client_count || 0} cliente(s)`;
    summary.append(title, meta);

    const content = document.createElement('div');
    content.className = 'history-dropdown__content';
    const actions = document.createElement('div');
    actions.className = 'history-actions';
    const deleteButton = document.createElement('button');
    deleteButton.className = 'history-delete-button';
    deleteButton.type = 'button';
    deleteButton.textContent = 'Excluir coleta';
    deleteButton.addEventListener('click', () => deleteHistoryItem(item.id, deleteButton));
    actions.appendChild(deleteButton);
    const host = document.createElement('div');
    host.className = 'history-host-grid';
    [['IP', item.ip], ['Tipo', item.vendor_label || item.vendor], ['Nome', item.identity], ['Uptime', item.uptime], ['Clientes', item.client_count]].forEach(([label, value]) => {
      const card = document.createElement('div');
      card.className = 'history-host-detail';
      const labelElement = document.createElement('span');
      labelElement.textContent = label;
      const valueElement = document.createElement('strong');
      valueElement.textContent = value ?? '—';
      card.append(labelElement, valueElement);
      host.appendChild(card);
    });
    content.appendChild(host);

    const clients = Array.isArray(item.clients) ? item.clients : [];
    const clientsTitle = document.createElement('h3');
    clientsTitle.textContent = 'Clientes encontrados';
    content.appendChild(clientsTitle);
    if (!clients.length) {
      const emptyClients = document.createElement('p');
      emptyClients.className = 'history-empty-text';
      emptyClients.textContent = 'Nenhum cliente retornado nesta coleta.';
      content.appendChild(emptyClients);
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'clients-table-wrap';
      const table = document.createElement('table');
      table.className = 'clients-table';
      const head = document.createElement('thead');
      const headRow = document.createElement('tr');
      ['Nome', 'MAC', 'Uptime', 'Tx/Rx Signal', 'CCQ'].forEach((label) => { const cell = document.createElement('th'); cell.textContent = label; headRow.appendChild(cell); });
      head.appendChild(headRow);
      const body = document.createElement('tbody');
      clients.forEach((client) => {
        const row = document.createElement('tr');
        [client.radioName, client.mac, client.uptime, client.rxSignal ? `${client.txRxSignalStrength ?? '—'} / ${client.rxSignal}` : client.txRxSignalStrength, client.txRxCcq].forEach((value) => appendHistoryCell(row, value));
        body.appendChild(row);
      });
      table.append(head, body);
      wrap.appendChild(table);
      content.appendChild(wrap);
    }
    content.appendChild(actions);
    details.append(summary, content);
    historyList.appendChild(details);
  });
}

async function loadHistory() {
  if (!historyList || !historyBadge) return;
  historyBadge.textContent = 'Carregando';
  historyList.replaceChildren();
  try {
    const response = await fetch(apiUrl('/api/devices/history?limit=50'));
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'Não foi possível carregar o histórico.');
    renderHistory(payload.history || []);
  } catch (error) {
    historyBadge.textContent = 'Indisponível';
    const message = document.createElement('div');
    message.className = 'history-empty panel';
    message.textContent = error.message || 'Não foi possível carregar o histórico.';
    historyList.appendChild(message);
  }
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

async function runPingDiagnostic() {
  const button = pingButton;
  const ip = ipInput?.value.trim();
  if (!ip || !button) return;
  button.disabled = true;
  button.textContent = 'Consultando…';
  try {
    const response = await fetch(apiUrl('/api/devices/diagnostics/ping'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'Falha no diagnóstico.');
    renderPing(payload.ping);
  } finally {
    button.disabled = false;
    button.textContent = 'Executar ping';
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
  setRadioDetails('n/a');
  scanStatus.textContent = 'Consultando dispositivo…';
  setCollectionModal(true, 'Iniciando consulta…');
  const log = byId('collectionLog');
  if (log) log.replaceChildren();
  try {
    const payload = await collectWithLiveLog(ip, vendorInput?.value || 'mikrotik');
    renderCollectionData(payload);
    pingButton.disabled = false;
    scanStatus.textContent = `Consulta concluída às ${new Date(payload.device.collectedAt).toLocaleTimeString('pt-BR')}.`;
  } catch (error) {
    setRadioDetails('err');
    scanStatus.textContent = error.message || 'Não foi possível consultar o dispositivo.';
  } finally {
    scanButton.disabled = false;
    setCollectionModal(false);
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
pingButton?.addEventListener('click', runPingDiagnostic);
dashboardNav?.addEventListener('click', () => showView('dashboard'));
historyNav?.addEventListener('click', () => showView('history'));
collectionLogNav?.addEventListener('click', () => showView('collection-log'));
ipInput?.addEventListener('keydown', (event) => { if (event.key === 'Enter') verifyDevice(); });
themeToggle?.addEventListener('click', () => applyTheme(document.body.classList.contains('dark-theme') ? 'light' : 'dark'));
applyTheme(localStorage.getItem('healthDetailsTheme') || 'light');
