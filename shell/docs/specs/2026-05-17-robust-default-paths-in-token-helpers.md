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
3. Update CLAUDE.md "Further reading" bullets for both helpers to note the default-path-fallback convention and that the env vars are optional overrides.
4. Roadmap propagation.

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
- If `VAR` is unset OR empty, sets `VAR` to `default` and exports the result.
- If `VAR` is already set to a non-empty value, leaves it unchanged.
- The `:` is a no-op command that's there to consume the parameter expansion as a statement.

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
- **Validation by use on the FIRST spec/ADR PR after merge**: any reviewer / respondent dispatch on the next spec/ADR PR exercises the helper script. If the env var IS set, behavior is unchanged. If a subagent's shell doesn't have the var (the failure mode this iteration targets), the default path kicks in and the dispatch posts under the correct bot identity instead of the user-identity fallback.
- **No new tripwire required**: the leak-recurrence tripwire (per `2026-05-17-relative-paths-in-reviewer-output.md`) is the closest analog — but for user-identity fallback the existing reviewer-identity check on the PR's reviews list is sufficient. The controller observing a `kevinjohannesson` post that should have been a bot post is the signal.

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

- **User-identity-fallback recurrence tripwire**: if any reviewer or respondent posts under `kevinjohannesson` (or any user identity) AFTER this iteration ships AND the controller did not intentionally manually-post as the user, the helper-script default-path-fallback is not catching the failure. Per CLAUDE.md "Reviewer-role design conventions > Tripwires" condition (iii)'s binary-rule carve-out: this is a single observation binary signal (post identity is either bot or user), N=1 acceptable. Response: diagnose whether (a) the helper script's default path didn't catch, (b) the agent prompt is failing to use the helper, or (c) the PEM file is missing at the default path.

## Future iterations

1. **Remove env var support entirely** (hardcode the path). Trigger: env-var-as-override is never used in practice across N consecutive months.
2. **Generalize the default-path-fallback pattern** to other scripts that exhibit env-var fragility. Trigger: another script surfaces a similar failure.
3. **Add structured logging to helper scripts** so future debugging is faster. Trigger: another helper-script failure mode surfaces that's hard to diagnose without logs.

## Origin

Surfaced 2026-05-17 by the user during PR #22's post-merge review, after observing that several subagent dispatches across PRs #20 and #22 fell back to user-identity posting when env vars weren't reliably propagated. The user asked for a feasibility check on where to place env vars file-wise; investigation revealed Claude Code's zsh-based shell mechanism (auto-sources `~/.zshenv`) makes env vars visible in most cases but transient/timing failures still occur. Convention-over-configuration is the durable fix.

Not part of the agentic-team-debt-clearing v1 queue — ad-hoc operational reliability iteration. Sits alongside the relative-paths-in-reviewer-output iteration as an ad-hoc reliability cleanup that shipped same-day as the planned queue items.

## Post-merge implementation

Per the post-merge implementation convention, **three direct-master commits**. All content fully specified verbatim below.

- **Commit 1:** Edit `.claude/scripts/gh-app-token-reviewer` to replace the env-var-required check with the default-path-fallback pattern.
- **Commit 2:** Edit `.claude/scripts/gh-app-token-respondent` to apply the same pattern.
- **Commit 3:** Update CLAUDE.md "Further reading" bullets for both helpers + add roadmap.md `[x]` entry.

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

### Verbatim — Commit 3 (CLAUDE.md notes + roadmap.md flip)

**3a — CLAUDE.md "Further reading" updates.** Locate the two helper bullets in CLAUDE.md "Further reading" section.

**Before** (the reviewer-helper bullet):

> - `.claude/scripts/gh-app-token-reviewer` — helper that generates short-lived installation tokens for per-role reviewer identities. Takes a role-slug argument. Reviewer subagents call `export GH_TOKEN=$(.claude/scripts/gh-app-token-reviewer <role-slug>)` before `gh pr review`. (Respondent uses `.claude/scripts/gh-app-token-respondent`.)

**After**:

> - `.claude/scripts/gh-app-token-reviewer` — helper that generates short-lived installation tokens for per-role reviewer identities. Takes a role-slug argument. Reviewer subagents call `export GH_TOKEN=$(.claude/scripts/gh-app-token-reviewer <role-slug>)` before `gh pr review`. PEM path defaults to `$HOME/.config/gcscode/gcscode-<role-slug>.pem`; `GH_REVIEWER_APP_PRIVATE_KEY_DIR` is an optional override (per [`docs/specs/2026-05-17-robust-default-paths-in-token-helpers.md`](docs/specs/2026-05-17-robust-default-paths-in-token-helpers.md)). (Respondent uses `.claude/scripts/gh-app-token-respondent`.)

If a `gh-app-token-respondent` bullet exists under "Further reading," append the same default-path-fallback note to it. If no such bullet exists, no edit is needed for the respondent helper in "Further reading."

**3b — roadmap.md flip.** Add the following entry to the **Queued** section of the agentic-team architecture track in `shell/docs/roadmap.md`, immediately after the existing "Tripwire condition (iii) compliance" `[x]`-marked entry:

```md
- [x] **Robust default paths in token helpers** — ad-hoc reliability iteration. Adds default-path fallback to `.claude/scripts/gh-app-token-reviewer` (`$HOME/.config/gcscode`) and `.claude/scripts/gh-app-token-respondent` (`$HOME/.config/gcscode/gcscode-respondent.pem`). The `GH_REVIEWER_APP_PRIVATE_KEY_DIR` and `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` env vars stay as optional overrides. Strict-env-var-required behavior was producing user-identity-fallback failures across PRs #20 and #22 when env propagation was transient or stale; convention over configuration removes the dependency. CLAUDE.md "Further reading" updated to note the default-path-fallback convention. Spec: [`specs/2026-05-17-robust-default-paths-in-token-helpers.md`](specs/2026-05-17-robust-default-paths-in-token-helpers.md).
```
