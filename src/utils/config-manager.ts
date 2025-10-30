import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface Config {
  token?: string;
}

/**
 * Get the path to the config directory
 */
export function getConfigDir(): string {
  // Use XDG config directory on Linux, ~/.config on macOS, %LOCALAPPDATA% on Windows
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, 'replicate');
}

/**
 * Get the path to the config file
 */
export function getConfigPath(): string {
  return path.join(getConfigDir(), 'config');
}

/**
 * Ensure the config directory exists
 */
function ensureConfigDir(): void {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Read the entire config file
 */
export function readConfig(): Config {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    // If config file is corrupted, return empty config
    return {};
  }
}

/**
 * Write the entire config file
 */
export function writeConfig(config: Config): void {
  ensureConfigDir();
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Read the API token from the config file
 */
export function readToken(): string | null {
  const config = readConfig();
  return config.token || null;
}

/**
 * Save the API token to the config file
 */
export function writeToken(token: string): void {
  const config = readConfig();
  config.token = token;
  writeConfig(config);
}

/**
 * Delete the API token from the config file
 */
export function deleteToken(): void {
  const config = readConfig();
  delete config.token;
  writeConfig(config);
}

/**
 * Check if a token exists in the config
 */
export function hasToken(): boolean {
  return readToken() !== null;
}
