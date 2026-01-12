#!/usr/bin/env node

/**
 * test-ai-proxy.js
 * Quick validation script for AI Interactive Proxy tool
 * 
 * Usage:
 *   node test-ai-proxy.js <project-path> <prompt> [sessionId]
 * 
 * Example:
 *   node test-ai-proxy.js /path/to/project "What is TypeScript?"
 *   node test-ai-proxy.js /path/to/project "Tell me more" 550e8400-e29b-41d4-a716-446655440000
 */

import { aiInteractiveProxyDirect } from './ai-interactive-proxy.js';

// Simple logger implementation
const logger = {
	info: (msg) => console.log(`[INFO] ${msg}`),
	error: (msg) => console.error(`[ERROR] ${msg}`),
	warn: (msg) => console.warn(`[WARN] ${msg}`),
	debug: (msg) => console.log(`[DEBUG] ${msg}`)
};

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
	console.error('Usage: node test-ai-proxy.js <project-path> <prompt> [sessionId]');
	console.error('');
	console.error('Examples:');
	console.error('  node test-ai-proxy.js /path/to/project "What is TypeScript?"');
	console.error('  node test-ai-proxy.js /path/to/project "Tell me more" 550e8400-e29b-41d4-a716-446655440000');
	process.exit(1);
}

const projectPath = args[0];
const prompt = args[1];
const sessionId = args[2];

console.log('='.repeat(80));
console.log('AI Interactive Proxy - Test Script');
console.log('='.repeat(80));
console.log(`Project Path: ${projectPath}`);
console.log(`Prompt: ${prompt}`);
if (sessionId) {
	console.log(`Session ID: ${sessionId}`);
} else {
	console.log(`Session ID: <new session will be created>`);
}
console.log('='.repeat(80));
console.log('');

// Execute the test
(async () => {
	try {
		const result = await aiInteractiveProxyDirect(
			{
				path: projectPath,
				prompt: prompt,
				...(sessionId && { sessionId })
			},
			logger,
			{ session: {} }
		);

		console.log('Result:');
		console.log(JSON.stringify(result, null, 2));
		console.log('');

		if (result.success) {
			console.log('✅ SUCCESS');
			console.log('');
			console.log('Response:');
			console.log('-'.repeat(80));
			console.log(result.data.response);
			console.log('-'.repeat(80));
			console.log('');
			console.log(`Session ID: ${result.data.sessionId}`);
			console.log(`Provider: ${result.data.provider}`);
			console.log(`Model: ${result.data.model}`);
			console.log(`Message Count: ${result.data.messageCount}`);
			console.log(`Is New Session: ${result.data.isNewSession}`);
			console.log('');
			console.log('💡 Tip: Use the Session ID above to continue this conversation!');
		} else {
			console.log('❌ FAILED');
			console.log('');
			console.log(`Error Code: ${result.error.code}`);
			console.log(`Error Message: ${result.error.message}`);
			process.exit(1);
		}
	} catch (error) {
		console.error('❌ UNEXPECTED ERROR');
		console.error(error);
		process.exit(1);
	}
})();

