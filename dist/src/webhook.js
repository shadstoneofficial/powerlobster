"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PowerLobsterWebhookHandler = void 0;
class PowerLobsterWebhookHandler {
    constructor(handler, secret) {
        this.eventHandler = handler;
        this.secret = secret;
    }
    async handle(req) {
        // Basic signature verification logic could go here if req.headers['x-powerlobster-signature'] exists
        // For now, we trust the payload if the route is secure or secret is matched manually
        // OpenClaw might pass the body directly or we might need to parse it
        const body = req.body;
        console.log('[PowerLobster] Webhook received:', JSON.stringify(body));
        // Normalize event if needed, similar to poller
        // Relay push payload structure matches the poller event structure
        const event = body;
        if (!event || !event.type) {
            throw new Error('Invalid event payload');
        }
        // Process event
        await this.eventHandler(event);
    }
}
exports.PowerLobsterWebhookHandler = PowerLobsterWebhookHandler;
