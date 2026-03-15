"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PowerLobsterWebhookHandler = void 0;
const crypto = __importStar(require("crypto"));
class PowerLobsterWebhookHandler {
    constructor(handler, secret) {
        this.eventHandler = handler;
        this.secret = secret;
    }
    /**
     * Verify the webhook signature using HMAC-SHA256.
     * Returns true if valid, false if invalid.
     */
    verifySignature(rawBody, signatureHeader, timestampHeader) {
        // If no secret configured, skip verification (but log warning)
        if (!this.secret) {
            console.warn('[PowerLobster] ⚠️ No webhook secret configured - skipping signature verification. This is insecure!');
            return { valid: true };
        }
        // Both headers required when secret is set
        if (!signatureHeader || !timestampHeader) {
            return { valid: false, error: 'Missing signature or timestamp header' };
        }
        // 1. Replay attack protection - reject requests older than 5 minutes
        const timestamp = parseInt(timestampHeader, 10);
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        if (isNaN(timestamp) || now - timestamp > fiveMinutes) {
            return { valid: false, error: `Request too old (timestamp: ${timestampHeader}, age: ${now - timestamp}ms)` };
        }
        // 2. Calculate expected signature
        // Format: HMAC-SHA256 of "${timestamp}.${rawBody}"
        const expectedSignature = crypto
            .createHmac('sha256', this.secret)
            .update(`${timestampHeader}.${rawBody}`)
            .digest('hex');
        const expectedFull = `v1=${expectedSignature}`;
        // 3. Constant-time comparison to prevent timing attacks
        try {
            const isValid = crypto.timingSafeEqual(Buffer.from(expectedFull), Buffer.from(signatureHeader));
            if (!isValid) {
                return { valid: false, error: 'Signature mismatch' };
            }
        }
        catch (err) {
            // timingSafeEqual throws if lengths differ
            return { valid: false, error: 'Signature length mismatch' };
        }
        return { valid: true };
    }
    async handle(req) {
        // Extract headers (normalize to lowercase)
        const signatureHeader = req.headers?.['x-powerlobster-signature'] || req.headers?.['X-PowerLobster-Signature'];
        const timestampHeader = req.headers?.['x-powerlobster-timestamp'] || req.headers?.['X-PowerLobster-Timestamp'];
        // Read body from request stream manually as OpenClaw doesn't parse it
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(Buffer.from(chunk));
        }
        const rawBody = Buffer.concat(chunks).toString("utf-8");
        console.log("[PowerLobster] Webhook received, body length:", rawBody.length);
        // ============== SIGNATURE VERIFICATION ==============
        const verification = this.verifySignature(rawBody, signatureHeader, timestampHeader);
        if (!verification.valid) {
            console.error(`[PowerLobster] ❌ Webhook rejected: ${verification.error}`);
            const error = new Error(`Unauthorized: ${verification.error}`);
            error.statusCode = 401;
            throw error;
        }
        if (this.secret) {
            console.log("[PowerLobster] ✅ Webhook signature verified");
        }
        // ====================================================
        let body;
        try {
            body = rawBody ? JSON.parse(rawBody) : null;
        }
        catch (e) {
            console.error("[PowerLobster] Failed to parse webhook body:", e);
            throw new Error("Invalid JSON body");
        }
        // Normalize event if needed, similar to poller
        // Relay push payload structure matches the poller event structure: { payload: {...}, id: "..." }
        // We need to extract the inner payload and preserve metadata.
        const event = {
            ...(body.payload || body),
            _meta: body._meta || (body.payload && body.payload._meta) || {}
        };
        if (!event || !event.type) {
            throw new Error('Invalid event payload');
        }
        // Process event
        // Note: If this throws (e.g., due to rate limits), the try/catch in index.ts will handle it
        await this.eventHandler(event);
    }
}
exports.PowerLobsterWebhookHandler = PowerLobsterWebhookHandler;
