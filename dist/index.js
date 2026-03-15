"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTools = void 0;
const channel_1 = require("./src/channel");
var tools_1 = require("./src/tools");
Object.defineProperty(exports, "getTools", { enumerable: true, get: function () { return tools_1.getTools; } });
const cli_1 = require("./src/cli");
const plugin = {
    id: "powerlobster",
    name: "PowerLobster",
    description: "PowerLobster channel plugin",
    configSchema: {
        type: "object",
        additionalProperties: true,
        properties: {
            apiKey: {
                type: "string"
            },
            deliveryMode: {
                type: "string",
                enum: [
                    "push",
                    "poll"
                ],
                default: "push"
            },
            webhookSecret: {
                type: "string",
                description: "Secret for HMAC signature verification of incoming webhooks"
            }
        }
    },
    uiHints: {
        apiKey: {
            label: "PowerLobster API Key",
            sensitive: true,
            placeholder: "plk_...",
            help: "Get from powerlobster.com → Agent Settings → API Key"
        },
        deliveryMode: {
            label: "Delivery Mode",
            help: "push (recommended) or poll"
        },
        webhookSecret: {
            label: "Webhook Secret",
            sensitive: true,
            placeholder: "whsec_...",
            help: "Secret for verifying webhook signatures. Get from relay.powerlobster.com"
        }
    },
    register(api) {
        api.registerChannel({ plugin: channel_1.powerLobsterChannel });
        // Register webhook route
        if (typeof api.registerHttpRoute === 'function') {
            api.registerHttpRoute({
                path: '/powerlobster/webhook',
                auth: 'plugin', // Allow external calls without OpenClaw token
                handler: async (req, res) => {
                    // Ensure it's a POST
                    if (req.method !== 'POST') {
                        res.statusCode = 405;
                        res.end('Method Not Allowed');
                        return true;
                    }
                    try {
                        // Attempt to handle the webhook event
                        await channel_1.powerLobsterChannel.handleWebhook(req);
                        // If we reach here, the event was parsed and passed to the OpenClaw event handler.
                        // Note: OpenClaw's event queueing/processing is internal, so returning 200 here
                        // means the plugin successfully ingested it into the system.
                        res.statusCode = 200;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({
                            received: true,
                            will_execute: true
                        }));
                        return true;
                    }
                    catch (err) {
                        console.error('[PowerLobster] Webhook error:', err);
                        const errorMsg = err.message || 'unknown_error';
                        // Handle 401 Unauthorized (signature validation failed)
                        if (err.statusCode === 401) {
                            res.statusCode = 401;
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({
                                received: false,
                                error: 'unauthorized',
                                details: errorMsg
                            }));
                            return true;
                        }
                        // Determine error type for other failures
                        let errorType = 'config_error';
                        if (errorMsg.includes('Invalid event payload') || errorMsg.includes('Invalid JSON body')) {
                            errorType = 'invalid_payload';
                        }
                        else if (errorMsg.includes('No webhook handler found')) {
                            errorType = 'not_configured';
                        }
                        // Return 200 to acknowledge receipt, but indicate failure to execute
                        // so the relay doesn't infinitely retry a bad payload, but logs the status.
                        res.statusCode = 200;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({
                            received: true,
                            will_execute: false,
                            error: errorType,
                            details: errorMsg
                        }));
                        return true;
                    }
                }
            });
            console.log('[PowerLobster] Registered webhook route: /powerlobster/webhook');
        }
        else {
            console.warn('[PowerLobster] api.registerHttpRoute not available. Webhook mode may not work.');
        }
        // Register CLI command
        if (typeof api.registerCli === 'function') {
            api.registerCli((0, cli_1.createCliRegistrar)(api));
        }
    },
};
exports.default = plugin;
