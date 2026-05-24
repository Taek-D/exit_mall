# Admin User Search Design

## Goal

Add fast search to the admin user management page so an admin can find a user by name while typing. Korean initial-consonant search must work, so typing `ㄱㅁㅈ` can match a name such as `김민정`.

## Scope

- Target page: `/admin/users`.
- Search fields: user name only.
- Matching modes:
  - Full or partial Korean name text, such as `김`, `김민`, or `민정`.
  - Korean initial consonants generated from each Hangul syllable, such as `ㄱ`, `ㄱㅁ`, or `ㄱㅁㅈ`.
  - Case-insensitive matching for any non-Korean characters included in names.
- Search combines with the existing tab filters: all, low balance, pending, rejected.
- Result order stays Korean name ascending after filtering.

## User Experience

Place a compact search input near the top of the user list, above the table and close to the tabs. The placeholder should be direct, for example `이름 또는 초성 검색`.

Filtering updates immediately as the admin types. The query should be reflected in the URL as `q`, so refresh, back/forward navigation, and shared links preserve the current search. Clearing the input returns the current tab to its full filtered list.

When there are no matches, the existing empty-state area should remain, with copy that makes sense for a search result.

## Architecture

Keep data loading server-side as it is today. The page already fetches the full profile list and applies tab filtering before rendering. For the current user count, application-level filtering after fetch is simpler and fast enough.

Introduce a small client component for the search input. It owns the typed value and updates the URL with `router.replace`, preserving the current `filter` parameter. The server page reads `searchParams.q`, filters the list by name and generated initials, then renders the sorted results.

Add a small pure helper for Hangul initials so the matching logic is isolated and testable. The helper should:

- Normalize empty or whitespace-only queries to no search.
- Generate initial consonants only for complete Hangul syllables.
- Leave other characters searchable through the normalized original name.

## Testing

Add focused unit tests for the Hangul initial helper:

- `김민정` matches `ㄱㅁㅈ`.
- Partial initials such as `ㄱㅁ` match `김민정`.
- Text search such as `민정` matches `김민정`.
- Empty query returns all rows through the page filtering logic or helper predicate.

Run `pnpm typecheck` and the relevant unit test suite before shipping.
