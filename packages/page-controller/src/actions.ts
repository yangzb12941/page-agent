/**
 * Copyright (C) 2025 Alibaba Group Holding Limited
 * 版权所有 (C) 2025 阿里巴巴集团控股有限公司
 * All rights reserved.
 * 保留所有权利。
 */
import type { InteractiveElementDomNode } from './dom/dom_tree/type'
import {
	clickPointer,
	disablePassThrough,
	enablePassThrough,
	getNativeValueSetter,
	isHTMLElement,
	isInputElement,
	isSelectElement,
	isTextAreaElement,
	movePointerToElement,
	waitFor,
} from './utils'

/**
 * actions.ts 文件是 Page Agent 系统中负责执行具体页面操作的工具集。它提供了一系列底层的 DOM 交互方法，将 AI 的抽象指令转化为真实的浏览器事件。
 * 主要功能模块如下：
 * 1. 元素定位与获取
 * getElementByIndex：从索引映射表（selectorMap）中安全地获取对应的 HTMLElement。如果找不到或类型不匹配，会抛出明确的错误。
 *
 * 2. 鼠标点击模拟 (clickElement)
 * 这是最复杂的操作之一，它严格遵循 W3C 指针事件规范，模拟真实用户的点击行为：
 * 事件序列：按顺序触发 pointerover → mouseover → pointerdown → mousedown → focus → pointerup → mouseup → click。
 * 命中测试 (Hit-test)：使用 elementFromPoint 找到点击坐标下最深层的实际元素，确保事件触发在正确的子元素上（例如点击按钮内部的图标）。
 * 自动滚动：确保元素在视口可见后再执行点击。
 *
 * 3. 文本输入 (inputTextElement)
 * 针对不同输入场景提供策略：
 * 标准输入框：使用原生赋值方法 getNativeValueSetter 修改 value 属性，并触发 input 事件。
 * ContentEditable 富文本：这是难点。代码采用“两步走”策略：
 * Plan A：发送合成事件 (InputEvent('beforeinput'))，适用于 React 等现代框架。
 * Plan B：如果 Plan A 失败（文本未实际插入），则使用已弃用但兼容性极强的 execCommand 进行回退，确保在 Slate.js 等编辑器中也能成功输入。
 *
 * 4. 下拉选项选择 (selectOptionElement)
 * 根据文本内容查找匹配的 <option>，更新 <select> 的值并手动触发 change 事件，以便页面框架（如 Vue/React）感知到值的变化。
 *
 * 5. 滚动控制 (scrollVertically / scrollHorizontally)
 * 智能容器查找：如果提供了特定元素，它会向上遍历父节点寻找最近的可滚动容器（检查 overflow 和 scrollHeight）。
 * 回退机制：如果找不到特定容器，则回退到全局页面滚动 (window.scrollBy)。
 * 边界检测：检测是否已经滚动到顶部/底部/左侧/右侧，并返回相应的提示信息（如 "Already at the bottom"），帮助 AI 判断当前状态。
 * 总结
 * 该文件是 Agent 的“手和脚”。它不只是简单地调用 element.click()，而是通过极其严谨的事件分发序列和边界处理，确保在各种复杂的现代前端框架（React, Vue, 各种富文本编辑器）下，自动化操作都能像真人一样稳定执行。
 */
/**
 * Get the HTMLElement by index from a selectorMap.
 * 从 selectorMap 中根据索引获取 HTMLElement。
 * @private Internal method, subject to change at any time.
 * @private 内部方法，随时可能变更。
 */
export function getElementByIndex(
	selectorMap: Map<number, InteractiveElementDomNode>,
	index: number
): HTMLElement {
	const interactiveNode = selectorMap.get(index)
	if (!interactiveNode) {
		throw new Error(`No interactive element found at index ${index}`)
	}

	const element = interactiveNode.ref
	if (!element) {
		throw new Error(`Element at index ${index} does not have a reference`)
	}

	if (!isHTMLElement(element)) {
		throw new Error(`Element at index ${index} is not an HTMLElement`)
	}

	return element
}

let lastClickedElement: HTMLElement | null = null

function blurLastClickedElement() {
	if (lastClickedElement) {
		lastClickedElement.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }))
		lastClickedElement.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }))
		lastClickedElement.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
		lastClickedElement.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }))
		lastClickedElement.blur()
		lastClickedElement = null
	}
}

/**
 * Simulate a full click following W3C Pointer Events + UI Events spec order:
 * pointerover/enter → mouseover/enter → pointerdown → mousedown → [focus] →
 * pointerup → mouseup → click
 * 模拟完整的点击操作，遵循 W3C 指针事件 + UI 事件规范顺序：
 * pointerover/enter → mouseover/enter → pointerdown → mousedown → [focus] →
 * pointerup → mouseup → click
 *
 * @private Internal method, subject to change at any time.
 * @private 内部方法，随时可能变更。
 */
export async function clickElement(element: HTMLElement) {
	blurLastClickedElement()

	lastClickedElement = element

	await scrollIntoViewIfNeeded(element)
	const frame = element.ownerDocument.defaultView?.frameElement
	if (frame) await scrollIntoViewIfNeeded(frame)

	const rect = element.getBoundingClientRect()
	const x = rect.left + rect.width / 2
	const y = rect.top + rect.height / 2

	await movePointerToElement(element, x, y)
	await clickPointer()

	await waitFor(0.1)

	// Hit-test to find the deepest element at click coordinates, matching
	// real browser behavior where events target the innermost element.
	// 点击坐标处进行命中测试以找到最深层的元素，匹配真实浏览器行为——事件目标为最内层元素。
	// @note This may hit a element in the blacklist
	// @note 可能会命中黑名单中的元素
	// TODO: This is a temporary workaround. Should have been handled during dom extraction.
	// TODO: 这是一个临时方案，应该在 DOM 提取时处理。
	const doc = element.ownerDocument
	await enablePassThrough()
	const hitTarget = doc.elementFromPoint(x, y)
	await disablePassThrough()
	const target =
		hitTarget instanceof HTMLElement && element.contains(hitTarget) ? hitTarget : element

	const pointerOpts = {
		bubbles: true,
		cancelable: true,
		clientX: x,
		clientY: y,
		pointerType: 'mouse',
	}
	const mouseOpts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }

	// Hover — pointer events first, then mouse events (spec order)
	// 悬停 — 先指针事件，后鼠标事件（规范顺序）
	target.dispatchEvent(new PointerEvent('pointerover', pointerOpts))
	target.dispatchEvent(new PointerEvent('pointerenter', { ...pointerOpts, bubbles: false }))
	target.dispatchEvent(new MouseEvent('mouseover', mouseOpts))
	target.dispatchEvent(new MouseEvent('mouseenter', { ...mouseOpts, bubbles: false }))

	// Press
	// 按下
	target.dispatchEvent(new PointerEvent('pointerdown', pointerOpts))
	target.dispatchEvent(new MouseEvent('mousedown', mouseOpts))

	// Focus is not part of the standard pointer/mouse event sequence
	// "undefined and varies between user agents".
	// 焦点不属于标准指针/鼠标事件序列的一部分，其行为“未定义且因用户代理而异”。
	// We focus the original element (nearest focusable ancestor), not the hit-test target, matching browser behavior.
	// 我们聚焦于原始元素（最近的可聚焦祖先），而非命中测试目标，以匹配浏览器行为。
	element.focus({ preventScroll: true })

	// Release
	// 释放
	target.dispatchEvent(new PointerEvent('pointerup', pointerOpts))
	target.dispatchEvent(new MouseEvent('mouseup', mouseOpts))

	// Click — activation behavior (navigation, form submit, etc.) triggers
	// via bubbling from target up to the interactive ancestor.
	// click —— 激活行为（导航、表单提交等）通过从目标冒泡到交互祖先触发。
	target.click()

	await waitFor(0.2)
}

/**
 * @private Internal method, subject to change at any time.
 * @private 内部方法，随时可能变更。
 */
export async function inputTextElement(element: HTMLElement, text: string) {
	const isContentEditable = element.isContentEditable
	if (!isInputElement(element) && !isTextAreaElement(element) && !isContentEditable) {
		throw new Error('Element is not an input, textarea, or contenteditable')
	}

	await clickElement(element)

	if (isContentEditable) {
		// Contenteditable support (partial)
		// contenteditable 支持（部分）
		// Not supported:
		// 不支持：
		// - Monaco/CodeMirror: Require direct JS instance access. No universal way to obtain.
		// - Monaco/CodeMirror：需要直接 JS 实例访问，没有通用获取方式。
		// - Draft.js: Not responsive to synthetic/execCommand/Range/DataTransfer. Unmaintained.
		// - Draft.js：对合成事件/execCommand/Range/DataTransfer 无响应，已不再维护。
		//
		// Strategy: Try Plan A (synthetic events) first, then verify and fall back
		// to Plan B (execCommand) if the text wasn't actually inserted.
		// 策略：先尝试方案 A（合成事件），然后验证，如果文本未实际插入则回退到方案 B (execCommand)。
		//
		// Plan A: Dispatch synthetic events
		// 方案 A：分发合成事件
		// Works: React contenteditable, Quill.
		// 适用于：React contenteditable，Quill。
		// Fails: Slate.js, some contenteditable editors that ignore synthetic events.
		// 不适用于：Slate.js，某些忽略合成事件的 contenteditable 编辑器。
		// Sequence: beforeinput -> mutation -> input -> change -> blur
		// 顺序：beforeinput -> mutation -> input -> change -> blur

		// Dispatch beforeinput + mutation + input for clearing
		// 分发 beforeinput + mutation + input 用于清除
		if (
			element.dispatchEvent(
				new InputEvent('beforeinput', {
					bubbles: true,
					cancelable: true,
					inputType: 'deleteContent',
				})
			)
		) {
			element.innerText = ''
			element.dispatchEvent(
				new InputEvent('input', {
					bubbles: true,
					inputType: 'deleteContent',
				})
			)
		}

		// Dispatch beforeinput + mutation + input for insertion (important for React apps)
		// 分发 beforeinput + mutation + input 用于插入（对 React 应用很重要）
		if (
			element.dispatchEvent(
				new InputEvent('beforeinput', {
					bubbles: true,
					cancelable: true,
					inputType: 'insertText',
					data: text,
				})
			)
		) {
			element.innerText = text
			element.dispatchEvent(
				new InputEvent('input', {
					bubbles: true,
					inputType: 'insertText',
					data: text,
				})
			)
		}

		// Verify Plan A worked by checking if the text was actually inserted
		// 通过检查文本是否实际插入来验证方案 A 是否成功
		const planASucceeded = element.innerText.trim() === text.trim()

		if (!planASucceeded) {
			// Plan B: execCommand fallback (deprecated but widely supported)
			// 方案 B：execCommand 回退（已弃用但广泛支持）
			// Works: Quill, Slate.js, react contenteditable components.
			// 适用于：Quill，Slate.js，react contenteditable 组件。
			// This approach integrates with the browser's undo stack and is handled
			// natively by most rich-text editors.
			// 此方法与浏览器的撤销栈集成，并被大多数富文本编辑器原生处理。
			element.focus()

			// Select all existing content and delete it
			// 选择所有现有内容并删除
			const doc = element.ownerDocument
			const selection = (doc.defaultView || window).getSelection()
			const range = doc.createRange()
			range.selectNodeContents(element)
			selection?.removeAllRanges()
			selection?.addRange(range)

			// eslint-disable-next-line @typescript-eslint/no-deprecated
			doc.execCommand('delete', false)
			// eslint-disable-next-line @typescript-eslint/no-deprecated
			doc.execCommand('insertText', false, text)
		}

		// Dispatch change event (for good measure)
		// 分发 change 事件（以备不时之需）
		element.dispatchEvent(new Event('change', { bubbles: true }))

		// Trigger blur for validation
		// 触发 blur 以进行验证
		element.blur()
	} else {
		getNativeValueSetter(element as HTMLInputElement | HTMLTextAreaElement).call(element, text)
	}

	// Only dispatch shared input event for non-contenteditable (contenteditable has its own)
	// 仅为非 contenteditable 分发共享的 input 事件（contenteditable 有自己的）
	if (!isContentEditable) {
		element.dispatchEvent(new Event('input', { bubbles: true }))
	}

	await waitFor(0.1)

	blurLastClickedElement()
}

/**
 * @todo browser-use version is very complex and supports menu tags, need to follow up
 * @todo browser-use 版本非常复杂且支持菜单标签，需要跟进
 * @private Internal method, subject to change at any time.
 * @private 内部方法，随时可能变更。
 */
export async function selectOptionElement(selectElement: HTMLSelectElement, optionText: string) {
	if (!isSelectElement(selectElement)) {
		throw new Error('Element is not a select element')
	}

	const options = Array.from(selectElement.options)
	const option = options.find((opt) => opt.textContent?.trim() === optionText.trim())

	if (!option) {
		throw new Error(`Option with text "${optionText}" not found in select element`)
	}

	selectElement.value = option.value
	selectElement.dispatchEvent(new Event('change', { bubbles: true }))

	await waitFor(0.1) // Wait to ensure change event processing completes
	// 等待以确保 change 事件处理完成
}

interface ScrollableElement extends Element {
	scrollIntoViewIfNeeded?: (centerIfNeeded?: boolean) => void
}

/**
 * @private Internal method, subject to change at any time.
 * @private 内部方法，随时可能变更。
 */
export async function scrollIntoViewIfNeeded(element: Element) {
	const el = element as ScrollableElement
	if (typeof el.scrollIntoViewIfNeeded === 'function') {
		el.scrollIntoViewIfNeeded()
		// await waitFor(0.5) // Animation playback
		// 动画播放
	} else {
		// @todo visibility check
		// @todo 可见性检查
		element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' })
		// await waitFor(0.5) // Animation playback
		// 动画播放
	}
}

export async function scrollVertically(scroll_amount: number, element?: HTMLElement | null) {
	// Element-specific scrolling if element is provided
	// 如果提供了元素，则进行特定元素的滚动
	if (element) {
		const targetElement = element
		let currentElement = targetElement as HTMLElement | null
		let scrollSuccess = false
		let scrolledElement: HTMLElement | null = null
		let scrollDelta = 0
		let attempts = 0
		const dy = scroll_amount

		while (currentElement && attempts < 10) {
			const computedStyle = window.getComputedStyle(currentElement)
			const hasScrollableY =
				/(auto|scroll|overlay)/.test(computedStyle.overflowY) ||
				(computedStyle.scrollbarWidth && computedStyle.scrollbarWidth !== 'auto') ||
				(computedStyle.scrollbarGutter && computedStyle.scrollbarGutter !== 'auto')
			const canScrollVertically = currentElement.scrollHeight > currentElement.clientHeight

			if (hasScrollableY && canScrollVertically) {
				const beforeScroll = currentElement.scrollTop
				const maxScroll = currentElement.scrollHeight - currentElement.clientHeight

				let scrollAmount = dy / 3

				if (scrollAmount > 0) {
					scrollAmount = Math.min(scrollAmount, maxScroll - beforeScroll)
				} else {
					scrollAmount = Math.max(scrollAmount, -beforeScroll)
				}

				currentElement.scrollTop = beforeScroll + scrollAmount

				const afterScroll = currentElement.scrollTop
				const actualScrollDelta = afterScroll - beforeScroll

				if (Math.abs(actualScrollDelta) > 0.5) {
					scrollSuccess = true
					scrolledElement = currentElement
					scrollDelta = actualScrollDelta
					break
				}
			}

			if (currentElement === document.body || currentElement === document.documentElement) {
				break
			}
			currentElement = currentElement.parentElement
			attempts++
		}

		if (scrollSuccess) {
			return `Scrolled container (${scrolledElement?.tagName}) by ${scrollDelta}px`
		} else {
			return `No scrollable container found for element (${targetElement.tagName})`
		}
	}

	// Page-level scrolling (default or fallback)
	// 页面级滚动（默认或回退）

	const dy = scroll_amount
	const bigEnough = (el: HTMLElement) => el.clientHeight >= window.innerHeight * 0.5
	const canScroll = (el: HTMLElement | null): boolean =>
		Boolean(
			el &&
			/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY) &&
			el.scrollHeight > el.clientHeight &&
			bigEnough(el)
		)

	// @deprecated Heuristic container search.
	// @deprecated 启发式容器搜索。
	// Unreliable in multi-panel layouts. Should guide LLMs to use indexed scroll for consistency.
	// 在多面板布局中不可靠。应引导 LLM 使用索引滚动以保持一致性。
	// TODO: remove this fallback
	// TODO: 移除此回退

	// try to find the nearest scrollable container
	// 尝试找到最近的可滚动容器
	// document.activeElement is usually body.
	// document.activeElement 通常是 body。
	// After a successful element.focus(), activeElement become the nearest focusable parent
	// 成功调用 element.focus() 后，activeElement 变为最近的可聚焦父元素

	let el: HTMLElement | null = document.activeElement as HTMLElement | null
	while (el && !canScroll(el) && el !== document.body) el = el.parentElement

	// Something is wrong if it falls back to global '*' search
	// 如果回退到全局 '*' 搜索，则说明有问题
	// TODO: Return error message instead of global '*' search
	// TODO: 返回错误信息而非全局 '*' 搜索

	el = canScroll(el)
		? el
		: Array.from(document.querySelectorAll<HTMLElement>('*')).find(canScroll) ||
			(document.scrollingElement as HTMLElement) ||
			(document.documentElement as HTMLElement)

	if (el === document.scrollingElement || el === document.documentElement || el === document.body) {
		// Page-level scroll
		// 页面级滚动
		const scrollBefore = window.scrollY
		const scrollMax = document.documentElement.scrollHeight - window.innerHeight

		window.scrollBy(0, dy)

		const scrollAfter = window.scrollY
		const scrolled = scrollAfter - scrollBefore

		if (Math.abs(scrolled) < 1) {
			return dy > 0
				? `⚠️ Already at the bottom of the page, cannot scroll down further.`
				: `⚠️ Already at the top of the page, cannot scroll up further.`
		}

		const reachedBottom = dy > 0 && scrollAfter >= scrollMax - 1
		const reachedTop = dy < 0 && scrollAfter <= 1

		if (reachedBottom) return `✅ Scrolled page by ${scrolled}px. Reached the bottom of the page.`
		if (reachedTop) return `✅ Scrolled page by ${scrolled}px. Reached the top of the page.`
		return `✅ Scrolled page by ${scrolled}px.`
	} else {
		// Container scroll
		// 容器滚动

		const warningMsg = `The document is not scrollable. Falling back to container scroll.`
		console.log(`[PageController] ${warningMsg}`)

		const scrollBefore = el!.scrollTop
		const scrollMax = el!.scrollHeight - el!.clientHeight

		el!.scrollBy({ top: dy, behavior: 'smooth' })
		await waitFor(0.1)

		const scrollAfter = el!.scrollTop
		const scrolled = scrollAfter - scrollBefore

		if (Math.abs(scrolled) < 1) {
			return dy > 0
				? `⚠️ ${warningMsg} Already at the bottom of container (${el!.tagName}), cannot scroll down further.`
				: `⚠️ ${warningMsg} Already at the top of container (${el!.tagName}), cannot scroll up further.`
		}

		const reachedBottom = dy > 0 && scrollAfter >= scrollMax - 1
		const reachedTop = dy < 0 && scrollAfter <= 1

		if (reachedBottom)
			return `✅ ${warningMsg} Scrolled container (${el!.tagName}) by ${scrolled}px. Reached the bottom.`
		if (reachedTop)
			return `✅ ${warningMsg} Scrolled container (${el!.tagName}) by ${scrolled}px. Reached the top.`
		return `✅ ${warningMsg} Scrolled container (${el!.tagName}) by ${scrolled}px.`
	}
}

export async function scrollHorizontally(scroll_amount: number, element?: HTMLElement | null) {
	// Element-specific scrolling if element is provided
	// 如果提供了元素，则进行特定元素的水平滚动
	if (element) {
		const targetElement = element
		let currentElement = targetElement as HTMLElement | null
		let scrollSuccess = false
		let scrolledElement: HTMLElement | null = null
		let scrollDelta = 0
		let attempts = 0
		const dx = scroll_amount

		while (currentElement && attempts < 10) {
			const computedStyle = window.getComputedStyle(currentElement)
			const hasScrollableX =
				/(auto|scroll|overlay)/.test(computedStyle.overflowX) ||
				(computedStyle.scrollbarWidth && computedStyle.scrollbarWidth !== 'auto') ||
				(computedStyle.scrollbarGutter && computedStyle.scrollbarGutter !== 'auto')
			const canScrollHorizontally = currentElement.scrollWidth > currentElement.clientWidth

			if (hasScrollableX && canScrollHorizontally) {
				const beforeScroll = currentElement.scrollLeft
				const maxScroll = currentElement.scrollWidth - currentElement.clientWidth

				let scrollAmount = dx / 3

				if (scrollAmount > 0) {
					scrollAmount = Math.min(scrollAmount, maxScroll - beforeScroll)
				} else {
					scrollAmount = Math.max(scrollAmount, -beforeScroll)
				}

				currentElement.scrollLeft = beforeScroll + scrollAmount

				const afterScroll = currentElement.scrollLeft
				const actualScrollDelta = afterScroll - beforeScroll

				if (Math.abs(actualScrollDelta) > 0.5) {
					scrollSuccess = true
					scrolledElement = currentElement
					scrollDelta = actualScrollDelta
					break
				}
			}

			if (currentElement === document.body || currentElement === document.documentElement) {
				break
			}
			currentElement = currentElement.parentElement
			attempts++
		}

		if (scrollSuccess) {
			return `Scrolled container (${scrolledElement?.tagName}) horizontally by ${scrollDelta}px`
		} else {
			return `No horizontally scrollable container found for element (${targetElement.tagName})`
		}
	}

	// Page-level scrolling (default or fallback)
	// 页面级水平滚动（默认或回退）

	const dx = scroll_amount

	const bigEnough = (el: HTMLElement) => el.clientWidth >= window.innerWidth * 0.5
	const canScroll = (el: HTMLElement | null): boolean =>
		Boolean(
			el &&
			/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowX) &&
			el.scrollWidth > el.clientWidth &&
			bigEnough(el)
		)

	// @deprecated Same heuristic container search as scrollVertically.
	// @deprecated 与 scrollVertically 相同的启发式容器搜索。
	// TODO: Remove once LLMs reliably use indexed scrolling via data-scrollable.
	// TODO: 一旦 LLM 可靠地通过 data-scrollable 使用索引滚动后移除。

	let el: HTMLElement | null = document.activeElement as HTMLElement | null
	while (el && !canScroll(el) && el !== document.body) el = el.parentElement

	el = canScroll(el)
		? el
		: Array.from(document.querySelectorAll<HTMLElement>('*')).find(canScroll) ||
			(document.scrollingElement as HTMLElement) ||
			(document.documentElement as HTMLElement)

	if (el === document.scrollingElement || el === document.documentElement || el === document.body) {
		// Page-level scroll
		// 页面级滚动
		const scrollBefore = window.scrollX
		const scrollMax = document.documentElement.scrollWidth - window.innerWidth

		window.scrollBy(dx, 0)

		const scrollAfter = window.scrollX
		const scrolled = scrollAfter - scrollBefore

		if (Math.abs(scrolled) < 1) {
			return dx > 0
				? `⚠️ Already at the right edge of the page, cannot scroll right further.`
				: `⚠️ Already at the left edge of the page, cannot scroll left further.`
		}

		const reachedRight = dx > 0 && scrollAfter >= scrollMax - 1
		const reachedLeft = dx < 0 && scrollAfter <= 1

		if (reachedRight)
			return `✅ Scrolled page by ${scrolled}px. Reached the right edge of the page.`
		if (reachedLeft) return `✅ Scrolled page by ${scrolled}px. Reached the left edge of the page.`
		return `✅ Scrolled page horizontally by ${scrolled}px.`
	} else {
		// Container scroll
		// 容器滚动
		const warningMsg = `The document is not scrollable. Falling back to container scroll.`
		console.log(`[PageController] ${warningMsg}`)

		const scrollBefore = el!.scrollLeft
		const scrollMax = el!.scrollWidth - el!.clientWidth

		el!.scrollBy({ left: dx, behavior: 'smooth' })
		await waitFor(0.1)

		const scrollAfter = el!.scrollLeft
		const scrolled = scrollAfter - scrollBefore

		if (Math.abs(scrolled) < 1) {
			return dx > 0
				? `⚠️ ${warningMsg} Already at the right edge of container (${el!.tagName}), cannot scroll right further.`
				: `⚠️ ${warningMsg} Already at the left edge of container (${el!.tagName}), cannot scroll left further.`
		}

		const reachedRight = dx > 0 && scrollAfter >= scrollMax - 1
		const reachedLeft = dx < 0 && scrollAfter <= 1

		if (reachedRight)
			return `✅ ${warningMsg} Scrolled container (${el!.tagName}) by ${scrolled}px. Reached the right edge.`
		if (reachedLeft)
			return `✅ ${warningMsg} Scrolled container (${el!.tagName}) by ${scrolled}px. Reached the left edge.`
		return `✅ ${warningMsg} Scrolled container (${el!.tagName}) horizontally by ${scrolled}px.`
	}
}
