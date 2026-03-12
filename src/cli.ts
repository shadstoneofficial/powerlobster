import { PowerLobsterClient } from './client';

export const registerSetupCli = (ctx: any) => {
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
                
                // Auto-fetch logic using temporary client
                const s = p.spinner();
                s.start('Fetching agent details...');
                
                try {
                    // Fetch relay credentials from PowerLobster API
                    const response = await fetch('https://powerlobster.com/api/agent/me', {
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.user && data.user.relay_id && data.user.relay_api_key) {
                            relayId = data.user.relay_id;
                            relayApiKey = data.user.relay_api_key;
                            s.stop('Credentials fetched successfully!');
                        } else {
                            throw new Error('Relay credentials not found in response');
                        }
                    } else {
                        throw new Error(`API Error: ${response.status} ${response.statusText}`);
                    }
                } catch (err) {
                    s.stop('Could not auto-fetch relay credentials.');
                    console.error(err);
                    p.note('Auto-fetch failed. Please enter details manually.', 'Error');
                    
                    relayId = await p.text({ message: 'Enter Relay ID:' });
                    if (p.isCancel(relayId)) { p.cancel('Cancelled'); process.exit(0); }
                    
                    relayApiKey = await p.text({ message: 'Enter Relay API Key:' });
                    if (p.isCancel(relayApiKey)) { p.cancel('Cancelled'); process.exit(0); }
                }
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
                // Access config service - handle potential different API structures
                // Depending on OpenClaw version, config might be at:
                // ctx.runtime.config (standard)
                // ctx.config (older/cli context)
                // ctx.services.config (newer)
                
                const configService = ctx.runtime?.config || ctx.config || ctx.services?.config;
                
                if (!configService) {
                    throw new Error('Config service not found in CLI context');
                }

                // Load fresh config
                const config = await configService.loadConfig();
                
                // Mutate config
                config.channels = config.channels || {};
                config.channels.powerlobster = {
                    instances: [{
                        id: 'main',
                        config: accountConfig
                    }]
                };
                
                // Write config
                await configService.writeConfigFile(config);
                
                p.note('Skills loaded: 5', 'Info');
                p.outro('✅ Configuration saved! Try sending a DM to test.');
            } catch (err) {
                p.note('Could not auto-save config. Please check permissions.', 'Error');
                console.error(err);
                
                // Fallback: Print config for manual entry
                console.log('\nAdd this to your openclaw.json:');
                console.log(JSON.stringify({
                    channels: {
                        powerlobster: {
                            instances: [{
                                id: 'main',
                                config: accountConfig
                            }]
                        }
                    }
                }, null, 2));
            }
        });
};
