# Product spec

Plain-language list of what Informed News does now. Features and scenarios only. No implementation detail.

Each ship-loop pull request updates this file in the same pull request as the code. If what a reader can do changed, edit the scenarios. If it did not, bump **Last checked** so the file is still part of the pull request, and say so in [WHATS_NEW.md](WHATS_NEW.md).

**Last checked:** 2026-10-31

The home page is the Brief. Your topics decide what is searched for and what is left out. There is no review queue and no step where you accept a story onto the Brief.

## Sign in

Topics is the sign-in screen. The password field is labeled “MVP password.” Signing in is what unlocks refresh, filtered-out stories, adding or removing a story, “Less like this,” on-demand summaries, on-demand full stories, and remembering what you have read. You can read a Brief that is already loaded without signing in. **Log out** is on the Topics page.

**Scenario:** Given you are not signed in, when you open Topics, then you see a sign-in form and no topic list.

**Scenario:** Given you enter the wrong password, when you submit, then you stay signed out and see “Login failed. Check the password and try again.”

**Scenario:** Given you are signed in, when you choose Log out, then the topic list is cleared and the sign-in form returns.

Other pages that need a sign-in say **Log in on Topics** and link to Topics.

## Topics

Topics (`/topics`) is your list of what the Brief looks for and what it filters out. Changes save immediately.

- **Core** and **Watch** are desired topics. Core topics are not held to a significance bar. Watch topics keep a story only when it is judged a significant development.
- **Undesired** topics describe what to filter out. They never get a Brief section.
- **Keyword & outlet mutes** drop a story that matches a keyword, optionally only from one outlet. A mute wins even when the story also matches a desired topic.
- Each topic can have a name, a description, keywords (one per line), a search query, notes, and extra full-story sections: Business angle, Technical details, What you can do, History, and Map. The Map choice is listed on the form. The Brief does not draw a map for it.
- You can add, edit, remove, and move a desired topic between Core and Watch. Removing a topic asks you to confirm.
- Within Core, Watch, and Undesired, the Topics page lists names A–Z. The Brief does not use that A–Z order (see The Brief).
- A link, **See what was filtered out**, goes to Filtered out.

**Scenario:** Given you are signed in and have no topics at a level, when you view that section, then it says none are there yet.

**Scenario:** Given you add a desired topic with a name, when you save, then it appears under Core or Watch and the Brief can use it on the next refresh.

**Scenario:** Given you add a mute keyword, when a story contains that keyword, then the Brief hides it and a later refresh treats it as filtered out, even if a desired topic also matches.

**Scenario:** Given the server fails while saving, when the error comes back, then Topics shows a short “try again” message. A conflict such as a duplicate name still shows the specific message.

Opening `/radar` sends you to Topics. There is no Radar page.

## The Brief

The Brief is the home page, under the heading **Your topics**. One section per desired topic that has something to show: all Core sections first, then all Watch sections, in saved topic order (not the A–Z order on the Topics page). The level name (Core or Watch) sits next to the topic name.

A story that matches several topics appears once, under the earliest matching section in that order. A story whose topics are all gone or undesired is not shown.

Each section shows three stories. **More (N)** reveals the rest. **Show fewer** hides them again. Stories you added yourself are pinned first. After those, more significant stories come before less significant ones, then stories covered by more outlets, then newer stories.

Topics with nothing to show are one line at the bottom: `Nothing new: …` (Core names first, then Watch).

Stories are from about the last two days. Older ones drop off.

**Scenario:** Given you have no desired topics, when you open the Brief, then it says “No topics yet” and links to Topics.

**Scenario:** Given you have topics and nothing new for them, when you open the Brief, then it says “No new stories for your topics” and lists the quiet topics.

**Scenario:** Given no stories have been saved yet, when you open the home page, then you see a single sample story (“Owned brief fixture — CFP sample…”) and no topic sections or refresh bar.

**Scenario:** Given a topic has five kept stories, when you view its section, then three are visible and **More (2)** reveals the other two.

## Story cards and summaries

A card shows the headline, a short summary, and links to the articles. When more than one outlet ran the story, the card says `+N outlets` (N is the extra outlets). An official or primary statement can show an **Official statement** badge.

The summary is one or two neutral sentences written from the story’s own text. It is labeled **AI summary — not ground truth**. It is not a verdict, a trust score, or a claim that the story is true.

**Scenario:** Given a shown story has readable text and you are signed in, when the summary is missing, then the card says “Summary loads when you open this story,” and opening it shows “Loading summary…” until the summary appears.

**Scenario:** Given the story has no readable text, when you view the card, then it shows the headline and “Full text unavailable,” and no summary is invented.

**Scenario:** Given you are not signed in and the summary was not already saved, when you view the card, then it links to Topics to load summaries.

**Scenario:** Given too many on-demand summaries have been requested this hour, when you open another story, then the card says the summary limit for this hour has been reached.

Summaries for the top stories in each section are prepared during refresh. The rest wait until you open them. If summaries could not be written on the last refresh, the refresh bar says so.

## Full stories

Every topic Brief card can open a **Full story**. Opening the card loads it when it is not already saved. While it loads, the card says “Loading full story…”. You must be signed in; otherwise the card links to Topics.

A full story can include talking points, a timeline, and questions about what to verify or what is still unknown. When the articles support them, it can also show perspectives and a pull quote. If the topic asked for them, it can add a business angle, technical details, practical follow-ups, or history. Empty sections are left out. No map is shown. Generated sections are labeled **AI-assisted — not ground truth.**

When the underlying articles change in a meaningful way, an updated full story can show **Updated: …**.

Links, quoted lines, and link-backed claims on a card or full story are checked against sources fetched for that run. A link or quote that does not match a fetched source stays on the card and shows as **Unverified** (advisory). A claim that would have been called “debunked” without a linked refuting source among those fetched sources shows as **Unconfirmed** (advisory) — not a verified, false, or debunked badge. Items that match a fetched source show no mark. The marks are keyboard-reachable and polite for screen readers. Failed checks never stop a refresh.

**Scenario:** Given a quote or link on a card matches a source fetched that run, when you view the card, then no unverified mark appears for that item.

**Scenario:** Given a quote was paraphrased or a linked URL was not among fetched sources, when you view the card, then an Unverified quote or Unverified link mark appears and is reachable from the keyboard.

**Scenario:** Given a claim has no linked refuting source among fetched sources, when you view the card, then an Unconfirmed mark appears (advisory), not a false or debunked badge.

**Scenario:** Given a card cites a court case that could not be found, or links to a CourtListener opinion page (which is not confirmed), when you view the card, then an Unverified citation mark appears (advisory). If court lookups are switched off or unavailable, the same mark appears.

**Scenario:** Given a cited court record was found and it was dismissed on procedure, when you view the card, then a note reads “Dismissed on procedure, not on the merits.” It is a note, not a judgment that the claim is false, and you can reach it and open it from the keyboard.

**Scenario:** Given a court docket was matched and CourtListener has its own record page, when you view the card, then the original link stays and a “CourtListener record” mark also appears; open it to follow the CourtListener record link. It is advisory, not a verification badge.

**Scenario:** Given a link points to the same page as a fetched source and differs only by a trailing slash, http versus https, or a tracking tag, when you view the card, then it is not marked Unverified for that difference alone.

**Scenario:** Given a citation mark no longer applies after a later check, when you view the card, then the old mark is gone.

**Scenario:** Given you are signed in and the story has readable text, when you open the card, then the full story loads and a later visit reuses it while the text is unchanged.

**Scenario:** Given the story has no readable text, when you open the card, then it says “Full story unavailable — no readable text.”

**Scenario:** Given too many on-demand full stories have been requested this hour, when you open another one, then the card says the full story limit for this hour has been reached.

A few strong stories may get a full story during refresh (important stories, with several outlets or an official label). The others wait until you open them.

## Add a story and remove it

**Add story** (in the header, and when the plain list is empty) puts a story you found into the Brief. You must be signed in. Otherwise the form says “Log in to add stories” and links to Topics.

The form asks for a title, one desired topic (Core, then Watch; nothing is pre-selected), an optional note, and at least one http(s) URL. **Add to Brief** saves it and reloads the Brief.

The saved story is pinned at the top of that topic, with an **Added by you** badge. It follows the same two-day window, mutes, summaries, and full stories as other stories. An expanded card for it offers **Remove** instead of Less like this. Remove deletes it from the Brief immediately. It does not appear under Filtered out.

**Scenario:** Given you have no desired topics, when you open Add story, then it says “Add a desired topic first” and links to Topics.

**Scenario:** Given the URL matches a mute or an undesired topic, or the story is already in the Brief, when you save, then nothing is added and the form explains why.

**Scenario:** Given you are signed in and the story is one you added, when you choose Remove, then the card disappears.

**Scenario:** Given you are not signed in, when you try to remove a story, then the card says “Log in on Topics to remove stories.”

**Scenario:** Given the server fails, when you add a story, then you see a short “try again” message. A specific refusal (duplicate, mute, bad input) still shows its own message.

## Less like this

An expanded topic Brief card, other than a story you added, has **Less like this**. It needs a sign-in. The panel offers:

- **Not interested in this subject.** The undesired-topic name starts as the headline, shortened to the name limit. Keywords are optional. Saving adds an undesired topic.
- **Block this outlet.** Shown when the story has an outlet such as `bbc.co.uk`. Saving blocks that outlet. If it is already blocked, the panel says so and does not save a second topic.

On success the card says the topic was added, that matching stories hide the next time the Brief loads, and that they are filtered out from the next refresh. A **View Topics** link is included. Escape cancels and returns focus to Less like this.

**Scenario:** Given you are not signed in, when you open Less like this, then the panel says “Log in on Topics to use Less like this.”

**Scenario:** Given a topic with that name already exists, when you save, then nothing is saved and the panel says a topic with that name already exists.

**Scenario:** Given any other save failure, when you submit, then the panel says “Could not save. Try again.”

Stories already on the Brief that match the new topic drop out the next time the Brief loads. Refresh applies the topic to newly collected stories.

## Read and seen

You can mark a story read, or use **Mark all as read**. Opening a story counts as seeing it.

**Scenario:** Given you are signed in, when you open a story or mark it read, then it stays on the page until the next successful refresh. After that refresh it is hidden.

**Scenario:** Given a hidden story later gains clearly more coverage (more outlets, or it is judged more significant) since you saw it, when the Brief reloads, then it can show again.

**Scenario:** Given you are not signed in, when you mark stories read, then that is not remembered for the next refresh.

Before the first successful refresh, nothing is hidden as already seen.

## Refresh

While the server is running, the Brief refreshes on a timer. The bar above the sections shows when it last updated and when the next refresh is due. **Refresh** runs one immediately and reloads the Brief. It needs a sign-in; otherwise the bar says “Log in on Topics to refresh.” While a refresh is running the button says “Refreshing…” and is disabled. A refresh can take minutes. If it fails, the bar says “Refresh failed. Try again.”

The bar links to Filtered out. It says **N filtered out** when the last refresh dropped stories, and **Filtered out** otherwise.

Beside that link, an **Approved / Filtered / All** toggle chooses what the Brief shows. Every load starts on **Approved**. The choice is not remembered across reloads. **Approved** is today’s topic Brief (kept stories). **Filtered** lists stories the last refresh dropped, each with a short advisory reason you can open — separate from the Filtered out page, which stays for spot checks. **All** shows the Approved topic sections, then the Filtered list below (Filtered cards are not mixed into topic ranks).

The bar also says, in plain language, when a search source failed, when stories could not be scored, when summaries could not be written, or when the last refresh failed.

**Scenario:** Given you are signed in and no refresh is running, when you press Refresh, then the button shows “Refreshing…” and the Brief reloads when the run finishes.

**Scenario:** Given a refresh is already running, when you press Refresh, then you join that run instead of starting a second one.

**Scenario:** Given you open the Brief, when the page loads, then Approved is selected and you see topic sections, not the Filtered list.

**Scenario:** Given the last refresh dropped stories, when you choose Filtered, then you see those drops with an advisory reason expander, and topic sections are hidden.

**Scenario:** Given you choose All, when the Brief updates, then Approved topic sections appear above the Filtered list.

Refresh collects stories from the configured news feeds and from search for your desired topics. It does not collect new posts from X. Posts that were already saved can still appear. It does not ask you to accept stories.

## Always-on copy

The Brief can keep running while this computer is off. Stories already saved are still there after a restart. If the extra search service is not set up, new stories still come from Google News. The always-on Brief can be opened from Phil's laptop and phone on his private network, still behind the password, and not from the public internet. This copy is not running yet: deploy has not happened, so do not assume it is up. The steps are in [the runbook](RUNBOOK.md).

**Scenario:** Given stories were saved on the always-on copy, when it restarts, then those stories are still there.

**Scenario:** Given the extra search service is not set up, when refresh runs, then new stories still come from Google News.

**Scenario:** Given the always-on copy is deployed and you are on Phil's laptop or phone on his private network, when you open it, then it asks for the password.

**Scenario:** Given you are on the public internet, when you try to open the always-on copy, then it does not open.

## Filtered out

Filtered out (`/filtered`) lists stories the last refresh dropped, and why. It is for spot checks. There is no action to put a story back. You must be signed in; otherwise the page says “Log in on Topics to see filtered stories.”

You can switch between **Last refresh** and **Last 48 hours**. Stories are grouped by reason, including Muted, Off-topic, Clickbait, Opinion, Rewrite / roundup, Sponsored, Not significant, Duplicate, Undated, Too old, and Not scored. Items can show the outlet, when they were published, the topics, “Muted by: …”, “Duplicate of: …”, and “Retried next refresh” when the drop is not final. The page says these scoring reasons are AI-assisted judgments, not ground truth.

**Scenario:** Given you are signed in and the last refresh dropped nothing, when you open Filtered out, then it says “Nothing was filtered out.”

**Scenario:** Given no refresh has triaged stories yet, when you open the page, then it says no refresh has triaged stories yet.

You can reach this page from the Brief refresh bar and from Topics. It is not in the footer.

## Keyword filters

Settings → Filters can blur or hide stories on the topic Brief by keyword. This is saved in the browser. The server still has the story.

- **Blur** obscures a matching card until you click it or press Enter on it.
- **Hide** removes matching cards. Stories from More move up to keep three on screen. A topic left with nothing disappears (it is not listed as quiet). If every story is hidden, the Brief says “Your keyword filters hide every story in your Brief” and links to **Adjust filters**, which opens Settings on the Filters tab.

A match is decided when the Brief loads. A summary or full story that arrives after you open a card does not hide or blur that card. An open card keeps that decision across a reload, including the reload after a refresh. Closing every open card lets those stories be judged again. Changing the filter settings judges again immediately.

**Scenario:** Given blur is on and a card matches, when you move to it with the keyboard, then the announcement names the filter words (`Selected story: filtered (matches "…")`) and does not read the title. Enter or o reveals and opens it.

**Scenario:** Given you expand all, when some cards are still blurred, then those cards stay collapsed.

**Scenario:** Given you have a card open, when its summary finishes loading, then the card stays visible and unblurred even if the new text matches the filter.

## Keyboard and shared stories

`?` opens the keyboard shortcut list. Esc closes it. Information and success notices are announced politely. Warnings and errors interrupt.

On the Brief, `j` and `k` move through the stories on screen. `G` jumps to the last. `gg` jumps to the first. The selection is announced to a screen reader without moving keyboard focus, so the next key still does one thing. `Enter` or `o` opens the selected story. `x` closes it. `m` toggles read. `Enter` while a button or link is focused activates that control instead of the selected story.

The selection stays on the same story when the list changes (for example after Add story, Remove, or a reload) and clears if that story is gone. Nothing is announced for a selection you did not make.

**Scenario:** Given you opened a shared link and the story is on the Brief, when you view it, then the title is plain text, not an expand button. `j` and `k` select nothing, so Enter, o, and x do not collapse that story. **View latest stories** brings the normal shortcuts back.

**Scenario:** Given you opened a shared link and the story cannot be found, when the page loads, then you see the normal Brief, a notice that the shared story could not be found, and the address no longer says you are in the shared view.

**Scenario:** Given you choose View latest stories and then open that same shared link again, when the page handles it, then the shared story is followed again.

## About and Transparency

The footer **About** opens a short introduction to the product (`/about`).

**Transparency** (`/transparency`) is public. No sign-in. It describes funding, how Brief analysis is produced, how to report a mistake, and who builds the product. It states that AI-written analysis is not ground truth, and that the product does not show a bias meter, a trust grid, or a verified / false badge. A link returns to the Brief.

The footer also links to Topics. The old Radar link is gone.
