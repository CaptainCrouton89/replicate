import Replicate from 'replicate';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

let client: Replicate | null = null;

export function getReplicateClient(): Replicate {
  if (client) {
    return client;
  }

  // Load .env.local file
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  } else {
    // Also try loading default .env
    dotenv.config();
  }

  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) {
    throw new Error('REPLICATE_API_TOKEN not found in environment. Please set it in .env.local file.');
  }

  client = new Replicate({
    auth: apiToken,
  });

  return client;
}

