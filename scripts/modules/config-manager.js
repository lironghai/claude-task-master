import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { z } from 'zod';
import {
	LEGACY_CONFIG_FILE,
	TASKMASTER_DIR
} from '../../src/constants/paths.js';
import {
	ALL_PROVIDERS,
	CUSTOM_PROVIDERS,
	CUSTOM_PROVIDERS_ARRAY,
	VALIDATED_PROVIDERS
} from '../../src/constants/providers.js';
import { findConfigPath } from '../../src/utils/path-utils.js';
import { findProjectRoot, isEmpty, log, resolveEnvVariable } from './utils.js';
import dotenv from 'dotenv';
import { AI_COMMAND_NAMES } from '../../src/constants/commands.js';

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
	MODEL_MAP = JSON.parse(supportedModelsRaw);
} catch (error) {
	console.error(
		chalk.red(
			'FATAL ERROR: Could not load supported-models.json. Please ensure the file exists and is valid JSON. ' +
			error.constructor.name + ': ' + error.message
		)
	);
	MODEL_MAP = {}; // Default to empty map on error to avoid crashing, though functionality will be limited
	process.exit(1); // Exit if models can't be loaded
}

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
			maxTokens: 8192, // Default parameters if fallback IS configured
			temperature: 0.2
		}
	},
	global: {
		logLevel: 'info',
		debug: false,
		defaultNumTasks: 10,
		defaultSubtasks: 5,
		defaultPriority: 'medium',
		projectName: 'Task Master',
		ollamaBaseURL: 'http://localhost:11434/api',
		bedrockBaseURL: 'https://bedrock.us-east-1.amazonaws.com',
		responseLanguage: 'Chinese',
		useDefaultConfiguration: true
	},
	claudeCode: {}
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

function _loadAndValidateConfig(explicitRoot = null) {
	const defaults = DEFAULTS; // Use the defined defaults
	let rootToUse = explicitRoot;
	let configSource = explicitRoot
		? `explicit root (${explicitRoot})`
		: 'defaults (no root provided yet)';

	// ---> If no explicit root, TRY to find it <---
	if (!rootToUse) {
		rootToUse = findProjectRoot();
		if (rootToUse) {
			configSource = `found root (${rootToUse})`;
		} else {
			// No root found, use current working directory as fallback
			// This prevents infinite loops during initialization
			rootToUse = process.cwd();
			configSource = `current directory (${rootToUse}) - no project markers found`;
		}
	}
	// ---> End find project root logic <---

	// --- Find configuration file ---
	let configPath = null;
	let config = { ...defaults }; // Start with a deep copy of defaults
	let configExists = false;

	// During initialization (no project markers), skip config file search entirely
	const hasProjectMarkers =
		fs.existsSync(path.join(rootToUse, TASKMASTER_DIR)) ||
		fs.existsSync(path.join(rootToUse, LEGACY_CONFIG_FILE));

	if (hasProjectMarkers) {
		// Only try to find config if we have project markers
		// This prevents the repeated warnings during init
		configPath = findConfigPath(null, { projectRoot: rootToUse });
	}

	if (configPath) {
		configExists = true;
		const isLegacy = configPath.endsWith(LEGACY_CONFIG_FILE);

		try {
			const rawData = fs.readFileSync(configPath, 'utf-8');
			const parsedConfig = JSON.parse(rawData);

			// Deep merge parsed config onto defaults
			config = {
				models: {
					main: { ...defaults.models.main, ...parsedConfig?.models?.main },
					research: {
						...defaults.models.research,
						...parsedConfig?.models?.research
					},
					fallback:
						parsedConfig?.models?.fallback?.provider &&
						parsedConfig?.models?.fallback?.modelId
							? { ...defaults.models.fallback, ...parsedConfig.models.fallback }
							: { ...defaults.models.fallback }
				},
				global: { ...defaults.global, ...parsedConfig?.global },
				claudeCode: { ...defaults.claudeCode, ...parsedConfig?.claudeCode }
			};
			configSource = `file (${configPath})`; // Update source info

			// Issue deprecation warning if using legacy config file
			if (isLegacy) {
				console.warn(
					chalk.yellow(
						`⚠️  DEPRECATION WARNING: Found configuration in legacy location '${configPath}'. Please migrate to .taskmaster/config.json. Run 'task-master migrate' to automatically migrate your project.`
					)
				);
			}

			// --- Validation (Warn if file content is invalid) ---
			// Use log.warn for consistency
			if (!validateProvider(config.models.main.provider)) {
				console.warn(
					chalk.yellow(
						`Warning: Invalid main provider "${config.models.main.provider}" in ${configPath}. Falling back to default.`
					)
				);
				config.models.main = { ...defaults.models.main };
			}
			if (!validateProvider(config.models.research.provider)) {
				console.warn(
					chalk.yellow(
						`Warning: Invalid research provider "${config.models.research.provider}" in ${configPath}. Falling back to default.`
					)
				);
				config.models.research = { ...defaults.models.research };
			}
			if (
				config.models.fallback?.provider &&
				!validateProvider(config.models.fallback.provider)
			) {
				console.warn(
					chalk.yellow(
						`Warning: Invalid fallback provider "${config.models.fallback.provider}" in ${configPath}. Fallback model configuration will be ignored.`
					)
				);
				config.models.fallback.provider = undefined;
				config.models.fallback.modelId = undefined;
			}
			if (config.claudeCode && !isEmpty(config.claudeCode)) {
				config.claudeCode = validateClaudeCodeSettings(config.claudeCode);
			}
		} catch (error) {
			// Use console.error for actual errors during parsing
			console.error(
				chalk.red(
					`Error reading or parsing ${configPath}: ${error.message}. Using default configuration.`
				)
			);
			config = { ...defaults }; // Reset to defaults on parse error
			configSource = `defaults (parse error at ${configPath})`;
		}
	} else {
		// Config file doesn't exist at the determined rootToUse.
		if (explicitRoot) {
			// Only warn if an explicit root was *expected*.
			console.warn(
				chalk.yellow(
					`Warning: Configuration file not found at provided project root (${explicitRoot}). Using default configuration. Run 'task-master models --setup' to configure.`
				)
			);
		} else {
			// Don't warn about missing config during initialization
			// Only warn if this looks like an existing project (has .taskmaster dir or legacy config marker)
			const hasTaskmasterDir = fs.existsSync(
				path.join(rootToUse, TASKMASTER_DIR)
			);
			const hasLegacyMarker = fs.existsSync(
				path.join(rootToUse, LEGACY_CONFIG_FILE)
			);

			if (hasTaskmasterDir || hasLegacyMarker) {
				console.warn(
					chalk.yellow(
						`Warning: Configuration file not found at derived root (${rootToUse}). Using defaults.`
					)
				);
			}
		}
		// Keep config as defaults
		config = { ...defaults };
		configSource = `defaults (no config file found at ${rootToUse})`;
	}

	return config;
}

/**
 * Gets the current configuration, loading it if necessary.
 * Handles MCP initialization context gracefully.
 * @param {string|null} explicitRoot - Optional explicit path to the project root.
 * @param {boolean} forceReload - Force reloading the config file.
 * @returns {object} The loaded configuration object.
 */
function getConfig(explicitRoot = null, forceReload = false) {

	if (loadedConfigState && !explicitRoot) {
		return loadedConfigState;
	}

	const currentProjectRoot = explicitRoot || findProjectRoot();

	const needsLoad =
		!loadedConfigState ||
		forceReload ||
		(currentProjectRoot && currentProjectRoot !== loadedConfigState.projectRootPath);

	// console.log(`[getConfig] loadedConfigState: ${loadedConfigState}`); // Diagnostic log
	// console.log(`[getConfig] currentProjectRoot: ${currentProjectRoot}`); // Diagnostic log
	// console.log(`[getConfig] needsLoad is: ${needsLoad}`); // Diagnostic log

	if (needsLoad) {
		const config = _loadAndValidateConfig(currentProjectRoot);

		// console.log(`[getConfig] configToUse is: ${JSON.stringify(configToUse)}`);

		let loadedEnvFromFile = {};
		let isUsingDefaultSystem = false;
		if (isUsingDefaultSystem) {
			// Load from MASTER_DEFAULT_ENV_TEMPLATE_PATH
			const { content: parsedMasterEnv, error: masterEnvError } = _tryReadAndParseEnv(MASTER_DEFAULT_ENV_TEMPLATE_PATH);
			if (parsedMasterEnv) {
				loadedEnvFromFile = parsedMasterEnv;
				log('debug', `Loaded environment variables from master template: ${MASTER_DEFAULT_ENV_TEMPLATE_PATH}`);
			} else {
				log('warn', `Master default ENV template (${MASTER_DEFAULT_ENV_TEMPLATE_PATH}) not found or failed to parse (Error: ${masterEnvError || 'not_found'}). Using empty default env for this load.`);
			}
		} else if (forceReload || currentProjectRoot) { // Not using default system, try to load project-specific .env
			const envPath = path.join(currentProjectRoot, '.env');
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
			effectiveConfig: config,
			effectiveEnv: effectiveEnv,
			isUsingDefaultSystem: isUsingDefaultSystem,
			projectRootPath: currentProjectRoot,
			configPhysicalFileExists: true // Renamed for clarity
		};
		// Log('debug', `Config loaded. Source: ${sourceOfConfig}, Using defaults: ${isUsingDefaultSystem}, Env target: ${envFileToTarget}`);
		return loadedConfigState;
	}

	return loadedConfigState;
}

/**
 * Validates if a provider name is supported.
 * Custom providers (azure, vertex, bedrock, openrouter, ollama) are always allowed.
 * Validated providers must exist in the MODEL_MAP from supported-models.json.
 * @param {string} providerName The name of the provider.
 * @returns {boolean} True if the provider is valid, false otherwise.
 */
function validateProvider(providerName) {
	// Custom providers are always allowed
	if (CUSTOM_PROVIDERS_ARRAY.includes(providerName)) {
		return true;
	}

	// Validated providers must exist in MODEL_MAP
	if (VALIDATED_PROVIDERS.includes(providerName)) {
		return !!(MODEL_MAP && MODEL_MAP[providerName]);
	}

	// Unknown providers are not allowed
	return false;
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

/**
 * Validates Claude Code AI provider custom settings
 * @param {object} settings The settings to validate
 * @returns {object} The validated settings
 */
function validateClaudeCodeSettings(settings) {
	// Define the base settings schema without commandSpecific first
	const BaseSettingsSchema = z.object({
		maxTurns: z.number().int().positive().optional(),
		customSystemPrompt: z.string().optional(),
		appendSystemPrompt: z.string().optional(),
		permissionMode: z
			.enum(['default', 'acceptEdits', 'plan', 'bypassPermissions'])
			.optional(),
		allowedTools: z.array(z.string()).optional(),
		disallowedTools: z.array(z.string()).optional(),
		mcpServers: z
			.record(
				z.string(),
				z.object({
					type: z.enum(['stdio', 'sse']).optional(),
					command: z.string(),
					args: z.array(z.string()).optional(),
					env: z.record(z.string()).optional(),
					url: z.string().url().optional(),
					headers: z.record(z.string()).optional()
				})
			)
			.optional()
	});

	// Define CommandSpecificSchema using the base schema
	const CommandSpecificSchema = z.record(
		z.enum(AI_COMMAND_NAMES),
		BaseSettingsSchema
	);

	// Define the full settings schema with commandSpecific
	const SettingsSchema = BaseSettingsSchema.extend({
		commandSpecific: CommandSpecificSchema.optional()
	});

	let validatedSettings = {};

	try {
		validatedSettings = SettingsSchema.parse(settings);
	} catch (error) {
		console.warn(
			chalk.yellow(
				`Warning: Invalid Claude Code settings in config: ${error.message}. Falling back to default.`
			)
		);

		validatedSettings = {};
	}

	return validatedSettings;
}

// --- Claude Code Settings Getters ---

function getClaudeCodeSettings(explicitRoot = null, forceReload = false) {
	const config = getConfig(explicitRoot, forceReload);
	// Ensure Claude Code defaults are applied if Claude Code section is missing
	return { ...DEFAULTS.claudeCode, ...(config?.claudeCode || {}) };
}

function getClaudeCodeSettingsForCommand(
	commandName,
	explicitRoot = null,
	forceReload = false
) {
	const settings = getClaudeCodeSettings(explicitRoot, forceReload);
	const commandSpecific = settings?.commandSpecific || {};
	return { ...settings, ...commandSpecific[commandName] };
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

function getResponseLanguage(explicitRoot = null) {
	// Directly return value from config
	return getGlobalConfig(explicitRoot).responseLanguage;
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
	let effectiveTemperature = roleTemperature; // Start with the role's default

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

			// Check if a model-specific temperature is defined
			if (
				modelDefinition &&
				typeof modelDefinition.temperature === 'number' &&
				modelDefinition.temperature >= 0 &&
				modelDefinition.temperature <= 1
			) {
				effectiveTemperature = modelDefinition.temperature;
				log(
					'debug',
					`Applying model-specific temperature (${modelDefinition.temperature}) for ${modelId}`
				);
			}
		} else {
			// Special handling for custom OpenRouter models
			if (providerName === CUSTOM_PROVIDERS.OPENROUTER) {
				// Use a conservative default for OpenRouter models not in our list
				const openrouterDefault = 32768;
				effectiveMaxTokens = Math.min(roleMaxTokens, openrouterDefault);
				log(
					'debug',
					`Custom OpenRouter model ${modelId} detected. Using conservative max_tokens: ${effectiveMaxTokens}`
				);
			} else {
				log(
					'debug',
					`No model definitions found for provider ${providerName} in MODEL_MAP. Using role default maxTokens: ${roleMaxTokens}`
				);
			}
		}
	} catch (lookupError) {
		log(
			'warn',
			`Error looking up model-specific parameters for ${modelId}: ${lookupError.message}. Using role defaults.`
		);
		// Fallback to role defaults on error
		effectiveMaxTokens = roleMaxTokens;
		effectiveTemperature = roleTemperature;
	}

	return {
		maxTokens: effectiveMaxTokens,
		temperature: effectiveTemperature
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

	// Providers that don't require API keys for authentication
	const providersWithoutApiKeys = [
		CUSTOM_PROVIDERS.OLLAMA,
		CUSTOM_PROVIDERS.BEDROCK,
		CUSTOM_PROVIDERS.MCP,
		CUSTOM_PROVIDERS.GEMINI_CLI
	];

	if (providersWithoutApiKeys.includes(providerName?.toLowerCase())) {
		return true; // Indicate key status is effectively "OK"
	}

	// Claude Code doesn't require an API key
	if (providerName?.toLowerCase() === 'claude-code') {
		return true; // No API key needed
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
		groq: 'GROQ_API_KEY',
		vertex: 'GOOGLE_API_KEY', // Vertex uses the same key as Google
		'claude-code': 'CLAUDE_CODE_API_KEY', // Not actually used, but included for consistency
		bedrock: 'AWS_ACCESS_KEY_ID', // Bedrock uses AWS credentials
        difyagent: 'DIFY_AGENT_API_KEY'
        // Add other providers as needed
	};

	const providerKey = providerName?.toLowerCase();
	if (!providerKey || !keyMap[providerKey]) {
		log('warn', `Unknown provider name: ${providerName} in isApiKeySet check.`);
		return false;
	}

	const envVarName = keyMap[providerKey];
	let apiKeyValue = null;

	if (session && session.env && session.env[envVarName]) {
		// apiKeyValue = session.env[envVarName];
		apiKeyValue = resolveEnvVariable(envVarName, session, projectRoot);;
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
	const rootDir = projectRoot || findProjectRoot(); // Use existing root finding
	if (!rootDir) {
		console.warn(
			chalk.yellow('Warning: Could not find project root to check mcp.json.')
		);
		return false; // Cannot check without root
	}
	const mcpConfigPath = path.join(rootDir, '.cursor', 'mcp.json');

	if (!fs.existsSync(mcpConfigPath)) {
		// console.warn(chalk.yellow('Warning: .cursor/mcp.json not found.'));
		return false; // File doesn't exist
	}

	try {
		const mcpConfigRaw = fs.readFileSync(mcpConfigPath, 'utf-8');
		const mcpConfig = JSON.parse(mcpConfigRaw);

		const mcpEnv =
			mcpConfig?.mcpServers?.['task-master-ai']?.env ||
			mcpConfig?.mcpServers?.['taskmaster-ai']?.env;
		if (!mcpEnv) {
			return false;
		}

		let apiKeyToCheck = null;
		let placeholderValue = null;

		switch (providerName) {
			case 'anthropic':
				apiKeyToCheck = mcpEnv.ANTHROPIC_API_KEY;
				placeholderValue = 'YOUR_ANTHROPIC_API_KEY_HERE';
				break;
			case 'openai':
				apiKeyToCheck = mcpEnv.OPENAI_API_KEY;
				placeholderValue = 'YOUR_OPENAI_API_KEY_HERE'; // Assuming placeholder matches OPENAI
				break;
			case 'openrouter':
				apiKeyToCheck = mcpEnv.OPENROUTER_API_KEY;
				placeholderValue = 'YOUR_OPENROUTER_API_KEY_HERE';
				break;
			case 'google':
				apiKeyToCheck = mcpEnv.GOOGLE_API_KEY;
				placeholderValue = 'YOUR_GOOGLE_API_KEY_HERE';
				break;
			case 'perplexity':
				apiKeyToCheck = mcpEnv.PERPLEXITY_API_KEY;
				placeholderValue = 'YOUR_PERPLEXITY_API_KEY_HERE';
				break;
			case 'xai':
				apiKeyToCheck = mcpEnv.XAI_API_KEY;
				placeholderValue = 'YOUR_XAI_API_KEY_HERE';
				break;
			case 'groq':
				apiKeyToCheck = mcpEnv.GROQ_API_KEY;
				placeholderValue = 'YOUR_GROQ_API_KEY_HERE';
				break;
			case 'ollama':
				return true; // No key needed
			case 'claude-code':
				return true; // No key needed
			case 'mistral':
				apiKeyToCheck = mcpEnv.MISTRAL_API_KEY;
				placeholderValue = 'YOUR_MISTRAL_API_KEY_HERE';
				break;
			case 'azure':
				apiKeyToCheck = mcpEnv.AZURE_OPENAI_API_KEY;
				placeholderValue = 'YOUR_AZURE_OPENAI_API_KEY_HERE';
				break;
			case 'vertex':
				apiKeyToCheck = mcpEnv.GOOGLE_API_KEY; // Vertex uses Google API key
				placeholderValue = 'YOUR_GOOGLE_API_KEY_HERE';
				break;
			case 'bedrock':
				apiKeyToCheck = mcpEnv.AWS_ACCESS_KEY_ID; // Bedrock uses AWS credentials
				placeholderValue = 'YOUR_AWS_ACCESS_KEY_ID_HERE';
				break;
			default:
				return false; // Unknown provider
		}

		return !!apiKeyToCheck && !/KEY_HERE$/.test(apiKeyToCheck);
	} catch (error) {
		console.error(
			chalk.red(`Error reading or parsing .cursor/mcp.json: ${error.message}`)
		);
		return false;
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
			models
				.filter((modelObj) => Boolean(modelObj.supported))
				.forEach((modelObj) => {
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
						allowed_roles: allowedRoles,
						max_tokens: modelObj.max_tokens
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
			console.error(
				chalk.red(
					'Error: Could not determine project root. Configuration not saved.'
				)
			);
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

		fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
		loadedConfig = config; // Update the cache after successful write
		return true;
	} catch (error) {
		console.error(
			chalk.red(
				`Error writing configuration to ${configPath}: ${error.message}`
			)
		);
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

	if (!currentConfig || !currentConfig.global) {
		currentConfig = {}; // Ensure global object exists
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
			// Log an error or handle the failure to write,
			// though for now, we'll proceed with the in-memory default.
			log(
				'warning',
				'Failed to write updated configuration with new userId. Please let the developers know.'
			);
		}
	}
	return currentConfig.global.userId;
}

/**
 * Gets a list of all known provider names (both validated and custom).
 * @returns {string[]} An array of all provider names.
 */
function getAllProviders() {
	return ALL_PROVIDERS;
}

function getBaseUrlForRole(role, explicitRoot = null) {
	const roleConfig = getModelConfigForRole(role, explicitRoot);
	if (roleConfig && typeof roleConfig.baseURL === 'string') {
		return roleConfig.baseURL;
	}
	const provider = roleConfig?.provider;
	if (provider) {
		const envVarName = `${provider.toUpperCase()}_BASE_URL`;
		return resolveEnvVariable(envVarName, null, explicitRoot);
	}
	return undefined;
}

// Export the providers without API keys array for use in other modules
export const providersWithoutApiKeys = [
	CUSTOM_PROVIDERS.OLLAMA,
	CUSTOM_PROVIDERS.BEDROCK,
	CUSTOM_PROVIDERS.GEMINI_CLI,
	CUSTOM_PROVIDERS.MCP
];

export {
	// Core config access
	getConfig,
	writeConfig,
	ConfigurationError,
	isConfigFilePresent,
	// Claude Code settings
	getClaudeCodeSettings,
	getClaudeCodeSettingsForCommand,
	// Validation
	validateProvider,
	validateProviderModelCombination,
	validateClaudeCodeSettings,
	VALIDATED_PROVIDERS,
	CUSTOM_PROVIDERS,
	ALL_PROVIDERS,
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
	getResponseLanguage,
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
