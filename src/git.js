import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const exec = promisify(execFile);

async function git(...args) {
  try {
    const { stdout } = await exec('git', args, { maxBuffer: 50 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    const detail = err.stderr?.toString().trim() || err.message;
    throw new Error(`git ${args.join(' ')} failed: ${detail}`);
  }
}

export async function assertInRepo() {
  try {
    await git('rev-parse', '--is-inside-work-tree');
  } catch {
    throw new Error('not inside a git repository');
  }
}

export async function getStagedDiff() {
  return git('diff', '--cached', '--no-color');
}

export async function getStagedSummary() {
  const out = (await git('diff', '--cached', '--shortstat')).trim();
  if (!out) return { files: 0, insertions: 0, deletions: 0 };
  const m = out.match(
    /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/,
  );
  if (!m) return { files: 0, insertions: 0, deletions: 0 };
  return {
    files: Number(m[1]),
    insertions: Number(m[2] ?? 0),
    deletions: Number(m[3] ?? 0),
  };
}

export async function getCurrentReadme() {
  const root = (await git('rev-parse', '--show-toplevel')).trim();
  const tracked = (await git('ls-files')).split('\n');
  const path = tracked.find((f) => /^readme(\.[^/]+)?$/i.test(f));
  if (!path) return null;
  const absolutePath = resolve(root, path);
  return { path, absolutePath, content: await readFile(absolutePath, 'utf8') };
}

export async function stageFile(path) {
  await git('add', '--', path);
}

export async function getWorkingTreeStatus() {
  const out = (await git('status', '--porcelain')).replace(/\n$/, '');
  if (!out) return [];
  return out.split('\n').map((line) => ({
    code: line.slice(0, 2),
    path: line.slice(3),
  }));
}

export async function stageAll() {
  await git('add', '-A');
}

export async function unstageAll() {
  await git('reset', 'HEAD');
}

export async function commit(message) {
  await git('commit', '-m', message);
  const sha = (await git('rev-parse', '--short', 'HEAD')).trim();
  return { sha };
}

export async function getCurrentBranch() {
  return (await git('rev-parse', '--abbrev-ref', 'HEAD')).trim();
}

export async function getUpstream() {
  try {
    return (await git('rev-parse', '--abbrev-ref', '@{u}')).trim();
  } catch {
    return null;
  }
}

export async function getRemotes() {
  const out = (await git('remote')).trim();
  return out ? out.split('\n') : [];
}

export async function push({ remote, branch } = {}) {
  if (remote && branch) {
    await git('push', '-u', remote, branch);
  } else {
    await git('push');
  }
}
