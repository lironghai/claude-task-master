/**
 * @fileoverview Error handling utilities for Cursor CLI provider
 */

import { APICallError, LoadAPIKeyError } from '@ai-sdk/provider';

/**
 * @typedef {import('./types.js').CursorCliErrorMetadata} CursorCliErrorMetadata
 */

/**
 * Create an API call error with Cursor CLI specific metadata
 * @param {Object} params - Error parameters
 * @param {string} params.message - Error message
 * @param {string} [params.code] - Error code
 * @param {number} [params.exitCode] - Process exit code
 * @param {string} [params.stderr] - Standard error output
 * @param {string} [params.promptExcerpt] - Excerpt of the prompt
 * @param {boolean} [params.isRetryable=false] - Whether the error is retryable
 * @returns {APICallError}
 */
export function createAPICallError({
	message,
	code,
	exitCode,
	stderr,
	promptExcerpt,
	isRetryable = false
}) {
	/** @type {CursorCliErrorMetadata} */
	const metadata = {
		code,
		exitCode,
		stderr,
		promptExcerpt
	};

	return new APICallError({
		message,
		isRetryable,
		url: 'cursor-cli://command',
		requestBodyValues: promptExcerpt ? { prompt: promptExcerpt } : undefined,
		data: metadata
	});
}

/**
 * Create an authentication error
 * @param {Object} params - Error parameters
 * @param {string} params.message - Error message
 * @returns {LoadAPIKeyError}
 */
export function createAuthenticationError({ message }) {
	return new LoadAPIKeyError({
		message:
			message ||
			'Authentication failed. Please ensure Cursor CLI (cursor-agent) is properly authenticated. Run `cursor-agent` in your terminal to set it up.'
	});
}

/**
 * Create a timeout error
 * @param {Object} params - Error parameters
 * @param {string} params.message - Error message
 * @param {string} [params.promptExcerpt] - Excerpt of the prompt
 * @param {number} params.timeoutMs - Timeout in milliseconds
 * @returns {APICallError}
 */
export function createTimeoutError({ message, promptExcerpt, timeoutMs }) {
	/** @type {CursorCliErrorMetadata & { timeoutMs: number }} */
	const metadata = {
		code: 'TIMEOUT',
		promptExcerpt,
		timeoutMs
	};

	return new APICallError({
		message,
		isRetryable: true,
		url: 'cursor-cli://command',
		requestBodyValues: promptExcerpt ? { prompt: promptExcerpt } : undefined,
		data: metadata
	});
}
