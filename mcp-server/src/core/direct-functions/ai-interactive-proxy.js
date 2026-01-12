/**
 * ai-interactive-proxy.js
 * Direct function implementation for AI interactive proxy
 * Provides conversational AI interaction with session management
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { generateTextService } from '../../../../scripts/modules/ai-services-unified.js';
import {
	enableSilentMode,
	disableSilentMode
} from '../../../../scripts/modules/utils.js';
import { createLogWrapper } from '../../tools/utils.js';

// Default system prompt for AI assistant
const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant. You provide clear, accurate, and concise responses to user queries. You can assist with:
- Code analysis and debugging
- Technical explanations
- General problem-solving
- Information synthesis
- Creative brainstorming

Always be respectful, professional, and helpful.`;

// Sessions directory path relative to project root
const SESSIONS_DIR = '.taskmaster/sessions';

/**
 * Load a session from disk
 * @param {string} sessionId - Session UUID
 * @param {string} projectRoot - Project root path
 * @returns {Object|null} Session object or null if not found
 */
function loadSession(sessionId, projectRoot) {
	// Validate sessionId format (UUID v4)
	const uuidRegex =
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	if (!uuidRegex.test(sessionId)) {
		throw new Error(`Invalid session ID format: ${sessionId}`);
	}

	const sessionsPath = path.join(projectRoot, SESSIONS_DIR);
	const sessionFile = path.join(sessionsPath, `${sessionId}.json`);

	if (!fs.existsSync(sessionFile)) {
		return null;
	}

	try {
		const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));

		// Validate session structure
		if (
			!sessionData.sessionId ||
			!sessionData.projectRoot ||
			!Array.isArray(sessionData.messages)
		) {
			throw new Error('Invalid session data structure');
		}

		return sessionData;
	} catch (error) {
		throw new Error(`Failed to load session: ${error.message}`);
	}
}

/**
 * Save a session to disk
 * @param {Object} sessionData - Session object
 * @param {string} projectRoot - Project root path
 */
function saveSession(sessionData, projectRoot) {
	const sessionsPath = path.join(projectRoot, SESSIONS_DIR);

	// Create sessions directory if it doesn't exist
	if (!fs.existsSync(sessionsPath)) {
		fs.mkdirSync(sessionsPath, { recursive: true });
	}

	const sessionFile = path.join(
		sessionsPath,
		`${sessionData.sessionId}.json`
	);

	// Update timestamp
	sessionData.updatedAt = new Date().toISOString();

	fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2), 'utf-8');
}

/**
 * Create a new session
 * @param {string} projectRoot - Project root path
 * @param {string} systemPrompt - System prompt for the session
 * @returns {Object} New session object
 */
function createSession(projectRoot, systemPrompt) {
	const sessionId = randomUUID();
	const now = new Date().toISOString();

	return {
		sessionId,
		projectRoot,
		createdAt: now,
		updatedAt: now,
		messages: [
			{
				role: 'system',
				content: systemPrompt
			}
		],
		metadata: {
			provider: null,
			model: null,
			totalTokens: 0
		}
	};
}

/**
 * Direct function wrapper for AI interactive proxy.
 *
 * @param {Object} args - Command arguments
 * @param {string} args.path - Project root path (required)
 * @param {string} args.prompt - User prompt (required)
 * @param {string} [args.sys_prompt] - System prompt (optional)
 * @param {string} [args.sessionId] - Session ID for continuing conversation (optional)
 * @param {Object} log - Logger object
 * @param {Object} context - Additional context (session)
 * @returns {Promise<Object>} - Result object { success: boolean, data?: any, error?: { code: string, message: string } }
 */
export async function aiInteractiveProxyDirect(args, log, context = {}) {
	const { path: projectRoot, prompt, sys_prompt, sessionId } = args;
	const { session } = context;

	// Enable silent mode to prevent console logs
	enableSilentMode();

	// Create logger wrapper
	const mcpLog = createLogWrapper(log);

	try {
		// Validate required parameters
		if (!projectRoot || typeof projectRoot !== 'string') {
			disableSilentMode();
			return {
				success: false,
				error: {
					code: 'MISSING_PARAMETER',
					message: 'The path parameter is required and must be a string'
				}
			};
		}

		if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
			disableSilentMode();
			return {
				success: false,
				error: {
					code: 'MISSING_PARAMETER',
					message:
						'The prompt parameter is required and must be a non-empty string'
				}
			};
		}

		// Check if project root exists
		if (!fs.existsSync(projectRoot)) {
			disableSilentMode();
			return {
				success: false,
				error: {
					code: 'PROJECT_NOT_FOUND',
					message: `Project root not found: ${projectRoot}`
				}
			};
		}

		let sessionData;
		let isNewSession = false;

		// Load or create session
		if (sessionId) {
			mcpLog.info(`Loading existing session: ${sessionId}`);
			try {
				sessionData = loadSession(sessionId, projectRoot);
				if (!sessionData) {
					disableSilentMode();
					return {
						success: false,
						error: {
							code: 'SESSION_NOT_FOUND',
							message: `Session not found: ${sessionId}`
						}
					};
				}
				mcpLog.info(
					`Session loaded with ${sessionData.messages.length} messages`
				);
			} catch (error) {
				disableSilentMode();
				return {
					success: false,
					error: {
						code: 'SESSION_LOAD_ERROR',
						message: error.message
					}
				};
			}
		} else {
			// Create new session
			const systemPrompt = sys_prompt || DEFAULT_SYSTEM_PROMPT;
			sessionData = createSession(projectRoot, systemPrompt);
			isNewSession = true;
			mcpLog.info(`Created new session: ${sessionData.sessionId}`);
		}

		// Add user message to session
		sessionData.messages.push({
			role: 'user',
			content: prompt.trim()
		});

		mcpLog.info(
			`Calling AI service with ${sessionData.messages.length} messages (including history)`
		);

		// Call AI service with full message history
		let aiResult;
		try {
			aiResult = await generateTextService({
				role: 'main',
				session,
				projectRoot,
				messages: sessionData.messages, // Pass full conversation history
				commandName: 'ai_interactive_proxy',
				outputType: 'mcp'
			});
		} catch (error) {
			// Remove user message since AI call failed
			sessionData.messages.pop();

			disableSilentMode();
			return {
				success: false,
				error: {
					code: 'AI_SERVICE_ERROR',
					message: `AI service call failed: ${error.message}`
				}
			};
		}

		// Extract response
		const response = aiResult.mainResult;
		const provider = aiResult.providerName;
		const model = aiResult.modelId;

		// Add assistant response to session
		sessionData.messages.push({
			role: 'assistant',
			content: response
		});

		// Update session metadata
		sessionData.metadata.provider = provider;
		sessionData.metadata.model = model;
		if (aiResult.telemetryData && aiResult.telemetryData.inputTokens) {
			sessionData.metadata.totalTokens +=
				aiResult.telemetryData.inputTokens + aiResult.telemetryData.outputTokens;
		}

		// Save session
		try {
			saveSession(sessionData, projectRoot);
			mcpLog.info(`Session saved: ${sessionData.sessionId}`);
		} catch (error) {
			mcpLog.error(`Failed to save session: ${error.message}`);
			// Don't fail the request, just log the error
		}

		disableSilentMode();

		return {
			success: true,
			data: {
				response,
				sessionId: sessionData.sessionId,
				model,
				provider,
				isNewSession,
				messageCount: sessionData.messages.length
			}
		};
	} catch (error) {
		mcpLog.error(`Error in ai_interactive_proxy: ${error.message}`);
		disableSilentMode();
		return {
			success: false,
			error: {
				code: 'INTERNAL_ERROR',
				message: `Failed to process AI interaction: ${error.message}`
			}
		};
	}
}

