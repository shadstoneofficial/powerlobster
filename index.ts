
import { powerLobsterChannel } from './src/channel';
export { getTools } from './src/tools';

export default function(api: any) {
  api.registerChannel({ plugin: powerLobsterChannel });
}
