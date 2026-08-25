// PURPOSE: Provides implementation and configuration for routes.ts.
/**
 * React Router Configuration Module
 * Maps application paths ('/', '/settings', '/security', '/generator', '/trash', etc.) to AppShell and screen compositions.
 */

import { createBrowserRouter } from 'react-router';
import { AppShell } from '@/ui/layout/AppShell';
import { HomeWrapper } from '@/ui/layout/HomeWrapper';
import { AddEditForm } from '@/ui/compositions/AddEditForm';
import { ItemDetail } from '@/ui/compositions/ItemDetail';
import { Settings } from '@/ui/compositions/Settings';
import { TrashBin } from '@/ui/compositions/TrashBin';
import { TermsPage } from './pages/legal/TermsPage';
import { PrivacyPage } from './pages/legal/PrivacyPage';
import { LicensePage } from './pages/legal/LicensePage';
import { SecurityDashboard } from '@/ui/compositions/SecurityDashboard';
import { PasswordGenerator } from '@/ui/compositions/PasswordGenerator';
import ManageCategories from '@/ui/compositions/ManageCategories';
import ManageProfiles from '@/ui/compositions/ManageProfiles';
import { PendingRequests } from '@/ui/compositions/PendingRequests';
import { CollectionListPage } from './pages/collections/CollectionListPage';
import { CollectionDetailPage } from './pages/collections/CollectionDetailPage';
import { CollectionAccessPage } from './pages/collections/CollectionAccessPage';
import { ShareCategoryPage } from './pages/sharing/ShareCategoryPage';
import { AdminDashboard } from '@/ui/compositions/AdminDashboard';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppShell,
    children: [
      { index: true, Component: HomeWrapper },
      { path: 'add', Component: AddEditForm },
      { path: 'item/:id', Component: ItemDetail },
      { path: 'edit/:id', Component: AddEditForm },
      { path: 'settings', Component: Settings },
      { path: 'admin', Component: AdminDashboard },
      { path: 'trash', Component: TrashBin },
      { path: 'security', Component: SecurityDashboard },
      { path: 'generator', Component: PasswordGenerator },
      { path: 'categories', Component: ManageCategories },
      { path: 'profiles', Component: ManageProfiles },
      { path: 'pending-requests', Component: PendingRequests },
      { path: 'share', Component: ShareCategoryPage },
      // Shared collection pages
      { path: 'collections', Component: CollectionListPage },
      { path: 'collections/:id', Component: CollectionDetailPage },
      { path: 'collections/:id/access', Component: CollectionAccessPage },
      // Legal pages — nested under AppShell so navigate(-1) returns to Settings
      { path: 'terms', Component: TermsPage },
      { path: 'privacy', Component: PrivacyPage },
      { path: 'license', Component: LicensePage },
    ],
  },
]);

