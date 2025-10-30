import { Flags } from '@oclif/core';
import { BaseCommand } from '../../utils/command-base.js';

export default class PredictionsList extends BaseCommand {
  static description = 'List your prediction history';

  static flags = {
    json: Flags.boolean({
      char: 'j',
      description: 'Output results as JSON',
    }),
    limit: Flags.integer({
      char: 'l',
      description: 'Maximum number of predictions to return',
      default: 20,
    }),
  };

  async run() {
    const { flags } = await this.parse(PredictionsList);
    const replicate = this.getClient();

    try {
      const predictions = await replicate.predictions.list();

      // Limit results on the client side since API doesn't support limit parameter
      const results = predictions.results.slice(0, flags.limit);

      if (flags.json) {
        this.log(JSON.stringify(results, null, 2));
        return;
      }

      if (results.length === 0) {
        this.log('No predictions found.');
        return;
      }

      this.log(`\nYour Predictions (showing ${results.length}):\n`);
      for (const prediction of results) {
        const id = prediction.id || 'N/A';
        const status = prediction.status || 'N/A';
        const model = prediction.model || 'N/A';
        const created = prediction.created_at
          ? new Date(prediction.created_at).toLocaleString()
          : 'N/A';

        this.log(`${id}`);
        this.log(`  Model: ${model}`);
        this.log(`  Status: ${status}`);
        this.log(`  Created: ${created}`);
        this.log('');
      }
    } catch (error: any) {
      this.error(`Failed to list predictions: ${error.message}`);
    }
  }
}

