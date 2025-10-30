import { Args, Command, Flags } from '@oclif/core';
import { readToken, getConfigPath } from '../../utils/config-manager.js';

export default class ConfigGet extends Command {
  static description = 'Show configuration values';

  static args = {
    key: Args.string({
      description: 'Configuration key to display (optional)',
      required: false,
    }),
  };

  static flags = {
    json: Flags.boolean({
      char: 'j',
      description: 'Output as JSON',
    }),
  };

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> token',
    '<%= config.bin %> <%= command.id %> --json',
  ];

  async run() {
    const { args, flags } = await this.parse(ConfigGet);

    const token = readToken();

    if (args.key) {
      // Show specific key
      if (args.key !== 'token') {
        this.error('Currently only "token" is a supported configuration key');
      }

      if (!token) {
        this.log('No token configured.');
        return;
      }

      if (flags.json) {
        this.log(JSON.stringify({ token: `${token.substring(0, 8)}...` }, null, 2));
      } else {
        this.log(`token = ${token.substring(0, 8)}...`);
      }
    } else {
      // Show all config
      const config: Record<string, string> = {};

      if (token) {
        config.token = `${token.substring(0, 8)}...`;
      }

      if (flags.json) {
        this.log(JSON.stringify(config, null, 2));
      } else {
        this.log(`\nConfiguration (${getConfigPath()}):\n`);
        if (Object.keys(config).length === 0) {
          this.log('  No configuration values set.');
        } else {
          for (const [key, value] of Object.entries(config)) {
            this.log(`  ${key} = ${value}`);
          }
        }
        this.log('');
      }
    }
  }
}
