import { Command } from '@oclif/core';
import Replicate from 'replicate';
import { getReplicateClient, resetClient } from './replicate-client.js';
import { writeToken, deleteToken } from './config-manager.js';
import { prompt } from './prompt.js';

export abstract class BaseCommand extends Command {
  /**
   * Get an authenticated Replicate client
   * If no token is available, prompts the user interactively
   */
  protected async getClient(): Promise<Replicate> {
    let client = getReplicateClient();

    // If no client (no token), prompt for authentication
    if (!client) {
      await this.promptForAuthentication();
      client = getReplicateClient();

      if (!client) {
        this.error('Failed to initialize Replicate client after authentication');
      }
    }

    return client;
  }

  /**
   * Prompt the user to enter their API token
   */
  protected async promptForAuthentication(): Promise<void> {
    this.log('\n🔑 No API token found.');
    this.log('Get your API token from: https://replicate.com/account/api-tokens\n');

    const token = await prompt('Enter your API token', { hide: true });

    // Save the token to config
    writeToken(token);
    resetClient(); // Reset client to pick up new token

    this.log('✓ Token saved successfully!\n');
  }

  /**
   * Handle authentication errors (401/403)
   * Clears the stored token and re-prompts the user
   */
  protected async handleAuthError(error: any): Promise<void> {
    // Check if this is an authentication error
    const isAuthError =
      error?.response?.status === 401 ||
      error?.response?.status === 403 ||
      error?.message?.toLowerCase().includes('unauthorized') ||
      error?.message?.toLowerCase().includes('authentication') ||
      error?.message?.toLowerCase().includes('invalid token');

    if (!isAuthError) {
      throw error; // Re-throw if not an auth error
    }

    // Clear the invalid token
    this.warn('Invalid or expired API token');
    deleteToken();
    resetClient();

    // Re-prompt for authentication
    await this.promptForAuthentication();
  }
}

