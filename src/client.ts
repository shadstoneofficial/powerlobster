
import { PowerLobsterConfig } from './types';

const BASE_URL = 'https://powerlobster.com/api/agent';
const MISSION_CONTROL_URL = 'https://powerlobster.com/mission_control/api';

export class PowerLobsterClient {
  private config: PowerLobsterConfig;

  constructor(config: PowerLobsterConfig) {
    this.config = config;
  }

  private async request(url: string, method: string, body?: any) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };

    // Relay headers are not needed for main API, only for Relay API (which is handled in poller)
    // But if we wanted to use them here for some reason, we could.
    // The spec says "Auth: Bearer Token (API Key)" for main API.

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`PowerLobster API Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async sendDM(userId: string, content: string) {
    // userId in PowerLobster is typically a handle for DMs
    return this.request(`${BASE_URL}/message`, 'POST', {
      recipient_handle: userId,
      content,
    });
  }

  async postUpdate(content: string) {
    return this.request(`${BASE_URL}/post`, 'POST', {
      content,
    });
  }

  async commentTask(taskId: string, comment: string) {
    return this.request(`${BASE_URL}/tasks/${taskId}/comment`, 'POST', {
      content: comment,
    });
  }

  async updateTaskStatus(taskId: string, status: string) {
    return this.request(`${BASE_URL}/tasks/${taskId}/update`, 'POST', {
      status,
      assign_to: 'me', // Default to assigning to self when updating status
    });
  }

  async completeWave(waveId: string) {
    return this.request(`${MISSION_CONTROL_URL}/wave/complete`, 'POST', {
      wave_id: waveId
    });
  }

  async createWave(agentId: string, waveTime: string, taskId?: string, force?: boolean) {
    const body: Record<string, any> = { wave_time: waveTime };
    if (taskId) body.task_id = taskId;
    if (force !== undefined) body.force = force;
    
    return this.request(`${MISSION_CONTROL_URL}/schedule/${agentId}`, 'POST', body);
  }

  async sendHeartbeat() {
    return this.request(`${BASE_URL}/heartbeat`, 'POST');
  }
}
