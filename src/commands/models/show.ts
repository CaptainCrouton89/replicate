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

  async run() {
    const { args } = await this.parse(ModelsShow);
    const replicate = this.getClient();

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
    } catch (error: any) {
      this.error(`Failed to get model details: ${error.message}`);
    }
  }
}

