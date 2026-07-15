# KeeGuard — Production-Grade Android Autofill Implementation Plan

## Background & Repo Analysis Summary

**KeeGuard** is a **Capacitor-based** (React + Vite + Capacitor 8) password manager, **not** React Native. The native Android layer is pure Kotlin/Gradle. The app ID is `com.mohdj.securevault`.

### Tech Stack
| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| Native wrapper | Capacitor 8 (not React Native) |
| Backend | Firebase Firestore + Authentication |
| Android native | Kotlin, SQLCipher (Room), AndroidX Biometric |
| OTA updates | @capgo/capacitor-updater |

### Current Autofill State: What Already Exists

The autofill system is **substantially implemented** but has **significant gaps** and several **correctness issues**. Here is the full map:

#### ✅ Already Implemented (Good Quality)
| Module | File | Status |
|---|---|---|
| `SecureVaultAutofillService` | `autofill/SecureVaultAutofillService.kt` | Working, thin, well-structured |
| `AssistStructureParser` | `autofill/parser/AssistStructureParser.kt` | Good, 4-priority signal chain |
| `ParsedForm` / `ParsedField` | `autofill/parser/` | Clean data models |
| `PackageExclusionGuard` | `autofill/classifier/PackageExclusionGuard.kt` | Works, blocks own app + system |
| `DomainMatcher` | `autofill/DomainMatcher.kt` | Excellent — PSL, app mappings, confidence scoring |
| `CredentialMatcher` | `autofill/matcher/CredentialMatcher.kt` | Good — confidence-based sort |
| `SaveInfoBuilder` | `autofill/builder/SaveInfoBuilder.kt` | Works but has gaps (see below) |
| `SaveRequestHandler` | `autofill/handler/SaveRequestHandler.kt` | Good save/update/no-change logic |
| `SmartCategorySuggester` | `autofill/suggestion/SmartCategorySuggester.kt` | Good signal-map + learning |
| `AutofillServiceLocator` | `autofill/AutofillServiceLocator.kt` | Clean DI pattern |
| `UnlockVaultActivity` | `autofill/UnlockVaultActivity.kt` | Working 3-tier lookup after biometric |
| `LoginSessionCache` | `autofill/LoginSessionCache.kt` | LRU + TTL for multi-step flows |
| `SecureVaultCredentialProviderService` | `autofill/SecureVaultCredentialProviderService.kt` | Stub — registered, compiles |
| `AutofillBridgePlugin` | `bridge/AutofillBridgePlugin.kt` | Capacitor bridge — works |
| `AutofillSaveBottomSheet` | `src/app/components/AutofillSaveBottomSheet` | UI component, needs to be located properly |
| `autofillBridge.ts` | `src/app/services/autofillBridge.ts` | Capacitor plugin registration — correct |
| AndroidManifest registrations | `AndroidManifest.xml` | Both services registered correctly |
| `DomainMatcherTest` | Unit test | PSL + mapping tests pass |

#### ❌ Gaps, Bugs, and Missing Features

1. **Inline Suggestions (Android 11+)**: `SecureVaultAutofillService.onFillRequest` uses only `RemoteViews` (the old popup menu style). It does not implement `InlinePresentation` / `InlineSuggestionsRequest`. On modern keyboards (Gboard, Samsung), inline chips are expected.

2. **`SecureVaultCredentialProviderService` is a minimal stub**: `onBeginGetCredentialRequest` returns entries but the `PendingIntent` just opens the main `MainActivity` — there is no actual credential delivery flow. The second phase (handling the `PendingIntent` activity result and returning a `GetCredentialResponse`) is missing entirely.

3. **`SaveInfoBuilder` — REGISTRATION form type is broken**: `SaveInfo.SAVE_DATA_TYPE_EMAIL_ADDRESS` is added for REGISTRATION but `usernameField` ID may be null if the username is captured as EMAIL type by the parser, causing it to be excluded from `requiredIds`. The save will silently fail to fire.

4. **`AutofillCategoryRepositoryAdapter` uses hardcoded IDs**: Category IDs like `cat_email`, `cat_banking` are hardcoded, but KeeGuard's Firestore categories have real document IDs. When the JS vault saves via the bridge, it ignores the native category suggestion entirely because the ID doesn't match any Firestore document. The "live category IDs pushed to SharedPreferences" noted as future work in the adapter needs to be implemented.

5. **`AutofillVaultRepositoryAdapter.toVaultCredential()` discards multi-URI items**: `parseFirstUri` only returns the first URI from the JSON array. Items with multiple URLs (e.g., a work SSO item with `login.company.com` and `sso.company.com`) will only match the first URI.

6. **`SaveRequestHandler.launchSaveUI` uses an unprotected broadcast**: `context.sendBroadcast(intent)` with action `com.mohdj.securevault.AUTOFILL_SAVE` is sent without any signature permission check. Any app can send this broadcast on Android < 14 to inject fake save prompts.

7. **`UnlockVaultActivity` — PendingIntent `requestCode` collision risk**: `normalizedIdentity.hashCode()` is used as the request code, which risks collision for two different domains that hash to the same int.

8. **`AutofillBridgePlugin` — broadcast receiver not exported with `RECEIVER_NOT_EXPORTED` consistently**: On Android 13 (TIRAMISU) it correctly uses `RECEIVER_NOT_EXPORTED`, but the actual broadcast sender (`SaveRequestHandler`) uses a plain broadcast, creating an inconsistency.

9. **No `FillResponseBuilder` module**: FillResponse construction logic is inlined directly in `SecureVaultAutofillService` (700+ lines of logic in the service). This violates the single-responsibility requirement.

10. **No tests for**: `AssistStructureParser`, `CredentialMatcher`, `SaveRequestHandler`, `PackageExclusionGuard`, `SaveInfoBuilder`, `SmartCategorySuggester`.

11. **`AutofillHelper.kt` is dead code**: This is an older parser class that's never referenced by the current service. It should be deleted to avoid confusion.

12. **`autofill_service_config.xml` incomplete**: It supports `android:supportsInlineSuggestions="true"` but the actual service doesn't yet implement inline. This flag should be guarded by the implementation.

13. **Category IDs are not synced from JS to native**: The bridge plugin has `saveCredentialFromAutofill` but the native side receives a `categoryId` that maps to Firestore docs — the JS layer needs to pass valid Firestore IDs rather than relying on native suggestions.

---

## Open Questions

> [!IMPORTANT]
> **Category ID Mapping Strategy**: The `AutofillCategoryRepositoryAdapter` uses hardcoded IDs (`cat_email`, `cat_banking` etc.) that don't match real Firestore document IDs. Two options:
> - **Option A (Recommended)**: When the user unlocks the vault in the JS app, the JS layer pushes real category IDs + keys into `SharedPreferences` via the bridge, and the native adapter reads from there.
> - **Option B**: Ignore the native category suggestion and always force the user to select from the JS UI bottom sheet (less seamless).
> 
> Which approach do you prefer?

> [!IMPORTANT]
> **Inline Suggestions**: Should we implement `InlinePresentation` (keyboard chip suggestions, Android 11+) now? This doubles the complexity of `onFillRequest` but significantly improves UX on modern Android.

> [!NOTE]
> **CredentialProviderService depth**: The `SecureVaultCredentialProviderService` stub is registered but non-functional. Full implementation requires a second Activity to handle the selection `PendingIntent` and return a `PasswordCredential` via `PendingIntentHandler`. Should we implement this in full now?

---

## Proposed Changes

### Component 1 — Dead Code Removal & Architecture Cleanup

#### [DELETE] [AutofillHelper.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/AutofillHelper.kt)
The legacy parser class. Never referenced. Delete to avoid ambiguity.

---

### Component 2 — Security Hardening

#### [MODIFY] [SaveRequestHandler.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/handler/SaveRequestHandler.kt)

**Problem**: `context.sendBroadcast(intent)` is unprotected — any app can inject a save event.

**Fix**: Use a signature-level permission or switch from a global broadcast to a `LocalBroadcastManager`-equivalent pattern. Since KeeGuard uses Capacitor (same process on some versions), the cleanest fix is to use `LocalBroadcastManager` (no inter-process needed) or protect the broadcast with `Context.RECEIVER_NOT_EXPORTED`.

```kotlin
// Replace sendBroadcast() with:
LocalBroadcastManager.getInstance(context).sendBroadcast(intent)
```

#### [MODIFY] [AutofillBridgePlugin.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/bridge/AutofillBridgePlugin.kt)

Update receiver registration to use `LocalBroadcastManager` consistently (matching the sender change above). This also removes the `RECEIVER_NOT_EXPORTED` branching.

#### [MODIFY] [SecureVaultAutofillService.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/SecureVaultAutofillService.kt)

Fix the PendingIntent request code collision:
```kotlin
// Replace:
normalizedIdentity.hashCode()
// With:
(normalizedIdentity.hashCode() xor System.nanoTime().toInt()) and 0x7FFFFFFF
// or better: use a monotonically incrementing ID stored in a companion object atomic counter
```

---

### Component 3 — New: `FillResponseBuilder` Module

#### [NEW] [FillResponseBuilder.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/builder/FillResponseBuilder.kt)

Extract all FillResponse and Dataset construction logic out of `SecureVaultAutofillService` into a dedicated builder. This is a critical SRP fix.

```kotlin
package com.mohdj.securevault.autofill.builder

class FillResponseBuilder(private val context: Context) {

    /**
     * Builds a locked-vault dataset (single entry, authentication required).
     */
    fun buildLockedResponse(parsedForm: ParsedForm, unlockIntent: Intent): FillResponse

    /**
     * Builds filled datasets for matched credentials.
     * Supports both classic RemoteViews and InlinePresentation (Android 11+).
     */
    fun buildFilledResponse(
        parsedForm: ParsedForm,
        credentials: List<VaultCredential>,
        saveInfo: SaveInfo?,
        inlineRequest: InlineSuggestionsRequest? // null → no inline
    ): FillResponse

    /**
     * Builds an empty response with just SaveInfo attached.
     */
    fun buildSaveOnlyResponse(saveInfo: SaveInfo?): FillResponse

    // Private helpers:
    private fun buildInlinePresentation(spec: InlinePresentationSpec, cred: VaultCredential): InlinePresentation?
    private fun buildRemoteViews(cred: VaultCredential): RemoteViews
}
```

---

### Component 4 — Inline Suggestions (Android 11+)

#### [MODIFY] [SecureVaultAutofillService.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/SecureVaultAutofillService.kt)

Add inline suggestion support:

```kotlin
// In onFillRequest:
val inlineRequest = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
    request.inlineSuggestionsRequest
} else null

// Pass to FillResponseBuilder.buildFilledResponse()
```

#### [MODIFY] [FillResponseBuilder.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/builder/FillResponseBuilder.kt)

Implement `buildInlinePresentation()`:
```kotlin
@RequiresApi(Build.VERSION_CODES.R)
private fun buildInlinePresentation(
    spec: InlinePresentationSpec,
    cred: VaultCredential
): InlinePresentation? {
    return try {
        val slice = InlineSuggestionUi.newContentBuilder(createFillIntent(cred))
            .setTitle(cred.username.ifEmpty { cred.title })
            .setSubtitle(cred.title.takeIf { it != cred.username })
            .setStartIcon(Icon.createWithResource(context, R.drawable.ic_keeguard_inline))
            .build()
            .slice
        InlinePresentation(slice, spec, false)
    } catch (e: Exception) {
        null // Fall back to RemoteViews silently
    }
}
```

**Required resource**: `res/drawable/ic_keeguard_inline.xml` — a monochrome KeeGuard icon for IME chips.

---

### Component 5 — Fix `SaveInfoBuilder` for Registration Forms

#### [MODIFY] [SaveInfoBuilder.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/builder/SaveInfoBuilder.kt)

Current bug: `usernameField` is excluded from `requiredIds` for REGISTRATION forms when the email field is classified as `EMAIL` type (not `USERNAME`). Fix:

```kotlin
fun build(parsedForm: ParsedForm): SaveInfo? {
    // Fix: treat EMAIL fields the same as USERNAME for save purposes
    val identityField = parsedForm.usernameField ?: parsedForm.emailField
    val passwordId = parsedForm.passwordField?.autofillId ?: parsedForm.newPasswordField?.autofillId
        ?: return null  // Can't save without a password field

    val requiredIds = mutableListOf<AutofillId>()
    requiredIds.add(passwordId)
    
    val optionalIds = listOfNotNull(identityField?.autofillId)

    val saveType = when (parsedForm.formType) {
        FormType.LOGIN -> SaveInfo.SAVE_DATA_TYPE_USERNAME or SaveInfo.SAVE_DATA_TYPE_PASSWORD
        FormType.REGISTRATION -> SaveInfo.SAVE_DATA_TYPE_USERNAME or
                SaveInfo.SAVE_DATA_TYPE_PASSWORD or SaveInfo.SAVE_DATA_TYPE_EMAIL_ADDRESS
        FormType.CHANGE_PASSWORD -> SaveInfo.SAVE_DATA_TYPE_PASSWORD
        else -> return null
    }

    return SaveInfo.Builder(saveType, requiredIds.toTypedArray())
        .setOptionalIds(optionalIds.toTypedArray())
        .setFlags(SaveInfo.FLAG_SAVE_ON_ALL_VIEWS_INVISIBLE)
        .build()
}
```

Add `emailField` to `ParsedForm` to expose EMAIL-typed fields separately for save logic.

#### [MODIFY] [ParsedForm.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/parser/ParsedForm.kt)

Add `emailField: ParsedField?` property alongside `usernameField` so `SaveInfoBuilder` can use it as a fallback identity field.

---

### Component 6 — Fix Multi-URI Credential Matching

#### [MODIFY] [AutofillVaultRepositoryAdapter.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/AutofillVaultRepositoryAdapter.kt)

Parse ALL URIs from the JSON array, not just the first one. `VaultCredential` needs a `uris: List<String>` field instead of `uri: String?`.

#### [MODIFY] [VaultCredential.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/matcher/VaultCredential.kt)

```kotlin
data class VaultCredential(
    val id: String,
    val title: String,
    val username: String,
    val password: String,
    val uris: List<String>,          // Changed: supports multiple URIs
    val packageName: String?,
    val categoryId: String,
    val lastUsedAt: Long,
    val faviconUrl: String?
)
```

#### [MODIFY] [CredentialMatcher.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/matcher/CredentialMatcher.kt)

Update `findMatches` to test confidence against all URIs and pick the best score:
```kotlin
val confidence = cred.uris.maxOfOrNull { uri ->
    domainMatcher.calculateConfidence(target, uri)
} ?: (cred.packageName?.let { domainMatcher.calculateConfidence(target, it) } ?: 0.0)
```

---

### Component 7 — Category ID Sync (JS → Native)

#### [NEW] [CategorySyncBridgePlugin.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/bridge/CategorySyncBridgePlugin.kt)

A lightweight Capacitor plugin the JS layer calls when the vault is unlocked to push live Firestore category IDs into `SharedPreferences`:

```kotlin
@CapacitorPlugin(name = "CategorySync")
class CategorySyncBridgePlugin : Plugin() {

    @PluginMethod
    fun syncCategories(call: PluginCall) {
        val categoriesJson = call.getObject("categories") ?: run {
            call.reject("Missing categories")
            return
        }
        // Store: SharedPreferences "kg_live_categories"
        // { "email": "actual_firestore_id_123", ... }
        val prefs = context.getSharedPreferences("kg_live_categories", Context.MODE_PRIVATE)
        prefs.edit().apply {
            categoriesJson.keys().forEach { key ->
                putString(key, categoriesJson.getString(key))
            }
            apply()
        }
        call.resolve()
    }
}
```

#### [MODIFY] [AutofillCategoryRepositoryAdapter.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/AutofillCategoryRepositoryAdapter.kt)

Read from the live `SharedPreferences` written by `CategorySyncBridgePlugin`, falling back to hardcoded defaults only when the prefs are empty (e.g., first launch before vault unlock).

#### [NEW] `src/app/services/categorySync.ts`

TypeScript service that calls `CategorySync.syncCategories()` when the vault is unlocked:
```typescript
import { registerPlugin } from '@capacitor/core';

const CategorySync = registerPlugin('CategorySync');

export async function syncCategoriesToNative(categories: Record<string, string>) {
  if (Capacitor.getPlatform() !== 'android') return;
  await CategorySync.syncCategories({ categories });
}
```

Call `syncCategoriesToNative(liveCategories)` from the vault-unlock handler in the existing JS store.

---

### Component 8 — `SecureVaultCredentialProviderService` Full Implementation

> [!NOTE]
> This implements the full Android 14+ credential provider flow. The current stub only shows entries; selecting one does nothing useful.

#### [MODIFY] [SecureVaultCredentialProviderService.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/SecureVaultCredentialProviderService.kt)

Full implementation:

```kotlin
override fun onBeginGetCredentialRequest(
    request: BeginGetCredentialRequest,
    cancellationSignal: CancellationSignal,
    callback: OutcomeReceiver<BeginGetCredentialResponse, GetCredentialException>
) {
    scope.launch {
        val callingPkg = request.callingAppInfo?.packageName ?: ""
        val locator = AutofillServiceLocator.getInstance(applicationContext)

        // 1. Check vault is unlocked
        if (!locator.credentialMatcher.vaultRepository.isVaultUnlocked()) {
            callback.onResult(BeginGetCredentialResponse(emptyList()))
            return@launch
        }

        // 2. Get all credentials — filter by calling app domain
        val allCreds = locator.credentialMatcher.vaultRepository.getAllDecryptedCredentials()
        val entries = mutableListOf<CredentialEntry>()

        for (option in request.beginGetCredentialOptions) {
            if (option is BeginGetPasswordOption) {
                val matched = allCreds.filter { cred ->
                    cred.uris.any { uri -> locator.credentialMatcher.domainMatcher
                        .calculateConfidence(callingPkg, uri) > 0 }
                    || cred.uris.isEmpty() // Show all if no URI (let user pick)
                }.take(10)

                for (cred in matched) {
                    val entry = PasswordCredentialEntry.Builder(
                        applicationContext,
                        cred.username,
                        createCredentialDeliveryIntent(cred.id),
                        option
                    )
                        .setDisplayName(cred.title)
                        .setLastUsedTime(Instant.ofEpochMilli(cred.lastUsedAt))
                        .build()
                    entries.add(entry)
                }
            }
        }

        callback.onResult(BeginGetCredentialResponse(entries))
    }
}

private fun createCredentialDeliveryIntent(credentialId: String): PendingIntent {
    val intent = Intent(applicationContext, CredentialDeliveryActivity::class.java).apply {
        putExtra("credential_id", credentialId)
    }
    return PendingIntent.getActivity(
        applicationContext,
        credentialId.hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
}
```

#### [NEW] [CredentialDeliveryActivity.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/CredentialDeliveryActivity.kt)

Handles the user tapping a credential entry in the Credential Manager picker:

```kotlin
class CredentialDeliveryActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val credId = intent.getStringExtra("credential_id") ?: run {
            setResult(RESULT_CANCELED); finish(); return
        }
        
        CoroutineScope(Dispatchers.IO).launch {
            val repo = AutofillServiceLocator.getInstance(applicationContext)
                .credentialMatcher.vaultRepository
            val cred = repo.getAllDecryptedCredentials().firstOrNull { it.id == credId }
            
            runOnUiThread {
                if (cred == null) {
                    setResult(RESULT_CANCELED)
                } else {
                    val result = PasswordCredential(cred.username, cred.password)
                    val responseData = android.os.Bundle().apply {
                        putParcelable(CredentialManager.EXTRA_GET_CREDENTIAL_RESPONSE, result)
                    }
                    PendingIntentHandler.setGetCredentialResponse(
                        Intent().apply { putExtras(responseData) }, 
                        GetCredentialResponse(result)
                    )
                    setResult(RESULT_OK, intent)
                }
                finish()
            }
        }
    }
}
```

#### [MODIFY] [AndroidManifest.xml](file:///d:/PYTHON/Password%20Manager/android/app/src/main/AndroidManifest.xml)

Register `CredentialDeliveryActivity`:
```xml
<activity
    android:name=".autofill.CredentialDeliveryActivity"
    android:exported="false"
    android:taskAffinity=""
    android:excludeFromRecents="true" />
```

---

### Component 9 — Unit Tests

#### [NEW] `android/app/src/test/.../autofill/AssistStructureParserTest.kt`

Test field classification heuristics: `autofillHints` priority, `inputType` fallback, HTML type fallback, keyword fallback, SEARCH exclusion, OTP detection.

#### [NEW] `android/app/src/test/.../autofill/CredentialMatcherTest.kt`

Test: exact domain match, subdomain match, multi-URI credential, package name mapping, empty vault, confidence threshold filtering.

#### [NEW] `android/app/src/test/.../autofill/SaveRequestHandlerTest.kt`

Test: new save, update (password changed), no-change, incomplete data (no password), incomplete data (no username).

#### [NEW] `android/app/src/test/.../autofill/PackageExclusionGuardTest.kt`

Test: own package blocked, system UI blocked, systemPrefixes blocked, user blocklist respected, third-party apps allowed.

#### [NEW] `android/app/src/test/.../autofill/SaveInfoBuilderTest.kt`

Test: LOGIN form → correct save type, REGISTRATION form → email included, CHANGE_PASSWORD form → password only, SEARCH form → null returned, missing password field → null returned.

#### [NEW] `android/app/src/test/.../autofill/SmartCategorySuggesterTest.kt`

Test: exact signal match (gmail → email), multiple keyword match (github → work), learned preference override, unknown domain → root passwords fallback.

---

### Component 10 — FillResponse Presentation UX Polish

#### [MODIFY] [SecureVaultAutofillService.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/autofill/SecureVaultAutofillService.kt)

Replace the generic `android.R.layout.simple_list_item_1` with a **custom `RemoteViews` layout** that shows:
- KeeGuard lock icon (left)
- Username label (main text)
- Domain label (secondary text)

#### [NEW] `res/layout/autofill_dataset_item.xml`

```xml
<LinearLayout ...>
    <ImageView android:src="@drawable/ic_keeguard_inline" ... />
    <LinearLayout orientation="vertical">
        <TextView android:id="@+id/tv_username" ... />
        <TextView android:id="@+id/tv_domain" ... />
    </LinearLayout>
</LinearLayout>
```

#### [NEW] `res/layout/autofill_locked_item.xml`

For the locked-vault single entry: shows lock icon + "Unlock Keeguard" text.

---

### Component 11 — `AutofillBridgePlugin` Bridge Method Fix

#### [MODIFY] [AutofillBridgePlugin.kt](file:///d:/PYTHON/Password%20Manager/android/app/src/main/java/com/mohdj/securevault/bridge/AutofillBridgePlugin.kt)

Add missing `recordCategoryOverride` method (referenced in `autofillBridge.ts` but not implemented natively):

```kotlin
@PluginMethod
fun recordCategoryOverride(call: PluginCall) {
    val domain = call.getString("domain") ?: return call.reject("Missing domain")
    val categoryId = call.getString("categoryId") ?: return call.reject("Missing categoryId")
    AutofillServiceLocator.getInstance(context).categorySuggester.recordUserOverride(domain, categoryId)
    call.resolve()
}
```

#### [MODIFY] [autofillBridge.ts](file:///d:/PYTHON/Password%20Manager/src/app/services/autofillBridge.ts)

Update the interface to include `recordCategoryOverride`:
```typescript
recordCategoryOverride(opts: { domain: string; categoryId: string }): Promise<void>;
```

---

## Verification Plan

### Automated Tests

Run unit tests:
```bash
cd android
./gradlew :app:test --tests "com.mohdj.securevault.autofill.*"
```

Expected: All 6 test suites pass (DomainMatcherTest + 5 new).

### Manual Testing Matrix

| Test Case | Expected Result | Android Version |
|---|---|---|
| Chrome login form — matched credential | Dropdown/inline chip shows username | 12, 13, 14, 15 |
| Chrome login form — no match | Dropdown not shown; save prompt fires after submit | 12, 13, 14, 15 |
| Chrome password change | Update prompt fires after submit | 13+ |
| Native app with package mapping (Instagram) | Credential suggested | 12+ |
| Native app — no mapping | Package ID used as identity, falls back gracefully | 12+ |
| KeeGuard search bar | No autofill prompt | 12+ |
| KeeGuard master password field | No autofill prompt | 12+ |
| Vault locked — any external form | Single "🔒 Unlock Keeguard" entry | 12+ |
| Unlock via biometric → then fill | Credential fills without second prompt | 12+ |
| Android 14 Credential Manager surface | Credential entry appears in system picker | 14+ |
| Registration form | Save prompt fires with email + new password | 13+ |
| Multi-account same domain | Multiple credential entries shown | 12+ |
| Gboard inline suggestion mode | Chip appears in keyboard suggestion strip | 11+ |
| Samsung keyboard | Inline chip or dropdown works | 13+ |

---

## Security Review Notes

| Area | Current Status | Action |
|---|---|---|
| Broadcast intent injection | ⚠️ Unprotected broadcast | Fix: Use `LocalBroadcastManager` |
| PendingIntent mutability | ✅ `FLAG_IMMUTABLE` used | OK |
| Biometric session key scrubbing | ✅ `fill(0)` before null | OK |
| Plaintext credentials in logs | ⚠️ `AUTOFILL_MATCH_COUNT` logs username count safely, but check all log lines | Audit all `Log.i` in service |
| `CredentialDeliveryActivity` exported | Must be `android:exported="false"` | Enforce in manifest |
| `CallingAppInfo` validation in CredentialProviderService | ❌ Not currently validated | Add package verification |
| SQLCipher key storage | ✅ AndroidKeystore-backed | OK |
| DEK memory lifetime | ✅ `BiometricVaultUnlocker` 5-min TTL + scrub on lock | OK |
| Intent extras with credential data | ⚠️ Password passed in `AUTOFILL_SAVE` broadcast intent extra | Mitigated by `LocalBroadcastManager` (intra-process only) |

---

## Future Enhancements (Not in This Plan)

- **Passkey / FIDO2 support** via `PublicKeyCredentialEntry` in `CredentialProviderService`
- **Card & identity autofill** (`SAVE_DATA_TYPE_CREDIT_CARD`, address fields)
- **Custom field matching rules** for sites with non-standard field names (per-domain override config)
- **Autofill analytics dashboard** in the app using `TelemetryLogger` data
- **OEM-specific workarounds** for Realme/Xiaomi's aggressive memory management killing autofill service
- **Domain blocklist UI** for users to exclude specific sites from KeeGuard autofill
- **Configurable `autoLockTimeoutMs`** synced from JS settings to `BiometricVaultUnlocker`

---

## Implementation Order (Execution Sequence)

1. Delete `AutofillHelper.kt` (dead code)
2. Fix `SaveRequestHandler` broadcast security (LocalBroadcastManager)
3. Update `AutofillBridgePlugin` to use LocalBroadcastManager
4. Add `emailField` to `ParsedForm` + fix `AssistStructureParser`
5. Fix `SaveInfoBuilder` registration bug
6. Fix `VaultCredential` multi-URI + update `CredentialMatcher`
7. Fix `AutofillVaultRepositoryAdapter` to emit all URIs
8. Create `FillResponseBuilder` (extract from service)
9. Refactor `SecureVaultAutofillService` to use `FillResponseBuilder`
10. Add inline suggestions support (Android 11+)
11. Add custom `RemoteViews` layouts for autofill items
12. Add `recordCategoryOverride` to `AutofillBridgePlugin`
13. Create `CategorySyncBridgePlugin` + `categorySync.ts`
14. Update `AutofillCategoryRepositoryAdapter` to read live IDs
15. Full `SecureVaultCredentialProviderService` implementation
16. Create `CredentialDeliveryActivity`
17. Register `CredentialDeliveryActivity` in AndroidManifest
18. Write 5 new unit test suites
19. Fix PendingIntent request code collision
20. Audit and sanitize all log statements for credential data
