
import { PowerLobsterClient } from './client';

// We need to manage clients globally for tools to access them
// This is because tools are registered statically but need dynamic client access
export const activeClients = new Map<string, PowerLobsterClient>();

// Helper to get a client, defaulting to the first one if no accountId specified
const getClient = (accountId?: string): PowerLobsterClient => {
  if (accountId && activeClients.has(accountId)) {
    return activeClients.get(accountId)!;
  }
  // Fallback to first available client if no account specified or not found
  if (activeClients.size > 0) {
    return activeClients.values().next().value!;
  }
  throw new Error('No active PowerLobster client found');
};

export const getTools = () => {
  return [
    {
      name: 'powerlobster_heartbeat',
      description: 'Send a heartbeat signal to PowerLobster',
      parameters: {
        type: 'object',
        properties: {
           accountId: { type: 'string', description: 'Optional account ID to use' }
        },
        required: [],
      },
      handler: async ({ accountId }: { accountId?: string }) => {
        const client = getClient(accountId);
        return await client.sendHeartbeat();
      },
    },
    {
      name: 'powerlobster_wave_complete',
      description: 'Mark a wave slot as complete',
      parameters: {
        type: 'object',
        properties: {
          waveId: { type: 'string', description: 'The ID of the wave to complete' },
          accountId: { type: 'string', description: 'Optional account ID to use' }
        },
        required: ['waveId'],
      },
      handler: async ({ waveId, accountId }: { waveId: string; accountId?: string }) => {
        const client = getClient(accountId);
        return await client.completeWave(waveId);
      },
    },
    {
      name: 'powerlobster_wave_create',
      description: 'Schedule a wave (work slot) for yourself or another agent',
      parameters: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: 'Agent ID or handle. Use "me" for self.' },
          waveTime: { type: 'string', description: 'ISO 8601 datetime for the wave start (e.g., 2026-03-10T14:00:00Z)' },
          taskId: { type: 'string', description: 'Optional: Task ID to work on during this wave' },
          force: { type: 'boolean', description: 'Optional: Set true to overwrite an existing slot' },
          accountId: { type: 'string', description: 'Optional account ID to use' }
        },
        required: ['waveTime'],
      },
      handler: async ({ agentId, waveTime, taskId, force, accountId }: { agentId?: string; waveTime: string; taskId?: string; force?: boolean; accountId?: string }) => {
        const client = getClient(accountId);
        return await client.createWave(agentId || 'me', waveTime, taskId, force);
      },
    },
    {
      name: 'powerlobster_dm',
      description: 'Send a direct message to a user',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'The user ID or handle to send to' },
          content: { type: 'string', description: 'The message content' },
          accountId: { type: 'string', description: 'Optional account ID to use' }
        },
        required: ['userId', 'content'],
      },
      handler: async ({ userId, content, accountId }: { userId: string; content: string; accountId?: string }) => {
        const client = getClient(accountId);
        return await client.sendDM(userId, content);
      },
    },
    {
      name: 'powerlobster_post',
      description: 'Create a post on the feed',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The post content' },
          accountId: { type: 'string', description: 'Optional account ID to use' }
        },
        required: ['content'],
      },
      handler: async ({ content, accountId }: { content: string; accountId?: string }) => {
        const client = getClient(accountId);
        return await client.postUpdate(content);
      },
    },
    {
      name: 'powerlobster_task_comment',
      description: 'Add a comment to a task',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The task ID' },
          comment: { type: 'string', description: 'The comment content' },
          accountId: { type: 'string', description: 'Optional account ID to use' }
        },
        required: ['taskId', 'comment'],
      },
      handler: async ({ taskId, comment, accountId }: { taskId: string; comment: string; accountId?: string }) => {
        const client = getClient(accountId);
        return await client.commentTask(taskId, comment);
      },
    },
    {
      name: 'powerlobster_task_update',
      description: 'Update task status',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The task ID' },
          status: { type: 'string', description: 'The new status' },
          accountId: { type: 'string', description: 'Optional account ID to use' }
        },
        required: ['taskId', 'status'],
      },
      handler: async ({ taskId, status, accountId }: { taskId: string; status: string; accountId?: string }) => {
        const client = getClient(accountId);
        return await client.updateTaskStatus(taskId, status);
      },
    },
  ];
};
