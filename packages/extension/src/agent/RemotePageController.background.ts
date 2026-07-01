/**
 * background logics for RemotePageController
 * RemotePageController 的后台逻辑
 * - redirect messages from RemotePageController(Agent, extension pages) to ContentScript
 * - 将来自 RemotePageController（Agent、扩展页面）的消息重定向到 ContentScript
 */

export function handlePageControlMessage(
	message: { type: 'PAGE_CONTROL'; action: string; payload: any; targetTabId: number },
	sender: chrome.runtime.MessageSender,
	sendResponse: (response: unknown) => void
): true | undefined {
	const PREFIX = '[RemotePageController.background]'

	const debug = console.debug.bind(console, `\x1b[90m${PREFIX}\x1b[0m`)

	const { action, payload, targetTabId } = message

	if (action === 'get_my_tab_id') {
		debug('get_my_tab_id', sender.tab?.id)
		sendResponse({ tabId: sender.tab?.id || null })
		return
	}

	// proxy to content script
	// 代理到 content script
	chrome.tabs
		.sendMessage(targetTabId, {
			type: 'PAGE_CONTROL',
			action,
			payload,
		})
		.then((result) => {
			sendResponse(result)
		})
		.catch((error) => {
			console.error(PREFIX, error)
			sendResponse({
				success: false,
				error: error instanceof Error ? error.message : String(error),
			})
		})

	return true // async response
	// 异步响应
}