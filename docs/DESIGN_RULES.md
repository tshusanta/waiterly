# TableTap Design Rules

These are the 10 rules I took from web research (November 25, 2026) on avoiding generic AI-generated UI. They apply on top of section 4 of the project spec. Where a source conflicts with the spec, the spec wins, and the conflict is noted.

## The 10 rules

1. **Give the UI a specific identity before coding.** Generic output happens when the model has no strong product direction and falls back to the "median" of its training data. TableTap's identity is a POS or kitchen-display tool used with one hand during a rush. Each screen is checked against the question "would this be on a real restaurant terminal?"

2. **Don't use the AI-default palette.** Indigo, violet and purple gradients are the most recognizable mark of generated design. Use the slate-dark palette (`#0F172A` background, `#1E293B` cards, `#334155` borders, `#F8FAFC` text) with one emerald accent (`#10B981`) that only means "active or healthy". Amber means waiting and red means allergy or rejected. Nothing else gets color.

3. **Avoid the default fonts.** Inter, Roboto and Arial are called out as the strongest typographic giveaway. TableTap uses **IBM Plex Sans** for UI text and **IBM Plex Mono** for table numbers, timers and badges. Plex comes from industrial and terminal design and has tabular figures, so wait times line up.

4. **Design in grayscale first, then add color for meaning.** Hierarchy comes from size, weight and spacing (Refactoring UI). If the screen reads correctly in grayscale, color only carries status, and status is also shown through form: pills, uppercase badges, wait chips.

5. **Start with less contrast and add emphasis only where needed.** Secondary text is muted slate (`#94A3B8`), not the primary color. Only one thing per card is emphasized, usually the table number or the task text.

6. **Use one spacing scale and one type scale.** The spacing scale is 4 / 8 / 12 / 16 / 24 / 32 px, and the type scale is 12 / 14 / 16 / 20 / 24 px. There are no one-off values. Start generous at 24 px between cards, then tighten inside cards for density.

7. **No glassmorphism, floating cards, nested cards or bento grids.** These come up in every "AI slop" list. Surfaces are flat and solid, with 1 px borders and 6–10 px radii. Shadows are limited to the modal. *(Refactoring UI suggests fewer borders. The spec asks for borders instead of shadows, so a thin border is used and background shifts handle grouping inside cards.)*

8. **Use real content, never placeholders.** "John Doe", lorem ipsum and fake stats show up in nearly every generated page. All data is synthetic but realistic for Juniper & Pine ("Table 7 · split check 3 ways · Waiting 6 min"), and the app loads with a live-looking shift, not an empty shell.

9. **Make copy specific and in the trade's own voice.** Buttons say what happens ("Add 3 tasks", "Reset shift"). Errors say what went wrong and how to fix it. Use restaurant vocabulary ("86'd", "on the fly"), with no taglines, no "seamless" or "unleash", and no emojis.

10. **Design one feature at a time and review it against a ban list.** Build the capture → review → table-card loop fully before moving on (Refactoring UI). Before each phase is done, check the screen against the forbid list in spec section 4: gradients, glow, emojis, centered headings, side accent stripes, fake "01/02/03" numbering, bouncing or pulsing motion, and horizontal scroll at 375 px.

## Applied checklist (used at each UI phase)

- [ ] No purple, indigo or pink anywhere. One accent only.
- [ ] Plex Sans and Plex Mono only. No Inter.
- [ ] Every card has ≤ 4 data points.
- [ ] Tap targets ≥ 44 px in the Service view.
- [ ] Transitions are 150 ms ease-out, with `prefers-reduced-motion` respected.
- [ ] Visible focus rings, labels on all inputs, `aria-label` on icon buttons.
- [ ] AA contrast in both dark and light themes.
- [ ] No horizontal scroll at 375 px.

## Sources

- [Anti AI slop ban list (ux-skill wiki)](https://github.com/Laith0003/ux-skill/wiki/Anti-AI-slop-ban-list)
- [Spot the slop: a UI designer's guide to fixing AI defaults](https://world.hey.com/kostac/spot-the-slop-a-ui-designer-s-guide-to-fixing-ai-defaults-4c448c9c)
- [How to de-slopify your designs (UX Collective)](https://uxdesign.cc/how-to-de-slopify-your-designs-4c40c57c1dc9)
- [I tried to make Claude Code stop producing AI slop (UX Planet)](https://uxplanet.org/i-tried-to-make-claude-code-stop-producing-ai-slop-fa594f6b5981)
- [AI makes bad design look good enough (Built In)](https://builtin.com/articles/ai-design-slop-era)
- [Impeccable: anti-patterns](https://www.mintlify.com/pbakaus/impeccable/concepts/anti-patterns)
- [Improving frontend design through Skills (Anthropic)](https://claude.com/resources/articles/improving-frontend-design-through-skills)
- [Anthropic frontend-design skill reference](https://www.mintlify.com/anthropics/skills/reference/frontend-design)
- [Refactoring UI tactical design principles (summary)](https://cdn.jsdelivr.net/npm/claude-code-skills@0.5.0/data/skills/ux-ui-design-system/references/refactoring-ui.md)
- [Book review: Refactoring UI (DEV)](https://dev.to/updivision/book-review-refactoring-ui-by-adam-wathan-steve-schoger-2f7m)

*Caveat: most of these are blog posts and third-party summaries, not primary research, and their advice overlaps heavily.*
