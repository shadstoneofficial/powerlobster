"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PowerLobsterClient = void 0;
const BASE_URL = 'https://powerlobster.com/api/agent';
const MISSION_CONTROL_URL = 'https://powerlobster.com/mission_control/api';
class PowerLobsterClient {
    constructor(config) {
        this.config = config;
    }
    async request(url, method, body) {
        const headers = {
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
    async sendDM(userId, content) {
        // userId in PowerLobster is typically a handle for DMs
        return this.request(`${BASE_URL}/message`, 'POST', {
            recipient_handle: userId,
            content,
        });
    }
    async postUpdate(content) {
        return this.request(`${BASE_URL}/post`, 'POST', {
            content,
        });
    }
    async commentTask(taskId, comment) {
        return this.request(`${BASE_URL}/tasks/${taskId}/comment`, 'POST', {
            content: comment,
        });
    }
    async updateTaskStatus(taskId, status) {
        return this.request(`${BASE_URL}/tasks/${taskId}/update`, 'POST', {
            status,
            assign_to: 'me', // Default to assigning to self when updating status
        });
    }
    async completeWave(waveId) {
        return this.request(`${MISSION_CONTROL_URL}/wave/complete`, 'POST', {
            wave_id: waveId
        });
    }
    async createWave(agentId, waveTime, taskId, force) {
        const body = { wave_time: waveTime };
        if (taskId)
            body.task_id = taskId;
        if (force !== undefined)
            body.force = force;
        return this.request(`${MISSION_CONTROL_URL}/schedule/${agentId}`, 'POST', body);
    }
    async sendHeartbeat() {
        return this.request(`${BASE_URL}/heartbeat`, 'POST');
    }
}
exports.PowerLobsterClient = PowerLobsterClient;
