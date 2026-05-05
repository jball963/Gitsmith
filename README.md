# Gitsmith

Drafts commit messages from your staged diff and patches your README when the docs drift.

<!-- demo: replace with vhs/asciinema gif -->
<!-- TODO: record demo with vhs and embed here above the fold -->

## Why this exists

Most "AI commit message" tools stop at the commit message. Gitsmith also reads your README, notices when the diff you just staged has made the docs stale, and proposes the patch — so the README never silently drifts away from the code. You see both the commit message and the README change in one prompt, and approve them together.

## Install

```sh
npm i -g gitsmith
```

Local dev from a clone:

```sh
npm i -g .
```

## Setup

Just run `gitsmith` once. On first run it'll prompt you for your Anthropic API key (get one at https://console.anthropic.com/settings/keys) and save it to `~/.gitsmith/config.json` for next time.

If you'd rather not persist it, set `ANTHROPIC_API_KEY` in your environment instead — the env var always wins over the saved config.

## Usage

```text
$ gitsmith

Reading staged changes... (3 files, +47 −12)

The README mentions only the --json flag, but this diff adds --csv too.
Proposed README patch:

  -  Use --json to output as JSON.
  +  Use --json or --csv to choose the output format.

Apply? [Y/n] y

Proposed commit message:

  Add CSV output mode

  Adds --csv as a sibling of --json, sharing the same writer interface
  so future formats slot in cleanly. README updated.

Commit? [Y/n] y
✓ Committed b3a1f2c
```

## Flags

| Flag            | Description                                                |
| --------------- | ---------------------------------------------------------- |
| `-y, --yes`     | Non-interactive: accept proposed README patch and commit   |
| `--no-readme`   | Skip the README sync for this commit                       |
| `--model <id>`  | Override the default Claude model                          |
| `-V, --version` | Print version and exit                                     |
| `-h, --help`    | Print help and exit                                        |

## License

MIT
