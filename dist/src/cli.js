"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSetupCli = void 0;
const registerSetupCli = (ctx) => {
    const cmd = ctx.program.command('powerlobster');
    cmd.command('setup')
        .description('Interactive setup for PowerLobster channel')
        .action(async () => {
        const p = await Promise.resolve().then(() => __importStar(require('@clack/prompts')));
        p.intro('🦞 PowerLobster Setup Wizard');
        // Step 1: Credentials
        const hasToken = await p.confirm({ message: 'Do you have an install token?' });
        if (p.isCancel(hasToken)) {
            p.cancel('Cancelled');
            process.exit(0);
        }
        let apiKey, relayId, relayApiKey;
        let deliveryMode = 'poll';
        let webhookUrl = '';
        if (hasToken) {
            const token = await p.text({ message: 'Paste your token:' });
            if (p.isCancel(token)) {
                p.cancel('Cancelled');
                process.exit(0);
            }
            try {
                const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
                apiKey = decoded.apiKey;
                relayId = decoded.relayId;
                relayApiKey = decoded.relayApiKey;
                if (decoded.deliveryMode)
                    deliveryMode = decoded.deliveryMode;
                if (decoded.webhookUrl)
                    webhookUrl = decoded.webhookUrl;
                p.note('Token parsed successfully!', 'Success');
            }
            catch (e) {
                p.note('Invalid token format.', 'Error');
                return;
            }
        }
        else {
            apiKey = await p.text({ message: 'Enter PowerLobster API Key:' });
            if (p.isCancel(apiKey)) {
                p.cancel('Cancelled');
                process.exit(0);
            }
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
                    }
                    else {
                        throw new Error('Relay credentials not found in response');
                    }
                }
                else {
                    throw new Error(`API Error: ${response.status} ${response.statusText}`);
                }
            }
            catch (err) {
                s.stop('Could not auto-fetch relay credentials.');
                console.error(err);
                p.note('Auto-fetch failed. Please enter details manually.', 'Error');
                relayId = await p.text({ message: 'Enter Relay ID:' });
                if (p.isCancel(relayId)) {
                    p.cancel('Cancelled');
                    process.exit(0);
                }
                relayApiKey = await p.text({ message: 'Enter Relay API Key:' });
                if (p.isCancel(relayApiKey)) {
                    p.cancel('Cancelled');
                    process.exit(0);
                }
            }
        }
        // Step 2: Delivery Mode
        if (!webhookUrl) {
            const usePush = await p.confirm({ message: 'Do you have a webhook URL for push mode?' });
            if (p.isCancel(usePush)) {
                p.cancel('Cancelled');
                process.exit(0);
            }
            if (usePush) {
                deliveryMode = 'push';
                const url = await p.text({ message: 'Enter webhook URL:' });
                if (p.isCancel(url)) {
                    p.cancel('Cancelled');
                    process.exit(0);
                }
                webhookUrl = url;
            }
            else {
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
        }
        catch (err) {
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
exports.registerSetupCli = registerSetupCli;
