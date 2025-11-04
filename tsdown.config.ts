import { defineConfig } from 'tsdown';
import { baseConfig, mergeConfig } from '@tm/build-config';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env file explicitly with absolute path
config({ path: resolve(process.cwd(), '.env') });

// Get all TM_PUBLIC_* env variables for build-time injection
const getBuildTimeEnvs = () => {
	const envs: Record<string, string> = {};

	// Inject package.json version at build time
	try {
		const packageJson = JSON.parse(
			require('fs').readFileSync('package.json', 'utf8')
		);
		envs['TM_PUBLIC_VERSION'] = packageJson.version || 'unknown';
	} catch (error) {
		console.warn('Could not read package.json version during build:', error);
		envs['TM_PUBLIC_VERSION'] = 'unknown';
	}

	for (const [key, value] of Object.entries(process.env)) {
		if (key.startsWith('TM_PUBLIC_')) {
			envs[key] = value || '';
		}
	}

	return envs;
};

export default defineConfig(
	mergeConfig(baseConfig, {
		entry: {
			'task-master': 'scripts/dev.js',
			'mcp-server': 'mcp-server/server.js'
		},
		outDir: 'dist',
		copy: ['assets', 'mcp-server'],
		ignoreWatch: ['node_modules', 'dist', 'tests', 'apps/extension'],
		// Bundle only our workspace packages, keep npm dependencies external
		noExternal: [/^@tm\//],
		env: getBuildTimeEnvs(),
		// Enable source maps for debugging
		sourcemap: true,
		// Ensure external modules are kept external
		// Include native modules and optional dependencies that shouldn't be bundled
		external: [
			'dotenv',
			'fastmcp',
			'keytar',
			'@anthropic-ai/claude-code',
			'@musistudio/claude-code-router',
			'@qwen-code/qwen-code',
			'ai-sdk-provider-gemini-cli'
		]
	})
);
