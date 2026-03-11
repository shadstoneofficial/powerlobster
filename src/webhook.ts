import { PowerLobsterEvent } from './types';

export class PowerLobsterWebhookHandler {
  private eventHandler: (event: PowerLobsterEvent) => Promise<void>;
  private secret?: string;

  constructor(handler: (event: PowerLobsterEvent) => Promise<void>, secret?: string) {
    this.eventHandler = handler;
    this.secret = secret;
  }

  async handle(req: any) {
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
