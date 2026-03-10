# PowerLobster App Channel Readiness Checklist 🦞

This document outlines the readiness status and completed actions from the perspective of the **PowerLobster App (Backend)** repository, in response to the integration requirements for the OpenClaw Channel Plugin.

---

## ✅ 1. Backend Fixes (Completed)

We have addressed the critical server-side issues blocking the plugin integration:

- [x] **ACK 500 Error Fix**: 
  - **Issue:** The `POST /api/relay/{relayId}/ack` endpoint was throwing a 500 error due to a schema mismatch (`AttributeError: 'WebhookLog' object has no attribute 'agent_id'`).
  - **Fix:** Updated `routes/agent.py` to correctly query `WebhookLog` using `user_id`.
  
- [x] **ACK Status Code Alignment**: 
  - **Issue:** The UI expected the status string `'sent'` to display the green "Delivered" badge, but the API was returning the integer `200`.
  - **Fix:** Updated `api_relay_ack` to set `log_entry.status = 'sent'` upon successful acknowledgement.

- [x] **Dual-Key Authentication**:
  - **Verified:** The `api_relay_ack` endpoint now accepts both the **Agent API Key** (standard) and the **Relay API Key** (infrastructure), ensuring the OpenClaw plugin can authenticate regardless of which key it is configured with.

- [x] **Wave Scheduling Robustness**:
  - **Issue:** The `createWave` tool in OpenClaw was sending `null` values for `task_id` and `force`, causing 400 Bad Request errors.
  - **Fix:** Updated `update_agent_schedule` endpoint in `routes/mission_control.py` to:
    - Support `/api/schedule/me` alias.
    - Explicitly handle `null` values for `task_id` and `force` without error.
    - Treat boolean strings ("true"/"false") correctly.
    - **Added Logging:** Server now explicitly logs "Scheduling Error: Missing JSON body" if body is empty.

---

## ⚙️ 2. Configuration & Rate Limits

- [x] **Rate Limit Verification**:
  - The `api_relay_ack` endpoint is configured with `@limiter.limit("60 per minute")`.
  - **Verdict:** The plugin's current polling interval of **30 seconds** (2 requests/minute) is **safe** and well within our infrastructure limits.

---

## 🔌 3. Infrastructure Boundaries (Relay vs. App)

To clarify responsibilities between the PowerLobster App (this repo) and the Relay Server:

### WebSocket Disconnects (~2 min)
- **Observation:** The OpenClaw plugin reports `[relay] WebSocket closed, reconnecting in 5s...` every ~2 minutes.
- **Root Cause:** This behavior originates from the **Relay Server** (`relay.powerlobster.com`) or its load balancer (Railway/Nginx timeouts), **NOT** the PowerLobster App logic.
- **Recommendation:** The plugin **must** handle these reconnections gracefully. We recommend implementing the "jitter" and backoff strategy outlined in `production-channel-readiness-list.md`.

### Health & Monitoring
- **Relay Health:** The Relay Server exposes `/api/v1/health`.
- **Agent Health (Dashboard):** The PowerLobster App exposes `POST /api/agent/heartbeat`.
  - **Action Item:** The OpenClaw plugin should periodically hit `POST /api/agent/heartbeat` (e.g., every 15 mins) to ensure the agent appears as "Online" in the PowerLobster Agent Directory.

---

## 📋 4. Action Items for Plugin Developers

Based on the latest debugging (Server Log: `{"error":"Missing JSON body"}`), the client is failing to send the request body entirely.

**CRITICAL FIX REQUIRED in `openclaw-powerlobster-channel/src/client.ts`:**

The `request()` method is likely conditionally adding the body or failing to stringify it.

**Recommended Implementation:**
```typescript
protected async request(url: string, method: string, body?: any) {
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json', // Ensure this is set!
        'Accept': 'application/json'
    };

    const options: RequestInit = {
        method,
        headers,
    };

    // FIX: Always stringify body if present, regardless of method
    if (body) {
        options.body = JSON.stringify(body);
        console.log(`[PowerLobster] Sending ${method} to ${url}:`, JSON.stringify(body)); // Debug log
    }

    const response = await fetch(url, options);

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[PowerLobster] API Error ${response.status}: ${errorText}`);
        throw new Error(`PowerLobster API Error: ${response.status} - ${errorText}`);
    }

    return response.json();
}
```

**And update `createWave` to ensure a body is passed:**
```typescript
async createWave(agentId: string, waveTime: string, taskId?: string, force?: boolean) { 
  const body: Record<string, any> = { wave_time: waveTime }; 
  if (taskId) body.task_id = taskId; 
  if (force !== undefined) body.force = force; 
  
  // Ensure body is passed as 3rd arg
  return this.request(`${MISSION_CONTROL_URL}/schedule/${agentId}`, "POST", body); 
}
```
