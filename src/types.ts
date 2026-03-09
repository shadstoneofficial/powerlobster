
// OpenClaw Channel Interface Types (Mocked based on Spec)

export type ChannelId = string;

export interface ChannelMeta {
  id: string;
  name: string;
  version: string;
  label?: string;
  selectionLabel?: string;
  docsPath?: string;
  blurb?: string;
  aliases?: string[];
  description?: string;
  icon?: string;
}

export interface ChannelCapabilities {
  text?: boolean;
  media?: boolean;
  [key: string]: boolean | undefined;
}

export interface ChannelGatewayContext<ResolvedAccount = any> {
  account: ResolvedAccount;
  channelRuntime: {
    routing: {
      resolveAgentRoute: (input: ResolveAgentRouteInput) => Promise<ResolvedAgentRoute>;
    };
    dispatch: (agentId: string, event: any) => Promise<void>; // Simplified dispatch
  };
}

export interface ResolveAgentRouteInput {
  channel: ChannelId;
  accountId: string;
  peer: {
    id: string;
    type: string; // "user" | "group"
  };
  guildId?: string;
  teamId?: string;
  content?: string;
}

export interface ResolvedAgentRoute {
  agentId: string;
  sessionKey: string;
}

export interface ChannelOutboundContext {
  target: {
    channel: ChannelId;
    accountId: string;
    peer: {
      id: string;
    };
  };
  content: string;
  // simplified
}

export interface OutboundDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ChannelGatewayAdapter<ResolvedAccount = any> {
  startAccount: (ctx: ChannelGatewayContext<ResolvedAccount>) => Promise<unknown>;
  stopAccount: (ctx: ChannelGatewayContext<ResolvedAccount>) => Promise<void>;
}

export interface ChannelOutboundAdapter {
  sendText: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>;
  // sendMedia, sendPayload omitted for brevity
}

export interface ChannelConfigAdapter<ResolvedAccount = any> {
  // Simplified config adapter
  resolveAccount: (config: any) => Promise<ResolvedAccount>;
}

export interface ChannelPlugin<ResolvedAccount = any> {
  id: ChannelId;
  meta: ChannelMeta;
  capabilities: ChannelCapabilities;
  config: ChannelConfigAdapter<ResolvedAccount>;
  gateway: ChannelGatewayAdapter<ResolvedAccount>;
  outbound: ChannelOutboundAdapter;
}

// PowerLobster Specific Types

export interface PowerLobsterConfig {
  apiKey: string;
  agentId: string; // The target OpenClaw agent ID
  relayId?: string;
  relayApiKey?: string;
}

export interface PowerLobsterAccount {
  id: string;
  config: PowerLobsterConfig;
}

export interface PowerLobsterEvent {
  type: 'wave.started' | 'wave.reminder' | 'dm.received' | 'task.assigned' | 'task.comment' | 'mention';
  payload: any;
  timestamp: number;
}

export interface PowerLobsterDMEvent extends PowerLobsterEvent {
  type: 'dm.received';
  payload: {
    from: string; // user ID
    content: string;
    conversationId: string;
  };
}

export interface PowerLobsterWaveEvent extends PowerLobsterEvent {
  type: 'wave.started';
  payload: {
    waveId: string;
    title: string;
  };
}

// ... other event types
