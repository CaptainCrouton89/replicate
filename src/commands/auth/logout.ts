import { Command } from '@oclif/core';
import { deleteToken, hasToken, getConfigPath } from '../../utils/config-manager.js';
import { resetClient } from '../../utils/replicate-client.js';
import { confirm } from '../../utils/prompt.js';

export default class AuthLogout extends Command {
  static description = 'Remove stored API token';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ];

  async run() {
    if (!hasToken()) {
      this.log('No stored token found.');
      return;
    }

    const confirmed = await confirm('Are you sure you want to remove your stored API token?');

    if (!confirmed) {
      this.log('Logout cancelled.');
      return;
    }

    deleteToken();
    resetClient();

    this.log(`\n✓ Token removed from: ${getConfigPath()}`);
    this.log('You will need to authenticate again to use the CLI.\n');
  }
}
