import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../../utils/command-base.js';

export default class PredictionsGet extends BaseCommand {
  static description = 'Get prediction status and results';

  static args = {
    id: Args.string({
      description: 'Prediction ID',
      required: true,
    }),
  };

  static flags = {
    json: Flags.boolean({
      char: 'j',
      description: 'Output result as JSON',
    }),
    watch: Flags.boolean({
      char: 'w',
      description: 'Watch prediction until completion',
    }),
  };

  async run() {
    const { args, flags } = await this.parse(PredictionsGet);
    const replicate = this.getClient();

    try {
      let prediction = await replicate.predictions.get(args.id);

      if (flags.watch) {
        // Poll until completion
        while (prediction.status === 'starting' || prediction.status === 'processing') {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          prediction = await replicate.predictions.get(args.id);
          if (!flags.json) {
            process.stdout.write(`\rStatus: ${prediction.status}...`);
          }
        }
        if (!flags.json) {
          process.stdout.write('\n');
        }
      }

      if (flags.json) {
        this.log(JSON.stringify(prediction, null, 2));
        return;
      }

      this.log(`\nPrediction: ${args.id}`);
      this.log(`Status: ${prediction.status}`);
      this.log(`Model: ${prediction.model || 'N/A'}`);
      this.log(`Version: ${prediction.version || 'N/A'}`);
      this.log(`Created: ${prediction.created_at || 'N/A'}`);

      if (prediction.input) {
        this.log(`\nInput:`);
        this.log(JSON.stringify(prediction.input, null, 2));
      }

      if (prediction.output) {
        this.log(`\nOutput:`);
        if (typeof prediction.output === 'string') {
          this.log(prediction.output);
        } else {
          this.log(JSON.stringify(prediction.output, null, 2));
        }
      }

      if (prediction.error) {
        this.log(`\nError: ${prediction.error}`);
      }

      if (prediction.logs) {
        this.log(`\nLogs:`);
        this.log(prediction.logs);
      }

      this.log('');
    } catch (error: any) {
      this.error(`Failed to get prediction: ${error.message}`);
    }
  }
}

