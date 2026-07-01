import { initPageController } from '@/agent/RemotePageController.content'

// import { DEMO_CONFIG } from '@/agent/constants'
// 从常量中导入 DEMO_CONFIG（已注释）

const DEBUG_PREFIX = '[Content]'

export default defineContentScript({
	matches: ['<all_urls>'],
	runAt: 'document_end',

	main() {
		console.debug(`${DEBUG_PREFIX} Loaded on ${window.location.href}`)
		initPageController()

		// if auth token matches, expose agent to page
		// 如果认证令牌匹配，将代理暴露给页面
		chrome.storage.local.get('PageAgentExtUserAuthToken').then((result) => {
			// extension side token.
			// 扩展侧的令牌。
			// @note this is isolated world. it is safe to assume user script cannot access it
			// @note 这是隔离世界，可以安全地假设用户脚本无法访问它
			const extToken = result.PageAgentExtUserAuthToken
			if (!extToken) return

			// page side token
			// 页面侧的令牌
			const pageToken = localStorage.getItem('PageAgentExtUserAuthToken')
			if (!pageToken) return

			if (pageToken !== extToken) return

			console.log('[PageAgentExt]: Auth tokens match. Exposing agent to page.')

			// add isolated world script
			// 添加隔离世界的脚本
			exposeAgentToPage().then(
				// add main-world script
				// 添加主世界脚本
				() => injectScript('/main-world.js')
			)
		})
	},
})

async function exposeAgentToPage() {
	const { MultiPageAgent } = await import('@/agent/MultiPageAgent')
	console.log('[PageAgentExt]: MultiPageAgent loaded')

	/**
	 * singleton MultiPageAgent to handle requests from the page
	 * 用于处理来自页面请求的单例 MultiPageAgent
	 */
	let multiPageAgent: InstanceType<typeof MultiPageAgent> | null = null

	window.addEventListener('message', async (e) => {
		if (e.source !== window) return

		const data = e.data
		if (typeof data !== 'object' || data === null) return
		if (data.channel !== 'PAGE_AGENT_EXT_REQUEST') return

		const { action, payload, id } = data

		switch (action) {
			case 'execute': {
				// singleton check
				// 单例检查
				if (multiPageAgent && multiPageAgent.status === 'running') {
					window.postMessage(
						{
							channel: 'PAGE_AGENT_EXT_RESPONSE',
							id,
							action: 'execute_result',
							error: 'Agent is already running a task. Please wait until it finishes.',
						},
						'*'
					)
					return
				}

				try {
					const { task, config } = payload
					const { systemInstruction, ...agentConfig } = config

					// Dispose old instance before creating new one
					// 在创建新实例之前销毁旧实例
					multiPageAgent?.dispose()

					multiPageAgent = new MultiPageAgent({
						...agentConfig,
						instructions: systemInstruction ? { system: systemInstruction } : undefined,
					})

					// events
					// 事件

					multiPageAgent.addEventListener('statuschange', (event) => {
						if (!multiPageAgent) return
						window.postMessage(
							{
								channel: 'PAGE_AGENT_EXT_RESPONSE',
								id,
								action: 'status_change_event',
								payload: multiPageAgent.status,
							},
							'*'
						)
					})

					multiPageAgent.addEventListener('activity', (event) => {
						if (!multiPageAgent) return
						window.postMessage(
							{
								channel: 'PAGE_AGENT_EXT_RESPONSE',
								id,
								action: 'activity_event',
								payload: (event as CustomEvent).detail,
							},
							'*'
						)
					})

					multiPageAgent.addEventListener('historychange', (event) => {
						if (!multiPageAgent) return
						window.postMessage(
							{
								channel: 'PAGE_AGENT_EXT_RESPONSE',
								id,
								action: 'history_change_event',
								payload: multiPageAgent.history,
							},
							'*'
						)
					})

					// result
					// 结果

					const result = await multiPageAgent.execute(task)

					window.postMessage(
						{
							channel: 'PAGE_AGENT_EXT_RESPONSE',
							id,
							action: 'execute_result',
							payload: result,
						},
						'*'
					)
				} catch (error) {
					window.postMessage(
						{
							channel: 'PAGE_AGENT_EXT_RESPONSE',
							id,
							action: 'execute_result',
							error: (error as Error).message,
						},
						'*'
					)
				}

				break
			}

			case 'stop': {
				multiPageAgent?.stop()
				break
			}

			default:
				console.warn(`${DEBUG_PREFIX} Unknown action from page:`, action)
				break
		}
	})
}