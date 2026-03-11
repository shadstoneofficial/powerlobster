# Config Options: Polling (Default) vs Direct Webhook

## Overview
We need to allow users to choose between **Polling** (current default) and **Direct Webhook** for event delivery.
This provides flexibility:
- **Polling**: Easiest setup (no public IP/tunnel needed), robust for firewalls.
- **Webhook**: Lower latency, less resource usage (no constant polling), standard for production if public endpoint available.

## Current State
- **Polling**: Implemented in `src/channel.ts` using `PowerLobsterPoller`.
- **Webhook**: User claims it is registered at `/powerlobster/webhook` in `index.ts`, but code review shows **NO** explicit route registration in `index.ts`.
  - *Note:* It is possible OpenClaw automatically routes `/webhooks/{channelId}` to the channel if the channel plugin implements a specific interface, or we need to add `api.registerWebhook` or similar.
  - *Assumption:* We likely need to add the route handler explicitly in `index.ts` or `src/channel.ts`.

## Proposed Configuration Schema
Update `src/types.ts` `PowerLobsterConfig`:

```typescript
export interface PowerLobsterConfig {
  apiKey: string;
  agentId: string;
  relayId?: string;      // Required if deliveryMode='poll'
  relayApiKey?: string;  // Required if deliveryMode='poll'
  
  // New Options
  deliveryMode?: 'poll' | 'webhook' | 'both'; // Default: 'poll'
  pollInterval?: number; // Default: 30000 (30s)
  webhookSecret?: string; // Optional: to verify signature if PL supports it
}
```

## Implementation Plan

### 1. Update Types
- Modify `PowerLobsterConfig` in `src/types.ts`.

### 2. Implement Webhook Handler
Since `index.ts` currently lacks the handler, we need to add it.
We need to know how OpenClaw plugins register HTTP routes.
*Hypothesis:* `api.registerRoute('post', '/powerlobster/webhook', handler)` or similar.
*Action:* We will add a `WebhookHandler` class or function in `src/webhook.ts` (new file) that parses the body and passes it to `PowerLobsterChannel.handleEvent`.

### 3. Update Channel Logic (`src/channel.ts`)
Modify `startAccount`:

```typescript
const mode = config.deliveryMode || 'poll';

if (mode === 'poll' || mode === 'both') {
    // Start Poller (Existing Logic)
    // ...
}

if (mode === 'webhook' || mode === 'both') {
    // Webhook logic is usually passive (listening).
    // We just need to ensure the channel is "alive" and ready to receive events from the global webhook handler.
    // The webhook handler needs access to the `activeClients` or `channel` instance to route events.
}
```

### 4. Webhook Handler Logic
The webhook handler needs to:
1. Receive POST request.
2. Extract `accountId` (or find it based on the payload if PL sends it, otherwise webhooks might be global per instance?).
   - *Challenge:* If multiple agents run on one OpenClaw instance, how does the webhook know which `accountId` to target?
   - *Solution:* PowerLobster webhooks likely include `agent_id` or `relay_id`. We can map this to our configured accounts.
3. Call `channel.handleEvent(ctx, event)`.

## Questions / Verification
- **Webhook Route:** Does OpenClaw provide a standard `api.registerWebhook`? If not, we use `api.router.post(...)`.
- **Multi-tenancy:** In webhook mode, we need a map of `agentId -> accountId` to route incoming webhooks to the correct channel context.

## Summary of Tasks
1.  [ ] Update `src/types.ts`
2.  [ ] Create `src/webhook.ts` (Webhook Handler)
3.  [ ] Update `index.ts` to register the webhook route.
4.  [ ] Update `src/channel.ts` `startAccount` to respect `deliveryMode`.
