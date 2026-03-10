
import { powerLobsterChannel } from './src/channel';
import { getTools } from './src/tools';

const plugin = {
  id: "powerlobster",
  name: "PowerLobster",
  description: "PowerLobster channel plugin",
  configSchema: { type: "object", additionalProperties: false, properties: {} },
  register(api: any) {
    api.registerChannel({ plugin: powerLobsterChannel });
    
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
