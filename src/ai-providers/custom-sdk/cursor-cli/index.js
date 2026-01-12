/**
 * @fileoverview Cursor CLI provider factory
 */

import { CursorCliLanguageModel } from './language-model.js';

/**
 * @typedef {import('./types.js').CursorCliProvider} CursorCliProvider
 * @typedef {import('./types.js').CursorCliProviderSettings} CursorCliProviderSettings
 */

/**
 * Create a Cursor CLI provider instance
 * @param {CursorCliProviderSettings} [options] - Provider settings
 * @returns {CursorCliProvider}
 */
export function createCursorCli(options = {}) {
	const createLanguageModel = (modelId, settings = {}) => {
		return new CursorCliLanguageModel({
			id: modelId,
			settings: { ...options.defaultSettings, ...settings }
		});
	};

	const provider = function (modelId, settings) {
		if (new.target) {
			throw new Error(
				'The Cursor CLI provider function cannot be called with the new keyword.'
			);
		}
		return createLanguageModel(modelId, settings);
	};

	provider.languageModel = createLanguageModel;
	provider.chat = createLanguageModel;
	provider.textEmbeddingModel = (modelId) => {
		throw new Error('Text embedding models are not supported by Cursor CLI.');
	};

	return provider;
}
