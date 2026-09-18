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
const agentStatus = byId('agentStatus');
const agentStatusText = byId('agentStatusText');
const agentStatusMessage = byId('agentStatusMessage');
const historyPagination = byId('historyPagination');
const historyPrevious = byId('historyPrevious');
const historyNext = byId('historyNext');
const historyPageInfo = byId('historyPageInfo');
const historyFilterButton = byId('historyFilterButton');
const healthSummary = byId('healthSummary');
const apiBaseUrl = '/api/relay';
const historyState = { page: 1, pageSize: 20, totalPages: 1, total: 0 };
let lastCollection = null;
let lastPing = null;

function apiUrl(path) {
  return `${apiBaseUrl}${path}`;
}

async function checkAccessSession() {
  return window.HealthAccess.check();
}

async function checkAgentStatus() {
  if (!agentStatusText) return;
  agentStatus?.setAttribute('data-state', 'checking');
  agentStatusText.textContent = 'Verificando…';
  if (agentStatusMessage) agentStatusMessage.textContent = '';
  try {
    if (!(await checkAccessSession())) return;
    const response = await window.HealthAccess.request(apiUrl('/health'));
    if (!response.ok) throw new Error('O agente não respondeu normalmente.');
    const payload = await response.json();
    if (payload.status !== 'ok') throw new Error('O agente está indisponível.');
    agentStatus?.setAttribute('data-state', 'online');
    agentStatusText.textContent = 'Online';
  } catch {
    agentStatus?.setAttribute('data-state', 'offline');
    agentStatusText.textContent = 'Offline';
    if (agentStatusMessage) agentStatusMessage.textContent = 'Não foi possível comunicar com o agente. Verifique se ele está iniciado.';
  }
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
  lastPing = ping;
  renderHealthSummary();
}

function summaryText(id, value) { const element = byId(id); if (element) element.textContent = value ?? '—'; }

function renderHealthSummary() {
  if (!healthSummary || !lastCollection?.device) return;
  const { device, clients = [] } = lastCollection;
  healthSummary.hidden = false;
  const status = byId('healthSummaryStatus');
  const pingOk = lastPing?.success === true;
  const pingFailed = lastPing && !lastPing.success;
  const label = pingOk ? 'Conectado' : pingFailed ? 'Ping sem resposta' : 'Coleta concluída';
  if (status) { status.textContent = label; status.className = `panel__badge ${pingOk ? 'success' : pingFailed ? 'danger' : 'warning'}`; }
  summaryText('healthSummaryDevice', device.identity || 'Nome indisponível');
  summaryText('healthSummaryHost', `${device.ip} · ${device.vendorLabel || device.vendor}`);
  summaryText('healthSummaryUptime', device.uptime || 'Indisponível');
  summaryText('healthSummaryPing', !lastPing ? 'Ainda não executado' : pingOk ? `Online · ${lastPing.latency == null ? 'latência indisponível' : `${lastPing.latency} ms`}` : 'Sem resposta');
  summaryText('healthSummaryLoss', !lastPing ? 'Ainda não executado' : `${lastPing.packets?.loss ?? 100}%`);
  summaryText('healthSummaryClients', `${clients.length}`);
  const time = byId('healthSummaryTime');
  if (time) time.textContent = `Coleta concluída em ${formatCollectedAt(device.collectedAt)}.`;
  const metrics = byId('healthSummaryClientMetrics');
  if (!metrics) return;
  metrics.replaceChildren();
  const title = document.createElement('h3');
  title.textContent = 'Principais métricas dos clientes';
  metrics.appendChild(title);
  if (!clients.length) { const empty = document.createElement('p'); empty.textContent = 'Nenhum cliente conectado foi encontrado.'; metrics.appendChild(empty); return; }
  const list = document.createElement('div');
  list.className = 'health-summary-client-list';
  clients.slice(0, 8).forEach((client) => {
    const item = document.createElement('div');
    item.className = 'health-summary-client';
    const name = document.createElement('strong');
    name.textContent = client.radioName || 'Cliente sem nome';
    const details = document.createElement('span');
    const values = [];
    if (device.vendor === 'ubiquiti-m5') {
      if (client.txRxSignalStrength) values.push(`Tx ${client.txRxSignalStrength}`);
      if (client.rxSignal) values.push(`Rx ${client.rxSignal}`);
      if (client.txRxCcq) values.push(`CCQ ${client.txRxCcq}`);
      if (client.uptime) values.push(`Conexão ${client.uptime}`);
    } else if (device.vendor === 'ubiquiti-ac') {
      if (client.txRxSignalStrength) values.push(`Signal ${client.txRxSignalStrength}`);
      if (client.txRxCcq) values.push(`Remote Signal ${client.txRxCcq}`);
      if (client.uptime) values.push(`Conexão ${client.uptime}`);
    } else {
      if (client.mac) values.push(`MAC ${client.mac}`);
      if (client.txRxSignalStrength) values.push(`Sinal ${client.txRxSignalStrength}`);
      if (client.txRxCcq) values.push(`CCQ ${client.txRxCcq}`);
      if (client.uptime) values.push(`Conexão ${client.uptime}`);
    }
    details.textContent = values.length ? values.join(' · ') : 'Métricas indisponíveis';
    item.append(name, details); list.appendChild(item);
  });
  metrics.appendChild(list);
}

function renderCollectionData({ device, clients }) {
  lastCollection = { device, clients: clients || [] };
  lastPing = null;
  const clientCount = clients?.length || 0;
  setText('deviceSignalTx', device.identity || device.vendorLabel);
  setText('deviceSignalRx', device.uptime);
  setText('deviceCcq', String(clientCount));
  setText('detectedDevice', `— ${device.vendorLabel}`);
  renderClients(clients, device.vendor);
  renderHealthSummary();
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
    if (!(await checkAccessSession())) return;
    const response = await window.HealthAccess.request(apiUrl(`/api/devices/history/${id}`), { method: 'DELETE' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'Não foi possível excluir a coleta.');
    await loadHistory();
  } catch (error) {
    button.disabled = false;
    button.textContent = originalText;
    window.alert(error.message || 'Não foi possível excluir a coleta.');
  }
}

function renderHistory(history = [], meta = {}) {
  if (!historyList || !historyBadge) return;
  historyList.replaceChildren();
  historyBadge.textContent = `${meta.total ?? history.length} coleta(s)`;
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
    const isFailure = item.status === 'failure' || item.status === 'error';
    title.textContent = `${isFailure ? '[Falha] ' : ''}${item.identity || item.vendor_label || item.vendor || 'Dispositivo sem nome'}`;
    const meta = document.createElement('span');
    meta.className = 'history-dropdown__meta';
    meta.textContent = `${item.ip} · ${formatCollectedAt(item.collected_at)} · ${isFailure ? 'Falha' : `${item.client_count || 0} cliente(s)`}`;
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
    [['IP', item.ip], ['Tipo', item.vendor_label || item.vendor], ['Nome', item.identity], ['Uptime', item.uptime], ['Resultado', isFailure ? 'Falha' : 'Sucesso'], ['Clientes', item.client_count]].forEach(([label, value]) => {
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

    if (isFailure) {
      const errorText = document.createElement('p');
      errorText.className = 'history-failure-message';
      errorText.textContent = item.error_message || 'Falha durante a coleta.';
      content.appendChild(errorText);
    }

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
    if (!(await checkAccessSession())) return;
    const params = new URLSearchParams({ limit: String(historyState.pageSize), page: String(historyState.page) });
    [['ip', 'historyIpFilter'], ['vendor', 'historyVendorFilter'], ['from', 'historyFromFilter'], ['to', 'historyToFilter'], ['status', 'historyStatusFilter']].forEach(([key, id]) => { const value = byId(id)?.value; if (value) params.set(key, value); });
    const response = await window.HealthAccess.request(apiUrl(`/api/devices/history?${params}`));
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'Não foi possível carregar o histórico.');
    historyState.total = payload.total ?? payload.history?.length ?? 0;
    historyState.totalPages = Math.max(payload.totalPages || 1, 1);
    historyState.page = payload.page || historyState.page;
    renderHistory(payload.history || [], payload);
    if (historyPagination) historyPagination.hidden = historyState.totalPages <= 1;
    if (historyPageInfo) historyPageInfo.textContent = `Página ${historyState.page} de ${historyState.totalPages}`;
    if (historyPrevious) historyPrevious.disabled = historyState.page <= 1;
    if (historyNext) historyNext.disabled = historyState.page >= historyState.totalPages;
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
    const close = () => {
      source.close();
      window.removeEventListener('health-session-ended', expired);
    };
    const expired = () => { completed = true; close(); reject(new Error('Sua sessão expirou. Entre novamente.')); };
    window.addEventListener('health-session-ended', expired);
    source.addEventListener('log', (event) => appendCollectionLog(JSON.parse(event.data).message));
    source.addEventListener('result', (event) => {
      completed = true;
      close();
      resolve(JSON.parse(event.data));
    });
    source.addEventListener('error', async (event) => {
      if (completed) return;
      completed = true;
      close();
      if (!event.data) {
        try {
          if (!(await checkAccessSession())) return reject(new Error('Sua sessão expirou. Entre novamente.'));
        } catch { /* Preserve the original stream failure if session lookup is unavailable. */ }
      }
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
    if (!(await checkAccessSession())) return;
    const response = await window.HealthAccess.request(apiUrl('/api/devices/diagnostics/ping'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'Falha no diagnóstico.');
    renderPing(payload.ping);
  } catch (error) {
    lastPing = { success: false, packets: { loss: 100 } };
    renderHealthSummary();
    setText('pingValue', error.message || 'Não foi possível executar o ping.');
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
    if (!(await checkAccessSession())) return;
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
historyFilterButton?.addEventListener('click', () => { historyState.page = 1; loadHistory(); });
historyPrevious?.addEventListener('click', () => { if (historyState.page > 1) { historyState.page -= 1; loadHistory(); } });
historyNext?.addEventListener('click', () => { if (historyState.page < historyState.totalPages) { historyState.page += 1; loadHistory(); } });
applyTheme(localStorage.getItem('healthDetailsTheme') || 'light');
checkAccessSession().then(() => checkAgentStatus()).catch((error) => { scanStatus.textContent = error.message; });
window.setInterval(checkAgentStatus, 60_000);
