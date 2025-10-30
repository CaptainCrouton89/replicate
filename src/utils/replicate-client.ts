import Replicate from 'replicate';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { readToken } from './config-manager.js';

let client: Replicate | null = null;

/**
 * Get API token from multiple sources in priority order:
 * 1. Config file (~/.config/replicate/config)
 * 2. Environment variable (REPLICATE_API_TOKEN)
 * 3. .env.local / .env files
 */
export function getApiToken(): string | null {
  // 1. Check config file first
  const configToken = readToken();
  if (configToken) {
    return configToken;
  }

  // 2. Check environment variable
  if (process.env.REPLICATE_API_TOKEN) {
    return process.env.REPLICATE_API_TOKEN;
  }

  // 3. Load from .env files
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  } else {
    dotenv.config();
  }

  return process.env.REPLICATE_API_TOKEN || null;
}

/**
 * Get the Replicate client instance
 * Returns null if no API token is available
 */
export function getReplicateClient(): Replicate | null {
  if (client) {
    return client;
  }

  const apiToken = getApiToken();
  if (!apiToken) {
    return null;
  }

  client = new Replicate({
    auth: apiToken,
  });

  return client;
}

/**
 * Reset the client singleton (useful after token changes)
 */
export function resetClient(): void {
  client = null;
}

