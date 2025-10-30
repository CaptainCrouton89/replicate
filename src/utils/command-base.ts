import { Command } from '@oclif/core';
import { getReplicateClient } from './replicate-client.js';

export abstract class BaseCommand extends Command {
  protected getClient() {
    return getReplicateClient();
  }
}

