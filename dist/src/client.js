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
        const body = { wave_time: waveTime };
        if (taskId)
            body.task_id = taskId;
        if (force !== undefined)
            body.force = force;
        // Updated endpoint based on spec: /mission_control/api/schedule/{id}
        // But wait, the spec says /mission_control/api/schedule/{id} 
        // And also "Schedule Task (Orchestrator) ... /mission_control/api/schedule/{id}"
        // Let's verify if {id} is agentId.
        // Spec line 102: | **Get Agent Schedule** | `GET` | `/mission_control/api/schedule/{id}` |
        // Spec line 103: | **Schedule Task** | `POST` | `/mission_control/api/schedule/{id}` |
        // However, the user provided evidence: 
        // "Direct curl to /mission_control/api/schedule/me -> {"status":"success","wave_id":null}"
        // This implies /mission_control/api/schedule/me IS valid but maybe not for scheduling?
        // Wait, the error is 400 Bad Request. 
        // The previous fix was to remove nulls.
        // If it's still failing, maybe the endpoint needs the UUID, not 'me'?
        // OR maybe the date format is wrong?
        // Let's check the spec for "Schedule Task (Orchestrator)"
        // It says: Payload: { "wave_time": "YYYY-MM-DDTHH:00:00", "task_id": "uuid" }
        // If agentId is 'me', and the endpoint expects a UUID, that might be the issue if the backend doesn't support 'me' for this specific route.
        // BUT the curl test to .../schedule/me worked (returned 200 success).
        // So the endpoint /schedule/me is likely correct for self-scheduling.
        // If the tool returns 400, it's the PAYLOAD.
        // waveTime must be ISO 8601.
        return this.request(`${MISSION_CONTROL_URL}/schedule/${agentId}`, 'POST', body);
    }
    async sendHeartbeat() {
        return this.request(`${BASE_URL}/heartbeat`, 'POST');
    }
}
exports.PowerLobsterClient = PowerLobsterClient;
