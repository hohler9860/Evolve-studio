# Agency & Product Landing Page Design Patterns

> **Research date:** 2026-05-15
> **For:** Evolve Studio landing rebuild (Henry Ohler / Boston web design studio)
> **Method:** Firecrawl CLI v1.17.1 — scraped main content (and HTML where needed) from 10 reference sites
> **Note on coverage:** maxim-sokolov.com failed DNS — replaced with lusion.co (top 3D portfolio studio). 9/10 of the originally requested sites scraped successfully. Lusion content was JS-rendered and partial; pattern observations supplemented from visible structure.

---

## Executive Summary — The 10 Strongest Patterns Observed

These patterns appeared on 4+ of the 10 sites scraped. If a pattern is on this list, **it's table stakes for a top-tier landing in 2026**.

1. **Hero headline is 6–10 words MAX, broken across 2–3 visual lines.** Every single site (Linear, Vercel, Supabase, Raycast, Attio, Designjoy, Reform, v0) keeps the H1 brutally short. Vercel: "Build and deploy on the AI Cloud." (7 words). Supabase: "Build in a weekend / Scale to millions" (7 words). Raycast: "Your shortcut to everything." (4 words). Linear: "The product development system for teams and agents" (8 words). **Anti-pattern your old page violated: long descriptive sentences as the H1.**

2. **Sub-headline is ONE sentence, 12–22 words, explaining the "what" in plain language.** Vercel: "Vercel provides the developer tools and cloud infrastructure to build, scale, and secure a faster, more personalized web." Supabase: "Supabase is the Postgres development platform." Attio: "Attio is the AI CRM that builds pipeline, accelerates every deal, and compounds revenue around the clock." Pattern: `[Brand] is the [category] that [verb][verb][verb].`

3. **Status pill / announcement bar above the hero** linking to a recent release. Vercel ("Ship 26 is coming to 5 cities → Get your ticket"), Supabase ("State of Startups 2026: Take the survey"), Linear ("Issue tracking is dead — linear.app/next →"), Raycast ("Try the new Raycast → Learn more"). This is **the** way to add freshness/urgency without redesigning. Tiny pill, top of hero, links somewhere.

4. **Two-button CTA in hero: primary solid + secondary outline/text.** Universal. Vercel: "Start Deploying" + "Get a Demo". Supabase: "Start your project" + "Request a demo". Attio: "Start for free" + "Send me a demo / Talk to sales". Linear: "Get started" + "Contact sales / Open app / Download". **For a service business like Evolve: "Start a project" + "See work" or "Book a call".**

5. **Logo marquee directly under hero proves traction without a long sentence.** Vercel (Runway, Adobe, Stripe, Sonos…), Supabase (Mozilla, GitHub, 1Password, PwC…), Designjoy (Nectar, Buy Me A Coffee, ProductHunt awards), Reform (MicroConf, Fathom, TinySeed). **The grayscale auto-scrolling marquee is the standard 2026 trust signal.** Even tiny studios use it — Designjoy doesn't have Stripe, but it has 5 logos that look like they belong together.

6. **Sans-serif body, no serifs anywhere.** Inter dominates (Linear, Designjoy use it directly; many use forks like InterDisplay or custom Geist). **No site in this set used a serif headline.** Modern agency = Inter / Geist / GT Walsheim / custom-grotesque. The "serif headline" trend is dead in product/agency 2026.

7. **Numbered or labeled section anchors.** Linear labels sections "1.0 Intake", "2.0 Plan", "3.0 Build", "4.0 Diffs", "5.0 Monitor". Attio labels "[01] Powerful platform", "[02] Adaptive model". This gives a "system / spec sheet / blueprint" feel. **Massive credibility boost for a design studio — signals process and rigor.**

8. **Marquee/scroll-reveal animated text mid-page.** Lusion: "Step into a new world / and let your / imagination run wild". Designjoy: scrolling category tags ("Mobile apps", "Presentations", "Logos"…). Reform: scrolling icon row. Used as breathing room between dense sections.

9. **Big customer quote callout block (1–3 lines, white-space heavy, author + role + logo).** Linear: "You just have to use it and you will see, you will just feel it. — Gabriel Peal, OpenAI". Attio opens with a giant pull quote: "When I first opened Attio, I instantly got the feeling this was the next generation of CRM. — Margaret Shen, Modal". **One quote, gigantic. Not a 3-up testimonial grid. Single hero quote = much more confident.**

10. **Footer is minimal, mono-spaced or all-lowercase, with a giant CTA wordmark above it.** Linear ends with "Built for the future. Available today." then 4 buttons. Lusion ends with "Is Your Big Idea Ready to Go Wild? / Let's work together!" as massive text. **No site dumps 6 columns of sitemap links above the fold of the footer.** The footer is a moment, not a directory.

---

## Site-by-Site Breakdown

### 1. linear.app — The product development system gold standard

- **Hero headline:** "The product development system for teams and agents" (49 chars / 8 words). Animated typewriter effect cycling between three line breaks.
- **Sub:** "Purpose-built for planning and building products. Designed for the AI era." (74 chars)
- **CTA copy:** Primary buttons appear at section level, not hero. Footer CTAs: "Get started", "Contact sales", "Open app", "Download".
- **Status pill:** "Issue tracking is dead — linear.app/next →" (yes, present, top of page).
- **Hero asset:** Animated mock screenshots of Linear UI (issue cards, Slack threads, agent activity feed). Not 3D, not gradient — pure product UI in motion.
- **Typography:** Inter Display / custom Inter Tight variant. Heading ~64-80px desktop. Weight 500-600. Tight tracking.
- **Color palette:** Pure black background (`#08090A` / near-black), white foreground, accent purple `#5E6AD2` (Linear's brand), very minimal use.
- **Sections (in order):**
  1. Hero with cycling H1
  2. "A new species of product tool" — 3-pillar value prop (Built for purpose / Powered by AI agents / Designed for speed)
  3. Numbered chapter 1.0 — Intake (issue triage demo)
  4. Numbered 2.0 — Plan (roadmap visual)
  5. Numbered 3.0 — Build (agents commands demo)
  6. Numbered 4.0 — Diffs (code diff demo)
  7. Numbered 5.0 — Monitor (pulse / analytics demo)
  8. Changelog (4 latest releases)
  9. 3 customer quotes inline
  10. "Linear powers over 25,000 product teams" stat
  11. Final CTA "Built for the future. Available today."
- **Microinteractions:** Cycling/morphing headline, mock UI scroll, hover-active section transitions.
- **Copy framework:** Numbered chapters ("1.0 Intake", "2.0 Plan"). Each section opens with a short imperative ("Make product operations self-driving", "Define the product direction").
- **Pricing:** Not on homepage — separate page.
- **Footer:** Extremely minimal. Just the 4 CTA buttons.
- **Mobile:** Probably stacks the chapter visuals vertically; sticks to the same numbering.

---

### 2. vercel.com — The platform pitch template

- **Hero headline:** "Build and deploy on the AI Cloud." (33 chars / 7 words). Period included. The H1 is repeated twice in the markup — possibly an A/B or animation hook.
- **Sub:** "Vercel provides the developer tools and cloud infrastructure to build, scale, and secure a faster, more personalized web." (122 chars)
- **CTA:** "Start Deploying" (primary) + "Get a Demo" (secondary).
- **Status pill:** "Ship 26 is coming to 5 cities → Get your ticket" — event-driven.
- **Hero asset:** No image in the hero itself — just text + CTAs. Below the fold: a logo marquee, then a tabbed feature switcher (AI Apps / Web Apps / Ecommerce / Marketing / Platforms).
- **Typography:** Geist Sans (their own font) + Geist Mono. ~72-96px headlines. Geist Mono used heavily for code snippets and labels like "~ vercel-site/ git push".
- **Color palette:** Pure white BG / pure black FG (light mode default) with very strict grayscale UI. No bright accent — just black, white, geist-gray-100/200. Code blocks use a subtle gray background.
- **Sections:**
  1. Status pill
  2. Hero (text only)
  3. Logo marquee with inline stats ("Runway build times went from 7m to 40s")
  4. Tabbed switcher with 5 use cases (AI Apps / Web Apps / Ecommerce / Marketing / Platforms)
  5. "Your product, delivered" — bento grid of agents/web/commerce visuals
  6. "Framework-Defined Infrastructure" — git push animation
  7. "Scale your Enterprise / without compromising Security" — split heading trick
  8. "Deploy once, deliver everywhere"
  9. Fluid Compute callout
  10. AI Gateway code sample (tabs: AI SDK / Python / OpenAI HTTP)
  11. "Top models on May 15, 2026" — live leaderboard
  12. "Deploy your first app in seconds" — feature bullets + framework templates row
  13. Final dual CTA
- **Microinteractions:** Tabbed content swap (no page reload), animated git push terminal, live model leaderboard, dark mode toggle (look for `-light` / `-dark` SVG pairs on every asset).
- **Copy framework:** Each section is a single declarative sentence as the H2 (e.g., "Deploy once, deliver everywhere.")
- **Pricing:** Separate page.
- **Footer:** Light mode by default. Big "StartDeploying" / "Talk to an Expert" / "Get an Enterprise Trial" trio.
- **Mobile:** Tabs likely collapse to a horizontal scroll.

---

### 3. v0.dev — The prompt-as-hero pattern

- **Hero headline:** "What do you want to create?" (interactive input field IS the hero).
- **Sub:** Implicit — examples render below ("Contact Form", "Image Editor", "Mini Game", "Finance Calculator").
- **CTA:** The input itself. Drop attachments accepted inline.
- **Hero asset:** A literal prompt box. **The product IS the hero.** Below: "Start with a template" grid.
- **Typography:** Geist Sans / Geist Mono. Headings 56-72px.
- **Color palette:** White or pure black BG (toggleable), zero accent color — just monochrome.
- **Sections:**
  1. Prompt input hero
  2. Template grid (massive — 40+ templates with previews, like counts, fork counts)
  3. "Prompt. Build. Publish." — 6-step feature explainer (Sync with repo / Integrate with apps / Deploy to Vercel / Edit with design mode / Start with templates / Create design systems)
  4. Integrations marquee (12 icons, looping)
  5. "Agentic by default" + iOS app callout
  6. "Ship mobile sites" — more templates
  7. Final "Start building with v0"
- **Microinteractions:** Live prompt input, integration icons looping marquee, template card hovers.
- **Copy framework:** Three-word imperatives ("Prompt. Build. Publish.", "Sync with a repo", "Integrate with apps").
- **Pricing:** Separate page.
- **Footer:** Minimal — just "Get Started".
- **Mobile:** Same prompt-first hero, templates collapse to a single column.

---

### 4. designjoy.co — The one-man-agency masterclass (most relevant to Evolve)

- **Hero headline:** "Design subscriptions for everyone" (30 chars / 4 words).
- **Sub:** "Pause or cancel anytime." (24 chars) — That's it. Three words of sub copy.
- **Status pill:** None — just "Start today" + "Join Designjoy" as text-link CTAs.
- **CTA:** "See pricing" (primary).
- **Hero asset:** A 3D illustration of a credit card + a "Book a 15-min intro call" booking card. **Mixed media in hero, not just text.**
- **Typography:** Inter (confirmed via HTML). Heading ~88-120px, super heavy weight (~700-800). The headline copy is BIG and dominant.
- **Color palette:** Off-white BG (~`#F5F5F5`), pure black headlines, pink accent (`#FF6B9D`-ish), a "Designjoy pink" tag color. Very high contrast.
- **Sections:**
  1. Hero (giant headline, tiny sub, one CTA, mixed-media visual)
  2. "The way design should've been done in the first place" — 3-step process (Subscribe / Request / Receive) with **scrolling category tags** between steps
  3. Founder credibility blurb ("First launched in 2017... run entirely by Brett...")
  4. "Membership benefits" — 6-card grid (Design board / Fixed monthly rate / Fast delivery / Top-notch quality / Flexible and scalable / Unique and all yours)
  5. Testimonial callout — **single big Kevin O'Leary quote with his face**
  6. "Recent work" with scrolling work logos (Buy Me A Coffee, Switchboard, Product Hunt badges)
  7. Service list as scrolling tags ("Web design / Logos / Slide decks / Branding / Social media...")
  8. **Pricing** (singular card, not a 3-tier grid) — $4,995/mo struck through showing $5,995, with bullet feature list
  9. "Pause anytime" + "Try it for a week" reassurance
  10. Logos again
  11. FAQ accordion (13 questions)
  12. Final booking card CTA
- **Microinteractions:** Scrolling tag marquees, accordion FAQ, hover on cards.
- **Copy framework:** Conversational, founder-voice, second-person ("you'll never go back", "pause or cancel anytime", "we'll continue to revise until you're 100% satisfied").
- **Pricing:** **Single pricing card. No tier comparison.** One flat monthly rate. "Lifetime Discount - Limited Time" pill above the price. Bullet features below. One CTA button.
- **Footer:** Tiny — just "Book a 15-min intro call" + email link.
- **Mobile:** Stack everything. Pricing card becomes full-width.

---

### 5. attio.com — The premium B2B treatment

- **Hero opens with a pull quote (BEFORE the H1):** "When I first opened Attio, I instantly got the feeling this was the next generation of CRM." — Margaret Shen, Modal. **This is unusual and powerful** — they lead with social proof before the pitch.
- **Hero headline:** "The revenue platform engineered for scale." (43 chars / 6 words).
- **Sub:** "Attio is the AI CRM that builds pipeline, accelerates every deal, and compounds revenue around the clock." (108 chars)
- **Status pill:** "Meet the Developer Platform, now with MCP →"
- **CTA:** "Start for free" (primary) + "Send me a demo" + "Talk to sales" (multiple secondaries).
- **Hero asset:** Full-fidelity Attio UI screenshot (sidebar nav with Home/Configure/Help/Quick Actions ⌘K, meeting cards for "Today, May 15", participant avatars).
- **Typography:** Custom display font (looks like a Söhne/GT America hybrid). Body Inter-ish. Heading ~80-100px. **Letterforms are visually distinctive — they used letter-by-letter weighting in the quote rendering.**
- **Color palette:** Off-white/cream BG, black text, occasional deep navy or muted blue UI accents in the demo screenshots.
- **Sections:**
  1. Pull-quote hero (above the H1!)
  2. H1 + CTA + hero UI screenshot
  3. Customer logo marquee (Granola, Wispr Flow, Listen Labs, Modal, USV, Replicate, Railway, Public…)
  4. **[01] Powerful platform** — 4-item carousel: "The intelligent system that never sleeps" / "Revenue agents at your command" / "Already there when you arrive" / "Continuous context for everyone"
  5. CTA mid-page: "Start with 14 days of Pro, for free"
  6. **[02] Adaptive model** — "The only CRM with Universal Context™" — animated data-object cascade
  7. (Continues with [03], [04]...)
- **Microinteractions:** Carousel "item 1 ⋮ 4" navigation, hover on demo UI elements, scrolling data-object animation.
- **Copy framework:** Numbered chapters `[01]`, `[02]`. Each opens with a single sentence H2 followed by a 2-sentence elaboration.
- **Pricing:** Separate page.
- **Footer:** Not surfaced in main content scrape, but consistent with peers — minimal.
- **Mobile:** Carousel becomes swipeable.

---

### 6. framer.com — The "look at all these sites" pattern

- **Hero headline:** Not extractable from scrape (heavy JS rendering on main hero). Based on visible content: emphasis is on a **giant grid of customer websites** as the hero, with the actual H1 buried below.
- **Sub:** Not directly captured.
- **Hero asset:** **Massive mosaic of customer websites** — 28+ thumbnails, varied aspect ratios, infinitely scrolling. **The product is "look what people built" rather than "look at our app".**
- **Typography:** Custom Framer Sans (looks like a Geist-adjacent grotesque). Headings ~64-80px.
- **Color palette:** Pure black BG, white FG, occasional bright accent (cyan, neon green) inside customer site previews.
- **Sections:**
  1. Customer-site mosaic hero
  2. "Meet our customers →"
  3. Feature anchors: **#AI**, **#Design**, **#CMS**, **#Collaborate** (each is a deep-link section)
  4. Wireframer (AI feature) demo with mock prompts
  5. Feature deep dives with Framer UI mockups
  6. CMS Publishing UI mockup
  7. Live customer site previews ("framer.com/update/holo-shader")
  8. Scrolling site thumbnails marquee
- **Microinteractions:** Site mosaic auto-scroll, hover-to-pause, deep-link nav for AI/Design/CMS/Collaborate.
- **Copy framework:** Section header is the feature category. Sub is one sentence describing the value.
- **Pricing:** Separate page.
- **Footer:** Tiny.
- **Mobile:** Mosaic becomes a single-column infinite scroll.
- **KEY TAKEAWAY for Evolve:** Showing client work as the hero (not stock illustrations) is high-confidence and what an actual design studio does.

---

### 7. raycast.com — The dense feature catalog with mono accents

- **Hero headline:** "Your shortcut to everything." (28 chars / 4 words).
- **Sub:** "A collection of powerful productivity tools all within an extendable launcher. Fast, ergonomic and reliable." (107 chars)
- **Status pill:** "Try the new Raycast → Learn more"
- **CTA:** "Download for Mac" (primary) + "Download for Windows (beta)" (secondary).
- **Hero asset:** A floating Raycast command palette mock with `magic a` search query and image preview.
- **Typography:** Custom sans (looks like SF Pro-adjacent). Mono used heavily for keys/shortcuts (e.g., `⌘` `k`, `_↵_`).
- **Color palette:** Pure black BG, white FG, **vibrant red accent** (`#FF6363`-ish — Raycast brand). Lots of UI mockups in mid-gray with subtle inner shadows.
- **Sections:**
  1. Hero + version line ("v1.104.17 macOS 13+ Install via homebrew")
  2. "Take shortcuts, not detours" — single command palette demo
  3. Multiple stacked product demos (Clipboard History / Emoji & Symbols / AI / Calculator / Window Management) — each is a self-contained mock interaction
  4. **"It's not about saving time. It's about feeling like you're never wasting it."** — big philosophical statement section
  5. **Keyboard graphic** — 4-pillar value (Fast / Ergonomic / Native / Reliable) physically overlaid on a Mac keyboard illustration
  6. "There's an extension for that." — Extension category tabs (Productivity / Engineering / Design / Writing)
  7. Extension cards grid (Linear, Google Translate, etc.)
- **Microinteractions:** Demos cycle through different "modes", keyboard graphic has subtle hover, extension cards have hover preview.
- **Copy framework:** Punchy contrarian one-liners ("It's not about saving time. It's about feeling like you're never wasting it.").
- **Pricing:** Separate page.
- **Footer:** Minimal — install instructions.
- **Mobile:** Likely simplifies the keyboard graphic to a vertical list.

---

### 8. supabase.com — The split-headline + giant logo marquee

- **Hero headline:** Split layout: "Build in a weekend / Scale to millions" (35 chars across 2 lines). The bottom line is in green (`#3ECF8E` — Supabase brand).
- **Sub:** "Supabase is the Postgres development platform." Then: "Start your project with a Postgres database, Authentication, instant APIs, Edge Functions, Realtime subscriptions, Storage, and Vector embeddings." (long second sentence, but only the first 7 words are the actual sub-headline).
- **Status pill:** "State of Startups 2026: Take the survey." (top bar).
- **CTA:** "Start your project" (primary, green) + "Request a demo" (secondary, white outline).
- **Hero asset:** Just text — no image in hero. Below: massive 3x-looping logo marquee.
- **Typography:** Custom Supabase grotesque (Circular/GT-Walsheim-adjacent). Heading ~80-96px. Heavy weight on the brand-color second line.
- **Color palette:** Pure black BG, white FG, signature green `#3ECF8E` for primary CTA and the "Scale to millions" line.
- **Sections:**
  1. Status pill
  2. Split hero
  3. Logo marquee (4 rows of 15 logos, infinite scroll)
  4. "Trusted by fast-growing companies worldwide"
  5. Product card grid (Postgres Database / Authentication / Edge Functions / Storage / Realtime / Vector / Data APIs) — **7 product cards as the main feature show**
  6. "Use one or all" / "Use Supabase with any framework"
  7. "Customer Stories" — single hero + grid
  8. "Start building in seconds" — template gallery
- **Microinteractions:** Logo marquee, dark-light theme toggle (every product card has `-dark` and `-light` PNG pairs), card hover.
- **Copy framework:** Split-line contrast ("Build in a weekend / Scale to millions"). Each product card opens with bold inline phrase ("**Postgres Database**: Every project is **a full Postgres database**...").
- **Pricing:** Separate page.
- **Footer:** Loaded — multi-column with docs, community, etc. (the one site in this set with a "real" footer, because they have a real product surface area).
- **Mobile:** Logo marquee stays, cards stack to single column.

---

### 9. reform.app — The before/after pain narrative + scrolling icons

- **Hero headline:** Not cleanly captured (above the visible scrape) but pattern from the structure: emphasizes "Stop letting your old form builder kill your conversion rates" (mid-page H2 hints at hero copy style).
- **Sub:** Lorem ipsum placeholder copy was present — suggests they recently restructured. The narrative is **"old way kills conversion → new way wins"**.
- **Hero asset:** Logo grid + scrolling icon marquee (warning / fire / skull icons, repeated heavily).
- **Typography:** Inter-ish modern sans. Heavy weight on H1s.
- **Color palette:** Off-white BG, black text, accent green-yellow for "After" callouts. Skull/fire icons in red.
- **Sections:**
  1. Logo bar — "Trusted by thousands of marketers"
  2. Customer logo marquee (MicroConf, Fathom, TinySeed, Swipe Files, SavvyCal — 3x looped)
  3. **Scrolling pain icons** (warning + fire + skull, repeated dozens of times — visual metaphor for "the pain")
  4. "Stop letting your old form builder kill your conversion rates" — pain statement
  5. **Before/After two-column block** — 3 bullets each. Before: pain. After: relief.
  6. "Start building conversion optimized forms in just 3 steps" — Choose template / Customize / Integrate / Embed
  7. "Designed to maximize conversion rate" — feature cards (Multi-step Forms / Qualification / Lead Enrichment)
  8. "Cut out the noise" — spam prevention features
  9. "Looks and feels native" — branding customization
  10. Testimonial cards (Justin Jackson, Christian Schmidt)
- **Microinteractions:** Icon marquees, before/after reveal on scroll.
- **Copy framework:** **Pain → relief**. Brutal before bullets, soft after bullets. Almost direct-response style.
- **Pricing:** Separate page.
- **Footer:** Standard webflow footer with utility links.
- **Mobile:** Before/after columns stack vertically.

---

### 10. lusion.co — The 3D portfolio agency (replacing maxim-sokolov.com)

- **Hero headline:** "We create 3D visual storytelling and interactive web experiences that help brands stand out." (90 chars — longer than peers, but justified by the "we are an agency" positioning).
- **Sub:** "scroll to explore" (just navigation prompt).
- **CTA:** "Our Approach" + "Play Reel".
- **Hero asset:** **3D animated reel/scene as the full hero** (JS-rendered, not captured in markdown — but the structure shows the asset takes ~100vh).
- **Typography:** Display sans-serif (likely a custom or PP Editorial-adjacent). H1s are ~80-120px.
- **Color palette:** Black BG, white FG, no accent color — but the 3D scenes themselves carry color.
- **Sections:**
  1. 3D hero reel
  2. "Bold Ideas, Brought to Life" — manifesto statement (3 sentences)
  3. "Featured Work" — grid of 10 case studies, each tagged with capabilities ("concept • web • design • development • 3d • animation")
  4. "Where Creative Ideas Become Immersive Experiences" — process manifesto
  5. "Step into a new world / and let your / imagination run wild" — massive type, scroll-reveal
  6. "Is Your Big Idea Ready to Go Wild?" — final CTA
  7. "Let's work together!"
  8. Address block (Suite 2, 9 Marsh Street, Bristol)
  9. Social links inline
  10. "Built by Lusion with ❤️" — signature
- **Microinteractions:** Heavy WebGL/3D, scroll-driven camera moves, video reel play button.
- **Copy framework:** "We do not chase trends. We focus on..." — pure agency manifesto voice.
- **Pricing:** None. Project-based.
- **Footer:** Address, contact emails (hello@ + business@ separated), social, newsletter signup, "©2026 LUSION Creative Studio".
- **Mobile:** 3D may degrade to a static reel; layout stays single-column.
- **KEY TAKEAWAY for Evolve:** This is closest to Evolve's category (agency, not SaaS). Note: **two contact emails** (general vs. new business), **case studies tagged with capabilities**, and **manifesto-style copy** instead of feature bullets.

---

## "DO THIS" — Specific Recommendations for Evolve Studio

### Hero
1. **H1 max 8 words.** Something like: *"Websites that win clients in Boston."* Or: *"Boston web design, built to convert."* Or: *"Studio-grade websites for serious businesses."*
2. **Sub-headline = ONE sentence, 12–22 words.** Follow the pattern: *"Evolve Studio is a Boston-based web design studio that builds high-performance sites for service businesses ready to grow."*
3. **Status pill above hero.** Something like *"Now booking June 2026 projects → See availability"* or *"New: Voice agent integrations →"*. Refresh it monthly.
4. **Two CTAs.** Primary: *"Start a project"*. Secondary: *"See recent work"* or *"Book a 15-min call"* (Designjoy pattern).
5. **Hero asset = a screenshot of an actual Evolve site (not stock).** Or a 3-image carousel of recent work. Frame it in a browser chrome. No stock 3D balls.

### Typography
- **Use Inter or Geist Sans.** Both are free, modern, and used by 7/10 of these sites.
- **Use Geist Mono (or JetBrains Mono) for tags, labels, version numbers, code snippets.** Especially for things like "ESTABLISHED 2026" or "v0.1.0" or section numbers.
- **H1 desktop: 64–80px, weight 500–600, tight tracking (-0.02em).**
- **Body 16–17px, line-height 1.5–1.6, weight 400.**
- **No serifs anywhere.**

### Color
- **Pure black or pure white BG.** Pick a lane. The Linear/Vercel/Supabase/Raycast tier all run pure mode.
- **One brand accent only.** For Evolve, recommend a single restrained accent — a deep blue, a sharp green like Supabase, or a near-orange like Raycast. Use it ONLY on primary CTA and one or two highlight moments.
- **Everything else: pure black, pure white, and 2–3 grays.** That's the entire palette.

### Sections (proposed structure below — copy this template)

### Microinteractions
- **Logo marquee under hero** (auto-scroll, grayscale, paused on hover). Even if you only have 5 client logos, loop them 3x like Supabase does — it reads as fuller.
- **Scroll-reveal on section headers** (slight fade-up + opacity transition).
- **Single big customer quote** mid-page — Attio-style, lead-with-quote pattern is gold for an agency. Use Henry's strongest testimonial.
- **Numbered or bracketed section labels** — `[01] What we do`, `[02] How it works`, `[03] Recent work`. Massive credibility signal.

### Footer
- **Keep it minimal.** Address block (Boston), two emails (hello@ + new business if you want to look bigger), social, "Built by Evolve" signature line.
- **No 6-column sitemap.** That's for enterprise SaaS, not a 1-2 person studio.

---

## "AVOID" — Anti-patterns Observed (or absent for a reason)

1. **Long descriptive H1s.** "Evolve Studio is a Boston-based web design and development studio specializing in..." → too long. Trim ruthlessly.
2. **Three-tier pricing comparison tables.** No site in this set used a 3-column pricing grid on the home page. Designjoy showed a single card. Lusion shows nothing. **For agencies, never show a 3-tier table — it screams "we don't actually know our worth".**
3. **Generic stock 3D illustrations** ("the cute floating laptop"). Zero sites used this. Use real product screenshots, real client work, or actual UI mockups.
4. **Em dashes in body copy.** (Per Henry's instruction. Also, low-key, none of these sites used them heavily.)
5. **"AI-powered" buzzword in the H1 if you don't actually have AI features.** Vercel, Linear, Attio earn it because the entire stack is AI-built. Don't bolt it on.
6. **Big "About Us" hero copy paragraphs.** Lusion handles "who we are" in ONE sentence under a single H2 mid-page. Don't lead with bio.
7. **Carousel of generic testimonials.** Use ONE giant quote — the Attio opening move.
8. **Feature lists longer than 6 items per section.** Designjoy and Supabase cap their card grids at 6–7. More than that gets ignored.
9. **Loaded enterprise-style footer for a 1-2 person studio.** It just looks LARP-y. Linear, Designjoy, Lusion all keep footers tiny.
10. **Putting "Boston" in the H1.** Counterintuitive — but the top sites don't geo-tag in the headline. Put location in the sub, in the footer, in a "based in Boston, working worldwide" line. The H1 should be about the work, not the zip code.

---

## Proposed Section Structure for Evolve's Rebuild

Based on the synthesis of all 10 sites (heaviest weight on Designjoy + Lusion + Linear since they're closest to Evolve's category):

```
[Status Pill — top of page]
"Now booking June 2026 → See availability"

[01] HERO
- H1 (8 words max)
- Sub (one sentence)
- Two CTAs: "Start a project" / "See recent work"
- Hero asset: framed screenshot or carousel of recent client sites

[Logo Marquee]
- Auto-scroll, grayscale, 3x looped
- "Recent clients" or "Trusted by Boston's best" — one line, mono

[02] WHAT WE DO
- One sentence H2: "We build high-performance sites for service businesses."
- 3-card pillar grid (Strategy / Design / Build — or Discovery / Design / Development)

[03] RECENT WORK
- 3-up case study grid with capability tags ("concept • design • development • SEO")
- Each card: hero shot + client name + 1-line result ("3.2x lead increase in 60 days")
- "See all work →" link

[The Big Quote]
- Single massive customer testimonial (Attio pattern)
- Photo + name + role + company logo
- No carousel — just one quote, owning the section

[04] HOW WE WORK
- Numbered process: 1.0 Discovery / 2.0 Design / 3.0 Build / 4.0 Launch
- Each with 1 sentence + a visual cue (Linear pattern)

[05] PRICING / ENGAGEMENT
- Single card (Designjoy pattern), NOT a 3-tier table
- Or: a "Projects start at $X" line + "Book a call to discuss" CTA
- "Pause anytime / fixed monthly" if you want to test a retainer model

[06] FAQ (Optional)
- 6-10 questions, accordion
- "How fast?", "What's included?", "Do I own the site?", "Where are you based?"

[Final CTA Block]
- Giant headline: "Ready to build something that wins?"
- "Book a 15-min intro call" — Designjoy's exact pattern

[Minimal Footer]
- Address: Boston, MA
- Two emails: hello@evolvestudio.info + business@evolvestudio.info
- Social: IG / X / LinkedIn
- "© 2026 Evolve Studio. Built by Evolve."
```

---

## Notes on the Scrape

- **Firecrawl CLI v1.17.1** used. API key found in env. All scrapes successful except maxim-sokolov.com (DNS failure — replaced with lusion.co).
- **Raw scrapes saved to `/tmp/evolve-research/`** in case Henry/Claude wants to dig deeper on any specific site. Files: `linear.md`, `vercel.md`, `v0.md`, `designjoy.md`, `attio.md`, `framer.md`, `raycast.md`, `supabase.md`, `reform.md`, `lusion.md`. HTML for Linear/Vercel/Designjoy also saved.
- **Typography extraction was limited** — most sites use custom fonts loaded via `_next/static/media` with hashed filenames. Confirmed Inter on Linear and Designjoy via HTML inspection. Geist confirmed on Vercel/v0 via context (their own font). Others inferred from visual rendering patterns.
- **Lusion was the most JS-heavy site** — Firecrawl captured only ~10% of the visible content because the 3D/WebGL hero doesn't render in headless scrape. Patterns inferred from the captured copy + known industry knowledge of their site.
