import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../utils/command-base.js';
import { parseInputArgs, validateInput } from '../utils/argument-parser.js';

export default class Run extends BaseCommand {
  static description = 'Quick command to create a prediction (alias for predictions:create)';

  static strict = false; // Allow arbitrary flags for model parameters

  static args = {
    model: Args.string({
      description: 'Model name in format owner/model-name',
      required: true,
    }),
  };

  static flags = {
    'input-file': Flags.string({
      description: 'Path to JSON file containing input parameters',
    }),
    json: Flags.boolean({
      char: 'j',
      description: 'Output result as JSON',
      default: false,
    }),
    wait: Flags.boolean({
      char: 'w',
      description: 'Wait for prediction to complete and return output',
      default: false,
    }),
  };

  static examples = [
    {
      description: 'Create prediction with input file',
      command: '<%= config.bin %> <%= command.id %> owner/model --input-file=input.json',
    },
    {
      description: 'Create and wait for completion',
      command: '<%= config.bin %> <%= command.id %> owner/model --input-file=input.json --wait',
    },
    {
      description: 'Pass model parameters directly',
      command: '<%= config.bin %> <%= command.id %> owner/model --prompt="a cat" --width=512',
    },
    {
      description: 'Wait and get JSON output only',
      command: '<%= config.bin %> <%= command.id %> owner/model --wait --json --prompt="a dog"',
    },
  ];

  async run(): Promise<void> {
    const { args, flags, argv } = await this.parse(Run);
    const replicate = await this.getClient();

    try {
      // Split model identifier into owner and name
      const [modelOwner, modelName] = args.model.split('/');
      if (!modelOwner || !modelName) {
        this.error('Model must be in format: owner/model-name');
      }

      // Get model and its latest version
      const model = await replicate.models.get(modelOwner, modelName);
      if (!model.latest_version) {
        this.error('Model has no published versions');
      }

      const latestVersion = await replicate.models.versions.get(
        modelOwner,
        modelName,
        model.latest_version.id
      );

      const schema = latestVersion.openapi_schema as any;
      const inputSchema = schema?.components?.schemas?.Input || {};

      // Parse input arguments
      const inputArgs: string[] = [];
      if (flags['input-file']) {
        inputArgs.push(`--input-file=${flags['input-file']}`);
      }
      // Add all remaining argv items (dynamic model arguments)
      inputArgs.push(...(argv as string[]));

      const input = parseInputArgs(inputArgs);

      // Validate input against schema
      const validation = validateInput(input, inputSchema);
      if (!validation.valid) {
        this.error(`Input validation failed:\n${validation.errors.join('\n')}`);
      }

      if (!flags.json) {
        this.log(`Creating prediction for ${args.model}...`);
      }

      // Create the prediction using model identifier
      let prediction = await replicate.predictions.create({
        model: args.model,
        input,
      });

      // Wait for completion if requested
      if (flags.wait) {
        this.log(`\nPrediction created: ${prediction.id}`);
        this.log(`Waiting for completion...`);

        prediction = await replicate.wait(prediction);

        if (prediction.status === 'succeeded') {
          if (flags.json) {
            this.log(JSON.stringify(prediction.output, null, 2));
          } else {
            this.log(`\nPrediction completed successfully!`);
            this.log(`\nOutput:`);
            this.log(JSON.stringify(prediction.output, null, 2));
          }
        } else if (prediction.status === 'failed') {
          this.error(`Prediction failed: ${prediction.error || 'Unknown error'}`);
        } else if (prediction.status === 'canceled') {
          this.error('Prediction was canceled');
        }
      } else {
        // Return immediately without waiting
        if (flags.json) {
          this.log(JSON.stringify(prediction, null, 2));
        } else {
          this.log(`\nPrediction created successfully!`);
          this.log(`ID: ${prediction.id}`);
          this.log(`Status: ${prediction.status}`);
          this.log(`\nUse "replicate predictions:get ${prediction.id}" to check status.`);
        }
      }
    } catch (error: any) {
      try {
        await this.handleAuthError(error);
        // If auth error was handled, retry the operation
        return this.run();
      } catch {
        // Not an auth error, show original error
        this.error(`Failed to create prediction: ${error.message}`);
      }
    }
  }
}
