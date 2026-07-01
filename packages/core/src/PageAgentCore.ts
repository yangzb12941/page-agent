/**
 * Copyright (C) 2025 Alibaba Group Holding Limited
 * 版权所有 (C) 2025 阿里巴巴集团控股有限公司
 * Copyright (C) 2026 SimonLuvRamen
 * 版权所有 (C) 2026 SimonLuvRamen
 * All rights reserved.
 * 保留所有权利。
 */
import { InvokeError, LLM, type Tool } from '@page-agent/llms'
import type { BrowserState, PageController } from '@page-agent/page-controller'
import chalk from 'chalk'
import * as z from 'zod/v4'

import SYSTEM_PROMPT from './prompts/system_prompt.md?raw'
import { tools } from './tools'
import type {
	AgentActivity,
	AgentConfig,
	AgentReflection,
	AgentStatus,
	AgentStepEvent,
	ExecutionResult,
	HistoricalEvent,
	MacroToolInput,
	MacroToolResult,
} from './types'
import { assert, fetchLlmsTxt, normalizeResponse, suppress, uid, waitFor } from './utils'

export { tool, type PageAgentTool } from './tools'
export type * from './types'

export type PageAgentCoreConfig = AgentConfig & { pageController: PageController }

/**
 * AI agent for browser automation.
 * 用于浏览器自动化的 AI 代理。
 *
 * @remarks
 * ## Re-act Agent Loop
 * ## Re-act 代理循环
 * - step
 * - 步骤
 *    - observe (gather information about current environment and context)
 *    - 观察（收集有关当前环境和上下文的信息）
 *    - think (LLM calling)
 *    - 思考（调用 LLM）
 *      - reflection (evaluate history, generate memory, short-term planning)
 *      - 反思（评估历史、生成记忆、短期规划）
 *      - action (give the action to approach the next goal)
 *      - 行动（给出接近下一个目标的操作）
 *    - act (execute the action)
 *    - 执行（执行操作）
 * - loop
 * - 循环
 *
 * ## Event System
 * ## 事件系统
 * - `statuschange` - Agent status transitions (idle → running → completed/error/stopped)
 * - `statuschange` - 代理状态转换（空闲 → 运行中 → 已完成/错误/已停止）
 * - `historychange` - History events updated (persistent, part of agent memory)
 * - `historychange` - 历史事件更新（持久化，属于代理记忆的一部分）
 * - `activity` - Real-time activity feedback (transient, for UI only)
 * - `activity` - 实时活动反馈（瞬态的，仅用于 UI）
 * - `dispose` - Agent cleanup triggered
 * - `dispose` - 触发代理清理
 *
 * ## Information Streams
 * ## 信息流
 * 1. **History Events** (`history` array)
 * 1. **历史事件**（`history` 数组）
 *    - Persistent event stream that forms agent's memory
 *    - 构成代理记忆的持久事件流
 *    - Included in LLM context across steps
 *    - 跨步骤包含在 LLM 上下文中
 *    - Types: steps, observations, user takeovers, llm errors
 *    - 类型：步骤、观察、用户接管、LLM 错误
 *
 * 2. **Activity Events** (via `activity` event)
 * 2. **活动事件**（通过 `activity` 事件）
 *    - Transient UI feedback during task execution
 *    - 任务执行期间的瞬时 UI 反馈
 *    - NOT included in LLM context
 *    - 不包含在 LLM 上下文中
 *    - Types: thinking, executing, executed, retrying, error
 *    - 类型：思考中、执行中、已执行、重试中、错误
 */
export class PageAgentCore extends EventTarget {
	readonly id = uid()
	readonly config: PageAgentCoreConfig & { maxSteps: number }
	readonly tools: typeof tools
	/** PageController for DOM operations */
	/** 用于 DOM 操作的 PageController */
	readonly pageController: PageController

	task = ''
	taskId = ''
	/** History events */
	/** 历史事件 */
	history: HistoricalEvent[] = []
	/** Whether this agent has been disposed */
	/** 此代理是否已被销毁 */
	disposed = false

	/**
	 * Called when the agent needs to ask the user questions.
	 * 当代理需要向用户提问时调用。
	 * If unset, the `ask_user` tool will be disabled.
	 * 如果未设置，`ask_user` 工具将被禁用。
	 * Implementations should reject the promise when `signal` aborts.
	 * 当 `signal` 中止时，实现应拒绝 promise。
	 * @example onAskUser: (q) => window.prompt(q) || ''
	 * @example onAskUser: (q) => window.prompt(q) || ''
	 */
	onAskUser?: (question: string, options?: { signal: AbortSignal }) => Promise<string>

	#status: AgentStatus = 'idle'
	#llm: LLM
	/**
	 * Task cancellation primitive: its signal reaches the LLM fetch, tools
	 * (via `ctx.signal`) and async callbacks. Aborted only by `stop`/`dispose`
	 * (during a task) or task setup, always WITHOUT a reason so `signal.reason`
	 * stays a standard `AbortError`.
	 * 任务取消基元：其信号到达 LLM 获取、工具（通过 `ctx.signal`）和异步回调。
	 * 仅在 `stop`/`dispose`（任务期间）或任务设置时中止，始终不带原因，因此 `signal.reason`
	 * 保持为标准 `AbortError`。
	 */
	#abortController = new AbortController()
	#observations: string[] = []

	/** Resolves when the current run has fully settled. Awaited by `stop()`. */
	/** 在当前运行完全结束时 resolve。由 `stop()` 等待。 */
	#running: Promise<void> = Promise.resolve()
	#lastResult: ExecutionResult | null = null

	/** internal states during a single task execution */
	/** 单次任务执行期间的内部状态 */
	#states = {
		/** Accumulated wait time in seconds */
		/** 累计等待时间（秒） */
		totalWaitTime: 0,
		/** For detecting navigation */
		/** 用于检测导航 */
		lastURL: '',
		/** Browser state */
		/** 浏览器状态 */
		browserState: null as BrowserState | null,
	}

	constructor(config: PageAgentCoreConfig) {
		super()

		this.config = { ...config, maxSteps: config.maxSteps ?? 40 }

		this.#llm = new LLM(this.config)
		this.tools = new Map(tools)
		this.pageController = config.pageController

		this.#llm.addEventListener('retry', (e) => {
			const { attempt, maxAttempts, lastError } = (e as CustomEvent).detail
			this.#emitActivity({ type: 'retrying', attempt, maxAttempts })
			this.history.push({
				type: 'error',
				message: String(lastError),
				rawResponse: (lastError as InvokeError).rawResponse,
			})
			this.history.push({
				type: 'retry',
				message: `LLM retry attempt ${attempt} of ${maxAttempts}`,
				attempt,
				maxAttempts,
			})
			this.#emitHistoryChange()
		})

		if (this.config.customTools) {
			for (const [name, tool] of Object.entries(this.config.customTools)) {
				if (tool === null) {
					this.tools.delete(name)
					continue
				}
				this.tools.set(name, tool)
			}
		}

		if (!this.config.experimentalScriptExecutionTool) {
			this.tools.delete('execute_javascript')
		}
	}

	/** Get current agent status */
	/** 获取当前代理状态 */
	get status(): AgentStatus {
		return this.#status
	}

	/** Result of the most recent run, or `null` before the first run completes. */
	/** 最近一次运行的结果，在第一次运行完成前为 `null`。 */
	get lastResult(): ExecutionResult | null {
		return this.#lastResult
	}

	/** Emit statuschange event */
	/** 触发 statuschange 事件 */
	#emitStatusChange(): void {
		this.dispatchEvent(new Event('statuschange'))
	}

	/** Emit historychange event */
	/** 触发 historychange 事件 */
	#emitHistoryChange(pushHistoricalEvent?: HistoricalEvent): void {
		if (pushHistoricalEvent) this.history.push(pushHistoricalEvent)
		this.dispatchEvent(new Event('historychange'))
	}

	/**
	 * Emit activity event - for transient UI feedback
	 * 触发 activity 事件 —— 用于瞬时 UI 反馈
	 * @param activity - Current agent activity
	 * @param activity - 当前代理活动
	 */
	#emitActivity(activity: AgentActivity): void {
		this.dispatchEvent(new CustomEvent('activity', { detail: activity }))
	}

	/** Update status and emit event */
	/** 更新状态并触发事件 */
	#setStatus(status: AgentStatus): void {
		if (this.#status !== status) {
			this.#status = status
			this.#emitStatusChange()
		}
	}

	/**
	 * Push an observation message to the history event stream.
	 * 将观察消息推入历史事件流。
	 * This will be visible in <agent_history> and remain persistent in memory across steps.
	 * 它将在 `<agent_history>` 中可见，并跨步骤持久保留在内存中。
	 * @experimental @internal
	 * @note history change will be emitted before next step starts
	 * @note 历史变更将在下一步开始前触发
	 */
	pushObservation(content: string): void {
		this.#observations.push(content)
	}

	/**
	 * Stop the current task and wait until the run has fully settled (including lifecycle hooks).
	 * 停止当前任务，并等待运行完全结束（包括生命周期钩子）。
	 * @note never await .stop() in a lifecycle hook.
	 * @note 切勿在生命周期钩子中 await .stop()。
	 */
	async stop(): Promise<void> {
		if (this.#status !== 'running') return
		this.#abortController.abort()
		await this.#running
	}

	/**
	 * external errors (pre-checks/config/hooks) will threw;
	 * 外部错误（预检查/配置/钩子）将抛出；
	 * agent errors will be caught and added to history, and return a failed result
	 * 代理错误将被捕获并添加到历史中，并返回失败结果
	 */
	async execute(task: string): Promise<ExecutionResult> {
		// pre-checks
		// 预检查
		if (this.disposed) throw new Error('PageAgent has been disposed. Create a new instance.')
		if (this.#status === 'running') throw new Error('A task is already running.')
		if (!task) throw new Error('Task is required')

		this.task = task
		this.taskId = uid()

		this.history = []
		this.#observations = []
		this.#states = { totalWaitTime: 0, lastURL: '', browserState: null }
		this.#abortController = new AbortController()
		const signal = this.#abortController.signal

		let resolveRunning!: () => void
		this.#running = new Promise<void>((r) => (resolveRunning = r))

		this.#setStatus('running')
		this.#emitHistoryChange()

		// Disable ask_user tool if onAskUser is not set
		// 如果未设置 onAskUser，则禁用 ask_user 工具
		if (!this.onAskUser) this.tools.delete('ask_user')

		const onBeforeStep = this.config.onBeforeStep
		const onAfterStep = this.config.onAfterStep
		const onBeforeTask = this.config.onBeforeTask
		const onAfterTask = this.config.onAfterTask
		const stepDelay = this.config.stepDelay ?? 0.4
		const maxSteps = this.config.maxSteps

		let step = 0
		let taskResult: ExecutionResult
		let finalStatus: AgentStatus = 'error'

		await suppress(() => this.pageController.showMask())

		// graceful exit
		// 正常退出
		try {
			await onBeforeTask?.(this)

			while (true) {
				await onBeforeStep?.(this, step)

				// handle internal agent errors
				// 处理内部代理错误
				try {
					console.group(`step: ${step}`)

					// @note It's convenient to treat stepDelay as part of the next step.
					// @note 将 stepDelay 视为下一步的一部分很方便。
					// Maybe move it to a dedicated try block for better semantics?
					// 或许将其移至专门的 try 块以获得更好的语义？
					if (step > 0) await waitFor(stepDelay, signal)

					signal.throwIfAborted()

					// observe
					// 观察

					console.log(chalk.blue.bold('👀 Observing...'))

					this.#states.browserState = await this.pageController.getBrowserState()
					await this.#handleObservations(step)

					// assemble prompts
					// 组装提示

					const messages = [
						{ role: 'system' as const, content: this.#getSystemPrompt() },
						{ role: 'user' as const, content: await this.#assembleUserPrompt() },
					]

					const macroTool = { AgentOutput: this.#packMacroTool() }

					// invoke LLM
					// 调用 LLM

					console.log(chalk.blue.bold('🧠 Thinking...'))
					this.#emitActivity({ type: 'thinking' })

					const result = await this.#llm.invoke(messages, macroTool, signal, {
						toolChoiceName: 'AgentOutput',
						normalizeResponse: (res) => normalizeResponse(res, this.tools),
					})

					// assemble history
					// 组装历史

					const macroResult = result.toolResult as MacroToolResult
					const input = macroResult.input
					const output = macroResult.output
					const reflection: Partial<AgentReflection> = {
						evaluation_previous_goal: input.evaluation_previous_goal,
						memory: input.memory,
						next_goal: input.next_goal,
					}
					const actionName = Object.keys(input.action)[0]
					const action: AgentStepEvent['action'] = {
						name: actionName,
						input: input.action[actionName],
						output: output,
					}

					this.#emitHistoryChange({
						type: 'step',
						stepIndex: step,
						reflection,
						action,
						usage: result.usage,
						rawResponse: result.rawResponse,
						rawRequest: result.rawRequest,
					})

					if (actionName === 'done') {
						const success = action.input?.success ?? false
						const data = action.input?.text || 'no text provided'
						console.log(chalk.green.bold('Task completed'), success, data)
						taskResult = { success, data, history: this.history }
						this.#lastResult = taskResult
						finalStatus = 'completed'
						break
					}
				} catch (error: unknown) {
					// catch block must not throw error. otherwise the error may be overridden if finally block also throws error.
					// catch 块不得抛出错误，否则如果 finally 块也抛出错误，错误可能被覆盖。

					const isAbortError = (error as any)?.name === 'AbortError'
					if (!isAbortError) console.error('Task failed', error)
					const message = isAbortError ? 'Task aborted' : String(error)
					this.#emitActivity({ type: 'error', message: message })
					this.#emitHistoryChange({ type: 'error', message: message, rawResponse: error })
					taskResult = { success: false, data: message, history: this.history }
					this.#lastResult = taskResult
					finalStatus = isAbortError ? 'stopped' : 'error'
					break
				} finally {
					// finally block runs before the break above.
					// finally 块在以上 break 之前运行。

					console.groupEnd()
					// @note hook may throw error.
					// @note 钩子可能抛出错误。
					// which will override the `break` above and be handled as an external error.
					// 这将覆盖上面的 `break`，并作为外部错误处理。
					// as expected.
					// 如预期。
					await onAfterStep?.(this, this.history)
				}

				step++
				if (step > maxSteps) {
					const message = 'Step count exceeded maximum limit'
					console.error(message)
					this.#emitActivity({ type: 'error', message: message })
					this.#emitHistoryChange({ type: 'error', message: message })
					taskResult = { success: false, data: message, history: this.history }
					this.#lastResult = taskResult
					finalStatus = 'error'
					break
				}
			} // while

			await onAfterTask?.(this, taskResult)

			return taskResult
		} catch (error) {
			this.#emitActivity({ type: 'error', message: String(error) })
			finalStatus = 'error'
			throw error
		} finally {
			await suppress(() => this.pageController.cleanUpHighlights())
			await suppress(() => this.pageController.hideMask())
			this.#abortController.abort()
			resolveRunning()
			this.#setStatus(finalStatus)
		}
	}

	/**
	 * Merge all tools into a single MacroTool with the following input:
	 * 将所有工具合并为一个 MacroTool，输入如下：
	 * - thinking: string
	 * - thinking: string
	 * - evaluation_previous_goal: string
	 * - evaluation_previous_goal: string
	 * - memory: string
	 * - memory: string
	 * - next_goal: string
	 * - next_goal: string
	 * - action: { toolName: toolInput }
	 * - action: { toolName: toolInput }
	 * where action must be selected from tools defined in this.tools
	 * 其中 action 必须从 this.tools 中定义的工具中选择
	 */
	#packMacroTool(): Tool<MacroToolInput, MacroToolResult> {
		const tools = this.tools

		const actionSchemas = Array.from(tools.entries()).map(([toolName, tool]) => {
			return z.object({ [toolName]: tool.inputSchema }).describe(tool.description)
		})

		const actionSchema = z.union(actionSchemas as unknown as [z.ZodType, z.ZodType, ...z.ZodType[]])

		const macroToolSchema = z.object({
			// thinking: z.string().optional(),
			evaluation_previous_goal: z.string().optional(),
			memory: z.string().optional(),
			next_goal: z.string().optional(),
			action: actionSchema,
		})

		return {
			description: 'You MUST call this tool every step!',
			// 你必须在每一步都调用此工具！
			inputSchema: macroToolSchema as z.ZodType<MacroToolInput>,
			execute: async (input: MacroToolInput): Promise<MacroToolResult> => {
				const signal = this.#abortController.signal
				signal.throwIfAborted()

				console.log(chalk.blue.bold('MacroTool input'), input)
				const action = input.action

				const toolName = Object.keys(action)[0]
				const toolInput = action[toolName]

				// Build reflection text, only include non-empty fields
				// 构建反思文本，仅包含非空字段
				const reflectionLines: string[] = []
				if (input.evaluation_previous_goal)
					reflectionLines.push(`✅: ${input.evaluation_previous_goal}`)
				if (input.memory) reflectionLines.push(`💾: ${input.memory}`)
				if (input.next_goal) reflectionLines.push(`🎯: ${input.next_goal}`)

				const reflectionText = reflectionLines.length > 0 ? reflectionLines.join('\n') : ''

				if (reflectionText) {
					console.log(reflectionText)
				}

				// Find the corresponding tool
				// 找到对应的工具
				const tool = tools.get(toolName)
				assert(tool, `Tool ${toolName} not found`)

				console.log(chalk.blue.bold(`Executing tool: ${toolName}`), toolInput)

				// Emit executing activity
				// 触发 executing 活动
				this.#emitActivity({ type: 'executing', tool: toolName, input: toolInput })

				const startTime = Date.now()

				const result = await tool.execute.bind(this)(toolInput, { signal })
				// Enforce abort even if the tool ignored the signal and resolved normally.
				// 即使工具忽略 signal 并正常 resolve，也强制中止。
				signal.throwIfAborted()

				const duration = Date.now() - startTime
				console.log(chalk.green.bold(`Tool (${toolName}) executed for ${duration}ms`), result)

				// Emit executed activity
				// 触发 executed 活动
				this.#emitActivity({
					type: 'executed',
					tool: toolName,
					input: toolInput,
					output: result,
					duration,
				})

				// counting wait time
				// 计算等待时间
				if (toolName === 'wait') {
					this.#states.totalWaitTime += toolInput?.seconds || 0
				} else {
					this.#states.totalWaitTime = 0
				}

				// Return structured result
				// 返回结构化结果
				return {
					input,
					output: result,
				}
			},
		}
	}

	/**
	 * Get system prompt, dynamically replace language settings based on configured language
	 * 获取系统提示，根据配置的语言动态替换语言设置
	 */
	#getSystemPrompt(): string {
		if (this.config.customSystemPrompt) {
			return this.config.customSystemPrompt
		}

		const targetLanguage = this.config.language === 'zh-CN' ? '中文' : 'English'
		const systemPrompt = SYSTEM_PROMPT.replace(
			/Default working language: \*\*.*?\*\*/,
			`Default working language: **${targetLanguage}**`
		)

		return systemPrompt
	}

	/**
	 * Get instructions from config
	 * 从配置中获取指令
	 */
	async #getInstructions(): Promise<string> {
		const { instructions, experimentalLlmsTxt } = this.config

		const systemInstructions = instructions?.system?.trim()
		let pageInstructions: string | undefined

		const url = this.#states.browserState?.url || ''
		if (instructions?.getPageInstructions && url) {
			try {
				pageInstructions = instructions.getPageInstructions(url)?.trim()
			} catch (error) {
				console.error(
					chalk.red('[PageAgent] Failed to execute getPageInstructions callback:'),
					error
				)
			}
		}

		const llmsTxt = experimentalLlmsTxt && url ? await fetchLlmsTxt(url) : undefined

		if (!systemInstructions && !pageInstructions && !llmsTxt) return ''

		let result = '<instructions>\n'

		if (systemInstructions) {
			result += `<system_instructions>\n${systemInstructions}\n</system_instructions>\n`
		}

		if (pageInstructions) {
			result += `<page_instructions>\n${pageInstructions}\n</page_instructions>\n`
		}

		if (llmsTxt) {
			result += `<llms_txt>\n${llmsTxt}\n</llms_txt>\n`
		}

		result += '</instructions>\n\n'

		return result
	}

	/**
	 * Generate system observations before each step
	 * 在每一步之前生成系统观察
	 * @todo loop detection
	 * @todo 循环检测
	 * @todo console error
	 * @todo 控制台错误
	 */
	async #handleObservations(step: number): Promise<void> {
		// Accumulated wait time warning
		// 累计等待时间警告
		if (this.#states.totalWaitTime >= 3) {
			this.pushObservation(
				`You have waited ${this.#states.totalWaitTime} seconds accumulatively. ` +
					`DO NOT wait any longer unless you have a good reason.`
			)
		}

		// Detect URL change
		// 检测 URL 变更
		const currentURL = this.#states.browserState?.url || ''
		if (currentURL !== this.#states.lastURL) {
			this.pushObservation(`Page navigated to → ${currentURL}`)
			this.#states.lastURL = currentURL
			await waitFor(0.5) // wait for page to stabilize
			// 等待页面稳定
		}

		// Remaining steps warning
		// 剩余步骤警告
		const remaining = this.config.maxSteps - step
		if (remaining === 5) {
			this.pushObservation(
				`⚠️ Only ${remaining} steps remaining. ` +
					`Consider wrapping up or calling done with partial results.`
			)
		} else if (remaining === 2) {
			this.pushObservation(
				`⚠️ Critical: Only ${remaining} steps left! You must finish the task or call done immediately.`
			)
		}

		// Push observations to history and emit
		// 将观察推入历史并触发事件
		if (this.#observations.length > 0) {
			for (const content of this.#observations) {
				this.history.push({ type: 'observation', content })
				console.log(chalk.cyan('Observation:'), content)
			}
			this.#observations = []
			this.#emitHistoryChange()
		}
	}

	async #assembleUserPrompt(): Promise<string> {
		const browserState = this.#states.browserState!

		let prompt = ''

		// <instructions> (optional)
		// <instructions> （可选）

		prompt += await this.#getInstructions()

		// <agent_state>
		//  - <user_request>
		//  - <step_info>
		// <agent_state>

		const stepCount = this.history.filter((e) => e.type === 'step').length

		prompt += '<agent_state>\n'
		prompt += '<user_request>\n'
		prompt += `${this.task}\n`
		prompt += '</user_request>\n'
		prompt += '<step_info>\n'
		prompt += `Step ${stepCount + 1} of ${this.config.maxSteps} max possible steps\n`
		prompt += `Current time: ${new Date().toLocaleString()}\n`
		prompt += '</step_info>\n'
		prompt += '</agent_state>\n\n'

		// <agent_history>
		//  - <step_N> for steps
		//  - <sys> for observations and system messages

		prompt += '<agent_history>\n'

		let stepIndex = 0
		for (const event of this.history) {
			if (event.type === 'step') {
				stepIndex++
				prompt += `<step_${stepIndex}>\n`
				prompt += `Evaluation of Previous Step: ${event.reflection.evaluation_previous_goal}\n`
				prompt += `Memory: ${event.reflection.memory}\n`
				prompt += `Next Goal: ${event.reflection.next_goal}\n`
				prompt += `Action Results: ${event.action.output}\n`
				prompt += `</step_${stepIndex}>\n`
			} else if (event.type === 'observation') {
				prompt += `<sys>${event.content}</sys>\n`
			} else if (event.type === 'user_takeover') {
				prompt += `<sys>User took over control and made changes to the page</sys>\n`
			} else if (event.type === 'error') {
				// Error events are mainly for panel rendering, not included in LLM context
				// 错误事件主要用于面板渲染，不包含在 LLM 上下文中
				// to avoid polluting the agent's reasoning with transient errors
				// 以避免瞬态错误污染代理的推理
			}
		}

		prompt += '</agent_history>\n\n'

		// <browser_state>

		let pageContent = browserState.content
		if (this.config.transformPageContent) {
			pageContent = await this.config.transformPageContent(pageContent)
		}

		prompt += '<browser_state>\n'
		prompt += browserState.header + '\n'
		prompt += pageContent + '\n'
		prompt += browserState.footer + '\n\n'
		prompt += '</browser_state>\n\n'

		return prompt
	}

	dispose() {
		console.log('Disposing PageAgent...')
		this.disposed = true
		this.pageController.dispose()
		// this.history = []
		this.#abortController.abort()

		// Emit dispose event for UI cleanup
		// 触发 dispose 事件以进行 UI 清理
		this.dispatchEvent(new Event('dispose'))

		this.config.onDispose?.(this)
	}
}