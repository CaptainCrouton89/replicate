import { Args, Command } from '@oclif/core';
import { writeToken, getConfigPath } from '../../utils/config-manager.js';
import { resetClient } from '../../utils/replicate-client.js';

export default class ConfigSet extends Command {
  static description = 'Set configuration value';

  static args = {
    key: Args.string({
      description: 'Configuration key (currently only "token" is supported)',
      required: true,
    }),
    value: Args.string({
      description: 'Configuration value',
      required: true,
    }),
  };

  static examples = [
    '<%= config.bin %> <%= command.id %> token r8_your_token_here',
  ];

  async run() {
    const { args } = await this.parse(ConfigSet);

    if (args.key !== 'token') {
      this.error('Currently only "token" is a supported configuration key');
    }

    if (!args.value || args.value.trim().length === 0) {
      this.error('Value cannot be empty');
    }

    writeToken(args.value.trim());
    resetClient();

    this.log(`\n✓ Configuration updated`);
    this.log(`Config file: ${getConfigPath()}`);
    this.log(`Set ${args.key} = ${args.value.substring(0, 8)}...\n`);
  }
}
