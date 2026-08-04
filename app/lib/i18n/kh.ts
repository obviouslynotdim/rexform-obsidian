// Khmer (ខ្មែរ) dictionary. Mirrors the keys in en.ts. Any key not present here
// falls back to English at lookup time.

export const kh: Record<string, string> = {
  // Page chrome
  'settings.title': 'ការកំណត់',
  'settings.subtitle': 'ការកំណត់គណនី និងការធ្វើសមកាលកម្ម',

  // Category nav
  'nav.general': 'ទូទៅ',
  'nav.account': 'ប្រវត្តិរូប',
  'nav.editor': 'កម្មវិធីកែសម្រួល',
  'nav.sync': 'សមកាលកម្ម',
  'nav.communityPlugins': 'កម្មវិធីបន្ថែម',

  // General
  'general.title': 'ទូទៅ',
  'general.language': 'ភាសា',
  'general.languageDesc': 'ជ្រើសរើសភាសាសម្រាប់បង្ហាញនៅក្នុងកម្មវិធី។',
  'general.languageEnglish': 'English',
  'general.languageKhmer': 'ខ្មែរ',

  // Account / Profile
  'account.title': 'ប្រវត្តិរូប',
  'account.email': 'អ៊ីមែល',
  'account.role': 'តួនាទី',
  'account.admin': 'អ្នកគ្រប់គ្រង',
  'account.member': 'សមាជិក',
  'profile.firstName': 'នាមខ្លួន',
  'profile.lastName': 'នាមត្រកូល',
  'profile.username': 'ឈ្មោះអ្នកប្រើ',
  'profile.usernameHint': 'អក្សរ លេខ ចំណុច សញ្ញាគូស ឬសញ្ញាចំណុចក្រោម — ៣ ដល់ ៣២ តួអក្សរ។',
  'profile.ssoManagedHint': 'គ្រប់គ្រងដោយអ្នកផ្តល់សេវា SSO របស់អង្គភាពអ្នក។',
  'profile.signInMethod': 'ចូលប្រើតាមរយៈ',
  'profile.sso': 'SSO',
  'profile.password': 'ពាក្យសម្ងាត់',
  'profile.passwordDesc': 'ប្តូរពាក្យសម្ងាត់គណនីរបស់អ្នក។',
  'profile.currentPassword': 'ពាក្យសម្ងាត់បច្ចុប្បន្ន',
  'profile.newPassword': 'ពាក្យសម្ងាត់ថ្មី',
  'profile.confirmPassword': 'បញ្ជាក់ពាក្យសម្ងាត់ថ្មី',
  'profile.passwordSsoNote': 'គណនីរបស់អ្នកចូលប្រើតាមរយៈ SSO ហើយមិនមានពាក្យសម្ងាត់ដើម្បីប្តូរទេ។',
  'profile.saved': 'បានធ្វើបច្ចុប្បន្នភាពប្រវត្តិរូប',
  'profile.passwordChanged': 'បានប្តូរពាក្យសម្ងាត់',
  'common.save': 'រក្សាទុក',
  'common.saving': 'កំពុងរក្សាទុក…',

  // Editor / Files & Links
  'editor.title': 'ឯកសារ និងតំណ',
  'editor.syncHeading': 'ធ្វើសមកាលកម្មឈ្មោះឯកសារជាមួយចំណងជើង',
  'editor.syncHeadingDesc':
    'នៅពេលបើក ការកែសម្រួលចំណងជើង # នឹងប្ដូរឈ្មោះឯកសារ ហើយការប្ដូរឈ្មោះឯកសារនឹងធ្វើបច្ចុប្បន្នភាពចំណងជើង # — ដូចគ្នានឹង Obsidian។',
  'editor.defaultLocation': 'ទីតាំងលំនាំដើមសម្រាប់កំណត់ត្រាថ្មី',
  'editor.defaultLocationDesc': 'កន្លែងដែលកំណត់ត្រាថ្មីត្រូវបានបង្កើតពេលចុច + ថ្មី។',
  'editor.vaultRoot': 'ឫស Vault',
  'editor.sameFolder': 'ថតដូចគ្នានឹងកំណត់ត្រាបច្ចុប្បន្ន',

  // Sync / LiveSync
  'sync.title': 'ភ្ជាប់ Obsidian (LiveSync)',
  'sync.intro':
    'ប្រើព័ត៌មានទាំងនេះនៅក្នុងកម្មវិធីបន្ថែម Self-hosted LiveSync របស់ Obsidian ដើម្បីធ្វើសមកាលកម្ម vault របស់អ្នកនៅលើកុំព្យូទ័រ ឬទូរស័ព្ទ។',
  'sync.serverUrl': 'អាសយដ្ឋាន Server',
  'sync.database': 'មូលដ្ឋានទិន្នន័យ',
  'sync.username': 'ឈ្មោះអ្នកប្រើ',
  'sync.password': 'ពាក្យសម្ងាត់',
  'sync.repair': 'ជួសជុលការតភ្ជាប់',
  'sync.repairing': 'កំពុងជួសជុល…',
  'sync.regenerate': 'បង្កើតពាក្យសម្ងាត់ឡើងវិញ',

  // Community plugins
  'plugins.title': 'កម្មវិធីបន្ថែម',
  'plugins.restrictedMode': 'របៀបដាក់កម្រិត',
  'plugins.browse': 'រកមើល',
  'plugins.installed': 'កម្មវិធីបន្ថែមដែលបានដំឡើង',
  'plugins.checkUpdates': 'ពិនិត្យមើលបច្ចុប្បន្នភាព',

  // Generic
  'common.loading': 'កំពុងផ្ទុកការកំណត់…',
};
