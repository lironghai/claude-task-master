/**
 * system-info.js
 * Core module for collecting system information including platform, versions, and environment details
 */

import { execSync } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';

/**
 * Execute a command safely with timeout
 * @param {string} command - Command to execute
 * @param {Object} options - Options object with mcpLog or console logging
 * @param {boolean} includeStderr - Whether to include stderr in output
 * @returns {string|null} - Command output or null if failed
 */
function executeCommand(command, options = {}, includeStderr = false) {
	const log = options.mcpLog || console;
	
	try {
		const execOptions = { 
			encoding: 'utf-8', 
			timeout: 10000, // 增加超时时间
			stdio: 'pipe', // 使用pipe获取所有输出
			shell: true     // 使用shell执行命令
		};
		
		const result = execSync(command, execOptions);
		const output = result.toString().trim();
		if (output) return output;
		
		// 如果stdout为空但需要stderr，再次尝试
		if (includeStderr) {
			try {
				execSync(command, { ...execOptions, stdio: ['ignore', 'ignore', 'pipe'] });
			} catch (stderrError) {
				if (stderrError.stderr) {
					return stderrError.stderr.toString().trim();
				}
			}
		}
		
		return null;
	} catch (error) {
		// Java等命令的版本信息通常在stderr中
		if (includeStderr && error.stderr) {
			const stderrOutput = error.stderr.toString().trim();
			if (stderrOutput) {
				return stderrOutput;
			}
		}
		
		// 也检查stdout
		if (error.stdout) {
			const stdoutOutput = error.stdout.toString().trim();
			if (stdoutOutput) {
				return stdoutOutput;
			}
		}
		
		log.debug && log.debug(`Command "${command}" failed: ${error.message}`);
		return null;
	}
}

/**
 * Get platform information in Chinese
 * @returns {string} - Platform name in Chinese
 */
function getPlatformInfo() {
	const platform = os.platform();
	const platformMap = {
		'win32': 'Windows',
		'darwin': 'macOS',
		'linux': 'Linux',
		'freebsd': 'FreeBSD',
		'openbsd': 'OpenBSD',
		'sunos': 'SunOS',
		'aix': 'AIX'
	};
	return platformMap[platform] || platform;
}

/**
 * Get Python version
 * @param {Object} options - Options object with logging
 * @returns {string} - Python version or "未安装"
 */
function getPythonVersion(options = {}) {
	// Try python3 first, then python
	let version = executeCommand('python3 --version', options);
	if (!version) {
		version = executeCommand('python --version', options);
	}
	
	if (version) {
		// Extract version number from "Python X.Y.Z"
		const match = version.match(/Python\s+(\d+\.\d+\.\d+)/);
		return match ? match[1] : version;
	}
	return '未安装';
}

/**
 * Get Java/JDK version
 * @param {Object} options - Options object with logging
 * @returns {string} - JDK version or "未安装"
 */
function getJDKVersion(options = {}) {
	const log = options.mcpLog || console;
	
	// 方法1: 检查JAVA_HOME环境变量
	if (process.env.JAVA_HOME) {
		try {
			const javaExe = path.join(process.env.JAVA_HOME, 'bin', 'java.exe');
			if (fs.existsSync(javaExe)) {
				const version = executeCommand(`"${javaExe}" -version`, options, true);
				if (version) {
					const match = version.match(/version\s+"([^"]+)"/);
					if (match) {
						return match[1];
					}
				}
			}
		} catch (error) {
			log.debug && log.debug(`JAVA_HOME detection failed: ${error.message}`);
		}
	}
	
	// 方法2: 使用java -version命令（优先，这是实际运行的版本）
	try {
		// 在Windows PowerShell中，需要特殊处理stderr重定向
		const version = executeCommand('java -version 2>&1', options, false);
		if (version) {
			log.debug && log.debug(`Java version output: ${version}`);
			
			// 解析java -version输出
			const patterns = [
				/java\s+version\s+"([^"]+)"/i,   // Java版本格式
				/version\s+"([^"]+)"/i,          // 标准格式: version "1.8.0_391"
				/openjdk\s+version\s+"([^"]+)"/i, // OpenJDK格式
				/(\d+\.\d+\.\d+[._]\d+)/,        // 提取版本号
				/(\d+\.\d+\.\d+)/                // 简单版本号
			];
			
			for (const pattern of patterns) {
				const match = version.match(pattern);
				if (match) {
					return match[1];
				}
			}
			
			// 如果无法解析，返回第一行
			const firstLine = version.split('\n')[0];
			if (firstLine && firstLine.length < 100) { // 避免返回过长的字符串
				return firstLine.replace(/^[^:]*:\s*/, ''); // 移除PowerShell错误前缀
			}
		}
	} catch (error) {
		log.debug && log.debug(`Java -version command failed: ${error.message}`);
	}
	
	// 备用方法：不使用重定向
	let version = executeCommand('java -version', options, true);
	if (version) {
		log.debug && log.debug(`Java version fallback output: ${version}`);
		
		const patterns = [
			/java\s+version\s+"([^"]+)"/i,
			/version\s+"([^"]+)"/i,
			/openjdk\s+version\s+"([^"]+)"/i,
			/(\d+\.\d+\.\d+[._]\d+)/,
			/(\d+\.\d+\.\d+)/
		];
		
		for (const pattern of patterns) {
			const match = version.match(pattern);
			if (match) {
				return match[1];
			}
		}
	}
	
	// 方法3: 尝试javac
	const javacVersion = executeCommand('javac -version', options, true);
	if (javacVersion) {
		const patterns = [
			/javac\s+(\d+\.\d+\.\d+[._]\d+)/,
			/javac\s+(\d+\.\d+\.\d+)/,
			/(\d+\.\d+\.\d+[._]\d+)/,
			/(\d+\.\d+\.\d+)/
		];
		
		for (const pattern of patterns) {
			const match = javacVersion.match(pattern);
			if (match) {
				return match[1];
			}
		}
	}
	
	// 方法4: 检查常见安装路径
	const commonPaths = [
		'C:\\Program Files\\Java',
		'C:\\Program Files (x86)\\Java',
		'C:\\Program Files\\OpenJDK',
		'C:\\Program Files (x86)\\OpenJDK'
	];
	
	for (const basePath of commonPaths) {
		try {
			if (fs.existsSync(basePath)) {
				const dirs = fs.readdirSync(basePath);
				const jdkDirs = dirs.filter(dir => 
					dir.toLowerCase().includes('jdk') || 
					dir.toLowerCase().includes('java')
				);
				if (jdkDirs.length > 0) {
					return `已安装 (${jdkDirs.join(', ')})`;
				}
			}
		} catch (error) {
			log.debug && log.debug(`Path check failed for ${basePath}: ${error.message}`);
		}
	}
	
	return '未安装';
}

/**
 * Get Maven version
 * @param {Object} options - Options object with logging
 * @returns {string} - Maven version or "未安装"
 */
function getMavenVersion(options = {}) {
	const version = executeCommand('mvn --version', options);
	if (version) {
		const match = version.match(/Apache Maven\s+(\d+\.\d+\.\d+)/);
		return match ? match[1] : version.split('\n')[0];
	}
	return '未安装';
}

/**
 * Get Git version
 * @param {Object} options - Options object with logging
 * @returns {string} - Git version or "未安装"
 */
function getGitVersion(options = {}) {
	const version = executeCommand('git --version', options);
	if (version) {
		const match = version.match(/git version\s+(\d+\.\d+\.\d+)/);
		return match ? match[1] : version;
	}
	return '未安装';
}

/**
 * Get Docker version
 * @param {Object} options - Options object with logging
 * @returns {string} - Docker version or "未安装"
 */
function getDockerVersion(options = {}) {
	const version = executeCommand('docker --version', options);
	if (version) {
		const match = version.match(/Docker version\s+(\d+\.\d+\.\d+)/);
		return match ? match[1] : version;
	}
	return '未安装';
}

/**
 * Get Go version
 * @param {Object} options - Options object with logging
 * @returns {string} - Go version or "未安装"
 */
function getGoVersion(options = {}) {
	const version = executeCommand('go version', options);
	if (version) {
		// Go version output format: "go version go1.21.0 windows/amd64"
		const patterns = [
			/go version go(\d+\.\d+\.\d+)/,  // 标准格式
			/go(\d+\.\d+\.\d+)/,             // 简化格式
			/version go(\d+\.\d+\.\d+)/      // 备用格式
		];
		
		for (const pattern of patterns) {
			const match = version.match(pattern);
			if (match) {
				return match[1];
			}
		}
		
		// 如果无法解析版本号，返回第一行的简化版本
		const firstLine = version.split('\n')[0];
		if (firstLine && firstLine.length < 100) {
			return firstLine.replace(/^go\s+version\s+/, '');
		}
	}
	return '未安装';
}

/**
 * Get Node.js version
 * @param {Object} options - Options object with logging
 * @returns {string} - Node.js version or "未安装"
 */
function getNodeVersion(options = {}) {
	const version = executeCommand('node --version', options);
	if (version) {
		// Node version output format: "v20.10.0"
		const match = version.match(/v?(\d+\.\d+\.\d+)/);
		return match ? match[1] : version.trim();
	}
	return '未安装';
}

/**
 * Get npm version
 * @param {Object} options - Options object with logging
 * @returns {string} - npm version or "未安装"
 */
function getNpmVersion(options = {}) {
	const version = executeCommand('npm --version', options);
	if (version) {
		// npm version output format: "10.2.3"
		const match = version.match(/(\d+\.\d+\.\d+)/);
		return match ? match[1] : version.trim();
	}
	return '未安装';
}

/**
 * Get local IP address
 * @returns {string} - Local IP address or "无法获取"
 */
function getLocalIP() {
	try {
		const interfaces = os.networkInterfaces();
		
		// 按优先级查找网络接口
		const priorityInterfaces = [
			'以太网', 'Ethernet', 'eth0', 'en0', 'en1',  // 有线网络
			'WLAN', 'Wi-Fi', 'wlan0', 'wifi0',          // 无线网络
			'本地连接', 'Local Area Connection'          // Windows本地连接
		];
		
		// 首先尝试优先级接口
		for (const priority of priorityInterfaces) {
			if (interfaces[priority]) {
				for (const iface of interfaces[priority]) {
					if (iface.family === 'IPv4' && !iface.internal) {
						return iface.address;
					}
				}
			}
		}
		
		// 如果优先级接口没找到，遍历所有接口
		for (const name of Object.keys(interfaces)) {
			// 跳过虚拟网络接口
			if (name.toLowerCase().includes('virtual') || 
				name.toLowerCase().includes('veth') || 
				name.toLowerCase().includes('docker') || 
				name.toLowerCase().includes('vmware') ||
				name.toLowerCase().includes('virtualbox')) {
				continue;
			}
			
			for (const iface of interfaces[name]) {
				if (iface.family === 'IPv4' && !iface.internal) {
					return iface.address;
				}
			}
		}
		
		return '无法获取';
	} catch (error) {
		return '无法获取';
	}
}

/**
 * Get public IP address
 * @param {Object} options - Options object with logging
 * @returns {Promise<string>} - Public IP address or "无法获取"
 */
async function getPublicIP(options = {}) {
	const log = options.mcpLog || console;
	
	// 多个IP检测服务，提高可靠性
	const services = [
		'https://api.ipify.org',
		'https://ipv4.icanhazip.com',
		'https://api.ip.sb/ip',
		'https://ifconfig.me/ip'
	];
	
	for (const service of services) {
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 3000); // 3秒超时
			
			const response = await fetch(service, {
				signal: controller.signal,
				headers: {
					'User-Agent': 'TaskMaster-SystemInfo/1.0'
				}
			});
			
			clearTimeout(timeoutId);
			
			if (response.ok) {
				const ip = await response.text();
				const cleanIP = ip.trim();
				
				// 验证IP格式
				if (/^\d+\.\d+\.\d+\.\d+$/.test(cleanIP)) {
					log.debug && log.debug(`Public IP obtained from ${service}: ${cleanIP}`);
					return cleanIP;
				}
			}
		} catch (error) {
			log.debug && log.debug(`Failed to get IP from ${service}: ${error.message}`);
			continue;
		}
	}
	
	return '无法获取';
}

/**
 * Detect terminal type
 * @returns {string} - Terminal type in Chinese
 */
function getTerminalType() {
	const env = process.env;
	
	// 检查PATH中的编辑器路径（最可靠的方法）
	if (env.PATH) {
		const pathStr = env.PATH.toLowerCase();
		if (pathStr.includes('cursor')) {
			return 'Cursor';
		}
		if (pathStr.includes('windsurf')) {
			return 'Windsurf';
		}
		if (pathStr.includes('vscode') || pathStr.includes('code')) {
			return 'VS Code';
		}
	}
	
	// 检查Cursor特定环境变量
	if (env.CURSOR_SESSION_ID || env.CURSOR_USER_ID || env.TERM_PROGRAM === 'Cursor') {
		return 'Cursor';
	}
	
	// 检查VS Code环境变量
	if (env.VSCODE_PID || env.VSCODE_CWD || env.TERM_PROGRAM === 'vscode' || env.VSCODE_INJECTION === '1') {
		return 'VS Code';
	}
	
	// 检查Windsurf环境变量
	if (env.WINDSURF_SESSION_ID || env.CODEIUM_API_KEY) {
		return 'Windsurf';
	}
	
	// 检查常见的IDE和编辑器环境变量
	if (env.JETBRAINS_IDE) {
		return 'JetBrains IDE';
	}
	
	// 检查命令行工具
	if (env.TERM_PROGRAM) {
		const termPrograms = {
			'iTerm.app': 'iTerm2',
			'Terminal.app': 'Terminal (macOS)',
			'Windows Terminal': 'Windows Terminal',
			'WindowsTerminal': 'Windows Terminal',
			'Hyper': 'Hyper',
			'Alacritty': 'Alacritty',
			'tmux': 'tmux',
			'screen': 'GNU Screen'
		};
		if (termPrograms[env.TERM_PROGRAM]) {
			return termPrograms[env.TERM_PROGRAM];
		}
	}
	
	// 检查PowerShell和命令提示符
	if (env.PROMPT || env.PSMODULEPATH) {
		if (env.PSMODULEPATH) {
			return 'PowerShell';
		}
		return 'Command Prompt';
	}
	
	// 检查其他终端标识
	if (env.TERM) {
		if (env.TERM.includes('xterm')) {
			return 'XTerm';
		}
		if (env.TERM.includes('screen')) {
			return 'GNU Screen';
		}
		if (env.TERM.includes('tmux')) {
			return 'tmux';
		}
	}
	
	// 如果有TERM_PROGRAM但不在已知列表中
	if (env.TERM_PROGRAM) {
		return env.TERM_PROGRAM;
	}
	
	return '未知终端';
}

/**
 * Check if running in WSL environment
 * @param {Object} options - Options object with logging
 * @returns {boolean} - True if WSL environment
 */
function isWSLEnvironment(options = {}) {
	const log = options.mcpLog || console;
	
	try {
		// Check /proc/version for Microsoft or WSL
		if (fs.existsSync('/proc/version')) {
			const versionInfo = fs.readFileSync('/proc/version', 'utf-8');
			if (versionInfo.includes('Microsoft') || versionInfo.includes('WSL')) {
				return true;
			}
		}
		
		// Check environment variables
		if (process.env.WSL_DISTRO_NAME || process.env.WSLENV) {
			return true;
		}
		
		return false;
	} catch (error) {
		log.debug && log.debug(`WSL detection failed: ${error.message}`);
		return false;
	}
}

/**
 * Check if running in remote environment
 * @returns {boolean} - True if remote environment
 */
function isRemoteEnvironment() {
	const env = process.env;
	
	// Check for common remote environment indicators
	if (env.SSH_CLIENT || env.SSH_TTY || env.SSH_CONNECTION) {
		return true;
	}
	
	// Check for GitHub Codespaces
	if (env.CODESPACES) {
		return true;
	}
	
	// Check for Gitpod
	if (env.GITPOD_WORKSPACE_ID) {
		return true;
	}
	
	// Check for VS Code remote development
	if (env.VSCODE_REMOTE_CONTAINERS_SESSION || env.REMOTE_CONTAINERS) {
		return true;
	}
	
	return false;
}

/**
 * Main function to collect all system information
 * @param {Object} params - Parameters object
 * @param {Object} context - Context object with optional mcpLog
 * @param {string} outputFormat - Output format ('text' or 'json')
 * @returns {Object} - System information object
 */
export async function getSystemInfo(params = {}, context = {}, outputFormat = 'json') {
	const options = { mcpLog: context.mcpLog };
	
	// 获取本地IP（同步）
	const localIP = getLocalIP();
	
	// 获取公网IP（异步）
	const publicIP = await getPublicIP(options);
	
	const systemInfo = {
		'操作系统': getPlatformInfo(),
		'Python版本': getPythonVersion(options),
		'Node.js版本': getNodeVersion(options),
		'npm版本': getNpmVersion(options),
		'Go版本': getGoVersion(options),
		'JDK版本': getJDKVersion(options),
		'Maven版本': getMavenVersion(options),
		'Git版本': getGitVersion(options),
		'Docker版本': getDockerVersion(options),
		'本地IP': localIP,
		'公网IP': publicIP,
		'终端类型': getTerminalType(),
		'WSL环境': isWSLEnvironment(options),
		'远程环境': isRemoteEnvironment()
	};
	
	if (outputFormat === 'text') {
		// Display for CLI users
		console.log('\n=== 系统信息 ===');
		Object.entries(systemInfo).forEach(([key, value]) => {
			console.log(`${key}: ${value}`);
		});
		console.log('');
	}
	
	return {
		systemInfo,
		telemetryData: null // No AI calls in this function
	};
} 