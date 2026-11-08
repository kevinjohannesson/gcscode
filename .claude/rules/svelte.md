---
paths:
  - 'packages/**/*.svelte'
  - 'packages/**/*.svelte.ts'
---

# Svelte

## Svelte MCP server

Use the Svelte MCP server for Svelte 5 and SvelteKit work:

1. `list-sections` first, to find the relevant documentation sections (read their `use_cases`).
2. `get-documentation` for every section relevant to the task.
3. `svelte-autofixer` on any Svelte code you write, repeated until it reports no issues or suggestions.
4. `playground-link` only when the owner asks for one, and never for code written to files in the project.

## Reactive state lives in classes, written C#-style

- Reactive state in a `.svelte.ts` module lives in a class, not a `useX()` factory or bare exported `$state`. Export a singleton `const` when there is one instance (`export const modalState = new ModalState()`), the class otherwise.
- Every member has an explicit `private` or `public`. Backing fields are `private _name` (not `#name`) behind `public get name()` / `public set name(...)`. Derived values are `public get` accessors over a `$derived` inside the class.

```ts
class ModalState {
  private _active = $state(false);

  public get active(): boolean {
    return this._active;
  }
  public set active(value: boolean) {
    this._active = value;
  }
}
export const modalState = new ModalState();
```

- Components render; business logic lives in classes. Extract a `.svelte.ts` class when state is shared between components or carries lifecycle or coordination meaning (open/close, single-instance enforcement, a request queue, persistence). State internal to one component's interaction — a search query, a highlight index, a hover flag — stays a bare `$state` in the component (`quick-pick.svelte` is the precedent).
