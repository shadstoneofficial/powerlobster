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
        // Read body from request stream manually as OpenClaw doesn't parse it
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(Buffer.from(chunk));
        }
        const rawBody = Buffer.concat(chunks).toString("utf-8");
        console.log("[PowerLobster] Webhook received raw:", rawBody.substring(0, 200));
        let body;
        try {
            body = rawBody ? JSON.parse(rawBody) : null;
        }
        catch (e) {
            console.error("[PowerLobster] Failed to parse webhook body:", e);
            throw new Error("Invalid JSON body");
        }
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
