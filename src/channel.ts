
import {
  ChannelPlugin,
  ChannelGatewayAdapter,
  ChannelOutboundAdapter,
  ChannelConfigAdapter,
  ChannelGatewayContext,
  ChannelOutboundContext,
  PowerLobsterConfig,
  PowerLobsterAccount,
  ResolvedAgentRoute,
  PowerLobsterEvent,
  PowerLobsterDMEvent,
  PowerLobsterWaveEvent,
  ChannelId,
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

      poller.on('message', async (event: PowerLobsterEvent) => {
        console.log(`[PowerLobster] Received event: ${event.type}`, event);
        await this.handleEvent(ctx, event);
      });

      poller.start();
      
      // Keep the channel "alive" by returning a promise that never resolves
      // This mimics a long-running connection process
      return new Promise(() => {});
    },

    stopAccount: async (ctx: ChannelGatewayContext<PowerLobsterAccount>) => {
      const accountId = ctx.account.id;
      const poller = this.pollers.get(accountId);
      if (poller) {
        poller.stop();
        this.pollers.delete(accountId);
      }
      this.clients.delete(accountId);
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

  private async handleEvent(ctx: ChannelGatewayContext<PowerLobsterAccount>, event: PowerLobsterEvent) {
    const { account, channelRuntime } = ctx;
    const accountId = account.id;

    let peerId = '';
    let content = '';
    let eventType = 'unknown';

    if (event.type === 'dm.received') {
      const dmEvent = event as PowerLobsterDMEvent;
      peerId = dmEvent.payload.from;
      content = dmEvent.payload.content;
      eventType = 'dm';
    } else if (event.type === 'wave.started') {
        // Handle wave started
        const waveEvent = event as PowerLobsterWaveEvent;
        content = `Wave started: ${waveEvent.payload.title}`;
        peerId = 'wave-system'; // or a specific system user
        eventType = 'wave';
    } else {
        // Handle other events or ignore
        console.log(`[PowerLobster] Unhandled event type: ${event.type}`);
        return;
    }

    // Resolve route
    try {
      const route = await channelRuntime.routing.resolveAgentRoute({
        channel: this.id,
        accountId: accountId,
        peer: {
          id: peerId,
          type: eventType, // 'user' or 'group' or custom type
        },
        content: content,
      });

      if (route && route.agentId) {
        // Dispatch to agent
        await channelRuntime.dispatch(route.agentId, {
            ...event,
            // Add standard channel event properties if needed
            channelId: this.id,
            accountId: accountId,
            senderId: peerId,
            content: content
        });
      } else {
          console.warn(`[PowerLobster] No route resolved for event from ${peerId}`);
      }
    } catch (err) {
      console.error(`[PowerLobster] Error routing event:`, err);
    }
  }
}

export const powerLobsterChannel = new PowerLobsterChannel();
