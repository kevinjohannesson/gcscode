# Per-role bot identities for reviewers

**Slug:** per-role-bot-identities-for-reviewers
**Iteration on the agentic-team track:** twelfth. Third of the seven queued items from [`docs/specs/2026-05-16-agentic-team-debt-clearing-v1.md`](2026-05-16-agentic-team-debt-clearing-v1.md), following queued #1 (ADR-0009) and queued #2 (respondent-subagent-v2).
**Type:** new helper script, agent-config.json shape change, CLAUDE.md edits (registry table `identity` cells, dispatch prompt requirements bullet), reviewer prompt template edits (helper invocation), respondent prompt template edit (reviewer filter), auto-merge workflow filter update, docs propagation. No new logic in `shell/`. Requires 5 new GitHub Apps to be created out of band by the user.
**No bootstrap exceptions.** Spec ships via spec-PR workflow; implementation lands per the post-merge implementation convention.

## Context

`gcscode-reviewer[bot]` (introduced by the reviews-as-artifacts iteration, [`2026-05-12-reviews-as-artifacts.md`](2026-05-12-reviews-as-artifacts.md)) is a single GitHub App identity shared across all 5 reviewer roles in the agentic-actor registry: Spec-compliance, Code-quality, Final cross-cutting, Red-team, Spec-quality. Per-role disambiguation lives in the review header (`## Red-team review — spec — Claude Opus 4.7` etc.).

Two factors make the shared-identity scheme less load-bearing post-respondent-v2:

1. **Identity granularity is now part of the architecture's vocabulary.** Respondent v1 introduced `gcscode-respondent[bot]` as a distinct identity from `gcscode-reviewer[bot]`, and ADR-0009 codified the actor-class concept (reviewer vs respondent). The "per-role identities" question goes from "would be nice" to "what does the registry want?" once two actor classes exist with structurally-different identities. The registry's `identity` column was added in ADR-0008 as a forward-looking field even when all rows shared one value (per CLAUDE.md's Reviewer-role design conventions); v3 fills that field with per-row distinct values. ADR-0009's "Related" section (queued #3 follow-up) anticipated this iteration explicitly: "splits `gcscode-reviewer[bot]` into per-role App identities... the `identity` column gets per-row distinct values instead of the uniform v1 value." This spec is that follow-up.
2. **Auto-merge gate currently relies on a brittle `(identity + body-prefix)` filter.** `.github/workflows/auto-merge.yml` counts red-team and spec-quality reviews by `select(.author.login == "gcscode-reviewer") | select(.body | startswith("## Red-team review"))`. Per-role identities collapse this to identity-only filters, removing the body-prefix coupling.

The roadmap entry's trigger ("after respondent v2 establishes the multi-actor pattern, OR when the first domain-expert reviewer is added") fired on the first clause when respondent v2 shipped earlier today (2026-05-16). The debt-clearing iteration's unconditional drain commitment overrides any soft-trigger holdouts: queued items ship sequentially. This is queued item #3.

## Why not the bigger version

The bigger version would include:

- **Unify reviewer + respondent helper into one parameterized script.** Single `gh-app-token <actor-slug>` covers all 6 identities. **Smaller wedge:** keep respondent's helper separate; per-role split is reviewer-side only. **Bigger wedge:** rewires respondent infrastructure that just stabilized in v2; scope creep into a different actor class. v3 accepts the asymmetry (`gh-app-token-reviewer` parameterized; `gh-app-token-respondent` point-to-file) as a tradeoff for not disturbing respondent.
- **Per-model identities for the multi-model red-team pair.** Split `gcscode-red-team[bot]` into `gcscode-red-team-opus[bot]` + `gcscode-red-team-sonnet[bot]`. **Smaller wedge:** one identity per role (Opus + Sonnet both post under `gcscode-red-team[bot]`; model surfaced in header). **Bigger wedge:** the multi-model evaluation iteration (queued separately) may resolve to single-model, making per-model identities moot. Per-model identities are a future iteration if multi-model survives the evaluation.
- **Backwards-compat shim for `gcscode-reviewer[bot]`.** Keep `gh-app-token` as an alias for `gh-app-token-reviewer red-team` (or some fallback). **Smaller wedge:** clean retire — `.claude/scripts/gh-app-token` is deleted. If a future emergency demands the old App, the **script** can be reinstated via git history; the **App and its PEM** cannot be reinstated from git (PEMs never enter git; if the App is deleted on GitHub it is gone). Reinstating the App would require creating a new GitHub App and regenerating credentials. **Bigger wedge:** documented dual-mode adds maintenance and decision-point ambiguity.
- **Bot permissions audit.** Tighten per-role App permissions (e.g., spec-compliance reviewer doesn't need write access to all PRs; only feature-PRs it's dispatched on). **Smaller wedge:** each new App is configured with the same permissions as `gcscode-reviewer` (read repo content + write PR reviews). **Bigger wedge:** per-role permissions design is a separate concern; v3 ships uniform permissions.
- **Historical post backfill.** Rewrite historical `gcscode-reviewer[bot]` posts to per-role identities. **Smaller wedge:** historical posts stay under `gcscode-reviewer[bot]` (GitHub doesn't support post-author rewriting anyway). **Bigger wedge:** technically impossible without deleting + reposting, which destroys the audit trail.

This iteration ships: 5 new bot identities (one per reviewer role), one new parameterized helper, config-shape change, CLAUDE.md + prompt + workflow updates, clean retirement of `gcscode-reviewer[bot]`. No bundled fixes.

## Goals

1. Create 5 new GitHub App identities, one per reviewer role: `gcscode-spec-compliance`, `gcscode-code-quality`, `gcscode-final-review`, `gcscode-red-team`, `gcscode-spec-quality`. (Operational, done by user out of band; spec specifies what gets configured.)
2. Add `.claude/scripts/gh-app-token-reviewer` — a parameterized helper that takes a role-slug argument and returns the installation token for that role's App.
3. Delete `.claude/scripts/gh-app-token` (retired with `gcscode-reviewer[bot]`).
4. Restructure `.claude/agent-config.json`: top-level `githubApp` key removed; new top-level `reviewerApps` key with per-role sub-objects; `respondentApp` key unchanged.
5. Update the agentic-actor registry table — 5 reviewer rows have their `identity` cell value flipped from `gcscode-reviewer[bot]` to `gcscode-<role-slug>[bot]`.
6. Update CLAUDE.md "Dispatch prompt requirements" bullet to specify the role-slug parameter.
7. Update `.claude/reviewer-prompts/red-team.md` and `.claude/reviewer-prompts/spec-quality.md` "How to post" sections to use the new parameterized helper.
8. Update `.claude/reviewer-prompts/respondent.md` reviewer filter from `select(.author.login == "gcscode-reviewer")` to explicit per-identity enumeration covering all 5 new identities.
9. Update `.github/workflows/auto-merge.yml` filter from `(identity + body-prefix)` to identity-only per-role.
10. Documentation propagation: roadmap.md (flip "Per-role bot identities for reviewers" from Considering to Queued `[x]`); reviews-as-artifacts spec breadcrumb (per the specs-as-historical-record convention).

## Non-goals (this iteration)

Each has its own queued item or established future trigger.

- **Respondent identity changes.** Respondent stays as `gcscode-respondent[bot]`; helper script unchanged.
- **Unified reviewer + respondent helper.** Future-iteration trigger if the asymmetry produces real maintenance pain.
- **Per-model identities for multi-model red-team pair.** Future-iteration trigger if multi-model survives the queued evaluation iteration.
- **Bot permissions audit.** Locked down further in a future iteration if needed; v3 uses uniform permissions.
- **Historical post backfill.** Pre-iteration posts stay under `gcscode-reviewer[bot]`.
- **Backwards-compat shim** (keep `gh-app-token` as an alias). Clean retire.
- **Custom dispatch for feature-PR reviewers** (queued separately). Per-task spec-compliance + code-quality reviewers still dispatch via `superpowers:subagent-driven-development`; per-role identity is injected via the controller's dispatch prompt under the existing pattern.
- **Pre-merge mechanics validation.** Same structural constraint as PRs #11-#16. The new helper + config + per-role identities don't exist until post-merge implementation lands; smoke test (Plan 1) runs post-merge.

## Architecture

### Identity naming

Five new GitHub App identities, one per reviewer role. The slug is used in 4 places: the GitHub App's `slug`/username (which determines the rendered `[bot]` identity), the helper script's argument, the PEM filename, and the `reviewerApps` config key. The slug for `Final cross-cutting` is shortened to `final-review` for legibility.

| Role                | Role-slug         | Bot username (rendered)        |
| ------------------- | ----------------- | ------------------------------ |
| Spec-compliance     | `spec-compliance` | `gcscode-spec-compliance[bot]` |
| Code-quality        | `code-quality`    | `gcscode-code-quality[bot]`    |
| Final cross-cutting | `final-review`    | `gcscode-final-review[bot]`    |
| Red-team            | `red-team`        | `gcscode-red-team[bot]`        |
| Spec-quality        | `spec-quality`    | `gcscode-spec-quality[bot]`    |

**Mapping the role to its slug:** the slug derives from the role name in kebab-case with one exception — `Final cross-cutting` → `final-review` (not `final-cross-cutting`). The exception is a **legibility judgment, not a length-limit constraint**: `gcscode-final-cross-cutting` is 27 chars and clears GitHub's 34-char App-name hard limit by 7 chars, but `final-review` captures the role's function ("the final review on a feature-PR") and reads cleaner inline. `final-review` is the only role with a slug that isn't a direct kebab-case of the registry's `Role` value. Spec calls this out explicitly so future readers know `final-review` ≡ "Final cross-cutting" in the registry. **Programmatic-transform note:** future automation that derives the slug from the Role value programmatically must special-case this row — it is a hand-curated exception, not a derivable transform.

**Multi-model red-team:** Opus + Sonnet both post under `gcscode-red-team[bot]`. One identity per role, not per role-model pair. Model is still surfaced in the review header.

**Header convention:** unchanged. `## Red-team review — spec — Claude Opus 4.7` etc. stays verbatim. Identity adds info; the header survives identity-blind reads (CLI diffs, archived markdown, GitHub Actions log scrapes).

### Helper script `.claude/scripts/gh-app-token-reviewer`

Parameterized: takes one positional argument, the role-slug. Returns the installation token for that role's App on stdout. Same internal structure as the existing helpers — reads `reviewerApps.<role-slug>.appId` + `reviewerApps.<role-slug>.installationId` from `.claude/agent-config.json`, reads private key from `$GH_REVIEWER_APP_PRIVATE_KEY_DIR/gcscode-<role-slug>.pem`, generates a 9-minute JWT, exchanges for installation token via the GitHub API.

**Validates:** role-slug must be one of `spec-compliance`, `code-quality`, `final-review`, `red-team`, `spec-quality`. Unknown slug aborts with a legible error. Missing env var aborts. Missing config aborts. Missing PEM file aborts.

Full verbatim content in Post-merge implementation > Commit 1.

### Config shape `.claude/agent-config.json`

Before:

```json
{
  "githubApp": { "appId": "3693536", "installationId": "131834383" },
  "respondentApp": { "appId": "3733841", "installationId": "132842105" }
}
```

After:

```json
{
  "reviewerApps": {
    "spec-compliance": { "appId": "<filled-post-merge>", "installationId": "<filled-post-merge>" },
    "code-quality":    { "appId": "<filled-post-merge>", "installationId": "<filled-post-merge>" },
    "final-review":    { "appId": "<filled-post-merge>", "installationId": "<filled-post-merge>" },
    "red-team":        { "appId": "<filled-post-merge>", "installationId": "<filled-post-merge>" },
    "spec-quality":    { "appId": "<filled-post-merge>", "installationId": "<filled-post-merge>" }
  },
  "respondentApp": { "appId": "3733841", "installationId": "132842105" }
}
```

The top-level `githubApp` key is **removed** (its consumer — `.claude/scripts/gh-app-token` — is also deleted). `respondentApp` key is **untouched** (the existing values stay).

### PEM location

- Env var: `GH_REVIEWER_APP_PRIVATE_KEY_DIR` (one env var, points to the parent directory).
- PEM filenames by role-slug: `gcscode-<role-slug>.pem`. All 5 in `$GH_REVIEWER_APP_PRIVATE_KEY_DIR/`.
- User stores these in `~/.config/gcscode/` alongside the existing PEMs, per established convention.
- Existing `~/.config/gcscode/gcscode-reviewer.pem` may be deleted post-merge once the App is uninstalled or deleted on GitHub. Operational call, not load-bearing on this spec.
- The existing `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` env var (used by `gh-app-token-respondent`) is **untouched** — respondent stays on point-to-specific-file.

### Controller dispatch prompts

CLAUDE.md "Subagent reviewer PR-posting discipline > Dispatch prompt requirements" currently specifies:

> The token-helper invocation as a first step: `export GH_TOKEN=$(.claude/scripts/gh-app-token)`. Subsequent `gh` calls run under the `gcscode-reviewer[bot]` identity.

Rewritten:

> The token-helper invocation as a first step: `export GH_TOKEN=$(.claude/scripts/gh-app-token-reviewer <role-slug>)` where `<role-slug>` matches the reviewer role being dispatched (`spec-compliance`, `code-quality`, `final-review`, `red-team`, or `spec-quality`). Subsequent `gh` calls run under the corresponding per-role identity (`gcscode-<role-slug>[bot]`).

Each reviewer dispatch (per-task spec-compliance, per-task code-quality, final cross-cutting, red-team, spec-quality) substitutes the appropriate role-slug. Feature-PR reviewers dispatched via `superpowers:subagent-driven-development` receive the invocation in the dispatch prompt the controller constructs per the existing pattern (the controller has full control over the dispatch prompt body even for superpowers-routed dispatches).

### Reviewer prompt templates

`.claude/reviewer-prompts/red-team.md` and `.claude/reviewer-prompts/spec-quality.md` each carry a "How to post" example with a hard-coded `gh-app-token` invocation. Both get updated to the parameterized form with the corresponding role-slug.

Full verbatim content in Post-merge implementation > Commits 4a–4b.

### Respondent prompt template

`.claude/reviewer-prompts/respondent.md` "Structured inputs" section currently filters reviewer reviews by:

```jq
select(.author.login == "gcscode-reviewer")
```

Post-iteration this becomes:

```jq
select(.author.login | IN("gcscode-spec-compliance", "gcscode-code-quality", "gcscode-final-review", "gcscode-red-team", "gcscode-spec-quality"))
```

Explicit enumeration was chosen over a `startswith("gcscode-") and != "gcscode-respondent"` prefix filter because explicit enumeration is unambiguous and forces a deliberate edit when future reviewer roles are added. The brittleness is a feature: a new reviewer role's iteration will edit this filter as part of its own work.

Full verbatim content in Post-merge implementation > Commit 4c.

### Auto-merge workflow

`.github/workflows/auto-merge.yml` currently counts red-team and spec-quality reviews on spec/ADR PRs via:

```bash
REDTEAM_COUNT=$(echo "$PR_JSON" | jq -r '[.reviews[] | select(.author.login == "gcscode-reviewer") | select(.body | startswith("## Red-team review"))] | length')
SPECQUALITY_COUNT=$(echo "$PR_JSON" | jq -r '[.reviews[] | select(.author.login == "gcscode-reviewer") | select(.body | startswith("## Spec-quality review"))] | length')
```

Post-iteration these simplify to identity-only:

```bash
REDTEAM_COUNT=$(echo "$PR_JSON" | jq -r '[.reviews[] | select(.author.login == "gcscode-red-team")] | length')
SPECQUALITY_COUNT=$(echo "$PR_JSON" | jq -r '[.reviews[] | select(.author.login == "gcscode-spec-quality")] | length')
```

The body-prefix coupling is removed. The workflow's other logic (label check, mergeable check, class-aware gate selection) is untouched.

**Multi-model count behavior.** Under multi-model red-team dispatch (per [`2026-05-16-multi-model-red-team-v1.md`](2026-05-16-multi-model-red-team-v1.md)), both Opus and Sonnet post under `gcscode-red-team[bot]`, so `REDTEAM_COUNT >= 2` per round. The gate threshold is `> 0`, so the gate is over-satisfied by design; the raw count is still informative for log diagnosis. The pre-iteration filter (`startswith("## Red-team review")` text-match) had the same property — both filters return the count of red-team reviews regardless of model.

**Filter trust model.** The old `(identity + body-prefix)` filter was unforgeable on the identity dimension (only the App can post under its login) AND coupled to body content (an attacker would also need to know the prefix string). The new identity-only filter is strictly stricter on body content (it doesn't check) AND strictly stricter on identity (only one App per role passes). Net result: the entire correctness load now sits on the per-role App PEM. This is a cleaner shape, not free correctness — the new filter trusts the App's PEM strictly more than the old filter did. GitHub App-owned identities still cannot be impersonated by user accounts, so the "no non-bot author can post under `gcscode-red-team` or `gcscode-spec-quality`" assumption holds structurally for the impersonation dimension; the trust shift is around what a compromised App PEM (vs. an attacker who doesn't know the prefix string) would buy. If a future iteration adds a human reviewer who posts a `## Red-team review` markdown-prefixed comment, that iteration is responsible for updating the filter logic.

Full verbatim content in Post-merge implementation > Commit 4d.

### In-flight PR transition handling

Mirrors the respondent-v2 precedent (CLAUDE.md "In-flight PR transition handling"):

- **PRs opened BEFORE this iteration's post-merge implementation** finish using `gcscode-reviewer[bot]` for all re-reviews. Don't switch dispatch identities mid-PR.
- **PRs opened AFTER post-merge implementation** use per-role identities from their first review forward.
- This iteration's own PR uses `gcscode-reviewer[bot]` for its own initial reviews and re-reviews — the per-role helper + config don't exist until post-merge.

**Auto-merge gate transition consequence:** spec/ADR PRs that opened pre-merge and complete post-merge land in the new workflow with reviews under `gcscode-reviewer[bot]`. The new filter (identity-only `gcscode-red-team` / `gcscode-spec-quality`) returns 0 → auto-merge gate fails. Such PRs must be merged manually via `gh pr merge --merge <num>`. This is a one-time cliff affecting at most a couple of in-flight PRs at this iteration's merge boundary.

### Retirement of `gcscode-reviewer[bot]`

After post-merge implementation lands:

- The `gcscode-reviewer` App is **no longer used for new posts.** All future reviewer dispatches use per-role identities.
- Historical posts under `gcscode-reviewer[bot]` **remain in PR timelines.** GitHub doesn't delete posts when an App is deleted; the post stays attributed to its historical author.
- The user may **uninstall** the App from the gcscode repo (revokes its tokens) and/or **delete** the App from github.com at their discretion. Spec recommends keeping the App alive but uninstalled to preserve the bot icon on historical posts; deleting the App turns historical posts into "ghost" attribution. Operational call, not load-bearing on this spec.
- The local PEM at `~/.config/gcscode/gcscode-reviewer.pem` can be deleted at the user's discretion.

## Operational prerequisite — GitHub App creation

This is the manual UI work the user does on github.com out of band, between spec-merge and post-merge implementation Commit 2 (the config-population commit). The post-merge implementation flow will pause at Commit 2 and surface these instructions inline; this section is the authoritative reference.

### Per-App creation steps (repeat 5 times)

For each of the 5 new identities — `gcscode-spec-compliance`, `gcscode-code-quality`, `gcscode-final-review`, `gcscode-red-team`, `gcscode-spec-quality`:

1. **Visit** https://github.com/settings/apps/new.
2. **Name:** `gcscode-<role-slug>` (exactly — this determines the rendered `[bot]` username). For example, `gcscode-red-team`.
3. **Description** (optional, recommended): "Per-role bot identity for the <role> reviewer in gcscode. See [docs/specs/2026-05-16-per-role-bot-identities-for-reviewers.md](https://github.com/kevinjohannesson/gcscode/blob/master/shell/docs/specs/2026-05-16-per-role-bot-identities-for-reviewers.md)."
4. **Homepage URL:** `https://github.com/kevinjohannesson/gcscode` (any non-empty URL works; GitHub requires this field).
5. **Webhook:** uncheck "Active" — these Apps don't receive webhooks; they only post.
6. **Repository permissions** (mirrors `gcscode-reviewer` permissions):
   - **Contents:** Read-only
   - **Pull requests:** Read and write
   - **Metadata:** Read-only (default; cannot be unchecked)
   - All other permissions: No access.
7. **Where can this GitHub App be installed?** Select "Only on this account" (locks it to your account).
8. **Click "Create GitHub App".**
9. On the App's settings page:
   - **Note the App ID** (numeric, near the top of the page). You'll provide this to me.
   - **Scroll to "Private keys"** → click "Generate a private key". Browser downloads a `.pem` file.
   - **Rename and move the PEM:** `mv ~/Downloads/gcscode-<role-slug>.<timestamp>.private-key.pem ~/.config/gcscode/gcscode-<role-slug>.pem` (rename to drop the timestamp suffix so the helper script's filename convention is satisfied).
10. **Install the App on the gcscode repo:**
    - On the App's settings page, click "Install App" in the left sidebar.
    - Click "Install" next to your account.
    - Select "Only select repositories" → `kevinjohannesson/gcscode` → click "Install".
    - You're redirected to the installation page; the URL ends in `/installations/<NUMBER>`. **Note the installation ID** (the trailing number).

### Credentials to provide to me

After all 5 Apps are created + installed, paste me a block in this shape:

```
spec-compliance: appId=<...>, installationId=<...>
code-quality:    appId=<...>, installationId=<...>
final-review:    appId=<...>, installationId=<...>
red-team:        appId=<...>, installationId=<...>
spec-quality:    appId=<...>, installationId=<...>
```

I'll write these into the new `reviewerApps` keys in `.claude/agent-config.json` for Commit 2.

### Environment variable to add to your shell config

Add to your `~/.zshrc` (or equivalent):

```bash
export GH_REVIEWER_APP_PRIVATE_KEY_DIR="$HOME/.config/gcscode"
```

This points the helper at the directory where all 5 new PEMs live. `source ~/.zshrc` (or open a new terminal) for the next post-merge session to pick it up.

### Local `settings.local.json` update (user-local, gitignored)

`shell/.claude/settings.local.json` is globally gitignored (via `~/.config/git/ignore`), so this is not a spec commit — but it's part of the post-merge operational setup. The file currently contains the permission entry `Bash(.claude/scripts/gh-app-token)`; after post-merge the helper is renamed. Update the local file to replace the old entry with `Bash(.claude/scripts/gh-app-token-reviewer)` (or `Bash(.claude/scripts/gh-app-token-reviewer:*)` if you prefer to allow all argument forms). Otherwise the new helper invocation will produce a permission prompt the first time it runs.

### Verification

Once all 5 Apps are created, installed, PEMs in place, env var set, and config populated, you can sanity-check each App by running:

```bash
GH_REVIEWER_APP_PRIVATE_KEY_DIR=~/.config/gcscode \
  /Users/kevinkroon/Projects/gcscode/.claude/scripts/gh-app-token-reviewer red-team
```

(Substitute each role-slug.) Each should print a token. If any fails, the helper's error message identifies which config/PEM is missing or invalid.

## Post-merge implementation

Per the post-merge implementation convention, five direct-master commits. All content fully specified verbatim below; the only judgment required is during Commit 2 (config population) where you provide the appId/installationId values.

- **Commit 1:** Create `.claude/scripts/gh-app-token-reviewer` with verbatim content below. Delete `.claude/scripts/gh-app-token`.
- **Commit 2:** Replace `.claude/agent-config.json` with the new shape, populated with the credentials you provide.
- **Commit 3:** CLAUDE.md edits — registry table `identity` cells (5 rows) + "Dispatch prompt requirements" bullet rewrite + any inline `gcscode-reviewer[bot]` references that aren't historical citations.
- **Commit 4:** Four sub-edits — (4a) `.claude/reviewer-prompts/red-team.md` helper invocation; (4b) `.claude/reviewer-prompts/spec-quality.md` helper invocation; (4c) `.claude/reviewer-prompts/respondent.md` reviewer filter; (4d) `.github/workflows/auto-merge.yml` filter logic.
- **Commit 5:** Documentation propagation — roadmap.md flip + reviews-as-artifacts breadcrumb + `out-of-scope.md` per-model-identities entry.

### Verbatim — Commit 1 (`.claude/scripts/gh-app-token-reviewer`)

Create the new file with the following content (chmod 755). Delete `.claude/scripts/gh-app-token` in the same commit.

````bash
#!/usr/bin/env bash
# Generates a short-lived GitHub App installation token for a per-role gcscode reviewer.
# Usage: gh-app-token-reviewer <role-slug>
# Valid role-slugs: spec-compliance, code-quality, final-review, red-team, spec-quality
# Reads App ID + installation ID from .claude/agent-config.json under reviewerApps.<role-slug>.
# Reads private key from $GH_REVIEWER_APP_PRIVATE_KEY_DIR/gcscode-<role-slug>.pem.
# Prints the installation token to stdout.

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "gh-app-token-reviewer: usage: gh-app-token-reviewer <role-slug>" >&2
  echo "gh-app-token-reviewer: valid role-slugs: spec-compliance, code-quality, final-review, red-team, spec-quality" >&2
  exit 1
fi

role_slug="$1"

case "$role_slug" in
  spec-compliance|code-quality|final-review|red-team|spec-quality) ;;
  *)
    echo "gh-app-token-reviewer: unknown role-slug: $role_slug" >&2
    echo "gh-app-token-reviewer: valid role-slugs: spec-compliance, code-quality, final-review, red-team, spec-quality" >&2
    exit 1
    ;;
esac

script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
config="$script_dir/../agent-config.json"

if [[ ! -f "$config" ]]; then
  echo "gh-app-token-reviewer: $config not found" >&2
  exit 1
fi

if [[ -z "${GH_REVIEWER_APP_PRIVATE_KEY_DIR:-}" ]]; then
  echo "gh-app-token-reviewer: GH_REVIEWER_APP_PRIVATE_KEY_DIR not set" >&2
  exit 1
fi

pem_path="$GH_REVIEWER_APP_PRIVATE_KEY_DIR/gcscode-$role_slug.pem"

if [[ ! -f "$pem_path" ]]; then
  echo "gh-app-token-reviewer: private key not found at $pem_path" >&2
  exit 1
fi

app_id=$(jq -r ".reviewerApps[\"$role_slug\"].appId" "$config")
installation_id=$(jq -r ".reviewerApps[\"$role_slug\"].installationId" "$config")

if [[ "$app_id" == "null" || "$installation_id" == "null" ]]; then
  echo "gh-app-token-reviewer: appId or installationId missing for $role_slug in $config" >&2
  exit 1
fi

if ! [[ "$app_id" =~ ^[0-9]+$ ]]; then
  echo "gh-app-token-reviewer: appId must be a numeric string, got: $app_id" >&2
  exit 1
fi

if ! [[ "$installation_id" =~ ^[0-9]+$ ]]; then
  echo "gh-app-token-reviewer: installationId must be a numeric string, got: $installation_id" >&2
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
  | openssl dgst -sha256 -sign "$pem_path" -binary \
  | b64url)
jwt="$header.$payload.$signature"

response=$(curl -sS -X POST \
  -H "Authorization: Bearer $jwt" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/app/installations/$installation_id/access_tokens")

token=$(printf '%s' "$response" | jq -r .token)

if [[ "$token" == "null" || -z "$token" ]]; then
  echo "gh-app-token-reviewer: GitHub did not return a token. Response:" >&2
  printf '%s\n' "$response" >&2
  exit 1
fi

printf '%s\n' "$token"
````

Make executable: `chmod 755 .claude/scripts/gh-app-token-reviewer`.

Delete `.claude/scripts/gh-app-token` in the same commit (`git rm`).

### Verbatim — Commit 2 (`.claude/agent-config.json` replacement)

Replace the entire contents of `.claude/agent-config.json` with the following structure, filling the placeholder values with the appIds and installationIds the user provided after creating the 5 Apps:

````json
{
  "reviewerApps": {
    "spec-compliance": { "appId": "<USER-PROVIDED>", "installationId": "<USER-PROVIDED>" },
    "code-quality":    { "appId": "<USER-PROVIDED>", "installationId": "<USER-PROVIDED>" },
    "final-review":    { "appId": "<USER-PROVIDED>", "installationId": "<USER-PROVIDED>" },
    "red-team":        { "appId": "<USER-PROVIDED>", "installationId": "<USER-PROVIDED>" },
    "spec-quality":    { "appId": "<USER-PROVIDED>", "installationId": "<USER-PROVIDED>" }
  },
  "respondentApp": { "appId": "3733841", "installationId": "132842105" }
}
````

The `respondentApp` values are preserved verbatim from the current file. The `<USER-PROVIDED>` placeholders are replaced with the actual numeric strings the user provides per the "Operational prerequisite — GitHub App creation" section above.

### Verbatim — Commit 3 (CLAUDE.md edits)

**3a — Agentic-actor registry table `identity` column.** In the 13-column agentic-actor registry table (locate via `grep -n "^| Actor class | Role" shell/CLAUDE.md`), replace the `identity` cell for each of the 5 reviewer rows:

| Row (by `Role` column value) | Before                    | After                          |
| ----------------------------- | ------------------------- | ------------------------------ |
| `Spec-compliance`             | `` `gcscode-reviewer[bot]` ``   | `` `gcscode-spec-compliance[bot]` `` |
| `Code-quality`                | `` `gcscode-reviewer[bot]` ``   | `` `gcscode-code-quality[bot]` ``    |
| `Final cross-cutting`         | `` `gcscode-reviewer[bot]` ``   | `` `gcscode-final-review[bot]` ``    |
| `Red-team`                    | `` `gcscode-reviewer[bot]` ``   | `` `gcscode-red-team[bot]` ``        |
| `Spec-quality`                | `` `gcscode-reviewer[bot]` ``   | `` `gcscode-spec-quality[bot]` ``    |

The `respondent` row's `identity` cell stays `` `gcscode-respondent[bot]` ``.

**3b — "Dispatch prompt requirements" bullet rewrite.** Replace the existing bullet:

> The token-helper invocation as a first step: `export GH_TOKEN=$(.claude/scripts/gh-app-token)`. Subsequent `gh` calls run under the `gcscode-reviewer[bot]` identity.

With:

> The token-helper invocation as a first step: `export GH_TOKEN=$(.claude/scripts/gh-app-token-reviewer <role-slug>)` where `<role-slug>` matches the reviewer role being dispatched (`spec-compliance`, `code-quality`, `final-review`, `red-team`, or `spec-quality`). Subsequent `gh` calls run under the corresponding per-role identity (`gcscode-<role-slug>[bot]`).

**3c — "Auto-dispatch on spec/ADR PRs" subsection.** The phrase "each posts an independent review under the `gcscode-reviewer[bot]` identity" — replace with: "each posts an independent review under its per-role identity (`gcscode-red-team[bot]` for red-team dispatches; `gcscode-spec-quality[bot]` for spec-quality)."

**3d — Feature-PR template + Spec/ADR-PR template footer lines.** Both PR-template blocks in CLAUDE.md currently end with:

> 🤖 Reviews authored by `gcscode-reviewer[bot]` — see [docs/specs/2026-05-12-reviews-as-artifacts.md](../blob/master/shell/docs/specs/2026-05-12-reviews-as-artifacts.md) for the workflow.

Replace with (in both templates):

> 🤖 Reviews authored by per-role bot identities (`gcscode-spec-compliance[bot]`, `gcscode-code-quality[bot]`, `gcscode-final-review[bot]`, `gcscode-red-team[bot]`, `gcscode-spec-quality[bot]`) — see [docs/specs/2026-05-12-reviews-as-artifacts.md](../blob/master/shell/docs/specs/2026-05-12-reviews-as-artifacts.md) and [docs/specs/2026-05-16-per-role-bot-identities-for-reviewers.md](../blob/master/shell/docs/specs/2026-05-16-per-role-bot-identities-for-reviewers.md) for the workflow.

**3e — Reviewer-role design conventions > "`identity` field in the registry" subsection.** The paragraph currently reads:

> **`identity` field in the registry, even when all roles share one bot.** Every entry in the reviewer-role registry carries an `identity` field. In v1 all roles share `gcscode-reviewer[bot]`, so the column is uniform — but it's there. Adding the field early is cheap; retrofitting when the future distinct-App-identities-per-reviewer-role iteration lands would mean editing every row.

Replace with (preserving the design-convention itself, updating the "v1 all roles share" framing to historical):

> **`identity` field in the registry, even when all roles share one bot.** Every entry in the agentic-actor registry carries an `identity` field. The reviewer-role registry's v1 (ADR-0008, 2026-05-14) had all reviewer roles sharing `gcscode-reviewer[bot]`; the column existed as a forward-looking field even when uniform. The per-role bot identities iteration (2026-05-16, [`docs/specs/2026-05-16-per-role-bot-identities-for-reviewers.md`](docs/specs/2026-05-16-per-role-bot-identities-for-reviewers.md)) filled per-row distinct values. Lesson: adding a structural field early — even when its values are uniform — costs less than retrofitting when the divergence iteration lands. Future reviewer-role registry expansions should preserve this discipline (e.g., a future `permissions` column added before per-role permissions diverge).

**3f — "Identity" header line in the Respondent posting discipline subsection.** The line `**Identity:** \`gcscode-respondent[bot]\`. Distinct from \`gcscode-reviewer[bot]\`. Same posting permissions on PRs; different audit-trail attribution.` — replace the `gcscode-reviewer[bot]` reference:

> **Identity:** `gcscode-respondent[bot]`. Distinct from the per-role reviewer identities (`gcscode-spec-compliance[bot]`, `gcscode-code-quality[bot]`, `gcscode-final-review[bot]`, `gcscode-red-team[bot]`, `gcscode-spec-quality[bot]`). Same posting permissions on PRs; different audit-trail attribution.

**3g — "Config locations" line.** The line `**Config locations:** App ID and installation ID live in \`.claude/agent-config.json\` (versioned). Private key path is read from \`GH_APP_PRIVATE_KEY_PATH\` env var; the PEM file never enters git.` — replace:

> **Config locations:** App IDs and installation IDs live in `.claude/agent-config.json` under `reviewerApps.<role-slug>` (versioned). Private keys live at `$GH_REVIEWER_APP_PRIVATE_KEY_DIR/gcscode-<role-slug>.pem` for reviewer roles; PEM files never enter git. (Respondent uses `respondentApp` + `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` as before.)

**3h — Token-helper script reference.** The line `**\`.claude/scripts/gh-app-token\`** — helper that generates short-lived installation tokens. Reviewer subagents call \`export GH_TOKEN=$(.claude/scripts/gh-app-token)\` before \`gh pr review\`.` (in the "Further reading" section) — replace:

> **`.claude/scripts/gh-app-token-reviewer`** — helper that generates short-lived installation tokens for per-role reviewer identities. Takes a role-slug argument. Reviewer subagents call `export GH_TOKEN=$(.claude/scripts/gh-app-token-reviewer <role-slug>)` before `gh pr review`. (Respondent uses `.claude/scripts/gh-app-token-respondent`.)

**3i — "Further reading" `.claude/agent-config.json` bullet.** The line `**\`.claude/agent-config.json\`** — App ID and installation ID for the \`gcscode-reviewer\` GitHub App. Private key path lives in \`GH_APP_PRIVATE_KEY_PATH\` env var, not in repo.` — replace:

> **`.claude/agent-config.json`** — App IDs and installation IDs for the per-role reviewer GitHub Apps (under the `reviewerApps` key, one sub-object per role-slug) and for the respondent App (under `respondentApp`). Private key paths live in `GH_REVIEWER_APP_PRIVATE_KEY_DIR` (a directory containing per-role PEMs) and `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` env vars; PEM files never enter git.

**3j — "Respondent posting discipline > Config" bullet.** The line `**Config:** App ID and installation ID live in \`.claude/agent-config.json\` under the \`respondentApp\` key (additive; reviewer's \`githubApp\` key untouched). Private key path is read from the \`GH_RESPONDENT_APP_PRIVATE_KEY_PATH\` env var; the PEM file never enters git.` — replace the parenthetical:

> **Config:** App ID and installation ID live in `.claude/agent-config.json` under the `respondentApp` key (sibling to the per-role `reviewerApps` keys). Private key path is read from the `GH_RESPONDENT_APP_PRIVATE_KEY_PATH` env var; the PEM file never enters git.

### Verbatim — Commit 4 (four sub-edits)

**4a — `.claude/reviewer-prompts/red-team.md`.** Locate the line containing `GH_TOKEN=$(.claude/scripts/gh-app-token)` and replace with `GH_TOKEN=$(.claude/scripts/gh-app-token-reviewer red-team)`. Pre-edit verification: `grep -n "gh-app-token" .claude/reviewer-prompts/red-team.md` should show exactly one occurrence. If multiple occurrences exist, reconcile each one with the role-slug `red-team`.

**4b — `.claude/reviewer-prompts/spec-quality.md`.** Same as 4a but with `spec-quality`: locate `GH_TOKEN=$(.claude/scripts/gh-app-token)` and replace with `GH_TOKEN=$(.claude/scripts/gh-app-token-reviewer spec-quality)`.

**4c — `.claude/reviewer-prompts/respondent.md` reviewer filter.** In the "Structured inputs" section, locate the jq filter block (currently around line 24–26):

````
.reviews[]
| select(.author.login == "gcscode-reviewer")
| select(.body | test("^## {{ROLE_LABEL}} review — (spec|ADR)( \\(re-review of [0-9a-f]+\\))? — {{REVIEWER_MODEL}}\\b"))
````

Replace with:

````
.reviews[]
| select(.author.login | IN("gcscode-spec-compliance", "gcscode-code-quality", "gcscode-final-review", "gcscode-red-team", "gcscode-spec-quality"))
| select(.body | test("^## {{ROLE_LABEL}} review — (spec|ADR)( \\(re-review of [0-9a-f]+\\))? — {{REVIEWER_MODEL}}\\b"))
````

The body-test second filter is unchanged (the header convention still discriminates by role-label + model for re-review tie-breaking). The note about `.author.login` carrying the App name without `[bot]` suffix stays.

(Note: an earlier draft of this commit instructed grepping CLAUDE.md for `author.login.*gcscode-reviewer` and updating a sibling sentence there. That grep returns zero results — the literal jq filter text lives only in `respondent.md`. No CLAUDE.md edit is needed for the filter under 4c; CLAUDE.md's reviewer-filter reference is handled prose-only by Commit 3.)

**4d — `.github/workflows/auto-merge.yml` filter.** Locate the two `REDTEAM_COUNT` / `SPECQUALITY_COUNT` jq filter lines and replace per the "Architecture > Auto-merge workflow" section above:

Before:

````bash
REDTEAM_COUNT=$(echo "$PR_JSON" | jq -r '[.reviews[] | select(.author.login == "gcscode-reviewer") | select(.body | startswith("## Red-team review"))] | length')
SPECQUALITY_COUNT=$(echo "$PR_JSON" | jq -r '[.reviews[] | select(.author.login == "gcscode-reviewer") | select(.body | startswith("## Spec-quality review"))] | length')
````

After:

````bash
REDTEAM_COUNT=$(echo "$PR_JSON" | jq -r '[.reviews[] | select(.author.login == "gcscode-red-team")] | length')
SPECQUALITY_COUNT=$(echo "$PR_JSON" | jq -r '[.reviews[] | select(.author.login == "gcscode-spec-quality")] | length')
````

Also update the workflow's leading comment block at the top of the file (the `# spec/* or adr/*: BOTH \`gcscode-reviewer\` red-team AND spec-quality` line, currently around line 9) to reflect the per-role identities:

Before:

````
#         - spec/* or adr/*: BOTH `gcscode-reviewer` red-team AND spec-quality
````

After:

````
#         - spec/* or adr/*: BOTH `gcscode-red-team` AND `gcscode-spec-quality`
````

### Verbatim — Commit 5 (documentation propagation)

Two sub-edits:

**5a — roadmap.md flip.** In `shell/docs/roadmap.md`, move the existing Considering entry for "Per-role bot identities for reviewers":

**Pre-edit verification step.** Before deleting, run `grep -n "Per-role bot identities" shell/docs/roadmap.md` to locate the exact line. If the entry's wording has drifted since this spec was written, reconcile manually rather than running a verbatim delete that may match the wrong line.

**Before (in the Considering section, currently around line 82):**

````md
- [ ] **Per-role bot identities for reviewers** — long-standing Considering item; becomes load-bearing once respondent v2 ships (then we have reviewer bot + respondent bot + respondent subagent variants). Splits `gcscode-reviewer[bot]` into per-role App identities (`gcscode-red-team[bot]`, `gcscode-spec-quality[bot]`, etc.). Trigger: after respondent v2 establishes the multi-actor pattern, OR when the first domain-expert reviewer is added (whichever first).
````

DELETE the above entry from the Considering section, and ADD the following entry to the **Queued** section of the agentic-team architecture track, immediately after the existing "Respondent subagent v2" `[x]`-marked entry (the entry lives in the "Queued (each needs its own brainstorm + spec cycle)" section despite the `[x]` checkbox; Queued items become `[x]` once they ship):

````md
- [x] **Per-role bot identities for reviewers** — splits `gcscode-reviewer[bot]` into 5 per-role App identities (`gcscode-spec-compliance[bot]`, `gcscode-code-quality[bot]`, `gcscode-final-review[bot]`, `gcscode-red-team[bot]`, `gcscode-spec-quality[bot]`). New parameterized helper `.claude/scripts/gh-app-token-reviewer <role-slug>` replaces `.claude/scripts/gh-app-token`. Config restructured under `reviewerApps` key; PEM files under `$GH_REVIEWER_APP_PRIVATE_KEY_DIR/gcscode-<role-slug>.pem`. Auto-merge workflow filter simplifies from `(identity + body-prefix)` to identity-only. `gcscode-reviewer[bot]` formally retired. Respondent identity untouched. Spec: [`specs/2026-05-16-per-role-bot-identities-for-reviewers.md`](specs/2026-05-16-per-role-bot-identities-for-reviewers.md).
````

**5b — reviews-as-artifacts breadcrumb.** Per the specs-as-historical-record convention (CLAUDE.md "Specs as historical record"), append a one-line breadcrumb to `shell/docs/specs/2026-05-12-reviews-as-artifacts.md`. Locate the section that introduces the GitHub App identity (search for "Reviewer identity is a GitHub App" or similar — currently around line 24). Append the following blockquote immediately after that paragraph:

````md
> **per-role-bot-identities-for-reviewers breadcrumb (added 2026-05-16):** The single shared `gcscode-reviewer[bot]` identity introduced here was split into 5 per-role identities by [`2026-05-16-per-role-bot-identities-for-reviewers.md`](2026-05-16-per-role-bot-identities-for-reviewers.md) per the agentic-team debt-clearing v1 commitment ([`2026-05-16-agentic-team-debt-clearing-v1.md`](2026-05-16-agentic-team-debt-clearing-v1.md))'s queued-item-3 entry. The shared-identity scheme + the `gh-app-token` helper are historical as of 2026-05-16; per-role identities + `gh-app-token-reviewer <role-slug>` replace them. The retirement is a clean retire (no backwards-compat shim).
````

The breadcrumb does NOT modify the reviews-as-artifacts spec's substantive content — its design decisions stand as historical record. This is the third application of the specs-as-historical-record convention (first: ADR-0009 number-reservation; second: respondent-v2 supersession of v1's controller-direct premise).

**5c — `docs/out-of-scope.md` per-model-identities entry.** Append the entry specified in the "`docs/out-of-scope.md` propagation" section above to the "Agentic team architecture deferrals" section of `shell/docs/out-of-scope.md`. Locate the section via `grep -n "Agentic team architecture deferrals" shell/docs/out-of-scope.md`. Add the bullet at the bottom of that section (alongside the other agentic-team deferrals).

## Data flow — how this iteration ships

1. Brainstorm → spec → spec-PR. **Twelfth iteration shipping via the spec-PR workflow.**
2. **On PR open:** red-team Opus + red-team Sonnet + spec-quality auto-dispatch in parallel per the existing obligation. Reviews post under `gcscode-reviewer[bot]` per the in-flight PR transition rule (per-role identities don't exist yet).
3. User reads reviews + approves. `Code-review-followup:` commits trigger re-dispatch + respondent dispatch under the existing pattern. All under `gcscode-reviewer[bot]` and `gcscode-respondent[bot]`.
4. User merges via `gh pr merge --merge` or `auto-merge` label (user has granted standing auto-merge permission for queued debt-clearing iterations).
5. **Post-merge operational prerequisite:** user creates 5 GitHub Apps per the "Operational prerequisite — GitHub App creation" section. Provides credentials inline.
6. Post-merge implementation: five direct-master commits per the post-merge convention. Commit 2 pauses for the credentials.
7. **First spec/ADR PR after merge:** controller dispatches reviewers under per-role identities. Plan 1 mechanics smoke test runs first; Plan 2 live workflow exercises on the next real spec/ADR PR.

## Validation

Two plans.

### Plan 1: Mechanics smoke test (next `test/*` PR after merge)

A throwaway test branch validates the per-role identities end-to-end.

- **Branch:** `test/per-role-bot-identities-mechanics` off master (post-merge, after 5 Apps created + config populated).
- **Session:** must run in a fresh Claude Code session post-merge (no session-bound agent-file constraints apply here — no new agent files — but the auto-merge workflow + helper script changes require fresh dispatch context).
- **Test actions:**
  1. Open a throwaway draft PR with a placeholder markdown file at `shell/docs/test-per-role-bot-identities-mechanics.md`.
  2. Auto-dispatch fires: 3 reviewer subagents (red-team Opus, red-team Sonnet, spec-quality) post initial reviews.
  3. Push a `Code-review-followup: smoke test` commit.
  4. Respondent subagents (3 parallel) dispatch + post responses. Reviewer subagents re-dispatch + post re-reviews.
- **Verify:**
  - (a) Red-team Opus + Sonnet reviews both post under `gcscode-red-team[bot]` (one identity for both models).
  - (b) Spec-quality review posts under `gcscode-spec-quality[bot]`.
  - (c) Respondent posts under `gcscode-respondent[bot]` (unchanged).
  - (d) Respondent subagents' jq filter correctly enumerates the 3 reviewer reviews under the new identities.
  - (e) Auto-merge workflow logs (visible via `gh run view` for the workflow run triggered on PR open) show `REDTEAM_COUNT=1` and `SPECQUALITY_COUNT=1` derived from the new identity-only filter. Don't actually trigger the merge — PR stays draft + kept-open as reference artifact.
  - (f) Helper script: `GH_REVIEWER_APP_PRIVATE_KEY_DIR=~/.config/gcscode .claude/scripts/gh-app-token-reviewer red-team` returns a valid token. Same for the other 4 slugs. Invocation with `unknown-slug` aborts with a legible error. Invocation without the env var aborts.
- **Disposition:** kept open as a permanent reference artifact alongside the existing test-mechanics PRs. NOT merged.

### Plan 2: Live workflow on the next real spec/ADR PR

The first real spec/ADR PR after this iteration ships exercises the new workflow end-to-end. Qualitative gut-check observations:

- **Per-role bot icons surface correctly in the PR UI.** GitHub renders each `[bot]` author's avatar inline; the 5 distinct icons should make the per-role split immediately legible without reading review bodies.
- **Auto-merge gate fires on the new identity filter.** Spec/ADR PR with the `auto-merge` label + both red-team + spec-quality posted should merge automatically.
- **Operational overhead.** Was the 5-Apps setup smooth? Did any helper invocation fail mid-iteration? Any role-slug confusion in dispatch prompts?
- **Respondent filter correctness.** Respondent dispatched after a Code-review-followup commit picks up all 3 reviewer reviews (not 1, not 4) — confirms the explicit IN() enumeration works.

**Failure response:** if any helper invocation fails, the helper's error messages identify which config/PEM is missing or invalid; fix inline. If the auto-merge filter regresses, the workflow run log shows which jq filter returned 0 unexpectedly; reconcile the filter or the dispatched identity.

## VS Code alignment

No VS Code alignment implications. Per-role bot identities are a gcscode-specific agentic-team mechanism. VS Code's extension architecture has no agentic-actor identity concept.

Propagation to `shell/docs/vs-code-alignment.md`: none.

## `docs/out-of-scope.md` propagation

This iteration is mostly a normal queued-item iteration (no architectural deferral beyond what the Non-goals section enumerates as per-iteration scope cuts). One Non-goal, however, is a deliberate architectural deferral that affects how future identity-design iterations are scoped: **per-model identities for the multi-model red-team pair**. The decision "one identity per role, not per role-model pair" is a forward-looking shape choice that anyone designing future per-actor-identity scope needs to know about. Per CLAUDE.md "Non-goals propagate to `docs/out-of-scope.md`": cross-cutting deferrals propagate.

**Edit:** under the "Agentic team architecture deferrals" section of `shell/docs/out-of-scope.md`, append:

```md
- **Per-model identities for the multi-model red-team pair.** Both Claude Opus and Claude Sonnet post under `gcscode-red-team[bot]`; model is surfaced in the review header but not in the rendered bot identity. Trigger to revisit: the multi-model red-team v1 evaluation iteration (per [`docs/specs/2026-05-16-multi-model-red-team-v1.md`](specs/2026-05-16-multi-model-red-team-v1.md)) resolves to KEEP-BOTH AND per-model audit-trail demand surfaces (e.g., it becomes hard to find "all Sonnet red-team reviews" in a tooling scan). See [`docs/specs/2026-05-16-per-role-bot-identities-for-reviewers.md`](specs/2026-05-16-per-role-bot-identities-for-reviewers.md) "Non-goals" and "Future iterations".
```

The other Non-goals (unified reviewer + respondent helper, bot permissions audit, historical post backfill, backwards-compat shim, custom dispatch for feature-PR reviewers, pre-merge mechanics validation) are per-iteration scope cuts with their own triggers and stay in this spec only.

## `docs/roadmap.md` propagation

See Post-merge implementation > Commit 5a verbatim. The Considering "Per-role bot identities for reviewers" entry is moved to the Queued section, flipped to `[x]`, and the entry text updated to reflect shipped-status (with a link to this spec).

Net change: 1 Considering → Queued/Shipped flip.

## Known unknowns

- **Setup-cost reality.** Creating 5 new GitHub Apps is manual UI work on github.com. Partial state (e.g., 3 of 5 Apps created) is bounded — helpers fail loudly for missing identities; rollback path is commit-revert. **Tripwire below.**
- **PEM filename convention legibility.** `gcscode-final-review.pem` reads slightly off (registry role-name is "Final cross-cutting"; slug `final-review` is a shorthand). Spec's Architecture > Identity naming section calls out the mapping explicitly. If the legibility cost is bigger than anticipated, a future iteration could rename `final-review` → some other slug at the cost of recreating that App on GitHub.
- **Multi-model red-team identity.** Both Opus and Sonnet post under `gcscode-red-team[bot]`. If the multi-model evaluation iteration resolves to KEEP-BOTH and the per-model identity question becomes load-bearing later, that's its own iteration.
- **Auto-merge filter assumption.** The new identity-only filter assumes no non-bot author can post under `gcscode-red-team` or `gcscode-spec-quality`. GitHub App identities cannot be impersonated structurally, so the assumption holds today. If a future iteration introduces a human-account-authored red-team review for some reason, that iteration owns updating the filter. **Tripwire below** (auto-merge regression).
- **Auto-merge filter API dependency on `author.login` suffix stripping.** The new filter compares against literal `gcscode-red-team` / `gcscode-spec-quality` without the `[bot]` suffix. This depends on GitHub's GraphQL/REST `author.login` field returning App logins **without** the `[bot]` suffix (the suffix is a UI render artifact, not a stored value) — consistent with current behavior, with the existing respondent.md filter, and with the workflow's pre-iteration filter, but worth surfacing as an external API dependency. If GitHub ever changes this behavior, all three filters (workflow + respondent.md + any future ones) silently return 0.
- **In-flight PR transition.** Spec/ADR PRs opened pre-merge that complete post-merge land in the new workflow; the new filter returns 0; auto-merge gate fails. User must `gh pr merge --merge` manually. One-time cliff bounded to in-flight PRs at the merge boundary.
- **In-flight cliff × multi-model v1 N=5 counter interaction.** Per `2026-05-16-multi-model-red-team-v1.md`, each spec/ADR PR is one observation against an N=5 evaluation counter. In-flight PRs that complete post-merge under `gcscode-reviewer[bot]` reach the new auto-merge workflow but fail the new identity filter (the cliff above). The N=5 evaluation iteration counts those PRs as completed observations with auto-merge "failed"; the failure is attributable to the in-flight cliff, not to a multi-model signal. The evaluation iteration should annotate this in its input data so the regression isn't double-counted.
- **Commit 1 → Commit 2 intermediate-state window.** Commit 1 deletes `.claude/scripts/gh-app-token` (which reads the old `githubApp` key) and creates `.claude/scripts/gh-app-token-reviewer` (which reads the new `reviewerApps` key). Commit 2 replaces the config to add the new shape. Between the two commits, the old script is gone AND the new shape isn't in the config yet — any reviewer dispatch landing in this window fails loudly (`appId or installationId missing for <slug>`). Bounded because the post-merge commits run serially in one session; the cliff is the same as the in-flight one above. Noted for completeness.
- **Ongoing rotation cost across 5 Apps.** PEM rotation (security incident, GitHub key-expiry policy, routine hygiene) becomes 5× work compared to the single-App scheme. The "unified reviewer + respondent helper" future iteration may centralize this if it ships, but until then rotation is fan-out work. Acceptable now; revisit if a rotation event surfaces the friction.
- **Commit 2 controller pause + pre-create-Apps alternative.** Per-App setup is nominally ~5 minutes × 5 = ~25 min UI work + Commit 2 pauses inline for the credentials. The pause is structurally a session-lifetime risk: if the controller session times out mid-pause, post-merge resumes in a fresh session (awkward for a 5-commit verbatim flow). Mitigation: the user MAY pre-create all 5 Apps **before** merging this spec-PR. Doing so collapses the Commit 2 pause to zero — the controller pastes the credentials it already has. Pre-creation is optional; the spec doesn't depend on it.
- **Historical PR attribution depends on keeping the App alive.** PRs #1 and #11 are kept-open reference artifacts; their value depends on the `gcscode-reviewer[bot]` icon staying attached to historical reviews. If the user later **deletes** the `gcscode-reviewer` App from GitHub (vs. just uninstalling it from the repo), historical posts render as "ghost" attribution and the reference artifacts degrade. Spec's recommendation is keep the App alive but uninstalled. Strengthening this from recommendation to requirement is a small operational call left to the user; flagging here so the cost of deletion is explicit.
- **Pre-merge verification structurally skipped.** Same constraint as PRs #11-#16. Five commits land verbatim post-merge. Rollback path: revert 5 commits + restore prior `gh-app-token`, prior `agent-config.json` shape, prior CLAUDE.md / prompt template / workflow content. Bounded.

## Tripwires for known-quality concerns

- **App-setup-friction tripwire.** If the 5-Apps setup takes materially longer than 30 minutes (per-App setup nominally ~5 minutes including UI navigation), flag the setup-cost as worse than anticipated. Response: spec a script that automates parts of the setup (e.g., generates the App manifest JSON to paste into GitHub's "Create from manifest" flow), OR reduce the per-role split to fewer identities.
- **Role-slug typo tripwire.** If across the first N=2 real spec/ADR PRs the wrong identity posts (e.g., dispatch prompt says `gh-app-token-reviewer red-tem` and helper aborts; or dispatch prompt says `red-team` for a spec-quality role and posts under the wrong identity), flag the controller's dispatch-prompt-requirements wording as insufficient discriminator. Response: tighten the wording; consider a smoke-test step in every spec/ADR PR that runs `gh-app-token-reviewer` for each slug as a sanity check before the real dispatches.
- **Auto-merge regression tripwire.** If the first auto-merge-labeled spec/ADR PR post-iteration fails the gate despite both red-team + spec-quality having posted, the new filter has a bug. Response: log the workflow output, diagnose, hotfix. The bug is likely in jq filter syntax or the post-merge config not being populated correctly.

These tripwires are manual review items, not automated checks; they live in this spec and migrate to the next iteration's brainstorm input if any fires.

## Future iterations

Each gets its own brainstorm when triggered.

1. **Unified reviewer + respondent helper** — single parameterized `gh-app-token <actor-slug>` covering all 6 identities. Trigger: asymmetry between `gh-app-token-reviewer` and `gh-app-token-respondent` produces real maintenance pain.
2. **Per-model identities for multi-model red-team** — split `gcscode-red-team[bot]` into `gcscode-red-team-opus[bot]` + `gcscode-red-team-sonnet[bot]`. Trigger: multi-model evaluation iteration resolves to KEEP-BOTH AND per-model audit-trail demand surfaces.
3. **Bot permissions audit** — tighten per-role App permissions (e.g., spec-compliance reviewer doesn't need write access to spec/ADR PRs; only feature PRs). Trigger: security-conscious sweep or operational incident.
4. **Reviewer routing layer** — queued #4 in the debt-clearing list. Becomes load-bearing when a 4th reviewer role arrives. Per-role identities established here are the substrate routing uses.
5. **App-setup automation script** — generates App manifest JSON to streamline future per-role-identity additions. Trigger: app-setup-friction tripwire fires.

## Origin

Designed in a single brainstorm session on 2026-05-16, immediately after respondent-subagent-v2 (queued item #2 of the debt-clearing list) merged. Per the agentic-team debt-clearing v1 commitment, queued items drain sequentially without interleaving; this is queued item #3.

Design refined through three clarifying questions:

- **Scope:** all 5 reviewer roles (full per-role split). User picked the full split over the smallest cut (red-team + spec-quality only) on the framing that "clean conceptual model — one identity per row" beats "narrow setup cost." 5 new Apps is bounded.
- **Helper script approach:** one parameterized `gh-app-token-reviewer <role-slug>` for reviewers; respondent's separate helper untouched. User picked the recommended option over per-role scripts (6 near-duplicates) and fully-unified helper (scope creep into respondent).
- **Design boundary calls:** kept inside the brainstorm — config shape (`reviewerApps` namespace), PEM location (directory env var + filename convention), header convention (unchanged), in-flight PR transition (finish-what-you-started), auto-merge workflow filter (identity-only). User reviewed each as a design section and approved.

Operational note: the user pre-authorized the post-merge implementation to provide GitHub App creation instructions inline when Commit 2 (config population) is reached, rather than burying them in the spec. This section is the authoritative reference; the post-merge implementation surfaces the steps in context.
