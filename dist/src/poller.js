"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PowerLobsterPoller = void 0;
const events_1 = require("events");
const node_fetch_1 = __importDefault(require("node-fetch"));
const RELAY_BASE_URL = 'https://relay.powerlobster.com/api/v1';
const POLLING_INTERVAL = 30000; // 30 seconds
class PowerLobsterPoller extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.isPolling = false;
        this.timer = null;
        this.config = config;
    }
    start() {
        if (this.isPolling)
            return;
        if (!this.config.relayId || !this.config.relayApiKey) {
            console.warn('[PowerLobster] Relay ID or API Key missing. Polling disabled.');
            return;
        }
        this.isPolling = true;
        console.log(`[PowerLobster] Starting polling for relay ${this.config.relayId}...`);
        this.poll();
    }
    stop() {
        this.isPolling = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
    async poll() {
        if (!this.isPolling)
            return;
        try {
            const response = await (0, node_fetch_1.default)(`${RELAY_BASE_URL}/pending/${this.config.relayId}?ack=true`, {
                headers: {
                    'Authorization': `Bearer ${this.config.relayApiKey}`
                }
            });
            if (response.ok) {
                const data = await response.json();
                const events = data.events || [];
                if (events.length > 0) {
                    console.log(`[PowerLobster] Received ${events.length} events`);
                    for (const eventWrapper of events) {
                        // Unpack the payload which contains the actual event
                        const event = eventWrapper.payload;
                        // Emit both payload and the wrapper ID for ACKing
                        this.emit('message', { payload: event, id: eventWrapper.id });
                    }
                }
            }
            else {
                console.warn(`[PowerLobster] Polling failed: ${response.status} ${response.statusText}`);
            }
        }
        catch (err) {
            console.error('[PowerLobster] Polling error:', err);
        }
        // Schedule next poll
        if (this.isPolling) {
            this.timer = setTimeout(() => this.poll(), POLLING_INTERVAL);
        }
    }
    async ack(eventId) {
        if (!this.config.relayId || !this.config.relayApiKey)
            return;
        try {
            // Try the main API endpoint for ACK (as suggested)
            const response = await (0, node_fetch_1.default)(`https://powerlobster.com/api/relay/${this.config.relayId}/ack`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.relayApiKey}`
                },
                body: JSON.stringify({ event_id: eventId })
            });
            if (response.ok) {
                console.log(`[PowerLobster] ACK successful for event ${eventId}`);
            }
            else {
                console.warn(`[PowerLobster] ACK failed: ${response.status} ${response.statusText}`);
            }
        }
        catch (err) {
            console.error(`[PowerLobster] ACK error for event ${eventId}:`, err);
        }
    }
}
exports.PowerLobsterPoller = PowerLobsterPoller;
