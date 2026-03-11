
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
    if (typeof api.registerHttpRoute === 'function') {
        api.registerHttpRoute({
            path: '/powerlobster/webhook',
            handler: async (req: any, res: any) => {
                // Ensure it's a POST
                if (req.method !== 'POST') {
                    res.statusCode = 405;
                    res.end('Method Not Allowed');
                    return;
                }
                
                try {
                    await powerLobsterChannel.handleWebhook(req);
                    res.statusCode = 200;
                    res.end(JSON.stringify({ status: 'received' }));
                } catch (err: any) {
                    console.error('[PowerLobster] Webhook error:', err);
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: err.message }));
                }
            }
        });
        console.log('[PowerLobster] Registered webhook route: /powerlobster/webhook');
    } else {
        console.warn('[PowerLobster] api.registerHttpRoute not available. Webhook mode may not work.');
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
