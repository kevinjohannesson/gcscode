# Robust default paths in token helpers

**Slug:** robust-default-paths-in-token-helpers
**Iteration on the agentic-team track:** seventeenth.
**Type:** reliability iteration. Adds default-path fallback to both bot-token helper scripts so they work in any environment that doesn't propagate env vars cleanly. No new code logic — just makes the env var an override rather than a requirement. Two helper script edits + one CLAUDE.md note. Not on the debt-clearing v1 queue; surfaced operationally.
**No bootstrap exceptions.** Spec ships via spec-PR workflow; implementation lands per the post-merge implementation convention.

## Context

Across this session's iterations, two empirical failures were observed where reviewer/respondent subagents fell back to the user's `gh auth` identity (`kevinjohannesson`) instead of posting under the intended bot identity:

1. **PR #20 round 3 respondent (Opus)**: `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` was not in `~/.zshenv` at dispatch time. The respondent helper aborted with "env var not set"; the subagent fell back to user-identity posting. Fixed mid-session by adding the var to `~/.zshenv`.
2. **PR #22 round 1 spec-quality**: env var WAS in `~/.zshenv` by then, but the spec-quality reviewer still produced a fallback post (at 08:59:02Z under `kevinjohannesson`) before a retry succeeded under the bot identity (at 09:00:07Z under `gcscode-spec-quality`). The exact transient failure mode is uncertain; the persistent symptom is "user-identity fallback when bot-identity is required."

The root cause is fragility in the env-var-driven path config:

- The user's PEMs always live at `~/.config/gcscode/gcscode-<role-slug>.pem` (for reviewer roles) and `~/.config/gcscode/gcscode-respondent.pem` (for respondent). This is consistent across the user's setup; there's no alternative location in practice.
- The helper scripts CURRENTLY require an env var (`GH_REVIEWER_APP_PRIVATE_KEY_DIR` or `GH_RESPONDENT_APP_PRIVATE_KEY_PATH`) to locate the PEM. They abort if the var is unset.
- The env var propagation path (terminal → Claude Code → subagent shell) is reliable when `~/.zshenv` is set up correctly, but the failure modes are non-obvious: stale shell snapshots, mid-session var additions not reaching already-running subagents, transient gh-CLI fallbacks, etc.

The right fix is **convention over configuration**: hardcode the canonical path as the script's default, keep the env var as an optional override. In any environment where the env var IS set, behavior is unchanged. In environments where it isn't (transient, stale, or simply unset), the script uses the default path. The subsequent PEM-existence check still fails loudly if the PEM is actually missing — just at a more useful point.

## Why not the bigger version

The bigger version would include:

- **Remove env-var support entirely.** Hardcode the path; no override. **Smaller wedge:** keep env var as override (this spec). **Bigger wedge:** removes a documented affordance (testing, alternative deployments) that costs nothing to keep. YAGNI says preserve the override since it's free.
- **Add structured logging to the helper scripts.** Emit which path was used (env-driven vs default-driven) so future debugging is faster. **Smaller wedge:** no logging changes; the existing "file not found at <path>" error message already names the path. **Bigger wedge:** introduces log volume + format design questions for a v1 reliability fix.
- **Per-PEM checksum / fingerprint validation.** Verify the PEM is the one expected before signing the JWT. **Smaller wedge:** trust the file at the canonical path. **Bigger wedge:** real validation infrastructure for a problem that doesn't yet exist.
- **Generalize beyond bot-token helpers.** Other scripts may also have env-var fragility. **Smaller wedge:** scope to the two known-affected scripts. **Bigger wedge:** speculative; other scripts haven't surfaced this failure.

This iteration ships: 2 helper script edits + 1 CLAUDE.md "Further reading" note about the default-path-fallback convention. Direct master commits after merge.

## Goals

1. Add a default-path fallback to `.claude/scripts/gh-app-token-reviewer`: if `GH_REVIEWER_APP_PRIVATE_KEY_DIR` is unset or empty, default to `$HOME/.config/gcscode`.
2. Add a default-path fallback to `.claude/scripts/gh-app-token-respondent`: if `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` is unset or empty, default to `$HOME/.config/gcscode/gcscode-respondent.pem`.

> **Note added 2026-05-17 (post-merge `fix(spec):` clarification):** the env-var naming asymmetry — `GH_REVIEWER_APP_PRIVATE_KEY_DIR` (a directory containing per-role PEMs) vs `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` (a single file path) — is inherited from [`docs/specs/2026-05-16-per-role-bot-identities-for-reviewers.md`](2026-05-16-per-role-bot-identities-for-reviewers.md), where the asymmetry was an accepted tradeoff (avoiding disturbing respondent infrastructure that had just stabilized in v2). This spec preserves the asymmetry; the default-path fallback applies uniformly to both shapes (directory for reviewer, file for respondent). A future "unified reviewer + respondent helper" iteration (per the per-role-bot-identities spec's Future iterations) may resolve the naming asymmetry; out of scope here. 3. Update FOUR CLAUDE.md locations to reflect the optional-env-var status: (a) the "Subagent reviewer PR-posting discipline > Config locations" bullet (around line 212); (b) the "Respondent posting discipline > Config" bullet (around line 245); (c) the "Further reading > `.claude/agent-config.json`" bullet (around line 315); (d) the "Further reading > `.claude/scripts/gh-app-token-reviewer`" bullet (around line 316). The respondent helper does not have its own dedicated "Further reading" bullet in the current CLAUDE.md (it's cross-referenced from the reviewer-helper bullet), so the respondent helper's default-path-fallback note lives inside the same reviewer-helper bullet update for compactness. 4. Roadmap propagation.

## Non-goals (this iteration)

- **Remove env var support.** Env vars stay as override mechanism for testing / alternative deployments. YAGNI for removal.
- **Add helper-side logging or PEM validation.** Future iteration if debugging needs surface.
- **Change the PEM naming convention** (`gcscode-<role-slug>.pem`). Stays as-is; it's already a stable convention.
- **Generalize the default-path-fallback pattern beyond the two known helpers.** Future iteration if another helper exhibits the same fragility.
- **Update `~/.zshenv` or any user-local config.** This iteration is purely about helper-script robustness; the user's existing `~/.zshenv` entries continue to work as the env-var override mechanism.

## Architecture

### The pattern

Replace the strict env-var check with shell parameter expansion's "set-if-empty" form:

**Before** (reviewer helper):

```bash
if [[ -z "${GH_REVIEWER_APP_PRIVATE_KEY_DIR:-}" ]]; then
  echo "gh-app-token-reviewer: GH_REVIEWER_APP_PRIVATE_KEY_DIR not set" >&2
  exit 1
fi
```

**After**:

```bash
: "${GH_REVIEWER_APP_PRIVATE_KEY_DIR:=$HOME/.config/gcscode}"
```

The `: "${VAR:=default}"` syntax (POSIX shell):

- If `VAR` is unset OR empty, **assigns** `default` to `VAR` in the current shell scope. Does NOT export to child processes (that would require `export VAR` separately).
- If `VAR` is already set to a non-empty value, leaves it unchanged.
- The `:` is a no-op command that's there to consume the parameter expansion as a statement.

This is sufficient for the helper script's needs: the script reads `$VAR` later in its own body, where current-shell scope is exactly what's required. The script does not invoke any child process that needs `VAR` in its environment — the PEM-path resolution is internal. The "no export to child processes" property is a feature, not a defect, for this use case.

After this line, the rest of the script proceeds using `$GH_REVIEWER_APP_PRIVATE_KEY_DIR` as before. The subsequent file-existence check (`[[ ! -f "$pem_path" ]]`) still fires loudly if the PEM is actually missing — the fallback only handles env-var absence, not file absence.

### What changes operationally

- **Environments with env var set** (the current user's normal setup): no behavior change. The env var is honored; the default is never read.
- **Environments without env var set** (any transient propagation failure, fresh subagent shells that miss `~/.zshenv`, debug invocations from a clean shell, etc.): the helper now succeeds using the default path. Previously it aborted.
- **Environments with env var set to a wrong path or empty string**: unchanged behavior. The empty-string case is now treated as "unset" by the `:=` semantics (matching the original `-z` check); the wrong-path case still produces a loud "file not found" error at the subsequent check.

### Failure mode preservation

The script still fails loudly if:

- The PEM file does not exist at the resolved path (env-driven OR default-driven).
- The role-slug is invalid (reviewer helper only — the case statement is unchanged).
- The `.claude/agent-config.json` is missing or malformed.
- The App ID or installation ID lookup returns null.
- GitHub returns no token.

The change is strictly **opt-out**, not opt-in: existing callers that pass the env var see no difference; existing callers that don't pass it now succeed instead of failing.

## Validation

- **Validation by review on this PR**: reviewers verify the shell-parameter-expansion pattern is correct + the default paths match the canonical user setup + the failure-mode preservation argument holds.
- **Explicit unset-then-invoke test (mandatory between Commits 2 and 3)**: the env-var is currently set in this user's environment, so the default-path code path never runs by default. To validate the default path actually works, the post-merge implementation includes a one-shot manual test (per the Verbatim > "Mid-implementation verification step" subsection): explicitly unset both env vars in a subshell and invoke each helper with a known role-slug; verify the helper returns a token using the default path. Three correctness criteria: exit code 0, non-empty output, output starts with `ghs_`. Test runs AFTER Commits 1 and 2 land (so the default-path code exists) but BEFORE Commit 3 lands (so the documentation propagation doesn't precede the working implementation). Red-team Opus flagged the "validation is vacuous without an unset-then-invoke" gap; this addresses it. (Earlier draft had the test running BEFORE Commits 1-2 — that was a logic error caught by red-team Sonnet's re-review of `ec8f4a3`; the test exercises code that Commits 1 and 2 introduce.)
- **Validation by use on the FIRST spec/ADR PR after merge**: any reviewer / respondent dispatch on the next spec/ADR PR exercises the helper script. If the env var IS set, behavior is unchanged. If a subagent's shell doesn't have the var (the failure mode this iteration targets), the default path kicks in and the dispatch posts under the correct bot identity instead of the user-identity fallback.
- **PR #22's root cause stays a known unknown.** The explicit unset-then-invoke test validates the "env-var missing" failure mode. It does NOT validate the "env-var set but `gh` used user-auth anyway" mode (which is one of two plausible diagnostic options for PR #22, per the Tripwire section). If user-identity-fallback recurs on a future PR despite the default-path fix being live, the diagnostic should distinguish: was the helper invoked at all? Did it return a token? Did `gh` see GH_TOKEN? The default-path fix targets the first of these; the other two have separate remediation paths.
- **No new tripwire required**: the user-identity-fallback recurrence tripwire below covers detection. The controller observing a `kevinjohannesson` post that should have been a bot post is the signal.

## VS Code alignment

No VS Code alignment implications. The change is to gcscode-specific bot-token helper scripts.

Propagation to `shell/docs/vs-code-alignment.md`: none.

## `docs/out-of-scope.md` propagation

**No edit.** This iteration is per-iteration scope (operational reliability for two specific scripts). Future iterations (remove env var entirely, generalize the pattern) have triggers documented above and don't rise to cross-cutting architectural deferrals.

## `docs/roadmap.md` propagation

Not currently on the roadmap (surfaced ad-hoc this session). Post-merge implementation adds a single Queued/Shipped `[x]` entry.

Verbatim edit content in Post-merge implementation > Commit 3.

## Known unknowns

- **Empirical sample size of two for the underlying failure mode**: PR #20 round 3 + PR #22 round 1. The exact mechanism behind PR #22's failure is uncertain (timing-driven, transient `gh` fallback, or something else). The fix is robust against multiple plausible causes regardless of which one was actually in play.
- **Subagent env propagation is not fully understood**. This iteration sidesteps the question rather than answering it: convention over configuration removes the dependency on env propagation being correct.
- **Default path is hardcoded to `$HOME/.config/gcscode`**. If the user ever moves the PEMs to a different location AND has the env var unset, the helper will fail to find them at the default. Acceptable trade-off: the user's setup is consistent; the env var is the override for non-canonical setups.

## Tripwires for known-quality concerns

- **User-identity-fallback recurrence tripwire**: if any reviewer or respondent posts under `kevinjohannesson` (or any user identity) AFTER this iteration ships AND the controller did not intentionally manually-post as the user, the helper-script default-path-fallback is not catching the failure. Per CLAUDE.md "Reviewer-role design conventions > Tripwires" condition (iii)'s binary-rule carve-out: this is a single observation binary signal (post identity is either bot or user), N=1 acceptable. Response: enumerate which diagnostic option fired (the spec acknowledges PR #22's root cause was undiagnosed and explicitly enumerates the candidate options below):
  - **(a) Helper-script default-path-fallback didn't catch**: env-var unset AND the default path didn't resolve. Symptom: helper aborts with "PEM not found at <default-path>" in stderr. Remediation: the PEM is misplaced or the default path's assumption broke.
  - **(b) Agent prompt is failing to use the helper**: the subagent's dispatch prompt invokes `gh pr review` without first running the helper. Symptom: no helper invocation in the subagent's session trace; `gh` falls back to user-local auth. Remediation: tighten the dispatch prompt's helper-invocation wording.
  - **(c) Helper succeeded but `gh` used user-auth anyway**: the helper returned a token, but `GH_TOKEN` wasn't actually passed to `gh pr review` (e.g., subshell capture failed, the env-var-prefix syntax got mangled, or `gh` preferred a stored auth over the env var). Symptom: helper succeeded in session trace but the resulting post is under user identity. **This is the plausible root cause of PR #22's recurrence even though `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` was set by then; the default-path fix DOES NOT directly address this mode.** Remediation: tighten the dispatch prompt's `GH_TOKEN=$(...)` capture or add explicit `--token` flag to `gh pr review`.
  - **(d) PEM file actually missing at the default path**: e.g., user moved the PEMs elsewhere. Symptom: helper aborts with "PEM not found." Remediation: restore the PEM at the canonical path OR set the env-var override.

## Future iterations

1. **Remove env var support entirely** (hardcode the path). Trigger: env-var-as-override is never used in practice across N consecutive months.
2. **Generalize the default-path-fallback pattern** to other scripts that exhibit env-var fragility. Trigger: another script surfaces a similar failure.
3. **Add structured logging to helper scripts** so future debugging is faster. Trigger: another helper-script failure mode surfaces that's hard to diagnose without logs.

## Origin

Surfaced 2026-05-17 by the user during PR #22's post-merge review, after observing that several subagent dispatches across PRs #20 and #22 fell back to user-identity posting when env vars weren't reliably propagated. The user asked for a feasibility check on where to place env vars file-wise; investigation revealed Claude Code's zsh-based shell mechanism (auto-sources `~/.zshenv`) makes env vars visible in most cases but transient/timing failures still occur. Convention-over-configuration is the durable fix.

Not part of the agentic-team-debt-clearing v1 queue — ad-hoc operational reliability iteration. Sits alongside the relative-paths-in-reviewer-output iteration as an ad-hoc reliability cleanup that shipped same-day as the planned queue items.

## Post-merge implementation

Per the post-merge implementation convention, **three direct-master commits**. All content fully specified verbatim below.

> **Note added 2026-05-17 (post-merge `fix(spec):` clarification):** CLAUDE.md "Post-merge implementation conventions" says "direct master commits for purely mechanical CLAUDE.md or docs edits whose exact text is fully specified in the spec; feat branches for code or for changes that require judgment during implementation." Commits 1 and 2 of this iteration edit SCRIPTS (code), not CLAUDE.md or docs. The direct-master path is appropriate here per the **per-role-bot-identities precedent** (PR #18 / [`docs/specs/2026-05-16-per-role-bot-identities-for-reviewers.md`](2026-05-16-per-role-bot-identities-for-reviewers.md)), where 5 helper-script commits shipped via direct master because the script content was fully specified verbatim with no implementation judgment required. The convention's spirit ("fully specified content requiring no judgment") applies to scripts equally; the literal wording will sharpen in a future convention-revision iteration if needed.

- **Commit 1:** Edit `.claude/scripts/gh-app-token-reviewer` to replace the env-var-required check with the default-path-fallback pattern.
- **Commit 2:** Edit `.claude/scripts/gh-app-token-respondent` to apply the same pattern.
- **Commit 3:** Update FOUR CLAUDE.md locations (3a-3d covering "Config locations" + "Respondent posting discipline > Config" + "Further reading > agent-config.json" + "Further reading > gh-app-token-reviewer") + roadmap.md flip (3e).
- **Mid-implementation verification step** (runs AFTER Commits 1 and 2 land, BEFORE Commit 3): the test exercises the default-path code that Commits 1 and 2 introduce, so it must run after those commits. The controller runs the test in a clean subshell with both env vars explicitly unset, verifies each helper returns a token using the default path. Documented in Verbatim > "Mid-implementation verification step" with three correctness criteria (exit code 0, non-empty output, starts with `ghs_`). This is a manual one-shot test; if it fails, Commits 1 and 2 are reverted before Commit 3 lands.

### Verbatim — Commit 1 (`gh-app-token-reviewer` default-path fallback)

In `.claude/scripts/gh-app-token-reviewer`, locate the env-var-required block:

**Before:**

```bash
if [[ -z "${GH_REVIEWER_APP_PRIVATE_KEY_DIR:-}" ]]; then
  echo "gh-app-token-reviewer: GH_REVIEWER_APP_PRIVATE_KEY_DIR not set" >&2
  exit 1
fi
```

**After:**

```bash
# Default path: $HOME/.config/gcscode (the canonical gcscode PEM directory).
# GH_REVIEWER_APP_PRIVATE_KEY_DIR can be set to override (e.g., for testing).
: "${GH_REVIEWER_APP_PRIVATE_KEY_DIR:=$HOME/.config/gcscode}"
```

No other changes to the script. The subsequent `pem_path="$GH_REVIEWER_APP_PRIVATE_KEY_DIR/gcscode-$role_slug.pem"` line continues to work as before; the file-existence check (`[[ ! -f "$pem_path" ]]`) still fails loudly if the PEM doesn't exist.

### Verbatim — Commit 2 (`gh-app-token-respondent` default-path fallback)

In `.claude/scripts/gh-app-token-respondent`, locate the env-var-required block:

**Before:**

```bash
if [[ -z "${GH_RESPONDENT_APP_PRIVATE_KEY_PATH:-}" ]]; then
  echo "gh-app-token-respondent: GH_RESPONDENT_APP_PRIVATE_KEY_PATH not set" >&2
  exit 1
fi
```

**After:**

```bash
# Default path: $HOME/.config/gcscode/gcscode-respondent.pem (the canonical gcscode respondent PEM).
# GH_RESPONDENT_APP_PRIVATE_KEY_PATH can be set to override (e.g., for testing).
: "${GH_RESPONDENT_APP_PRIVATE_KEY_PATH:=$HOME/.config/gcscode/gcscode-respondent.pem}"
```

No other changes. The subsequent `[[ ! -f "$GH_RESPONDENT_APP_PRIVATE_KEY_PATH" ]]` check continues to fail loudly if the PEM is missing at the resolved path.

### Verbatim — Commit 3 (CLAUDE.md edits + roadmap.md flip — five sub-edits)

**3a — CLAUDE.md "Subagent reviewer PR-posting discipline > Config locations" bullet.** Locate (around line 212):

**Before:**

> **Config locations:** App IDs and installation IDs live in `.claude/agent-config.json` under `reviewerApps.<role-slug>` (versioned). Private keys live at `$GH_REVIEWER_APP_PRIVATE_KEY_DIR/gcscode-<role-slug>.pem` for reviewer roles; PEM files never enter git. (Respondent uses `respondentApp` + `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` as before.)

**After:**

> **Config locations:** App IDs and installation IDs live in `.claude/agent-config.json` under `reviewerApps.<role-slug>` (versioned). Private keys live at `$HOME/.config/gcscode/gcscode-<role-slug>.pem` for reviewer roles (default); `GH_REVIEWER_APP_PRIVATE_KEY_DIR` is an optional override. PEM files never enter git. (Respondent uses `respondentApp` + a default PEM path of `$HOME/.config/gcscode/gcscode-respondent.pem`; `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` is the optional override.)

**3b — CLAUDE.md "Respondent posting discipline > Config" bullet.** Locate (around line 245):

**Before:**

> **Config:** App ID and installation ID live in `.claude/agent-config.json` under the `respondentApp` key (sibling to the per-role `reviewerApps` keys). Private key path is read from the `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` env var; the PEM file never enters git.

**After:**

> **Config:** App ID and installation ID live in `.claude/agent-config.json` under the `respondentApp` key (sibling to the per-role `reviewerApps` keys). Private key path defaults to `$HOME/.config/gcscode/gcscode-respondent.pem`; `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` is an optional override. The PEM file never enters git.

**3c — CLAUDE.md "Further reading > `.claude/agent-config.json`" bullet.** Locate (around line 315):

**Before:**

> - `.claude/agent-config.json` — App IDs and installation IDs for the per-role reviewer GitHub Apps (under the `reviewerApps` key, one sub-object per role-slug) and for the respondent App (under `respondentApp`). Private key paths live in `GH_REVIEWER_APP_PRIVATE_KEY_DIR` (a directory containing per-role PEMs) and `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` env vars; PEM files never enter git.

**After:**

> - `.claude/agent-config.json` — App IDs and installation IDs for the per-role reviewer GitHub Apps (under the `reviewerApps` key, one sub-object per role-slug) and for the respondent App (under `respondentApp`). Private keys live at canonical default paths: `$HOME/.config/gcscode/gcscode-<role-slug>.pem` for reviewer roles, `$HOME/.config/gcscode/gcscode-respondent.pem` for respondent. The `GH_REVIEWER_APP_PRIVATE_KEY_DIR` and `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` env vars are optional overrides (per [`docs/specs/2026-05-17-robust-default-paths-in-token-helpers.md`](docs/specs/2026-05-17-robust-default-paths-in-token-helpers.md)). PEM files never enter git.

**3d — CLAUDE.md "Further reading > `.claude/scripts/gh-app-token-reviewer`" bullet.** Locate (around line 316):

**Before:**

> - `.claude/scripts/gh-app-token-reviewer` — helper that generates short-lived installation tokens for per-role reviewer identities. Takes a role-slug argument. Reviewer subagents call `export GH_TOKEN=$(.claude/scripts/gh-app-token-reviewer <role-slug>)` before `gh pr review`. (Respondent uses `.claude/scripts/gh-app-token-respondent`.)

**After:**

> - `.claude/scripts/gh-app-token-reviewer` — helper that generates short-lived installation tokens for per-role reviewer identities. Takes a role-slug argument. Reviewer subagents call `export GH_TOKEN=$(.claude/scripts/gh-app-token-reviewer <role-slug>)` before `gh pr review`. PEM path defaults to `$HOME/.config/gcscode/gcscode-<role-slug>.pem`; `GH_REVIEWER_APP_PRIVATE_KEY_DIR` is an optional override (per [`docs/specs/2026-05-17-robust-default-paths-in-token-helpers.md`](docs/specs/2026-05-17-robust-default-paths-in-token-helpers.md)). Respondent equivalent: `.claude/scripts/gh-app-token-respondent` defaults PEM to `$HOME/.config/gcscode/gcscode-respondent.pem`; `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` is the respondent's optional override.

**3e — roadmap.md flip.** Add the following entry to the **Queued** section of the agentic-team architecture track in `shell/docs/roadmap.md`, immediately after the existing "Tripwire condition (iii) compliance" `[x]`-marked entry:

```md
- [x] **Robust default paths in token helpers** — ad-hoc reliability iteration. Adds default-path fallback to `.claude/scripts/gh-app-token-reviewer` (default `$HOME/.config/gcscode`) and `.claude/scripts/gh-app-token-respondent` (default `$HOME/.config/gcscode/gcscode-respondent.pem`). The `GH_REVIEWER_APP_PRIVATE_KEY_DIR` and `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` env vars stay as optional overrides. Strict-env-var-required behavior was producing user-identity-fallback failures across PRs #20 and #22 when env propagation was transient or stale; convention over configuration removes the dependency on env-var propagation. Four CLAUDE.md locations updated for consistency (Config locations + Respondent Config + Further reading × 2). Spec: [`specs/2026-05-17-robust-default-paths-in-token-helpers.md`](specs/2026-05-17-robust-default-paths-in-token-helpers.md).
```

### Mid-implementation verification step (manual, mandatory between Commits 2 and 3)

**Ordering correction (per red-team Sonnet's re-review of `ec8f4a3`):** the prior wording said "run BEFORE Commits 1-2 land" — that was wrong. The test validates the default-path code that ONLY exists AFTER Commits 1 and 2 land. The correct ordering is:

1. Spec-PR merges (this PR #23).
2. Post-merge Commit 1 lands (`gh-app-token-reviewer` default-path fallback).
3. Post-merge Commit 2 lands (`gh-app-token-respondent` default-path fallback).
4. **Run the verification test here** — the helpers now have the default-path code; the test exercises it.
5. If the test fails, revert Commits 1 and 2 (do NOT proceed to Commit 3). If it succeeds, proceed.
6. Post-merge Commit 3 lands (CLAUDE.md edits + roadmap flip).

**Pipeline exit-status correction (per red-team Opus's re-review of `ec8f4a3`):** the prior `helper | head -c 16 && echo OK || echo FAIL` pattern was buggy. In a non-pipefail shell, the pipeline's exit status is `head`'s (which is 0 even when the helper fails and produces zero stdout), so the test would print "OK" even on helper failure. The corrected test captures the helper output into a variable and checks for non-empty content:

```bash
# Reviewer default-path test.
out=$(unset GH_REVIEWER_APP_PRIVATE_KEY_DIR GH_RESPONDENT_APP_PRIVATE_KEY_PATH; \
      .claude/scripts/gh-app-token-reviewer red-team 2>&1)
rc=$?
if [[ $rc -eq 0 && -n "$out" && "$out" =~ ^ghs_ ]]; then
  echo "OK: reviewer default-path test (token prefix: ${out:0:8}...)"
else
  echo "FAIL: reviewer default-path test (rc=$rc, output: ${out:0:100})"
fi

# Respondent default-path test.
out=$(unset GH_RESPONDENT_APP_PRIVATE_KEY_PATH GH_REVIEWER_APP_PRIVATE_KEY_DIR; \
      .claude/scripts/gh-app-token-respondent 2>&1)
rc=$?
if [[ $rc -eq 0 && -n "$out" && "$out" =~ ^ghs_ ]]; then
  echo "OK: respondent default-path test (token prefix: ${out:0:8}...)"
else
  echo "FAIL: respondent default-path test (rc=$rc, output: ${out:0:100})"
fi
```

Three correctness criteria for each test: (a) helper exit code is 0, (b) output is non-empty, (c) output starts with `ghs_` (the GitHub App installation token prefix). All three must hold for OK; any failure prints diagnostic context.

If either test FAILs, revert Commits 1 and 2 (do NOT proceed to Commit 3). If both succeed, the default-path fallback works as designed; Commit 3 lands.
