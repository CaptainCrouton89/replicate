import { Args } from '@oclif/core';
import { BaseCommand } from '../../utils/command-base.js';

export default class ModelsShow extends BaseCommand {
  static description = 'Show model details and input schema';

  static args = {
    model: Args.string({
      description: 'Model name in format owner/model-name',
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(ModelsShow);
    const replicate = await this.getClient();

    try {
      // Split model identifier into owner and name
      const [modelOwner, modelName] = args.model.split('/');
      if (!modelOwner || !modelName) {
        this.error('Model must be in format: owner/model-name');
      }

      const model = await replicate.models.get(modelOwner, modelName);
      const latestVersion = await replicate.models.versions.get(
        modelOwner,
        modelName,
        model.latest_version?.id || ''
      );

      this.log(`\nModel: ${args.model}`);
      this.log(`Description: ${model.description || 'No description'}`);
      this.log(`Visibility: ${model.visibility || 'N/A'}`);
      this.log(`Latest Version: ${model.latest_version?.id || 'N/A'}\n`);

      const schema = latestVersion.openapi_schema as any;
      if (schema?.components?.schemas?.Input?.properties) {
        const inputSchema = schema.components.schemas.Input.properties;
        const requiredFields = schema.components.schemas.Input.required || [];

        this.log('Input Schema:\n');
        for (const [key, value] of Object.entries(inputSchema)) {
          const field = value as any;
          const isRequired = requiredFields.includes(key);
          const type = field.type || 'unknown';
          const description = field.description || 'No description';
          const defaultValue = field.default !== undefined ? ` (default: ${field.default})` : '';

          this.log(`  ${isRequired ? '*' : ' '} ${key} (${type})${defaultValue}`);
          this.log(`    ${description}`);

          if (field.enum) {
            this.log(`    Options: ${field.enum.join(', ')}`);
          }
          if (field.minimum !== undefined || field.maximum !== undefined) {
            const min = field.minimum !== undefined ? `min: ${field.minimum}` : '';
            const max = field.maximum !== undefined ? `max: ${field.maximum}` : '';
            this.log(`    Range: ${[min, max].filter(Boolean).join(', ')}`);
          }
          this.log('');
        }

        if (requiredFields.length > 0) {
          this.log('\n* Required field\n');
        }
      } else {
        this.log('No input schema available for this model.\n');
      }

      // Add helpful next steps
      this.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      this.log('Next Steps:\n');

      if (schema?.components?.schemas?.Input?.properties) {
        const inputSchema = schema.components.schemas.Input.properties;
        const requiredFields = schema.components.schemas.Input.required || [];

        // Generate example JSON
        const exampleInput: any = {};
        for (const [key, value] of Object.entries(inputSchema)) {
          const field = value as any;
          if (requiredFields.includes(key)) {
            if (field.type === 'string') {
              exampleInput[key] = field.example || field.default || `"your-${key}-here"`;
            } else if (field.type === 'number' || field.type === 'integer') {
              exampleInput[key] = field.default || field.minimum || 1;
            } else if (field.type === 'boolean') {
              exampleInput[key] = field.default !== undefined ? field.default : true;
            } else if (field.type === 'array') {
              exampleInput[key] = field.default || [];
            }
          }
        }

        this.log('1. Create a prediction using inline parameters:\n');
        this.log('   replicate predictions:create ' + args.model + ' --wait \\');

        // Show inline parameter examples for required fields
        const inlineParams = requiredFields
          .map((field: string) => {
            const fieldDef = (inputSchema as any)[field];
            if (fieldDef.type === 'string') {
              const example = fieldDef.example || fieldDef.default || `your-${field}-here`;
              return `--${field}="${example}"`;
            } else if (fieldDef.type === 'number' || fieldDef.type === 'integer') {
              const example = fieldDef.default || fieldDef.minimum || 1;
              return `--${field}=${example}`;
            } else if (fieldDef.type === 'boolean') {
              return `--${field}=${fieldDef.default !== undefined ? fieldDef.default : 'true'}`;
            }
            return `--${field}=<value>`;
          })
          .join(' \\\n       ');

        if (inlineParams) {
          this.log('       ' + inlineParams);
        }

        this.log('\n2. Or create an input.json file:\n');
        this.log('   ' + JSON.stringify(exampleInput, null, 2).split('\n').join('\n   '));
        this.log('\n   Then run:');
        this.log('   replicate predictions:create ' + args.model + ' --input-file=input.json --wait');
      } else {
        this.log('   replicate predictions:create ' + args.model + ' --wait');
      }

      this.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    } catch (error: any) {
      try {
        await this.handleAuthError(error);
        // If auth error was handled, retry the operation
        return this.run();
      } catch {
        // Not an auth error, show original error
        this.error(`Failed to get model details: ${error.message}`);
      }
    }
  }
}

