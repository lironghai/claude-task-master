import fs from 'fs';
import path from 'path';
import { generateCodeFromDocumentation } from '../../../../../scripts/modules/task-manager/generate-code-from-documentation.js';
import { generateTextService } from '../../../../../scripts/modules/ai-services-unified.js';
import { displayAiUsageSummary } from '../../../../../scripts/modules/ui.js';
import { findProjectRoot } from '../../../../../scripts/modules/utils.js';

// Mock dependencies
jest.mock('fs');
jest.mock('../../../../../scripts/modules/ai-services-unified.js');
jest.mock('../../../../../scripts/modules/ui.js');
jest.mock('../../../../../scripts/modules/utils.js');

const mockProjectRoot = '/mock/project';

describe('generateCodeFromDocumentation', () => {
    beforeEach(() => {
        // Reset mocks before each test
        fs.readFileSync.mockReset();
        fs.writeFileSync.mockReset();
        fs.existsSync.mockReset();
        fs.mkdirSync.mockReset();
        generateTextService.mockReset();
        displayAiUsageSummary.mockReset();
        findProjectRoot.mockReturnValue(mockProjectRoot);
    });

    it('should successfully generate code for a single mapping', async () => {
        const docPath = 'docs/spec.md';
        const codePath = 'src/implementation.js';
        const docContent = 'This is a_i specification.';
        const generatedCode = 'console.log("Hello AI!");';

        fs.readFileSync.mockReturnValue(docContent);
        fs.existsSync.mockReturnValue(false); // File does not exist, no overwrite issue
        generateTextService.mockResolvedValue({ 
            mainResult: generatedCode, 
            telemetryData: { cost: 0.01, tokens: 100 }
        });

        const args = {
            projectRoot: mockProjectRoot,
            codeGenerationMap: { [docPath]: codePath },
            overwrite: false,
        };
        const context = {
            session: null,
            reportProgress: jest.fn(),
            log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
            commandNameFromContext: 'test_command'
        };

        const result = await generateCodeFromDocumentation(args, context, 'json');

        expect(fs.readFileSync).toHaveBeenCalledWith(path.join(mockProjectRoot, docPath), 'utf-8');
        expect(generateTextService).toHaveBeenCalled();
        expect(fs.writeFileSync).toHaveBeenCalledWith(path.join(mockProjectRoot, codePath), generatedCode);
        expect(context.reportProgress).toHaveBeenCalledTimes(2); // once for starting, once for success
        expect(result.results).toHaveLength(1);
        expect(result.results[0]).toEqual(expect.objectContaining({
            document: docPath,
            codeFile: codePath,
            status: 'success',
        }));
        expect(result.overallTelemetry).toBeDefined();
    });

    it('should skip writing file if overwrite is false and file exists', async () => {
        const docPath = 'docs/feature.txt';
        const codePath = 'src/feature.py';
        const docContent = 'Feature description.';

        fs.readFileSync.mockReturnValue(docContent);
        fs.existsSync.mockReturnValue(true); // File EXISTS
        generateTextService.mockResolvedValue({ 
            mainResult: '# python code', 
            telemetryData: { cost: 0.005, tokens: 50 }
        });

        const args = {
            projectRoot: mockProjectRoot,
            codeGenerationMap: { [docPath]: codePath },
            overwrite: false, // Do NOT overwrite
        };
         const context = {
            session: null,
            reportProgress: jest.fn(),
            log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
            commandNameFromContext: 'test_command'
        };

        const result = await generateCodeFromDocumentation(args, context, 'json');

        expect(fs.writeFileSync).not.toHaveBeenCalled();
        expect(result.results[0].status).toBe('skipped_exists');
        expect(context.reportProgress).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped_exists' }));
    });

    it('should write file if overwrite is true and file exists', async () => {
        const docPath = 'docs/feature.txt';
        const codePath = 'src/feature.py';
        const docContent = 'Feature description.';
        const generatedCode = '# python code updated';

        fs.readFileSync.mockReturnValue(docContent);
        fs.existsSync.mockReturnValue(true); // File EXISTS
        generateTextService.mockResolvedValue({ 
            mainResult: generatedCode, 
            telemetryData: { cost: 0.005, tokens: 50 }
        });

        const args = {
            projectRoot: mockProjectRoot,
            codeGenerationMap: { [docPath]: codePath },
            overwrite: true, // DO overwrite
        };
        const context = {
            session: null,
            reportProgress: jest.fn(),
            log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
            commandNameFromContext: 'test_command'
        };

        const result = await generateCodeFromDocumentation(args, context, 'json');

        expect(fs.writeFileSync).toHaveBeenCalledWith(path.join(mockProjectRoot, codePath), generatedCode);
        expect(result.results[0].status).toBe('success');
        expect(context.reportProgress).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
    });

    it('should handle documentation file not found', async () => {
        const docPath = 'docs/nonexistent.md';
        const codePath = 'src/nothing.js';

        fs.readFileSync.mockImplementation(() => { 
            const error = new Error('File not found');
            error.code = 'ENOENT';
            throw error;
        });

        const args = {
            projectRoot: mockProjectRoot,
            codeGenerationMap: { [docPath]: codePath },
        };
        const context = {
            session: null,
            reportProgress: jest.fn(),
            log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
            commandNameFromContext: 'test_command'
        };

        const result = await generateCodeFromDocumentation(args, context, 'json');

        expect(generateTextService).not.toHaveBeenCalled();
        expect(fs.writeFileSync).not.toHaveBeenCalled();
        expect(result.results[0].status).toMatch('error_reading_doc');
        expect(context.reportProgress).toHaveBeenCalledWith(expect.objectContaining({ status: 'error_reading_doc' }));
    });

    it('should correctly pass targetLanguage and targetFramework to AI prompt', async () => {
        const docPath = 'docs/ui.spec';
        const codePath = 'src/ui.tsx';
        const docContent = 'UI specification';
        
        fs.readFileSync.mockReturnValue(docContent);
        generateTextService.mockResolvedValue({ mainResult: '<App />', telemetryData: {} });

        const args = {
            projectRoot: mockProjectRoot,
            codeGenerationMap: { [docPath]: codePath },
            targetLanguage: 'TypeScript',
            targetFramework: 'React',
        };
        const context = {
            session: null,
            reportProgress: jest.fn(),
            log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
            commandNameFromContext: 'test_command'
        };

        await generateCodeFromDocumentation(args, context, 'json');

        expect(generateTextService).toHaveBeenCalledWith(expect.objectContaining({
            prompt: expect.stringContaining('Please generate the code in TypeScript.')
        }));
        expect(generateTextService).toHaveBeenCalledWith(expect.objectContaining({
            prompt: expect.stringContaining('If applicable, use the React framework.')
        }));
    });

    it('should handle AI service error gracefully', async () => {
        const docPath = 'docs/complex.spec';
        const codePath = 'src/complex.js';
        fs.readFileSync.mockReturnValue('Very complex spec.');
        generateTextService.mockRejectedValue(new Error('AI blew up'));

        const args = {
            projectRoot: mockProjectRoot,
            codeGenerationMap: { [docPath]: codePath },
        };
       const context = {
            session: null,
            reportProgress: jest.fn(),
            log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
            commandNameFromContext: 'test_command'
        };

        const result = await generateCodeFromDocumentation(args, context, 'json');
        expect(result.results[0].status).toBe('error_ai_generation');
        expect(result.results[0].message).toContain('AI blew up');
        expect(context.reportProgress).toHaveBeenCalledWith(expect.objectContaining({ status: 'error_ai_generation' }));
    });
    
    it('should aggregate telemetry from multiple successful AI calls', async () => {
        fs.readFileSync.mockReturnValue('doc content');
        generateTextService
            .mockResolvedValueOnce({ mainResult: 'code1', telemetryData: { totalTokens: 100, totalCost: 0.01 } })
            .mockResolvedValueOnce({ mainResult: 'code2', telemetryData: { totalTokens: 150, totalCost: 0.015 } });

        const args = {
            projectRoot: mockProjectRoot,
            codeGenerationMap: {
                'doc1.md': 'code1.js',
                'doc2.md': 'code2.js',
            },
        };
        const context = {
            session: null,
            reportProgress: jest.fn(),
            log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
            commandNameFromContext: 'test_command'
        };

        const result = await generateCodeFromDocumentation(args, context, 'json');
        expect(result.overallTelemetry.totalFilesProcessed).toBe(2);
        expect(result.overallTelemetry.totalTokens).toBe(250);
        expect(result.overallTelemetry.totalCost).toBe(0.025);
    });

    it('should display AI usage summary via ui.js when outputFormat is text', async () => {
        fs.readFileSync.mockReturnValue('doc content');
        generateTextService.mockResolvedValue({ 
            mainResult: 'code', 
            telemetryData: { cost: 0.01, tokens: 100, modelUsed: 'test-model' }
        });

        const args = {
            projectRoot: mockProjectRoot,
            codeGenerationMap: { 'doc.md': 'code.js' },
        };
        const context = { /* ... */ }; 

        await generateCodeFromDocumentation(args, context, 'text'); // outputFormat is 'text'

        expect(displayAiUsageSummary).toHaveBeenCalledTimes(1); // Called once per file
        expect(displayAiUsageSummary).toHaveBeenCalledWith(
            expect.objectContaining({ cost: 0.01, tokens: 100 }), 
            'cli'
        );
    });

    it('should create output directory if it does not exist', async () => {
        const docPath = 'docs/spec.md';
        const codePath = 'newDir/newModule/implementation.js'; // nested path
        const docContent = 'Spec for new module.';
        const generatedCode = '// new module code';

        fs.readFileSync.mockReturnValue(docContent);
        fs.existsSync.mockImplementation(filePath => {
            if (filePath === path.join(mockProjectRoot, path.dirname(codePath))) {
                return false; // Directory does not exist
            }
            return false; // File does not exist
        });
        generateTextService.mockResolvedValue({ mainResult: generatedCode, telemetryData: {} });

        const args = {
            projectRoot: mockProjectRoot,
            codeGenerationMap: { [docPath]: codePath },
        };
        const context = {
            session: null,
            reportProgress: jest.fn(),
            log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
            commandNameFromContext: 'test_command'
        };

        await generateCodeFromDocumentation(args, context, 'json');

        expect(fs.mkdirSync).toHaveBeenCalledWith(path.join(mockProjectRoot, path.dirname(codePath)), { recursive: true });
        expect(fs.writeFileSync).toHaveBeenCalled();
    });

    // Add tests for projectOutlinePath
    it('should include project outline in prompt if projectOutlinePath is provided and valid', async () => {
        const docPath = 'docs/spec.md';
        const codePath = 'src/implementation.js';
        const docContent = 'This is a_i specification.';
        const outlineContent = 'Project XYZ using Node.js and Express.';
        const outlinePath = 'outline.md';
        const absoluteOutlinePath = path.join(mockProjectRoot, outlinePath);

        // Mock readFileSync for both doc and outline
        fs.readFileSync.mockImplementation((filePath) => {
            if (filePath === path.join(mockProjectRoot, docPath)) return docContent;
            if (filePath === absoluteOutlinePath) return outlineContent;
            return '';
        });
        // Mock existsSync for outline and output code file
        fs.existsSync.mockImplementation((filePath) => {
            if (filePath === absoluteOutlinePath) return true; // Outline exists
            if (filePath === path.join(mockProjectRoot, codePath)) return false; // Output doesn't exist
            return false;
        });
        generateTextService.mockResolvedValue({ mainResult: 'code', telemetryData: {} });

        const args = {
            projectRoot: mockProjectRoot,
            codeGenerationMap: { [docPath]: codePath },
            projectOutlinePath: outlinePath,
        };
        const context = {
            log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
            commandNameFromContext: 'test_command',
            reportProgress: jest.fn(),
        };

        await generateCodeFromDocumentation(args, context, 'json');

        expect(fs.readFileSync).toHaveBeenCalledWith(absoluteOutlinePath, 'utf-8');
        expect(generateTextService).toHaveBeenCalledWith(expect.objectContaining({
            prompt: expect.stringContaining(`Project Outline:\n\`\`\`markdown\n${outlineContent}\n\`\`\`\n\n---\n\n`)
        }));
        expect(generateTextService).toHaveBeenCalledWith(expect.objectContaining({
            prompt: expect.stringContaining(`Documentation File: ${docPath}`)
        }));
        expect(context.log.info).toHaveBeenCalledWith(expect.stringContaining('Successfully loaded project outline from'));
    });

    it('should NOT include project outline in prompt if projectOutlinePath is provided but file does not exist', async () => {
        const docPath = 'docs/spec.md';
        const codePath = 'src/implementation.js';
        const docContent = 'This is a_i specification.';
        const outlinePath = 'nonexistent_outline.md';
        const absoluteOutlinePath = path.join(mockProjectRoot, outlinePath);

        fs.readFileSync.mockReturnValue(docContent); // For the doc file
        fs.existsSync.mockImplementation((filePath) => {
            if (filePath === absoluteOutlinePath) return false; // Outline does NOT exist
            return false;
        });
        generateTextService.mockResolvedValue({ mainResult: 'code', telemetryData: {} });

        const args = {
            projectRoot: mockProjectRoot,
            codeGenerationMap: { [docPath]: codePath },
            projectOutlinePath: outlinePath,
        };
        const context = {
            log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
            commandNameFromContext: 'test_command',
            reportProgress: jest.fn(),
        };

        await generateCodeFromDocumentation(args, context, 'json');

        expect(generateTextService).toHaveBeenCalledWith(expect.objectContaining({
            prompt: expect.not.stringContaining('Project Outline:')
        }));
        expect(context.log.warn).toHaveBeenCalledWith(expect.stringContaining('Project outline file not found at'));
    });

    it('should NOT include project outline in prompt if projectOutlinePath is not provided', async () => {
        const docPath = 'docs/spec.md';
        const codePath = 'src/implementation.js';
        const docContent = 'This is a_i specification.';

        fs.readFileSync.mockReturnValue(docContent);
        generateTextService.mockResolvedValue({ mainResult: 'code', telemetryData: {} });

        const args = { // projectOutlinePath is omitted
            projectRoot: mockProjectRoot,
            codeGenerationMap: { [docPath]: codePath }, 
        };
        const context = {
            log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
            commandNameFromContext: 'test_command',
            reportProgress: jest.fn(),
        };

        await generateCodeFromDocumentation(args, context, 'json');

        expect(generateTextService).toHaveBeenCalledWith(expect.objectContaining({
            prompt: expect.not.stringContaining('Project Outline:')
        }));
    });
}); 