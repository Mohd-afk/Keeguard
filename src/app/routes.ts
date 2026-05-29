import { createBrowserRouter } from 'react-router';
import { AppShell } from './components/AppShell';
import { HomeWrapper } from './components/HomeWrapper';
import { AddEditForm } from './components/AddEditForm';
import { ItemDetail } from './components/ItemDetail';
import { Settings } from './components/Settings';
import { TrashBin } from './components/TrashBin';
import { TermsPage } from './components/legal/TermsPage';
import { PrivacyPage } from './components/legal/PrivacyPage';
import { LicensePage } from './components/legal/LicensePage';
import { SecurityDashboard } from './components/SecurityDashboard';
import { PasswordGenerator } from './components/PasswordGenerator';
import ManageCategories from './components/ManageCategories';
import { PendingRequests } from './components/PendingRequests';
import { CollectionListPage } from './pages/collections/CollectionListPage';
import { CollectionDetailPage } from './pages/collections/CollectionDetailPage';
import { CollectionAccessPage } from './pages/collections/CollectionAccessPage';
import { ShareCategoryPage } from './pages/sharing/ShareCategoryPage';

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
      { path: 'trash', Component: TrashBin },
      { path: 'security', Component: SecurityDashboard },
      { path: 'generator', Component: PasswordGenerator },
      { path: 'categories', Component: ManageCategories },
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

