# Task Master AI - Claude Code Integration Guide

## 关键文件和项目结构

### Core Files

- `.taskmaster/tasks/tasks.json` - Main task data file (auto-managed)
- `.taskmaster/tasks/*.txt` - Individual task files (auto-generated from tasks.json)

### Directory Structure

```
project/
├── .taskmaster/
│   ├── tasks/              # Task files directory
│   │   ├── tasks.json      # Main task database
│   │   ├── task-1.md      # Individual task files
│   │   └── task-2.md
│   ├── docs/              # Documentation directory
│   ├── reports/           # Analysis reports directory
│   │   └── task-complexity-report.json
│   ├── templates/         # Template files
│── rule/                   # 项目架构\开发规范
│   ├── xxx.md              # 当前项目的项目架构\开发规范与要求
│── CLAUDE.md            
└── TaskManager.md           # 任务管理MCP说明文档
```

## MCP Integration

### Essential MCP Tools

```javascript
help; // = shows available taskmaster commands
// Project setup
initialize_project; // = task-master init
parse_prd; // = task-master parse-prd

// Daily workflow
get_tasks; // = task-master list
next_task; // = task-master next
get_task; // = task-master show <id>
set_task_status; // = task-master set-status

// Task management
add_task; // = task-master add-task
expand_task; // = task-master expand
update_task; // = task-master update-task
update_subtask; // = task-master update-subtask
update; // = task-master update

// Analysis
analyze_project_complexity; // = task-master analyze-complexity
complexity_report; // = task-master complexity-report
```

## Claude Code Workflow Integration

### 标准开发工作流程

#### 1. 项目初始化

```
# Initialize Task Master
(tool) init 
```

#### 2. PRD 解析

```
# Create or obtain PRD, then parse it
(tool) parse-prd docs/prd.md
```
此阶段需要与用户反馈、确认，并确保任务准确性。
若任务已经存在，则可以使用带有--append标志的parse PRD解析另一个PRD（仅包含新信息！）。这将把生成的任务添加到现有的任务列表中。

#### 3. 分析任务复杂性

```
# Analyze complexity and expand tasks
(tool) analyze-complexity --research
```
此阶段需要与用户反馈、确认，并确保任务准确性。

#### 4. 分解复杂任务

```
# Analyze complexity and expand tasks
(tool) expand --all --research
```

#### 5. Daily Development Loop

```bash
# Start each session
(tool) next                           # Find next available task
(tool) show <id>                     # Review task details

# During implementation, check in code context into the tasks and subtasks
(tool) update-subtask --id=<id> --prompt="implementation notes..."

# Complete tasks
(tool) set-status --id=<id> --status=done
```

## Configuration & Setup

## 任务结构和ID

### 任务ID格式

- Main tasks: `1`, `2`, `3`, etc.
- Subtasks: `1.1`, `1.2`, `2.1`, etc.
- Sub-subtasks: `1.1.1`, `1.1.2`, etc.

### 任务状态

- `pending` - 准备工作
- `in-progress` - 目前正在进行中
- `done` - 已完成并验证
- `deferred` - 推迟
- `cancelled` - 不再需要
- `blocked` - 等待外部因素

### Task Fields

```json
{
  "id": "1.2",
  "title": "Implement user authentication",
  "description": "Set up JWT-based auth system",
  "status": "pending",
  "priority": "high",
  "dependencies": ["1.1"],
  "details": "Use bcrypt for hashing, JWT for tokens...",
  "testStrategy": "Unit tests for auth functions, integration tests for login flow",
  "subtasks": []
}
```

## 最佳实践

### 上下文管理

- Use `task-master show <id>` to pull specific task context when needed

### 迭代实现

1. `task-master <subtask id>`-了解需求
2. 探索代码库并计划实施
3. `task-master update-subtask --id=<id>--prompt=“详细计划”`-记录计划
4. `task-master set-status --id=<id>--status=in-progress`-开始工作
5. 按照记录的计划执行代码
6. `task-master update-subtask --id=<id>--prompt=“哪些有效/无效”`-记录进度
7. `task-master set-status --id=<id>--state=done `-完成任务


## 重要注意事项
### 研究模式
- 为基于研究的AI增强添加“--research”标志
- 提供更明智的任务创建和更新
- 建议用于复杂的技术任务

---