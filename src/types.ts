
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

export interface MsgContext {
  SessionKey: string;
  Type: string;
  Body: string;
  From: string;
  Channel: string;
  Platform: string;
}

export interface ChannelGatewayContext<ResolvedAccount = any> {
  account: ResolvedAccount;
  cfg: any; // Added cfg
  channelRuntime: {
    routing: {
      resolveAgentRoute: (input: ResolveAgentRouteInput) => Promise<ResolvedAgentRoute>;
    };
    // Replaced simplified dispatch with reply dispatcher
    reply: {
      dispatchReplyWithBufferedBlockDispatcher: (params: {
        ctx: MsgContext;
        cfg: any;
        dispatcherOptions: {
          deliver: (payload: { text: string }, info: any) => Promise<void>;
        };
      }) => Promise<void>;
    };
  };
  // Add sendEvent definition which was missing
  sendEvent: (event: {
      type: string;
      source: { channel: string; account: string; peer: string };
      payload: { text: string; files?: any[]; metadata?: any };
  }) => Promise<void>;
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
  session?: any; // Added optional session
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
  listAccountIds: (config: any) => string[];
  resolveAccount: (config: any, accountId?: string) => ResolvedAccount;
}

export interface ChannelPlugin<ResolvedAccount = any> {
  id: ChannelId;
  meta: ChannelMeta;
  capabilities: ChannelCapabilities;
  config: ChannelConfigAdapter<ResolvedAccount>;
  gateway: ChannelGatewayAdapter<ResolvedAccount>;
  outbound: ChannelOutboundAdapter;
  agentTools?: (client: any) => any[]; // Added optional agentTools
  setup?: ChannelSetupAdapter;
  status?: ChannelStatusAdapter;
}

export interface ChannelSetupAdapter {
  validateInput: (params: { input: any }) => string | null;
  applyAccountConfig: (params: { cfg: any; accountId: string; input: any }) => any;
}

export interface ChannelStatusAdapter {
  buildChannelSummary: (params: { account: any; defaultAccountId: string; snapshot?: any }) => Promise<{
    linked: boolean;
    self?: { e164?: string };
    authAgeMs?: number;
  }>;
}

// PowerLobster Specific Types

export interface PowerLobsterConfig {
  apiKey: string;
  agentId: string; // The target OpenClaw agent ID
  relayId?: string;
  relayApiKey?: string;
  
  // Push Mode Options
  deliveryMode?: 'poll' | 'push'; // Default: 'poll'
  webhookUrl?: string;            // Required if deliveryMode='push'
  webhookSecret?: string;         // Optional: for signature verification
}

export interface ChannelStatus {
  connected: boolean;
  deliveryMode: string;
  lastEvent: Date | null;
  skillsLoaded: number;
  account: string;
  relayId?: string;
  webhookUrl?: string;
  details?: string; // OpenClaw often looks for this string to display in the CLI
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
