// ─── Self-Hosted OTA Update Service ─────────────────────────────────
// Checks Firebase for new versions on app boot, downloads update bundles
// from Firebase Hosting, and applies them silently or with a force-screen.
// Uses @capgo/capacitor-updater for native bundle swapping.
//
// NOTE: notifyAppReady() is NOT called here.
// It is called DIRECTLY in App.tsx boot() BEFORE this service is invoked.
// This guarantees the ready signal fires even if Firebase init fails.
// ─────────────────────────────────────────────────────────────────────

import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase';
import { createLogger } from '../utils/logger';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { toast } from 'sonner';

const log = createLogger('OTA');

// ─── Constants ──────────────────────────────────────────────────────

/** Keys used in localStorage to track the OTA update state */
const PENDING_VERSION_KEY   = 'sv_ota_pending_version';
const PENDING_BUNDLE_ID_KEY = 'sv_ota_pending_bundle_id';
const FAILED_VERSIONS_KEY   = 'sv_ota_failed_versions';
/** Written before reload() — read by App.tsx on next boot to show the success toast */
export const OTA_JUST_UPDATED_KEY = 'sv_ota_just_updated';

/**
 * Tracks the native binary version (from App.getInfo()) that was running
 * when OTA state was last written. If the native version changes (i.e. the
 * user installed a new APK from GitHub Releases), all OTA state becomes
 * invalid and must be cleared to prevent the false-rollback poisoning path.
 */
const NATIVE_VERSION_KEY = 'sv_ota_native_version';

/** Firestore path: app_config/latest_version */
const VERSION_DOC_PATH = 'app_config';
const VERSION_DOC_ID   = 'latest_version';

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Compare two semantic version strings.
 * Returns 1 if v1 > v2, -1 if v1 < v2, 0 if v1 === v2.
 */
function compareVersions(v1: string, v2: string): number {
  if (!v1 || !v2) return 0;
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

function addFailedVersion(version: string) {
  if (!version) return;
  try {
    const list = JSON.parse(localStorage.getItem(FAILED_VERSIONS_KEY) || '[]');
    if (!list.includes(version)) {
      list.push(version);
      localStorage.setItem(FAILED_VERSIONS_KEY, JSON.stringify(list));
    }
  } catch (e) {
    // Ignore JSON parse errors
  }
}

function hasFailedVersion(version: string): boolean {
  try {
    const list = JSON.parse(localStorage.getItem(FAILED_VERSIONS_KEY) || '[]');
    return list.includes(version);
  } catch (e) {
    return false;
  }
}

// ─── Types ──────────────────────────────────────────────────────────

interface VersionMetadata {
  version: string;
  url: string;
  critical: boolean;
  checksum?: string;
  releaseNotes?: string;
  minAppVersion?: string;
  min_apk_version?: string; // Mapped from Firestore config
  releasedAt?: string;
}

interface UpdaterOptions {
  /** Callback fired when a critical update is downloading — show blocker UI */
  onCriticalUpdate?: () => void;
}

// ─── Ground-Truth Version Resolution ────────────────────────────────

/**
 * Returns the true currently-running OTA bundle version.
 *
 * ⚠️ KEY FIX: We no longer rely on localStorage as the primary source.
 * localStorage can be cleared/corrupted/poisoned by the old "POISON CLEAR"
 * logic. Instead, we ask CapacitorUpdater directly what bundle is active.
 *
 * Resolution order:
 *  1. CapacitorUpdater.current().bundle.version  (if not 'builtin' / not empty)
 *  2. '0.0.0'  (tells checkForUpdate to always pull the latest OTA bundle)
 */
async function getActiveVersion(): Promise<string> {
  try {
    const current = await CapacitorUpdater.current();
    const bundleVersion = current?.bundle?.version;
    const bundleId      = current?.bundle?.id;

    // 'builtin' means no OTA bundle is active — treat as 0.0.0 so we always download
    if (bundleId && bundleId !== 'builtin' && bundleVersion && bundleVersion !== 'builtin') {
      log.debug(`[OTA] Ground-truth active bundle version: ${bundleVersion} (id: ${bundleId})`);
      return bundleVersion;
    }
    log.debug(`[OTA] Running on builtin bundle — active version treated as 0.0.0`);
    return '0.0.0';
  } catch (e) {
    log.warn('[OTA] Could not read current bundle version from CapacitorUpdater. Defaulting to 0.0.0.', e);
    return '0.0.0';
  }
}

// ─── Core Functions ─────────────────────────────────────────────────

/**
 * Check for OTA updates and apply if a newer version is found.
 * Call AFTER notifyAppReady() and AFTER initFirebase() have both been called.
 *
 * Flow:
 * 1. Detect native APK version changes and clear stale state
 * 2. Verify post-boot bundle state (confirm or rollback pending update)
 * 3. Fetch latest version metadata from Firestore
 * 4. Compare with the LIVE running bundle version (from CapacitorUpdater, not localStorage)
 * 5. If newer: download bundle → set as next bundle
 */
export async function initUpdater(options: UpdaterOptions = {}): Promise<void> {
  // OTA updates only work on native platforms (Android/iOS), not web
  if (!Capacitor.isNativePlatform()) {
    log.debug('Skipping OTA updater — not a native platform');
    return;
  }

  // ── STEP 1: MIGRATION GUARD — Detect native APK version changes ──────────
  // If the user installs a new APK, all OTA localStorage state is invalid.
  // Clear it to prevent version blacklisting poisoning.
  try {
    let currentNativeVersion: string;
    try {
      const current = await CapacitorUpdater.current();
      currentNativeVersion = current.native || (await App.getInfo()).version;
    } catch(e) {
      currentNativeVersion = (await App.getInfo()).version;
    }
    const storedNativeVersion = localStorage.getItem(NATIVE_VERSION_KEY);

    if (storedNativeVersion && storedNativeVersion !== currentNativeVersion) {
      log.warn(
        `[OTA MIGRATION] Native APK version changed: ${storedNativeVersion} → ${currentNativeVersion}. ` +
        `Clearing all stale OTA state to prevent false-rollback poisoning.`
      );
      localStorage.removeItem(PENDING_VERSION_KEY);
      localStorage.removeItem(PENDING_BUNDLE_ID_KEY);
      localStorage.removeItem(FAILED_VERSIONS_KEY);
      log.info('[OTA MIGRATION] All OTA localStorage keys cleared. OTA state reset for new native base.');
    }

    // Always persist the current native version so future boots can detect changes.
    localStorage.setItem(NATIVE_VERSION_KEY, currentNativeVersion);
    log.debug(`[OTA MIGRATION] Native version recorded: ${currentNativeVersion}`);
  } catch (e) {
    log.warn('[OTA MIGRATION] Could not read native version for check. Skipping migration guard.', e);
  }

  // ── STEP 2: POST-BOOT VERIFICATION ───────────────────────────────────────
  // Check if we just successfully applied a pending OTA bundle.
  // If so, confirm it. If there was a rollback, mark the version as failed.
  try {
    const pendingVersion  = localStorage.getItem(PENDING_VERSION_KEY);
    const pendingBundleId = localStorage.getItem(PENDING_BUNDLE_ID_KEY);

    const current = await CapacitorUpdater.current();
    const currentBundleId      = current?.bundle?.id || 'builtin';
    const currentBundleVersion = current?.bundle?.version || 'N/A';
    const isBuiltin            = currentBundleId === 'builtin';
    const bundleIdMatch        = !!(pendingBundleId && currentBundleId === pendingBundleId);

    log.info(`[OTA DIAGNOSTICS] Post-boot state:
      - pendingVersion:       ${pendingVersion}
      - pendingBundleId:      ${pendingBundleId}
      - current.bundle.id:    ${currentBundleId}
      - current.bundle.version: ${currentBundleVersion}
      - isBuiltin:            ${isBuiltin}
      - bundleIdMatch:        ${bundleIdMatch}
    `);

    if (pendingVersion || pendingBundleId) {
      if (bundleIdMatch && !isBuiltin) {
        // ✅ SUCCESS: The pending bundle is now active — it booted correctly.
        log.info(`[OTA_EVENT: promoted] OTA version ${pendingVersion} confirmed running. Clearing pending state.`);
        localStorage.removeItem(PENDING_VERSION_KEY);
        localStorage.removeItem(PENDING_BUNDLE_ID_KEY);
        // NOTE: We do NOT write ACTIVE_VERSION_KEY — getActiveVersion() reads from
        // CapacitorUpdater directly now, so localStorage is not the authority.
      } else {
        // ❌ ROLLBACK: The bundle we expected is not running. Mark it failed.
        log.warn(
          `[OTA_EVENT: rollback_detected] Expected bundle ${pendingBundleId}, but running ${currentBundleId}. ` +
          `Version ${pendingVersion || 'unknown'} failed to boot. Recording as failed.`
        );
        if (pendingVersion) addFailedVersion(pendingVersion);
        localStorage.removeItem(PENDING_VERSION_KEY);
        localStorage.removeItem(PENDING_BUNDLE_ID_KEY);
      }
    }
    // NOTE: We have intentionally REMOVED the old "POISON CLEAR" block that used to
    // wipe ACTIVE_VERSION_KEY when running on builtin with no pending bundle. That
    // logic caused updatethr loops. Version authority is now CapacitorUpdater.current().

  } catch (e) {
    log.warn(`[OTA] Could not verify current bundle from CapacitorUpdater:`, e);
  }

  // ── STEP 3: RUN THE UPDATE CHECK ─────────────────────────────────────────
  try {
    await checkForUpdate(options);
  } catch (err) {
    // Never crash the app because of an update check failure
    log.error('Update check failed — user stays on current version', err);
  }
}

/**
 * Performs a manual check for OTA updates.
 * Provides user feedback via return status, showing toasts, and downloading the update if found.
 */
export async function forceCheckForUpdate(): Promise<'latest' | 'downloaded' | 'not_supported' | 'error'> {
  if (!Capacitor.isNativePlatform()) {
    log.info('Manual OTA check: Not a native platform');
    return 'not_supported';
  }

  try {
    log.info('Manual OTA check: Initiating check...');

    // 1. Read latest version doc from Firestore
    const db = getFirebaseDb();
    const versionRef = doc(db, VERSION_DOC_PATH, VERSION_DOC_ID);
    const snapshot = await getDoc(versionRef);

    if (!snapshot.exists()) {
      log.warn('Manual OTA check: No version document in Firestore');
      return 'latest';
    }

    const remote = snapshot.data() as VersionMetadata;

    // 2. Get the ground-truth running version
    const activeVersion = await getActiveVersion();
    log.info(`Manual OTA check: running=${activeVersion}, remote=${remote.version}`);

    if (compareVersions(remote.version, activeVersion) <= 0) {
      log.info(`Manual OTA check: Already on latest (${activeVersion} >= ${remote.version})`);
      toast('You are already on the latest version!', { duration: 3000, position: 'bottom-center' });
      return 'latest';
    }

    // 3. Ensure native compatibility
    const minAppVersionRequired = remote.min_apk_version || remote.minAppVersion;
    if (minAppVersionRequired) {
      let nativeVersion: string;
      try {
        const currentInfo = await CapacitorUpdater.current();
        nativeVersion = currentInfo.native || (await App.getInfo()).version;
      } catch (e) {
        nativeVersion = (await App.getInfo()).version;
      }
      if (compareVersions(nativeVersion, minAppVersionRequired) < 0) {
        log.warn(`Manual OTA check: requires native app version ${minAppVersionRequired}, current: ${nativeVersion}`);
        return 'latest';
      }
    }

    // 4. Ensure not blacklisted
    if (hasFailedVersion(remote.version)) {
      log.warn(`Manual OTA check: Skip blacklisted version ${remote.version}`);
      // Clear the blacklist and retry — the user explicitly asked for an update
      localStorage.removeItem(FAILED_VERSIONS_KEY);
      log.info('Manual OTA check: Cleared failed versions blacklist on user-initiated check.');
    }

    if (!remote.url || !remote.url.trim()) {
      log.warn(`Manual OTA check: APK-only release. No OTA zip.`);
      return 'latest';
    }

    // 5. New version found — trigger download
    log.info(`Manual OTA check: Downloading ${remote.version}...`);
    await downloadAndApply(remote);
    return 'downloaded';

  } catch (err) {
    log.error('Manual OTA check: Failed', err);
    return 'error';
  }
}

/**
 * Fetch version metadata from Firestore, compare, and apply if newer.
 */
async function checkForUpdate(options: UpdaterOptions): Promise<void> {
  log.info(`[OTA_EVENT: check] Starting OTA check sequence...`);

  // 1. Read the latest version doc from Firestore
  const db = getFirebaseDb();
  const versionRef = doc(db, VERSION_DOC_PATH, VERSION_DOC_ID);
  const snapshot = await getDoc(versionRef);

  if (!snapshot.exists()) {
    log.warn('No version document found in Firestore — skipping update check');
    return;
  }

  const remote = snapshot.data() as VersionMetadata;
  log.info(`Remote version: ${remote.version}`, { critical: remote.critical, url: remote.url });

  // 2. Get the ground-truth active version from CapacitorUpdater (NOT localStorage)
  const activeVersion = await getActiveVersion();
  log.info(`[OTA_EVENT: check] Active (running) version: ${activeVersion}`);

  if (compareVersions(remote.version, activeVersion) <= 0) {
    log.info(`[OTA_EVENT: check_skip] Already running latest or newer (${activeVersion} >= ${remote.version}). No update needed.`);
    return;
  }

  log.info(`[OTA_EVENT: update_available] New version ${remote.version} available (running: ${activeVersion})`);

  // 3. Ensure native minimum app version requirements are met
  const minAppVersionRequired = remote.min_apk_version || remote.minAppVersion;
  if (minAppVersionRequired) {
    try {
      let nativeVersion: string;
      try {
        const currentInfo = await CapacitorUpdater.current();
        nativeVersion = currentInfo.native || (await App.getInfo()).version;
      } catch(e) {
        nativeVersion = (await App.getInfo()).version;
      }
      if (compareVersions(nativeVersion, minAppVersionRequired) < 0) {
        log.warn(`[OTA_EVENT: check_failed] Remote update requires minAppVersion ${minAppVersionRequired}, but native app is ${nativeVersion}. Skipping.`);
        return;
      }
    } catch (e) {
      log.warn('Could not check native version for minAppVersion enforcement', e);
    }
  }

  // 4. Skip known-broken bundles
  if (hasFailedVersion(remote.version)) {
    log.warn(`[OTA_EVENT: skip_failed] Remote version ${remote.version} previously failed to boot. Skipping to prevent crash loop.`);
    return;
  }

  // 5. Guard: no URL = APK-only release, skip OTA
  if (!remote.url || !remote.url.trim()) {
    log.warn(
      `[OTA_EVENT: skip_no_url] Remote version ${remote.version} has no OTA bundle URL. ` +
      `This is an APK-only release. Skipping OTA download.`
    );
    return;
  }

  if (remote.critical) {
    log.warn('[OTA] CRITICAL update — showing force-update screen');
    options.onCriticalUpdate?.();
  }

  await downloadAndApply(remote);
}

/**
 * Download the update bundle and apply it.
 *
 * IMPORTANT: We set the bundle as NEXT (applied on next restart), not immediately.
 * Pending state is tracked in localStorage so the next boot can confirm or rollback.
 */
async function downloadAndApply(remote: VersionMetadata): Promise<void> {
  log.info(`[OTA_EVENT: downloading] Silent background download from: ${remote.url}`);

  try {
    // Download the zip bundle — pass checksum if available for Capgo bundle validation
    const downloadParams: any = {
      url: remote.url,
      version: remote.version,
    };
    if (remote.checksum) {
      downloadParams.checksum = remote.checksum;
    }

    log.info('[OTA_EVENT: downloading] Invoking CapacitorUpdater.download', downloadParams);
    const bundle = await CapacitorUpdater.download(downloadParams);

    log.info(`[OTA_EVENT: downloaded] Bundle ready: id=${bundle.id}, version=${bundle.version}`);

    // Persist pending state BEFORE staging.
    // On next boot, we verify the running bundle matches this pending ID.
    // If it does → success. If not → rollback detected → mark as failed.
    localStorage.setItem(PENDING_VERSION_KEY, remote.version);
    localStorage.setItem(PENDING_BUNDLE_ID_KEY, bundle.id);

    // Write the "just updated" key — App.tsx reads this on next boot
    // to show the post-update success toast.
    localStorage.setItem(OTA_JUST_UPDATED_KEY, remote.version);

    // Stage bundle for next boot WITHOUT forcing an immediate reload.
    // The update will apply the next time the user naturally opens the app.
    await CapacitorUpdater.next({ id: bundle.id });

    log.info(`[OTA_EVENT: staged] Bundle ${bundle.id} (v${remote.version}) staged. Will apply on next app restart.`);

    toast(`✨ v${remote.version} downloaded!`, {
      description: "Restart the app now to apply the update.",
      duration: 15000,
      position: 'bottom-center',
      action: {
        label: 'Restart Now',
        onClick: async () => {
          try {
            log.info('[OTA] User clicked Restart Now from staging toast. Reloading...');
            await CapacitorUpdater.reload();
          } catch (e) {
            log.error('[OTA] Failed to reload app natively:', e);
            window.location.reload();
          }
        }
      }
    });

  } catch (err: any) {
    log.error('[OTA] Silent download/staging failed:', err);
    // Clean up — don't leave stale pending state that would cause false rollback detection
    localStorage.removeItem(PENDING_VERSION_KEY);
    localStorage.removeItem(PENDING_BUNDLE_ID_KEY);
    localStorage.removeItem(OTA_JUST_UPDATED_KEY);
    // Fail silently — user is unaware, will retry next launch
    throw err;
  }
}
