/**
 * @fileoverview Cursor CLI Language Model implementation
 */

import { NoSuchModelError } from '@ai-sdk/provider';
import { generateId } from '@ai-sdk/provider-utils';
import { spawn } from 'child_process';
import { createAPICallError, createAuthenticationError } from './errors.js';
import { log } from '../../../../scripts/modules/utils.js';

/**
 * @typedef {import('./types.js').CursorCliSettings} CursorCliSettings
 * @typedef {import('./types.js').CursorCliModelId} CursorCliModelId
 * @typedef {import('./types.js').CursorCliLanguageModelOptions} CursorCliLanguageModelOptions
 */

export class CursorCliLanguageModel {
	specificationVersion = 'v1';
	defaultObjectGenerationMode = 'json';
	supportsImageUrls = false;
	supportsStructuredOutputs = false;

	/** @type {CursorCliModelId} */
	modelId;

	/** @type {CursorCliSettings} */
	settings;

	/**
	 * @param {CursorCliLanguageModelOptions} options
	 */
	constructor(options) {
		this.modelId = options.id;
		this.settings = options.settings ?? {};

		if (!this.modelId || typeof this.modelId !== 'string') {
			throw new NoSuchModelError({
				modelId: this.modelId,
				modelType: 'languageModel'
			});
		}
	}

	get provider() {
		return 'cursor-cli';
	}

	/**
	 * Generate unsupported parameter warnings
	 * @param {Object} options - Generation options
	 * @returns {Array} Warnings array
	 */
	generateUnsupportedWarnings(options) {
		const warnings = [];
		const unsupportedParams = [
			'temperature',
			'maxTokens',
			'topP',
			'topK',
			'presencePenalty',
			'frequencyPenalty',
			'stopSequences',
			'seed'
		];

		for (const param of unsupportedParams) {
			if (options[param] !== undefined) {
				warnings.push({
					type: 'unsupported-setting',
					setting: param,
					details: `Cursor CLI does not support the ${param} parameter. It will be ignored.`
				});
			}
		}

		return warnings;
	}

	/**
	 * Construct command arguments for Cursor Agent
	 * @param {string} prompt - The prompt text
	 * @returns {string[]} Array of arguments
	 */
	_constructArgs(prompt) {
		const args = ['-p', prompt];

		if (this.modelId && this.modelId !== 'cursor-default') {
			args.push('--model', this.modelId);
		}

		// Add output format if specified in settings, default to text for programmatic use
		const outputFormat = this.settings.outputFormat || 'text';
		if (outputFormat) {
			args.push('--output-format', outputFormat);
		}

		return args;
	}

	/**
	 * Generate text using Cursor CLI
	 * @param {Object} options - Generation options
	 * @returns {Promise<Object>}
	 */
	async doGenerate(options) {
		const prompt = options.prompt.map(p => p.content).join('\n\n'); // Simple concatenation for now
		const args = this._constructArgs(prompt);
		const executable = this.settings.pathToCursorAgent || 'cursor-agent';
		const warnings = this.generateUnsupportedWarnings(options);

		let text = '';
		let stderrOutput = '';

		return new Promise((resolve, reject) => {
			log('debug', `Spawning Cursor CLI: ${executable} ${args.join(' ')}`);

			const child = spawn(executable, args, {
				cwd: this.settings.cwd || process.cwd(),
				env: { ...process.env, ...this.settings.env },
				shell: true 
			});

			child.stdout.on('data', (data) => {
				text += data.toString();
			});

			child.stderr.on('data', (data) => {
				stderrOutput += data.toString();
				if (this.settings.verbose) {
					log('debug', `Cursor CLI stderr: ${data.toString()}`);
				}
			});

			child.on('error', (error) => {
				reject(createAPICallError({
					message: `Failed to spawn Cursor CLI: ${error.message}`,
					stderr: stderrOutput,
					code: error.code
				}));
			});

			child.on('close', (code) => {
				if (code !== 0) {
					// Check for specific known error patterns in stderr if possible
					if (code === 127 || stderrOutput.includes('command not found')) {
						reject(createAPICallError({
							message: 'Cursor CLI (cursor-agent) not found. Please install it first.',
							code: 'ENOENT',
							exitCode: code,
							stderr: stderrOutput
						}));
					} else {
						reject(createAPICallError({
							message: `Cursor CLI exited with code ${code}`,
							exitCode: code,
							stderr: stderrOutput
						}));
					}
					return;
				}

				resolve({
					text: text.trim(),
					usage: { promptTokens: 0, completionTokens: 0 }, // Usage not available from CLI
					finishReason: 'stop',
					warnings: warnings.length > 0 ? warnings : undefined,
					response: {
						id: generateId(),
						timestamp: new Date(),
						modelId: this.modelId
					},
					request: {
						body: prompt
					}
				});
			});
		});
	}

	/**
	 * Stream text using Cursor CLI
	 * @param {Object} options - Stream options
	 * @returns {Promise<Object>}
	 */
	async doStream(options) {
		const prompt = options.prompt.map(p => p.content).join('\n\n');
		const args = this._constructArgs(prompt);
		const executable = this.settings.pathToCursorAgent || 'cursor-agent';
		const warnings = this.generateUnsupportedWarnings(options);

		const stream = new ReadableStream({
			start: (controller) => {
				log('debug', `Spawning Cursor CLI (Stream): ${executable} ${args.join(' ')}`);

				const child = spawn(executable, args, {
					cwd: this.settings.cwd || process.cwd(),
					env: { ...process.env, ...this.settings.env },
					shell: true
				});

				let stderrOutput = '';

				child.stdout.on('data', (data) => {
					const textDelta = data.toString();
					controller.enqueue({
						type: 'text-delta',
						textDelta
					});
				});

				child.stderr.on('data', (data) => {
					stderrOutput += data.toString();
					if (this.settings.verbose) {
						log('debug', `Cursor CLI stderr: ${data.toString()}`);
					}
				});

				child.on('error', (error) => {
					controller.enqueue({
						type: 'error',
						error: createAPICallError({
							message: `Cursor CLI stream error: ${error.message}`,
							stderr: stderrOutput
						})
					});
					controller.close();
				});

				child.on('close', (code) => {
					if (code !== 0) {
						controller.enqueue({
							type: 'error',
							error: createAPICallError({
								message: `Cursor CLI exited with code ${code}`,
								exitCode: code,
								stderr: stderrOutput
							})
						});
					} else {
						controller.enqueue({
							type: 'finish',
							finishReason: 'stop',
							usage: { promptTokens: 0, completionTokens: 0 }
						});
					}
					controller.close();
				});

				// Handle abort
				if (options.abortSignal) {
					options.abortSignal.addEventListener('abort', () => {
						child.kill();
						controller.close();
					});
				}
			}
		});

		return {
			stream,
			warnings: warnings.length > 0 ? warnings : undefined,
			request: {
				body: prompt
			}
		};
	}
}
