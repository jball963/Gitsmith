import Anthropic from '@anthropic-ai/sdk';

import * as config from './config.js';

export const MODELS = {
  READMESTALENESS: 'claude-opus-4-7',
  COMMIT_MESSAGE: 'claude-haiku-4-5-20251001',
};

let _client;
async function getClient() {
  if (_client) return _client;
  const apiKey = await config.getApiKey();
  _client = new Anthropic({ apiKey });
  return _client;
}

const PROPOSE_PATCH_TOOL = {
  name: 'propose_readme_patch',
  description:
    'Report whether the staged diff makes the README stale, and if so, the smallest patch that re-syncs it.',
  input_schema: {
    type: 'object',
    properties: {
      stale: {
        type: 'boolean',
        description:
          'true only if the diff changes user-facing behaviour the README documents.',
      },
      before: {
        type: 'string',
        description:
          'Exact substring of the current README that is now wrong. Must occur exactly once. Omit if stale is false.',
      },
      after: {
        type: 'string',
        description: 'Replacement for "before". Omit if stale is false.',
      },
      reasoning: {
        type: 'string',
        description: 'One short sentence explaining the staleness. Omit if stale is false.',
      },
    },
    required: ['stale'],
  },
};

const STALENESS_INSTRUCTION =
  'You inspect a staged git diff against the current README. ' +
  'If the diff changes, removes, or extends user-facing behaviour that the README documents (commands, flags, install steps, examples, supported features), propose the smallest substring replacement that brings the README back in sync. ' +
  'Do not flag staleness for refactors, internal changes, formatting, or anything not visible to a reader of the README. ' +
  'Always respond by calling the propose_readme_patch tool.';

const COMMIT_INSTRUCTION =
  'Write a conventional git commit message for the staged diff. ' +
  'First line: short imperative summary, no trailing period, ideally under 72 chars. ' +
  'If a body adds value, leave a blank line then 1-3 short sentences on the why or notable details. ' +
  'Output only the commit message — no preamble, no code fences, no quoting.';

export async function proposeReadmePatch({
  diff,
  readme,
  model = MODELS.READMESTALENESS,
}) {
  const client = await getClient();
  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: `Current README:\n\n${readme}`,
        cache_control: { type: 'ephemeral' },
      },
      { type: 'text', text: STALENESS_INSTRUCTION },
    ],
    tools: [PROPOSE_PATCH_TOOL],
    tool_choice: { type: 'tool', name: PROPOSE_PATCH_TOOL.name },
    messages: [{ role: 'user', content: `Staged diff:\n\n${diff}` }],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse) throw new Error('Claude did not return a tool call');
  const { stale, before, after, reasoning } = toolUse.input;
  if (!stale) return null;
  if (!before || !after) {
    throw new Error('Claude flagged staleness but omitted before/after');
  }
  return { before, after, reasoning, usage: response.usage };
}

export async function proposeCommitMessage({
  diff,
  readme,
  readmePatchSummary,
  model = MODELS.COMMIT_MESSAGE,
}) {
  const system = readme
    ? [
        {
          type: 'text',
          text: `Current README:\n\n${readme}`,
          cache_control: { type: 'ephemeral' },
        },
        { type: 'text', text: COMMIT_INSTRUCTION },
      ]
    : COMMIT_INSTRUCTION;

  const userText = readmePatchSummary
    ? `Staged diff:\n\n${diff}\n\nThe README was also patched: ${readmePatchSummary}`
    : `Staged diff:\n\n${diff}`;

  const client = await getClient();
  const response = await client.messages.create({
    model,
    max_tokens: 512,
    system,
    messages: [{ role: 'user', content: userText }],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  return { message: text, usage: response.usage };
}
