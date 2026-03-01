## worker.js updates
- Added console.log for userQuestion, matches length, top score, and text snippet in /chat route.
- Removed strict score threshold check (0.75) to allow LLM to handle low-confidence matches.
- Ensured context is built safely even if matches are empty.
