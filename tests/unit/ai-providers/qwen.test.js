/**
 * Tests for Qwen Provider
 *
 * This test suite covers:
 * 1. Basic provider functionality
 * 2. API key validation
 * 3. Client creation
 * 4. Required API key name
 */

import { jest } from '@jest/globals';

// Mock the utils module to prevent logging during tests
jest.mock('../../../scripts/modules/utils.js', () => ({
	log: jest.fn()
}));

// Import the provider
import { QwenAIProvider } from '../../../src/ai-providers/qwen.js';
import {execSync, spawn} from "child_process";

describe('QwenAIProvider', () => {
	let provider;

	beforeEach(() => {
		provider = new QwenAIProvider();
		jest.clearAllMocks();
	});

	describe('getRequiredApiKeyName', () => {
		it('should return OPENROUTER_API_KEY', () => {
			expect(provider.getRequiredApiKeyName()).toBe('OPENROUTER_API_KEY');
		});
	});

	describe('getClient', () => {
		it('should throw error if API key is missing', () => {
			expect(() => provider.getClient({})).toThrow(Error);
		});

		it('should create client with apiKey only', () => {
			const params = {
				apiKey: 'sk-test-123'
			};

			// The getClient method should return a function
			const client = provider.getClient(params);
			expect(typeof client).toBe('function');
		});

		it('should create client with apiKey and baseURL', () => {
			const params = {
				apiKey: 'sk-test-456',
				baseURL: 'https://api.openrouter.example'
			};

			// Should not throw when baseURL is provided
			const client = provider.getClient(params);
			expect(typeof client).toBe('function');
		});
	});

	describe('name property', () => {
		it('should have Qwen as the provider name', () => {
			expect(provider.name).toBe('Qwen');
		});
	});

	describe('gen', () => {
		it('should have Qwen as the provider name', () => {

			const env = {
				...process.env
			};
			const qwenPath = execSync('qwen --version', {
				cwd: "D:\\project\\yx\\temp-prd",
				encoding: 'utf8',
				env: env
			}).trim();


			console.log(qwenPath)
		});
	});
});