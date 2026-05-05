import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { password } from '@inquirer/prompts';

export const CONFIG_DIR = join(homedir(), '.gitsmith');
export const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

export async function load() {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    if (err instanceof SyntaxError) {
      throw new Error(
        `config file at ${CONFIG_PATH} is corrupted (${err.message}). Delete it and re-run.`,
      );
    }
    throw err;
  }
}

export async function save(config) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  try {
    await chmod(CONFIG_PATH, 0o600);
  } catch {
    // chmod is a no-op on Windows; non-fatal
  }
}

export async function getApiKey() {
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }
  const config = await load();
  if (config.anthropicApiKey) {
    return config.anthropicApiKey;
  }
  if (!process.stdin.isTTY) {
    throw new Error(
      'No Anthropic API key found. Set ANTHROPIC_API_KEY or run gitsmith interactively once to configure it.',
    );
  }
  console.log('Looks like this is your first run.');
  console.log(
    'Gitsmith needs an Anthropic API key — get one at https://console.anthropic.com/settings/keys',
  );
  console.log();
  const entered = await password({
    message: 'Anthropic API key:',
    mask: '*',
    validate: (v) => {
      const t = v?.trim() ?? '';
      if (!t) return 'Key cannot be empty';
      if (t.length < 20) return 'Key looks too short — paste the full key';
      return true;
    },
  });
  const key = entered.trim();
  await save({ ...config, anthropicApiKey: key });
  console.log(`✓ Saved to ${CONFIG_PATH}\n`);
  return key;
}
