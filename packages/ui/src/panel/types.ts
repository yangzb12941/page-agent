/**
 * Agent activity - transient state for immediate UI feedback.
 * Agent 活动 - 用于即时 UI 反馈的瞬时状态。
 *
 * Unlike historical events (which are persisted), activities are ephemeral
 * and represent "what the agent is doing right now". UI components should
 * listen to 'activity' events to show real-time feedback.
 * 与历史事件（持久化）不同，活动是短暂的，表示“代理当前正在做什么”。
 * UI 组件应监听 'activity' 事件以显示实时反馈。
 *
 * Note: There is no 'idle' activity - absence of activity events means idle.
 * 注意：没有 'idle' 活动 - 没有活动事件即表示空闲。
 *
 * Events dispatched: CustomEvent<AgentActivity>
 * 分派的事件：CustomEvent<AgentActivity>
 */
export type AgentActivity =
	| { type: 'thinking' }
	| { type: 'executing'; tool: string; input: unknown }
	| { type: 'executed'; tool: string; input: unknown; output: string; duration: number }
	| { type: 'retrying'; attempt: number; maxAttempts: number }
	| { type: 'error'; message: string }

/**
 * Minimal interface that Panel expects from an agent.
 * Panel 期望代理实现的最小接口。
 * Panel does not depend on PageAgent directly - it only requires this interface.
 * Panel 不直接依赖 PageAgent - 它只需要这个接口。
 * This enables decoupling and allows any agent implementation to work with Panel.
 * 这实现了解耦，允许任何代理实现与 Panel 协同工作。
 *
 * Events:
 * 事件：
 * - 'statuschange': Agent status changed
 * - 'statuschange': 代理状态变更
 * - 'historychange': Historical events updated (persisted)
 * - 'historychange': 历史事件更新（持久化）
 * - 'activity': Transient activity for immediate UI feedback (thinking/executing/etc)
 * - 'activity': 用于即时 UI 反馈的瞬时活动（思考/执行等）
 * - 'dispose': Agent is being disposed
 * - 'dispose': 代理正在被销毁
 */
export interface PanelAgentAdapter extends EventTarget {
	/** Current agent status */
	/** 当前代理状态 */
	readonly status: 'idle' | 'running' | 'completed' | 'error' | 'stopped'

	/** Result of the most recent run, or `null` before the first run completes */
	/** 最近一次运行的结果，在第一次运行完成前为 `null` */
	readonly lastResult: { success: boolean } | null

	/** History of agent events */
	/** 代理事件历史 */
	readonly history: readonly {
		type: 'step' | 'observation' | 'user_takeover' | 'retry' | 'error'
		stepIndex?: number
		/** For 'step' type */
		/** 用于 'step' 类型 */
		reflection?: {
			evaluation_previous_goal?: string
			memory?: string
			next_goal?: string
		}
		/** For 'step' type */
		/** 用于 'step' 类型 */
		action?: {
			name: string
			input: unknown
			output: string
		}
		/** For 'observation' type */
		/** 用于 'observation' 类型 */
		content?: string
		/** For 'retry' type */
		/** 用于 'retry' 类型 */
		attempt?: number
		maxAttempts?: number
		/** For 'retry' and 'error' types */
		/** 用于 'retry' 和 'error' 类型 */
		message?: string
	}[]

	/** Current task being executed */
	/** 当前正在执行的任务 */
	readonly task: string

	/**
	 * Called when the agent needs to ask the user questions.
	 * 当代理需要询问用户问题时调用。
	 * If unset, the `ask_user` tool will be disabled.
	 * 如果未设置，`ask_user` 工具将被禁用。
	 * Panel will set this to handle user questions via its UI.
	 * Panel 会设置此函数，通过其 UI 处理用户问题。
	 * The optional `signal` aborts when the task is stopped or disposed.
	 * 可选的 `signal` 在任务被停止或销毁时中止。
	 */
	onAskUser?: (question: string, options?: { signal: AbortSignal }) => Promise<string>

	/** Execute a task */
	/** 执行任务 */
	execute(task: string): Promise<unknown>

	/** Stop the current task (agent remains reusable) */
	/** 停止当前任务（代理仍可复用） */
	stop(): Promise<void>

	/** Dispose the agent (terminal, cannot be reused) */
	/** 销毁代理（终止状态，不可复用） */
	dispose(): void
}