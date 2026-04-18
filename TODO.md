# Project TODOs

## Feature Requests

### 1. Export to Excel Feature
- [ ] Export saved question log to Excel
- [ ] Include all columns: timestamp, question, answer, correctness, points
- [ ] Export raw/live transcript to Excel
- [ ] Add export buttons to UI

### 2. Session Controls Enhancement
- [ ] Replace stop/restart flow with pause/resume option
- [ ] Maintain session state during pause
- [ ] Preserve current transcription and question log on pause

### 3. Question Editing
- [ ] Add edit functionality to saved questions
- [ ] Allow editing: question text, answer, correctness status, points
- [ ] Update UI to show edit buttons for each question row
- [ ] Persist edits to database

## Bugs / Investigations

## Tech Debt

- [ ] Remove the unused LLM question extractor — `backend/core/QuestionExtractor.py`, the OpenAI dependency wiring in `backend/config.py` (`OPENAI_API_KEY`, `ENABLE_QUESTION_EXTRACTION`), and its call site in `backend/core/SlidingWindowProcessor.py`. Not part of the product flow anymore.
