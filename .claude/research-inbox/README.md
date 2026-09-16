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
