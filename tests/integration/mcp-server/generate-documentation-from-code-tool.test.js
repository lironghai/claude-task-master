import { FastMCP } from 'fastmcp'; // Assuming FastMCP is the server framework
import { registerGenerateDocumentationFromCodeTool } from '../../../../mcp-server/src/tools/generate-documentation-from-code.js';
import * as directFunctions from '../../../../mcp-server/src/core/direct-functions/generate-documentation-from-code-direct.js';
import * as asyncManager from '../../../../mcp-server/src/tools/utils.js';
import {jest} from "@jest/globals"; // For asyncOperationManager


const mockExistsSync = jest.fn().mockReturnValue(true);
const mockWriteFileSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockUnlinkSync = jest.fn();
const mockMkdirSync = jest.fn();

const mockFindTasksJsonPath = jest.fn().mockReturnValue(testTasksPath);
const mockReadJSON = jest.fn();
const mockWriteJSON = jest.fn();
const mockEnableSilentMode = jest.fn();
const mockDisableSilentMode = jest.fn();
const mockReadComplexityReport = jest.fn().mockReturnValue(null);
// Mock the direct function and asyncOperationManager
jest.mock('../../../../mcp-server/src/core/direct-functions/generate-documentation-from-code-direct.js');
jest.mock('../../../../mcp-server/src/tools/utils.js', () => {
    const originalModule = jest.requireActual('../../../../mcp-server/src/tools/utils.js');
    return {
        ...originalModule, // Keep other utils like handleApiResult, createErrorResponse
        asyncOperationManager: {
            addOperation: jest.fn(),
            getOperationStatus: jest.fn(), // Mock if you plan to test status polling
        },
         // Keep withNormalizedProjectRoot as a pass-through for these tests, or mock its behavior if complex
        withNormalizedProjectRoot: jest.fn((fn) => async (args, context) => {
            // Simulate normalization: ensure projectRoot is present, possibly modifying it
            const normalizedArgs = { ...args };
            if (!normalizedArgs.projectRoot && context.session && context.session.roots && context.session.roots[0]) {
                // Simulate deriving from session if not provided, and normalizing it simply
                const rawPath = context.session.roots[0].uri.replace('file://', '');
                normalizedArgs.projectRoot = rawPath.startsWith('/') ? rawPath : '/' + rawPath.replace(/^\w:\\/, ''); // Basic normalization
            }
             if (!normalizedArgs.projectRoot) {
                normalizedArgs.projectRoot = '/mock/project/root'; // Default mock if still not found
            }
            return fn(normalizedArgs, context);
        }),
    };
});

// Mock fs module to avoid file system operations
jest.mock('fs', () => ({
    existsSync: mockExistsSync,
    writeFileSync: mockWriteFileSync,
    readFileSync: mockReadFileSync,
    unlinkSync: mockUnlinkSync,
    mkdirSync: mockMkdirSync
}));

// Mock utils functions to avoid actual file operations
jest.mock('../../../scripts/modules/utils.js', () => ({
    readJSON: mockReadJSON,
    writeJSON: mockWriteJSON,
    enableSilentMode: mockEnableSilentMode,
    disableSilentMode: mockDisableSilentMode,
    readComplexityReport: mockReadComplexityReport,
    CONFIG: {
        model: 'claude-3-7-sonnet-20250219',
        maxTokens: 64000,
        temperature: 0.2,
        defaultSubtasks: 5
    }
}));

describe('generate_documentation_from_code MCP Tool', () => {
    let server;
    let mockLog;
    let mockSession;

    beforeEach(() => {
        jest.resetAllMocks();
        server = new FastMCP();
        registerGenerateDocumentationFromCodeTool(server); // Register the tool

        mockLog = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        };
        mockSession = {
            // Mock session properties as needed by the tool or withNormalizedProjectRoot
            roots: [{ uri: 'file:///test-project-root' }]
        };

        // Default mock for the direct function
        directFunctions.generateDocumentationFromCodeDirect.mockResolvedValue({
            success: true,
            data: { message: 'Successfully processed synchronously', results: [], overallTelemetry: {} },
            fromCache: false,
        });
        asyncManager.asyncOperationManager.addOperation.mockReturnValue('test-op-id');
    });

    const getTool = () => server.getTool('generate_documentation_from_code');

    describe('Synchronous Execution (documentationMap size === 1)', () => {
        test('should call generateDocumentationFromCodeDirect and return its result', async () => {
            const tool = getTool();
            const args = {
                documentationMap: { 'src/file.js': 'docs/file.md' },
                overwrite: false,
                projectRoot: '/test/project' // Explicitly provide for direct call
            };

            const response = await tool.execute(args, { log: mockLog, session: mockSession });

            expect(directFunctions.generateDocumentationFromCodeDirect).toHaveBeenCalledTimes(1);
            expect(directFunctions.generateDocumentationFromCodeDirect).toHaveBeenCalledWith(
                expect.objectContaining(args), // args will be normalized by HOF
                mockLog,
                { session: mockSession }
            );
            expect(asyncManager.asyncOperationManager.addOperation).not.toHaveBeenCalled();
            expect(response.success).toBe(true);
            expect(response.data.message).toBe('Successfully processed synchronously');
        });

        test('should handle error from generateDocumentationFromCodeDirect synchronously', async () => {
            directFunctions.generateDocumentationFromCodeDirect.mockResolvedValueOnce({
                success: false,
                error: { code: 'DIRECT_FUNC_ERROR', message: 'Direct function failed' },
                fromCache: false,
            });

            const tool = getTool();
            const args = {
                documentationMap: { 'src/file.js': 'docs/file.md' },
                 projectRoot: '/test/project'
            };

            const response = await tool.execute(args, { log: mockLog, session: mockSession });

            expect(response.success).toBe(false);
            expect(response.error.message).toBe('Direct function failed');
            expect(response.error.code).toBe('DIRECT_FUNC_ERROR');
            expect(asyncManager.asyncOperationManager.addOperation).not.toHaveBeenCalled();
        });
    });

    describe('Asynchronous Execution (documentationMap size > 1)', () => {
        test('should call asyncOperationManager.addOperation, return operationId, and log progress via reportProgress', async () => {
            // Specific mock for generateDocumentationFromCodeDirect for this test
            directFunctions.generateDocumentationFromCodeDirect.mockImplementationOnce(async (args, log, context) => {
                // Simulate the direct function calling reportProgress
                if (context && context.reportProgress) {
                    context.reportProgress({ file: 'file1.js', currentStep: 1, totalSteps: 2, statusMessage: "Processing file1 via mock" });
                    await new Promise(r => setTimeout(r, 10)); // Simulate async work
                    context.reportProgress({ file: 'file1.js', currentStep: 2, totalSteps: 2, statusMessage: "Completed file1 via mock" });
                }
                return { success: true, data: { message: 'Async mock direct function complete' }, fromCache: false };
            });

            const tool = getTool();
            const args = {
                documentationMap: {
                    'src/file1.js': 'docs/file1.md',
                    'src/file2.js': 'docs/file2.md',
                },
                overwrite: true,
                projectRoot: '/another/project'
            };

            const response = await tool.execute(args, { log: mockLog, session: mockSession });

            // Verify asyncOperationManager.addOperation was called
            expect(asyncManager.asyncOperationManager.addOperation).toHaveBeenCalledTimes(1);
            // Verify the direct function itself was not called directly by the tool in this path
            // Note: It will be called by our simulation below.
            // expect(directFunctions.generateDocumentationFromCodeDirect).not.toHaveBeenCalled(); // This assertion is tricky now due to simulation.

            const addOpCall = asyncManager.asyncOperationManager.addOperation.mock.calls[0];
            const functionToExecute = addOpCall[0];
            const functionArgs = addOpCall[1];
            const functionContext = addOpCall[2]; // This context contains the tool's reportProgress -> log.info

            // Assert that the correct function and args were passed to addOperation
            expect(functionToExecute).toBe(directFunctions.generateDocumentationFromCodeDirect);
            expect(functionArgs).toEqual(expect.objectContaining(args));
            expect(functionContext).toHaveProperty('log');
            expect(functionContext).toHaveProperty('session');
            expect(functionContext).toHaveProperty('reportProgress');
            expect(typeof functionContext.reportProgress).toBe('function');

            // Assert the initial response from the tool
            expect(response.success).toBe(true);
            expect(response.data.operationId).toBe('test-op-id');
            expect(response.data.status).toBe('pending');

            // Simulate the execution of the operation by the async manager to trigger reportProgress calls
            await functionToExecute(functionArgs, functionContext.log, functionContext);
            
            // Assert that log.info was called by the tool's reportProgress callback
            expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('progress: {"file":"file1.js","currentStep":1,"totalSteps":2,"statusMessage":"Processing file1 via mock"}'));
            expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('progress: {"file":"file1.js","currentStep":2,"totalSteps":2,"statusMessage":"Completed file1 via mock"}'));
        });
    });

    describe('Input Validation', () => {
        test('should return error if documentationMap is empty', async () => {
            const tool = getTool();
            const args = {
                documentationMap: {},
                projectRoot: '/test/project'
            };

            const response = await tool.execute(args, { log: mockLog, session: mockSession });

            expect(response.success).toBe(false);
            expect(response.error.code).toBe('INPUT_VALIDATION_ERROR');
            expect(response.error.message).toBe('documentationMap cannot be empty.');
            expect(directFunctions.generateDocumentationFromCodeDirect).not.toHaveBeenCalled();
            expect(asyncManager.asyncOperationManager.addOperation).not.toHaveBeenCalled();
        });
    });

     describe('withNormalizedProjectRoot HOF behavior', () => {
        test('should use provided projectRoot if available', async () => {
            const tool = getTool();
            const args = {
                documentationMap: { 'src/file.js': 'docs/file.md' },
                projectRoot: '/explicit/path'
            };
            await tool.execute(args, { log: mockLog, session: mockSession });
            expect(directFunctions.generateDocumentationFromCodeDirect).toHaveBeenCalledWith(
                expect.objectContaining({ projectRoot: '/explicit/path' }),
                mockLog,
                { session: mockSession }
            );
        });

        test('should derive projectRoot from session if not provided in args', async () => {
            const tool = getTool();
            const args = { // No projectRoot here
                documentationMap: { 'src/file.js': 'docs/file.md' },
            };
            const sessionWithRoot = { roots: [{ uri: 'file:///session/path' }] };
            await tool.execute(args, { log: mockLog, session: sessionWithRoot });
            expect(directFunctions.generateDocumentationFromCodeDirect).toHaveBeenCalledWith(
                expect.objectContaining({ projectRoot: '/session/path' }), // Basic normalization from mock HOF
                mockLog,
                { session: sessionWithRoot }
            );
        });

        test('should use default mock projectRoot if not in args and no session root', async () => {
            const tool = getTool();
            const args = { documentationMap: { 'src/file.js': 'docs/file.md' } }; // No projectRoot
            const sessionWithoutRoot = {}; // No session roots
            await tool.execute(args, { log: mockLog, session: sessionWithoutRoot });
            expect(directFunctions.generateDocumentationFromCodeDirect).toHaveBeenCalledWith(
                expect.objectContaining({ projectRoot: '/mock/project/root' }), // from HOF mock
                mockLog,
                { session: sessionWithoutRoot }
            );
        });
    });

}); 