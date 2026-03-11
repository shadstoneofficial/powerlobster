"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PowerLobsterClient = void 0;
const BASE_URL = 'https://powerlobster.com/api/agent';
const MISSION_CONTROL_URL = 'https://powerlobster.com/mission_control/api';
const RELAY_BASE_URL = 'https://relay.powerlobster.com/api/v1'; // Added Relay URL
class PowerLobsterClient {
    constructor(config) {
        this.config = config;
    }
    async request(url, method, body, useRelayAuth = false) {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${useRelayAuth ? this.config.relayApiKey : this.config.apiKey}`,
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
    async configureRelay(params) {
        if (!this.config.relayId || !this.config.relayApiKey) {
            throw new Error('Relay ID and API Key are required to configure relay');
        }
        // Call POST /api/v1/agent/configure on Relay
        // Note: The actual endpoint might be /api/v1/agent/configure or /api/v1/agent/:relayId/configure
        // Based on user input "Call POST /api/v1/agent/:relay_id/configure", let's use that.
        return this.request(`${RELAY_BASE_URL}/agent/${this.config.relayId}/configure`, 'POST', {
            delivery_mode: params.mode,
            webhook_url: params.url,
            webhook_secret: params.secret
        }, true // useRelayAuth
        );
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
    async createWave(agentId, wave_time, taskId, force) {
        const body = { wave_time };
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
