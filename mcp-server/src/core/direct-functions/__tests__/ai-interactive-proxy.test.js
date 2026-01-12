/**
 * ai-interactive-proxy.test.js
 * Unit tests for AI Interactive Proxy direct function
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { aiInteractiveProxyDirect } from '../ai-interactive-proxy.js';

// Mock dependencies
vi.mock('../../../../../scripts/modules/ai-services-unified.js', () => ({
	generateTextService: vi.fn()
}));

vi.mock('../../../../../scripts/modules/utils.js', () => ({
	enableSilentMode: vi.fn(),
	disableSilentMode: vi.fn()
}));

vi.mock('../../../tools/utils.js', () => ({
	createLogWrapper: vi.fn(() => ({
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn()
	}))
}));

import { generateTextService } from '../../../../../scripts/modules/ai-services-unified.js';

describe('aiInteractiveProxyDirect', () => {
	const testProjectRoot = path.join(process.cwd(), 'test-project');
	const testSessionsDir = path.join(testProjectRoot, '.taskmaster', 'sessions');

	beforeEach(() => {
		// Create test directories
		if (!fs.existsSync(testProjectRoot)) {
			fs.mkdirSync(testProjectRoot, { recursive: true });
		}
		if (!fs.existsSync(testSessionsDir)) {
			fs.mkdirSync(testSessionsDir, { recursive: true });
		}

		// Reset mocks
		vi.clearAllMocks();
	});

	afterEach(() => {
		// Clean up test directories
		if (fs.existsSync(testSessionsDir)) {
			const files = fs.readdirSync(testSessionsDir);
			files.forEach((file) => {
				fs.unlinkSync(path.join(testSessionsDir, file));
			});
		}
		if (fs.existsSync(testProjectRoot)) {
			fs.rmSync(testProjectRoot, { recursive: true, force: true });
		}
	});

	it('should validate required path parameter', async () => {
		const result = await aiInteractiveProxyDirect(
			{ prompt: 'Hello' },
			{ info: vi.fn(), error: vi.fn() },
			{}
		);

		expect(result.success).toBe(false);
		expect(result.error.code).toBe('MISSING_PARAMETER');
		expect(result.error.message).toContain('path parameter is required');
	});

	it('should validate required prompt parameter', async () => {
		const result = await aiInteractiveProxyDirect(
			{ path: testProjectRoot },
			{ info: vi.fn(), error: vi.fn() },
			{}
		);

		expect(result.success).toBe(false);
		expect(result.error.code).toBe('MISSING_PARAMETER');
		expect(result.error.message).toContain('prompt parameter is required');
	});

	it('should validate project root exists', async () => {
		const nonExistentPath = path.join(process.cwd(), 'non-existent-project');
		const result = await aiInteractiveProxyDirect(
			{ path: nonExistentPath, prompt: 'Hello' },
			{ info: vi.fn(), error: vi.fn() },
			{}
		);

		expect(result.success).toBe(false);
		expect(result.error.code).toBe('PROJECT_NOT_FOUND');
	});

	it('should create a new session when sessionId is not provided', async () => {
		// Mock AI service response
		generateTextService.mockResolvedValue({
			mainResult: 'Hello! How can I help you?',
			providerName: 'anthropic',
			modelId: 'claude-3-5-sonnet-20241022',
			telemetryData: { inputTokens: 10, outputTokens: 20 }
		});

		const result = await aiInteractiveProxyDirect(
			{
				path: testProjectRoot,
				prompt: 'Hello',
				sys_prompt: 'You are a helpful assistant'
			},
			{ info: vi.fn(), error: vi.fn() },
			{ session: {} }
		);

		expect(result.success).toBe(true);
		expect(result.data.isNewSession).toBe(true);
		expect(result.data.sessionId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
		);
		expect(result.data.response).toBe('Hello! How can I help you?');
		expect(result.data.provider).toBe('anthropic');
		expect(result.data.model).toBe('claude-3-5-sonnet-20241022');
		expect(result.data.messageCount).toBe(3); // system + user + assistant

		// Verify session file was created
		const sessionFile = path.join(
			testSessionsDir,
			`${result.data.sessionId}.json`
		);
		expect(fs.existsSync(sessionFile)).toBe(true);

		// Verify session content
		const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
		expect(sessionData.sessionId).toBe(result.data.sessionId);
		expect(sessionData.messages).toHaveLength(3);
		expect(sessionData.messages[0].role).toBe('system');
		expect(sessionData.messages[1].role).toBe('user');
		expect(sessionData.messages[2].role).toBe('assistant');
	});

	it('should continue an existing session when sessionId is provided', async () => {
		// First create a session
		generateTextService.mockResolvedValue({
			mainResult: 'First response',
			providerName: 'anthropic',
			modelId: 'claude-3-5-sonnet-20241022',
			telemetryData: { inputTokens: 10, outputTokens: 20 }
		});

		const firstResult = await aiInteractiveProxyDirect(
			{ path: testProjectRoot, prompt: 'First question' },
			{ info: vi.fn(), error: vi.fn() },
			{ session: {} }
		);

		const sessionId = firstResult.data.sessionId;

		// Continue the session
		generateTextService.mockResolvedValue({
			mainResult: 'Second response',
			providerName: 'anthropic',
			modelId: 'claude-3-5-sonnet-20241022',
			telemetryData: { inputTokens: 15, outputTokens: 25 }
		});

		const secondResult = await aiInteractiveProxyDirect(
			{ path: testProjectRoot, prompt: 'Second question', sessionId },
			{ info: vi.fn(), error: vi.fn() },
			{ session: {} }
		);

		expect(secondResult.success).toBe(true);
		expect(secondResult.data.isNewSession).toBe(false);
		expect(secondResult.data.sessionId).toBe(sessionId);
		expect(secondResult.data.messageCount).toBe(5); // system + user1 + assistant1 + user2 + assistant2
	});
});

