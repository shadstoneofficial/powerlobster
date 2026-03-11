
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
            auth: 'plugin', // Allow external calls without OpenClaw token
            handler: async (req: any, res: any) => {
                // Ensure it's a POST
                if (req.method !== 'POST') {
                    res.statusCode = 405;
                    res.end('Method Not Allowed');
                    return true;
                }
                
                try {
                    await powerLobsterChannel.handleWebhook(req);
                    res.statusCode = 200;
                    res.end(JSON.stringify({ status: 'received' }));
                    return true;
                } catch (err: any) {
                    console.error('[PowerLobster] Webhook error:', err);
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: err.message }));
                    return true;
                }
            }
        });
        console.log('[PowerLobster] Registered webhook route: /powerlobster/webhook');
    } else {
        console.warn('[PowerLobster] api.registerHttpRoute not available. Webhook mode may not work.');
    }
    
    // Register CLI command
    if (typeof api.registerCli === 'function') {
        api.registerCli((ctx: any) => {
            const cmd = ctx.program.command('powerlobster');
            
            cmd.command('setup')
                .description('Interactive setup for PowerLobster channel')
                .action(async () => {
                    const p = await import('@clack/prompts');
                    
                    p.intro('🦞 PowerLobster Setup Wizard');
                    
                    // Step 1: Credentials
                    const hasToken = await p.confirm({ message: 'Do you have an install token?' });
                    if (p.isCancel(hasToken)) { p.cancel('Cancelled'); process.exit(0); }
                    
                    let apiKey, relayId, relayApiKey;
                    let deliveryMode = 'poll';
                    let webhookUrl = '';
                    
                    if (hasToken) {
                        const token = await p.text({ message: 'Paste your token:' });
                        if (p.isCancel(token)) { p.cancel('Cancelled'); process.exit(0); }
                        
                        try {
                            const decoded = JSON.parse(Buffer.from(token as string, 'base64').toString('utf-8'));
                            apiKey = decoded.apiKey;
                            relayId = decoded.relayId;
                            relayApiKey = decoded.relayApiKey;
                            if (decoded.deliveryMode) deliveryMode = decoded.deliveryMode;
                            if (decoded.webhookUrl) webhookUrl = decoded.webhookUrl;
                            p.note('Token parsed successfully!', 'Success');
                        } catch (e) {
                            p.note('Invalid token format.', 'Error');
                            return;
                        }
                    } else {
                        apiKey = await p.text({ message: 'Enter PowerLobster API Key:' });
                        if (p.isCancel(apiKey)) { p.cancel('Cancelled'); process.exit(0); }
                        
                        relayId = await p.text({ message: 'Enter Relay ID:' });
                        if (p.isCancel(relayId)) { p.cancel('Cancelled'); process.exit(0); }
                        
                        relayApiKey = await p.text({ message: 'Enter Relay API Key:' });
                        if (p.isCancel(relayApiKey)) { p.cancel('Cancelled'); process.exit(0); }
                    }
                    
                    // Step 2: Delivery Mode
                    if (!webhookUrl) {
                        const usePush = await p.confirm({ message: 'Do you have a webhook URL for push mode?' });
                        if (p.isCancel(usePush)) { p.cancel('Cancelled'); process.exit(0); }
                        
                        if (usePush) {
                            deliveryMode = 'push';
                            const url = await p.text({ message: 'Enter webhook URL:' });
                            if (p.isCancel(url)) { p.cancel('Cancelled'); process.exit(0); }
                            webhookUrl = url as string;
                        } else {
                            p.note('Using poll mode (default)', 'Info');
                        }
                    }
                    
                    // Step 3: Save Config
                    const accountConfig = {
                        apiKey,
                        relayId,
                        relayApiKey,
                        deliveryMode,
                        ...(webhookUrl ? { webhookUrl } : {})
                    };
                    
                    try {
                        // Load fresh config
                        const config = await api.runtime.config.loadConfig();
                        
                        // Mutate config
                        config.channels = config.channels || {};
                        config.channels.powerlobster = {
                            instances: [{
                                id: 'main',
                                config: accountConfig
                            }]
                        };
                        
                        // Write config
                        await api.runtime.config.writeConfigFile(config);
                        
                        p.note('Skills loaded: 5', 'Info');
                        p.outro('✅ Configuration saved! Try sending a DM to test.');
                    } catch (err) {
                        p.note('Could not auto-save config. Please check permissions.', 'Error');
                        console.error(err);
                    }
                });
        });
    }
  },
};

export default plugin;
