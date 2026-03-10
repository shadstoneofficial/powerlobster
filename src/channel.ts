
import {
  ChannelPlugin,
  ChannelGatewayAdapter,
  ChannelOutboundAdapter,
  ChannelConfigAdapter,
  ChannelGatewayContext,
  ChannelOutboundContext,
  PowerLobsterAccount,
  ResolvedAgentRoute,
  PowerLobsterEvent,
  PowerLobsterDMEvent,
  PowerLobsterWaveEvent,
  ChannelId,
  MsgContext, // Added MsgContext
} from './types';
import { PowerLobsterClient } from './client';
import { PowerLobsterPoller } from './poller';

const CHANNEL_ID: ChannelId = 'powerlobster';

class PowerLobsterChannel implements ChannelPlugin<PowerLobsterAccount> {
  id = CHANNEL_ID;
  meta = {
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
  capabilities = {
    text: true,
  };

  private clients = new Map<string, PowerLobsterClient>();
  private pollers = new Map<string, PowerLobsterPoller>();
  private runningPromises = new Map<string, () => void>();

  config: ChannelConfigAdapter<PowerLobsterAccount> = {
    listAccountIds: (config: any) => {
      // Check for accounts in channels.powerlobster.instances
      const instances = config.channels?.powerlobster?.instances ?? [];
      if (Array.isArray(instances) && instances.length > 0) {
        return instances.map((inst: any) => inst.id);
      }
      
      // Fallback: Check for legacy single account or if we should just return 'default'
      // If we have legacy env vars, we return 'default'
      if (process.env.POWERLOBSTER_API_KEY) {
        return ['default'];
      }
      
      return [];
    },

    resolveAccount: (config: any, accountId: string = 'default') => {
      // 1. Try to find in instances list
      const instances = config.channels?.powerlobster?.instances ?? [];
      const instanceConfig = instances.find((inst: any) => inst.id === accountId);
      
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

  gateway: ChannelGatewayAdapter<PowerLobsterAccount> = {
    startAccount: async (ctx: ChannelGatewayContext<PowerLobsterAccount>) => {
      const { account } = ctx;
      const config = account.config;
      const accountId = account.id;

      console.log(`[PowerLobster] Starting account ${accountId}`);

      const client = new PowerLobsterClient(config);
      this.clients.set(accountId, client);

      const poller = new PowerLobsterPoller(config);
      this.pollers.set(accountId, poller);

      poller.on('message', async (wrapper: { payload: PowerLobsterEvent; id: string }) => {
        const event = wrapper.payload;
        const eventId = wrapper.id;
        
        console.log(`[PowerLobster] Received event: ${event.type} (ID: ${eventId})`, event);
        
        try {
          await this.handleEvent(ctx, event);
          
          // ACK the event after successful handling
          await poller.ack(eventId);
        } catch (err) {
          console.error(`[PowerLobster] Failed to handle event ${eventId}:`, err);
        }
      });

      poller.start();
      
      // Keep the channel "alive" by returning a promise that never resolves
      // This mimics a long-running connection process
      return new Promise<void>((resolve) => {
        this.runningPromises.set(accountId, resolve);
      });
    },

    stopAccount: async (ctx: ChannelGatewayContext<PowerLobsterAccount>) => {
      const accountId = ctx.account.id;
      const poller = this.pollers.get(accountId);
      if (poller) {
        poller.stop();
        this.pollers.delete(accountId);
      }
      this.clients.delete(accountId);

      // Resolve the startAccount promise to let it exit cleanly
      const resolve = this.runningPromises.get(accountId);
      if (resolve) {
        resolve();
        this.runningPromises.delete(accountId);
      }
    },
  };

  outbound: ChannelOutboundAdapter = {
    sendText: async (ctx: ChannelOutboundContext) => {
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
      } catch (err: any) {
        console.error(`[PowerLobster] Failed to send message: ${err.message}`);
        return { success: false, error: err.message };
      }
    },
  };

  private async handleEvent(ctx: ChannelGatewayContext<PowerLobsterAccount>, event: any) {
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
    } else if (eventType === 'wave.started') {
        content = `Wave started: ${eventPayload.title}`;
        peerId = 'wave-system'; 
        type = 'wave';
    } else {
        console.log(`[PowerLobster] Unhandled event type: ${eventType}`);
        return;
    }

    // Resolve route
    try {
      // Create a simplified route directly if resolveAgentRoute fails
      // This is a common pattern in simple channels
      let agentId = 'main'; // Default fallback
      
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
      } catch (routingErr) {
        console.warn(`[PowerLobster] Routing resolution failed, falling back to configured agentId:`, routingErr);
        // Fallback to the agentId configured in the account
        if (account.config.agentId) {
          agentId = account.config.agentId;
        }
      }

      if (agentId) {
        // Build MsgContext
        const msgContext: MsgContext = {
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
                deliver: async (payload: { text: string }, info: any) => {
                  console.log(`[PowerLobster] Delivering reply to ${peerId}: ${payload.text.substring(0, 50)}...`);
                  // Send agent's reply back to PowerLobster
                  const client = this.clients.get(accountId);
                  if (client) {
                     await client.sendDM(peerId, payload.text);
                     console.log(`[PowerLobster] Reply delivered successfully.`);
                  } else {
                     console.error(`[PowerLobster] Client for account ${accountId} not found during delivery`);
                  }
                },
              }
            });
        } else {
            console.error('[PowerLobster] channelRuntime.reply.dispatchReplyWithBufferedBlockDispatcher not found!');
        }
      } else {
          console.warn(`[PowerLobster] No agent resolved for event from ${peerId}`);
      }
    } catch (err) {
      console.error(`[PowerLobster] Error dispatching event:`, err);
    }
  }
}

export const powerLobsterChannel = new PowerLobsterChannel();
