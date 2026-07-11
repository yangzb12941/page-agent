/**
 * Copyright (C) 2025 Alibaba Group Holding Limited
 * 版权所有 (C) 2025 阿里巴巴集团控股有限公司
 * All rights reserved.
 * 保留所有权利。
 *
 * PageController - Manages DOM operations and element interactions.
 * PageController - 管理 DOM 操作和元素交互。
 * Designed to be independent of LLM and can be tested in unit tests.
 * 设计为独立于 LLM，可在单元测试中测试。
 * All public methods are async for potential remote calling support.
 * 所有公开方法均为异步，以支持潜在的远程调用。
 */
import {
	clickElement,
	getElementByIndex,
	inputTextElement,
	scrollHorizontally,
	scrollVertically,
	selectOptionElement,
} from './actions'
import * as dom from './dom'
import type { FlatDomTree, InteractiveElementDomNode } from './dom/dom_tree/type'
import { getPageInfo } from './dom/getPageInfo'
import { patchReact } from './patches/react'
import { isAnchorElement } from './utils'

/**
 * Configuration for PageController
 * PageController 配置
 */
export interface PageControllerConfig extends dom.DomConfig {
	/** Enable visual mask overlay during operations (default: false) */
	/** 操作期间启用视觉遮罩覆盖层（默认：false） */
	enableMask?: boolean
}

/**
 * Structured browser state for LLM consumption
 * 供 LLM 使用的结构化浏览器状态
 */
export interface BrowserState {
	url: string
	title: string
	/** Page info + scroll position hint (e.g. "Page info: 1920x1080px...\n[Start of page]") */
	/** 页面信息 + 滚动位置提示（例如："Page info: 1920x1080px...\n[Start of page]"） */
	header: string
	/** Simplified HTML of interactive elements */
	/** 交互元素的简化 HTML */
	content: string
	/** Page footer hint (e.g. "... 300 pixels below ..." or "[End of page]") */
	/** 页面底部提示（例如："... 300 pixels below ..." 或 "[End of page]"） */
	footer: string
}

interface ActionResult {
	success: boolean
	message: string
}

/**
 * PageController manages DOM state and element interactions.
 * PageController 管理 DOM 状态和元素交互。
 * It provides async methods for all DOM operations, keeping state isolated.
 * 它为所有 DOM 操作提供异步方法，保持状态隔离。
 *
 * @lifecycle
 * - beforeUpdate: Emitted before the DOM tree is updated.
 * - beforeUpdate: 在 DOM 树更新之前触发。
 * - afterUpdate: Emitted after the DOM tree is updated.
 * - afterUpdate: 在 DOM 树更新之后触发。
 */
export class PageController extends EventTarget {
	private config: PageControllerConfig

	/** Corresponds to eval_page in browser-use */
	/** 对应 browser-use 中的 eval_page */
	private flatTree: FlatDomTree | null = null

	/**
	 * All highlighted index-mapped interactive elements
	 * 所有带高亮索引的交互元素映射
	 * Corresponds to DOMState.selector_map in browser-use
	 * 对应 browser-use 中的 DOMState.selector_map
	 */
	private selectorMap = new Map<number, InteractiveElementDomNode>()

	/** Index -> element text description mapping */
	/** 索引 -> 元素文本描述映射 */
	private elementTextMap = new Map<number, string>()

	/**
	 * Simplified HTML for LLM consumption.
	 * 供 LLM 使用的简化 HTML。
	 * Corresponds to clickable_elements_to_string in browser-use
	 * 对应 browser-use 中的 clickable_elements_to_string
	 */
	private simplifiedHTML = '<EMPTY>'

	/** last time the tree was updated */
	/** 上次更新树的时间戳 */
	private lastTimeUpdate = 0

	/** Whether the tree has been indexed at least once */
	/** 树是否至少被索引过一次 */
	private isIndexed = false

	/** Visual mask overlay for blocking user interaction during automation */
	/** 用于自动化期间阻止用户交互的视觉遮罩覆盖层 */
	private mask: InstanceType<typeof import('./mask/SimulatorMask').SimulatorMask> | null = null
	private maskReady: Promise<void> | null = null

	constructor(config: PageControllerConfig = {}) {
		super()

		this.config = config

		patchReact(this)

		if (config.enableMask) this.initMask()
	}

	/**
	 * Initialize mask asynchronously (dynamic import to avoid CSS loading in Node)
	 * 异步初始化遮罩（动态导入，避免在 Node 中加载 CSS）
	 */
	initMask() {
		if (this.maskReady !== null) return
		this.maskReady = (async () => {
			const { SimulatorMask } = await import('./mask/SimulatorMask')
			this.mask = new SimulatorMask()
		})()
	}
	// ======= State Queries =======
	// ======= 状态查询 =======

	/**
	 * Get current page URL
	 * 获取当前页面 URL
	 */
	async getCurrentUrl(): Promise<string> {
		return window.location.href
	}

	/**
	 * Get last tree update timestamp
	 * 获取上次树更新时间戳
	 */
	async getLastUpdateTime(): Promise<number> {
		return this.lastTimeUpdate
	}

	/**
	 * Get structured browser state for LLM consumption.
	 * 获取供 LLM 使用的结构化浏览器状态。
	 * Automatically calls updateTree() to refresh the DOM state.
	 * 自动调用 updateTree() 以刷新 DOM 状态。
	 */
	async getBrowserState(): Promise<BrowserState> {
		//获取当前页面的 [url]
		const url = window.location.href
		const title = document.title
		//调用 [getPageInfo] 获取页面尺寸、视口尺寸及滚动位置详情（如 pages_above、pixels_below 等）
		const pi = getPageInfo()
		const viewportExpansion = dom.resolveViewportExpansion(this.config.viewportExpansion)

		//同步 DOM 状态：调用 await this.updateTree() 刷新 DOM 树，确保获取的是最新的页面结构。
		await this.updateTree()
		//将刷新后的简化 HTML 赋值给 [content]，这是 LLM 将要“看到”的主要交互元素内容。
		const content = this.simplifiedHTML

		// Build header: page info + scroll position hint
		// 构建头部：页面信息 + 滚动位置提示
		const titleLine = `Current Page: [${title}](${url})`

		const pageInfoLine = `Page info: ${pi.viewport_width}x${pi.viewport_height}px viewport, ${pi.page_width}x${pi.page_height}px total page size, ${pi.pages_above.toFixed(1)} pages above, ${pi.pages_below.toFixed(1)} pages below, ${pi.total_pages.toFixed(1)} total pages, at ${(pi.current_page_position * 100).toFixed(0)}% of page`

		const elementsLabel =
			viewportExpansion === -1
				? 'Interactive elements from top layer of the current page (full page):'
				: 'Interactive elements from top layer of the current page inside the viewport:'

		const hasContentAbove = pi.pixels_above > 4
		const scrollHintAbove =
			hasContentAbove && viewportExpansion !== -1
				? `... ${pi.pixels_above} pixels above (${pi.pages_above.toFixed(1)} pages) - scroll to see more ...`
				: '[Start of page]'

		const header = `${titleLine}\n${pageInfoLine}\n\n${elementsLabel}\n\n${scrollHintAbove}`

		// Build footer: scroll position hint
		// 构建底部：滚动位置提示
		const hasContentBelow = pi.pixels_below > 4
		const footer =
			hasContentBelow && viewportExpansion !== -1
				? `... ${pi.pixels_below} pixels below (${pi.pages_below.toFixed(1)} pages) - scroll to see more ...`
				: '[End of page]'

		return { url, title, header, content, footer }
	}

	// ======= DOM Tree Operations =======
	// ======= DOM 树操作 =======

	/**
	 * Update DOM tree, returns simplified HTML for LLM.
	 * 更新 DOM 树，返回供 LLM 使用的简化 HTML。
	 * This is the main method to refresh the page state.
	 * 这是刷新页面状态的主要方法。
	 * Automatically bypasses mask during DOM extraction if enabled.
	 * 如果启用了遮罩，在 DOM 提取期间会自动绕过遮罩。
	 *
	 * 这段代码定义了 PageController 中的 updateTree 方法，它是整个 Agent 系统中负责“感知”页面状态的核心方法。
	 * 其主要作用是将复杂的真实 DOM 结构转换为 AI（LLM）易于理解的简化格式，并建立操作索引。
	 *
	 * 具体逻辑步骤如下：
	 *
	 * 1、生命周期与时间记录：
	 * 触发 beforeUpdate 事件，并记录当前时间戳到 lastTimeUpdate。
	 * 2、临时穿透 Mask（遮罩层）：
	 * 如果启用了遮罩，将其样式设置为 pointerEvents = 'none'，使其不干扰后续的 DOM 提取过程。
	 * 3、清理与过滤：
	 * 清除页面上旧的高亮标记（cleanUpHighlights）。
	 * 构建黑名单：结合配置项和带有 [data-page-agent-not-interactive] 属性的元素（如 React 根节点），防止 AI 误操作这些关键区域。
	 * 4、提取与转换（核心）：
	 * 调用 dom.getFlatTree 获取扁平化的 DOM 树。
	 * 调用 dom.flatTreeToString 将其转换为简化版 HTML 字符串 (this.simplifiedHTML)。这是发送给 LLM 的主要“视觉”数据。
	 * 5、建立索引映射：
	 * 更新 selectorMap（索引 -> DOM 元素）和 elementTextMap（索引 -> 文本描述）。
	 * 标记 isIndexed = true，表示 DOM 树已就绪，AI 后续可以根据这些索引执行具体的点击或输入操作。
	 * 6、恢复 Mask 与完成：
	 * 恢复遮罩层的 pointerEvents = 'auto'，重新启用拦截保护。
	 * 触发 afterUpdate 事件，并返回简化后的 HTML 字符串。
	 */
	async updateTree(): Promise<string> {
		this.dispatchEvent(new Event('beforeUpdate'))

		this.lastTimeUpdate = Date.now()

		// Temporarily bypass mask to allow DOM extraction
		// 临时绕过遮罩以允许 DOM 提取
		/**
		 * 这句代码的作用是临时让遮罩层（Mask）变为“穿透”状态，以便顺利提取底层 DOM 元素。
		 * 具体细节如下：
		 * 解除事件拦截： SimulatorMask 默认处于激活状态时会拦截所有鼠标和键盘事件（pointerEvents = 'auto'），以防止用户在 AI 操作时干扰页面。
		 * 将 pointerEvents 设置为 'none' 会使得鼠标事件直接穿透遮罩层，作用于底层页面元素。
		 *
		 * 确保 DOM 提取准确： 在执行 dom.getFlatTree() 遍历页面结构之前，必须暂时屏蔽遮罩层的物理阻挡效果。
		 * 这能确保脚本能够无障碍地读取、查询和索引真实的页面元素，而不会被顶层的遮罩 div 干扰。
		 *
		 * 生命周期管理： 这是一个临时操作。在代码的后续部分（DOM 提取完成后），该属性会被恢复为 'auto'，从而恢复遮罩的拦截保护功能。
		 */
		if (this.mask) {
			this.mask.wrapper.style.pointerEvents = 'none'
		}

		dom.cleanUpHighlights()

		const blacklist = [
			...(this.config.interactiveBlacklist || []),
			...Array.from(document.querySelectorAll('[data-page-agent-not-interactive]')),
		]

		this.flatTree = dom.getFlatTree({
			...this.config,
			interactiveBlacklist: blacklist,
		})

		this.simplifiedHTML = dom.flatTreeToString(
			this.flatTree,
			this.config.includeAttributes,
			this.config.keepSemanticTags
		)

		this.selectorMap.clear()
		this.selectorMap = dom.getSelectorMap(this.flatTree)

		this.elementTextMap.clear()
		this.elementTextMap = dom.getElementTextMap(this.simplifiedHTML)

		// Mark as indexed - now element actions are allowed
		// 标记为已索引 - 现在允许执行元素操作
		this.isIndexed = true

		// Restore mask blocking
		// 恢复遮罩的阻止功能
		if (this.mask) {
			this.mask.wrapper.style.pointerEvents = 'auto'
		}

		this.dispatchEvent(new Event('afterUpdate'))

		return this.simplifiedHTML
	}

	/**
	 * Clean up all element highlights
	 * 清除所有元素高亮
	 */
	async cleanUpHighlights(): Promise<void> {
		console.log('[PageController] cleanUpHighlights')
		dom.cleanUpHighlights()
	}

	// ======= Element Actions =======
	// ======= 元素操作 =======

	/**
	 * Ensure the tree has been indexed before any index-based operation.
	 * 在任何基于索引的操作之前确保树已被索引。
	 * Throws if updateTree() hasn't been called yet.
	 * 如果尚未调用 updateTree() 则抛出异常。
	 */
	private assertIndexed(): void {
		if (!this.isIndexed) {
			throw new Error('DOM tree not indexed yet. Can not perform actions on elements.')
		}
	}

	/**
	 * Click element by index
	 * 通过索引点击元素
	 */
	async clickElement(index: number): Promise<ActionResult> {
		try {
			this.assertIndexed()
			const element = getElementByIndex(this.selectorMap, index)
			const elemText = this.elementTextMap.get(index)
			await clickElement(element)

			// Handle links that open in new tabs
			// 处理在新标签页中打开的链接
			if (isAnchorElement(element) && element.target === '_blank') {
				return {
					success: true,
					message: `✅ Clicked element (${elemText ?? index}). ⚠️ Link opened in a new tab.`,
				}
			}

			return {
				success: true,
				message: `✅ Clicked element (${elemText ?? index}).`,
			}
		} catch (error) {
			return {
				success: false,
				message: `❌ Failed to click element: ${error}`,
			}
		}
	}

	/**
	 * Input text into element by index
	 * 通过索引向元素输入文本
	 */
	async inputText(index: number, text: string): Promise<ActionResult> {
		try {
			this.assertIndexed()
			const element = getElementByIndex(this.selectorMap, index)
			const elemText = this.elementTextMap.get(index)
			await inputTextElement(element, text)

			return {
				success: true,
				message: `✅ Input text (${text}) into element (${elemText ?? index}).`,
			}
		} catch (error) {
			return {
				success: false,
				message: `❌ Failed to input text: ${error}`,
			}
		}
	}

	/**
	 * Select dropdown option by index and option text
	 * 通过索引和选项文本选择下拉选项
	 */
	async selectOption(index: number, optionText: string): Promise<ActionResult> {
		try {
			this.assertIndexed()
			const element = getElementByIndex(this.selectorMap, index)
			const elemText = this.elementTextMap.get(index)
			await selectOptionElement(element as HTMLSelectElement, optionText)

			return {
				success: true,
				message: `✅ Selected option (${optionText}) in element (${elemText ?? index}).`,
			}
		} catch (error) {
			return {
				success: false,
				message: `❌ Failed to select option: ${error}`,
			}
		}
	}

	/**
	 * Scroll vertically
	 * 垂直滚动
	 */
	async scroll(options: {
		down: boolean
		numPages: number
		pixels?: number
		index?: number
	}): Promise<ActionResult> {
		try {
			const { down, numPages, pixels, index } = options

			this.assertIndexed()

			const scrollAmount = (pixels ?? numPages * window.innerHeight) * (down ? 1 : -1)

			const element = index !== undefined ? getElementByIndex(this.selectorMap, index) : null

			const message = await scrollVertically(scrollAmount, element)

			return {
				success: true,
				message,
			}
		} catch (error) {
			return {
				success: false,
				message: `❌ Failed to scroll: ${error}`,
			}
		}
	}

	/**
	 * Scroll horizontally
	 * 水平滚动
	 */
	async scrollHorizontally(options: {
		right: boolean
		pixels: number
		index?: number
	}): Promise<ActionResult> {
		try {
			const { right, pixels, index } = options

			this.assertIndexed()

			const scrollAmount = pixels * (right ? 1 : -1)

			const element = index !== undefined ? getElementByIndex(this.selectorMap, index) : null

			const message = await scrollHorizontally(scrollAmount, element)

			return {
				success: true,
				message,
			}
		} catch (error) {
			return {
				success: false,
				message: `❌ Failed to scroll horizontally: ${error}`,
			}
		}
	}

	/**
	 * Execute arbitrary JavaScript on the page.
	 * 在页面上执行任意 JavaScript。
	 * The optional `signal` is exposed to the script scope so cooperative code
	 * can abort promptly when the task is stopped.
	 * 可选的 `signal` 会暴露到脚本作用域中，以便协作式代码能在任务停止时及时中止。
	 */
	async executeJavascript(script: string, signal?: AbortSignal): Promise<ActionResult> {
		try {
			// Wrap script in async function to support await, exposing `signal`.
			// 将脚本包装在异步函数中以支持 await，并暴露 `signal`。
			const asyncFunction = eval(`(async (signal) => { ${script} })`)
			const result = await asyncFunction(signal)
			return {
				success: true,
				message: `✅ Executed JavaScript. Result: ${result}`,
			}
		} catch (error) {
			return {
				success: false,
				message: `❌ Error executing JavaScript: ${error}`,
			}
		}
	}

	// ======= Mask Operations =======
	// ======= 遮罩操作 =======

	/**
	 * Show the visual mask overlay.
	 * 显示视觉遮罩覆盖层。
	 * Only works after mask is setup.
	 * 仅在遮罩设置完成后生效。
	 */
	async showMask(): Promise<void> {
		await this.maskReady
		this.mask?.show()
	}

	/**
	 * Hide the visual mask overlay.
	 * 隐藏视觉遮罩覆盖层。
	 * Only works after mask is setup.
	 * 仅在遮罩设置完成后生效。
	 */
	async hideMask(): Promise<void> {
		await this.maskReady
		this.mask?.hide()
	}

	/**
	 * Dispose and clean up resources
	 * 释放并清理资源
	 */
	dispose(): void {
		dom.cleanUpHighlights()
		this.flatTree = null
		this.selectorMap.clear()
		this.elementTextMap.clear()
		this.simplifiedHTML = '<EMPTY>'
		this.isIndexed = false
		this.mask?.dispose()
		this.mask = null
	}
}

export * from './actions'
