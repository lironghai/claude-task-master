import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';


// 检查是否为 Git 仓库
function isGitRepository(path) {
  return fs.existsSync(`${path}/.git`);
}

// 获取 Git 远程 URL
function getGitRemoteUrl(path) {
  try {
    return execSync('git remote -v', {
      cwd: path,
      stdio: ['pipe', 'pipe', 'ignore']
    }).toString().trim().split('\n')[0];
  } catch (e) {
    return '无法获取远程地址';
  }
}

// 获取当前分支
function getGitBranch(path) {
  try {
    return execSync('git branch --show-current', {
      cwd: path,
      stdio: ['pipe', 'pipe', 'ignore']
    }).toString().trim();
  } catch (e) {
    return '无法获取分支';
  }
}

function getSubdirectories(dirPath) {

  // 检查路径是否存在
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  // 检查是否为目录
  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) {
    return [];
  }

  try {
    const items = fs.readdirSync(dirPath);
    const subdirectories = items.filter(item => {
      const fullPath = path.join(dirPath, item);
      return fs.statSync(fullPath).isDirectory();
    });
    return subdirectories;
  } catch (error) {
    console.error('Error reading directory:', error);
  }

  return [];
}

/**
 * 克隆 Git 仓库
 * @param {string} repoUrl - 仓库地址
 * @param {string} targetDir - 目标目录
 * @param {Object} options - 克隆选项
 * @param {boolean} options.recursive - 是否递归克隆子模块
 * @param {string} options.branch - 指定分支
 * @param {boolean} options.depth - 浅克隆深度
 * @param {boolean} options.quiet - 静默模式
 * @returns {Promise<Object>}
 */
function gitClone(repoUrl, targetDir, options = {}) {
  return new Promise(async (resolve, reject) => {
    // 参数验证
    if (!repoUrl) {
      reject(new Error('仓库地址不能为空'));
      return;
    }

    if (!targetDir) {
      reject(new Error('目标目录不能为空'));
      return;
    }

    // 检查目标目录是否存在
    const absoluteTargetDir = path.resolve(targetDir);
    if (fs.existsSync(absoluteTargetDir)) {
      reject(new Error(`目标目录已存在: ${absoluteTargetDir}`));
      return;
    }

    // 确保父目录存在
    const parentDir = path.dirname(absoluteTargetDir);
    if (!fs.existsSync(parentDir)) {
      reject(new Error(`父目录不存在: ${parentDir}`));
      return;
    }

    // 构建命令参数
    const args = ['clone'];

    // 添加选项参数
    if (options.quiet) {
      args.push('--quiet');
    }

    if (options.recursive) {
      args.push('--recursive');
    }

    if (options.branch) {
      args.push('--branch', options.branch);
    }

    if (options.depth) {
      args.push('--depth', options.depth.toString());
    }

    args.push(repoUrl, absoluteTargetDir);

    console.log(`执行命令: git ${args.join(' ')}`);

    // 执行 git clone 命令
    const gitProcess = spawn('git', args, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdoutData = '';
    let stderrData = '';

    gitProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
      if (!options.quiet) {
        process.stdout.write(data);
      }
    });

    gitProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
      if (!options.quiet) {
        process.stderr.write(data);
      }
    });

    gitProcess.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          message: '仓库克隆成功',
          stdout: stdoutData,
          stderr: stderrData,
          targetDir: absoluteTargetDir
        });
      } else {
        reject(new Error(`git clone 进程退出，退出码: ${code}\n${stderrData}`));
      }
    });

    gitProcess.on('error', (error) => {
      reject(new Error(`启动 git 进程失败: ${error.message}`));
    });
  });
}


export {
  isGitRepository,
  getGitRemoteUrl,
  getGitBranch,
  getSubdirectories,
  gitClone
};