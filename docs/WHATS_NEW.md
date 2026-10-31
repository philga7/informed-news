# What's new

Plain-English notes for someone who reads the app. Newest first.

Each ship-loop pull request adds an entry for what changed for that reader, or writes **No user-visible change.**

This is not the release log. Releases are recorded in `CHANGELOG.md` by semantic-release. Do not hand-edit `CHANGELOG.md` to mirror these notes.

## 2026-10-31

The always-on Brief is running on the private machine, and it is not on the public internet. A laptop or phone cannot open it yet, until the private-network address is turned on. Once that address is on, reading the Brief does not ask for the password. Refresh, Topics, Filtered out, and other changes still do.

## 2026-10-29

Stories can stay saved on an always-on copy of the Brief, and search still runs from Google News when the extra search service is missing. You cannot open that copy from another device yet.

**No user-visible change.** Cloud-agent setup now installs bun 1.4.3 when it is missing instead of failing.

## 2026-10-27

- Court citations on a card are now checked. A case that cannot be found, or a link to a CourtListener opinion page, shows **Unverified citation**, and a case that was dismissed on procedure carries the note **Dismissed on procedure, not on the merits**. A matched court docket keeps the original link and also offers the CourtListener record. Open a mark for a short explanation and, where there is one, that record link. These are advisory notes, not verdicts.
- Fewer false **Unverified** links: the same page with or without a trailing slash, http versus https, or a tracking tag no longer counts as a mismatch. A mark that no longer applies after a later check is cleared from the card.
- The Brief refresh bar has an **Approved / Filtered / All** toggle beside Filtered out. Every visit starts on Approved. Filtered lists what the last refresh dropped, with a short advisory reason you can open. All shows Approved topics and then that Filtered list. The Filtered out page is unchanged.
- Cards can show **Unverified** for a link or quote that did not match a source from that run, or **Unconfirmed** for a claim without a linked refuting source. These are advisory marks only — not verified, false, or debunked badges. Matching items show no mark.

## 2026-10-16

Reading the Brief is steadier.

- Keyword filters in Settings can blur or hide stories on the topic Brief, including stories waiting under More. A story you have open stays visible while its summary or full story loads, and after a refresh, until you close every open story. Expand all skips stories that are still blurred.
- Keyboard movement follows the stories on screen and stays on the same story when the list changes. Enter activates a button or link you have focused, instead of opening the selected story. A blurred story is described by the words that filtered it, and opening it shows the title. Success and information notices are announced politely to screen readers.
- A shared link whose story is missing returns you to the latest Brief with a short notice. On a shared story, the title is ordinary text, and the usual keys do not collapse it. Opening that same shared link again after View latest stories follows it again.
- When Topics or Add story cannot complete a save because the server failed, they ask you to try again.
- Refresh no longer collects new posts from X. Posts that were already saved can still appear.
