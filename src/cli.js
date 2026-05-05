import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { confirm } from '@inquirer/prompts';

import * as git from './git.js';
import * as claude from './claude.js';
import * as readme from './readme.js';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const HELP = `Usage: gitsmith [options]

Drafts a commit message from your staged diff and patches your README
when the docs have drifted.

Options:
  -y, --yes          Non-interactive: accept proposed README patch and commit
      --no-readme    Skip the README sync for this commit
      --model <id>   Override the default Claude model
  -V, --version      Print version and exit
  -h, --help         Print this help and exit

Environment:
  ANTHROPIC_API_KEY  Required for the Claude calls
`;

export async function run(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      version: { type: 'boolean', short: 'V' },
      help: { type: 'boolean', short: 'h' },
      yes: { type: 'boolean', short: 'y' },
      'no-readme': { type: 'boolean' },
      model: { type: 'string' },
    },
    allowPositionals: false,
  });

  if (values.version) {
    console.log(`gitsmith ${pkg.version}`);
    return;
  }

  if (values.help) {
    process.stdout.write(HELP);
    return;
  }

  if (!values.yes && !process.stdin.isTTY) {
    throw new Error(
      'Non-interactive shell detected. Re-run with -y to skip prompts.',
    );
  }

  const ask = (message) =>
    values.yes ? Promise.resolve(true) : confirm({ message, default: true });

  await git.assertInRepo();
  let summary = await git.getStagedSummary();
  let didAutoStage = false;
  if (summary.files === 0) {
    const status = await git.getWorkingTreeStatus();
    if (status.length === 0) {
      console.log('Nothing to commit — your working tree is clean.');
      return;
    }
    console.log('Nothing staged — adding all working-tree changes:');
    for (const { code, path } of status) {
      console.log(`  ${code}  ${path}`);
    }
    console.log();
    await git.stageAll();
    didAutoStage = true;
    summary = await git.getStagedSummary();
  }
  const fileWord = summary.files === 1 ? 'file' : 'files';
  console.log(
    `Reading staged changes... (${summary.files} ${fileWord}, +${summary.insertions} −${summary.deletions})`,
  );

  const initialDiff = await git.getStagedDiff();
  const readmeDoc = values['no-readme'] ? null : await git.getCurrentReadme();

  let patch = null;
  let patchApplied = false;

  if (readmeDoc) {
    patch = await claude.proposeReadmePatch({
      diff: initialDiff,
      readme: readmeDoc.content,
      ...(values.model ? { model: values.model } : {}),
    });
    if (patch) {
      if (patch.reasoning) console.log(`\n${patch.reasoning}`);
      console.log('Proposed README patch:\n');
      console.log(readme.previewDiff({ before: patch.before, after: patch.after }));
      console.log();
      const apply = await ask('Apply?');
      if (apply) {
        const updated = readme.applyPatch({
          readme: readmeDoc.content,
          patch,
        });
        await writeFile(readmeDoc.absolutePath, updated, 'utf8');
        await git.stageFile(readmeDoc.path);
        patchApplied = true;
      }
    } else {
      console.log('\n✓ README is in sync with the diff.');
    }
  } else if (values['no-readme']) {
    console.log('\nREADME sync skipped (--no-readme).');
  }

  const finalDiff = patchApplied ? await git.getStagedDiff() : initialDiff;

  const draft = await claude.proposeCommitMessage({
    diff: finalDiff,
    readme: readmeDoc?.content,
    readmePatchSummary: patchApplied ? patch.reasoning : undefined,
    ...(values.model ? { model: values.model } : {}),
  });
  console.log('\nProposed commit message:\n');
  console.log(draft.message.replace(/^/gm, '  '));
  console.log();

  const doCommit = await ask('Commit?');
  if (!doCommit) {
    if (didAutoStage) await git.unstageAll();
    console.log('Commit aborted.');
    return;
  }

  const { sha } = await git.commit(draft.message);
  console.log(`✓ Committed ${sha}`);
}
