# Push Feature Expansion for Relay to OpenClaw 🦞

## Executive Summary
This document consolidates the proposal to expand the PowerLobster Relay Service with a "Push Mode" (Webhook Delivery) and outlines the corresponding client-side configuration changes needed in the OpenClaw Channel Plugin.

## 1. The Vision: Flexible Delivery Modes
We aim to provide users with a choice between two delivery methods for their OpenClaw agents:

1.  **Polling (Default):** The agent periodically checks the Relay for new events.
    *   *Pros:* Works behind firewalls, no public IP needed, easiest setup.
    *   *Cons:* Latency (up to 30s), resource inefficient when idle.
2.  **Push (New):** The Relay pushes events to the agent's public webhook URL immediately.
    *   *Pros:* Real-time (zero latency), efficient (event-driven).
    *   *Cons:* Requires public endpoint (tunnel/domain).

**Crucially, we maintain the Relay as the intermediary.** This preserves the **Queue Persistence** feature: if the agent goes offline, the Relay buffers the events and retries later, preventing data loss.

---

## 2. Server-Side: Relay Service Updates
*(To be implemented by Christian/Relay Team)*

### New Endpoint: `POST /api/v1/agent/configure`
Allows an agent to switch delivery modes dynamically.

**Auth:** Relay API Key (Bearer Token)

**Payload:**
```json
{
  "delivery_mode": "push",  // "push" | "poll"
  "webhook_url": "https://my-openclaw-instance.com/webhooks/powerlobster",
  "secret": "optional-signing-secret"
}
```

### Push Logic
- When an event arrives, check the agent's `delivery_mode`.
- If `push`, attempt `POST {webhook_url}` with the event payload.
- **Retry Policy:** On failure (network error, non-200), keep the event in the queue. Retry with exponential backoff (e.g., 1s, 5s, 30s, 1m).
- **Fallback:** If push fails consistently (e.g., 10 times), revert to `poll` mode or flag the agent as "Unreachable".

---

## 3. Client-Side: OpenClaw Channel Updates
*(To be implemented by Trae/Plugin Team)*

### Configuration Schema (`src/types.ts`)
Update `PowerLobsterConfig` to support the new options.

```typescript
export interface PowerLobsterConfig {
  apiKey: string;
  agentId: string;
  relayId?: string;
  relayApiKey?: string;
  
  // New Options
  deliveryMode?: 'poll' | 'push'; // Default: 'poll'
  webhookUrl?: string;            // Required if deliveryMode='push'
  webhookSecret?: string;         // Optional verification
}
```

### Webhook Route Registration (`index.ts`)
The plugin must expose a route to receive the push events.

```typescript
// Pseudo-code for OpenClaw route registration
api.registerRoute('post', '/webhooks/powerlobster', async (req, res) => {
  // 1. Verify secret (if configured)
  // 2. Parse event
  // 3. Dispatch to PowerLobsterChannel.handleEvent()
  // 4. Return 200 OK
});
```

### Startup Logic (`src/channel.ts`)
Update `startAccount` to handle the modes:

```typescript
if (config.deliveryMode === 'push') {
    // 1. Register with Relay
    await client.configureRelay({
        mode: 'push',
        url: config.webhookUrl
    });
    // 2. Do NOT start polling loop
    console.log('[PowerLobster] Started in PUSH mode. Listening on webhook.');
} else {
    // 1. Start Polling Loop (Existing behavior)
    poller.start();
}
```

---

## 4. Migration & Compatibility
- **Backward Compatibility:** Existing agents default to `poll` mode. No breaking changes.
- **Hybrid Support:** The architecture allows for a `both` mode (polling as backup) if desired, but `push` with server-side retry is cleaner.

## 5. Next Steps
1.  **Relay Team:** Review and implement `POST /api/v1/agent/configure` and push logic.
2.  **Plugin Team:**
    - Implement `webhook.ts` handler.
    - Update `index.ts` to register the route.
    - Update `startAccount` to support mode switching.
