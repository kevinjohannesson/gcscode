#!/usr/bin/env node
// Mechanical checks for markdown docs, run before opening a spec/ADR PR:
//   - relative links resolve, including heading anchors;
//   - no local paths that leak a username or machine layout (/Users/<name>, /home/<name>,
//     C:\Users\<name>, the dashed -Users-<name> form in Claude Code temp and session
//     paths, /private/tmp/...);
//   - newly added specs and ADRs carry the required headings.
//
// Usage (from shell/): pnpm lint:docs [--base <ref>] [--all] [files...]
//   no file args  markdown changed against the merge base with <ref> (default origin/master);
//                 problems are reported on changed lines only
//   files...      those files, every line
//   --all         every tracked markdown file, every line

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Matches the leaked prefix (`/Users/<name>`), which is the private part. Each form
// needs a name-like character after the prefix, so prose such as `/Users/...` passes.
const ABSOLUTE_HOME_PATH =
  /\/(?:Users|home)\/[A-Za-z0-9][\w.-]*|[A-Za-z]:\\Users\\[A-Za-z0-9][\w.-]*|-Users-[A-Za-z0-9][\w.]*|\/private\/tmp\/[A-Za-z0-9][\w.-]*/;
const INLINE_LINK = /!?\[(?:[^\]]|\][^(])*?\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const REFERENCE_DEFINITION = /^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+"[^"]*")?\s*$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

const REQUIRED_HEADINGS = {
  spec: ['Context', 'Goals', 'Non-goals', 'VS Code alignment', 'Known unknowns'],
  adr: ['Context', 'Decision', 'Consequences'],
};

/** GitHub's heading-anchor rule: lowercase, drop punctuation, spaces to hyphens. */
export function slugify(heading) {
  return heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** Yields [lineNumber, line, inFence] for every line, tracking fenced code blocks. */
function* walkLines(text) {
  let fence = null;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = FENCE.exec(line);
    if (match) {
      const marker = match[1];
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      yield [i + 1, line, true];
      continue;
    }
    yield [i + 1, line, fence !== null];
  }
}

/** Heading texts outside code fences, in order. */
export function headings(text) {
  const found = [];
  for (const [, line, inFence] of walkLines(text)) {
    if (inFence) continue;
    const match = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (match) found.push(match[1]);
  }
  return found;
}

/** Anchors GitHub generates for a document, with -1, -2 suffixes on duplicates. */
export function anchors(text) {
  const seen = new Map();
  const result = new Set();
  for (const heading of headings(text)) {
    const base = slugify(heading);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    result.add(count === 0 ? base : `${base}-${count}`);
  }
  return result;
}

/** Link targets outside code fences and inline code: [{ line, target }]. */
export function links(text) {
  const found = [];
  for (const [lineNumber, line, inFence] of walkLines(text)) {
    if (inFence) continue;
    const prose = line.replace(/(`+)[\s\S]*?\1/g, (code) => ' '.repeat(code.length));
    for (const match of prose.matchAll(INLINE_LINK))
      found.push({ line: lineNumber, target: match[1] });
    const definition = REFERENCE_DEFINITION.exec(prose);
    if (definition) found.push({ line: lineNumber, target: definition[1] });
  }
  return found;
}

/** Which required-heading set applies to a newly added file, if any. */
export function docKind(path) {
  if (/(^|\/)docs\/specs\/\d{4}-\d{2}-\d{2}-[^/]+\.md$/.test(path)) return 'spec';
  if (/(^|\/)docs\/decisions\/ADR-\d{4}-[^/]+\.md$/.test(path)) return 'adr';
  return null;
}

/**
 * Problems in one file.
 *   path      repo-relative path of the file
 *   text      its contents
 *   lines     line numbers to report on, or null for every line
 *   kind      'spec' | 'adr' | null — required headings to check
 *   fs        { isFile(path), isDir(path), read(path) } over repo-relative paths
 */
export function lintFile({ path, text, lines = null, kind = null, fs }) {
  const problems = [];
  const report = (line, message) => {
    if (lines === null || lines.has(line)) problems.push({ path, line, message });
  };

  for (const [lineNumber, line] of walkLines(text)) {
    const leak = ABSOLUTE_HOME_PATH.exec(line);
    if (leak)
      report(
        lineNumber,
        `local path "${leak[0]}" leaks the machine layout — use a repo-relative path`,
      );
  }

  for (const { line, target } of links(text)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) continue;
    const hashAt = target.indexOf('#');
    const rawPath = hashAt === -1 ? target : target.slice(0, hashAt);
    const anchor = hashAt === -1 ? '' : target.slice(hashAt + 1);
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(rawPath);
    } catch {
      decodedPath = rawPath;
    }
    const resolved = decodedPath === '' ? path : normalize(join(dirname(path), decodedPath));
    if (resolved.startsWith('..')) {
      report(line, `link "${target}" points outside the repository`);
      continue;
    }
    const self = resolved === path;
    if (!self && !fs.isFile(resolved) && !fs.isDir(resolved)) {
      report(line, `link "${target}" does not resolve (${resolved})`);
      continue;
    }
    if (anchor && resolved.endsWith('.md') && (self || fs.isFile(resolved))) {
      const targetText = self ? text : fs.read(resolved);
      if (!anchors(targetText).has(decodeURIComponent(anchor).toLowerCase())) {
        report(line, `anchor "#${anchor}" not found in ${resolved}`);
      }
    }
  }

  if (kind) {
    const present = headings(text);
    if (kind === 'adr' && !present.includes('Status') && !/^\*\*Status:\*\*/m.test(text)) {
      problems.push({
        path,
        line: 1,
        message: 'missing required "Status" (heading or **Status:** line)',
      });
    }
    for (const required of REQUIRED_HEADINGS[kind]) {
      if (!present.some((heading) => heading.startsWith(required))) {
        problems.push({ path, line: 1, message: `missing required heading "## ${required}"` });
      }
    }
  }

  return problems;
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Added line numbers per file from a zero-context diff. */
export function addedLines(diff) {
  const byFile = new Map();
  let current = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      current = line === '+++ /dev/null' ? null : line.slice(6);
      if (current !== null && !byFile.has(current)) byFile.set(current, new Set());
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && current !== null) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      for (let n = start; n < start + count; n++) byFile.get(current).add(n);
    }
  }
  return byFile;
}

function targets(root, argv) {
  const base = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : 'origin/master';
  const files = argv.filter((arg, i) => !arg.startsWith('--') && argv[i - 1] !== '--base');

  if (argv.includes('--all')) {
    return git(root, ['ls-files', '*.md'])
      .split('\n')
      .filter(Boolean)
      .map((path) => ({ path, lines: null, kind: null }));
  }
  if (files.length > 0) {
    const cwd = process.cwd();
    return files.map((file) => {
      const path = relative(root, join(cwd, file));
      return { path, lines: null, kind: docKind(path) };
    });
  }

  const mergeBase = git(root, ['merge-base', base, 'HEAD']).trim();
  const status = git(root, ['diff', '--name-status', '-M', mergeBase, '--', '*.md']);
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '--', '*.md']);
  const changed = addedLines(git(root, ['diff', '-U0', '-M', mergeBase, '--', '*.md']));
  const result = [];
  for (const row of status.split('\n').filter(Boolean)) {
    const [code, ...paths] = row.split('\t');
    const path = paths[paths.length - 1];
    if (code.startsWith('D')) continue;
    const added = code.startsWith('A');
    result.push({
      path,
      lines: added ? null : (changed.get(path) ?? new Set()),
      kind: added ? docKind(path) : null,
    });
  }
  for (const path of untracked.split('\n').filter(Boolean)) {
    result.push({ path, lines: null, kind: docKind(path) });
  }
  return result;
}

function main(argv) {
  const root = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  const abs = (path) => join(root, path);
  const fs = {
    isFile: (path) => existsSync(abs(path)) && statSync(abs(path)).isFile(),
    isDir: (path) => existsSync(abs(path)) && statSync(abs(path)).isDirectory(),
    read: (path) => readFileSync(abs(path), 'utf8'),
  };

  const files = targets(root, argv);
  const problems = files.flatMap(({ path, lines, kind }) =>
    fs.isFile(path) ? lintFile({ path, text: fs.read(path), lines, kind, fs }) : [],
  );
  for (const { path, line, message } of problems) console.log(`${path}:${line}: ${message}`);
  console.log(
    problems.length === 0
      ? `lint-docs: ${files.length} file(s) checked, no problems`
      : `lint-docs: ${problems.length} problem(s) in ${files.length} file(s) checked`,
  );
  return problems.length === 0 ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
