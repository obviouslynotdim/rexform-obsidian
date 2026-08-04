// English dictionary — the source of truth for keys. Every other locale mirrors
// these keys; missing keys fall back to English (see context.tsx).
//
// Scope today: settings-page strings. The rest of the app stays in English until
// its strings are migrated to t() — this dictionary is the place to grow.

export const en: Record<string, string> = {
  // Page chrome
  'settings.title': 'Settings',
  'settings.subtitle': 'Account and sync configuration',

  // Category nav
  'nav.general': 'General',
  'nav.account': 'Profile',
  'nav.editor': 'Editor',
  'nav.sync': 'Sync',
  'nav.communityPlugins': 'Plugins',

  // General
  'general.title': 'General',
  'general.language': 'Language',
  'general.languageDesc': 'Choose the display language for the app interface.',
  'general.languageEnglish': 'English',
  'general.languageKhmer': 'ខ្មែរ',

  // Account / Profile
  'account.title': 'Profile',
  'account.email': 'Email',
  'account.role': 'Role',
  'account.admin': 'Admin',
  'account.member': 'Member',
  'profile.firstName': 'First name',
  'profile.lastName': 'Last name',
  'profile.username': 'Username',
  'profile.usernameHint': 'Letters, numbers, dots, underscores or hyphens — 3 to 32 characters.',
  'profile.ssoManagedHint': "Managed by your organization's SSO provider.",
  'profile.signInMethod': 'Signed in via',
  'profile.sso': 'SSO',
  'profile.password': 'Password',
  'profile.passwordDesc': 'Change your account password.',
  'profile.currentPassword': 'Current password',
  'profile.newPassword': 'New password',
  'profile.confirmPassword': 'Confirm new password',
  'profile.passwordSsoNote': 'Your account signs in via SSO and has no password to change.',
  'profile.saved': 'Profile updated',
  'profile.passwordChanged': 'Password changed',
  'common.save': 'Save',
  'common.saving': 'Saving…',

  // Editor / Files & Links
  'editor.title': 'Files & Links',
  'editor.syncHeading': 'Sync filename with heading',
  'editor.syncHeadingDesc':
    'When enabled, editing the # heading renames the file and renaming the file updates the # heading — same as Obsidian.',
  'editor.defaultLocation': 'Default location for new notes',
  'editor.defaultLocationDesc': 'Where new notes are created when clicking + New.',
  'editor.vaultRoot': 'Vault root',
  'editor.sameFolder': 'Same folder as current note',

  // Sync / LiveSync
  'sync.title': 'Connect Obsidian (LiveSync)',
  'sync.intro':
    'Use these details in the Self-hosted LiveSync Obsidian plugin to sync your vault on desktop or mobile.',
  'sync.serverUrl': 'Server URL',
  'sync.database': 'Database',
  'sync.username': 'Username',
  'sync.password': 'Password',
  'sync.repair': 'Repair Connection',
  'sync.repairing': 'Repairing…',
  'sync.regenerate': 'Regenerate Password',

  // Community plugins
  'plugins.title': 'Plugins',
  'plugins.restrictedMode': 'Restricted mode',
  'plugins.browse': 'Browse',
  'plugins.installed': 'Installed plugins',
  'plugins.checkUpdates': 'Check for updates',

  // Generic
  'common.loading': 'Loading settings…',
};
