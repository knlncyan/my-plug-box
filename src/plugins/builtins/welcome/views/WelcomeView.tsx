export default function WelcomeView() {
  return (
    <div className="p-10 max-w-2xl mx-auto select-none">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-purple-600 dark:text-purple-400 mb-2">
          Welcome to plug-box
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          A plugin-powered application where all features are provided by plugins.
        </p>
      </div>

      <div className="grid gap-4">
        <Card
          title="Command Palette"
          description={
            <>
              Press{' '}
              <kbd className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 px-1.5 py-0.5 rounded text-xs font-mono">
                Ctrl+Shift+P
              </kbd>{' '}
              to open the command palette and run any registered command.
            </>
          }
        />
        <Card
          title="Add a Plugin"
          description="Place a plugin directory inside the plugins/ folder. Built-in plugins are TypeScript modules; external plugins run in an isolated iframe sandbox."
        />
        <Card
          title="Contribution Points"
          description="Plugins can contribute commands, views (sidebar/main/panel), menu items, and settings — all declared in a plugin.json manifest."
        />
      </div>

      <p className="mt-8 text-xs text-gray-400">
        plug-box · powered by Tauri + React + TypeScript
      </p>
    </div>
  );
}

function Card({ title, description }: { title: string; description: React.ReactNode }) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-purple-300 dark:hover:border-purple-700 transition-colors">
      <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{title}</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  );
}

import type React from 'react';
