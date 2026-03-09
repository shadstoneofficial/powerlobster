
import { powerLobsterChannel } from './src/channel';
export { getTools } from './src/tools';

const plugin = {
  id: "powerlobster",
  name: "PowerLobster",
  description: "PowerLobster channel plugin",
  configSchema: { type: "object", additionalProperties: false, properties: {} },
  register(api: any) {
    api.registerChannel({ plugin: powerLobsterChannel });
  },
};

export default plugin;
