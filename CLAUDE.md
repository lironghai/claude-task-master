# CLAUDE.md

# Claude Code Instructions

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Task Master is an AI-driven task management system designed for software development, particularly with Claude AI and code editors like Cursor. It provides both MCP (Model Context Protocol) server functionality and CLI tools for managing complex development projects through structured task hierarchies.

## Development Commands

### Core Development Commands
- `npm test` - Run Jest test suite
- `npm run test:watch` - Run tests in watch mode  
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:e2e` - Run end-to-end tests via bash script
- `npm run format` - Format code with Biome
- `npm run format-check` - Check code formatting
- `npm run mcp-server` - Start the MCP server for testing
- `npm run inspector` - Launch MCP inspector for debugging

### CLI Commands
- `node index.js init` - Initialize a new project
- `node scripts/dev.js <command>` - Run development tasks
- `task-master <command>` - If installed globally

## Architecture

### Core Structure
- **MCP Server** (`mcp-server/`) - Model Context Protocol server for AI integrations
- **CLI Scripts** (`scripts/`) - Command-line interface implementation  
- **AI Providers** (`src/ai-providers/`) - Multiple AI service integrations
- **Profiles** (`src/profiles/`) - Editor-specific configurations (Cursor, VS Code, etc.)
- **Task Management** (`scripts/modules/task-manager/`) - Core task manipulation logic

### Key Components

#### MCP Server Architecture
- **Entry Point**: `mcp-server/server.js` - Starts the FastMCP server
- **Core Logic**: `mcp-server/src/core/task-master-core.js` - Main task management engine
- **Tools**: `mcp-server/src/tools/` - MCP tool implementations (add-task, get-tasks, etc.)
- **Direct Functions**: `mcp-server/src/core/direct-functions/` - Internal functions callable by tools

#### AI Provider System
- **Base Provider**: `src/ai-providers/base-provider.js` - Abstract base class
- **Unified Service**: `scripts/modules/ai-services-unified.js` - Provider abstraction layer
- **Supported Providers**: Anthropic, OpenAI, Google, Perplexity, xAI, Ollama, OpenRouter, Azure, Bedrock
- **Claude Code Integration**: Custom SDK in `src/ai-providers/custom-sdk/claude-code/`

#### Task Structure
- **Tasks File**: `.taskmaster/tasks/tasks.json` - Main task storage (tagged contexts)
- **Configuration**: `.taskmaster/config.json` - Project configuration and model settings
- **Reports**: `.taskmaster/reports/` - Complexity analysis and other reports
- **Templates**: `.taskmaster/templates/` - Example PRD and other templates

### Editor Integration Profiles
The system supports multiple code editors through profile-specific configurations:
- **Cursor**: `.cursor/` directory with MCP config and rules
- **VS Code**: `.vscode/` directory support
- **Windsurf**: Windsurf-specific MCP configuration
- **Roo**: Roo.dev integration
- **Cline**: Claude integration for VS Code

## Key Workflows

### Task Management Flow
1. **Initialize** - `initialize_project` sets up `.taskmaster/` structure
2. **Parse PRD** - `parse_prd` converts requirements into structured tasks
3. **Expand Tasks** - `expand_task` breaks complex tasks into subtasks
4. **Update Progress** - `set_task_status` tracks completion
5. **Research** - `research` tool provides fresh AI-powered insights

### AI-Powered Features
- **Task Generation**: AI analyzes PRDs to create comprehensive task lists
- **Complexity Analysis**: `analyze_project_complexity` identifies tasks needing breakdown
- **Research Integration**: Fresh information retrieval beyond AI knowledge cutoff
- **Context-Aware Updates**: AI updates tasks based on changing requirements

### Tagged Task System
- **Multiple Contexts**: Support for separate task lists (branches, features, experiments)
- **Default Tag**: "master" tag for main development
- **Tag Operations**: Create, copy, rename, delete, and switch between contexts

## Configuration

### Environment Variables (API Keys Only)
```
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here  
GOOGLE_API_KEY=your_key_here
PERPLEXITY_API_KEY=your_key_here
XAI_API_KEY=your_key_here
OPENROUTER_API_KEY=your_key_here
MISTRAL_API_KEY=your_key_here
AZURE_OPENAI_API_KEY=your_key_here
OLLAMA_API_KEY=your_key_here
```

### Model Configuration
All AI model settings are managed in `.taskmaster/config.json`:
- **Main Model**: Primary AI for task operations
- **Research Model**: Specialized model for research queries  
- **Fallback Model**: Backup when primary fails
- Use `models` MCP tool or `task-master models` CLI to configure

## Testing

### Test Structure
- **Unit Tests**: `tests/unit/` - Individual component testing
- **Integration Tests**: `tests/integration/` - Cross-component functionality
- **E2E Tests**: `tests/e2e/` - End-to-end workflow testing
- **Fixtures**: `tests/fixtures/` and `tests/fixture/` - Test data

### Running Tests
- Tests use Jest with ES modules support
- Run `npm test` for full suite
- Use `npm run test:watch` during development
- Coverage reports available via `npm run test:coverage`

## Important Implementation Notes

### MCP vs CLI
- **MCP Tools**: Preferred for editor integrations (Cursor, VS Code)
- **CLI Commands**: Fallback and direct terminal usage
- Both interfaces share the same core logic in `task-master-core.js`

### AI Integration Patterns
- Always check for API keys before making AI calls
- Use research model for fresh information beyond training cutoff
- Implement fallback models for reliability
- Support custom models for Ollama and OpenRouter

### File Management
- Never manually edit `.taskmaster/config.json` - use provided tools
- Task files in `.taskmaster/tasks/` are auto-generated - edit via tools
- Use `generate` command to update individual task markdown files

### Security Considerations
- API keys stored in environment variables only
- No sensitive data in task files or configuration
- Commons Clause license - cannot sell the software itself but can build with it