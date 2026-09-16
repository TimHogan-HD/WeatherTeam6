# Research inbox

Raw source material for the climbing and rock research, **read as files rather than
fetched**. Transcripts, saved articles, PDFs — anything a source will not hand to a fetch
tool.

It exists because three of the sources the research needs answer a tool with a 402 or a
403. The answer to a bot wall is not a better user-agent; it is a person opening the page
and saving it here.

## The rule: do not commit third-party text

**Everything in this directory is gitignored except this README.** That is deliberate and
it is not a tidiness preference:

- Article bodies, podcast transcripts and guidebook text are **someone else's copyright**.
  This repo is not a mirror of them.
- What is ours is the **claim, the quote short enough to be fair use, and the citation**.
  Those go in `.claude/docs/`, with the `[M]`/`[S]`/`[C]`/`[R]`/`[?]` confidence marker
  the two research docs already use.

So the flow is: drop the raw file here → read it → write the extracted claim, with its
source, into the research doc → the raw file stays local and uncommitted.

If you find yourself wanting to commit something from this directory, the thing to commit
is a quote and a citation, not the file.

## Naming

`<source>-<subject>-<yyyy-mm-dd>.<ext>` — e.g. `nugget-podcast-ep180-conditions-2026-09-15.txt`.
The date is when it was captured, not when it was published; a claim's own date belongs in
the citation.

## What the network can actually reach

Checked **2026-09-15**, on the Windows laptop, `HTTPS_PROXY` unset. This is the check the
brief's Phase 0 asks for, and it is recorded here because it is the whole reason the
research moved off the cloud session: there, every content domain answered `000`.

Each "yes" below means **a real page was fetched and its text read back**, not that the
host answered a status code. The distinction matters: `weather.gov` and `springer.com` both
answer curl with a 200 or a redirect and still needed a page read to confirm.

| Source | Reachable | Evidence |
| --- | --- | --- |
| en.wikipedia.org | yes | curl 200 |
| accessfund.org | yes | article read, quotes extracted — **was `EGRESS_BLOCKED`** in the cloud session |
| pmc.ncbi.nlm.nih.gov | yes | full text of an article read |
| weather.gov | yes | a winter-weather page read |
| nature.com | yes | article title + abstract read, after two redirect hops |
| link.springer.com | yes | article title + abstract read, after two redirect hops |
| ukclimbing.com | **no** | 402 to a fetch tool, 403 to curl |
| sciencedirect.com | **no** | 403 to both |
| academic.oup.com | **probably not** | 403 to curl on the journal root; **not retried with a real article URL**, so this row is weaker than the two above it |

**The redirect hops are worth knowing before Phase 1.** Springer and Nature answer the
article URL with a `303` to an identity-provider URL, which answers with a `302` back to
the article carrying `error=cookies_not_supported`. That last URL renders the full text.
A fetch tool that stops at the first redirect reports the article as unreadable when it is
not — which is how a verifiable figure gets written down as unverifiable.

**The blocked hosts are the inbox's whole purpose.** UKC, ScienceDirect and OUP are
named in Phase 1 rows and in the terminology doc's dew-point section. They will not be
fetched; they get opened in a browser and saved here.

Web search itself works and returns usable URLs — the Access Fund page the rock doc had
recorded as unreachable was found and read this way.

---

## The wanted list

Added 2026-09-16, after Phases 1–5. **These are the specific pages that would settle specific
numbers**, ranked by what each one is worth. Open in a browser, save here (Reader mode or
"Save as… Web Page, Complete" — a PDF print is fine too), and tell Claude the file is here.

Naming: `<source>-<subject>-<yyyy-mm-dd>.<ext>`, as above.

**A warning that cost time**: `curl -L` returns **200** for several of these because it follows
the redirect to a login page and *that* returns 200. A status code is not evidence a page is
readable. Everything on this list was confirmed unreadable by trying to read it.

### 1 — Figures that are currently unsourced and are headed for constants

| # | What it settles | URL |
| --- | --- | --- |
| 1 | **Millstone Grit "41% weaker when wet"** and the **"western sandstone 75%"** attribution. The 41% is the most specific unverified number left in the rock doc (§12.4) | https://www.climbing.com/travel/wet-sandstone/ |
| 2 | **The dew-point 60 °F threshold.** The only source for it nobody has read; the other two cited say no such thing (§17.2). If this thread does not support it either, the threshold has no source at all | https://www.ukclimbing.com/forums/rock_talk/can_anyone_explain_humidity_to_me-678224 |
| 3 | **Shoe rubber's friction peak at 0–5 °C and its glass transition.** Cited in §9; the other source for it says nothing of the kind (§17.3) | https://www.climbing.com/skills/science-friction-the-truth-behind-perfect-climbing-conditions/ |
| 4 | **Raindrop terminal velocity.** Gunn & Kinzer (1949) is the primary everyone cites. **Every number in §18.1's overhang table scales with this range** — if it is wrong, the table is wrong by the same factor | https://journals.ametsoc.org/view/journals/atsc/6/4/1520-0469_1949_006_0243_ttvoff_2_0_co_2.xml |

### 2 — Claims marked [M] whose paper has never been opened

| # | What it settles | URL |
| --- | --- | --- |
| 5 | §2.4's **fracture toughness 6–35%, fracture energy 21–52%, static friction 0–19%** — three rows, one paper | https://www.sciencedirect.com/science/article/pii/S1365160921003002 |
| 6 | §2.4's **weakening effect of water on brittle failure** (OUP GJI) | https://academic.oup.com/gji/article/192/3/1091/822850 |
| 7 | **Keppert et al. sorption**, and the **RH ≈ 75% break** in §2.8 — currently unverified, and the section's quote is attached to the wrong paper | https://onlinelibrary.wiley.com/doi/10.1155/2016/8039748 |
| 8 | The **0–55%, outliers >90%** sandstone strength range, now marked **[X]**. The abstract is readable and does *not* contain it; **the full text is what is needed**, and it may not be there either | https://link.springer.com/article/10.1007/s10064-022-02822-9 |

### 3 — The drying-rate literature found in Phase 4, read only via summaries

These are the strongest new material in the whole research and **not one of them has been read
at source** (§12.1).

| # | What it settles | URL |
| --- | --- | --- |
| 9 | **Slavík et al., seasonal evaporation from bare sandstone** — the 0.4–2447 mm/year range and the **vaporization plane depth** result, which says climate matters less than the rock's internal state | https://onlinelibrary.wiley.com/doi/abs/10.1002/esp.4943 |
| 10 | **Evaporation rate from surfaces of various granular rocks** (2022) — the same group, across lithologies rather than one | https://www.sciencedirect.com/science/article/abs/pii/S0048969722062131 |
| 11 | **Rock moisture dynamics in sandstone caves**, field observations plus modelling — includes the wetting-depth-over-5-years figure | https://www.sciencedirect.com/science/article/abs/pii/S0013795225002819 |
| 12 | *Quantitative study of a rapidly weathering overhang developed in an artificially wetted sandstone cliff* — **a wetted cliff with an overhang**, which is this project's subject almost exactly. Search the title; it is on ResearchGate and in Earth Surface Processes and Landforms | (search by title) |

### 4 — Lower priority, but each fixes a specific gap

| # | What it settles | URL |
| --- | --- | --- |
| 13 | **Navajo facies porosity/permeability** — confirmed from a summary that quotes it, never from the study | https://archives.datapages.com/data/uga/data/079/079001/311_ugs790311.htm |
| 14 | **Non-welded Bishop Tuff 38–60% porosity** — the figure that makes Bishop more porous than any sandstone in §3 | https://acsess.onlinelibrary.wiley.com/doi/10.2136/vzj2004.0602 |
| 15 | **Stress corrosion / subcritical crack growth 6.2–48.5%** in §2.4 | https://www.sciencedirect.com/science/article/abs/pii/0040195180901626 |

### Phase 3 needs something different

Phase 3 of the brief is **not** a reading list — it is *"how climbers actually decide"*, and the
material is **speech**: podcast transcripts and long forum threads. Suggested in the brief: The
Nugget, Careless Talk, Power Company, UKC and ukbouldering conditions threads, and regional
groups for MN/WI/CO/SD/WY.

**Transcripts, not links.** Most podcasts publish one, or YouTube auto-captions can be copied.
Drop the text here and it gets read as a file. **Do not commit it** — the extracted claim and a
short quote go in the docs; the transcript stays local.
