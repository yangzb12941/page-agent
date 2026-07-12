import { handlePageControlMessage } from '@/agent/RemotePageController.background'
import { handleTabControlMessage, setupTabEventsPort } from '@/agent/TabsController.background'

/**
 * 这个文件 background.ts 是该 Chrome 扩展程序的后台服务脚本（Background Service Worker）。它是整个扩展的“中枢神经”，
 * 负责管理全局状态、消息路由以及与外部应用的通信。
 * 它的主要职责包括：
 *
 * 1. 消息路由中心 (Message Proxy)
 * 它是扩展内部各组件（如 Content Script、Popup、SidePanel）之间的通信枢纽。
 *
 * 监听内部消息 (chrome.runtime.onMessage)：
 *  TAB_CONTROL：将标签页相关的操作（如切换、新建、关闭）路由到 handleTabControlMessage 处理。
 *  PAGE_CONTROL：将页面自动化控制相关的操作路由到 handlePageControlMessage 处理。
 * 监听外部消息 (chrome.runtime.onMessageExternal)：
 *  接收来自本地启动器（Launcher Page）的消息。通常用于通过 externally_connectable 机制实现本地服务与扩展的握手。
 *  处理 OPEN_HUB 指令，用于打开或聚焦 Agent 的控制台（Hub）。
 *
 * 2. Hub 控制台管理 (openOrFocusHubTab)
 * 这个函数负责管理 Agent 的核心操作界面（Hub）的生命周期：
 * 智能聚焦：如果已经打开了 Hub 页面，它会将其激活并更新 WebSocket 端口参数，而不是重复打开。
 * 创建新页：如果没有打开，则创建一个固定标签页 (Pinned Tab) 打开 Hub。
 * 自动清理：在 Hub 打开后，自动关闭发送指令的 Launcher 标签页 (chrome.tabs.remove)，保持浏览器整洁。
 * 3. 身份验证与状态初始化
 * Auth Token 生成：在扩展首次启动或 Service Worker 重新加载时，检查本地存储中是否存在 PageAgentExtUserAuthToken。
 * 如果不存在，则使用 crypto.randomUUID() 生成一个新的用户认证令牌并持久化保存。
 * 标签页事件监听：调用 setupTabEventsPort 来监听浏览器标签页的变化事件（如激活、关闭等），以便扩展能实时感知页面状态。
 * 4. UI 行为配置
 * 侧边栏集成：通过 chrome.sidePanel.setPanelBehavior 配置侧边栏行为，设置为“点击扩展图标时打开侧边栏面板”，提供更便捷的用户交互入口。
 * 总结
 * 该文件不直接操作 DOM，而是作为后端协调者，负责：
 *
 * 维护全局状态（Token、Tab 状态）。
 * 分发指令（将 UI 层或 Content Script 的请求分发给对应的业务逻辑处理）。
 * 管理核心 UI（Hub 控制台的打开/关闭）。
 */
export default defineBackground(() => {
	console.log('[Background] Service Worker started')

	// tab change events

	setupTabEventsPort()

	// generate user auth token

	chrome.storage.local.get('PageAgentExtUserAuthToken').then((result) => {
		if (result.PageAgentExtUserAuthToken) return

		const userAuthToken = crypto.randomUUID()
		chrome.storage.local.set({ PageAgentExtUserAuthToken: userAuthToken })
	})

	// message proxy

	chrome.runtime.onMessage.addListener((message, sender, sendResponse): true | undefined => {
		if (message.type === 'TAB_CONTROL') {
			return handleTabControlMessage(message, sender, sendResponse)
		} else if (message.type === 'PAGE_CONTROL') {
			return handlePageControlMessage(message, sender, sendResponse)
		} else {
			sendResponse({ error: 'Unknown message type' })
			return
		}
	})

	// external messages (from localhost launcher page via externally_connectable)

	chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
		if (message.type === 'OPEN_HUB') {
			openOrFocusHubTab(message.wsPort).then(() => {
				if (sender.tab?.id) chrome.tabs.remove(sender.tab.id)
				sendResponse({ ok: true })
			})
			return true
		}
	})

	// setup

	chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
})

async function openOrFocusHubTab(wsPort: number) {
	const hubUrl = chrome.runtime.getURL('hub.html')
	const existing = await chrome.tabs.query({ url: `${hubUrl}*` })

	if (existing.length > 0 && existing[0].id) {
		await chrome.tabs.update(existing[0].id, {
			active: true,
			url: `${hubUrl}?ws=${wsPort}`,
		})
		return
	}

	await chrome.tabs.create({ url: `${hubUrl}?ws=${wsPort}`, pinned: true })
}
