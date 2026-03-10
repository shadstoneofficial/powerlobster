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
            'Accept': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
        };
        const options = {
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
exports.PowerLobsterClient = PowerLobsterClient;
