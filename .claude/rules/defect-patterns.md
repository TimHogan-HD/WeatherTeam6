# Defect Patterns

The defect classes that have actually shipped here, and how to find each one in a diff. The
general checklist is the `review-checklist` skill. Code and docs cite these by number, so keep
the numbers.

**The defects this project ships are not type errors.** They are correct-looking code that
says a wrong thing, and they pass typecheck, lint and the tests. Reading the diff is the
control that works.

### 1. A missing value rendered as a plausible one

The most common class here. JavaScript coerces `null` to `0`, so `cToF(null)` renders 32°F and
`dataUpdatedAt` of `0` renders "Updated 56 years ago".

**How to find it:** for every value rendered, ask what it shows when the input is `null`, `0`,
`undefined` or absent. A number a user could believe is a defect.

**The rule:** formatters take `number | null` and return an em dash. Never format a nullable
value inline.

### 2. A failure state that reads as success

An error path with the same output as a legitimate empty result. A malformed NWS response
returned `[]`, which means "no active alerts", and the caller deleted every stored alert.

**How to find it:** for every `catch`, `?? []` and `?? null`, ask whether the caller can tell
that value from a real one. If not, it will be acted on as real.

### 3. Attribution not backed by the data

Naming a source, model or cause the response does not support: a footer that claims NWS on an
empty result, or a component that was never measured named as the cause.

**How to find it:** grep for any user-visible string naming an external service. Each one must
be derived from the response, and omitted rather than guessed.

### 4. One value reused across a loop that needs per-item values

Today's wind was fed to every day scored, so all seven days carried the same wind.

**How to find it:** in any `.map()` producing per-item output, check each field comes from the
item, not from a variable computed outside the loop. A `current*` inside a per-day loop is the
smell.

### 5. A string literal that needs escaping as much as an interpolated one

A `<location name>` in a literal sent as HTML was rejected as an unknown tag, and that command
never once worked.

**How to find it:** escaping audits that only look at `${...}` miss this. Check the literal
text too.

### 6. Nested interactive elements

A `<button>` inside a `<button>` is invalid markup that browsers reparse. Fixing the markup is
not enough: `keydown` bubbles to the card, whose `preventDefault()` cancels the inner button's
activation.

**How to find it:** for any container with `onClick` or `role="button"`, check every interactive
descendant, for click and key events separately.

### 7. State read before it settles

**How to find it:** when output depends on two async sources, check what renders while one is
still pending. "Briefly wrong" is still wrong.

### 8. A permissive type that silently discards data

`RequestInit['headers']` also accepts a `Headers` instance, and spreading one yields `{}`, which
drops `Authorization`.

**How to find it:** any `{...a, ...b}` where `b` is a union type. Narrow the parameter so the
wrong shape cannot compile.

### 9. An upstream call that can never succeed

A fallback that always fires is a dead branch, not resilience.

**How to find it:** a log line on every single request is the signal. Probe the upstream
variable by variable rather than assuming the docs.

### 10. A dead field reasoned about as if it were live

A scoring field no scorer read had three documents reasoning from it, and one produced a rule
that would have hidden a 103 °F heat warning. `aspectDegrees` was the second instance.

**How to find it:** verify the consumer before reasoning from the producer. Grep for where a
field is read, not where it is set.

### 11. A test whose fixture cannot reach the branch it claims to cover

The test is green, its name describes the right property, and the input never reaches the code
that would break it. "hours since rain is non-negative" ran only against no rain at all, while
rain dated today rendered "no rain in -14h".

**How to find it:** for each assertion, ask which line of the implementation would have to
change for it to fail. If you cannot name one, the fixture does not reach it. Then ask whether
the fixture was built by the same understanding as the code it checks: a helper that mirrors
the implementation proves only that the code agrees with itself.

**The rule:** an invariant worth asserting is worth asserting on the input that threatens it.
Boundary cases go in the fixture, not the test name.

`npm run test:mutation --workspace=apps/api` (Stryker) finds this class by machine: a surviving
mutant is an assertion that constrains nothing. Some survivors are equivalent mutants, and a
rising score is not the goal; the survivors that contradict a written rule are.

## Two process rules

1. **Review the diff before reporting anything done.** Read the actual diff as prose, asking of
   each hunk what it does when the inputs are missing or the network fails.
2. **When a check passes, ask what it would have caught.** Typecheck and lint prove a change
   compiles, not that it is right.
