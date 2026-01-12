/**
 * src/ai-providers/cursor-cli.js
 *
 * Cursor CLI provider implementation using the custom SDK adapter.
 * This provider uses the local Cursor Agent CLI.
 */

import { createCursorCli } from './custom-sdk/cursor-cli/index.js';
import { BaseAIProvider } from './base-provider.js';
import {
	getSupportedModelsForProvider
} from '../../scripts/modules/config-manager.js';
import { execSync } from 'child_process';
import { log } from '../../scripts/modules/utils.js';

let _cursorCliChecked = false;
let _cursorCliAvailable = null;

/**
 * Provider for Cursor CLI integration
 *
 * Features:
 * - No API key required (uses local Cursor Agent CLI)
 * - Supported models loaded from supported-models.json
 */
export class CursorCliProvider extends BaseAIProvider {
	constructor() {
		super();
		this.name = 'Cursor CLI';
		// Load supported models from supported-models.json
		this.supportedModels = getSupportedModelsForProvider('cursor-cli');

		// Validate that models were loaded successfully
		if (this.supportedModels.length === 0) {
			log(
				'warn',
				'No supported models found for cursor-cli provider. Check supported-models.json configuration.'
			);
		}

		// Cursor CLI likely handles its own formatting, but we can default to text/auto
		this.needsExplicitJsonSchema = false;
		this.supportsTemperature = false;
	}

	/**
	 * @returns {string} The environment variable name for API key (not used)
	 */
	getRequiredApiKeyName() {
		return 'CURSOR_CLI_API_KEY';
	}

	/**
	 * @returns {boolean} False - Cursor CLI doesn't require API keys
	 */
	isRequiredApiKey() {
		return false;
	}

	/**
	 * Optional CLI availability check for Cursor CLI
	 * @param {object} params - Parameters (ignored)
	 */
	validateAuth(params) {
		// Check if cursor-agent is available in PATH
		if (process.env.NODE_ENV !== 'test' && !_cursorCliChecked) {
			try {
				// cursor-agent doesn't have a standard version flag documented, but we can check existence
				// Trying command -v or where on windows
				const checkCommand = process.platform === 'win32' ? 'where cursor-agent' : 'which cursor-agent';
				execSync(checkCommand, { stdio: 'pipe', timeout: 1000 });
				_cursorCliAvailable = true;
			} catch (error) {
				_cursorCliAvailable = false;
				log(
					'warn',
					'Cursor Agent CLI (cursor-agent) not detected in PATH. Ensure it is installed: curl https://cursor.com/install -fsS | bash'
				);
			} finally {
				_cursorCliChecked = true;
			}
		}
	}

	/**
	 * Creates a Cursor CLI client instance
	 * @param {object} params - Client parameters
	 * @returns {Function} Cursor CLI provider function
	 */
	getClient(params = {}) {
		try {
			const settings = {
				projectRoot: params.projectRoot
			};

			return createCursorCli({
				defaultSettings: settings
			});
		} catch (error) {
			this.handleError('client initialization', error);
		}
	}

	/**
	 * @returns {string[]} List of supported model IDs
	 */
	getSupportedModels() {
		return this.supportedModels;
	}

	/**
	 * Check if a model is supported
	 * @param {string} modelId - Model ID to check
	 * @returns {boolean} True if supported
	 */
	isModelSupported(modelId) {
		if (!modelId) return false;
		// Allow any model for now as cursor-cli might support more than we know
		// or just return true to let CLI handle errors
		return true; 
	}
}
