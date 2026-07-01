import type { LLMConfig } from '@page-agent/llms'

// @note circular dependency but okay
// @注意 循环依赖，但没问题
import type { PageAgentCore } from './PageAgentCore'
import type { PageAgentTool } from './tools'

/** Supported UI languages */
/** 支持的 UI 语言 */
export type SupportedLanguage = 'en-US' | 'zh-CN'

export interface AgentConfig extends LLMConfig {
	language?: SupportedLanguage

	/**
	 * Maximum number of steps the agent can take per task.
	 * 代理在每个任务中可执行的最大步骤数。
	 * @default 40
	 */
	maxSteps?: number

	/**
	 * Custom tools to extend PageAgent capabilities
	 * 自定义工具以扩展 PageAgent 能力
	 * @experimental
	 * @note You can also override or remove internal tools by using the same name.
	 * @note 你也可以通过使用相同的名称来覆盖或移除内部工具。
	 * @see PageAgentTool
	 *
	 * @example
	 * // override internal tool
	 * // 覆盖内部工具
	 * import { z } from 'zod/v4'
	 * import { tool } from 'page-agent'
	 * const customTools = {
	 * ask_user: tool({
	 * 	description:
	 * 		'Ask the user or parent model a question and wait for their answer. Use this if you need more information or clarification.',
	 * 	inputSchema: z.object({
	 * 		question: z.string(),
	 * 	}),
	 * 	execute: async function (this: PageAgent, input) {
	 * 		const answer = await do_some_thing(input.question)
	 * 		return "✅ Received user answer: " + answer
	 * 	},
	 * })
	 * }
	 *
	 * @example
	 * // remove internal tool
	 * // 移除内部工具
	 * const customTools = {
	 * 	ask_user: null // never ask user questions
	 * 	// 永不询问用户问题
	 * }
	 */
	customTools?: Record<string, PageAgentTool | null>

	/**
	 * Instructions to guide the agent's behavior
	 * 用于指导代理行为的指令
	 */
	instructions?: {
		/**
		 * Global system-level instructions, applied to all tasks
		 * 全局系统级指令，应用于所有任务
		 */
		system?: string

		/**
		 * Dynamic page-level instructions callback
		 * 动态页面级指令回调
		 * Called before each step to get instructions for the current page
		 * 在每一步之前调用，以获取当前页面的指令
		 * @param url - Current page URL (window.location.href)
		 * @param url - 当前页面 URL (window.location.href)
		 * @returns Instructions string, or undefined/null to skip
		 * @returns 指令字符串，或 undefined/null 以跳过
		 */
		getPageInstructions?: (url: string) => string | undefined | null
	}

	/**
	 * Lifecycle hooks for task execution.
	 * 任务执行的生命周期钩子。
	 * @experimental API may change in future versions.
	 * @experimental API 可能在将来版本中变更。
	 *
	 * All hooks receive the agent instance as first parameter.
	 * 所有钩子都将代理实例作为第一个参数。
	 */

	/**
	 * Called before each step execution.
	 * 在每一步执行之前调用。
	 * @experimental
	 * @param agent - The PageAgentCore instance
	 * @param agent - PageAgentCore 实例
	 * @param stepCount - Current step number (0-indexed)
	 * @param stepCount - 当前步骤编号（从0开始）
	 */
	onBeforeStep?: (agent: PageAgentCore, stepCount: number) => Promise<void> | void

	/**
	 * Called after each step execution.
	 * 在每一步执行之后调用。
	 * @experimental
	 * @param agent - The PageAgentCore instance
	 * @param agent - PageAgentCore 实例
	 * @param history - Current history of events
	 * @param history - 当前事件历史
	 */
	onAfterStep?: (agent: PageAgentCore, history: HistoricalEvent[]) => Promise<void> | void

	/**
	 * Called before task execution starts.
	 * 在任务执行开始之前调用。
	 * @experimental
	 * @param agent - The PageAgentCore instance
	 * @param agent - PageAgentCore 实例
	 */
	onBeforeTask?: (agent: PageAgentCore) => Promise<void> | void

	/**
	 * Called after task execution completes (success or failure).
	 * 在任务执行完成（成功或失败）之后调用。
	 * @experimental
	 * @param agent - The PageAgentCore instance
	 * @param agent - PageAgentCore 实例
	 * @param result - The execution result
	 * @param result - 执行结果
	 */
	onAfterTask?: (agent: PageAgentCore, result: ExecutionResult) => Promise<void> | void

	/**
	 * Called when the agent is disposed.
	 * 在代理被销毁时调用。
	 * @experimental
	 * @note This hook can block the disposal process if it's async.
	 * @note 如果此钩子是异步的，它可能会阻塞销毁过程。
	 * @param agent - The PageAgentCore instance
	 * @param agent - PageAgentCore 实例
	 * @param reason - Optional reason for disposal
	 * @param reason - 可选的销毁原因
	 */
	onDispose?: (agent: PageAgentCore, reason?: string) => void

	// page behavior hooks
	// 页面行为钩子

	/**
	 * @experimental
	 * Enable the experimental script execution tool that allows executing generated JavaScript code on the page.
	 * 启用实验性的脚本执行工具，该工具允许在页面上执行生成的 JavaScript 代码。
	 * @note Can cause unpredictable side effects.
	 * @note 可能导致不可预见的副作用。
	 * @note May bypass some safe guards and data-masking mechanisms.
	 * @note 可能绕过某些安全防护和数据屏蔽机制。
	 */
	experimentalScriptExecutionTool?: boolean

	/**
	 * @experimental
	 * Fetch /llms.txt from current site origin and include as context.
	 * 从当前站点源获取 /llms.txt 并作为上下文包含。
	 * Only fetched once per origin per task.
	 * 每个任务每个源只获取一次。
	 * @default false
	 */
	experimentalLlmsTxt?: boolean

	/**
	 * Transform page content before sending to LLM.
	 * 在将页面内容发送给 LLM 之前进行转换。
	 * Called after DOM extraction and simplification, before LLM invocation.
	 * 在 DOM 提取和简化之后、LLM 调用之前调用。
	 * Use cases: inspect extraction results, modify page info, mask sensitive data.
	 * 使用场景：检查提取结果、修改页面信息、屏蔽敏感数据。
	 *
	 * @param content - Simplified page content that will be sent to LLM
	 * @param content - 将发送给 LLM 的简化页面内容
	 * @returns Transformed content
	 * @returns 转换后的内容
	 *
	 * @example
	 * // Mask phone numbers
	 * // 屏蔽手机号码
	 * transformPageContent: async (content) => {
	 *   return content.replace(/1[3-9]\d{9}/g, '***********')
	 * }
	 */
	transformPageContent?: (content: string) => Promise<string> | string

	/**
	 * Completely override the default system prompt.
	 * 完全覆盖默认系统提示。
	 * @experimental Use with caution - incorrect prompts may break agent behavior.
	 * @experimental 请谨慎使用 —— 不正确的提示可能破坏代理行为。
	 */
	customSystemPrompt?: string

	/**
	 * Delay between steps in seconds.
	 * 步骤之间的延迟（秒）。
	 * @default 0.4
	 */
	stepDelay?: number
}

/**
 * Agent reflection state - the reflection-before-action model
 * 代理反思状态 —— 反思-前置-行动模型
 *
 * Every tool call must first reflect on:
 * 每次工具调用必须首先反思以下内容：
 * - evaluation_previous_goal: How well did the previous action achieve its goal?
 * - evaluation_previous_goal: 上一个行动在多大程度上实现了其目标？
 * - memory: Key information to remember for future steps
 * - memory: 为未来步骤记住的关键信息
 * - next_goal: What should be accomplished in the next action?
 * - next_goal: 下一个行动应完成什么？
 */
export interface AgentReflection {
	evaluation_previous_goal: string
	memory: string
	next_goal: string
}

/**
 * MacroTool input structure
 * MacroTool 输入结构
 *
 * This is the core abstraction that enforces the "reflection-before-action" mental model.
 * 这是强制执行“反思-前置-行动”心智模型的核心抽象。
 * Before executing any action, the LLM must output its reasoning state.
 * 在执行任何操作之前，LLM 必须输出其推理状态。
 */
export interface MacroToolInput extends Partial<AgentReflection> {
	action: Record<string, any>
}

/**
 * MacroTool output structure
 * MacroTool 输出结构
 */
export interface MacroToolResult {
	input: MacroToolInput
	output: string
}

/**
 * A single agent step with reflection and action
 * 包含反思和行动的单个代理步骤
 */
export interface AgentStepEvent {
	type: 'step'
	stepIndex: number
	reflection: Partial<AgentReflection>
	action: {
		name: string
		input: any
		output: string
	}
	usage: {
		promptTokens: number
		completionTokens: number
		totalTokens: number
		cachedTokens?: number
		reasoningTokens?: number
	}
	/** Raw LLM response for debugging */
	/** 用于调试的原始 LLM 响应 */
	rawResponse?: unknown
	/** Raw LLM request for debugging */
	/** 用于调试的原始 LLM 请求 */
	rawRequest?: unknown
}

/**
 * Persistent observation event (stays in memory)
 * 持久观察事件（保留在内存中）
 */
export interface ObservationEvent {
	type: 'observation'
	content: string
}

/**
 * User takeover event
 * 用户接管事件
 */
export interface UserTakeoverEvent {
	type: 'user_takeover'
}

/**
 * Retry event - LLM call is being retried
 * 重试事件 —— LLM 调用正在重试
 */
export interface RetryEvent {
	type: 'retry'
	message: string
	attempt: number
	maxAttempts: number
}

/**
 * Error event - fatal error from LLM or execution
 * 错误事件 —— 来自 LLM 或执行的致命错误
 */
export interface AgentErrorEvent {
	type: 'error'
	message: string
	rawResponse?: unknown
}

/**
 * Union type for all history events
 * 所有历史事件的联合类型
 */
export type HistoricalEvent =
	| AgentStepEvent
	| ObservationEvent
	| UserTakeoverEvent
	| RetryEvent
	| AgentErrorEvent

/**
 * Agent lifecycle status.
 * 代理生命周期状态。
 */
export type AgentStatus = 'idle' | 'running' | 'completed' | 'error' | 'stopped'

/**
 * Agent activity - transient state for immediate UI feedback.
 * 代理活动 —— 用于即时 UI 反馈的瞬态状态。
 *
 * Unlike historical events (which are persisted), activities are ephemeral
 * and represent "what the agent is doing right now". UI components should
 * listen to 'activity' events to show real-time feedback.
 * 与历史事件（持久化）不同，活动是短暂的，表示“代理当前正在做什么”。
 * UI 组件应监听 'activity' 事件以显示实时反馈。
 *
 * Note: There is no 'idle' activity - absence of activity events means idle.
 * 注意：没有 'idle' 活动 —— 没有活动事件即表示空闲。
 */
export type AgentActivity =
	| { type: 'thinking' }
	| { type: 'executing'; tool: string; input: unknown }
	| { type: 'executed'; tool: string; input: unknown; output: string; duration: number }
	| { type: 'retrying'; attempt: number; maxAttempts: number }
	| { type: 'error'; message: string }

export interface ExecutionResult {
	success: boolean
	data: string
	history: HistoricalEvent[]
}