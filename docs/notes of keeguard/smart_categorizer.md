# Smart Organizer Intelligence Layer Walkthrough

We have successfully implemented the **Smart Organizer Intelligence Layer** for KeeGuard. This production-grade classification system infers correct categories, service identities, and grouping clusters for vault items—even when URL/domain information is completely missing—without overfitting to username domains.

---

## 🛠️ Changes Implemented

### 1. Core Modules (in `src/app/services/SmartCategorizer.ts`)

- **`SignalExtractor`**: Normalizes and structures vault metadata.
  - Normalizes URLs to hostnames.
  - Pulls app identity from Android package names (e.g. `com.whatsapp` -> `WhatsApp`).
  - Serializes notes template custom fields (e.g., card numbers, banking details, netting PINs, API key indicators) into queryable tokens.
  - Detects credentials patterns (API key vs. standard login).
- **`CategoryInferenceEngine`**: Implements a weighted scoring system across candidate categories based on 8 core signals:
  - Exact domain/package name match (Weight `1.00`)
  - User correction overrides (Weight `0.90`)
  - Title keyword matches (Weight `0.85`)
  - Template/custom field matching (Weight `0.80`)
  - TOTP coupling (Weight `0.75`)
  - Notes keyword matching (Weight `0.70`)
  - Neighborhood tags/labels (Weight `0.65`)
  - Username domain hint (Weight `0.35` - *strictly guarded*)
- **`LearnedPreferenceStore`**: Secured local IndexedDB/LocalStorage preference store that tracks and indexes manual overrides to retrain suggestions.
- **`ReviewQueue`**: Manages all low-confidence classifications (`< 0.55`) by flagging `needsReview: true` and preparing alternative top-3 categories.

### 2. User Interface Enhancements (in `src/app/components/ManageCategories.tsx`)

- Split the **Smart Organize** dialog into **Auto-Apply Suggestions** and **Needs Review Queue**.
- Low-confidence items are now displayed in highly stylized, glassmorphic review cards.
- Displays the **Top 3 alternative categories** with their exact confidence levels.
- Enables **one-click quick-approval buttons** that instantly apply the selection and retrain the organizer via `LearnedPreferenceStore`.

---

## 🧪 Verification & Unit Tests

We created a comprehensive unit test suite in [smartOrganizer.test.ts](file:///d:/PYTHON/Password%20Manager/src/__tests__/smartOrganizer.test.ts) covering all requirements.

### Test Scenarios Covered
1. **No URL but clear title**: E.g. "Steam Client Login" -> correctly categorized as `Gaming` (`cat_gaming`).
2. **No URL, vague title, strong notes**: E.g. "Personal Account" with cardholder details -> correctly categorized as `Banking & Finance` (`cat_banking`).
3. **Misleading username domain**: E.g. `work@company.com` on `netflix.com` -> correctly categorized as `Entertainment` (`cat_subs`), ignoring work email bias.
4. **Corporate email on neutral service**: E.g. `spotify.com` with developer email -> correctly categorized as `Entertainment`, not forced into `Work`.
5. **Needs Review routing**: Vague entries are correctly flagged with `needsReview: true` and routed to the queue.
6. **Machine Learning from corrections**: Repeated manual overrides to a specific category are logged and successfully categorized in subsequent runs with highest priority.

### Vitest Terminal Execution Outcome:
```bash
 RUN  v4.1.7 D:/PYTHON/Password Manager

stdout | src/__tests__/smartOrganizer.test.ts > Smart Organizer Intelligence Layer Tests > should correctly classify item with no URL and vague title but strong template fields
DEBUG [Banking Case] Result: {
  "category": "Banking & Finance",
  "predictedCategoryId": "cat_banking",
  "predictedCategoryKey": "banking",
  "serviceName": "Personal",
  "confidence": 1,
  "confidenceScore": 1,
  "source": "Template custom fields matched for 'Banking & Finance', Notes matched keyword clue for 'Banking & Finance'",
  "action": "auto-categorize",
  "evidence": [
    "Template custom fields matched for 'Banking & Finance'",
    "Notes matched keyword clue for 'Banking & Finance'"
  ],
  "alternatives": [],
  "needsReview": false,
  "duplicateClusterKey": "dup_personalac_my_username",
  "suggestedIconSource": "CreditCard"
}

stdout | src/__tests__/smartOrganizer.test.ts > Smart Organizer Intelligence Layer Tests > should ignore username email domain bias for misleading usernames
DEBUG [Netflix Case] Result: {
  "category": "Entertainment",
  "predictedCategoryId": "cat_subs",
  "predictedCategoryKey": "entertainment",
  "serviceName": "Netflix",
  "confidence": 1,
  "confidenceScore": 1,
  "source": "Domain exact match clue: 'netflix.com', Title keyword matched clue: 'Netflix Stream'",
  "action": "auto-categorize",
  "evidence": [
    "Domain exact match clue: 'netflix.com'",
    "Title keyword matched clue: 'Netflix Stream'"
  ],
  "alternatives": [],
  "needsReview": false,
  "duplicateClusterKey": "dup_netflixstr_work_admincorporateemailcom",
  "suggestedIconSource": "Tv"
}

 ✓ src/__tests__/smartOrganizer.test.ts (7 tests) 17ms

 Test Files  1 passed (1)
      Tests  7 passed (7)
   Start at  00:51:25
   Duration  525ms (transform 90ms, setup 0ms, import 128ms, tests 17ms, environment 0ms)
```

All 7 unit tests passed successfully.
