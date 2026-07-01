/**
 * Tab control tools for browser extension
 * 标签页控制工具，用于浏览器扩展
 *
 * These tools allow the agent to manage multiple browser tabs:
 * 这些工具允许代理管理多个浏览器标签页：
 * - open_new_tab: Open a new tab and set it as current
 * - open_new_tab：打开新标签页并将其设为当前标签页
 * - switch_to_tab: Switch to an existing tab
 * - switch_to_tab：切换到已有标签页
 * - close_tab: Close a tab (optionally switch to another)
 * - close_tab：关闭标签页（可选择切换到另一个）
 */
import * as z from 'zod/v4'

import type { TabsController } from './TabsController'

/** Tool definition compatible with PageAgentCore customTools */
/** 与 PageAgentCore customTools 兼容的工具定义 */
interface TabTool {
	description: string
	inputSchema: z.ZodType
	execute: (input: unknown) => Promise<string>
}

/**
 * Create tab control tools bound to a TabsManager instance.
 * 创建绑定到 TabsManager 实例的标签页控制工具。
 * These tools are injected into PageAgentCore via customTools config.
 * 这些工具通过 customTools 配置注入到 PageAgentCore 中。
 */
export function createTabTools(tabsController: TabsController): Record<string, TabTool> {
	return {
		open_new_tab: {
			description:
				'Open a new browser tab with the specified URL. The new tab becomes the current tab for all subsequent page operations.',
			inputSchema: z.object({
				url: z.string().describe('The URL to open in the new tab'),
			}),
			execute: async (input: unknown) => {
				const { url } = input as { url: string }
				try {
					return await tabsController.openNewTab(url)
				} catch (error) {
					return `❌ Failed: ${error instanceof Error ? error.message : String(error)}`
				}
			},
		},

		switch_to_tab: {
			description:
				'Switch to an existing tab by its ID. After switching, all page operations will target the new current tab. You can only switch to tabs in the tab list shown in browser state.',
			inputSchema: z.object({
				tab_id: z.number().int().describe('The tab ID to switch to'),
			}),
			execute: async (input: unknown) => {
				const { tab_id } = input as { tab_id: number }
				try {
					return await tabsController.switchToTab(tab_id)
				} catch (error) {
					return `❌ Failed: ${error instanceof Error ? error.message : String(error)}`
				}
			},
		},

		close_tab: {
			description:
				'Close a tab by its ID. Cannot close the initial tab. Optionally specify which tab to switch to after closing.',
			inputSchema: z.object({
				tab_id: z.number().int().describe('The tab ID to close'),
			}),
			execute: async (input: unknown) => {
				const { tab_id } = input as { tab_id: number }
				try {
					return await tabsController.closeTab(tab_id)
				} catch (error) {
					return `❌ Failed: ${error instanceof Error ? error.message : String(error)}`
				}
			},
		},
	}
}