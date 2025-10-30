import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../../utils/command-base.js';
import { parseInputArgs, validateInput } from '../../utils/argument-parser.js';

export default class PredictionsCreate extends BaseCommand {
  static description = 'Create a new prediction';

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
      description: 'Pass model parameters directly (use -- separator)',
      command: '<%= config.bin %> <%= command.id %> owner/model -- --prompt="a cat" --width=512',
    },
    {
      description: 'Wait and get JSON output only',
      command: '<%= config.bin %> <%= command.id %> owner/model --wait --json -- --prompt="a dog"',
    },
  ];

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
    }),
    wait: Flags.boolean({
      char: 'w',
      description: 'Wait for prediction to complete and return output',
      default: false,
    }),
  };

  static strict = false; // Allow unknown flags for dynamic model arguments

  async run(): Promise<void> {
    // Parse with strict=false to allow unknown flags
    const { args, flags, argv } = await this.parse(PredictionsCreate);
    const replicate = await this.getClient();

    try {
      // Split model identifier into owner and name
      const [modelOwner, modelName] = args.model.split('/');
      if (!modelOwner || !modelName) {
        this.error('Model must be in format: owner/model-name');
      }

      // Get model and version info to fetch schema
      const model = await replicate.models.get(modelOwner, modelName);
      const latestVersion = await replicate.models.versions.get(
        modelOwner,
        modelName,
        model.latest_version?.id || ''
      );

      const schema = latestVersion.openapi_schema as any;
      const inputSchema = schema?.components?.schemas?.Input || {};

      // Parse input arguments
      // argv contains all remaining arguments after parsing known flags
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

      // Create prediction using model identifier
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

