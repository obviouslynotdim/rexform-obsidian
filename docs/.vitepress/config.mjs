import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'REXFORM Notes',
  description: 'Team knowledge base',

  // Read markdown from the vault root (parent of docs/)
  srcDir: '..',
  outDir: './.vitepress/dist',
  cacheDir: './.vitepress/cache',

  // Exclude non-content folders and raw AI prompt files
  // (prompt files contain <placeholder> template syntax that breaks Vue's compiler)
  srcExclude: [
    'docs/**',
    'node_modules/**',
    '.obsidian/**',
    '.smart-env/**',
    '.trash/**',
    '03-AI-Prompts/Clip Web Page.md',
    '03-AI-Prompts/Clip YouTube Transcript.md',
    '03-AI-Prompts/Emojify.md',
    '03-AI-Prompts/Explain like I am 5.md',
    '03-AI-Prompts/Fix grammar and spelling.md',
    '03-AI-Prompts/Generate glossary.md',
    '03-AI-Prompts/Generate table of contents.md',
    '03-AI-Prompts/Make longer.md',
    '03-AI-Prompts/Make shorter.md',
    '03-AI-Prompts/Remove URLs.md',
    '03-AI-Prompts/Rewrite as tweet thread.md',
    '03-AI-Prompts/Rewrite as tweet.md',
    '03-AI-Prompts/Simplify.md',
    '03-AI-Prompts/Summarize.md',
    '03-AI-Prompts/Translate to Chinese.md',
  ],

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Rexform', link: '/01-Rexform/Onboarding' },
      { text: 'Infrastructure', link: '/02-Infrastructure/MCP-Setup' },
      { text: 'AI Prompts', link: '/03-AI-Prompts/' },
    ],

    sidebar: {
      '/00-Home/': [
        {
          text: '🏠 Home',
          items: [
            { text: 'Dashboard',          link: '/00-Home/Dashboard' },
            { text: 'Restructure Summary', link: '/00-Home/Restructure-Summary' },
            { text: 'Vault Changelog',    link: '/00-Home/Vault-Changelog' },
          ],
        },
      ],

      '/01-Rexform/': [
        {
          text: '🏢 Rexform',
          items: [
            { text: 'Onboarding',            link: '/01-Rexform/Onboarding' },
            { text: 'Credentials Reference', link: '/01-Rexform/Credentials-Reference' },
          ],
        },
      ],

      '/02-Infrastructure/': [
        {
          text: '⚙️ Infrastructure',
          items: [
            { text: 'MCP Setup',      link: '/02-Infrastructure/MCP-Setup' },
            { text: 'LiveSync Setup', link: '/02-Infrastructure/LiveSync-Setup' },
            { text: 'Git Sync Setup', link: '/02-Infrastructure/Git-Sync-Setup' },
          ],
        },
      ],

      '/03-AI-Prompts/': [
        {
          text: '🤖 AI Prompts',
          items: [
            { text: 'Prompt Library', link: '/03-AI-Prompts/' },
          ],
        },
      ],
    },

    search: {
      provider: 'local',
    },

    footer: {
      message: 'REXFORM Group — Internal Knowledge Base',
      copyright: 'Copyright © 2026 REXFORM',
    },
  },
})
