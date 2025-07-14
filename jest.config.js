export default {
	// Use Node.js environment for testing
	testEnvironment: 'node',

	// Automatically clear mock calls between every test
	clearMocks: true,

	// Indicates whether the coverage information should be collected while executing the test
	collectCoverage: false,

	// The directory where Jest should output its coverage files
	coverageDirectory: 'coverage',

	// A list of paths to directories that Jest should use to search for files in
	roots: [
		'<rootDir>/tests',
		'<rootDir>/mcp-server/src'
	],

	// The glob patterns Jest uses to detect test files
	testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],

	// Transform files (commented out or removed to allow babel-jest to be auto-detected)
	// transform: {},

	// Disable transformations for most node_modules, but allow specific ESM packages like chalk to be transformed
	transformIgnorePatterns: [
		'/node_modules/(?!chalk)/' // Allow chalk to be transformed
	],

	// Set moduleNameMapper for absolute paths
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/$1'
	},

	// Setup module aliases
	moduleDirectories: ['node_modules', '<rootDir>'],

	// Configure test coverage thresholds
	coverageThreshold: {
		global: {
			branches: 80,
			functions: 80,
			lines: 80,
			statements: 80
		}
	},

	// Generate coverage report in these formats
	coverageReporters: ['text', 'lcov'],

	// Verbose output
	verbose: true,

	// Setup file
	setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};
