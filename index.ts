
import { powerLobsterChannel } from './src/channel';
import { getTools } from './src/tools'; // Re-add import
export { getTools } from './src/tools';

const plugin = {
  id: "powerlobster",
  name: "PowerLobster",
  description: "PowerLobster channel plugin",
  configSchema: { type: "object", additionalProperties: false, properties: {} },
  register(api: any) {
    api.registerChannel({ plugin: powerLobsterChannel });
    
    // Register webhook route
    // Note: The API for registering routes varies by OpenClaw version.
    // Assuming api.router or similar exists.
    if (api.router) {
        api.router.post('/powerlobster/webhook', async (req: any, res: any) => {
            try {
                await powerLobsterChannel.handleWebhook(req);
                res.status(200).send({ status: 'received' });
            } catch (err: any) {
                console.error('[PowerLobster] Webhook error:', err);
                res.status(500).send({ error: err.message });
            }
        });
    } else {
        console.warn('[PowerLobster] api.router not available. Webhook mode may not work.');
    }
    
    // Register tools globally as requested
    // The tools implementation now dynamically looks up the active client
    const tools = getTools(); // No client needed here anymore
    
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
    } else if (typeof api.registerTools === 'function') {
       // Fallback for some OpenClaw versions
       api.registerTools(tools);
    }
  },
};

export default plugin;
