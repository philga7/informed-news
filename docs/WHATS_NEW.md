# What's new

Plain-English notes for someone who reads the app. Newest first.

Each ship-loop pull request adds an entry for what is true at merge for that reader, or writes **No user-visible change.** A later pull request corrects a line that is no longer true. Deploy steps stay out of these notes.

This is not the release log. Releases are recorded in `CHANGELOG.md` by semantic-release. Do not hand-edit `CHANGELOG.md` to mirror these notes.

## 2026-11-11

The Brief's status line now checks whether the scoring (TypeSafe) and summary (Ollama) keys are set on the running app right now. After you turn the keys on, loading or reloading the Brief no longer says “not configured” because of an earlier refresh that ran without them. With a key missing, the line still says so.

On the Brief, if the connection drops and the refresh you just started has already finished successfully by the time the page checks, **Refresh** now treats it as done: the Brief reloads with the new stories and no “Refresh failed” message. A run that really failed, or one that never started, still shows “Refresh failed. Try again.”

Full stories from publisher pages that start with a very large block of script data (common on some news sites) no longer lose their article text. The app now ignores that script code before reading the first million characters of the page.

On the Brief, **Refresh** no longer says “Refresh failed” just because the connection dropped while the server was still working. The button keeps saying “Refreshing…”, and the Brief reloads with the new stories when the run finishes, without a manual page reload. “Refresh failed. Try again.” now appears only when the run really failed or never started.

## 2026-11-10

On the Brief, stories you read stay marked as read after you reload the page. Opening a story now marks it as read. **Mark as unread** now clears the mark on the server, not just on the page. If a read or unread mark can't be saved (for example when you are signed out), the Brief shows a short error and puts the card back as it was.

On the Brief, opening a second card while another is still open no longer loads its full story on its own. It shows **Load full story**, and one click loads just that story. The notices under the topics, such as whether summaries are available, are now fetched fresh each time the page loads instead of reused from a saved copy.

Which model reviews a pull request does not change the Brief.

## 2026-11-09

On the Brief, a card opened together with others no longer says “Loading full story…” forever. It shows a **Load full story** button, and the loading line appears only while that story is really loading. The page also has one main heading, **Informed News**, for screen readers.

On the Brief, a story you mark as read now shows a **Read** label and a muted look, and screen readers hear the change. **Mark all as read** does the same for every story on the page. If the read mark can't be saved, the Brief says it applies to this page only. A read story still stays on the page until the next refresh.

## 2026-11-07

The Brief at `/` is the shell. It has the same topic sections, keyboard, filters, and shared links, including full stories, saved read marks, article links, and the refresh clock.

## 2026-11-05

A shell page is at `/shell`. The Brief is still the home page. Opening `/shell/deep` and reloading stays on that page. There is no Map or Signals page.

The Brief refresh bar has a **Feedback** link beside Filtered out. It opens a list of the Like and Not relevant choices you saved, newest first, with the headline, outlet, story link, topics, choice, comment, and when you saved it. You can switch a choice, edit the comment, and delete an entry after you confirm. It needs a sign-in. Not relevant still does not hide a story.

When a story’s advisory reason cites one of those entries, the citation is a link to that entry. After you delete it, the reason text stays and the citation says feedback was removed.

**No user-visible change.** The Brief is still the home page.

## 2026-11-04

Brief cards now have **Like** and **Not relevant** buttons, next to Less like this, on expanded Approved cards and on Filtered cards. Pick one to save it; pick the other to switch; pick the active one again to clear it. After you choose, an optional comment box (up to 500 characters, with a live count) lets you say why. Your choice is remembered when the Brief loads. It needs a sign-in. Not relevant never hides a story; Less like this still does.

## 2026-11-02

Like and Not relevant feedback you save now steers later refreshes. Your most recent feedback, favoring the same outlet or topic, is shown to the scoring step as a soft hint. A story the feedback shaped can show a feedback reference in its advisory reason. Not relevant never hides a story by itself, and a deleted entry stops being used on the next refresh.

Separately, how long a background code change may run is a builder setting and is not part of the Brief.

## 2026-10-31

The always-on Brief is running on the private machine, and it is not on the public internet. A laptop or phone can open it when Tailscale is installed on that device. Reading the Brief does not ask for the password. Refresh, Topics, Filtered out, and other changes still do.

**No user-visible change.** The junk list and per-source notes are server config only, and the writing rule for these notes plus container logs when a health check fails do not change the Brief.

## 2026-10-29

Stories can stay saved on an always-on copy of the Brief, and search still runs from Google News when the extra search service is missing. On this date, another device could not open that copy yet.

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
