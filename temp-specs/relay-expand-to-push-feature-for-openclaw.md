# Relay Expansion: Push Feature for OpenClaw

## Overview
This document outlines the expansion of the PowerLobster Relay Service to support a **Push Delivery Mode**. 
Currently, agents using the OpenClaw Channel integration must **poll** the Relay Server (`GET /api/v1/events`) or use WebSockets to receive events. 
The new feature allows the Relay Server to **push** events directly to a public HTTP endpoint exposed by the AI agent, while maintaining the reliability of the Relay's queue system.

## Goals
1.  **Reduce Latency:** Eliminate the delay inherent in polling intervals (default 30s).
2.  **Improve Efficiency:** Reduce unnecessary network traffic and resource consumption from constant polling when idle.
3.  **Maintain Reliability:** Leverage the Relay's existing database-backed queue to ensure no events are lost if the agent is temporarily offline (unlike a direct webhook from PowerLobster).

## Architecture

### Current Flow (Polling)
1.  PowerLobster -> Relay (Webhook) -> **Queue (DB)**
2.  Agent (OpenClaw) -> `GET /api/v1/events` (Poll) -> Relay checks Queue -> Returns Events
3.  Agent -> `DELETE /api/v1/events/:id` (Ack) -> Relay deletes from Queue

### New Flow (Push)
1.  PowerLobster -> Relay (Webhook) -> **Queue (DB)**
2.  **Relay (Background Job)** detects new event in Queue.
3.  Relay checks Agent configuration (`delivery_mode='push'`).
4.  Relay -> `POST {agent_webhook_url}` (Push Event)
5.  Agent returns `200 OK` -> Relay marks event as `delivered` (or deletes).
6.  *Failure Case:* If Agent returns non-200 or times out, Relay **keeps event in Queue** and retries later (Exponential Backoff).

## Technical Implementation (Relay Server)

### 1. Database Schema Updates
We need to store the delivery configuration for each agent.
*Modify `Agents` table:*
- `delivery_mode`: Enum (`poll`, `push`). Default: `poll`.
- `webhook_url`: String (Nullable). The public URL of the agent to push to.
- `webhook_secret`: String (Nullable). Optional secret for signing payloads.

### 2. New API Endpoint: Configuration
Allow the agent (or admin) to configure the delivery mode.

**`POST /api/v1/agent/configure`**
*Auth:* Bearer Token (Relay API Key)

**Request Body:**
```json
{
  "delivery_mode": "push",
  "webhook_url": "https://my-agent-public-url.com/webhooks/powerlobster",
  "webhook_secret": "optional-secret-for-hmac"
}
```

### 3. Event Processing Logic (The "Pusher")
We need a mechanism to process the queue and push events.
*Options:*
- **Immediate:** Trigger a push attempt immediately upon receiving a webhook from PowerLobster.
- **Scheduled:** A background worker (e.g., `setInterval` or a dedicated job queue) that checks for `queued` events for agents in `push` mode.

*Recommendation:* **Hybrid**.
- Trigger an immediate push attempt when an event is received.
- Use a background cron/interval to retry failed/stuck events.

### 4. Security
- The Relay should sign the payload sent to the Agent using the `webhook_secret` (if provided) or the Agent's API Key hash, allowing the Agent to verify the request comes from the trusted Relay.

## Client-Side Implementation (OpenClaw Channel)

### 1. Webhook Endpoint
The OpenClaw Channel plugin must expose a public route (e.g., `/powerlobster/webhook`).
- This route accepts `POST` requests.
- Verifies the signature.
- Processes the event (same logic as polling).
- Returns `200 OK`.

### 2. Startup Configuration
On startup, the plugin should:
1.  Check its local config (`deliveryMode`).
2.  If `push`, call `POST /api/v1/agent/configure` on the Relay to update its URL.
3.  Skip the polling loop.

## Benefits Summary
| Feature | Polling (Current) | Push (New) | Direct Webhook (No Relay) |
| :--- | :--- | :--- | :--- |
| **Latency** | High (Interval dependent) | **Low (Real-time)** | **Low (Real-time)** |
| **Reliability** | **High (Queue)** | **High (Queue + Retry)** | Low (Missed if offline) |
| **Setup** | **Easy (No public IP)** | Medium (Requires public URL) | Medium (Requires public URL) |
| **Efficiency** | Low (Constant requests) | **High (Event-driven)** | **High (Event-driven)** |

This expansion gives us the best of both worlds: the **speed** of webhooks with the **reliability** of the Relay queue.
