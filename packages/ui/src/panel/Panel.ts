import { I18n, type SupportedLanguage } from '../i18n'
import { truncate } from '../utils'
import { createCard, createReflectionLines } from './cards'
import type { AgentActivity, PanelAgentAdapter } from './types'

import styles from './Panel.module.css'

/**
 * Panel configuration
 * Panel 配置
 */
export interface PanelConfig {
	language?: SupportedLanguage
	/**
	 * Whether to prompt for next task after task completion
	 * 任务完成后是否提示下一个任务
	 * @default true
	 */
	promptForNextTask?: boolean
}

/**
 * Agent control panel
 * 代理控制面板
 *
 * Architecture:
 * 架构：
 * - History list: renders directly from agent.history (historical events)
 * - 历史列表：直接从 agent.history 渲染（历史事件）
 * - Header bar: shows activity events (transient state) and agent status
 * - 标题栏：显示活动事件（瞬时状态）和代理状态
 *
 * This separation ensures data consistency - history is the single source of truth
 * for what has been done, while activity shows what is happening now.
 * 这种分离确保了数据一致性 - 历史是已完成事件的唯一真实来源，而活动则显示当前正在发生的事情。
 */
export class Panel {
	#wrapper: HTMLElement
	#indicator: HTMLElement
	#statusText: HTMLElement
	#historySection: HTMLElement
	#expandButton: HTMLElement
	#actionButton: HTMLElement
	#inputSection: HTMLElement
	#taskInput: HTMLInputElement

	#agent: PanelAgentAdapter
	#config: PanelConfig
	#isExpanded = false
	#i18n: I18n
	#userAnswerResolver: ((input: string) => void) | null = null
	#isWaitingForUserAnswer: boolean = false
	#headerUpdateTimer: ReturnType<typeof setInterval> | null = null
	#pendingHeaderText: string | null = null
	#isAnimating = false

	// Event handlers (bound for removal)
	// 事件处理器（绑定以便移除）
	#onStatusChange = () => this.#handleStatusChange()
	#onHistoryChange = () => this.#handleHistoryChange()
	#onActivity = (e: Event) => this.#handleActivity((e as CustomEvent<AgentActivity>).detail)
	#onAgentDispose = () => this.dispose()

	get wrapper(): HTMLElement {
		return this.#wrapper
	}

	/**
	 * Create a Panel bound to an agent
	 * 创建一个绑定到代理的面板
	 * @param agent - Agent instance that implements PanelAgentAdapter
	 * @param agent - 实现了 PanelAgentAdapter 的代理实例
	 * @param config - Optional panel configuration
	 * @param config - 可选的面板配置
	 */
	constructor(agent: PanelAgentAdapter, config: PanelConfig = {}) {
		this.#agent = agent
		this.#config = config
		this.#i18n = new I18n(config.language ?? 'en-US')

		// Set up askUser callback on agent
		// 在代理上设置 askUser 回调
		this.#agent.onAskUser = (question, options) => this.#askUser(question, options?.signal)

		// Create UI elements
		// 创建 UI 元素
		this.#wrapper = this.#createWrapper()
		this.#indicator = this.#wrapper.querySelector(`.${styles.indicator}`)!
		this.#statusText = this.#wrapper.querySelector(`.${styles.statusText}`)!
		this.#historySection = this.#wrapper.querySelector(`.${styles.historySection}`)!
		this.#expandButton = this.#wrapper.querySelector(`.${styles.expandButton}`)!
		this.#actionButton = this.#wrapper.querySelector(`.${styles.stopButton}`)!
		this.#inputSection = this.#wrapper.querySelector(`.${styles.inputSectionWrapper}`)!
		this.#taskInput = this.#wrapper.querySelector(`.${styles.taskInput}`)!

		// Listen to agent events
		// 监听代理事件
		this.#agent.addEventListener('statuschange', this.#onStatusChange)
		this.#agent.addEventListener('historychange', this.#onHistoryChange)
		this.#agent.addEventListener('activity', this.#onActivity)
		this.#agent.addEventListener('dispose', this.#onAgentDispose)

		this.#setupEventListeners()
		this.#startHeaderUpdateLoop()

		this.#showInputArea()

		this.hide() // Start hidden
		// 初始隐藏
	}

	// ========== Agent event handlers ==========
	// ========== 代理事件处理器 ==========

	/** Handle agent status change */
	/** 处理代理状态变更 */
	#handleStatusChange(): void {
		const status = this.#agent.status

		// Map agent status to UI indicator. A `completed` run whose result reports
		// failure shows as error; other statuses map to their own indicator.
		// 将代理状态映射到 UI 指示器。如果 `completed` 运行的结果报告失败，则显示为 error；
		// 其他状态映射到各自的指示器。
		const failed = status === 'completed' && this.#agent.lastResult?.success === false
		this.#updateStatusIndicator(failed ? 'error' : status)

		// Morph action button: running = stop (■), not running = close (X)
		// 操作按钮形态：运行中 = 停止（■），非运行 = 关闭（X）
		if (status === 'running') {
			this.#actionButton.textContent = '■'
			this.#actionButton.title = this.#i18n.t('ui.panel.stop')
		} else {
			this.#actionButton.textContent = 'X'
			this.#actionButton.title = this.#i18n.t('ui.panel.close')
		}

		// Show/hide based on status
		// 根据状态显示/隐藏
		if (status === 'running') {
			this.show()
			this.#hideInputArea() // Hide input while running
			// 运行中隐藏输入
		}

		// Handle completion
		// 处理完成
		if (status === 'completed' || status === 'error' || status === 'stopped') {
			if (!this.#isExpanded) {
				this.#expand()
			}
			if (this.#shouldShowInputArea()) {
				this.#showInputArea()
			}
		}
	}

	/** Handle agent history change - re-render history list from agent.history */
	/** 处理代理历史变更 - 从 agent.history 重新渲染历史列表 */
	#handleHistoryChange(): void {
		this.#renderHistory()
	}

	/**
	 * Handle agent activity - transient state for immediate UI feedback
	 * 处理代理活动 - 用于即时 UI 反馈的瞬时状态
	 * Activity events are NOT persisted in history, only used for header bar updates
	 * 活动事件不会持久化到历史中，仅用于标题栏更新
	 */
	#handleActivity(activity: AgentActivity): void {
		switch (activity.type) {
			case 'thinking':
				this.#pendingHeaderText = this.#i18n.t('ui.panel.thinking')
				this.#updateStatusIndicator('thinking')
				break

			case 'executing':
				this.#pendingHeaderText = this.#getToolExecutingText(activity.tool, activity.input)
				this.#updateStatusIndicator('executing')
				break

			case 'executed':
				this.#pendingHeaderText = truncate(activity.output, 50)
				break

			case 'retrying':
				this.#pendingHeaderText = `Retrying (${activity.attempt}/${activity.maxAttempts})`
				this.#updateStatusIndicator('retrying')
				break

			case 'error':
				this.#pendingHeaderText = truncate(activity.message, 50)
				this.#updateStatusIndicator('error')
				break
		}
	}

	/**
	 * Ask for user input (internal, called by agent via onAskUser).
	 * 询问用户输入（内部方法，由代理通过 onAskUser 调用）。
	 * Rejects when `signal` aborts (task stopped or disposed), cleaning up the
	 * question card and pending state so the agent loop can settle.
	 * 当 `signal` 中止（任务停止或销毁）时拒绝，清理问题卡片和待处理状态，
	 * 以便代理循环可以结束。
	 */
	#askUser(question: string, signal?: AbortSignal): Promise<string> {
		return new Promise((resolve, reject) => {
			// Set `waiting for user answer` state
			// 设置“等待用户回答”状态
			this.#isWaitingForUserAnswer = true
			this.#userAnswerResolver = resolve

			// Expand history panel
			// 展开历史面板
			if (!this.#isExpanded) {
				this.#expand()
			}

			// Add temporary question card so user can see the full question
			// 添加临时问题卡片，以便用户可以看到完整问题
			const tempCard = document.createElement('div')
			tempCard.innerHTML = createCard({
				icon: '❓',
				content: `Question: ${question}`,
				type: 'question',
			})
			const cardElement = tempCard.firstElementChild as HTMLElement
			cardElement.setAttribute('data-temp-card', 'true')
			this.#historySection.appendChild(cardElement)
			this.#scrollToBottom()

			this.#showInputArea(this.#i18n.t('ui.panel.userAnswerPrompt'))

			signal?.addEventListener(
				'abort',
				() => {
					this.#removeTempCards()
					this.#isWaitingForUserAnswer = false
					this.#userAnswerResolver = null
					// reason is a DOMException AbortError (abort() takes no args).
					// reason 是一个 DOMException AbortError（abort() 不接收参数）。
					reject(signal.reason as DOMException)
				},
				{ once: true }
			)
		})
	}

	/** Remove temporary question cards (only direct children for safety) */
	/** 移除临时问题卡片（为了安全仅移除直接子元素） */
	#removeTempCards(): void {
		Array.from(this.#historySection.children).forEach((child) => {
			if (child.getAttribute('data-temp-card') === 'true') {
				child.remove()
			}
		})
	}

	// ========== Public control methods ==========
	// ========== 公共控制方法 ==========

	show(): void {
		this.wrapper.style.display = 'block'
		void this.wrapper.offsetHeight
		this.wrapper.style.opacity = '1'
		this.wrapper.style.transform = 'translateX(-50%) translateY(0)'
	}

	hide(): void {
		this.wrapper.style.opacity = '0'
		this.wrapper.style.transform = 'translateX(-50%) translateY(20px)'
		this.wrapper.style.display = 'none'
	}

	reset(): void {
		this.#statusText.textContent = this.#i18n.t('ui.panel.ready')
		this.#updateStatusIndicator('thinking')
		this.#renderHistory()
		this.#collapse()
		// Reset user input state
		// 重置用户输入状态
		this.#isWaitingForUserAnswer = false
		this.#userAnswerResolver = null
		// Show input area
		// 显示输入区域
		this.#showInputArea()
	}

	expand(): void {
		this.#expand()
	}

	collapse(): void {
		this.#collapse()
	}

	/**
	 * Dispose panel and clean up event listeners
	 * 销毁面板并清理事件监听器
	 */
	dispose(): void {
		// Remove agent event listeners
		// 移除代理事件监听器
		this.#agent.removeEventListener('statuschange', this.#onStatusChange)
		this.#agent.removeEventListener('historychange', this.#onHistoryChange)
		this.#agent.removeEventListener('activity', this.#onActivity)
		this.#agent.removeEventListener('dispose', this.#onAgentDispose)

		// Clean up UI
		// 清理 UI
		this.#isWaitingForUserAnswer = false
		this.#stopHeaderUpdateLoop()
		this.wrapper.remove()
	}

	// ========== Private methods ==========
	// ========== 私有方法 ==========

	#getToolExecutingText(toolName: string, args: unknown): string {
		const a = args as Record<string, string | number>
		switch (toolName) {
			case 'click_element_by_index':
				return this.#i18n.t('ui.tools.clicking', { index: a.index })
			case 'input_text':
				return this.#i18n.t('ui.tools.inputting', { index: a.index })
			case 'select_dropdown_option':
				return this.#i18n.t('ui.tools.selecting', { text: a.text })
			case 'scroll':
				return this.#i18n.t('ui.tools.scrolling')
			case 'wait':
				return this.#i18n.t('ui.tools.waiting', { seconds: a.seconds })
			case 'ask_user':
				return this.#i18n.t('ui.tools.askingUser')
			case 'done':
				return this.#i18n.t('ui.tools.done')
			default:
				return this.#i18n.t('ui.tools.executing', { toolName })
		}
	}

	/**
	 * Action button handler: stop when running, close (dispose) when idle
	 * 操作按钮处理器：运行中停止，空闲时关闭（销毁）
	 */
	#handleActionButton(): void {
		if (this.#agent.status === 'running') {
			this.#agent.stop()
		} else {
			this.#agent.dispose()
		}
	}

	/**
	 * Submit task
	 * 提交任务
	 */
	#submitTask() {
		const input = this.#taskInput.value.trim()
		if (!input) return

		// Hide input area
		// 隐藏输入区域
		this.#hideInputArea()

		if (this.#isWaitingForUserAnswer) {
			// Handle user input mode
			// 处理用户输入模式
			this.#handleUserAnswer(input)
		} else {
			// Execute task via agent
			// 通过代理执行任务
			this.#agent.execute(input)
		}
	}

	/**
	 * Handle user answer
	 * 处理用户回答
	 */
	#handleUserAnswer(input: string): void {
		this.#removeTempCards()

		// Reset state
		// 重置状态
		this.#isWaitingForUserAnswer = false

		// Call resolver to return user input
		// 调用 resolver 返回用户输入
		if (this.#userAnswerResolver) {
			this.#userAnswerResolver(input)
			this.#userAnswerResolver = null
		}
	}

	/**
	 * Show input area
	 * 显示输入区域
	 */
	#showInputArea(placeholder?: string): void {
		// Clear input field
		// 清空输入字段
		this.#taskInput.value = ''
		this.#taskInput.placeholder = placeholder || this.#i18n.t('ui.panel.taskInput')
		this.#inputSection.classList.remove(styles.hidden)
		// Focus on input field
		// 聚焦输入字段
		setTimeout(() => {
			this.#taskInput.focus()
		}, 100)
	}

	/**
	 * Hide input area
	 * 隐藏输入区域
	 */
	#hideInputArea(): void {
		this.#inputSection.classList.add(styles.hidden)
	}

	/**
	 * Check if input area should be shown
	 * 检查是否应显示输入区域
	 */
	#shouldShowInputArea(): boolean {
		// Always show input area if waiting for user input
		// 如果等待用户输入，始终显示输入区域
		if (this.#isWaitingForUserAnswer) return true

		const history = this.#agent.history
		if (history.length === 0) {
			return true // Initial state
			// 初始状态
		}

		const status = this.#agent.status
		const isTaskEnded = status === 'completed' || status === 'error' || status === 'stopped'

		// Only show input area after task completion if configured to do so
		// 仅在任务完成后根据配置决定是否显示输入区域
		if (isTaskEnded) {
			return this.#config.promptForNextTask ?? true
		}

		return false
	}

	#createWrapper(): HTMLElement {
		const taskInputMaxLength = 1000
		const wrapper = document.createElement('div')
		wrapper.id = 'page-agent-runtime_agent-panel'
		wrapper.className = styles.wrapper
		wrapper.setAttribute('data-browser-use-ignore', 'true')
		wrapper.setAttribute('data-page-agent-ignore', 'true')

		wrapper.innerHTML = `
			<div class="${styles.background}"></div>
			<div class="${styles.historySectionWrapper}">
				<div class="${styles.historySection}">
					<div class="${styles.historyItem}">
						<div class="${styles.historyContent}">
							<span class="${styles.statusIcon}">🧠</span>
							<span>${this.#i18n.t('ui.panel.waitingPlaceholder')}</span>
						</div>
					</div>
				</div>
			</div>
			<div class="${styles.header}">
				<div class="${styles.statusSection}">
					<div class="${styles.indicator} ${styles.thinking}"></div>
					<div class="${styles.statusText}">${this.#i18n.t('ui.panel.ready')}</div>
				</div>
				<div class="${styles.controls}">
					<button class="${styles.controlButton} ${styles.expandButton}" title="${this.#i18n.t('ui.panel.expand')}">
						▼
					</button>
					<button class="${styles.controlButton} ${styles.stopButton}" title="${this.#i18n.t('ui.panel.close')}">
						X
					</button>
				</div>
			</div>
			<div class="${styles.inputSectionWrapper} ${styles.hidden}">
				<div class="${styles.inputSection}">
					<input 
						type="text" 
						class="${styles.taskInput}" 
						maxlength="${taskInputMaxLength}"
					/>
				</div>
			</div>
		`

		document.body.appendChild(wrapper)
		return wrapper
	}

	#setupEventListeners(): void {
		// Click header area to expand/collapse
		// 点击标题区域展开/折叠
		const header = this.wrapper.querySelector(`.${styles.header}`)!
		header.addEventListener('click', (e) => {
			// Don't trigger expand/collapse if clicking on buttons
			// 如果点击的是按钮，则不触发展开/折叠
			if ((e.target as HTMLElement).closest(`.${styles.controlButton}`)) {
				return
			}
			this.#toggle()
		})

		// Expand button
		// 展开按钮
		this.#expandButton.addEventListener('click', (e) => {
			e.stopPropagation()
			this.#toggle()
		})

		// Action button (stop / close)
		// 操作按钮（停止/关闭）
		this.#actionButton.addEventListener('click', (e) => {
			e.stopPropagation()
			this.#handleActionButton()
		})

		// Submit on Enter key in input field
		// 输入框中按 Enter 键提交
		this.#taskInput.addEventListener('keydown', (e) => {
			if (e.isComposing) return // Ignore IME composition keys
			// 忽略 IME 组合键
			if (e.key === 'Enter') {
				e.preventDefault()
				this.#submitTask()
			}
		})

		// Prevent input area click event bubbling
		// 阻止输入区域点击事件冒泡
		this.#inputSection.addEventListener('click', (e) => {
			e.stopPropagation()
		})
	}

	#toggle(): void {
		if (this.#isExpanded) {
			this.#collapse()
		} else {
			this.#expand()
		}
	}

	#expand(): void {
		this.#isExpanded = true
		this.wrapper.classList.add(styles.expanded)
		this.#expandButton.textContent = '▲'
	}

	#collapse(): void {
		this.#isExpanded = false
		this.wrapper.classList.remove(styles.expanded)
		this.#expandButton.textContent = '▼'
	}

	/**
	 * Start periodic header update loop
	 * 启动定期标题更新循环
	 */
	#startHeaderUpdateLoop(): void {
		// Check every 450ms (same as total animation duration)
		// 每 450ms 检查一次（与动画总时长相同）
		this.#headerUpdateTimer = setInterval(() => {
			this.#checkAndUpdateHeader()
		}, 450)
	}

	/**
	 * Stop periodic header update loop
	 * 停止定期标题更新循环
	 */
	#stopHeaderUpdateLoop(): void {
		if (this.#headerUpdateTimer) {
			clearInterval(this.#headerUpdateTimer)
			this.#headerUpdateTimer = null
		}
	}

	/**
	 * Check if header needs update and trigger animation if not currently animating
	 * 检查标题是否需要更新，如果当前没有动画则触发动画
	 */
	#checkAndUpdateHeader(): void {
		// If no pending text or currently animating, skip
		// 如果没有待处理文本或当前正在动画，则跳过
		if (!this.#pendingHeaderText || this.#isAnimating) {
			return
		}

		// If text is already displayed, clear pending and skip
		// 如果文本已显示，清除待处理并跳过
		if (this.#statusText.textContent === this.#pendingHeaderText) {
			this.#pendingHeaderText = null
			return
		}

		// Start animation
		// 开始动画
		const textToShow = this.#pendingHeaderText
		this.#pendingHeaderText = null
		this.#animateTextChange(textToShow)
	}

	/**
	 * Animate text change with fade out/in effect
	 * 以淡出/淡入效果动画文本变化
	 */
	#animateTextChange(newText: string): void {
		this.#isAnimating = true

		// Fade out current text
		// 淡出当前文本
		this.#statusText.classList.add(styles.fadeOut)

		setTimeout(() => {
			// Update text content
			// 更新文本内容
			this.#statusText.textContent = newText

			// Fade in new text
			// 淡入新文本
			this.#statusText.classList.remove(styles.fadeOut)
			this.#statusText.classList.add(styles.fadeIn)

			setTimeout(() => {
				this.#statusText.classList.remove(styles.fadeIn)
				this.#isAnimating = false
			}, 300)
		}, 150) // Half the duration of fade out animation
		// 淡出动画时长的一半
	}

	#updateStatusIndicator(
		type:
			| 'idle'
			| 'running'
			| 'thinking'
			| 'executing'
			| 'executed'
			| 'retrying'
			| 'completed'
			| 'error'
			| 'stopped'
	): void {
		// `running` animates like thinking; `idle`/`stopped` use the neutral base.
		// `running` 动画类似 thinking；`idle`/`stopped` 使用中性基础样式。
		const variant = type === 'running' ? 'thinking' : type
		this.#indicator.className = styles.indicator
		if (variant !== 'idle' && variant !== 'stopped') {
			this.#indicator.classList.add(styles[variant])
		}
	}

	#scrollToBottom(): void {
		// Execute in next event loop to ensure DOM update completion
		// 在下一个事件循环中执行，以确保 DOM 更新完成
		setTimeout(() => {
			this.#historySection.scrollTop = this.#historySection.scrollHeight
		}, 0)
	}

	/**
	 * Render history directly from agent.history
	 * 直接从 agent.history 渲染历史
	 *
	 * Renders:
	 * 渲染：
	 * 1. Task (first item, from agent.task)
	 * 1. 任务（第一项，来自 agent.task）
	 * 2. Reflection cards (evaluation, memory, next_goal)
	 * 2. 反思卡片（评估、记忆、下一个目标）
	 * 3. Tool execution with output
	 * 3. 带输出的工具执行
	 * 4. Observations
	 * 4. 观察结果
	 */
	#renderHistory(): void {
		const items: string[] = []

		// 1. Task card (always first)
		// 1. 任务卡片（始终第一）
		const task = this.#agent.task
		if (task) {
			items.push(this.#createTaskCard(task))
		}

		// 2. Render each history event
		// 2. 渲染每个历史事件
		const history = this.#agent.history
		for (const event of history) {
			items.push(...this.#createHistoryCards(event))
		}

		this.#historySection.innerHTML = items.join('')
		this.#scrollToBottom()
	}

	#createTaskCard(task: string): string {
		return createCard({ icon: '🎯', content: task, type: 'input' })
	}

	/** Create cards for a history event */
	/** 为历史事件创建卡片 */
	#createHistoryCards(event: PanelAgentAdapter['history'][number]): string[] {
		const cards: string[] = []
		const meta =
			event.type === 'step' && event.stepIndex !== undefined
				? this.#i18n.t('ui.panel.step', {
						number: (event.stepIndex + 1).toString(),
					})
				: undefined

		if (event.type === 'step') {
			// Reflection card
			// 反思卡片
			if (event.reflection) {
				const lines = createReflectionLines(event.reflection)
				if (lines.length > 0) {
					cards.push(createCard({ icon: '🧠', content: lines, meta }))
				}
			}

			// Action card
			// 操作卡片
			const action = event.action
			if (action) {
				cards.push(...this.#createActionCards(action, meta))
			}
		} else if (event.type === 'observation') {
			cards.push(
				createCard({ icon: '👁️', content: event.content || '', meta, type: 'observation' })
			)
		} else if (event.type === 'user_takeover') {
			cards.push(createCard({ icon: '👤', content: 'User takeover', meta, type: 'input' }))
		} else if (event.type === 'retry') {
			const retryInfo = `${event.message || 'Retrying'} (${event.attempt}/${event.maxAttempts})`
			cards.push(createCard({ icon: '🔄', content: retryInfo, meta, type: 'observation' }))
		} else if (event.type === 'error') {
			cards.push(
				createCard({ icon: '❌', content: event.message || 'Error', meta, type: 'observation' })
			)
		}

		return cards
	}

	/** Create cards for an action */
	/** 为操作创建卡片 */
	#createActionCards(
		action: { name: string; input: unknown; output: string },
		meta?: string
	): string[] {
		const cards: string[] = []

		if (action.name === 'done') {
			const input = action.input as { text?: string }
			const text = input.text || action.output || ''
			if (text) {
				cards.push(createCard({ icon: '🤖', content: text, meta, type: 'output' }))
			}
		} else if (action.name === 'ask_user') {
			const input = action.input as { question?: string }
			const answer = action.output.replace(/^User answered:\s*/i, '')
			cards.push(
				createCard({
					icon: '❓',
					content: `Question: ${input.question || ''}`,
					meta,
					type: 'question',
				})
			)
			cards.push(createCard({ icon: '💬', content: `Answer: ${answer}`, meta, type: 'input' }))
		} else {
			const toolText = this.#getToolExecutingText(action.name, action.input)
			cards.push(createCard({ icon: '🔨', content: toolText, meta }))
			if (action.output?.length > 0) {
				cards.push(createCard({ icon: '🔨', content: action.output, meta, type: 'output' }))
			}
		}

		return cards
	}
}