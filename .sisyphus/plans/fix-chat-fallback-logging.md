# Work Plan: Fix Chat Fallback & Add Logging

## Goal
Fix the discrepancy where `/search` finds results for "2025年" but `/chat` returns the hardcoded fallback message. Also fix the issue where completely irrelevant queries (like "容祖儿") return the entire database. Add server-side logging to aid future debugging.

## Context & Decisions
- **Root cause 1 (/chat)**: The `/chat` endpoint strictly enforces `matches.matches[0].score < 0.75`. `bge-m3` produces scores generally lower than 0.75 for valid semantic matches.
- **Root cause 2 (/search)**: The `/search` endpoint performs a raw `topK: 5` query without ANY score filtering. Even completely irrelevant queries will return the closest mathematical vectors, resulting in garbage data if the database is small.
- **Decision**: Completely remove threshold for `/chat` (Send all 10). The code threshold in `/chat` will be entirely removed. The application will rely strictly on Qwen 1.5 14b's system prompt to identify and reject irrelevant context.
- **Decision**: Apply a `0.30` score filter to the `/search` endpoint to prevent returning completely irrelevant garbage (like "容祖儿") directly to the user.
- **Logging**: Add standard `console.log` statements for the user question, match count, and top score before sending context to the LLM.

## Scope Boundaries
- **IN**: Modifying `worker.js` (specifically the `/chat` and `/search` routes).
- **OUT**: Modifying frontend code, modifying Vectorize schema, or changing the embedding model.

## Tasks

### Wave 1

- [x] **Task 1: Update worker.js search filter**
  - **Action**: 
    1. Open `worker.js`.
    2. **In `/search` route**:
       - After fetching `matches` from Vectorize, filter the results: `matches.matches = matches.matches.filter(m => m.score >= 0.30);`
  - **Category**: `quick`
  - **Skills**: `git-master`
  - **QA**: `cat worker.js | grep "filter(m => m.score >= 0.30)"`

- [x] **Task 2: Update worker.js chat threshold and logging**
  - **Action**:
    1. Open `worker.js`.
    2. **In `/chat` route**:
       - Before processing matches, add `console.log` statements for:
         - `userQuestion`
         - `matches.matches.length` (safely)
         - `matches.matches[0]?.score` (safely)
         - A snippet of `matches.matches[0]?.metadata?.text` (safely)
       - **Completely REMOVE** the strict fallback check: `if (!matches.matches || matches.matches.length === 0 || matches.matches[0].score < 0.75) { ... return new Response(...) }`. If `matches.matches` is empty, just pass an empty string to the LLM context and let the LLM output the fallback based on the system prompt.
  - **Category**: `quick`
  - **Skills**: `git-master`
  - **QA**: The file should no longer contain `matches.matches[0].score < 0.75` and should contain the new `console.log`s.

### Wave 2

- [x] **Task 3: Verify endpoints behavior**
