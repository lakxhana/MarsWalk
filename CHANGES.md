> Historical notes from the supplied project. For this release, see README.md and UPDATE-NOTES.md.

# MARSWalk UI/UX restyle (logic unchanged)

- Palette: light paper theme -> warm charcoal, sandstone text, rust accent (all components remapped).
- Header.tsx rewritten: brand mark, pill navigation (Globe, Plan, Walk, Notes, More), compact clock, role toggle.
- Globe: Mars Trek tiles at zoom 3 (4096x2048), stronger sun with a visible terminator, ACES tone mapping, thin dust limb, dimmer stars.
- Fonts: Spectral (headings) and IBM Plex Sans (body), set in index.html, tailwind.config.js, index.css.
- Not touched: routePlanner, evaPlanner, storage, commManager, MarsSurface 3D walk, data and assets.
- Not built or run here (no npm access). Run: npm install && npm run typecheck && npm run dev
