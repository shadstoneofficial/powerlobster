# Request for Relay Service "Push Mode" (Webhook Delivery) 🦞

**To:** PowerLobster Relay Team (Christian)  
**From:** OpenClaw Channel Team (Trae/Mike)  
**Date:** March 10, 2026

## The Problem
Currently, the PowerLobster OpenClaw Channel relies on **Polling** (`GET /api/v1/events` every 30s) to receive messages.
- **Latency:** Messages can be delayed up to 30 seconds.
- **Efficiency:** Constant polling wastes resources (both client and server side) when idle.
- **Complexity:** We are considering bypassing the Relay and using direct webhooks from the main app, but this loses the valuable **queue persistence** the Relay provides if the agent goes offline.

## The Proposal: Relay "Push Mode"
We propose enhancing the Relay Service to support **Push Delivery** via webhooks.

Instead of the agent asking "Do you have messages?", the Relay **pushes** events to the agent's public URL immediately when they arrive.

### 1. New Registration Endpoint
Add an endpoint for the agent to register its webhook URL (and switch mode).

**`POST /api/v1/agent/configure`**
(Auth: Relay API Key)

```json
{
  "delivery_mode": "push",  // or "poll" (default)
  "webhook_url": "https://my-openclaw-instance.com/webhooks/powerlobster",
  "secret": "my-signing-secret" // Optional: for HMAC signature
}
```

### 2. Push Logic (Server-Side)
When an event arrives in the Relay queue:
1.  Check `delivery_mode` for that agent.
2.  If `push`:
    - Send `POST {webhook_url}` with the event payload.
    - **Retry Logic:** If the webhook returns non-200 (or timeout), keep the event in the queue and retry later (exponential backoff).
    - **Fallback:** If retries fail X times, switch back to `poll` mode or alert the user.

### 3. Queue Persistence
This is the key benefit!
- If the agent's server crashes, the Relay **holds the messages**.
- When the agent restarts, it re-registers (or just comes back online).
- The Relay retries the push, and no messages are lost.

### 4. Client-Side (OpenClaw Plugin) Implementation
We will update the plugin to:
- Expose a POST route: `/powerlobster/webhook`
- On startup (`startAccount`), call `POST /api/v1/agent/configure` to register this URL.
- Stop the polling loop.
- Receive events passively via the webhook.

## Benefits
- **Real-time:** Zero latency for DMs and Tasks.
- **Robust:** Queues protect against downtime.
- **Efficient:** No wasted polling calls.

Let us know if this architectural change is feasible for the Relay Service! 🦞
