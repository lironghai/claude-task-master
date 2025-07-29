// Cursor conversion profile for rule-transformer
import { createProfile, COMMON_TOOL_MAPPINGS } from './base-profile.js';

// Create and export cursor profile using the base factory
export const cursorProfile = createProfile({
	name: 'cursor',
	displayName: 'Cursor',
	url: 'cursor.so',
	docsUrl: 'docs.cursor.com',
	targetExtension: '.mdc', // Cursor keeps .mdc extension
	supportsRulesSubdirectories: true,
    customFileMap: {
        // 'cursor_rules.mdc': 'cursor_rules.mdc' // Keep the same name for cursor
        'cursor_rules_cn.mdc': 'cursor_rules.mdc',
        'code-mr-review.mdc': 'code-mr-review.mdc',
        'code-refactoring.mdc': 'code-refactoring.mdc',
        'code-specification.mdc': 'code-specification.mdc',
        'control-command.mdc': 'control-command.mdc',
        'document-gen-design.md': 'document-gen-design.mdc',
        'document-gen-doc-check.md': 'document-gen-doc-check.mdc',
        'gen-code-from-doc-workflow.mdc': 'gen-code-from-doc-workflow.mdc',
        'git_push_devops.mdc': 'git_push_devops.mdc',
        'new-prd-workflow.mdc': 'new-prd-workflow.mdc',
        'project-class-doc-work.mdc': 'project-class-doc-work.mdc',
        'project-deployment-environment.mdc': 'project-deployment-environment.mdc',
        'project-outline-workflow.mdc': 'project-outline-workflow.mdc',
        'README.md': 'README.md',
        'rules-architecture.mermaid': 'rules-architecture.mermaid',
    }
});
