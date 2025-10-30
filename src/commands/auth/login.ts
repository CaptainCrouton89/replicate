import { Command } from '@oclif/core';
import { writeToken, getConfigPath } from '../../utils/config-manager.js';
import { resetClient } from '../../utils/replicate-client.js';
import { prompt } from '../../utils/prompt.js';

export default class AuthLogin extends Command {
  static description = 'Authenticate with your Replicate API token';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ];

  async run() {
    this.log('\n🔑 Replicate Authentication');
    this.log('Get your API token from: https://replicate.com/account/api-tokens\n');

    const token = await prompt('Enter your API token', { hide: true });

    if (!token || token.trim().length === 0) {
      this.error('Token cannot be empty');
    }

    // Save the token to config
    writeToken(token.trim());
    resetClient(); // Reset client to pick up new token

    this.log(`\n✓ Authentication successful!`);
    this.log(`Token saved to: ${getConfigPath()}\n`);
  }
}
