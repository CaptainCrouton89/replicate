import { Flags } from '@oclif/core';
import { BaseCommand } from '../../utils/command-base.js';

export default class ModelsList extends BaseCommand {
  static description = 'List available models';

  static flags = {
    search: Flags.string({
      char: 's',
      description: 'Search for models by name or description',
    }),
    json: Flags.boolean({
      char: 'j',
      description: 'Output results as JSON',
    }),
  };

  async run() {
    const { flags } = await this.parse(ModelsList);
    const replicate = this.getClient();

    try {
      const models = await replicate.models.list();

      let filteredModels = models.results;
      if (flags.search) {
        const searchLower = flags.search.toLowerCase();
        filteredModels = models.results.filter(
          (model) =>
            model.name?.toLowerCase().includes(searchLower) ||
            model.description?.toLowerCase().includes(searchLower) ||
            model.owner?.toLowerCase().includes(searchLower)
        );
      }

      if (flags.json) {
        this.log(JSON.stringify(filteredModels, null, 2));
        return;
      }

      if (filteredModels.length === 0) {
        this.log('No models found.');
        return;
      }

      // Format as table
      this.log('\nAvailable Models:\n');
      for (const model of filteredModels) {
        const name = model.name || 'N/A';
        const owner = model.owner || 'N/A';
        const description = model.description
          ? model.description.substring(0, 60) + (model.description.length > 60 ? '...' : '')
          : 'No description';
        this.log(`${owner}/${name}`);
        this.log(`  ${description}\n`);
      }

      if (models.next) {
        this.log(`\nNote: There are more models available. Use pagination for full results.`);
      }
    } catch (error: any) {
      this.error(`Failed to list models: ${error.message}`);
    }
  }
}

