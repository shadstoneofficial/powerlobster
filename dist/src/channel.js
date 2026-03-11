"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.powerLobsterChannel = void 0;
const client_1 = require("./client");
const poller_1 = require("./poller");
const tools_1 = require("./tools"); // Import activeClients
const webhook_1 = require("./webhook"); // Import webhook handler
const CHANNEL_ID = 'powerlobster';
class PowerLobsterChannel {
    constructor() {
        this.id = CHANNEL_ID;
        this.meta = {
            id: 'powerlobster',
            name: 'PowerLobster',
            version: '1.0.0',
            label: 'PowerLobster',
            selectionLabel: 'PowerLobster (Agent Network)',
            docsPath: '/channels/powerlobster',
            blurb: 'Agent social network integration.',
            aliases: ['pl'],
            description: 'PowerLobster Channel for OpenClaw',
            icon: '🦞',
        };
        this.capabilities = {
            text: true,
        };
        this.clients = new Map();
        this.pollers = new Map();
        this.webhookHandlers = new Map();
        this.runningPromises = new Map();
        this.config = {
            listAccountIds: (config) => {
                // Check for accounts in channels.powerlobster.instances
                const instances = config.channels?.powerlobster?.instances ?? [];
                if (Array.isArray(instances) && instances.length > 0) {
                    return instances.map((inst) => inst.id);
                }
                // Fallback: Check for legacy single account or if we should just return 'default'
                // If we have legacy env vars, we return 'default'
                if (process.env.POWERLOBSTER_API_KEY) {
                    return ['default'];
                }
                return [];
            },
            resolveAccount: (config, accountId = 'default') => {
                // 1. Try to find in instances list
                const instances = config.channels?.powerlobster?.instances ?? [];
                const instanceConfig = instances.find((inst) => inst.id === accountId);
                if (instanceConfig) {
                    return {
                        id: accountId,
                        config: {
                            apiKey: instanceConfig.config.apiKey,
                            agentId: instanceConfig.config.agentId || 'main',
                            relayId: instanceConfig.config.relayId,
                            relayApiKey: instanceConfig.config.relayApiKey,
                        }
                    };
                }
                // 2. Legacy support: Check environment variables if not found in config
                // Only applicable if accountId is 'default'
                if (accountId === 'default') {
                    const apiKey = process.env.POWERLOBSTER_API_KEY;
                    const agentId = process.env.OPENCLAW_AGENT_ID || 'main';
                    if (apiKey) {
                        return {
                            id: 'default',
                            config: {
                                apiKey,
                                agentId,
                                relayId: process.env.POWERLOBSTER_RELAY_ID,
                                relayApiKey: process.env.POWERLOBSTER_RELAY_API_KEY,
                            },
                        };
                    }
                }
                throw new Error(`PowerLobster account '${accountId}' not configured.`);
            },
        };
        this.gateway = {
            startAccount: async (ctx) => {
                const { account } = ctx;
                const config = account.config;
                const accountId = account.id;
                console.log(`[PowerLobster] Starting account ${accountId}`);
                const client = new client_1.PowerLobsterClient(config);
                this.clients.set(accountId, client);
                tools_1.activeClients.set(accountId, client); // Register client for tools
                if (config.deliveryMode === 'push') {
                    if (!config.webhookUrl) {
                        throw new Error('webhookUrl is required for push mode');
                    }
                    console.log(`[PowerLobster] Registering for PUSH mode at ${config.webhookUrl}`);
                    try {
                        // Call Relay API to register
                        await client.configureRelay({
                            mode: 'push',
                            url: config.webhookUrl,
                            secret: config.webhookSecret
                        });
                        // Set up the webhook handler logic (passive listening)
                        const webhookHandler = new webhook_1.PowerLobsterWebhookHandler(async (event) => {
                            // Re-use existing handleEvent logic
                            // Note: 'wrapper' unpacking logic from poller is specific to polling.
                            // Relay push payload likely matches the event structure directly or wrapped.
                            // If it matches poller wrapper: { payload: event, id: string }
                            // Let's assume for now it pushes the EVENT object directly or wrapper.
                            // Based on poller code: poller emits { payload: event, id: string }
                            // The webhook handler in src/webhook.ts expects to receive the BODY.
                            // If Relay pushes the same structure as it stores:
                            // Let's wrap it to match handleEvent expectation if needed, or modify handleEvent.
                            // handleEvent expects (ctx, event).
                            // We need to ACK if successful?
                            // Relay push expects 200 OK.
                            // The webhook handler calls this.eventHandler(event)
                            // We need to normalize the event structure here.
                            // If Relay pushes { type: ..., payload: ... }, we pass that.
                            await this.handleEvent(ctx, event);
                        }, config.webhookSecret);
                        this.webhookHandlers.set(accountId, webhookHandler);
                        console.log('[PowerLobster] Push mode active. Listening for events.');
                    }
                    catch (err) {
                        console.error('[PowerLobster] Failed to configure push mode:', err);
                        // Fallback to polling? Or just fail?
                        // For now, let's throw to indicate misconfiguration
                        throw err;
                    }
                }
                else {
                    // Default: Start Poller (Existing logic)
                    const poller = new poller_1.PowerLobsterPoller(config);
                    this.pollers.set(accountId, poller);
                    poller.on('message', async (wrapper) => {
                        const event = wrapper.payload;
                        const eventId = wrapper.id;
                        console.log(`[PowerLobster] Received event: ${event.type} (ID: ${eventId})`, event);
                        try {
                            await this.handleEvent(ctx, event);
                            // ACK the event after successful handling
                            await poller.ack(eventId);
                        }
                        catch (err) {
                            console.error(`[PowerLobster] Failed to handle event ${eventId}:`, err);
                        }
                    });
                    poller.start();
                }
                // Keep the channel "alive" by returning a promise that never resolves
                // This mimics a long-running connection process
                return new Promise((resolve) => {
                    this.runningPromises.set(accountId, resolve);
                });
            },
            stopAccount: async (ctx) => {
                const accountId = ctx.account.id;
                const poller = this.pollers.get(accountId);
                if (poller) {
                    poller.stop();
                    this.pollers.delete(accountId);
                }
                this.webhookHandlers.delete(accountId); // Cleanup webhook handler
                this.clients.delete(accountId);
                tools_1.activeClients.delete(accountId); // Clean up client from tools registry
                // Resolve the startAccount promise to let it exit cleanly
                const resolve = this.runningPromises.get(accountId);
                if (resolve) {
                    resolve();
                    this.runningPromises.delete(accountId);
                }
            },
        };
        this.outbound = {
            sendText: async (ctx) => {
                const { target, content } = ctx;
                const accountId = target.accountId;
                const client = this.clients.get(accountId);
                if (!client) {
                    throw new Error(`PowerLobster client for account ${accountId} not found`);
                }
                // Determine if it's a DM or other type based on peer.id or type
                // Assuming peer.id is the user ID for DMs
                try {
                    await client.sendDM(target.peer.id, content);
                    return { success: true };
                }
                catch (err) {
                    console.error(`[PowerLobster] Failed to send message: ${err.message}`);
                    return { success: false, error: err.message };
                }
            },
        };
        // Implementing agentTools if OpenClaw supports passing context/client
        // But wait, the signature in types.ts is (client: any) => any[]
        // This likely means OpenClaw will call this function and PASS the client/context?
        // OR it means we define a static list of tools.
        // Given the ambiguity, we'll keep the dynamic registration in startAccount which is safer for now.
    }
    async handleEvent(ctx, event) {
        const { account, channelRuntime } = ctx;
        const accountId = account.id;
        // Normalize event structure (Relay vs expected)
        const eventType = event.type || event.event;
        const eventPayload = event.payload || event.data;
        console.log(`[PowerLobster] Processing normalized event: ${eventType}`, eventPayload);
        let peerId = '';
        let content = '';
        let type = 'unknown';
        if (eventType === 'dm.received') {
            peerId = eventPayload.sender_handle || eventPayload.from; // Check both sender_handle and from
            content = eventPayload.content;
            type = 'dm';
        }
        else if (eventType === 'wave.started') {
            content = `🌊 Wave started!\nTask: ${eventPayload.task_title || eventPayload.title}\nWave ID: ${eventPayload.wave_id}\nTime: ${eventPayload.wave_time}`;
            peerId = 'wave-system';
            type = 'wave';
        }
        else if (eventType === 'task.assigned') {
            content = `Task assigned: ${eventPayload.task?.title}. Project: ${eventPayload.project?.title}. Description: ${eventPayload.task?.description || "No description"}`;
            peerId = 'task-system';
            type = 'task';
        }
        else if (eventType === 'task.comment') {
            content = `New comment on task ${eventPayload.task?.title} from ${eventPayload.author}: ${eventPayload.content}`;
            peerId = 'task-system';
            type = 'task';
        }
        else if (eventType === 'mention') {
            content = `You were mentioned by ${eventPayload.author} in post: ${eventPayload.content}`;
            peerId = eventPayload.author || 'mention-system';
            type = 'mention';
        }
        else if (eventType === 'wave.reminder') {
            content = `Wave reminder: ${eventPayload.task_title || eventPayload.title} starts in 60 minutes`;
            peerId = 'wave-system';
            type = 'wave';
        }
        else if (eventType === 'wave.scheduled') {
            content = `Wave scheduled: ${eventPayload.task_title || eventPayload.title} at ${eventPayload.wave_time || eventPayload.time}`;
            peerId = 'wave-system';
            type = 'wave';
        }
        else {
            console.log(`[PowerLobster] Unhandled event type: ${eventType}`);
            return;
        }
        // Resolve route
        let agentId = 'main'; // Default fallback
        try {
            // Direct routing to configured agent ID (primary method for PowerLobster)
            if (account.config.agentId) {
                agentId = account.config.agentId;
            }
            else {
                // Fallback to dynamic routing if no specific agent configured
                // This is rare for PowerLobster but kept for advanced use cases
                try {
                    const route = await channelRuntime.routing.resolveAgentRoute({
                        channel: this.id,
                        accountId: accountId,
                        peer: {
                            id: peerId,
                            type: type,
                        },
                        content: content,
                    });
                    if (route && route.agentId) {
                        agentId = route.agentId;
                    }
                }
                catch (routingErr) {
                    console.warn(`[PowerLobster] Routing resolution failed, using default 'main':`, routingErr);
                    agentId = 'main';
                }
            }
            if (agentId) {
                // Build MsgContext
                const msgContext = {
                    SessionKey: `powerlobster:dm:${peerId}`,
                    Type: "message",
                    Body: content,
                    From: peerId,
                    Channel: this.id,
                    Platform: "powerlobster",
                };
                // Pass full routing context if available, otherwise minimal fallback
                // This attempts to address the "undefined session" error by providing at least a mocked session structure if routing failed
                if (!event.session) {
                    // Mock session if missing from event/routing
                    // This is a defensive measure for the routing warning
                }
                // DEBUG: Check channelRuntime structure
                console.log('[PowerLobster] channelRuntime keys:', Object.keys(channelRuntime));
                if (channelRuntime.reply) {
                    console.log('[PowerLobster] reply keys:', Object.keys(channelRuntime.reply));
                }
                // Dispatch and handle reply
                if (channelRuntime.reply && typeof channelRuntime.reply.dispatchReplyWithBufferedBlockDispatcher === 'function') {
                    await channelRuntime.reply.dispatchReplyWithBufferedBlockDispatcher({
                        ctx: msgContext,
                        cfg: ctx.cfg,
                        dispatcherOptions: {
                            deliver: async (payload, info) => {
                                console.log(`[PowerLobster] Delivering reply to ${peerId}: ${payload.text.substring(0, 50)}...`);
                                // Send agent's reply back to PowerLobster
                                const client = this.clients.get(accountId);
                                if (client) {
                                    await client.sendDM(peerId, payload.text);
                                    console.log(`[PowerLobster] Reply delivered successfully.`);
                                }
                                else {
                                    console.error(`[PowerLobster] Client for account ${accountId} not found during delivery`);
                                }
                            },
                        }
                    });
                }
                else {
                    console.error('[PowerLobster] channelRuntime.reply.dispatchReplyWithBufferedBlockDispatcher not found!');
                }
            }
            else {
                console.warn(`[PowerLobster] No agent resolved for event from ${peerId}`);
            }
        }
        catch (err) {
            console.error(`[PowerLobster] Error dispatching event:`, err);
        }
    }
    // Method to handle incoming webhooks (called from index.ts or router)
    async handleWebhook(req) {
        // Logic to determine which account this webhook is for.
        // If we support multiple accounts, the webhook URL might need an ID or query param?
        // OR the payload contains the relay_id/agent_id.
        // For now, let's assume single-tenant or broadcast to all matching?
        // Better: iterate handlers and try to match?
        // Or rely on config.
        // If we have only one account in push mode, use that.
        if (this.webhookHandlers.size === 1) {
            const handler = this.webhookHandlers.values().next().value;
            if (handler) {
                return handler.handle(req);
            }
        }
        // TODO: Multi-tenant routing logic for webhooks
        // Ideally, the webhook URL should be /webhooks/powerlobster/:accountId
        if (this.webhookHandlers.size > 1) {
            console.warn('[PowerLobster] Multiple accounts in push mode not fully supported for shared webhook URL. Using first handler.');
            const handler = this.webhookHandlers.values().next().value;
            if (handler) {
                return handler.handle(req);
            }
        }
        throw new Error('No webhook handler found');
    }
    // Method to get tools for a specific account
    getToolsForAccount(accountId) {
        const client = this.clients.get(accountId);
        if (!client) {
            return [];
        }
        return (0, tools_1.getTools)();
    }
}
exports.powerLobsterChannel = new PowerLobsterChannel();
