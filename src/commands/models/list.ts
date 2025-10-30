import { Flags } from '@oclif/core';
import { BaseCommand } from '../../utils/command-base.js';
import { getApiToken } from '../../utils/replicate-client.js';

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

  async run(): Promise<void> {
    const { flags } = await this.parse(ModelsList);
    const replicate = await this.getClient();

    try {
      let allModels: any[] = [];

      if (flags.search) {
        // Use the dedicated search API endpoint (faster than pagination)
        const apiToken = getApiToken();
        const searchQuery = encodeURIComponent(flags.search);

        const response = await fetch(
          `https://api.replicate.com/v1/search?query=${searchQuery}&limit=20`,
          {
            headers: {
              'Authorization': `Token ${apiToken}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Search failed: ${response.statusText}`);
        }

        const data = await response.json() as any;

        // Extract model objects from search results
        if (data.models && Array.isArray(data.models)) {
          allModels = data.models.map((item: any) => item.model);
        }
      } else {
        // No search - just return first page
        const page = await replicate.models.list();
        allModels = page.results;
      }

      if (flags.json) {
        this.log(JSON.stringify(allModels, null, 2));
        return;
      }

      if (allModels.length === 0) {
        this.log('No models found.');
        return;
      }

      // Format as table
      this.log('\nAvailable Models:\n');
      for (const model of allModels) {
        const name = model.name || 'N/A';
        const owner = model.owner || 'N/A';
        const description = model.description
          ? model.description.substring(0, 60) + (model.description.length > 60 ? '...' : '')
          : 'No description';
        this.log(`${owner}/${name}`);
        this.log(`  ${description}\n`);
      }
    } catch (error: any) {
      try {
        await this.handleAuthError(error);
        // If auth error was handled, retry the operation
        return this.run();
      } catch {
        // Not an auth error, show original error
        this.error(`Failed to list models: ${error.message}`);
      }
    }
  }
}

