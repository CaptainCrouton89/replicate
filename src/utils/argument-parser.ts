import * as fs from 'fs';
import * as path from 'path';

export interface ParsedInput {
  [key: string]: any;
}

/**
 * Parse CLI arguments into an input object for Replicate predictions
 * Supports:
 * - --key=value pairs
 * - --input-file=path/to/file.json for complex inputs
 */
export function parseInputArgs(args: string[]): ParsedInput {
  const input: ParsedInput = {};
  let inputFile: string | null = null;

  // First, check for input-file flag
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--input-file=')) {
      inputFile = args[i].split('=')[1];
      break;
    } else if (args[i] === '--input-file' && i + 1 < args.length) {
      inputFile = args[i + 1];
      break;
    }
  }

  // If input file is provided, load it
  if (inputFile) {
    const filePath = path.resolve(inputFile);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Input file not found: ${filePath}`);
    }
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    try {
      const fileInput = JSON.parse(fileContent);
      Object.assign(input, fileInput);
    } catch (error) {
      throw new Error(`Invalid JSON in input file: ${error}`);
    }
  }

  // Parse --key=value pairs (these will override file values)
  for (const arg of args) {
    if (arg.startsWith('--') && arg.includes('=') && !arg.startsWith('--input-file=')) {
      const [key, ...valueParts] = arg.substring(2).split('=');
      const value = valueParts.join('='); // Handle values that might contain '='

      // Try to parse as JSON first, fallback to string
      let parsedValue: any = value;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        // Not JSON, check if it's a number or boolean
        if (value === 'true') {
          parsedValue = true;
        } else if (value === 'false') {
          parsedValue = false;
        } else if (value === 'null') {
          parsedValue = null;
        } else if (!isNaN(Number(value)) && value.trim() !== '') {
          parsedValue = Number(value);
        }
      }

      input[key] = parsedValue;
    }
  }

  return input;
}

/**
 * Validate input against model schema
 */
export function validateInput(
  input: ParsedInput,
  schema: any
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const properties = schema?.properties || {};
  const required = schema?.required || [];

  // Check required fields
  for (const field of required) {
    if (!(field in input) || input[field] === undefined || input[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate field types
  for (const [key, value] of Object.entries(input)) {
    if (!(key in properties)) {
      // Warn but don't error - models might accept extra fields
      continue;
    }

    const fieldSchema = properties[key];
    const fieldType = fieldSchema.type;

    if (fieldType === 'integer' || fieldType === 'number') {
      if (typeof value !== 'number') {
        errors.push(`Field ${key} must be a number, got ${typeof value}`);
      }
      if (fieldSchema.minimum !== undefined && value < fieldSchema.minimum) {
        errors.push(`Field ${key} must be >= ${fieldSchema.minimum}`);
      }
      if (fieldSchema.maximum !== undefined && value > fieldSchema.maximum) {
        errors.push(`Field ${key} must be <= ${fieldSchema.maximum}`);
      }
    } else if (fieldType === 'string') {
      if (typeof value !== 'string') {
        errors.push(`Field ${key} must be a string, got ${typeof value}`);
      }
      if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
        errors.push(`Field ${key} must be one of: ${fieldSchema.enum.join(', ')}`);
      }
    } else if (fieldType === 'boolean') {
      if (typeof value !== 'boolean') {
        errors.push(`Field ${key} must be a boolean, got ${typeof value}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

