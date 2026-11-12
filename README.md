# Bridge

## Judge quick start

Run these commands from the project directory:

```bash
npm install
cp .env.example .env
```

Edit `.env` and add a PayPal Sandbox **client ID** and **client secret** from a Sandbox Business app. Then install Ollama and its model:

```bash
ollama pull llama3.2:3b
PORT=5085 npm start
```

Open [http://localhost:5085](http://localhost:5085). Keep the terminal running while testing.

Verify the server before the demo:

```bash
curl http://localhost:5085/api/health
curl http://localhost:5085/api/requests
```

For the payment demo, use a PayPal Sandbox Personal buyer account when PayPal redirects you to approve a contribution. No real money is moved.

If Ollama is not running, start it separately with `ollama serve`. The board and PayPal contribution flow still load, but the AI request composer requires Ollama.

Bridge is an AI-assisted mutual-aid prototype for a common social problem: people can have an urgent, modest need but no clear, trusted way to explain it or receive small contributions from their community.

Bridge makes that process more understandable without pretending that software can decide who deserves help. A requester describes the situation in their own words. AI helps turn it into a concise, dignity-preserving draft and removes obvious personal details. The requester reviews the draft before publishing. Supporters can then see the goal, progress, and remaining need before contributing through PayPal.

## Why this is meaningful

Emergency needs are often small enough to solve—groceries before payday, a bus pass to reach an interview, or school supplies—but difficult to communicate quickly and safely. Existing fundraising experiences can make people overshare, bury the actual need in a long story, or leave supporters unsure how much is still needed.

Bridge focuses on clarity and agency:

- **Requesters keep control:** AI prepares a draft; a person reviews and publishes it.
- **Moderation is required:** newly submitted requests enter `Pending review` and cannot receive contributions until approved by a moderator.
- **Privacy comes first:** the AI prompt asks for sensitive details to be removed, and the server applies additional redaction for common addresses, phone numbers, and email addresses.
- **Abuse is rate-limited:** new goals are capped at $500, contributions at $25, and each connection can submit only one request per hour in this prototype.
- **Community reporting exists:** supporters can report a concern, which moves the request to `Under review` and disables contributions.
- **Supporters see the practical context:** category, goal, amount raised, amount remaining, and a short explanation.
- **AI is not an eligibility judge:** it does not rank people, approve requests, or make decisions about deservingness.
- **PayPal is part of the trust flow:** supporters use a familiar checkout, and the app receives a payment confirmation after capture.

This prototype uses fictional sample requests and PayPal Sandbox accounts. It demonstrates the interaction and payment flow without moving real money.

## Tools used and why

### PayPal Developer Platform

Bridge uses PayPal Orders v2 in the free Sandbox environment:

- Creates a contribution order for a specific community request.
- Sends the supporter to PayPal approval.
- Captures the approved order when PayPal returns to Bridge.
- Uses the request ID as PayPal order metadata so a contribution can be associated with its intended need.

PayPal is meaningful here because the project is not merely visualizing donations. It demonstrates the actual moment where a supporter commits money to a specific, transparent need.

### Ollama and `llama3.2:3b`

Ollama runs the AI model locally. Bridge uses it to:

- Turn an unstructured support description into a clear title and summary.
- Suggest a broad need category.
- Produce a privacy reminder for the requester.

The model is deliberately constrained by the prompt. It is a writing and privacy aid, not an automated social-benefit decision maker. Running locally also keeps the prototype inexpensive and avoids sending the request text to a hosted AI provider.

### Node.js and Express

The Express server provides the API, serves the web app, validates request and contribution data, calls Ollama, and keeps PayPal credentials on the server. Server-side validation is important because browser input cannot be trusted when calculating contribution amounts or selecting request IDs.

### Vanilla HTML, CSS, and JavaScript

The frontend is intentionally lightweight. It provides:

- The community request board.
- Category filters and funding progress.
- The AI-assisted request composer.
- The PayPal contribution drawer.
- A local supporter dashboard showing contribution history.

No frontend framework is required, keeping the project easy to run and easy to explain in a hackathon demo.

### Browser `localStorage`

Bridge uses `localStorage` only for the prototype supporter view. It remembers contributions on the current device so the user can see a simple history after returning from PayPal. This is not presented as production-grade identity or financial record storage.

## Run locally

1. Install Node.js 18+.
2. Copy `.env.example` to `.env`.
3. Add PayPal Sandbox client credentials from the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/).
4. Install Ollama and download the local model:

```bash
ollama pull llama3.2:3b
```

5. Start Bridge:

```bash
npm install
PORT=5085 npm start
```

Open <http://localhost:5085>.

### Try the requester flow

1. Scroll to **Ask for help**.
2. Enter a request such as: `I need groceries for my daughter until Friday.`
3. Add a goal amount.
4. Click **Make it clear**.
5. Review the private draft and click **Post this request**.

### Try the supporter flow

1. Choose an open request on the community board.
2. Click **Help with PayPal**.
3. Enter a contribution amount within the remaining need.
4. Continue to PayPal Sandbox.
5. Approve with the Sandbox Personal buyer.
6. Return to Bridge and view the contribution in **Your Bridge**.

## API

- `GET /api/health` reports PayPal and AI configuration.
- `GET /api/requests` returns the community request board.
- `POST /api/ai/polish-request` creates a privacy-conscious draft from plain-language text.
- `POST /api/requests` validates and publishes a reviewed request.
- `POST /api/paypal/contribution-order` validates a contribution and creates a PayPal order.
- `POST /api/requests/:requestId/report` records a concern and pauses the request.
- `POST /api/paypal/orders/:orderId/capture` captures an approved contribution.

## Hackathon sponsor tools

Bridge uses two optional sponsor tools:

- **Postman:** [`postman/Bridge.postman_collection.json`](./postman/Bridge.postman_collection.json) gives judges a ready-to-import collection for health checks, request listing, AI drafting, reporting, and contribution-cap validation. Set its `baseUrl` variable to the port where Bridge is running.
- **Render:** [`render.yaml`](./render.yaml) defines a Node web service, the Bridge start command, the `/api/health` health check, and the PayPal/Ollama environment variables for a straightforward deployment.


Render deployment note: Ollama must be reachable from the deployed service. For a hosted demo, set `OLLAMA_BASE_URL` to a reachable Ollama-compatible endpoint; the local `127.0.0.1` default is only suitable for local development.