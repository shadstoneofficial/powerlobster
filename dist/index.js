"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTools = void 0;
const channel_1 = require("./src/channel");
const tools_1 = require("./src/tools"); // Re-add import
var tools_2 = require("./src/tools");
Object.defineProperty(exports, "getTools", { enumerable: true, get: function () { return tools_2.getTools; } });
const plugin = {
    id: "powerlobster",
    name: "PowerLobster",
    description: "PowerLobster channel plugin",
    configSchema: { type: "object", additionalProperties: false, properties: {} },
    register(api) {
        api.registerChannel({ plugin: channel_1.powerLobsterChannel });
        // Register webhook route
        // Note: The API for registering routes varies by OpenClaw version.
        // Assuming api.router or similar exists.
        if (api.router) {
            api.router.post('/powerlobster/webhook', async (req, res) => {
                try {
                    await channel_1.powerLobsterChannel.handleWebhook(req);
                    res.status(200).send({ status: 'received' });
                }
                catch (err) {
                    console.error('[PowerLobster] Webhook error:', err);
                    res.status(500).send({ error: err.message });
                }
            });
        }
        else {
            console.warn('[PowerLobster] api.router not available. Webhook mode may not work.');
        }
        // Register tools globally as requested
        // The tools implementation now dynamically looks up the active client
        const tools = (0, tools_1.getTools)(); // No client needed here anymore
        // Assuming api.registerTool is the correct method based on feedback
        if (typeof api.registerTool === 'function') {
            for (const tool of tools) {
                api.registerTool({
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                    execute: tool.handler // Map handler to execute
                });
            }
        }
        else if (typeof api.registerTools === 'function') {
            // Fallback for some OpenClaw versions
            api.registerTools(tools);
        }
    },
};
exports.default = plugin;
