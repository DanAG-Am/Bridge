# Bridge Demo Video Script

## Video goal

Show one complete story:

> A person has a small urgent need, Bridge helps them explain it without oversharing, and another person can make a transparent PayPal contribution.

Target length: **90–120 seconds**.

## Before recording

- Start Ollama with `llama3.2:3b` available.
- Start Bridge on a known port, for example:

  ```bash
  PORT=5085 npm start
  ```

- Open `http://localhost:5085`.
- Have a PayPal Sandbox Business seller account configured in `.env`.
- Have a PayPal Sandbox Personal buyer account ready for the contribution approval.
- Use a clean browser profile or clear `localStorage` so the supporter history starts empty.

## 0:00–0:15 — Introduce the problem

**On screen:** Bridge landing page and the community board.

**Voiceover:**

“Many urgent needs are not huge. They might be groceries before payday, a bus pass to reach a job interview, or school supplies. The hard part is explaining the need clearly and safely, then giving another person a trustworthy way to help.”

“Bridge is a mutual-aid prototype that connects those two moments.”

## 0:15–0:28 — Show transparent requests

**Action:** Point to the three request cards.

Highlight:

- Category
- Short explanation
- Goal amount
- Amount raised
- Amount remaining
- Open or funded status

**Voiceover:**

“The community board keeps each request practical. Supporters can see what the money is for, how much is needed, and what has already been raised. The sample requests are fictional and use PayPal Sandbox for this demonstration.”

## 0:28–0:48 — Create a request with AI

**Action:** Scroll to **Ask for help** and enter:

> I need groceries for my daughter until Friday. I live at 123 Main Street and my phone number is 555-123-4567.

Enter goal: `45`.

Click **Make it clear**.

**Voiceover:**

“A requester can write naturally, including details they may not realize are too sensitive to publish. Bridge sends the description to a local Ollama model with a narrow instruction: make the request clear, remove identifying details, and never decide whether the person deserves help.”

**On screen:** Show the private draft. Point out that the address and phone number are removed.

**Voiceover:**

“The result is a draft, not an automatic post. The requester reviews it before anything becomes visible.”

## 0:48–1:00 — Publish with human control

**Action:** Click **Post this request**.

**Voiceover:**

“Only after the requester approves the draft does Bridge publish it to the board. The AI helps with language and privacy; the person remains in control.”

## 1:00–1:18 — Contribute through PayPal

**Action:** Choose an open request and click **Help with PayPal**. Enter a contribution such as `5`.

**Voiceover:**

“Now I switch perspectives. As a supporter, I can see the remaining need and choose an amount within the request’s limit. Bridge validates the request and contribution on the server, then creates a PayPal Orders v2 checkout.”

**Action:** Click **Continue with PayPal**. Approve using the Sandbox Personal buyer.

**Voiceover:**

“PayPal is not decorative here. It is the actual contribution step: the supporter leaves Bridge, approves a payment, and returns with a capture result.”

## 1:18–1:32 — Show the supporter dashboard

**Action:** Return to Bridge and scroll to **Your Bridge**.

**Voiceover:**

“After capture, Bridge records a simple supporter confirmation on this device. The dashboard shows what was supported, how much was contributed, and when. A production version would replace this local prototype history with authenticated accounts and durable records.”

## 1:32–1:45 — Explain responsible AI

**On screen:** Return to the request composer or community board.

**Voiceover:**

“The important boundary is intentional: Bridge does not score people, approve aid, or decide who is worthy. AI improves clarity and privacy. People decide whether to ask, whether to post, and whether to help.”

## Optional 1:45–1:58 — Show the safety layer

**Action:** Point to the safety notes in the request form, then click **Report concern** on a request.

**Voiceover:**

“Bridge also assumes that an open submission cannot be trusted automatically. New requests are pending review, goals are capped at $500, contributions are capped at $25, and supporters can report a concern. A report pauses the request until a human reviews it.”

“These controls are deliberately conservative for a prototype. A production service would add verified accounts, moderator authentication, evidence workflows, payout holds, disputes, and appeals.”

## Closing line

**Voiceover:**

“Bridge turns a vague moment of need into a clear request, a transparent choice, and a real path for community support.”

## Technologies to mention in the final frame

Display:

- **PayPal Developer Platform — Orders v2 and Sandbox checkout**
- **Ollama — local `llama3.2:3b` model**
- **Node.js + Express — validation and server-side payment orchestration**
- **Vanilla HTML, CSS, and JavaScript — customer experience**
- **Safety controls — moderation state, rate limits, caps, duplicate checks, and reporting**
- **Postman — judge-ready API collection**
- **Render — deployment configuration and health check**

## Sponsor-tool disclosure

Be explicit in the video: Bridge uses **Postman** and **Render** from the optional sponsor list. Postman provides the imported API collection used to verify Bridge’s health, AI drafting, reporting, and safety validation endpoints. Render provides the deployment configuration and health check for the Node service.

Bridge does not use AG Grid, APIMatic, Astropods, Bryntum, Channel3, Elastic, KERNEL, or Zapier.

## Recording notes

- Keep the requester’s draft and supporter contribution as two distinct perspectives.
- Pause on the redacted draft long enough for the privacy benefit to be visible.
- Show the PayPal approval page briefly, but do not expose credentials.
- Do not claim that the prototype verifies a person’s identity or guarantees aid delivery.
- Use the phrase **“PayPal Sandbox”** in the demo narration so viewers understand that no real money moves.
