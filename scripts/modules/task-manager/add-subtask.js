import path from 'path';

import { log, readJSON, writeJSON, getCurrentTag } from '../utils.js';
import { isTaskDependentOn } from '../task-manager.js';
import generateTaskFiles from './generate-task-files.js';

/**
 * Add a subtask to a parent task
 * @param {string} tasksPath - Path to the tasks.json file
 * @param {number|string} parentId - ID of the parent task
 * @param {number|string|null} existingTaskId - ID of an existing task to convert to subtask (optional)
 * @param {Object} newSubtaskData - Data for creating a new subtask (used if existingTaskId is null)
 * @param {boolean} generateFiles - Whether to regenerate task files after adding the subtask
 * @param {Object} context - Context object containing projectRoot and tag information
 * @param {string} context.projectRoot - Project root path
 * @param {string} context.tag - Tag for the task
 * @returns {Object} The newly created or converted subtask
 */
async function addSubtask(
	tasksPath,
	parentId,
	existingTaskId = null,
	newSubtaskData = null,
	generateFiles = false,
	context = {}
) {
	const { projectRoot, tag } = context;
	try {
		log('info', `Adding subtask to parent task ${parentId}...`);

		// Read the existing tasks with proper context
		const data = readJSON(tasksPath, projectRoot, tag);
		if (!data || !data.tasks) {
			throw new Error(`Invalid or missing tasks file at ${tasksPath}`);
		}

		// Convert parent ID to number
		const parentIdNum = parseInt(parentId, 10);

		// Find the parent task
		const parentTask = data.tasks.find((t) => t.id === parentIdNum);
		if (!parentTask) {
			throw new Error(`Parent task with ID ${parentIdNum} not found`);
		}

		// Initialize subtasks array if it doesn't exist
		if (!parentTask.subtasks) {
			parentTask.subtasks = [];
		}

		let newSubtask;

		// Case 1: Convert an existing task to a subtask
		if (existingTaskId !== null) {
			const existingTaskIdNum = parseInt(existingTaskId, 10);

			// Find the existing task
			const existingTaskIndex = data.tasks.findIndex(
				(t) => t.id === existingTaskIdNum
			);
			if (existingTaskIndex === -1) {
				throw new Error(`Task with ID ${existingTaskIdNum} not found`);
			}

			const existingTask = data.tasks[existingTaskIndex];

			// Check if task is already a subtask
			if (existingTask.parentTaskId) {
				throw new Error(
					`Task ${existingTaskIdNum} is already a subtask of task ${existingTask.parentTaskId}`
				);
			}

			// Check for circular dependency
			if (existingTaskIdNum === parentIdNum) {
				throw new Error(`Cannot make a task a subtask of itself`);
			}

			// Check if parent task is a subtask of the task we're converting
			// This would create a circular dependency
			if (isTaskDependentOn(data.tasks, parentTask, existingTaskIdNum)) {
				throw new Error(
					`Cannot create circular dependency: task ${parentIdNum} is already a subtask or dependent of task ${existingTaskIdNum}`
				);
			}

			// Find the highest subtask ID to determine the next ID
			const highestSubtaskId =
				parentTask.subtasks.length > 0
					? Math.max(...parentTask.subtasks.map((st) => st.id))
					: 0;
			const newSubtaskId = highestSubtaskId + 1;

			// Clone the existing task to be converted to a subtask
			newSubtask = {
				...existingTask,
				id: newSubtaskId,
				parentTaskId: parentIdNum
			};

			// Add to parent's subtasks
			parentTask.subtasks.push(newSubtask);

			// Remove the task from the main tasks array
			data.tasks.splice(existingTaskIndex, 1);

			log(
				'info',
				`Converted task ${existingTaskIdNum} to subtask ${parentIdNum}.${newSubtaskId}`
			);
		}
		// Case 2: Create a new subtask
		else if (newSubtaskData) {
			// Find the highest subtask ID to determine the next ID
			const highestSubtaskId =
				parentTask.subtasks.length > 0
					? Math.max(...parentTask.subtasks.map((st) => st.id))
					: 0;
			const newSubtaskId = highestSubtaskId + 1;

			// Create the new subtask object
			newSubtask = {
				id: newSubtaskId,
				title: newSubtaskData.title,
				description: newSubtaskData.description || '',
				details: newSubtaskData.details || '',
				status: newSubtaskData.status || 'pending',
				dependencies: newSubtaskData.dependencies || [],
				parentTaskId: parentIdNum
			};

			// Add to parent's subtasks
			parentTask.subtasks.push(newSubtask);

			log('info', `Created new subtask ${parentIdNum}.${newSubtaskId}`);
		} else {
			throw new Error(
				'Either existingTaskId or newSubtaskData must be provided'
			);
		}

		// Write the updated tasks back to the file with proper context
		writeJSON(tasksPath, data, projectRoot, tag);

		// Generate task files if requested
		if (generateFiles) {
			log('info', 'Regenerating task files...');
			await generateTaskFiles(tasksPath, path.dirname(tasksPath), context);
		}

		return newSubtask;
	} catch (error) {
		log('error', `Error adding subtask: ${error.message}`);
		throw error;
	}
}

export default addSubtask;
