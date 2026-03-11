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
                        await channel_1.powerLobsterChannel.handleWebhook(req);
                        res.statusCode = 200;
                        res.end(JSON.stringify({ status: 'received' }));
                        return true;
                    }
                    catch (err) {
                        console.error('[PowerLobster] Webhook error:', err);
                        res.statusCode = 500;
                        res.end(JSON.stringify({ error: err.message }));
                        return true;
                    }
                }
            });
            console.log('[PowerLobster] Registered webhook route: /powerlobster/webhook');
        }
        else {
            console.warn('[PowerLobster] api.registerHttpRoute not available. Webhook mode may not work.');
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
