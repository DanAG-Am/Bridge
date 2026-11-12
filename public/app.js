const state = { requests: [], filter: 'All', selected: null, history: JSON.parse(localStorage.getItem('bridge-support') || '[]') };
const $ = (selector) => document.querySelector(selector);
const money = (value) => `$${Number(value).toFixed(0)}`;
const status = (message, type = '') => { $('#status').textContent = message; $('#status').className = `status ${type}`; };

function renderRequests() {
  const visible = state.requests.filter((item) => state.filter === 'All' || item.category === state.filter);
  $('#request-grid').innerHTML = visible.map((item) => {
    const remaining = Math.max(0, item.goal - item.raised);
    const percent = Math.min(100, Math.round((item.raised / item.goal) * 100));
    const action = item.status === 'Open' && remaining
      ? `<button class="contribute" data-request-id="${item.id}">Help with PayPal</button>`
      : item.status === 'Funded' ? '<span class="funded">Funded ✓</span>' : '<span class="review-note">Awaiting review</span>';
    return `<article class="request-card"><div class="request-top"><span class="category ${item.accent}">${item.category}</span><span class="request-status">${item.status}</span></div><h3>${item.title}</h3><p>${item.story}</p><div class="request-meta"><span>${item.name} · ${item.location}</span><strong>${money(item.raised)} <small>of ${money(item.goal)}</small></strong></div><div class="progress"><span style="width:${percent}%"></span></div><div class="request-bottom"><span>${remaining ? `${money(remaining)} still needed` : 'Goal reached'}</span>${action}</div><button class="report-button" data-report-id="${item.id}">Report concern</button></article>`;
  }).join('') || '<p class="empty">No requests in this category yet.</p>';
  document.querySelectorAll('.contribute').forEach((button) => button.addEventListener('click', () => openContribution(button.dataset.requestId)));
  document.querySelectorAll('[data-report-id]').forEach((button) => button.addEventListener('click', () => reportRequest(button.dataset.reportId)));
}
async function reportRequest(requestId) {
  const reason = window.prompt('What should the Bridge team review?');
  if (!reason?.trim()) return;
  const response = await fetch(`/api/requests/${encodeURIComponent(requestId)}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
  const data = await response.json();
  if (!response.ok) return status(data.error || 'Could not submit report.', 'error');
  const request = state.requests.find((item) => item.id === requestId);
  if (request) request.status = 'Under review';
  renderRequests(); status('Thanks. The request is paused for review.', 'success');
}
function renderFilters() {
  const categories = ['All', ...new Set(state.requests.map((item) => item.category))];
  $('#filters').innerHTML = categories.map((category) => `<button class="${state.filter === category ? 'active' : ''}" data-filter="${category}">${category}</button>`).join('');
  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => { state.filter = button.dataset.filter; renderFilters(); renderRequests(); }));
}
function renderStats() {
  $('#open-count').textContent = state.requests.filter((item) => item.status === 'Open').length;
  $('#funded-total').textContent = money(state.requests.reduce((sum, item) => sum + item.raised, 0));
}
function renderHistory() {
  $('#support-history').innerHTML = state.history.length ? state.history.map((item) => `<div class="history-item"><span class="history-icon">✓</span><div><strong>${item.title}</strong><p>You contributed ${money(item.amount)} · ${item.date}</p></div><span class="confirmed">Confirmed</span></div>`).join('') : '<p class="empty">Your contributions will appear here after you help someone.</p>';
}
function openContribution(id) {
  state.selected = state.requests.find((item) => item.id === id);
  if (!state.selected) return;
  const remaining = state.selected.goal - state.selected.raised;
  $('#drawer-title').textContent = state.selected.title;
  $('#drawer-story').textContent = state.selected.story;
  $('#drawer-progress').style.width = `${Math.min(100, Math.round((state.selected.raised / state.selected.goal) * 100))}%`;
  $('#drawer-progress-copy').textContent = `${money(remaining)} still needed of a ${money(state.selected.goal)} goal.`;
  $('#contribution-amount').value = Math.min(10, remaining);
  $('#contribution-amount').max = remaining;
  $('#contribution-drawer').classList.add('open'); $('#scrim').classList.add('visible');
}
function closeContribution() { $('#contribution-drawer').classList.remove('open'); $('#scrim').classList.remove('visible'); }

$('#request-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = $('#request-input').value.trim();
  const goal = Number($('#request-goal').value);
  if (!input || !goal) return status('Describe the need and add a goal amount.', 'error');
  const button = event.submitter; button.disabled = true; status('Bridge is making the request clearer…');
  try {
    const response = await fetch('/api/ai/polish-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: input }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not prepare the request.');
    $('#draft-preview').hidden = false;
    $('#draft-preview').innerHTML = `<span class="eyebrow">PRIVATE DRAFT</span><h3>${data.request.title}</h3><p>${data.request.summary}</p><small>${data.request.safetyNote}</small><button id="publish-draft">Post this request</button>`;
    $('#publish-draft').addEventListener('click', async () => {
      const publish = await fetch('/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request: { ...data.request, goal } }) });
      const payload = await publish.json(); if (!publish.ok) return status(payload.error || 'Could not post the request.', 'error');
      state.requests.unshift(payload.request); renderFilters(); renderRequests(); renderStats(); $('#draft-preview').hidden = true; $('#request-input').value = ''; status('Request submitted for human review. Contributions open only after approval.', 'success'); $('#requests').scrollIntoView({ behavior: 'smooth' });
    });
    status('Review the private draft before posting.', 'success');
  } catch (error) { status(error.message, 'error'); } finally { button.disabled = false; }
});
$('#contribute-button').addEventListener('click', async (event) => {
  const amount = Number($('#contribution-amount').value);
  if (!state.selected || !amount) return;
  const button = event.currentTarget; button.disabled = true; status('Opening PayPal checkout…');
  try {
    const response = await fetch('/api/paypal/contribution-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: state.selected.id, amount }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not open contribution checkout.');
    window.location.href = data.approvalLink;
  } catch (error) { status(error.message, 'error'); button.disabled = false; }
});
$('#close-drawer').addEventListener('click', closeContribution); $('#scrim').addEventListener('click', closeContribution);

async function loadRequests() {
  const response = await fetch('/api/requests'); const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not load community requests.');
  state.requests = data.requests; renderFilters(); renderRequests(); renderStats(); renderHistory();
}
loadRequests().catch((error) => status(error.message, 'error'));

const params = new URLSearchParams(window.location.search);
if (params.get('payment') === 'success' && params.get('token')) {
  fetch(`/api/paypal/orders/${encodeURIComponent(params.get('token'))}/capture`, { method: 'POST' }).then(async (response) => {
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Payment capture failed.');
    const requestId = params.get('request'); const amount = Number(params.get('amount') || 0); const request = state.requests.find((item) => item.id === requestId);
    if (data.request && request) {
      Object.assign(request, data.request);
      renderRequests(); renderStats();
    } else {
      await loadRequests();
    }
    state.history.unshift({ title: request?.title || 'Community request', amount, date: new Date().toLocaleDateString() }); localStorage.setItem('bridge-support', JSON.stringify(state.history)); renderHistory(); closeContribution(); status(`Thank you. Your ${money(amount)} contribution is confirmed.`, 'success'); window.history.replaceState({}, '', '/');
  }).catch((error) => status(error.message, 'error'));
}
