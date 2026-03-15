import { PowerLobsterEvent } from './types';
import * as crypto from 'crypto';

export class PowerLobsterWebhookHandler {
  private eventHandler: (event: PowerLobsterEvent) => Promise<void>;
  private secret?: string;

  constructor(handler: (event: PowerLobsterEvent) => Promise<void>, secret?: string) {
    this.eventHandler = handler;
    this.secret = secret;
  }

  /**
   * Verify the webhook signature using HMAC-SHA256.
   * Returns true if valid, false if invalid.
   */
  private verifySignature(rawBody: string, signatureHeader: string | undefined, timestampHeader: string | undefined): { valid: boolean; error?: string } {
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
      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedFull),
        Buffer.from(signatureHeader)
      );
      
      if (!isValid) {
        return { valid: false, error: 'Signature mismatch' };
      }
    } catch (err) {
      // timingSafeEqual throws if lengths differ
      return { valid: false, error: 'Signature length mismatch' };
    }

    return { valid: true };
  }

  async handle(req: any) {
    // Extract headers (normalize to lowercase)
    const signatureHeader = req.headers?.['x-powerlobster-signature'] || req.headers?.['X-PowerLobster-Signature'];
    const timestampHeader = req.headers?.['x-powerlobster-timestamp'] || req.headers?.['X-PowerLobster-Timestamp'];
    
    // Read body from request stream manually as OpenClaw doesn't parse it
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks).toString("utf-8");
    
    console.log("[PowerLobster] Webhook received, body length:", rawBody.length);
    
    // ============== SIGNATURE VERIFICATION ==============
    const verification = this.verifySignature(rawBody, signatureHeader, timestampHeader);
    
    if (!verification.valid) {
      console.error(`[PowerLobster] ❌ Webhook rejected: ${verification.error}`);
      const error = new Error(`Unauthorized: ${verification.error}`) as any;
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
    } catch (e) {
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
