import { generateCodeFromDocumentationDirect } from '../../../../../mcp-server/src/core/direct-functions/generate-code-from-documentation-direct.js';
import { generateCodeFromDocumentation } from '../../../../../scripts/modules/code-generator/generate-code-from-documentation.js';
import { normalizeProjectRoot } from '../../../../../mcp-server/src/core/utils/path-utils.js'; // Mocked
import { createLogWrapper } from '../../../../../mcp-server/src/tools/utils.js'; // Mocked

// Mock core logic and utilities
jest.mock('../../../../../scripts/modules/code-generator/generate-code-from-documentation.js');
jest.mock('../../../../../mcp-server/src/core/utils/path-utils.js');
jest.mock('../../../../../mcp-server/src/tools/utils.js');

const mockProjectRoot = '/mock/project';
const mockNormalizedProjectRoot = '/normalized/mock/project';

describe('generateCodeFromDocumentationDirect', () => {
    let mockLog;
    let mockMcpLog;

    beforeEach(() => {
        generateCodeFromDocumentation.mockReset();
        normalizeProjectRoot.mockReset();
        createLogWrapper.mockReset();

        mockLog = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
        mockMcpLog = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
        createLogWrapper.mockReturnValue(mockMcpLog);
        normalizeProjectRoot.mockReturnValue(mockNormalizedProjectRoot);
    });

    it('should call core logic with correct parameters and return success', async () => {
        const args = {
            projectRoot: mockProjectRoot,
            codeGenerationMap: { 'doc.md': 'code.js' },
            overwrite: true,
            targetLanguage: 'JS',
            targetFramework: 'Node'
        };
        const mockCoreResult = {
            results: [{ status: 'success' }],
            overallTelemetry: { totalCost: 0.01 },
        };
        generateCodeFromDocumentation.mockResolvedValue(mockCoreResult);

        const context = { session: { /* mock session */ } };
        const result = await generateCodeFromDocumentationDirect(args, mockLog, context);

        expect(normalizeProjectRoot).toHaveBeenCalledWith(args.projectRoot, mockMcpLog);
        expect(createLogWrapper).toHaveBeenCalledWith(mockLog, 'GenCodeDirect');
        expect(generateCodeFromDocumentation).toHaveBeenCalledWith(
            {
                projectRoot: mockNormalizedProjectRoot,
                codeGenerationMap: args.codeGenerationMap,
                overwrite: args.overwrite,
                targetLanguage: args.targetLanguage,
                targetFramework: args.targetFramework,
                projectOutlinePath: args.projectOutlinePath,
            },
            {
                session: context.session,
                reportProgress: expect.any(Function),
                log: mockMcpLog,
                commandNameFromContext: 'mcp_generate_code_from_documentation',
            },
            'json'
        );
        expect(result).toEqual({
            success: true,
            data: {
                results: mockCoreResult.results,
                telemetryData: mockCoreResult.overallTelemetry,
            }
        });
    });

    it('should use default commandName if not provided in context', async () => {
        const args = { codeGenerationMap: { 'a.md': 'b.js'}, projectRoot: mockProjectRoot };
        generateCodeFromDocumentation.mockResolvedValue({ results: [], overallTelemetry: {} });
        
        await generateCodeFromDocumentationDirect(args, mockLog, {}); // Empty context

        expect(generateCodeFromDocumentation).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ commandNameFromContext: 'mcp_generate_code_from_documentation' }),
            'json'
        );
    });

    it('should handle missing projectRoot by attempting normalization (which might use session default)', async () => {
        const args = { 
            codeGenerationMap: { 'doc.md': 'code.js' },
            // projectRoot is missing
        };
        generateCodeFromDocumentation.mockResolvedValue({ results: [], overallTelemetry: {} });
        normalizeProjectRoot.mockReturnValueOnce('/session/default/project'); // Simulate default from session

        await generateCodeFromDocumentationDirect(args, mockLog, { session: {} });

        expect(normalizeProjectRoot).toHaveBeenCalledWith(undefined, {});
        expect(generateCodeFromDocumentation).toHaveBeenCalledWith(
            expect.objectContaining({ projectRoot: '/session/default/project' }),
            expect.anything(),
            'json'
        );
    });

    it('should return error if codeGenerationMap is missing', async () => {
        const args = { projectRoot: mockProjectRoot }; // codeGenerationMap is missing
        const context = { session: {} };

        const result = await generateCodeFromDocumentationDirect(args, mockLog, context);

        expect(generateCodeFromDocumentation).not.toHaveBeenCalled();
        expect(result).toEqual({
            success: false,
            error: 'Missing or empty required argument: codeGenerationMap.',
        });
        expect(mockMcpLog.error).toHaveBeenCalledWith(expect.stringContaining('[Direct:GenCode] Error: Missing or empty required argument: codeGenerationMap.'));
    });

    it('should return error if core logic throws an exception', async () => {
        const args = { 
            projectRoot: mockProjectRoot, 
            codeGenerationMap: { 'doc.md': 'code.js' } 
        };
        const coreError = new Error('Core logic failed!');
        generateCodeFromDocumentation.mockRejectedValue(coreError);

        const context = { session: {} };
        const result = await generateCodeFromDocumentationDirect(args, mockLog, context);

        expect(result).toEqual({
            success: false,
            error: 'Error in generateCodeFromDocumentation: Core logic failed!',
        });
        expect(mockMcpLog.error).toHaveBeenCalledWith(
            expect.stringContaining('Error executing generateCodeFromDocumentation'),
            coreError
        );
        expect(mockMcpLog.info).toHaveBeenCalledWith(
            expect.stringContaining('Progress: mcp_generate_code_from_documentation - File doc.md, Status: processing')
        );
    });

    it('should correctly pass projectOutlinePath to core logic', async () => {
        const args = {
            projectRoot: mockProjectRoot,
            codeGenerationMap: { 'doc.md': 'code.js' },
            projectOutlinePath: 'path/to/outline.md'
        };
        generateCodeFromDocumentation.mockResolvedValue({ results: [], overallTelemetry: {} });

        await generateCodeFromDocumentationDirect(args, mockLog, { session: {} });

        expect(generateCodeFromDocumentation).toHaveBeenCalledWith(
            expect.objectContaining({
                projectOutlinePath: 'path/to/outline.md'
            }),
            expect.anything(),
            'json'
        );
    });

}); 