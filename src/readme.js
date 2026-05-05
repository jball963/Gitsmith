const ESC = '\x1b';
const isTTY = () => Boolean(process.stdout.isTTY);
const red = (s) => (isTTY() ? `${ESC}[31m${s}${ESC}[0m` : s);
const green = (s) => (isTTY() ? `${ESC}[32m${s}${ESC}[0m` : s);

export function applyPatch({ readme, patch }) {
  const { before, after } = patch;
  const first = readme.indexOf(before);
  if (first === -1) {
    throw new Error("patch's `before` text was not found in the README");
  }
  if (readme.indexOf(before, first + 1) !== -1) {
    throw new Error(
      "patch's `before` text appears more than once in the README — cannot patch unambiguously",
    );
  }
  return readme.slice(0, first) + after + readme.slice(first + before.length);
}

export function previewDiff({ before, after }) {
  const minus = before.split('\n').map((l) => `  ${red(`-  ${l}`)}`);
  const plus = after.split('\n').map((l) => `  ${green(`+  ${l}`)}`);
  return [...minus, ...plus].join('\n');
}
