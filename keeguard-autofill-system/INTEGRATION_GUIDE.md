# KeeGuard Autofill — Integration Guide

## How to wire this into the existing KeeGuard app

### Step 1 — Implement the two interfaces

The autofill module depends on two interfaces. You implement these using
KeeGuard's existing Firestore / encrypted storage layer:

```kotlin
// In your main data layer (outside the autofill package):

class KeeGuardVaultRepository : VaultRepository {
    override suspend fun getAllDecryptedCredentials(): List<VaultCredential> {
        // Query Firestore, decrypt using existing AES-256 pipeline, return list
    }
    override suspend fun saveCredential(credential: VaultCredential) { /* ... */ }
    override suspend fun updateCredentialPassword(id: String, newPassword: String) { /* ... */ }
    override suspend fun isVaultUnlocked(): Boolean {
        // Return true if master key is in memory (vault was unlocked this session)
    }
}

class KeeGuardCategoryRepository : CategoryRepository {
    override suspend fun getCategoryIdByKey(key: String): String? {
        // Query live categories store, find by categoryKey field
    }
    override suspend fun getRootPasswordsCategoryId(): String {
        // Return the ID of the root Passwords category
    }
}
```

### Step 2 — Initialize in Application.onCreate()

```kotlin
class MainApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        AutofillServiceLocator.initialize(
            context = this,
            vaultRepository = KeeGuardVaultRepository(/* inject deps */),
            categoryRepository = KeeGuardCategoryRepository(/* inject deps */)
        )
    }
}
```

### Step 3 — Register the React Native module

```kotlin
// In your ReactNativeHost or PackageList:
override fun getPackages(): List<ReactPackage> = listOf(
    MainReactPackage(),
    KeeGuardAutofillPackage() // add this
)

class KeeGuardAutofillPackage : ReactPackage {
    override fun createNativeModules(ctx: ReactApplicationContext) =
        listOf(KeeGuardAutofillModule(ctx).also { KeeGuardAutofillModule.init(ctx) })
    override fun createViewManagers(ctx: ReactApplicationContext) = emptyList<ViewManager<*, *>>()
}
```

### Step 4 — Subscribe in App.tsx

```typescript
import { useEffect, useState } from 'react';
import { subscribeToAutofillSaveRequests, AutofillSaveEvent } from './autofill/autofillService';
import { AutofillSaveBottomSheet } from './autofill/AutofillSaveBottomSheet';

export default function App() {
  const [autofillEvent, setAutofillEvent] = useState<AutofillSaveEvent | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToAutofillSaveRequests((event) => {
      setAutofillEvent(event);
    });
    return unsubscribe;
  }, []);

  return (
    <>
      {/* ... rest of app ... */}
      <AutofillSaveBottomSheet
        event={autofillEvent}
        onDismiss={() => setAutofillEvent(null)}
      />
    </>
  );
}
```

### Step 5 — Apply importantForAutofill="no" to internal fields

For every internal field that should NEVER trigger autofill:

```tsx
<TextInput
  importantForAutofill="no"   // React Native prop
  autoComplete="off"
  // ... other props
/>
```

Fields to exclude (see module_9 in the prompt):
- Search bar
- Master password entry
- Title / URL / Notes in Add-Edit form
- All Settings inputs
- TOTP / OTP fields

### Step 6 — Add to AndroidManifest.xml

Copy the contents of AndroidManifest_autofill_additions.xml into your
existing AndroidManifest.xml inside the <application> tag.

### Step 7 — Add dependencies

Copy the contents of build_gradle_additions.txt into your
android/app/build.gradle dependencies block.
