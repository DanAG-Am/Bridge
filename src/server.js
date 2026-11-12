const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 5000);
const paypalBaseUrl = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2:3b';
const workspaceLabel = process.env.PAYPAL_WORKSPACE_LABEL || 'Dan’s studio';

const locallyCapturedTransactions = [];
const MAX_REQUEST_GOAL = 500;
const MAX_CONTRIBUTION = 25;
const bridgeRequests = [
  { id: 'groceries-before-payday', name: 'Ari', category: 'Groceries', title: 'Groceries before payday', story: 'I am between shifts this week and need a little help covering groceries for my daughter and me until Friday.', goal: 45, raised: 28, location: 'Phoenix, AZ', status: 'Open', accent: 'sun' },
  { id: 'bus-pass-job-interview', name: 'Maya', category: 'Transportation', title: 'A bus pass for a job interview', story: 'I have an interview across town on Monday. A weekly bus pass would get me there and keep me moving while I look for work.', goal: 32, raised: 12, location: 'Detroit, MI', status: 'Open', accent: 'blue' },
  { id: 'school-supplies', name: 'Jordan', category: 'School', title: 'School supplies for two kids', story: 'My children are starting a new term and we are short on the basics: notebooks, pencils, and backpacks.', goal: 85, raised: 85, location: 'El Paso, TX', status: 'Funded', accent: 'green' }
];
const bridgeDrafts = [];
const bridgeReports = [];
const submissionLog = new Map();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '../public')));

function isConfigured(value) {
  return Boolean(value && !value.startsWith('your_') && !value.includes('your-'));
}

function requirePayPalCredentials() {
  if (!isConfigured(process.env.PAYPAL_CLIENT_ID) || !isConfigured(process.env.PAYPAL_CLIENT_SECRET)) {
    const     error = new Error('Payment credentials are not configured. Add them to .env.');
    error.status = 503;
    throw error;
  }
}

async function getPayPalAccessToken() {
  requirePayPalCredentials();
  const credentials = Buffer
    .from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`)
    .toString('base64');
  const response = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  if (!response.ok) throw new Error(`PayPal authentication failed (${response.status}).`);
  return (await response.json()).access_token;
}

async function paypalRequest(endpoint, options = {}) {
  const token = await getPayPalAccessToken();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${paypalBaseUrl}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': crypto.randomUUID(),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data;

    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      continue;
    }

    const message = data.name === 'PERMISSION_DENIED' || response.status === 403
      ? 'This Sandbox app cannot read transaction history. Use credentials from a Sandbox Business seller account with Transaction Search enabled.'
      : retryable
        ? 'PayPal Sandbox is temporarily unavailable. Please try again in a few seconds.'
        : data.message || `PayPal request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
}

async function fetchSandboxTransactions() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  const params = new URLSearchParams({
    start_date: start.toISOString(),
    end_date: end.toISOString(),
    fields: 'transaction_info,payer_info,shipping_info'
  });
  const data = await paypalRequest(`/v1/reporting/transactions?${params}`);
  const reported = (data.transaction_details || [])
    .filter((item) => item.transaction_info?.transaction_event_code !== 'T1900')
    .map((item) => {
    const info = item.transaction_info || {};
    const payer = item.payer_info || {};
    const value = Number(info.transaction_amount?.value || 0);
    const status = String(info.transaction_status || 'UNKNOWN').toUpperCase();
    return {
      id: info.transaction_id || 'Unknown',
      customer: payer.payer_name?.alternate_full_name || payer.email_address || 'Sandbox buyer',
      amount: value,
      status: status === 'S' ? 'COMPLETED' : status === 'P' ? 'PENDING' : status,
      category: `PayPal ${info.transaction_event_code || 'transaction'}`,
      date: info.transaction_initiation_date
        ? new Date(info.transaction_initiation_date).toLocaleDateString()
        : 'Unknown',
      repeat: false
    };
  });
  return [...reported, ...locallyCapturedTransactions.filter((local) => !reported.some((item) => item.id === local.id))];
}

function dashboardData(items = []) {
  const completed = items.filter((item) => item.status === 'COMPLETED');
  const revenue = completed.reduce((sum, item) => sum + item.amount, 0);
  const repeatRevenue = completed.filter((item) => item.repeat).reduce((sum, item) => sum + item.amount, 0);
  const categories = completed.reduce((result, item) => {
    result[item.category] = (result[item.category] || 0) + item.amount;
    return result;
  }, {});
  return {
    workspace: {
      label: workspaceLabel,
      environment: 'Sandbox',
      accountType: 'Business'
    },
    transactions: items,
    metrics: {
      revenue,
      completed: completed.length,
      pending: items.filter((item) => item.status === 'PENDING').length,
      repeatRate: completed.length
        ? Math.round((completed.filter((item) => item.repeat).length / completed.length) * 100)
        : 0,
      repeatRevenue
    },
    categories: Object.entries(categories).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    forecast: {
      expected: revenue + items.filter((item) => item.status === 'PENDING').reduce((sum, item) => sum + item.amount, 0),
      confidence: items.length ? 82 : 0,
      note: items.some((item) => item.status === 'PENDING') ? 'Includes pending payments if they clear.' : 'Based on completed payment activity.'
    },
    actions: buildActions(items)
  };
}

function buildActions(items) {
  const pending = items.find((item) => item.status === 'PENDING');
  const highest = items.filter((item) => item.status === 'COMPLETED').sort((a, b) => b.amount - a.amount)[0];
  const actions = [];
  if (pending) {
    actions.push({
      title: `Follow up with ${pending.customer}`,
      detail: `${money(pending.amount)} is still pending. Check whether the customer needs a follow-up.`
    });
  }
  if (highest) {
    actions.push({
      title: `Thank ${highest.customer}`,
      detail: `Your largest completed payment is ${money(highest.amount)}. Consider a personal follow-up while the context is fresh.`
    });
  }
  return actions;
}

function money(value) {
  return `$${Number(value).toFixed(2)}`;
}

function rememberCapturedOrder(order) {
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture?.id || locallyCapturedTransactions.some((item) => item.id === capture.id)) return;
  locallyCapturedTransactions.push({
    id: capture.id,
    customer: order.payer?.name
      ? `${order.payer.name.given_name || ''} ${order.payer.name.surname || ''}`.trim()
      : 'Sandbox buyer',
    amount: Number(capture.amount?.value || 0),
    status: 'COMPLETED',
    category: 'PayPal checkout',
    date: capture.create_time ? new Date(capture.create_time).toLocaleDateString() : new Date().toLocaleDateString(),
    repeat: false
  });
}

function buildDashboard(source, liveTransactions = []) {
  const result = dashboardData(liveTransactions);
  result.source = source;
  result.forecast.expected = result.metrics.revenue + liveTransactions
    .filter((item) => item.status === 'PENDING')
    .reduce((sum, item) => sum + item.amount, 0);
  result.forecast.note = liveTransactions.some((item) => item.status === 'PENDING')
    ? 'Includes pending payments if they clear.'
    : 'Based only on completed payment activity.';
  return result;
}

async function createAiBriefing(data) {
  const response = await fetch(`${ollamaBaseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ollamaModel,
      stream: false,
      format: 'json',
      prompt: [
        'You are an AI business operations analyst.',
        'Based on the dashboard data, return JSON with exactly: headline (string), summary (string), priorities (array of strings), opportunity (string).',
        'Give practical, specific advice. Do not invent transaction facts.',
        JSON.stringify(data)
      ].join('\n')
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'Ollama is unavailable. Start Ollama and run ollama pull llama3.2:3b.');
    error.status = 503;
    throw error;
  }

  try {
    return JSON.parse(body.response);
  } catch {
    const error = new Error('AI returned an invalid business briefing.');
    error.status = 502;
    throw error;
  }

}

async function polishSupportRequest(message) {
  const response = await fetch(`${ollamaBaseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ollamaModel,
      stream: false,
      format: 'json',
      prompt: [
        'You are Bridge, a careful mutual-aid writing assistant.',
        'Return JSON with exactly: title (string), summary (string), category (one of Groceries, Transportation, Housing, Medical, School, Other), safetyNote (string).',
        'Make the request clear and dignified. Remove names, addresses, phone numbers, diagnoses, account numbers, and other sensitive details. Never decide whether someone deserves help. Do not invent facts.',
        `Support request: ${String(message || '').trim()}`
      ].join('\n')
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'Bridge AI is unavailable. Start Ollama and try again.');
    error.status = 503;
    throw error;
  }
  let result;
  try {
    result = JSON.parse(body.response);
  } catch {
    const error = new Error('Bridge AI returned an invalid summary.');
    error.status = 502;
    throw error;
  }
  const redactSensitive = (value) => String(value || '')
    .replace(/\b\d{1,5}\s+[A-Za-z0-9.'-]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|Lane|Ln)\b/gi, '[location removed]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[contact removed]')
    .replace(/\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, '[contact removed]');
  result.title = redactSensitive(result.title);
  result.summary = redactSensitive(result.summary);
  result.safetyNote = redactSensitive(result.safetyNote);
  return result;
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    paypalConfigured: isConfigured(process.env.PAYPAL_CLIENT_ID) && isConfigured(process.env.PAYPAL_CLIENT_SECRET),
    aiProvider: 'ollama',
    aiModel: ollamaModel
  });
});

app.get('/api/requests', (req, res) => {
    res.json({ success: true, requests: [...bridgeDrafts, ...bridgeRequests] });
});

app.post('/api/ai/polish-request', async (req, res, next) => {
    try {
      const message = String(req.body.message || '').trim();
      if (!message) {
        const error = new Error('Describe what support is needed.');
        error.status = 400;
        throw error;
      }
      res.json({ success: true, request: await polishSupportRequest(message) });
    } catch (error) {
      next(error);
    }
});

app.post('/api/requests', async (req, res, next) => {
  try {
    const request = req.body.request || {};
    const goal = Number(request.goal);
    if (!request.title || !request.summary || !Number.isFinite(goal) || goal < 1 || goal > MAX_REQUEST_GOAL) {
      const error = new Error(`Add a clear need and a goal between $1 and $${MAX_REQUEST_GOAL}.`);
      error.status = 400;
      throw error;
    }
    const fingerprint = `${String(request.title).toLowerCase()}|${String(request.summary).toLowerCase()}`
      .replace(/[^a-z0-9|]/g, '').slice(0, 500);
    const now = Date.now();
    const recentSubmissions = submissionLog.get(req.ip) || [];
    if (recentSubmissions.some((timestamp) => now - timestamp < 60 * 60 * 1000)) {
      const error = new Error('For safety, only one request can be submitted from this connection each hour.');
      error.status = 429;
      throw error;
    }
    if (bridgeRequests.concat(bridgeDrafts).some((item) => `${item.title}|${item.story}`.toLowerCase().replace(/[^a-z0-9|]/g, '') === fingerprint)) {
      const error = new Error('A very similar request is already on the board. Please review it before posting another.');
      error.status = 409;
      throw error;
    }
    const created = {
      id: `request-${Date.now()}`,
      name: 'Community member',
      category: String(request.category || 'Other'),
      title: String(request.title).slice(0, 100),
      story: String(request.summary).slice(0, 500),
      goal: Number(goal.toFixed(2)),
      raised: 0,
      location: 'Location hidden',
      status: 'Pending review',
      accent: 'violet',
      riskFlags: ['New request — human review required']
    };
    bridgeDrafts.unshift(created);
    submissionLog.set(req.ip, [...recentSubmissions, now]);
    res.status(201).json({ success: true, request: created });
  } catch (error) {
    next(error);
  }
});

app.post('/api/paypal/contribution-order', async (req, res, next) => {
  try {
    const request = bridgeRequests.concat(bridgeDrafts).find((item) => item.id === req.body.requestId);
    const amount = Number(req.body.amount);
    if (!request || request.status !== 'Open' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_CONTRIBUTION || amount > request.goal - request.raised) {
      const error = new Error(`Choose an open request and a contribution up to $${MAX_CONTRIBUTION} within its remaining need.`);
      error.status = 400;
      throw error;
    }
    const order = await paypalRequest('/v2/checkout/orders', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          description: `Bridge support: ${request.title}`,
          custom_id: request.id,
          amount: { currency_code: 'USD', value: amount.toFixed(2) }
        }],
        application_context: {
          brand_name: 'Bridge',
          user_action: 'PAY_NOW',
          return_url: `${req.protocol}://${req.get('host')}/?payment=success&request=${encodeURIComponent(request.id)}&amount=${amount.toFixed(2)}`,
          cancel_url: `${req.protocol}://${req.get('host')}/?payment=cancelled`
        }
      })
    });

    res.status(201).json({ success: true, orderId: order.id, approvalLink: order.links?.find((link) => link.rel === 'approve')?.href });
  } catch (error) {
    next(error);
  }
});

app.post('/api/requests/:requestId/report', (req, res, next) => {
  try {
    const request = bridgeRequests.concat(bridgeDrafts).find((item) => item.id === req.params.requestId);
    const reason = String(req.body.reason || '').trim();
    if (!request || !reason) {
      const error = new Error('Choose a request and provide a report reason.');
      error.status = 400;
      throw error;
    }
    bridgeReports.push({ requestId: request.id, reason: reason.slice(0, 240), createdAt: new Date().toISOString() });
    request.status = 'Under review';
    res.status(201).json({ success: true, message: 'Thanks. The request has been sent for review.' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/dashboard', (req, res) => {
  fetchSandboxTransactions()
    .then((liveTransactions) => res.json({
      success: true,
      dashboard: buildDashboard('paypal', liveTransactions),
      message: liveTransactions.length
        ? 'Your latest payment activity is up to date.'
        : 'No completed payments found yet.'
    }))
    .catch((error) => res.status(error.status || 500).json({ success: false, error: error.message }));
});

app.get('/api/dashboard/paypal', async (req, res, next) => {
  try {
    const liveTransactions = await fetchSandboxTransactions();
    res.json({
      success: true,
      dashboard: buildDashboard('paypal', liveTransactions),
      message: liveTransactions.length
        ? 'Your latest payment activity is up to date.'
        : 'No completed payments found yet.'
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/ai/briefing', async (req, res, next) => {
  try {
    const liveTransactions = await fetchSandboxTransactions();
    res.json({ success: true, briefing: await createAiBriefing(buildDashboard('paypal', liveTransactions)) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/paypal/transactions/:transactionId/refund', async (req, res, next) => {
  try {
    const transactionId = encodeURIComponent(String(req.params.transactionId || '').trim());
    if (!transactionId) {
      const error = new Error('A PayPal transaction ID is required.');
      error.status = 400;
      throw error;
    }
    const amount = req.body.amount === undefined
      ? undefined
      : { currency_code: 'USD', value: Number(req.body.amount).toFixed(2) };
    const body = amount ? { amount } : {};
    const refund = await paypalRequest(`/v2/payments/captures/${transactionId}/refund`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    res.json({ success: true, refundId: refund.id, status: refund.status });
  } catch (error) {
    next(error);
  }
});

app.post('/api/paypal/action', async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);
    const description = String(req.body.description || 'PayPal Pulse action').trim();
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
      const error = new Error('Action amount must be between $0.01 and $10,000.');
      error.status = 400;
      throw error;
    }
    const order = await paypalRequest('/v2/checkout/orders', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{ description, amount: { currency_code: 'USD', value: amount.toFixed(2) } }],
        application_context: {
          brand_name: 'PayPal Pulse',
          user_action: 'PAY_NOW',
          return_url: `${req.protocol}://${req.get('host')}/?payment=success`,
          cancel_url: `${req.protocol}://${req.get('host')}/?payment=cancelled`
        }
      })
    });

    res.status(201).json({
      success: true,
      orderId: order.id,
      approvalLink: order.links?.find((link) => link.rel === 'approve')?.href
    });

  } catch (error) {
    next(error);
  }
});

app.post('/api/paypal/orders/:orderId/capture', async (req, res, next) => {
  try {
    const orderId = encodeURIComponent(String(req.params.orderId || '').trim());
    if (!orderId) {
      const error = new Error('A PayPal order ID is required.');
      error.status = 400;
      throw error;
    }
    const order = await paypalRequest(`/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      body: '{}'
    });
    rememberCapturedOrder(order);
    const purchaseUnit = order.purchase_units?.[0];
    const requestId = purchaseUnit?.custom_id;
    const capturedAmount = Number(purchaseUnit?.payments?.captures?.[0]?.amount?.value || 0);
    const request = bridgeRequests.concat(bridgeDrafts).find((item) => item.id === requestId);
    if (request && order.status === 'COMPLETED' && capturedAmount > 0) {
      request.raised = Math.min(request.goal, Number((request.raised + capturedAmount).toFixed(2)));
      if (request.raised >= request.goal) request.status = 'Funded';
    }
    res.json({
      success: true,
      orderId: order.id,
      status: order.status,
      payer: order.payer?.name?.given_name || 'Sandbox buyer',
      request: request || null
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/paypal/orders/:orderId/sync', async (req, res, next) => {
  try {
    const orderId = encodeURIComponent(String(req.params.orderId || '').trim());
    if (!orderId) {
      const error = new Error('A PayPal order ID is required.');
      error.status = 400;
      throw error;
    }
    const order = await paypalRequest(`/v2/checkout/orders/${orderId}`, { method: 'GET' });
    if (order.status === 'COMPLETED') rememberCapturedOrder(order);
    res.json({ success: true, status: order.status, dashboard: buildDashboard('paypal', await fetchSandboxTransactions()) });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({ success: false, error: error.message || 'Unexpected server error.' });
});

app.listen(port, () => console.log(`PayPal Pulse is running at http://localhost:${port}`));
