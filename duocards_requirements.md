# Requirements for an app for learning words and phrases

Status: a preliminary specification for a developer agent.
Date: 5 October 2026.

## 1. Purpose and scope of the document

A DuoCards-style app for remembering English and Spanish words and phrases through active recall and spaced repetition.

The main scenario: the user sees the meaning and examples with a placeholder instead of the studied expression, recalls the answer, says it for automatic checking, or reveals the card and grades the result themselves.

Sections 2–9 describe the core functionality. Section 10 contains proposed settings and assumptions that are not approved yet. Section 11 contains extra features that should not automatically be included in the required scope. Section 12 lists decisions needed before implementation.

## 2. Language spaces

- LANG-01. English and Spanish must have separate spaces.
- LANG-02. Each space has its own cards, sets, review queue and statistics.
- LANG-03. Cards of different languages are not mixed in one study session.
- LANG-04. Switching the space keeps progress and the reviews already done.
- LANG-05. The meaning may be written in the studied language or another language, for example Russian.
- LANG-06. Speech and pronunciation scoring use the card's studied language, not the language of the definition or the interface.

## 3. Cards

### 3.1. Content

| Field | Requirement |
| --- | --- |
| Word or phrase | Required text in the studied language |
| Meaning | Required translation or definition; a definition in the studied language is allowed |
| Usage examples | Support for one or more examples; whether they are required at creation needs a decision |
| Example translation | Optional |
| Pronunciation | The studied word or phrase can be listened to |
| Language space | Required membership in the English or Spanish space |
| Set | Optional membership in a set |

- CARD-01. The user can create, view, edit and delete cards.
- CARD-02. Cards have stable identifiers used by the interface and the API.
- CARD-03. Progress belongs to the card, not to a set or a single session.
- CARD-04. Changing examples or set membership keeps progress.
- CARD-05. On a significant change of the word or meaning there must be a way to reset progress explicitly.

### 3.2. Front side

- CARD-06. Before the flip, the meaning and usage examples are shown.
- CARD-07. The studied word or phrase is replaced with a placeholder in all examples.
- CARD-08. The placeholder hides the whole expression, including its changed form in the example and all repeated occurrences.
- CARD-09. The masking mechanism must support an explicitly given example fragment, to work correctly with changed forms and phrases.
- CARD-10. The app must not show the studied word in hints before the answer is checked or revealed.

An example for the card `am used to`:

```text
Meaning: to be accustomed to something
Example: I ___ working remotely.
```

If the user wrote a definition that contains the answer, the app should let them fix it; automatically rewriting the definition is not required.

### 3.3. Back side

- CARD-11. After the flip, the studied word or phrase, the meaning and the full examples without placeholders are shown.
- CARD-12. The user can listen to the reference pronunciation.
- CARD-13. Listening to the answer before an attempt to recall it must not quietly count as an independent successful recall.

## 4. Sets

- SET-01. A set has a name and an optional short description.
- SET-02. A set belongs to one language space.
- SET-03. The user can create, rename, edit and delete sets.
- SET-04. The user can add cards to a set, move them and remove them from a set.
- SET-05. A card can exist without a set and is available under "No set".
- SET-06. You can study a single set or all cards of the current language, including cards without a set.
- SET-07. Moving a card does not reset its progress and schedule.

### 4.1. Deleting a set

- SET-08. Before deleting, the app always asks whether to delete the set's cards.
- SET-09. The dialog has three actions:
  - "Keep cards": delete the set, move the cards to "No set", keep progress.
  - "Delete with cards": delete the set and its cards after explicit confirmation.
  - "Cancel": change nothing.
- SET-10. When deleting with cards, the interface shows the number of affected cards.
- SET-11. Through the API the deletion policy is also given explicitly; a request without it must not delete cards implicitly.

## 5. Study session

- LEARN-01. The user chooses the language and the study scope: a single set or all cards of the language.
- LEARN-02. The app shows the meaning and examples with placeholders.
- LEARN-03. The user can answer by voice or flip the card to check themselves.
- LEARN-04. In manual mode, after the reveal the user grades the answer:
  - swipe right — "Remembered";
  - swipe left — "Forgot".
- LEARN-05. Swipes are duplicated by buttons available on phone and computer.
- LEARN-06. In manual mode a grade is available only after the answer is revealed.
- LEARN-07. Revealing the card by itself does not count as a successful review.
- LEARN-08. After a grade, the result and the next review time are saved.
- LEARN-09. The user can end the session at any time; reviews already done are saved.
- LEARN-10. Resubmitting the same grade does not create a second result.

The terms "Remembered / Forgot" describe the result of a specific attempt. A successful answer does not mean the card is learned forever and needs no more reviews.

## 6. Voice answer and pronunciation scoring

Automatic checking of a voice answer is part of the core functionality.

### 6.1. Recording and analysis

- VOICE-01. The user can start and stop recording an answer.
- VOICE-02. The system determines whether the expected word or phrase was said.
- VOICE-03. The system scores pronunciation quality separately.
- VOICE-04. Answer correctness and pronunciation quality are stored as different results.
- VOICE-05. The system shows the check result and clear feedback.
- VOICE-06. With pronunciation that is not good enough, the user can listen to the reference and their own recording, then try again.
- VOICE-07. Where possible, the feedback points to specific sounds or parts of the expression that need improvement.
- VOICE-08. If microphone access is denied, manual mode stays available.
- VOICE-09. An error of the recognition or scoring service must not automatically count as a user mistake.

### 6.2. Processing rules

| Answer correctness | Pronunciation | Result |
| --- | --- | --- |
| Correct answer | Acceptable | Count a successful recall |
| Correct answer | Needs improvement | Count the word as correct, show remarks and offer to repeat the pronunciation |
| Wrong answer | Any | Count "Forgot" and return the card to relearning |
| Insufficient recognition confidence | Cannot be scored reliably | Offer a new recording; do not count a mistake automatically |

- VOICE-10. A correct answer with imperfect pronunciation must not automatically become "Forgot".
- VOICE-11. If the word is correct, the user can make several attempts to improve the pronunciation.
- VOICE-12. Pronunciation improvement attempts within one card do not create separate successful reviews of the word and do not grow the interval several times.
- VOICE-13. The user can continue studying without reaching the maximum pronunciation score.
- VOICE-14. Acceptable quality is defined by a configurable threshold, not by requiring a 100% score.
- VOICE-15. Scoring must take into account the chosen language variant and acceptable pronunciation variants.
- VOICE-16. Listening to the reference and repeating after it must not count as a new independent memory check.

### 6.3. Working with audio

- VOICE-17. Permanent storage of voice recordings is not required by default; the processing and deletion policy must be defined before implementation.
- VOICE-18. If an external service is used, the interface must announce that audio is sent before the first recording.
- VOICE-19. External service keys must not reach the client app or API responses.

## 7. Spaced repetition

- SRS-01. Each card has an answer history, a learning state and a next review time.
- SRS-02. Successful recalls grow the long-term interval according to the chosen algorithm.
- SRS-03. A "Forgot" answer returns the card to relearning.
- SRS-04. After a mistake the card is shown again in the current session with a short delay if the user keeps studying.
- SRS-05. After a repeated mistake the card returns to the queue again; there must be no limit on mistakes after which it disappears.
- SRS-06. Hard cards are not excluded automatically and do not become learned just from the number of showings.
- SRS-07. Ending a session keeps unfinished reviews for later study.
- SRS-08. Overdue reviews have priority over new cards.
- SRS-09. Studying a card in a set and in the shared queue uses a single progress.
- SRS-10. When a card is shown again after a mistake, other cards are placed between showings where possible.
- SRS-11. With no other cards, the app must not block the user in an endless mandatory loop: they can wait for the review or end the session.
- SRS-12. For regularly forgotten cards the app can suggest clarifying the definition or adding an example; this does not exclude the card from reviews.
- SRS-13. Voice and manual grading use the same rules for updating memory progress.

The recommended candidate for long-term scheduling is FSRS. The specific library, parameters and the mapping of the two grades "Remembered / Forgot" to the scheduler's inputs must be defined explicitly before implementation. Short reviews after a mistake must be coordinated with the scheduler.

Primary reference sources:

- [Anki spaced repetition algorithm description](https://faqs.ankiweb.net/what-spaced-repetition-algorithm.html)
- [Anki learning and review settings](https://docs.ankiweb.net/deck-options.html)

## 8. API for the agent

### 8.1. Operations

- API-01. Getting language spaces, sets and cards.
- API-02. Searching cards by word, phrase, meaning and set.
- API-03. Creating, editing and deleting sets.
- API-04. Creating, editing and deleting cards.
- API-05. Adding cards to a set, moving them and removing set membership.
- API-06. Bulk creation and update of cards.
- API-07. An explicit choice of the card deletion policy when deleting a set.

### 8.2. Contract and data safety

- API-08. The API requires authorization and gives access only to the owner's data.
- API-09. The contract is documented in OpenAPI and contains request and response examples.
- API-10. The same checks and business rules apply as in the interface.
- API-11. Required fields and the match of the card's and the set's language space are checked.
- API-12. Errors have a stable structure and a clear description.
- API-13. A bulk operation returns a result for each item; partial errors must not be hidden.
- API-14. Repeating the same request must not create duplicates because of a network retry; an idempotency mechanism is needed.
- API-15. Protection against overwriting a newer version of a card or set is provided.
- API-16. Editing content does not reset progress without an explicit request.
- API-17. To edit content, the agent does not need access to voice recordings or learning history.
- API-18. The API must provide data for masking the studied expression in examples.

## 9. General requirements

- GEN-01. The interface must be convenient on phone and computer.
- GEN-02. Progress is kept after the app is closed.
- GEN-03. Network retries do not apply one grade twice.
- GEN-04. Speech, microphone or speech analysis errors do not block manual study.
- GEN-05. The interface shows the number of available reviews and new cards.
- GEN-06. Card content, memory progress, pronunciation results and review history are accounted for separately.
- GEN-07. The app must provide clear loading and error states while processing a voice answer.

## 10. Proposed settings and assumptions

These decisions were proposed in discussion but not approved as final:

1. For the first version a card belongs to at most one set. If several sets are allowed, the card's progress stays single, and the deletion rules need clarification.
2. The initial short review after a mistake — in about one minute; the next step after a successful repeated recall — in about 10 minutes. The values must be configurable and consistent with the chosen algorithm.
3. FSRS is considered a candidate; the implementation choice is not fixed yet.
4. Permanent storage of audio recordings is off by default.

## 11. Extra features

Not in the required scope without a separate decision.

| Feature | Purpose | Proposed priority |
| --- | --- | --- |
| Undo the last grade | Fix an accidental swipe or a wrong grade | High |
| CSV/JSON import and export | Move the dictionary and make backups | High |
| Search and duplicate warning | Not create identical cards unnoticed | High |
| Daily new-card limit | Control the future review load | High |
| Accepted answer variants | Accept explicitly given synonyms and wordings | High for voice checking |
| Written answer | Check recall and spelling | Medium |
| Reverse direction: word → meaning | Train understanding of the word | Medium |
| Choosing a regional language variant | Configure the reference pronunciation and its scoring | Medium |
| Pausing a card | Temporarily exclude it by the user's decision | Medium |
| Hard-card statistics | Find words whose definitions should be improved | Medium |
| Offline study and sync | Study without a stable internet connection | Depends on the platform |
| AI preparation of definitions and examples | Speed up content creation with user review | Later |

## 12. Open decisions before implementation

1. Platform: a web app, a PWA, or a separate mobile app.
2. Accounts and sync between devices.
3. A card belonging to one or several sets.
4. Whether at least one example is required when creating a card.
5. The scheduler implementation, short review steps, and mapping the two grades to the algorithm's inputs.
6. The speech recognition and pronunciation scoring service, support for both languages, cost and acceptable latency.
7. The pronunciation score scale, the success threshold and acceptable regional variants.
8. Accepted answer rules: synonyms, articles, word forms and alternative wordings.
9. The ability to correct a wrong automatic grade.
10. The lifetime of voice recordings and the policy for their processing by external services.

The agent must record the assumptions it makes explicitly. Extra features should not be quietly included in the required scope, and automatic pronunciation scoring should not be replaced with simple text recognition.

## 13. Key acceptance criteria

1. While studying the English space, Spanish cards do not appear.
2. Before the flip the meaning and examples are visible, but the studied expression is hidden with a placeholder in all examples.
3. After the flip the full answer, full examples and speech are available.
4. When deleting a set the user chooses to keep or delete the cards; cancel changes nothing.
5. Cards kept when a set is deleted are available without a set and keep their progress.
6. A correct voice answer with pronunciation that is not good enough allows repeating the pronunciation without growing the memory interval again.
7. A wrong answer returns the card to the queue; repeated mistakes do not exclude it automatically.
8. Uncertain recognition or a service error is not automatically counted as a forgotten word.
9. Manual study works without a microphone.
10. One card keeps a single progress when studying a set and all cards of the language.
11. An authorized agent can edit sets and cards through the documented API.
12. Repeated create and grade requests do not create duplicate data or results.
