# Integration Plan: PowerLobster Relay "Push Mode" 🦞

This document outlines the implementation plan for the **OpenClaw Channel Plugin** (`openclaw-powerlobster-channel`) to support the new "Push Mode" feature from the PowerLobster Relay.

## Overview

We are adding a new delivery mode where the Relay Service pushes events to us via a webhook, instead of us polling for them. This requires:
1.  Exposing a public webhook endpoint in the plugin.
2.  Registering this endpoint with the Relay on startup.
3.  Handling incoming push events.

## Configuration Changes (`src/types.ts`)

We need to update the `PowerLobsterConfig` interface to support the new options.

```typescript
export interface PowerLobsterConfig {
  apiKey: string;
  agentId: string;
  relayId?: string;      // Required for registration
  relayApiKey?: string;  // Required for registration
  
  // New Options
  deliveryMode?: 'poll' | 'push'; // Default: 'poll'
  webhookUrl?: string;            // Required if deliveryMode='push'
  webhookSecret?: string;         // Optional: for signature verification
}
```

## Implementation Steps

### 1. Webhook Handler (`src/webhook.ts`)
Create a new file to handle incoming HTTP POST requests.

**Responsibilities:**
- Parse the JSON body.
- (Optional) Verify `X-PowerLobster-Signature` if `webhookSecret` is configured.
- Extract the event payload.
- Dispatch the event to `PowerLobsterChannel.handleEvent`.
- Return `200 OK` to acknowledge receipt (or `500` to trigger Relay retry).

### 2. Route Registration (`index.ts`)
We need to register the webhook route with OpenClaw's API.

*Hypothesis:* OpenClaw likely provides `api.router` or `api.registerRoute`. We will use `/webhooks/powerlobster` or similar.

```typescript
// Pseudo-code for index.ts
api.registerRoute('post', '/webhooks/powerlobster', async (req, res) => {
  try {
    await webhookHandler.handle(req);
    res.status(200).send({ status: 'received' });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});
```

### 3. Startup Registration (`src/channel.ts`)
Modify `startAccount` to handle the 'push' mode.

**Logic:**
```typescript
if (config.deliveryMode === 'push') {
    if (!config.webhookUrl) {
        throw new Error('webhookUrl is required for push mode');
    }

    console.log(`[PowerLobster] Registering for PUSH mode at ${config.webhookUrl}`);
    
    // Call Relay API to register
    await client.configureRelay({
        mode: 'push',
        url: config.webhookUrl,
        secret: config.webhookSecret
    });
    
    // Do NOT start the poller
    console.log('[PowerLobster] Push mode active. Listening for events.');
} else {
    // Default: Start Poller (Existing logic)
    poller.start();
}
```

### 4. Client Update (`src/client.ts`)
Add the `configureRelay` method to `PowerLobsterClient`.

```typescript
async configureRelay(params: { mode: 'poll' | 'push', url?: string, secret?: string }) {
    // Call POST /api/v1/agent/configure
    // Auth: Relay API Key (passed in constructor or config)
}
```

## Verification Plan

1.  **Unit Test:** Verify `WebhookHandler` parses events correctly.
2.  **Integration Test:**
    - Configure plugin with `deliveryMode: 'push'` and a mock `webhookUrl`.
    - Start OpenClaw.
    - Verify it calls `POST /api/v1/agent/configure` on the Relay.
    - Verify it does *not* start polling.
    - Send a mock POST to the webhook endpoint and verify the agent "sees" the message.

## Dependencies
- **Relay Service Update:** This feature depends on the Relay Team deploying the `POST /api/v1/agent/configure` endpoint.
- **OpenClaw Router:** We assume standard Express-like routing is available.

---
*Ready for approval to begin coding.* 🦞
