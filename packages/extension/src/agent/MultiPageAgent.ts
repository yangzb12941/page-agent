import { type AgentConfig, PageAgentCore } from '@page-agent/core'

import { RemotePageController } from './RemotePageController'
import { TabsController } from './TabsController'
import SYSTEM_PROMPT from './system_prompt.md?raw'
import { createTabTools } from './tabTools'

/** Detect user language from browser settings */
/** 从浏览器设置检测用户语言 */
function detectLanguage(): 'en-US' | 'zh-CN' {
	const lang = navigator.language || navigator.languages?.[0] || 'en-US'
	return lang.startsWith('zh') ? 'zh-CN' : 'en-US'
}

interface MultiPageAgentConfig extends AgentConfig {
	includeInitialTab?: boolean
	experimentalIncludeAllTabs?: boolean
}

/**
 * MultiPageAgent
 * 多页面代理
 * - use with extension
 * - 与扩展程序配合使用
 * - can be used from a side panel or a content script
 * - 可从侧面板或内容脚本使用
 */
export class MultiPageAgent extends PageAgentCore {
	constructor(config: MultiPageAgentConfig) {
		// multi page controller
		// 多页面控制器
		const tabsController = new TabsController()
		const pageController = new RemotePageController(tabsController)
		const customTools = createTabTools(tabsController)

		// system prompt - auto-detect language if not specified
		// 系统提示 - 如果未指定则自动检测语言
		const language = config.language ?? detectLanguage()
		const targetLanguage = language === 'zh-CN' ? '中文' : 'English'
		const systemPrompt = SYSTEM_PROMPT.replace(
			/Default working language: \*\*.*?\*\*/,
			`Default working language: **${targetLanguage}**`
		)

		const includeInitialTab = config.includeInitialTab ?? true
		const experimentalIncludeAllTabs = config.experimentalIncludeAllTabs ?? false

		/**
		 * Project agent status into chrome.storage. The content script polls
		 * `isAgentRunning` + `agentHeartbeat` (eventually consistent by design).
		 * 将代理状态投射到 chrome.storage 中。内容脚本轮询
		 * `isAgentRunning` + `agentHeartbeat`（设计上保证最终一致性）。
		 *
		 * When the agent is in side-panel and user closed the side-panel.
		 * 当代理在侧面板中且用户关闭了侧面板时。
		 * There is no chance for isAgentRunning to be set false.
		 * isAgentRunning 没有机会被设置为 false。
		 * (unload event doesn't work well in side panel.)
		 * （unload 事件在侧面板中工作效果不佳。）
		 * (I'm trying not to use long-lived connection because the lifecycle of a sw is hard to predict.)
		 * （我尽量不使用长连接，因为 service worker 的生命周期难以预测。）
		 * This heartbeat mechanism acts as a backup.
		 * 此心跳机制作为备份。
		 */
		let heartBeatInterval: number | null = null

		super({
			...config,
			// Disabled: AbortSignal cannot cross contexts
			// 已禁用：AbortSignal 无法跨上下文传递
			experimentalScriptExecutionTool: false,
			pageController: pageController as any,
			customTools: customTools,
			customSystemPrompt: systemPrompt,

			onBeforeTask: async (agent) => {
				await tabsController.init(agent.task, { includeInitialTab, experimentalIncludeAllTabs })
			},

			onBeforeStep: async (agent) => {
				if (!tabsController.currentTabId) return
				// make sure the current tab is loaded before the step starts
				// 确保在步骤开始前当前标签页已加载
				await tabsController.waitUntilTabLoaded(tabsController.currentTabId!)
			},

			onDispose: () => {
				if (heartBeatInterval) {
					clearInterval(heartBeatInterval)
					heartBeatInterval = null
				}
				chrome.storage.local.set({ isAgentRunning: false }).catch(console.error)

				tabsController.dispose()
			},
		})

		this.addEventListener('statuschange', () => {
			const running = this.status === 'running'

			if (running && !heartBeatInterval) {
				heartBeatInterval = window.setInterval(() => {
					void chrome.storage.local.set({ agentHeartbeat: Date.now() })
				}, 1_000)
			} else if (!running && heartBeatInterval) {
				clearInterval(heartBeatInterval)
				heartBeatInterval = null
			}

			chrome.storage.local.set({ isAgentRunning: running }).catch(console.error)
		})
	}
}