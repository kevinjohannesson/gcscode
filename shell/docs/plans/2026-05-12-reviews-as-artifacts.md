# Reviews as artifacts — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the GitHub PR workflow + GitHub App reviewer identity + `CLAUDE.md`/docs updates that make agentic reviewer output durable as GitHub PR artifacts. Spec: [`docs/specs/2026-05-12-reviews-as-artifacts.md`](../specs/2026-05-12-reviews-as-artifacts.md).

**Architecture:** Workflow + tooling iteration. No code changes to the gcscode source tree. The iteration adds (a) a small bash helper for generating short-lived GitHub App installation tokens, (b) a versioned config file with the App's identifiers, and (c) `CLAUDE.md` / `docs/` updates that codify the new PR workflow, reviewer verdict handling, and reviewer PR-posting discipline.

**Tech Stack:** bash, openssl, jq, curl (token helper); `gh` CLI for git/GitHub workflow; GitHub App auth flow (JWT → installation token); markdown for docs.

---

## Important — this iteration uses the OLD flow

The spec explicitly states: implementing this iteration uses the OLD local `git merge --no-ff` flow, not the new PR workflow, because the GitHub App + token helper + `CLAUDE.md` updates do not exist until this iteration ships. The controller dispatching implementer subagents through this plan should NOT open a draft PR, NOT post reviews to GitHub, and NOT use `gcscode-reviewer[bot]`. Per-task reviews stay in-context as they do today; integration is the local `--no-ff` merge per existing `CLAUDE.md` convention. The new flow starts on the NEXT iteration after this one merges.

---

## Prerequisites (manual user action — not subagent tasks)

These steps produce values the implementer needs (App ID, installation ID) and a PEM file the runtime needs. Must complete before Task 1.

1. Visit `https://github.com/settings/apps/new`.
2. Set:
   - **GitHub App name:** `gcscode-reviewer` (or any unique name)
   - **Homepage URL:** link to the gcscode repo
   - **Webhook → Active:** uncheck (no webhooks needed)
   - **Repository permissions:**
     - `Pull requests`: Read and write
     - `Contents`: Read-only
     - `Metadata`: Read-only
   - **Where can this GitHub App be installed:** Only on this account
3. Click **Create GitHub App**.
4. On the App settings page, under **Private keys**, click **Generate a private key**. Save the downloaded PEM outside the repo (e.g., `~/.config/gcscode/gcscode-reviewer.pem`).
5. From the App settings sidebar, click **Install App** → choose the gcscode repo only → install. After install, the URL becomes `https://github.com/settings/installations/<installation-id>` — record the installation ID.
6. From the App settings page, record the **App ID** (top of the page).
7. Add to shell rc (`~/.zshrc` or `~/.bashrc`):

   ```bash
   export GH_APP_PRIVATE_KEY_PATH="$HOME/.config/gcscode/gcscode-reviewer.pem"
   ```

   Then `source ~/.zshrc` (or restart the shell).

**Verification:**

- `echo $GH_APP_PRIVATE_KEY_PATH` returns the path.
- `head -1 "$GH_APP_PRIVATE_KEY_PATH"` returns a `-----BEGIN RSA PRIVATE KEY-----` (or `-----BEGIN PRIVATE KEY-----`) header.

Provide the App ID and installation ID to the implementer at task start.

---

### Task 1: Create `.claude/agent-config.json`

**Files:**

- Create: `.claude/agent-config.json`

- [ ] **Step 1: Verify `.claude/` directory exists**

Run: `ls -d .claude`
Expected: `.claude` prints (it should — `CLAUDE.md` references `.claude/commands/`).

- [ ] **Step 2: Create the config file**

Replace `<APP_ID>` and `<INSTALLATION_ID>` with the actual values from Prerequisites steps 5–6. Write to `.claude/agent-config.json`:

```json
{
  "githubApp": {
    "appId": "<APP_ID>",
    "installationId": "<INSTALLATION_ID>"
  }
}
```

- [ ] **Step 3: Validate JSON parses**

Run: `jq . .claude/agent-config.json`
Expected: pretty-prints the JSON without error; `appId` and `installationId` are non-null strings.

- [ ] **Step 4: Stage and commit**

```bash
git add .claude/agent-config.json
git commit -m "$(cat <<'EOF'
chore(agentic-team): add .claude/agent-config.json for gcscode-reviewer App

Holds App ID and installation ID for the GitHub App that posts
agentic reviewer comments. Private key path stays in env var
(GH_APP_PRIVATE_KEY_PATH), never in repo.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Create `.claude/scripts/gh-app-token`

**Files:**

- Create: `.claude/scripts/gh-app-token` (executable bash script)

- [ ] **Step 1: Verify required tools are available**

```bash
command -v openssl && command -v jq && command -v curl
```

Expected: each prints a path. If `jq` is missing on macOS: `brew install jq`. `openssl` and `curl` ship with macOS.

- [ ] **Step 2: Create `.claude/scripts/` if it does not exist**

```bash
mkdir -p .claude/scripts
```

- [ ] **Step 3: Write the token helper script**

Save to `.claude/scripts/gh-app-token`:

```bash
#!/usr/bin/env bash
# Generates a short-lived GitHub App installation token for gcscode-reviewer.
# Reads App ID + installation ID from .claude/agent-config.json.
# Reads private key path from GH_APP_PRIVATE_KEY_PATH env var.
# Prints the installation token to stdout.

set -euo pipefail

script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
config="$script_dir/../agent-config.json"

if [[ ! -f "$config" ]]; then
  echo "gh-app-token: $config not found" >&2
  exit 1
fi

if [[ -z "${GH_APP_PRIVATE_KEY_PATH:-}" ]]; then
  echo "gh-app-token: GH_APP_PRIVATE_KEY_PATH not set" >&2
  exit 1
fi

if [[ ! -f "$GH_APP_PRIVATE_KEY_PATH" ]]; then
  echo "gh-app-token: private key not found at $GH_APP_PRIVATE_KEY_PATH" >&2
  exit 1
fi

app_id=$(jq -r .githubApp.appId "$config")
installation_id=$(jq -r .githubApp.installationId "$config")

if [[ "$app_id" == "null" || "$installation_id" == "null" ]]; then
  echo "gh-app-token: appId or installationId missing in $config" >&2
  exit 1
fi

now=$(date +%s)
exp=$((now + 540))  # JWT lifetime: 9 minutes (GitHub maximum is 10).

b64url() {
  openssl base64 -e -A | tr '+/' '-_' | tr -d '='
}

header=$(printf '%s' '{"alg":"RS256","typ":"JWT"}' | b64url)
payload=$(printf '{"iat":%s,"exp":%s,"iss":"%s"}' "$now" "$exp" "$app_id" | b64url)
signature=$(printf '%s.%s' "$header" "$payload" \
  | openssl dgst -sha256 -sign "$GH_APP_PRIVATE_KEY_PATH" -binary \
  | b64url)
jwt="$header.$payload.$signature"

response=$(curl -sS -X POST \
  -H "Authorization: Bearer $jwt" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/app/installations/$installation_id/access_tokens")

token=$(printf '%s' "$response" | jq -r .token)

if [[ "$token" == "null" || -z "$token" ]]; then
  echo "gh-app-token: GitHub did not return a token. Response:" >&2
  printf '%s\n' "$response" >&2
  exit 1
fi

printf '%s\n' "$token"
```

- [ ] **Step 4: Make executable**

```bash
chmod +x .claude/scripts/gh-app-token
```

- [ ] **Step 5: Smoke test — run the helper end-to-end**

```bash
.claude/scripts/gh-app-token
```

Expected: prints a single long string starting with `ghs_` (GitHub installation token prefix). If you see an error: common failures are `GH_APP_PRIVATE_KEY_PATH` not exported in this shell, App not installed on the repo, or typoed App ID / installation ID in `agent-config.json`.

- [ ] **Step 6: Verify the token authenticates against the App's installation**

```bash
GH_TOKEN=$(.claude/scripts/gh-app-token) gh api /installation/repositories
```

Expected: returns JSON with a `repositories` array containing the gcscode repo. Confirms the App identity works end-to-end through `gh`.

- [ ] **Step 7: Stage and commit**

```bash
git add .claude/scripts/gh-app-token
git commit -m "$(cat <<'EOF'
feat(agentic-team): add gh-app-token helper for gcscode-reviewer

Generates short-lived GitHub App installation tokens. Reviewer
subagents will export GH_TOKEN=$(.claude/scripts/gh-app-token)
before calling gh pr review so reviews post under
gcscode-reviewer[bot] rather than the user's identity.

Bash + openssl + jq + curl; zero new package dependencies on macOS.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Update `CLAUDE.md` "Branching and merging" section

**Files:**

- Modify: `CLAUDE.md` (replace the existing `## Branching and merging` section)

- [ ] **Step 1: Read the current section**

Read `CLAUDE.md` and locate the section beginning with `## Branching and merging`. Note its exact current text so the Edit tool replacement matches.

- [ ] **Step 2: Replace the section in full**

Replace the entire `## Branching and merging` section (including all its bullet points) with this exact content:

```markdown
## Branching and merging

- **Feature branches.** Implementation work runs on `feat/<topic>` branches off master. Spec/plan commits can land on master directly (they're metadata about future work); code commits live on a branch.
- **PR workflow.** After the first task commit lands on the feat branch, push to `origin` and open a **draft** PR targeting master via `gh pr create --draft` (template in the reviewer-discipline section). Transition to ready-for-review (`gh pr ready <num>`) at end-of-iteration immediately before the final cross-cutting reviewer runs.
- **Merge via `gh pr merge --merge <num>`.** Produces the merge-commit boundary equivalent to local `--no-ff` — matches the `f448ddc Merge branch 'feat/plugin-architecture-mvp'` precedent.
- **Never `--no-verify`.** Don't bypass commit hooks. If a hook fails, fix the underlying issue. (The repo currently has no commit hooks; the rule is in place for when it does.)
- **No force pushes to master.** Even with explicit user consent, prefer fixing the underlying issue over force-pushing.
- **No force pushes to PR branches once they have review comments.** Review threads anchor to commit SHAs; force-pushing breaks the audit trail.
```

- [ ] **Step 3: Stage and commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(agentic-team): update CLAUDE.md branching/merging for PR workflow

Replaces local --no-ff merge convention with draft PR + gh pr merge
--merge. Adds the no-force-push-to-PR-branches rule for preserving
review-thread anchors. Per docs/specs/2026-05-12-reviews-as-artifacts.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Add `CLAUDE.md` "Subagent reviewer PR-posting discipline" subsection

**Files:**

- Modify: `CLAUDE.md` (insert new `### Subagent reviewer PR-posting discipline` subsection inside `## Planning conventions and long-term alignment`)

- [ ] **Step 1: Locate the exact insertion point**

The new subsection goes inside `## Planning conventions and long-term alignment`, between the existing `### Subagent worktree discipline` subsection and the existing `### Non-goals propagate to docs/out-of-scope.md` subsection. This keeps all agentic-orchestration discipline grouped together.

- [ ] **Step 2: Insert the new subsection**

Insert this exact content as a new `### Subagent reviewer PR-posting discipline` subsection at that location:

````markdown
### Subagent reviewer PR-posting discipline

Every reviewer subagent dispatched during an iteration — per-task spec-compliance, per-task code-quality, final cross-cutting — posts its review to the iteration's GitHub PR in addition to returning a summary to the controller. The PR is the durable artifact; the summary preserves the existing followup-loop. Spec: [`docs/specs/2026-05-12-reviews-as-artifacts.md`](docs/specs/2026-05-12-reviews-as-artifacts.md).

**Dispatch prompt requirements (controller MUST include in every reviewer's prompt):**

- The PR number to post to.
- The token-helper invocation as a first step: `export GH_TOKEN=$(.claude/scripts/gh-app-token)`. Subsequent `gh` calls run under the `gcscode-reviewer[bot]` identity.
- The verdict the reviewer is allowed to use (see table below).
- The header convention.

**Verdict table:**

| Reviewer kind                          | `--comment` | `--request-changes` | `--approve` |
| -------------------------------------- | :---------: | :-----------------: | :---------: |
| Per-task spec-compliance               |      ✓      |          ✓          |      ✗      |
| Per-task code-quality                  |      ✓      |          ✓          |      ✗      |
| Final cross-cutting (end of iteration) |      ✗      |          ✓          |      ✓      |

Per-task reviewers may post `--comment` (clean or informational) or `--request-changes` (blocking), never `--approve`. The final cross-cutting reviewer is the only review allowed to flip the PR into approved state; it posts `--approve` or `--request-changes`, never `--comment`.

**Re-review after a Code-review-followup commit:** controller re-dispatches the same reviewer role + model after the followup commit lands. The re-review posts a **new** review (`--comment` "addressed in `<SHA>`" or another `--request-changes`). Prior reviews stay in the PR timeline — reviewers never dismiss their own prior reviews.

**Review header convention** (mandatory so the single bot identity remains role-legible):

```
## <Review kind> — task <N> (if per-task) — <reviewer model>
```

Examples:

- `## Spec-compliance review — task 3 — Claude Sonnet 4.6`
- `## Code-quality review — task 7 — Claude Sonnet 4.6`
- `## Final cross-cutting review — Claude Opus 4.7`
- `## Spec-compliance review — task 3 (re-review of abc1234) — Claude Sonnet 4.6`

**Merge gate (controller does NOT merge — the user does):** convention is "do not merge unless the final cross-cutting review is `--approve`." Human override allowed; if user merges despite open `--request-changes` reviews, leave a PR comment explaining why. The override is itself an artifact.

**PR template for `gh pr create --draft --body "..."`:**

```md
## Iteration

<one-line summary matching the spec's first line>

## Links

- Spec: [`docs/specs/YYYY-MM-DD-<topic>.md`](../blob/master/docs/specs/YYYY-MM-DD-<topic>.md)
- Plan: [`docs/plans/YYYY-MM-DD-<topic>.md`](../blob/master/docs/plans/YYYY-MM-DD-<topic>.md)
- ADRs (if any): …

## Reviewer instructions

Per-task reviewers post under task-headers. Final cross-cutting review posts at end of iteration.

🤖 Reviews authored by `gcscode-reviewer[bot]` — see [docs/specs/2026-05-12-reviews-as-artifacts.md](../blob/master/docs/specs/2026-05-12-reviews-as-artifacts.md) for the workflow.
```

**Public repo note.** gcscode is public on GitHub. Reviewer comments are world-readable. Keep reviews professional. Don't paste sensitive context (credentials, internal URLs).

**Config locations:** App ID and installation ID live in `.claude/agent-config.json` (versioned). Private key path is read from `GH_APP_PRIVATE_KEY_PATH` env var; the PEM file never enters git.
````

- [ ] **Step 3: Stage and commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(agentic-team): add CLAUDE.md subagent reviewer PR-posting discipline

Codifies the convention that every reviewer subagent posts to the
iteration's PR under the gcscode-reviewer[bot] identity. Includes
verdict table, header convention, re-review behavior, PR template,
public-repo note, and merge-gate convention. Per
docs/specs/2026-05-12-reviews-as-artifacts.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Add `CLAUDE.md` "Further reading" entries for the new track

**Files:**

- Modify: `CLAUDE.md` (existing `## Further reading` section)

- [ ] **Step 1: Read the current section**

Locate `## Further reading` in `CLAUDE.md`. Note the existing bullet style (with `—` em-dash separator).

- [ ] **Step 2: Append three new bullets**

Add these three bullets at the end of the `## Further reading` list (after the existing `.claude/commands/housekeeping.md` bullet):

```markdown
- `docs/specs/2026-05-12-reviews-as-artifacts.md` — first iteration of the agentic-team-architecture track: GitHub PR workflow + reviewer subagents posting under a GitHub App identity.
- `.claude/agent-config.json` — App ID and installation ID for the `gcscode-reviewer` GitHub App. Private key path lives in `GH_APP_PRIVATE_KEY_PATH` env var, not in repo.
- `.claude/scripts/gh-app-token` — helper that generates short-lived installation tokens. Reviewer subagents call `export GH_TOKEN=$(.claude/scripts/gh-app-token)` before `gh pr review`.
```

- [ ] **Step 3: Stage and commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(agentic-team): link reviews-as-artifacts spec + tooling from CLAUDE.md

Three new entries in Further reading point at the spec, the
agent-config.json, and the token helper.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Propagate cross-cutting deferrals to `docs/out-of-scope.md`

**Files:**

- Modify: `docs/out-of-scope.md` (add a new section per spec propagation)

- [ ] **Step 1: Read the current file**

Read `docs/out-of-scope.md` end-to-end. Identify the existing structure (topical subsections vs flat list) and the convention for "Trigger to revisit" wording.

- [ ] **Step 2: Add the new section**

Append this section at the end of `docs/out-of-scope.md` (or insert it as a sibling of the last topical section if the file uses topical organization — match existing structure):

```markdown
### Agentic team architecture deferrals

These deferrals stem from `docs/specs/2026-05-12-reviews-as-artifacts.md` and the broader agentic-team-architecture arc. Each is a deliberate "we are not building this yet" decision, not just a per-iteration scope cut.

- **Linear integration.** Work-tracking outside GitHub is deferred. The agentic-team workflow uses GitHub state only. Trigger to revisit: gcscode iterations start spawning enough tickets that GitHub Issues alone is painful.
- **Webhook routers / event-driven dispatch.** Beyond the narrow auto-merge GitHub Action (its own follow-up iteration), there is no off-session event handling. Trigger: user wants agents to react to events while no Claude session is live.
- **Multi-model heterogeneous reviewers.** Reviewers run as whatever model the controller picks (typically Sonnet). The "independence by model diversity" payoff is deferred to its own future iteration after this track's reviews-as-artifacts work has accumulated evidence to evaluate independence honestly. Trigger: durable reviews accumulate enough samples to compare model verdicts side-by-side.
- **Override semantics for agentic reviewers.** No formal "reviewer supersedes ADR" patterns (`blocked-on-adr` labels, counter-proposal ADR PRs). Trigger: a reviewer actually wants to block an iteration on architectural disagreement.
- **Spec/plan/ADR PR workflow.** Specs and plans continue to land on master directly per existing convention. Trigger: the planned red-team-reviewer iteration introduces spec-PR workflow.
```

If the existing file uses a different heading depth or a flat-bullet structure rather than topical subsections, adapt the heading depth to match but keep the bullet content identical.

- [ ] **Step 3: Stage and commit**

```bash
git add docs/out-of-scope.md
git commit -m "$(cat <<'EOF'
docs(agentic-team): propagate reviews-as-artifacts deferrals to out-of-scope.md

Five cross-cutting deferrals: Linear, webhook routers, multi-model
reviewers, override semantics, spec/plan/ADR PR workflow. Each
carries a trigger-to-revisit per the convention. Per the propagation
section in docs/specs/2026-05-12-reviews-as-artifacts.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Add agentic-team-architecture track to `docs/roadmap.md`

**Files:**

- Modify: `docs/roadmap.md` (insert new top-level section between `## Feature extensions` and `## Maintenance`)

- [ ] **Step 1: Read the current roadmap**

Read `docs/roadmap.md`. Locate the boundary between the last subsection of `## Feature extensions` and `## Maintenance`.

- [ ] **Step 2: Insert the new section**

Add this exact section immediately before `## Maintenance`:

```markdown
## Agentic team architecture

A workflow track that runs alongside feature iterations. Makes the implicit meta-project (Claude-driven extension architecture) explicit by investing in agent orchestration, reviewer durability, and traceability.

### Shipped

- [x] **Reviews as artifacts** — GitHub PR workflow + `gcscode-reviewer` GitHub App identity for agentic reviewer posts. Spec: [`specs/2026-05-12-reviews-as-artifacts.md`](specs/2026-05-12-reviews-as-artifacts.md).

### Coming (committed — will ship)

- [ ] **Auto-merge on user approval** — single `.github/workflows/auto-merge.yml` triggered on `pull_request_review.submitted`; merges when user approves AND the final cross-cutting reviewer's last review is `--approve`. Immediate follow-up to reviews-as-artifacts.
- [ ] **Red-team reviewer for specs/plans/ADRs** — introduces spec-PR workflow + a new agent role that critiques spec/plan/ADR commits before they're accepted to master.
- [ ] **Multi-model heterogeneous reviewers** — validates the independence-of-opinion premise concretely now that reviews are durable. Runs Opus + Sonnet (or one Claude + one non-Claude) on the same PR; chooses steady-state model assignment per reviewer role based on findings.

### Considering (not yet committed)

- [ ] **Linear integration** — work tracking outside GitHub. Trigger: ticket volume.
- [ ] **Webhook router for off-session triggers** — event-driven dispatch when no Claude session is live.
- [ ] **Override semantics** — formal ADR supersession by reviewer, `blocked-on-adr` labels, counter-proposal PRs.
- [ ] **Per-role bot identities** — multiple GitHub Apps for distinct reviewer accounts (currently single App, role disambiguation via review-text headers).
```

- [ ] **Step 3: Stage and commit**

```bash
git add docs/roadmap.md
git commit -m "$(cat <<'EOF'
docs(agentic-team): add agentic-team-architecture track to roadmap.md

New top-level section between Feature extensions and Maintenance.
Lists reviews-as-artifacts (shipped this iteration) plus three
queued follow-ups (auto-merge, red-team-reviewer, multi-model
reviewers) and four Considering items.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Final verification and OLD-flow integration

**Files:** none modified — verification + the local-merge integration step.

- [ ] **Step 1: Verify the token helper still works**

```bash
.claude/scripts/gh-app-token | head -c 10 && echo
```

Expected: prints `ghs_` followed by part of a token. (If Task 2's smoke test passed and nothing about config has changed, this passes.)

- [ ] **Step 2: Verify `.claude/agent-config.json` parses**

```bash
jq . .claude/agent-config.json
```

Expected: pretty-prints without error; `.githubApp.appId` and `.githubApp.installationId` are non-null strings.

- [ ] **Step 3: Verify CLAUDE.md renders cleanly**

```bash
wc -l CLAUDE.md
```

Expected: line count higher than pre-iteration by roughly 90–110 lines (verdict table, header conventions, PR template, three Further reading bullets). Read the new subsection by line range to confirm: tables are well-formed, code fences are closed, no broken backticks.

- [ ] **Step 4: Verify out-of-scope.md and roadmap.md render**

Read both files end-to-end. Confirm the new roadmap section uses checkbox syntax consistent with neighboring sections, and out-of-scope.md entries match the surrounding format.

- [ ] **Step 5: Verify the iteration's git log**

```bash
git log --oneline master..HEAD
```

Expected: seven commits matching Tasks 1–7, in order. No squash, no amend.

- [ ] **Step 6: Integrate via the OLD `--no-ff` flow (per spec)**

This iteration deliberately uses the OLD integration flow because the new flow's tooling does not exist until the merge lands. Per the spec validation section: "the first iteration to use the new flow is whichever roadmap item ships next."

```bash
git checkout master
git merge --no-ff feat/reviews-as-artifacts
git log --oneline --graph -5
```

Expected: a merge commit lands on master with the seven task commits visible in `git log --graph`. The new flow (push + draft PR + `gh pr merge --merge`) is NOT used here — it starts next iteration.

---

## Self-review

Plan was checked against the spec:

- **Spec coverage:** every spec component maps to a task. GitHub App setup → Prerequisites; config file → Task 1; token helper → Task 2; `CLAUDE.md` branching/merging update → Task 3; reviewer discipline + PR template + public-repo note → Task 4; Further reading links → Task 5; `out-of-scope.md` propagation → Task 6; roadmap update → Task 7; OLD-flow integration → Task 8.
- **Placeholder scan:** `<APP_ID>` / `<INSTALLATION_ID>` in Task 1 are user-provided values, not placeholders. `YYYY-MM-DD-<topic>` inside the PR template (Task 4) is a runtime template the controller fills in, not a plan placeholder. No `TBD` / `TODO` / "implement later" anywhere.
- **Type/method consistency:** `.githubApp.appId` and `.githubApp.installationId` are used identically between Task 1 (definition) and Task 2 (consumption). The reviewer header convention used in Task 4 matches the spec's verdict table. Script path `.claude/scripts/gh-app-token` is consistent across Tasks 2, 4, 5, and 8.
