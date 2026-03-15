# PowerLobster Plugin Update Specification (Corrected)

This document details the recent changes made to the OpenClaw PowerLobster Channel Plugin to support Relay Sync, Execution Reporting, and Metadata Preservation.

**UPDATE (Mar 15):**
1. Fixed a critical bug where `ctx.sendEvent` (non-existent) was used. Reverted to `dispatchReplyWithBufferedBlockDispatcher` with metadata support.
2. Fixed `src/webhook.ts` to correctly preserve `_meta` when parsing payloads.

## 1. Feature: Relay Configuration Sync & Caching

**Objective:** On startup, the plugin fetches the latest configuration from the Relay API and caches it locally to ensure resilience.

### File: [src/channel.ts](src/channel.ts)

**Location:** Inside `startAccount` method (approx line 153).

```typescript
// --- CONFIG SYNC LOGIC ---
let effectiveConfig = { ...config }; // Start with local config
let syncSource = 'local';

if (config.relayId && config.relayApiKey) {
    try {
        console.log(`[PowerLobster] Syncing config from Relay for ${config.relayId}...`);
        const relayConfig = await client.getRelayConfig();
        
        if (relayConfig) {
            console.log(`[PowerLobster] Config synced from relay (v${relayConfig.config_version})`);
            syncSource = 'relay';
            
            // Cache logic
            try {
                const cacheDir = path.join(os.homedir(), '.openclaw', 'cache');
                await fs.mkdir(cacheDir, { recursive: true });
                const cachePath = path.join(cacheDir, 'relay-config.json');
                await fs.writeFile(cachePath, JSON.stringify(relayConfig, null, 2));
            } catch (cacheErr) {
                console.warn('[PowerLobster] Failed to write config cache:', cacheErr);
            }

            // Apply relay overrides
            if (relayConfig.delivery_mode) {
                effectiveConfig.deliveryMode = relayConfig.delivery_mode;
            }
            if (relayConfig.webhook_url) {
                effectiveConfig.webhookUrl = relayConfig.webhook_url;
            }
        }
    } catch (err) {
        console.warn(`[PowerLobster] Failed to sync relay config (using local/cache):`, err);
        // Fallback to cache
        try {
            const cachePath = path.join(os.homedir(), '.openclaw', 'cache', 'relay-config.json');
            const cachedData = await fs.readFile(cachePath, 'utf-8');
            const cachedConfig = JSON.parse(cachedData);
            
            if (cachedConfig.relay_id === config.relayId) { // Verify it matches this agent
                console.log(`[PowerLobster] Loaded config from cache (v${cachedConfig.config_version})`);
                syncSource = 'cache';
                if (cachedConfig.delivery_mode) effectiveConfig.deliveryMode = cachedConfig.delivery_mode;
                if (cachedConfig.webhook_url) effectiveConfig.webhookUrl = cachedConfig.webhook_url;
            }
        } catch (readErr) {
            console.log('[PowerLobster] No cached config found, using local settings.');
        }
    }
} else {
    console.log('[PowerLobster] No relay_id configured, skipping config sync');
}
// --- END CONFIG SYNC ---
```

### File: [src/client.ts](src/client.ts)

**Location:** `PowerLobsterClient` class.

```typescript
async getRelayConfig() {
    if (!this.config.relayId || !this.config.relayApiKey) {
        // Can't sync without credentials
        return null;
    }

    // Call GET /api/v1/agent/:relay_id/config
    // 5s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
        const response = await fetch(
            `${RELAY_BASE_URL}/agent/${this.config.relayId}/config`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.relayApiKey}`
                },
                signal: controller.signal
            }
        );
        
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Failed to fetch relay config: ${response.status}`);
        }

        return await response.json();
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}
```

---

## 2. Feature: Execution Result Reporting

**Objective:** Report the success or failure of event processing back to the Relay so it can update its dashboard.

### File: [src/client.ts](src/client.ts)

**Location:** `PowerLobsterClient` class.

```typescript
async reportEventResult(eventId: string, result: { status: 'success' | 'failed'; error_reason?: string | null }) {
    // Call Relay API to report execution result
    if (!this.config.relayId || !this.config.relayApiKey) {
        console.warn('[PowerLobster] Cannot report event result: missing relay credentials');
        return;
    }

    return this.request(
        `${RELAY_BASE_URL}/events/${eventId}/result`,
        'POST',
        {
            ...result,
            executed_at: new Date().toISOString()
        },
        true // useRelayAuth
    ).catch(err => {
        // Don't crash if reporting fails, just log it
        console.error(`[PowerLobster] Failed to report event result for ${eventId}:`, err);
    });
}
```

### File: [src/channel.ts](src/channel.ts)

**Location:** `handleEvent` method.

1.  **Report Success:**
    ```typescript
    // Report Success to Relay
    if (eventId) {
        const client = this.clients.get(accountId);
        if (client) {
            await client.reportEventResult(eventId, { status: 'success' });
        }
    }
    ```

2.  **Report Failure:**
    ```typescript
    } catch (err: any) {
        console.error(`[PowerLobster] Failed to handle event ${eventId}:`, err);
        
        // Report Failure to Relay
        if (eventId) {
            const client = this.clients.get(accountId);
            if (client) {
                // Detect Error Reason
                let reason = 'error';
                const msg = err.message?.toLowerCase() || '';
                
                if (msg.includes('rate limit') || msg.includes('429') || msg.includes('quota')) {
                    reason = 'rate_limit';
                } else if (msg.includes('timeout') || msg.includes('etimedout')) {
                    reason = 'timeout';
                } else if (msg.includes('network') || msg.includes('connection')) {
                    reason = 'offline';
                }
                
                await client.reportEventResult(eventId, { 
                    status: 'failed', 
                    error_reason: reason 
                });
            }
        }
        // Rethrow for logs/internal handlers
        throw err;
    }
    ```

---

## 3. Feature: Metadata Preservation (Corrected)

**Objective:** Pass the `_meta` field from incoming Relay events into the OpenClaw event payload via `MsgContext`.

### File: [src/types.ts](src/types.ts)

**Location:** `MsgContext` interface.

```typescript
export interface MsgContext {
  SessionKey: string;
  Type: string;
  Body: string;
  From: string;
  Channel: string;
  Platform: string;
  Metadata?: any; // Added Metadata support
}
```

### File: [src/channel.ts](src/channel.ts)

**Location:** `handleEvent` method.

1.  **Extract Metadata:**
    ```typescript
    const eventMeta = event._meta || {}; // Extract metadata
    ```

2.  **Pass to MsgContext (inside `handleEvent`):**
    ```typescript
    // ... inside if (agentId) block ...
    const msgContext: MsgContext = {
        SessionKey: `powerlobster:dm:${peerId}`, 
        Type: "message",
        Body: content,
        From: peerId,
        Channel: this.id,
        Platform: "powerlobster",
        Metadata: {
            delivery_method: eventMeta.delivery_method || 'unknown',
            ...eventMeta
        }
    };
    ```

---

## 4. Feature: Fix Webhook Payload Extraction

**Objective:** Ensure `_meta` is preserved when parsing webhook payloads in `src/webhook.ts`.

### File: [src/webhook.ts](src/webhook.ts)

**Location:** `handle` method.

```typescript
// Normalize event if needed, similar to poller
// Relay push payload structure matches the poller event structure: { payload: {...}, id: "..." }
// We need to extract the inner payload and preserve metadata.
const event = {
    ...(body.payload || body),
    _meta: body._meta || {}
};
```

---

## 5. Feature: Fix Webhook Handler Fallback

**Objective:** Handle cases where webhook handlers aren't fully registered but events are pushed.

### File: [src/channel.ts](src/channel.ts)

**Location:** `handleWebhook` method.

```typescript
// Fallback: If no webhook handlers are explicitly registered (e.g., config sync failed or push mode wasn't strictly enforced in local config but the relay pushed anyway), we should still try to handle it if we have at least one client/account running.
if (this.webhookHandlers.size === 0 && this.clients.size > 0) {
    console.warn('[PowerLobster] Webhook received but no explicit webhook handlers registered. Attempting to route to first active account.');
    
    // Find the first account ID
    const accountId = this.clients.keys().next().value;
    
    if (accountId) {
        const ctx = this.activeContexts.get(accountId);
        if (!ctx) {
            console.error('[PowerLobster] Cannot process fallback webhook without gateway context.');
            throw new Error('No webhook handler found and unable to fallback (missing context)');
        }
        
        // Create an ad-hoc handler just for this request
        const handler = new PowerLobsterWebhookHandler(async (event) => {
            await this.handleEvent(ctx, event);
        });
        
        return handler.handle(req);
    }
}
```
