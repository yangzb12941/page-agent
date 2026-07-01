import { InvokeError, InvokeErrorTypes } from '@page-agent/llms'
import chalk from 'chalk'
import * as z from 'zod/v4'

import type { PageAgentTool } from '../tools'

const log = console.log.bind(console, chalk.yellow('[autoFixer]'))

/**
 * Normalize LLM response and fix common format issues.
 * 规范化 LLM 响应并修复常见格式问题。
 *
 * Handles:
 * 处理：
 * - No tool_calls but JSON in message.content (fallback)
 * - 没有 tool_calls 但 message.content 中有 JSON（回退处理）
 * - Model returns action name as tool call instead of AgentOutput
 * - 模型返回的操作名作为工具调用而非 AgentOutput
 * - Arguments wrapped as double JSON string
 * - 参数被包裹为双重 JSON 字符串
 * - Nested function call format
 * - 嵌套的函数调用格式
 * - Missing action field (fallback to wait)
 * - 缺少 action 字段（回退到 wait）
 * - Primitive action input for single-field tools (e.g. `{"click_element_by_index": 2}`)
 * - 单字段工具的原始 action 输入（例如 `{"click_element_by_index": 2}`）
 * - etc.
 * - 等等。
 */
export function normalizeResponse(response: any, tools?: Map<string, PageAgentTool>): any {
	let resolvedArguments: any

	const choice = (response as { choices?: Choice[] }).choices?.[0]
	if (!choice) throw new Error('No choices in response')
	// 响应中没有 choices

	const message = choice.message
	if (!message) throw new Error('No message in choice')
	// choice 中没有 message

	const toolCall = message.tool_calls?.[0]

	// fix level and location of arguments
	// 修复 arguments 的层级和位置

	if (toolCall?.function?.arguments) {
		resolvedArguments = safeJsonParse(toolCall.function.arguments)

		// case: sometimes the model only returns the action level
		// 情况：有时模型只返回 action 层级
		if (toolCall.function.name && toolCall.function.name !== 'AgentOutput') {
			log(`#1: fixing tool_call`)
			// 修复 tool_call
			resolvedArguments = { action: safeJsonParse(resolvedArguments) }
		}
	} else {
		// case: sometimes the model returns json in content instead of tool_calls
		// 情况：有时模型在 content 中返回 json 而不是 tool_calls
		if (message.content) {
			const content = message.content.trim()
			const jsonInContent = retrieveJsonFromString(content)
			if (jsonInContent) {
				resolvedArguments = safeJsonParse(jsonInContent)

				// case: sometimes the content json includes upper level wrapper
				// 情况：有时 content 中的 json 包含上层包装
				if (resolvedArguments?.name === 'AgentOutput') {
					log(`#2: fixing tool_call`)
					// 修复 tool_call
					resolvedArguments = safeJsonParse(resolvedArguments.arguments)
				}

				// case: sometimes even 2-levels of wrapping
				// 情况：有时甚至有两层包装
				if (resolvedArguments?.type === 'function') {
					log(`#3: fixing tool_call`)
					// 修复 tool_call
					resolvedArguments = safeJsonParse(resolvedArguments.function.arguments)
				}

				// case: and sometimes action level only
				// 情况：有时只有 action 层级
				// todo: needs better detection logic
				// todo: 需要更好的检测逻辑
				if (
					!resolvedArguments?.action &&
					!resolvedArguments?.evaluation_previous_goal &&
					!resolvedArguments?.memory &&
					!resolvedArguments?.next_goal &&
					!resolvedArguments?.thinking
				) {
					log(`#4: fixing tool_call`)
					// 修复 tool_call
					resolvedArguments = { action: safeJsonParse(resolvedArguments) }
				}
			} else {
				throw new Error('No tool_call and the message content does not contain valid JSON')
				// 没有 tool_call 且消息内容不包含有效的 JSON
			}
		} else {
			throw new Error('No tool_call nor message content is present')
			// 没有 tool_call 也没有消息内容
		}
	}

	// fix double stringified arguments
	// 修复双重字符串化的参数
	resolvedArguments = safeJsonParse(resolvedArguments)
	if (resolvedArguments.action) {
		resolvedArguments.action = safeJsonParse(resolvedArguments.action)
	}

	// validate and fix action input using tool schemas
	// 使用工具模式验证并修复 action 输入
	if (resolvedArguments.action && tools) {
		resolvedArguments.action = validateAction(resolvedArguments.action, tools)
	}

	// fix incomplete formats
	// 修复不完整的格式
	if (!resolvedArguments.action) {
		log(`#5: fixing tool_call`)
		// 修复 tool_call
		resolvedArguments.action = { wait: { seconds: 1 } }
	}

	// pack back to standard format
	// 打包回标准格式
	return {
		...response,
		choices: [
			{
				...choice,
				message: {
					...message,
					tool_calls: [
						{
							...(toolCall || {}),
							function: {
								...(toolCall?.function || {}),
								name: 'AgentOutput',
								arguments: JSON.stringify(resolvedArguments),
							},
						},
					],
				},
			},
		],
	}
}

/**
 * Validate action against tool schemas. Provides clear error messages
 * 根据工具模式验证 action。提供清晰的错误信息
 * instead of letting the union schema produce unreadable errors.
 * 而不是让联合模式产生难以阅读的错误。
 *
 * Also coerces primitive inputs for single-field tools:
 * 同时强制转换单字段工具的原始输入：
 * e.g. `{"click_element_by_index": 2}` → `{"click_element_by_index": {"index": 2}}`
 * 例如 `{"click_element_by_index": 2}` → `{"click_element_by_index": {"index": 2}}`
 */
function validateAction(action: any, tools: Map<string, PageAgentTool>): any {
	if (typeof action !== 'object' || action === null) return action

	const toolName = Object.keys(action)[0]
	if (!toolName) return action

	const tool = tools.get(toolName)
	if (!tool) {
		const available = Array.from(tools.keys()).join(', ')
		throw new InvokeError(
			InvokeErrorTypes.INVALID_TOOL_ARGS,
			`Unknown action "${toolName}". Available: ${available}`
			// 未知 action "${toolName}"。可用：${available}
		)
	}

	let value = action[toolName]
	const schema = tool.inputSchema

	// coerce primitive input for single-field tools
	// 强制转换单字段工具的原始输入
	if (schema instanceof z.ZodObject && value !== null && typeof value !== 'object') {
		const requiredKey = Object.keys(schema.shape).find(
			(k) => !(schema.shape as Record<string, z.ZodType>)[k].safeParse(undefined).success
		)
		if (requiredKey) {
			log(`coercing primitive action input for "${toolName}"`)
			// 为 "${toolName}" 强制转换原始 action 输入
			value = { [requiredKey]: value }
		}
	}

	const result = schema.safeParse(value)
	if (!result.success) {
		throw new InvokeError(
			InvokeErrorTypes.INVALID_TOOL_ARGS,
			`Invalid input for action "${toolName}": ${z.prettifyError(result.error)}`
			// action "${toolName}" 的输入无效：${z.prettifyError(result.error)}
		)
	}

	return { [toolName]: result.data }
}

/**
 * Safely parse JSON, return original input if not json.
 * 安全解析 JSON，如果不是 JSON 则返回原始输入。
 */
function safeJsonParse(input: any): any {
	if (typeof input === 'string') {
		try {
			return JSON.parse(input.trim())
		} catch {
			return input
		}
	}
	return input
}

/**
 * Extract and parse JSON from a string.
 * 从字符串中提取并解析 JSON。
 * - Treat content between the first `{` and the last `}` as JSON.
 * - 将第一个 `{` 和最后一个 `}` 之间的内容视为 JSON。
 * - Try to parse that content as JSON and return the parsed value (object/array/primitive) if successful, otherwise return null.
 * - 尝试将该内容解析为 JSON，如果成功则返回解析后的值（对象/数组/原始值），否则返回 null。
 */
function retrieveJsonFromString(str: string): any {
	try {
		const json = /({[\s\S]*})/.exec(str) ?? []
		if (json.length === 0) {
			return null
		}
		return JSON.parse(json[0]!)
	} catch {
		return null
	}
}

interface Choice {
	message?: {
		role?: 'assistant'
		content?: string
		tool_calls?: {
			id?: string
			type?: 'function'
			function?: {
				name?: string
				arguments?: string
			}
		}[]
	}
	index?: 0
	finish_reason?: 'tool_calls'
}