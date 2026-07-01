/**
 * Utility functions for LLM integration
 * LLM 集成工具函数
 */
import chalk from 'chalk'
import * as z from 'zod/v4'

import type { Tool } from './types'

const debug = console.debug.bind(console, chalk.gray('[LLM]'))

/**
 * Convert Zod schema to OpenAI tool format
 * 将 Zod 模式转换为 OpenAI 工具格式
 * Uses Zod 4 native z.toJSONSchema()
 * 使用 Zod 4 原生 z.toJSONSchema()
 */
export function zodToOpenAITool(name: string, tool: Tool) {
	return {
		type: 'function' as const,
		function: {
			name,
			description: tool.description,
			parameters: z.toJSONSchema(tool.inputSchema, { target: 'openapi-3.0' }),
		},
	}
}

/**
 * Patch model specific parameters
 * 修补模型特定参数
 * @note in-place modification
 * @note 原地修改
 */
export function modelPatch(body: Record<string, any>) {
	const model: string = body.model || ''
	if (!model) return body

	const modelName = normalizeModelName(model)

	if (modelName.startsWith('qwen')) {
		debug('Applying Qwen patch: use higher temperature for auto fixing')
		// 应用 Qwen 补丁：使用更高温度以自动修复
		body.temperature = Math.max(body.temperature || 0, 1.0)
		body.enable_thinking = false
	}

	if (modelName.startsWith('claude')) {
		debug('Applying Claude patch: disable thinking')
		// 应用 Claude 补丁：禁用思考
		body.thinking = { type: 'disabled' }

		// Convert tool_choice to Claude format
		// 将 tool_choice 转换为 Claude 格式
		if (body.tool_choice === 'required') {
			// 'required' -> { type: 'any' } (must call some tool)
			// 'required' -> { type: 'any' }（必须调用某个工具）
			debug('Applying Claude patch: convert tool_choice "required" to { type: "any" }')
			// 应用 Claude 补丁：将 tool_choice "required" 转换为 { type: "any" }
			body.tool_choice = { type: 'any' }
		} else if (body.tool_choice?.function?.name) {
			// { type: 'function', function: { name: '...' } } -> { type: 'tool', name: '...' }
			// { type: 'function', function: { name: '...' } } -> { type: 'tool', name: '...' }
			debug('Applying Claude patch: convert tool_choice format')
			// 应用 Claude 补丁：转换 tool_choice 格式
			body.tool_choice = { type: 'tool', name: body.tool_choice.function.name }
		}

		// TODO: Claude naming pattern has changed
		// TODO: Claude 命名模式已更改
		// needs proper handling
		// 需要正确处理
		if (
			modelName.startsWith('claude-opus-4-7') ||
			modelName.startsWith('claude-opus-47') ||
			modelName.startsWith('claude-opus-4-8') ||
			modelName.startsWith('claude-opus-48')
		) {
			debug('Applying Claude-4.7/4.8 patch: remove temperature')
			// 应用 Claude-4.7/4.8 补丁：移除 temperature
			delete body.temperature
		}
	}

	if (modelName.startsWith('grok')) {
		debug('Applying Grok patch: removing tool_choice')
		// 应用 Grok 补丁：移除 tool_choice
		delete body.tool_choice
		debug('Applying Grok patch: disable reasoning and thinking')
		// 应用 Grok 补丁：禁用推理和思考
		body.thinking = { type: 'disabled', effort: 'minimal' }
		body.reasoning = { enabled: false, effort: 'low' }
	}

	if (modelName.startsWith('gpt')) {
		debug('Applying GPT patch: set verbosity to low')
		// 应用 GPT 补丁：将 verbosity 设为 low
		body.verbosity = 'low'

		// *-chat-latest models don't support reasoning_effort — skip patches that set it
		// *-chat-latest 模型不支持 reasoning_effort —— 跳过设置它的补丁
		if (modelName.includes('chat-latest')) {
			debug('Omitting reasoning_effort and temperature for chat-latest')
			// 为 chat-latest 省略 reasoning_effort 和 temperature
			delete body.reasoning_effort
			delete body.temperature
		} else if (modelName.startsWith('gpt-52')) {
			debug('Applying GPT-52 patch: disable reasoning')
			// 应用 GPT-52 补丁：禁用推理
			body.reasoning_effort = 'none'
		} else if (modelName.startsWith('gpt-51')) {
			debug('Applying GPT-51 patch: disable reasoning')
			// 应用 GPT-51 补丁：禁用推理
			body.reasoning_effort = 'none'
		} else if (modelName.startsWith('gpt-54')) {
			debug('Applying GPT-5.4 patch: remove reasoning_effort')
			// 应用 GPT-5.4 补丁：移除 reasoning_effort
			delete body.reasoning_effort
		} else if (modelName.startsWith('gpt-55')) {
			debug('Applying GPT-5.4 patch: remove reasoning_effort and temperature')
			// 应用 GPT-5.4 补丁：移除 reasoning_effort 和 temperature
			delete body.reasoning_effort
			delete body.temperature
		} else if (modelName.startsWith('gpt-5-mini')) {
			debug('Applying GPT-5-mini patch: set reasoning effort to low, temperature to 1')
			// 应用 GPT-5-mini 补丁：将 reasoning effort 设为 low，temperature 设为 1
			body.reasoning_effort = 'low'
			body.temperature = 1
		} else if (modelName.startsWith('gpt-5')) {
			debug('Applying GPT-5 patch: set reasoning effort to low')
			// 应用 GPT-5 补丁：将 reasoning effort 设为 low
			body.reasoning_effort = 'low'
		}
	}

	if (modelName.startsWith('gemini')) {
		debug('Applying Gemini patch: set reasoning effort to minimal')
		// 应用 Gemini 补丁：将 reasoning effort 设为 minimal
		body.reasoning_effort = 'minimal'
	}

	if (modelName.startsWith('deepseek')) {
		debug('Applying DeepSeek patch: remove tool_choice')
		// 应用 DeepSeek 补丁：移除 tool_choice
		delete body.tool_choice
	}

	if (modelName.startsWith('minimax')) {
		debug('Applying MiniMax patch: clamp temperature to (0, 1]')
		// 应用 MiniMax 补丁：将 temperature 限制在 (0, 1] 范围内
		// MiniMax API rejects temperature = 0; clamp to a small positive value
		// MiniMax API 拒绝 temperature = 0；将其钳制为小的正值
		body.temperature = Math.max(body.temperature || 0, 0.01)
		if (body.temperature > 1) body.temperature = 1
		// MiniMax does not support parallel_tool_calls
		// MiniMax 不支持 parallel_tool_calls
		delete body.parallel_tool_calls
	}

	return body
}

/**
 * check if a given model ID fits a specific model name
 * 检查给定的模型 ID 是否匹配特定的模型名称
 *
 * @note
 * Different model providers may use different model IDs for the same model.
 * 不同的模型提供商可能对同一模型使用不同的模型 ID。
 * For example, openai's `gpt-5.2` may called:
 * 例如，openai 的 `gpt-5.2` 可能被称为：
 *
 * - `gpt-5.2-version`
 * - `gpt-5_2-date`
 * - `GPT-52-version-date`
 * - `openai/gpt-5.2-chat`
 *
 * They should be treated as the same model.
 * 它们应被视为同一个模型。
 * Normalize them to `gpt-52`
 * 将它们规范化为 `gpt-52`
 */
function normalizeModelName(modelName: string): string {
	let normalizedName = modelName.toLowerCase()

	// remove prefix before '/'
	// 移除 '/' 之前的前缀
	if (normalizedName.includes('/')) {
		normalizedName = normalizedName.split('/')[1]
	}

	// remove '_'
	// 移除 '_'
	normalizedName = normalizedName.replace(/_/g, '')

	// remove '.'
	// 移除 '.'
	normalizedName = normalizedName.replace(/\./g, '')

	return normalizedName
}