# Clawd on Desk Repo Rules

These rules are mandatory for work inside `/Users/joe/Documents/deer-flow/clawd-on-desk`.

## Git push default

- Default publish remote: `yizhoupan3`
- Treat `origin` as upstream unless the user explicitly says to push there
- If the user's fork already exists under another remote name, add or sync a `yizhoupan3` alias before pushing
- Preferred push forms:
  - `git push yizhoupan3 HEAD:<current-branch>`
  - `git push -u yizhoupan3 <current-branch>` on first publish
- Do **not** default to `git push origin`
