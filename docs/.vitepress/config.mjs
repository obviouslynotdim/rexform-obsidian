import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'REXFORM Notes',
  description: 'Team knowledge base',

  // Read markdown from the vault root (parent of docs/)
  srcDir: '..',
  outDir: './.vitepress/dist',
  cacheDir: './.vitepress/cache',

  // Exclude non-content folders from being processed as pages
  srcExclude: [
    'docs/**',
    'node_modules/**',
    '.obsidian/**',
    '.smart-env/**',
    '.trash/**',
  ],

  // Disable raw HTML rendering — prompt files use <placeholder> syntax
  // that Vue's compiler would misparse as HTML tags
  markdown: {
    html: false,
  },

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Rexform', link: '/01-Rexform/Onboarding' },
      { text: 'Infrastructure', link: '/02-Infrastructure/MCP-Setup' },
      { text: 'AI Prompts', link: '/03-AI-Prompts/Summarize' },
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
            { text: 'Clip Web Page',           link: '/03-AI-Prompts/Clip Web Page' },
            { text: 'Clip YouTube Transcript', link: '/03-AI-Prompts/Clip YouTube Transcript' },
            { text: 'Emojify',                 link: '/03-AI-Prompts/Emojify' },
            { text: 'Explain Like I Am 5',     link: '/03-AI-Prompts/Explain like I am 5' },
            { text: 'Fix Grammar & Spelling',  link: '/03-AI-Prompts/Fix grammar and spelling' },
            { text: 'Generate Glossary',       link: '/03-AI-Prompts/Generate glossary' },
            { text: 'Generate Table of Contents', link: '/03-AI-Prompts/Generate table of contents' },
            { text: 'Make Longer',             link: '/03-AI-Prompts/Make longer' },
            { text: 'Make Shorter',            link: '/03-AI-Prompts/Make shorter' },
            { text: 'Remove URLs',             link: '/03-AI-Prompts/Remove URLs' },
            { text: 'Rewrite as Tweet Thread', link: '/03-AI-Prompts/Rewrite as tweet thread' },
            { text: 'Rewrite as Tweet',        link: '/03-AI-Prompts/Rewrite as tweet' },
            { text: 'Simplify',                link: '/03-AI-Prompts/Simplify' },
            { text: 'Summarize',               link: '/03-AI-Prompts/Summarize' },
            { text: 'Translate to Chinese',    link: '/03-AI-Prompts/Translate to Chinese' },
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
