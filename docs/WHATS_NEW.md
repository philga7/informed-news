# What's new

Plain-English notes for someone who reads the app. Newest first.

Each ship-loop pull request adds an entry for what changed for that reader, or writes **No user-visible change.**

This is not the release log. Releases are recorded in `CHANGELOG.md` by semantic-release. Do not hand-edit `CHANGELOG.md` to mirror these notes.

## 2026-10-27

No user-visible change.

## 2026-10-16

Reading the Brief is steadier.

- Keyword filters in Settings can blur or hide stories on the topic Brief, including stories waiting under More. A story you have open stays visible while its summary or full story loads, and after a refresh, until you close every open story. Expand all skips stories that are still blurred.
- Keyboard movement follows the stories on screen and stays on the same story when the list changes. Enter activates a button or link you have focused, instead of opening the selected story. A blurred story is described by the words that filtered it, and opening it shows the title. Success and information notices are announced politely to screen readers.
- A shared link whose story is missing returns you to the latest Brief with a short notice. On a shared story, the title is ordinary text, and the usual keys do not collapse it. Opening that same shared link again after View latest stories follows it again.
- When Topics or Add story cannot complete a save because the server failed, they ask you to try again.
- Refresh no longer collects new posts from X. Posts that were already saved can still appear.
