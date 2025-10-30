import { Command, Flags } from '@oclif/core';
import { getApiToken } from '../../utils/replicate-client.js';

export default class AuthWhoami extends Command {
  static description = 'Show currently authenticated account information';

  static flags = {
    json: Flags.boolean({
      char: 'j',
      description: 'Output as JSON',
    }),
  };

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ];

  async run() {
    const { flags } = await this.parse(AuthWhoami);

    const token = getApiToken();

    if (!token) {
      this.error('Not authenticated. Run "replicate auth:login" to authenticate.');
    }

    try {
      // Make an API call to get account information
      // The Replicate API doesn't have a dedicated /me or /account endpoint,
      // so we'll use a simple API call to verify the token and show basic info
      const response = await fetch('https://api.replicate.com/v1/account', {
        headers: {
          'Authorization': `Token ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.error('Invalid or expired API token. Run "replicate auth:login" to authenticate.');
        }
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const account = await response.json() as any;

      if (flags.json) {
        this.log(JSON.stringify(account, null, 2));
        return;
      }

      this.log('\n✓ Authenticated');
      if (account.username) {
        this.log(`Username: ${account.username}`);
      }
      if (account.github_login) {
        this.log(`GitHub: ${account.github_login}`);
      }
      if (account.type) {
        this.log(`Account Type: ${account.type}`);
      }
      this.log(`\nToken: ${token.substring(0, 8)}...`);
      this.log('');
    } catch (error: any) {
      this.error(`Failed to get account information: ${error.message}`);
    }
  }
}
