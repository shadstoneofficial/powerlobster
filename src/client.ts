
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
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };

    const options: RequestInit = {
      method,
      headers,
    };

    // Log the payload for debugging
    if (body) {
        options.body = JSON.stringify(body);
        console.log(`[PowerLobster] API Request ${method} ${url}:`, options.body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[PowerLobster] API ${response.status} ${response.statusText} for ${url}: ${errorBody}`);
      throw new Error(`PowerLobster API Error: ${response.status} ${response.statusText} - ${errorBody}`);
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
    return this.request(`${MISSION_CONTROL_URL}/schedule/${agentId}`, 'POST', {
      wave_time: waveTime,
      ...(taskId && { task_id: taskId }),
      ...(force !== undefined && { force })
    });
  }

  async sendHeartbeat() {
    return this.request(`${BASE_URL}/heartbeat`, 'POST');
  }
}
