/**
 * @fileoverview Type definitions for Cursor CLI AI SDK provider
 * These JSDoc types mirror the structure used for other CLI providers
 */

/**
 * Cursor CLI provider settings
 * @typedef {Object} CursorCliSettings
 * @property {string} [pathToCursorAgent='cursor-agent'] - Custom path to Cursor Agent executable
 * @property {string} [model] - The model ID to use (e.g., 'gpt-4o')
 * @property {string} [cwd] - Working directory for CLI operations
 * @property {'text'|'json'|'stream'} [outputFormat='text'] - Output format for the CLI
 * @property {boolean} [interactive=false] - Whether to run in interactive mode (usually false for this SDK)
 * @property {boolean} [resume] - Resume the last session
 * @property {string} [resumeSessionId] - Resume a specific session ID
 * @property {boolean} [verbose] - Enable verbose logging
 * @property {Object.<string, string>} [env] - Environment variables
 */

/**
 * Cursor CLI Model ID type
 * @typedef {string} CursorCliModelId
 */

/**
 * Language model options
 * @typedef {Object} CursorCliLanguageModelOptions
 * @property {CursorCliModelId} id - The model ID
 * @property {CursorCliSettings} [settings] - Optional settings
 */

/**
 * Error metadata for Cursor CLI errors
 * @typedef {Object} CursorCliErrorMetadata
 * @property {string} [code] - Error code
 * @property {number} [exitCode] - Process exit code
 * @property {string} [stderr] - Standard error output
 * @property {string} [promptExcerpt] - Excerpt of the prompt that caused the error
 */

/**
 * Cursor CLI provider interface
 * @typedef {Object} CursorCliProvider
 * @property {function(CursorCliModelId, CursorCliSettings=): Object} languageModel - Create a language model
 */

/**
 * Cursor CLI provider settings
 * @typedef {Object} CursorCliProviderSettings
 * @property {CursorCliSettings} [defaultSettings] - Default settings to use for all models
 */

export {};
