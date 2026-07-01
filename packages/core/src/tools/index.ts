/**
 * Internal tools for PageAgent.
 * PageAgent 内部工具。
 * @note Adapted from browser-use
 * @note 改编自 browser-use
 */
import * as z from 'zod/v4'

import type { PageAgentCore } from '../PageAgentCore'
import { waitFor } from '../utils'

/**
 * Per-invocation context passed to every tool execution.
 * 每次工具调用时传递的上下文。
 * Tools MUST honor `signal` to support cooperative cancellation.
 * 工具必须遵守 `signal` 以支持协作取消。
 */
export interface ToolContext {
	signal: AbortSignal
}

/**
 * Internal tool definition that has access to PageAgent `this` context
 * 可访问 PageAgent `this` 上下文的内部工具定义
 */
export interface PageAgentTool<TParams = any> {
	// name: string
	description: string
	inputSchema: z.ZodType<TParams>
	execute: (this: PageAgentCore, args: TParams, ctx: ToolContext) => Promise<string>
}

export function tool<TParams>(options: PageAgentTool<TParams>): PageAgentTool<TParams> {
	return options
}

/**
 * Internal tools for PageAgent.
 * PageAgent 的内部工具。
 * Note: Using any to allow different parameter types for each tool
 * 注意：使用 any 以允许每个工具有不同的参数类型
 */
export const tools = new Map<string, PageAgentTool>()

tools.set(
	'done',
	tool({
		description:
			'Complete task. Text is your final response to the user — keep it concise unless the user explicitly asks for detail.',
		// 完成任务。文本是你给用户的最终回复 —— 保持简洁，除非用户明确要求详细说明。
		inputSchema: z.object({
			text: z.string(),
			success: z.boolean().default(true),
		}),
		execute: async function (this: PageAgentCore, input) {
			// @note main loop will handle this one
			// @note 主循环将处理此操作
			return Promise.resolve('Task completed')
		},
	})
)

tools.set(
	'wait',
	tool({
		description: 'Wait for x seconds. Can be used to wait until the page or data is fully loaded.',
		// 等待 x 秒。可用于等待页面或数据完全加载。
		inputSchema: z.object({
			seconds: z.number().min(1).max(10).default(1),
		}),
		execute: async function (this: PageAgentCore, input, { signal }) {
			// try to subtract LLM calling time from the actual wait time
			// 尝试从实际等待时间中减去 LLM 调用时间
			const lastTimeUpdate = await this.pageController.getLastUpdateTime()
			const secondsSinceLastUpdate = (Date.now() - lastTimeUpdate) / 1000
			const actualWaitTime = Math.max(0, input.seconds - secondsSinceLastUpdate)
			console.log(`actualWaitTime: ${actualWaitTime} seconds`)
			await waitFor(actualWaitTime, signal)

			const waitedSeconds = (secondsSinceLastUpdate + actualWaitTime).toFixed(2)
			return `✅ Waited for ${waitedSeconds} seconds.`
		},
	})
)

tools.set(
	'ask_user',
	tool({
		description:
			'Ask the user a question and wait for their answer. Use this if you need more information or clarification.',
		// 向用户提问并等待回答。如果需要更多信息或澄清，请使用此工具。
		inputSchema: z.object({
			question: z.string(),
		}),
		execute: async function (this: PageAgentCore, input, { signal }) {
			if (!this.onAskUser) {
				throw new Error('ask_user tool requires onAskUser callback to be set')
			}
			const answer = await this.onAskUser(input.question, { signal })
			return `User answered: ${answer}`
		},
	})
)

tools.set(
	'click_element_by_index',
	tool({
		description: 'Click element by index',
		// 按索引点击元素
		inputSchema: z.object({
			index: z.int().min(0),
		}),
		execute: async function (this: PageAgentCore, input) {
			const result = await this.pageController.clickElement(input.index)
			return result.message
		},
	})
)

tools.set(
	'input_text',
	tool({
		description: 'Click and type text into an interactive input element',
		// 点击并在可交互输入元素中输入文本
		inputSchema: z.object({
			index: z.int().min(0),
			text: z.string(),
		}),
		execute: async function (this: PageAgentCore, input) {
			const result = await this.pageController.inputText(input.index, input.text)
			return result.message
		},
	})
)

tools.set(
	'select_dropdown_option',
	tool({
		description:
			'Select dropdown option for interactive element index by the text of the option you want to select',
		// 通过要选择的选项文本来为可交互元素索引选择下拉选项
		inputSchema: z.object({
			index: z.int().min(0),
			text: z.string(),
		}),
		execute: async function (this: PageAgentCore, input) {
			const result = await this.pageController.selectOption(input.index, input.text)
			return result.message
		},
	})
)

/**
 * @note Reference from browser-use
 * @note 参考自 browser-use
 */
tools.set(
	'scroll',
	tool({
		description:
			'Scroll vertically. Without index: scrolls the document. With index: scrolls the container at that index (or its nearest scrollable ancestor). Use index of a data-scrollable element to scroll a specific area.',
		// 垂直滚动。不带索引：滚动文档。带索引：滚动该索引处的容器（或最近的可滚动祖先）。使用 data-scrollable 元素的索引来滚动特定区域。
		inputSchema: z.object({
			down: z.boolean().default(true),
			num_pages: z.number().min(0).max(10).optional().default(0.1),
			pixels: z.number().int().min(0).optional(),
			index: z.number().int().min(0).optional(),
		}),
		execute: async function (this: PageAgentCore, input) {
			const result = await this.pageController.scroll({
				...input,
				numPages: input.num_pages,
			})
			return result.message
		},
	})
)

/**
 * @todo Tables need a dedicated parser to extract structured data. This tool is useless.
 * @todo 表格需要专门的解析器来提取结构化数据。此工具目前无用。
 */
tools.set(
	'scroll_horizontally',
	tool({
		description:
			'Scroll horizontally. Without index: scrolls the document. With index: scrolls the container at that index (or its nearest scrollable ancestor). Use index of a data-scrollable element to scroll a specific area.',
		// 水平滚动。不带索引：滚动文档。带索引：滚动该索引处的容器（或最近的可滚动祖先）。使用 data-scrollable 元素的索引来滚动特定区域。
		inputSchema: z.object({
			right: z.boolean().default(true),
			pixels: z.number().int().min(0),
			index: z.number().int().min(0).optional(),
		}),
		execute: async function (this: PageAgentCore, input) {
			const result = await this.pageController.scrollHorizontally(input)
			return result.message
		},
	})
)

tools.set(
	'execute_javascript',
	tool({
		description:
			'Execute JavaScript code on the current page. Supports async/await syntax. Use with caution! ' +
			'An `AbortSignal` named `signal` is available in scope: long-running async code MUST honor it ' +
			'(e.g. `await fetch(url, { signal })`, or `signal.throwIfAborted()` in loops)',
		// 在当前页面执行 JavaScript 代码。支持 async/await 语法。请谨慎使用！
		// 作用域中提供了一个名为 `signal` 的 `AbortSignal`：长时间运行的异步代码必须遵守它
		// （例如 `await fetch(url, { signal })`，或在循环中使用 `signal.throwIfAborted()`）
		inputSchema: z.object({
			script: z.string(),
		}),
		execute: async function (this: PageAgentCore, input, { signal }) {
			const result = await this.pageController.executeJavascript(input.script, signal)
			signal.throwIfAborted()
			return result.message
		},
	})
)

// @todo send_keys
// @todo 发送按键
// @todo upload_file
// @todo 上传文件
// @todo extract_structured_data
// @todo 提取结构化数据