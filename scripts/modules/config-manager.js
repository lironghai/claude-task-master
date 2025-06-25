import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { log, findProjectRoot, resolveEnvVariable as originalResolveEnvVariable } from './utils.js';
import { LEGACY_CONFIG_FILE } from '../../src/constants/paths.js';
import { findConfigPath } from '../../src/utils/path-utils.js';
import dotenv from 'dotenv';

// Calculate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Variables to hold paths, to be initialized by _initializeModulePaths
let MASTER_DEFAULT_CONFIG_TEMPLATE_PATH;
let MASTER_DEFAULT_ENV_TEMPLATE_PATH;
let MODEL_MAP_PATH;
let modulePathsInitialized = false;

function _initializeModulePaths() {
	if (modulePathsInitialized) return;

	MASTER_DEFAULT_CONFIG_TEMPLATE_PATH = path.resolve(__dirname, '../../.taskmaster/config_default.json');
	MASTER_DEFAULT_ENV_TEMPLATE_PATH = path.resolve(__dirname, '../../.taskmaster/env_default');
	MODEL_MAP_PATH = path.resolve(__dirname, '../../src/constants/model_map.json');
	modulePathsInitialized = true;
}

// Load supported models from JSON file
let MODEL_MAP;

try {
	MASTER_DEFAULT_CONFIG_TEMPLATE_PATH = path.resolve(__dirname, '../../.taskmaster/config_default.json');
	MASTER_DEFAULT_ENV_TEMPLATE_PATH = path.resolve(__dirname, '../../.taskmaster/env_default');
	MODEL_MAP_PATH = path.resolve(__dirname, '../../src/constants/model_map.json');

	const modelFilePath = path.join(__dirname, 'supported-models.json');
	// console.log(`[config-manager] Attempting to load models from: ${modelFilePath}`); // Diagnostic log
	// console.log(`[config-manager] __dirname is: ${__dirname}`); // Diagnostic log

	const supportedModelsRaw = fs.readFileSync(
		modelFilePath, // Use the constructed path
		'utf-8'
	);
	// console.log(`[config-manager] supportedModelsRaw is: ${supportedModelsRaw}`); // Diagnostic log
	MODEL_MAP = JSON.parse(supportedModelsRaw);
} catch (error) {
	console.error(
		chalk.red(
			'FATAL ERROR: Could not load supported-models.json. Please ensure the file exists and is valid JSON. ' +
			error.constructor.name + ': ' + error.message
		)
	);
	process.exit(1);
}
//
// function _loadModelMap() {
// 	if (MODEL_MAP) return; // Load only once
// 	_initializeModulePaths(); // Ensure paths are initialized before any file access
// 	try {
// 		const modelFilePath = path.join(__dirname, 'supported-models.json');
// 		// console.log(`[config-manager] Attempting to load models from: ${modelFilePath}`); // Diagnostic log
// 		// console.log(`[config-manager] __dirname is: ${__dirname}`); // Diagnostic log
//
// 		const supportedModelsRaw = fs.readFileSync(
// 			modelFilePath, // Use the constructed path
// 			'utf-8'
// 		);
// 		// console.log(`[config-manager] supportedModelsRaw is: ${supportedModelsRaw}`); // Diagnostic log
// 		MODEL_MAP = JSON.parse(supportedModelsRaw);
// 	} catch (error) {
// 		console.error(
// 			chalk.red(
// 				'FATAL ERROR: Could not load supported-models.json. Please ensure the file exists and is valid JSON. ' +
// 				error.constructor.name + ': ' + error.message
// 			)
// 		);
// 		process.exit(1);
// 	}
// }

// Define valid providers dynamically from the loaded MODEL_MAP
const VALID_PROVIDERS = Object.keys(MODEL_MAP || {});
console.log(`[config-manager] Supported providers---------`)

// Default configuration values (used if config file is missing or incomplete)
const DEFAULTS = {
	models: {
		main: {
			provider: 'anthropic',
			modelId: 'claude-3-7-sonnet-20250219',
			maxTokens: 64000,
			temperature: 0.2
		},
		research: {
			provider: 'perplexity',
			modelId: 'sonar-pro',
			maxTokens: 8700,
			temperature: 0.1
		},
		fallback: {
			// No default fallback provider/model initially
			provider: 'anthropic',
			modelId: 'claude-3-5-sonnet',
			maxTokens: 64000, // Default parameters if fallback IS configured
			temperature: 0.2
		}
	},
	global: {
		logLevel: 'info',
		debug: false,
		defaultSubtasks: 5,
		defaultPriority: 'medium',
		projectName: 'Task Master',
		ollamaBaseURL: 'http://localhost:11434/api',
		bedrockBaseURL: 'https://bedrock.us-east-1.amazonaws.com',
		useDefaultConfiguration: true
	}
};

// --- Internal Config Loading ---
let loadedConfig = null;
let loadedConfigRoot = null; // Track which root loaded the config
let legacyConfigWarningShown = false; // Added flag to track if warning was shown

let loadedConfigState = null;

// Custom Error for configuration issues
class ConfigurationError extends Error {
	constructor(message) {
		super(message);
		this.name = 'ConfigurationError';
	}
}

function _mergeDeep(target, source) {
	const output = { ...target };
	if (typeof target === 'object' && target !== null && typeof source === 'object' && source !== null) {
		Object.keys(source).forEach(key => {
			if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
				if (!(key in target)) {
					Object.assign(output, { [key]: source[key] });
				} else {
					output[key] = _mergeDeep(target[key], source[key]);
				}
			} else {
				Object.assign(output, { [key]: source[key] });
			}
		});
	}
	return output;
}

function _tryReadAndParseJson(filePath, fileNameForLog = 'Config') {
	if (fs.existsSync(filePath)) {
		try {
			const rawData = fs.readFileSync(filePath, 'utf-8');
			if (rawData.trim() === '') {
				// log('warn', `${fileNameForLog} file at ${filePath} is empty.`);
				return { content: null, error: 'empty' };
			}
			return { content: JSON.parse(rawData), error: null };
		} catch (error) {
			// log('error', `Error reading or parsing ${fileNameForLog} file at ${filePath}: ${error.message}`);
			return { content: null, error: 'parse_error' };
		}
	}
	return { content: null, error: 'not_found' };
}

function _tryReadAndParseEnv(filePath) {
	if (fs.existsSync(filePath)) {
		try {
			const envFileContent = fs.readFileSync(filePath, 'utf-8');
			if (envFileContent.trim() === '') {
				// log('debug', `Environment file ${filePath} is empty.`); // Potentially too noisy
				return { content: {}, error: null, isEmpty: true };
			}
			return { content: dotenv.parse(envFileContent), error: null, isEmpty: false };
		} catch (error) {
			// log('warn', `Could not read or parse env file ${filePath}: ${error.message}`);
			return { content: null, error: 'parse_error', isEmpty: false };
		}
	}
	return { content: null, error: 'not_found', isEmpty: false };
}

function _loadAndValidateConfig(options = {}) {
	// _initializeModulePaths(); // Ensure paths are initialized
	// _loadModelMap(); // Ensure models are loaded (might be redundant if loaded at module init)
	const { explicitRoot, forceReload = false, useDefaultSystem = false } = options;
	const defaults = DEFAULTS;
	let rootToUse = explicitRoot || findProjectRoot();

	// console.log(`[_loadAndValidateConfig] rootToUse is: ${rootToUse}`);

	let finalConfigToUse = { ...defaults };
	let finalEnvFileToTarget = '.env'; // Default target
	let finalSourceOfConfig = 'DEFAULTS (no project root or initial load error)';
	let finalIsUsingDefaultSystem = false;
	let finalChosenConfigPhysicalFileWasLoaded = false;

	if (!rootToUse) {
		console.debug(
			chalk.white(
				`No project root found. Using application defaults for config and process.env for environment variables.`
			)
		);
		// log('debug', 'No project root found. Using application defaults for config and process.env for environment variables.');
		// Validation of providers in `finalConfigToUse` (which is `defaults`) will happen at the end.
		return {
			configToUse: finalConfigToUse,
			envFileToTarget: '.env', // No specific target file, will use process.env or master default if applicable later
			sourceOfConfig: 'Application DEFAULTS (no project root)',
			isUsingDefaultSystem: false, // Cannot use file-based defaults without a root
			projectRootPath: null,
			chosenConfigPhysicalFileWasLoaded: false,
		};
	}

	// --- Attempt to load main config and env ---
	let pathToLoadMainConfig = findConfigPath(null, { projectRoot: rootToUse });
	
	const { content: mainConfigContent, error: mainConfigError } = pathToLoadMainConfig
		? _tryReadAndParseJson(pathToLoadMainConfig, 'Main config.json')
		: { content: null, error: 'not_found' };
	const mainConfigLoadedSuccessfully = mainConfigContent !== null;

	// --- Determine if default configuration system should be used ---
	let explicitUseDefaultFlag = defaults.global.useDefaultConfiguration;
	if (mainConfigLoadedSuccessfully && typeof mainConfigContent.global?.useDefaultConfiguration === 'boolean') {
		explicitUseDefaultFlag = mainConfigContent.global.useDefaultConfiguration;
	}

	let shouldUseDefaultSystem = false;
	if (explicitUseDefaultFlag) {
		shouldUseDefaultSystem = true;
		console.debug(
			chalk.white(
				`Configuration explicitly set to use default system (master templates) via 'useDefaultConfiguration' flag.`
			)
		);
		// log('info', "Configuration explicitly set to use default system (master templates) via 'useDefaultConfiguration' flag.");
	} else {
		if (!mainConfigLoadedSuccessfully) { // mainEnvContent can be {} if empty, null if error/not_found
			shouldUseDefaultSystem = true;
			console.debug(
				chalk.white(
					`Main config.json and/or .env are missing or empty. Attempting to use default configuration system (master templates).`
				)
			);
			// log('info', "Main config.json and/or .env are missing or empty. Attempting to use default configuration system (master templates).");
		}
	}

	// --- Load configuration based on decision ---
	if (shouldUseDefaultSystem) {
		finalIsUsingDefaultSystem = true;
		const { content: masterDefaultConfigContent, error: masterDefaultConfigError } = _tryReadAndParseJson(MASTER_DEFAULT_CONFIG_TEMPLATE_PATH, 'Master Default Config Template');

		if (masterDefaultConfigContent) {
			finalConfigToUse = _mergeDeep(defaults, masterDefaultConfigContent);
			finalSourceOfConfig = `Master Default Config Template (${MASTER_DEFAULT_CONFIG_TEMPLATE_PATH})`;
			finalChosenConfigPhysicalFileWasLoaded = true; // Considered "loaded" from the tool's assets
		} else {
			finalConfigToUse = { ...defaults }; // Fallback to application DEFAULTS constant
			finalSourceOfConfig = `Application DEFAULTS (Master Default Config Template ${masterDefaultConfigError || 'not found/empty/error'})`;
			finalChosenConfigPhysicalFileWasLoaded = false;
			console.warn(
				chalk.yellow(
					`Failed to load ${MASTER_DEFAULT_CONFIG_TEMPLATE_PATH} (reason: ${masterDefaultConfigError || 'not_found'}). Using application DEFAULTS constant.`
				)
			);
			// log('warn', `Failed to load ${MASTER_DEFAULT_CONFIG_TEMPLATE_PATH} (reason: ${masterDefaultConfigError || 'not_found'}). Using application DEFAULTS constant.`);
		}
	} else { // Should use main config system
		finalIsUsingDefaultSystem = false;
		if (mainConfigLoadedSuccessfully) {
			finalConfigToUse = _mergeDeep(defaults, mainConfigContent);
			finalSourceOfConfig = `Main config.json (${pathToLoadMainConfig})`;
			finalChosenConfigPhysicalFileWasLoaded = true;
		} else {
			finalConfigToUse = { ...defaults }; // Fallback to application defaults
			finalSourceOfConfig = `Application DEFAULTS (main config.json ${mainConfigError || 'not found/empty/error'})`;
			finalChosenConfigPhysicalFileWasLoaded = false;
			// No need to log here as it's part of the fallback logic described above for shouldUseDefaultSystem
		}
	}
	
	// --- Validate providers in the chosen configuration ---
	if (!validateProvider(finalConfigToUse.models.main.provider)) {
		console.warn(chalk.yellow(`Warning: Invalid main provider "${finalConfigToUse.models.main.provider}" from ${finalSourceOfConfig}. Falling back to default main model.`));
		finalConfigToUse.models.main = { ...defaults.models.main };
	}
	if (!validateProvider(finalConfigToUse.models.research.provider)) {
		console.warn(chalk.yellow(`Warning: Invalid research provider "${finalConfigToUse.models.research.provider}" from ${finalSourceOfConfig}. Falling back to default research model.`));
		finalConfigToUse.models.research = { ...defaults.models.research };
	}
	if (finalConfigToUse.models.fallback?.provider && !validateProvider(finalConfigToUse.models.fallback.provider)) {
		console.warn(chalk.yellow(`Warning: Invalid fallback provider "${finalConfigToUse.models.fallback.provider}" from ${finalSourceOfConfig}. Fallback model will be ignored.`));
		finalConfigToUse.models.fallback = { ...defaults.models.fallback, provider: undefined, modelId: undefined }; // Effectively disable it
	}

	return {
		configToUse: finalConfigToUse,
		envFileToTarget: finalEnvFileToTarget,
		sourceOfConfig: finalSourceOfConfig,
		isUsingDefaultSystem: finalIsUsingDefaultSystem,
		projectRootPath: rootToUse,
		chosenConfigPhysicalFileWasLoaded: finalChosenConfigPhysicalFileWasLoaded,
	};
}

function getConfig(explicitRoot = null, forceReload = false) {

	if (loadedConfigState && !explicitRoot) {
		return loadedConfigState;
	}

	const currentProjectRoot = explicitRoot || findProjectRoot();

	const needsLoad =
		!loadedConfigState ||
		forceReload ||
		(currentProjectRoot && currentProjectRoot !== loadedConfigState.projectRootPath) ||
		(currentProjectRoot === null && loadedConfigState.projectRootPath !== null);

	// console.log(`[getConfig] loadedConfigState: ${loadedConfigState}`); // Diagnostic log
	// console.log(`[getConfig] currentProjectRoot: ${currentProjectRoot}`); // Diagnostic log
	// console.log(`[getConfig] needsLoad is: ${needsLoad}`); // Diagnostic log

	if (needsLoad) {
		const {
			configToUse,
			envFileToTarget,
			sourceOfConfig, // for logging/debugging if needed
			isUsingDefaultSystem,
			projectRootPath,
			chosenConfigPhysicalFileWasLoaded
		} = _loadAndValidateConfig({explicitRoot: currentProjectRoot});

		// console.log(`[getConfig] configToUse is: ${JSON.stringify(configToUse)}`);

		let loadedEnvFromFile = {};
		if (isUsingDefaultSystem) {
			// Load from MASTER_DEFAULT_ENV_TEMPLATE_PATH
			const { content: parsedMasterEnv, error: masterEnvError } = _tryReadAndParseEnv(MASTER_DEFAULT_ENV_TEMPLATE_PATH);
			if (parsedMasterEnv) {
				loadedEnvFromFile = parsedMasterEnv;
				log('debug', `Loaded environment variables from master template: ${MASTER_DEFAULT_ENV_TEMPLATE_PATH}`);
			} else {
				log('warn', `Master default ENV template (${MASTER_DEFAULT_ENV_TEMPLATE_PATH}) not found or failed to parse (Error: ${masterEnvError || 'not_found'}). Using empty default env for this load.`);
			}
		} else if (projectRootPath) { // Not using default system, try to load project-specific .env
			const envPath = path.join(projectRootPath, '.env');
			const { content: parsedEnvContent, error: envParseError } = _tryReadAndParseEnv(envPath);
			if (parsedEnvContent) {
				loadedEnvFromFile = parsedEnvContent;
			} else {
				// Error already logged by _tryReadAndParseEnv if parse_error
				// If not_found, it's fine, just means no such env file.
				log('debug', `Project-specific .env file not found at ${envPath} or failed to parse. Proceeding without it for this load.`);
			}
		} else {
			log('debug', 'No project root and not using default system for ENV; only process.env will be used.');
		}

		// Merge process.env last so it can override file-based env vars if needed,
		// though typically file-based vars take precedence if they exist.
		// dotenv.parse gives precedence to first defined, process.env should be fallback.
		const effectiveEnv = { ...process.env, ...loadedEnvFromFile };


		// Update the global state
		loadedConfigState = {
			effectiveConfig: configToUse,
			effectiveEnv: effectiveEnv,
			isUsingDefaultSystem: isUsingDefaultSystem,
			projectRootPath: projectRootPath,
			configPhysicalFileExists: chosenConfigPhysicalFileWasLoaded // Renamed for clarity
		};
		// Log('debug', `Config loaded. Source: ${sourceOfConfig}, Using defaults: ${isUsingDefaultSystem}, Env target: ${envFileToTarget}`);
		return loadedConfigState;
	}

	return loadedConfigState;
}

/**
 * Validates if a provider name is in the list of supported providers.
 * @param {string} providerName The name of the provider.
 * @returns {boolean} True if the provider is valid, false otherwise.
 */
function validateProvider(providerName) {
	if (!providerName) return false; // Allow fallback to be completely unset
	return VALID_PROVIDERS.includes(providerName);
}

/**
 * Optional: Validates if a modelId is known for a given provider based on MODEL_MAP.
 * This is a non-strict validation; an unknown model might still be valid.
 * @param {string} providerName The name of the provider.
 * @param {string} modelId The model ID.
 * @returns {boolean} True if the modelId is in the map for the provider, false otherwise.
 */
function validateProviderModelCombination(providerName, modelId) {
	// If provider isn't even in our map, we can't validate the model
	if (!MODEL_MAP[providerName]) {
		return true; // Allow unknown providers or those without specific model lists
	}
	// If the provider is known, check if the model is in its list OR if the list is empty (meaning accept any)
	return (
		MODEL_MAP[providerName].length === 0 ||
		// Use .some() to check the 'id' property of objects in the array
		MODEL_MAP[providerName].some((modelObj) => modelObj.id === modelId)
	);
}

// --- Role-Specific Getters ---

function getModelConfigForRole(role, explicitRoot = null) {
	const { effectiveConfig } = getConfig(explicitRoot);
	const roleConfig = effectiveConfig?.models?.[role];
	if (!roleConfig) {
		log(
			'warn',
			`No model configuration found for role: ${role}. Returning default.`
		);
		return DEFAULTS.models[role] || {};
	}
	return roleConfig;
}

function getMainProvider(explicitRoot = null) {
	return getModelConfigForRole('main', explicitRoot).provider;
}

function getMainModelId(explicitRoot = null) {
	return getModelConfigForRole('main', explicitRoot).modelId;
}

function getMainMaxTokens(explicitRoot = null) {
	// Directly return value from config (which includes defaults)
	return getModelConfigForRole('main', explicitRoot).maxTokens;
}

function getMainTemperature(explicitRoot = null) {
	// Directly return value from config
	return getModelConfigForRole('main', explicitRoot).temperature;
}

function getResearchProvider(explicitRoot = null) {
	return getModelConfigForRole('research', explicitRoot).provider;
}

function getResearchModelId(explicitRoot = null) {
	return getModelConfigForRole('research', explicitRoot).modelId;
}

function getResearchMaxTokens(explicitRoot = null) {
	// Directly return value from config
	return getModelConfigForRole('research', explicitRoot).maxTokens;
}

function getResearchTemperature(explicitRoot = null) {
	// Directly return value from config
	return getModelConfigForRole('research', explicitRoot).temperature;
}

function getFallbackProvider(explicitRoot = null) {
	// Directly return value from config (will be undefined if not set)
	return getModelConfigForRole('fallback', explicitRoot).provider;
}

function getFallbackModelId(explicitRoot = null) {
	// Directly return value from config
	return getModelConfigForRole('fallback', explicitRoot).modelId;
}

function getFallbackMaxTokens(explicitRoot = null) {
	// Directly return value from config
	return getModelConfigForRole('fallback', explicitRoot).maxTokens;
}

function getFallbackTemperature(explicitRoot = null) {
	// Directly return value from config
	return getModelConfigForRole('fallback', explicitRoot).temperature;
}

// --- Global Settings Getters ---

function getGlobalConfig(explicitRoot = null) {
	const { effectiveConfig } = getConfig(explicitRoot);
	// Ensure global defaults are applied if global section is missing
	return { ...DEFAULTS.global, ...(effectiveConfig?.global || {}) };
}

// function getGlobalConfig(explicitRoot = null) {
// 	// _initializeModulePaths(); // Ensure paths for default config loading
// 	// _loadModelMap();        // Ensure models are loaded
//
// 	if (!loadedConfigState) {
// 		// If config isn't fully loaded yet (e.g., findProjectRoot called by getConfig's initial stages,
// 		// and findProjectRoot or its utilities like log try to get global config),
// 		// return the hardcoded defaults to prevent recursion.
// 		return JSON.parse(JSON.stringify(DEFAULTS.global));
// 	}
// 	// If loadedConfigState exists, then it's safe to get the fully resolved config.
// 	const { effectiveConfig } = getConfig(explicitRoot);
// 	// Ensure global exists and merge with DEFAULTS.global to ensure all keys are present
// 	return _mergeDeep(JSON.parse(JSON.stringify(DEFAULTS.global)), effectiveConfig?.global || {});
// }

function getLogLevel(explicitRoot = null) {
		if (!loadedConfigState) {
		// If config isn't fully loaded yet (e.g., findProjectRoot called by getConfig's initial stages,
		// and findProjectRoot or its utilities like log try to get global config),
		// return the hardcoded defaults to prevent recursion.
		return DEFAULTS.global.logLevel.toLowerCase();
	}

	// Directly return value from config
	return getGlobalConfig(explicitRoot).logLevel.toLowerCase();
}

function getDebugFlag(explicitRoot = null) {
	// Directly return value from config, ensure boolean
	return getGlobalConfig(explicitRoot).debug === true;
}

function getDefaultSubtasks(explicitRoot = null) {
	// Directly return value from config, ensure integer
	const val = getGlobalConfig(explicitRoot).defaultSubtasks;
	const parsedVal = parseInt(val, 10);
	return Number.isNaN(parsedVal) ? DEFAULTS.global.defaultSubtasks : parsedVal;
}

function getDefaultNumTasks(explicitRoot = null) {
	const val = getGlobalConfig(explicitRoot).defaultNumTasks;
	const parsedVal = parseInt(val, 10);
	return Number.isNaN(parsedVal) ? DEFAULTS.global.defaultNumTasks : parsedVal;
}

function getDefaultPriority(explicitRoot = null) {
	// Directly return value from config
	return getGlobalConfig(explicitRoot).defaultPriority;
}

function getProjectName(explicitRoot = null) {
	// Directly return value from config
	return getGlobalConfig(explicitRoot).projectName;
}

function getOllamaBaseURL(explicitRoot = null) {
	// Directly return value from config
	return getGlobalConfig(explicitRoot).ollamaBaseURL;
}

function getAzureBaseURL(explicitRoot = null) {
	// Directly return value from config
	return getGlobalConfig(explicitRoot).azureBaseURL;
}

function getBedrockBaseURL(explicitRoot = null) {
	// Directly return value from config
	return getGlobalConfig(explicitRoot).bedrockBaseURL;
}

/**
 * Gets the Google Cloud project ID for Vertex AI from configuration
 * @param {string|null} explicitRoot - Optional explicit path to the project root.
 * @returns {string|null} The project ID or null if not configured
 */
function getVertexProjectId(explicitRoot = null) {
	// Return value from config
	return getGlobalConfig(explicitRoot).vertexProjectId;
}

/**
 * Gets the Google Cloud location for Vertex AI from configuration
 * @param {string|null} explicitRoot - Optional explicit path to the project root.
 * @returns {string} The location or default value of "us-central1"
 */
function getVertexLocation(explicitRoot = null) {
	// Return value from config or default
	return getGlobalConfig(explicitRoot).vertexLocation || 'us-central1';
}

/**
 * Gets model parameters (maxTokens, temperature) for a specific role,
 * considering model-specific overrides from supported-models.json.
 * @param {string} role - The role ('main', 'research', 'fallback').
 * @param {string|null} explicitRoot - Optional explicit path to the project root.
 * @returns {{maxTokens: number, temperature: number}}
 */
function getParametersForRole(role, explicitRoot = null) {
	const roleConfig = getModelConfigForRole(role, explicitRoot);
	const roleMaxTokens = roleConfig.maxTokens;
	const roleTemperature = roleConfig.temperature;
	const modelId = roleConfig.modelId;
	const providerName = roleConfig.provider;

	let effectiveMaxTokens = roleMaxTokens; // Start with the role's default

	try {
		// Find the model definition in MODEL_MAP
		const providerModels = MODEL_MAP[providerName];
		if (providerModels && Array.isArray(providerModels)) {
			const modelDefinition = providerModels.find((m) => m.id === modelId);

			// Check if a model-specific max_tokens is defined and valid
			if (
				modelDefinition &&
				typeof modelDefinition.max_tokens === 'number' &&
				modelDefinition.max_tokens > 0
			) {
				const modelSpecificMaxTokens = modelDefinition.max_tokens;
				// Use the minimum of the role default and the model specific limit
				effectiveMaxTokens = Math.min(roleMaxTokens, modelSpecificMaxTokens);
				log(
					'debug',
					`Applying model-specific max_tokens (${modelSpecificMaxTokens}) for ${modelId}. Effective limit: ${effectiveMaxTokens}`
				);
			} else {
				log(
					'debug',
					`No valid model-specific max_tokens override found for ${modelId}. Using role default: ${roleMaxTokens}`
				);
			}
		} else {
			log(
				'debug',
				`No model definitions found for provider ${providerName} in MODEL_MAP. Using role default maxTokens: ${roleMaxTokens}`
			);
		}
	} catch (lookupError) {
		log(
			'warn',
			`Error looking up model-specific max_tokens for ${modelId}: ${lookupError.message}. Using role default: ${roleMaxTokens}`
		);
		// Fallback to role default on error
		effectiveMaxTokens = roleMaxTokens;
	}

	return {
		maxTokens: effectiveMaxTokens,
		temperature: roleTemperature
	};
}

/**
 * Checks if the API key for a given provider is set in the environment.
 * Checks process.env first, then session.env if session is provided, then .env file if projectRoot provided.
 * @param {string} providerName - The name of the provider (e.g., 'openai', 'anthropic').
 * @param {object|null} [session=null] - The MCP session object (optional).
 * @param {string|null} [projectRoot=null] - The project root directory (optional, for .env file check).
 * @returns {boolean} True if the API key is set, false otherwise.
 */
function isApiKeySet(providerName, session = null, projectRoot = null) {
	// Define the expected environment variable name for each provider
	if (providerName?.toLowerCase() === 'ollama') {
		return true; // Indicate key status is effectively "OK"
	}

	const keyMap = {
		openai: 'OPENAI_API_KEY',
		anthropic: 'ANTHROPIC_API_KEY',
		google: 'GOOGLE_API_KEY',
		perplexity: 'PERPLEXITY_API_KEY',
		mistral: 'MISTRAL_API_KEY',
		azure: 'AZURE_OPENAI_API_KEY',
		openrouter: 'OPENROUTER_API_KEY',
		xai: 'XAI_API_KEY',
		vertex: 'GOOGLE_API_KEY', // Assuming Vertex uses GOOGLE_API_KEY
		difyagent: 'DIFY_AGENT_API_KEY' // Assuming Vertex uses GOOGLE_API_KEY
	};

	const providerKey = providerName?.toLowerCase();
	if (!providerKey || !keyMap[providerKey]) {
		log('warn', `Unknown provider name: ${providerName} in isApiKeySet check.`);
		return false;
	}

	const envVarName = keyMap[providerKey];
	let apiKeyValue = null;

	if (session && session.env && session.env[envVarName]) {
		apiKeyValue = session.env[envVarName];
	} else {
		const { effectiveEnv } = getConfig(projectRoot);
		if (effectiveEnv && effectiveEnv[envVarName]) {
			apiKeyValue = effectiveEnv[envVarName];
		}
	}

	return (
		apiKeyValue &&
		apiKeyValue.trim() !== '' &&
		!/YOUR_.*_API_KEY_HERE/.test(apiKeyValue) && // General placeholder check
		!apiKeyValue.includes('KEY_HERE')
	); // Another common placeholder pattern
}

/**
 * Checks the API key status within .cursor/mcp.json for a given provider.
 * Reads the mcp.json file, finds the taskmaster-ai server config, and checks the relevant env var.
 * @param {string} providerName The name of the provider.
 * @param {string|null} projectRoot - Optional explicit path to the project root.
 * @returns {boolean} True if the key exists and is not a placeholder, false otherwise.
 */
function getMcpApiKeyStatus(providerName, projectRoot = null) {
	const rootDir = projectRoot || findProjectRoot();
	if (!rootDir) {
		// If no project root, can't check mcp.json, assume not set specifically for MCP
		// isApiKeySet will still check process.env or defaults if applicable
		return isApiKeySet(providerName, null, null); // Check global/process env
	}
	const mcpConfigPath = path.join(rootDir, '.cursor', 'mcp.json');

	if (!fs.existsSync(mcpConfigPath)) {
		// No mcp.json, rely on standard isApiKeySet behavior for the provider from .env/env_default/process.env
		return isApiKeySet(providerName, null, rootDir);
	}

	try {
		const mcpConfigRaw = fs.readFileSync(mcpConfigPath, 'utf-8');
		const mcpConfig = JSON.parse(mcpConfigRaw);

		const mcpEnv = mcpConfig?.mcpServers?.['taskmaster-ai']?.env;
		if (!mcpEnv) {
			// No env block in mcp.json for taskmaster-ai, rely on standard check
			return isApiKeySet(providerName, null, rootDir);
		}

		let apiKeyToCheck = null;

		// Simplified key mapping for mcp.json check
		const mcpKeyMap = {
			openai: 'OPENAI_API_KEY',
			anthropic: 'ANTHROPIC_API_KEY',
			perplexity: 'PERPLEXITY_API_KEY',
			google: 'GOOGLE_API_KEY', // Covers Google and Vertex
			azure: 'AZURE_OPENAI_API_KEY',
			mistral: 'MISTRAL_API_KEY',
			openrouter: 'OPENROUTER_API_KEY',
			xai: 'XAI_API_KEY'
		};
		
		const providerKey = providerName?.toLowerCase();

		if (providerKey === 'ollama') return true; // Ollama doesn't require a key in this context

		if (!providerKey || !mcpKeyMap[providerKey]) {
			return false; // Unknown provider for MCP key check
		}
		
		apiKeyToCheck = mcpEnv[mcpKeyMap[providerKey]];

		return !!apiKeyToCheck && !/KEY_HERE$/.test(apiKeyToCheck) && apiKeyToCheck.trim() !== '';

	} catch (error) {
		console.error(
			chalk.red(`Error reading or parsing .cursor/mcp.json: ${error.message}. API key status may be incorrect.`)
		);
		// Fallback to standard check if mcp.json is broken
		return isApiKeySet(providerName, null, rootDir);
	}
}

/**
 * Gets a list of available models based on the MODEL_MAP.
 * @returns {Array<{id: string, name: string, provider: string, swe_score: number|null, cost_per_1m_tokens: {input: number|null, output: number|null}|null, allowed_roles: string[]}>}
 */
function getAvailableModels() {
	const available = [];
	for (const [provider, models] of Object.entries(MODEL_MAP)) {
		if (models.length > 0) {
			models.forEach((modelObj) => {
				// Basic name generation - can be improved
				const modelId = modelObj.id;
				const sweScore = modelObj.swe_score;
				const cost = modelObj.cost_per_1m_tokens;
				const allowedRoles = modelObj.allowed_roles || ['main', 'fallback'];
				const nameParts = modelId
					.split('-')
					.map((p) => p.charAt(0).toUpperCase() + p.slice(1));
				// Handle specific known names better if needed
				let name = nameParts.join(' ');
				if (modelId === 'claude-3.5-sonnet-20240620')
					name = 'Claude 3.5 Sonnet';
				if (modelId === 'claude-3-7-sonnet-20250219')
					name = 'Claude 3.7 Sonnet';
				if (modelId === 'gpt-4o') name = 'GPT-4o';
				if (modelId === 'gpt-4-turbo') name = 'GPT-4 Turbo';
				if (modelId === 'sonar-pro') name = 'Perplexity Sonar Pro';
				if (modelId === 'sonar-mini') name = 'Perplexity Sonar Mini';

				available.push({
					id: modelId,
					name: name,
					provider: provider,
					swe_score: sweScore,
					cost_per_1m_tokens: cost,
					allowed_roles: allowedRoles
				});
			});
		} else {
			// For providers with empty lists (like ollama), maybe add a placeholder or skip
			available.push({
				id: `[${provider}-any]`,
				name: `Any (${provider})`,
				provider: provider
			});
		}
	}
	return available;
}

/**
 * Writes the configuration object to the file.
 * @param {Object} config The configuration object to write.
 * @param {string|null} explicitRoot - Optional explicit path to the project root.
 * @returns {boolean} True if successful, false otherwise.
 */
function writeConfig(config, explicitRoot = null) {
	// ---> Determine root path reliably <---
	let rootPath = explicitRoot;
	if (explicitRoot === null || explicitRoot === undefined) {
		// Logic matching _loadAndValidateConfig
		const foundRoot = findProjectRoot(); // *** Explicitly call findProjectRoot ***
		if (!foundRoot) {
			log('error','Error: Could not determine project root. Configuration not saved.');
			return false;
		}
		rootPath = foundRoot;
	}
	// ---> End determine root path logic <---

	// Use new config location: .taskmaster/config.json
	const taskmasterDir = path.join(rootPath, '.taskmaster');
	const configPath = path.join(taskmasterDir, 'config.json');

	try {
		// Ensure .taskmaster directory exists
		if (!fs.existsSync(taskmasterDir)) {
			fs.mkdirSync(taskmasterDir, { recursive: true });
		}
		// Prune useDefaultConfiguration from global if it's the default value (false)
		// to keep config.json cleaner.
		const configToPersist = JSON.parse(JSON.stringify(config)); // Deep clone
		if (configToPersist.global && configToPersist.global.useDefaultConfiguration === false) {
			delete configToPersist.global.useDefaultConfiguration;
		}
		if (configToPersist.global && Object.keys(configToPersist.global).length === 0) {
			delete configToPersist.global;
		}


		fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
		loadedConfig = config; // Update the cache after successful write
		// After writing, force a reload of the configuration state
		// getConfig(rootPath, true);
		return true;
	} catch (error) {
		log('error',`Error writing configuration to ${configPath}: ${error.message}`);
		return false;
	}
}

/**
 * Checks if a configuration file exists at the project root (new or legacy location)
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @returns {boolean} True if the file exists, false otherwise
 */
function isConfigFilePresent(explicitRoot = null) {
	return findConfigPath(null, { projectRoot: explicitRoot }) !== null;
}

/**
 * Gets the user ID from the configuration.
 * @param {string|null} explicitRoot - Optional explicit path to the project root.
 * @returns {string|null} The user ID or null if not found.
 */
function getUserId(explicitRoot = null) {
	const { effectiveConfig, projectRootPath } = getConfig(explicitRoot); // projectRootPath from getConfig's state
	let currentConfig = effectiveConfig;
	let needsWrite = false;

	if (!currentConfig.global) {
		currentConfig.global = {}; // Ensure global object exists
	}
	if (!currentConfig.global.userId) {
		currentConfig.global.userId = Date.now().toString(36) + Math.random().toString(36).substring(2); // More unique
		log('info', `Generated new User ID: ${currentConfig.global.userId}`);
		needsWrite = true;
	}
	
	if (needsWrite) {
		// Pass the determined projectRootPath from getConfig's state to writeConfig
		// This ensures writeConfig uses the same root that getConfig used for loading.
		const success = writeConfig(currentConfig, projectRootPath); 
		if (!success) {
			log('warning','Failed to write updated configuration with new userId.');
		}
	}
	return currentConfig.global.userId;
}

/**
 * Gets a list of all provider names defined in the MODEL_MAP.
 * @returns {string[]} An array of provider names.
 */
function getAllProviders() {
	return Object.keys(MODEL_MAP || {});
}

function getBaseUrlForRole(role, explicitRoot = null) {
	const roleConfig = getModelConfigForRole(role, explicitRoot);
	return roleConfig && typeof roleConfig.baseURL === 'string'
		? roleConfig.baseURL
		: undefined;
}

// Ensure MODEL_MAP is loaded when the module is first imported and used.
// Call it at the end or before first use in exported functions if not pre-loaded.
// _loadModelMap(); // Load models when module is initialized

export {
	// Core config access
	getConfig,
	writeConfig,
	ConfigurationError,
	isConfigFilePresent,
	// Validation
	validateProvider,
	validateProviderModelCombination,
	VALID_PROVIDERS,
	MODEL_MAP,
	getAvailableModels,
	// Role-specific getters (No env var overrides)
	getMainProvider,
	getMainModelId,
	getMainMaxTokens,
	getMainTemperature,
	getResearchProvider,
	getResearchModelId,
	getResearchMaxTokens,
	getResearchTemperature,
	getFallbackProvider,
	getFallbackModelId,
	getFallbackMaxTokens,
	getFallbackTemperature,
	getBaseUrlForRole,
	// Global setting getters (No env var overrides)
	getLogLevel,
	getDebugFlag,
	getDefaultNumTasks,
	getDefaultSubtasks,
	getDefaultPriority,
	getProjectName,
	getOllamaBaseURL,
	getAzureBaseURL,
	getBedrockBaseURL,
	getParametersForRole,
	getUserId,
	// API Key Checkers (still relevant)
	isApiKeySet,
	getMcpApiKeyStatus,
	// ADD: Function to get all provider names
	getAllProviders,
	getVertexProjectId,
	getVertexLocation
};
