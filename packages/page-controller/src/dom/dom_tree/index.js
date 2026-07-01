/**
 * @file port from browser-use
 * @file 从 browser-use 移植而来
 * @see https://github.com/browser-use/browser-use/commits/main/browser_use/dom/dom_tree/index.js
 * @match 0.5.9 d51b6e73daff7165fdd3e44debd667e7f5f7fdc5
 *
 * search @edit for all the changed lines.
 * 搜索 @edit 查看所有变更行。
 *
 * @edit export
 * @edit 导出
 * @edit add interactiveBlacklist interactiveWhitelist
 * @edit 添加 interactiveBlacklist 和 interactiveWhitelist
 * @edit adjustable opacity
 * @edit 可调整透明度
 * @edit direct dom ref
 * @edit 直接 DOM 引用
 * @edit @workaround input.checked
 * @edit @workaround 处理 input.checked
 * @edit smaller zIndex for highlight
 * @edit 高亮使用更小的 zIndex
 * @edit no need for xpath
 * @edit 无需 xpath
 * @edit add `extra` field for extra data
 * @edit 添加 `extra` 字段用于额外数据
 * @edit scrollable element detection
 * @edit 可滚动元素检测
 * @edit add `data-browser-use-ignore` attribute
 * @edit 添加 `data-browser-use-ignore` 属性
 * @edit improve `sampleRect`, filter out rects with 0 area
 * @edit 改进 `sampleRect`，过滤掉面积为 0 的 rect
 * @edit exclude aria-hidden elements
 * @edit 排除 aria-hidden 元素
 * @edit make sure attributes exist for interactive candidates.
 * @edit 确保交互候选元素存在属性。
 * @edit fix "aria-*" attributes check
 * @edit 修复 "aria-*" 属性检查
 */

export default (
	args = {
		doHighlightElements: true,
		focusHighlightIndex: -1,
		viewportExpansion: 0,
		debugMode: false,

		/**
		 * @edit
		 * 编辑
		 */
		/** @type {Element[]} */
		interactiveBlacklist: [],
		/** @type {Element[]} */
		interactiveWhitelist: [],
		highlightOpacity: 0.1,
		highlightLabelOpacity: 0.5,
	}
) => {
	/**
	 * @edit
	 * 编辑
	 */
	const { interactiveBlacklist, interactiveWhitelist, highlightOpacity, highlightLabelOpacity } =
		args

	const { doHighlightElements, focusHighlightIndex, viewportExpansion, debugMode } = args
	let highlightIndex = 0 // Reset highlight index
	// 重置高亮索引

	/**
	 * @edit add `extra` field for extra data
	 * @edit 添加 `extra` 字段用于额外数据
	 */
	const extraData = new WeakMap()
	function addExtraData(element, data) {
		if (!element || element.nodeType !== Node.ELEMENT_NODE) return
		extraData.set(element, { ...extraData.get(element), ...data })
	}

	// Add caching mechanisms at the top level
	// 在顶层添加缓存机制
	const DOM_CACHE = {
		boundingRects: new WeakMap(),
		clientRects: new WeakMap(),
		computedStyles: new WeakMap(),
		clearCache: () => {
			DOM_CACHE.boundingRects = new WeakMap()
			DOM_CACHE.clientRects = new WeakMap()
			DOM_CACHE.computedStyles = new WeakMap()
		},
	}

	/**
	 * Gets the cached bounding rect for an element.
	 * 获取元素缓存的边界矩形。
	 *
	 * @param {HTMLElement} element - The element to get the bounding rect for.
	 * @param {HTMLElement} element - 要获取边界矩形的元素。
	 * @returns {DOMRect | null} The cached bounding rect, or null if the element is not found.
	 * @returns {DOMRect | null} 缓存的边界矩形，如果未找到元素则返回 null。
	 */
	function getCachedBoundingRect(element) {
		if (!element) return null

		if (DOM_CACHE.boundingRects.has(element)) {
			return DOM_CACHE.boundingRects.get(element)
		}

		const rect = element.getBoundingClientRect()

		if (rect) {
			DOM_CACHE.boundingRects.set(element, rect)
		}
		return rect
	}

	/**
	 * Gets the cached computed style for an element.
	 * 获取元素缓存的计算样式。
	 *
	 * @param {HTMLElement} element - The element to get the computed style for.
	 * @param {HTMLElement} element - 要获取计算样式的元素。
	 * @returns {CSSStyleDeclaration | null} The cached computed style, or null if the element is not found.
	 * @returns {CSSStyleDeclaration | null} 缓存的计算样式，如果未找到元素则返回 null。
	 */
	function getCachedComputedStyle(element) {
		if (!element) return null

		if (DOM_CACHE.computedStyles.has(element)) {
			return DOM_CACHE.computedStyles.get(element)
		}

		const style = window.getComputedStyle(element)

		if (style) {
			DOM_CACHE.computedStyles.set(element, style)
		}
		return style
	}

	/**
	 * Gets the cached client rects for an element.
	 * 获取元素缓存的客户端矩形列表。
	 *
	 * @param {HTMLElement} element - The element to get the client rects for.
	 * @param {HTMLElement} element - 要获取客户端矩形的元素。
	 * @returns {DOMRectList | null} The cached client rects, or null if the element is not found.
	 * @returns {DOMRectList | null} 缓存的客户端矩形列表，如果未找到元素则返回 null。
	 */
	function getCachedClientRects(element) {
		if (!element) return null

		if (DOM_CACHE.clientRects.has(element)) {
			return DOM_CACHE.clientRects.get(element)
		}

		const rects = element.getClientRects()

		if (rects) {
			DOM_CACHE.clientRects.set(element, rects)
		}
		return rects
	}

	/**
	 * Hash map of DOM nodes indexed by their highlight index.
	 * 以高亮索引为键的 DOM 节点哈希映射。
	 *
	 * @type {Object<string, any>}
	 */
	const DOM_HASH_MAP = {}

	const ID = { current: 0 }

	const HIGHLIGHT_CONTAINER_ID = 'playwright-highlight-container'

	// Add a WeakMap cache for XPath strings
	// 为 XPath 字符串添加 WeakMap 缓存
	const xpathCache = new WeakMap()

	// // Initialize once and reuse
	// // 初始化一次并复用
	// const viewportObserver = new IntersectionObserver(
	//   (entries) => {
	//     entries.forEach(entry => {
	//       elementVisibilityMap.set(entry.target, entry.isIntersecting);
	//     });
	//   },
	//   { rootMargin: `${viewportExpansion}px` }
	// );

	/**
	 * Highlights an element in the DOM and returns the index of the next element.
	 * 在 DOM 中高亮一个元素，并返回下一个元素的索引。
	 *
	 * @param {HTMLElement} element - The element to highlight.
	 * @param {HTMLElement} element - 要高亮的元素。
	 * @param {number} index - The index of the element.
	 * @param {number} index - 元素的索引。
	 * @param {HTMLElement | null} parentIframe - The parent iframe node.
	 * @param {HTMLElement | null} parentIframe - 父 iframe 节点。
	 * @returns {number} The index of the next element.
	 * @returns {number} 下一个元素的索引。
	 */
	function highlightElement(element, index, parentIframe = null) {
		if (!element) return index

		const overlays = []
		/**
		 * @type {HTMLElement | null}
		 */
		let label = null
		let labelWidth = 20
		let labelHeight = 16
		let cleanupFn = null

		try {
			// Create or get highlight container
			// 创建或获取高亮容器
			let container = document.getElementById(HIGHLIGHT_CONTAINER_ID)
			if (!container) {
				container = document.createElement('div')
				container.id = HIGHLIGHT_CONTAINER_ID
				container.style.position = 'fixed'
				container.style.pointerEvents = 'none'
				container.style.top = '0'
				container.style.left = '0'
				container.style.width = '100%'
				container.style.height = '100%'

				/**
				 * @edit smaller zIndex for highlight
				 * @edit 高亮使用更小的 zIndex
				 */
				// Use the maximum valid value in zIndex to ensure the element is not blocked by overlapping elements.
				// 使用 zIndex 中有效的最大值，确保元素不被重叠元素遮挡。
				// container.style.zIndex = "2147483647";
				container.style.zIndex = '2147483640'

				container.style.backgroundColor = 'transparent'
				document.body.appendChild(container)
			}

			// Get element client rects
			// 获取元素的客户端矩形
			const rects = element.getClientRects() // Use getClientRects()

			if (!rects || rects.length === 0) return index // Exit if no rects
			// 若无 rect 则退出

			// Generate a color based on the index
			// 根据索引生成颜色
			const colors = [
				'#FF0000',
				'#00FF00',
				'#0000FF',
				'#FFA500',
				'#800080',
				'#008080',
				'#FF69B4',
				'#4B0082',
				'#FF4500',
				'#2E8B57',
				'#DC143C',
				'#4682B4',
			]
			const colorIndex = index % colors.length
			let baseColor = colors[colorIndex]

			/**
			 * @edit adjustable opacity
			 * @edit 可调整透明度
			 */
			// const backgroundColor = baseColor + "1A"; // 10% opacity version of the color
			// 原颜色 10% 不透明度版本
			const backgroundColor =
				baseColor +
				Math.floor(highlightOpacity * 255)
					.toString(16)
					.padStart(2, '0')
			baseColor =
				baseColor +
				Math.floor(highlightLabelOpacity * 255)
					.toString(16)
					.padStart(2, '0')

			// Get iframe offset if necessary
			// 必要时获取 iframe 偏移量
			let iframeOffset = { x: 0, y: 0 }
			if (parentIframe) {
				const iframeRect = parentIframe.getBoundingClientRect() // Keep getBoundingClientRect for iframe offset
				// 为 iframe 偏移保留 getBoundingClientRect
				iframeOffset.x = iframeRect.left
				iframeOffset.y = iframeRect.top
			}

			// Create fragment to hold overlay elements
			// 创建文档片段以容纳覆盖元素
			const fragment = document.createDocumentFragment()

			// Create highlight overlays for each client rect
			// 为每个客户端矩形创建高亮覆盖层
			for (const rect of rects) {
				if (rect.width === 0 || rect.height === 0) continue // Skip empty rects
				// 跳过空矩形

				const overlay = document.createElement('div')
				overlay.style.position = 'fixed'
				overlay.style.border = `2px solid ${baseColor}`
				overlay.style.backgroundColor = backgroundColor
				overlay.style.pointerEvents = 'none'
				overlay.style.boxSizing = 'border-box'

				const top = rect.top + iframeOffset.y
				const left = rect.left + iframeOffset.x

				overlay.style.top = `${top}px`
				overlay.style.left = `${left}px`
				overlay.style.width = `${rect.width}px`
				overlay.style.height = `${rect.height}px`

				fragment.appendChild(overlay)
				overlays.push({ element: overlay, initialRect: rect }) // Store overlay and its rect
				// 存储覆盖层及其 rect
			}

			// Create and position a single label relative to the first rect
			// 创建并定位一个相对于第一个矩形的标签
			const firstRect = rects[0]
			label = document.createElement('div')
			label.className = 'playwright-highlight-label'
			label.style.position = 'fixed'
			label.style.background = baseColor
			label.style.color = 'white'
			label.style.padding = '1px 4px'
			label.style.borderRadius = '4px'
			label.style.fontSize = `${Math.min(12, Math.max(8, firstRect.height / 2))}px`
			label.textContent = index.toString()

			labelWidth = label.offsetWidth > 0 ? label.offsetWidth : labelWidth // Update actual width if possible
			labelHeight = label.offsetHeight > 0 ? label.offsetHeight : labelHeight // Update actual height if possible
			// 尽可能更新实际宽高

			const firstRectTop = firstRect.top + iframeOffset.y
			const firstRectLeft = firstRect.left + iframeOffset.x

			let labelTop = firstRectTop + 2
			let labelLeft = firstRectLeft + firstRect.width - labelWidth - 2

			// Adjust label position if first rect is too small
			// 如果第一个矩形太小，调整标签位置
			if (firstRect.width < labelWidth + 4 || firstRect.height < labelHeight + 4) {
				labelTop = firstRectTop - labelHeight - 2
				labelLeft = firstRectLeft + firstRect.width - labelWidth // Align with right edge
				// 与右边缘对齐
				if (labelLeft < iframeOffset.x) labelLeft = firstRectLeft // Prevent going off-left
				// 防止左偏移
			}

			// Ensure label stays within viewport bounds slightly better
			// 确保标签保持在视口边界内
			labelTop = Math.max(0, Math.min(labelTop, window.innerHeight - labelHeight))
			labelLeft = Math.max(0, Math.min(labelLeft, window.innerWidth - labelWidth))

			label.style.top = `${labelTop}px`
			label.style.left = `${labelLeft}px`

			fragment.appendChild(label)

			// Update positions on scroll/resize
			// 在滚动/调整大小时更新位置
			const updatePositions = () => {
				const newRects = element.getClientRects() // Get fresh rects
				// 获取新 rect
				let newIframeOffset = { x: 0, y: 0 }

				if (parentIframe) {
					const iframeRect = parentIframe.getBoundingClientRect() // Keep getBoundingClientRect for iframe
					// 为 iframe 保留 getBoundingClientRect
					newIframeOffset.x = iframeRect.left
					newIframeOffset.y = iframeRect.top
				}

				// Update each overlay
				// 更新每个覆盖层
				overlays.forEach((overlayData, i) => {
					if (i < newRects.length) {
						// Check if rect still exists
						// 检查 rect 是否仍存在
						const newRect = newRects[i]
						const newTop = newRect.top + newIframeOffset.y
						const newLeft = newRect.left + newIframeOffset.x

						overlayData.element.style.top = `${newTop}px`
						overlayData.element.style.left = `${newLeft}px`
						overlayData.element.style.width = `${newRect.width}px`
						overlayData.element.style.height = `${newRect.height}px`
						overlayData.element.style.display =
							newRect.width === 0 || newRect.height === 0 ? 'none' : 'block'
					} else {
						// If fewer rects now, hide extra overlays
						// 如果现在 rect 更少，隐藏多余的覆盖层
						overlayData.element.style.display = 'none'
					}
				})

				// If there are fewer new rects than overlays, hide the extras
				// 如果新 rect 数量少于覆盖层，隐藏多余的
				if (newRects.length < overlays.length) {
					for (let i = newRects.length; i < overlays.length; i++) {
						overlays[i].element.style.display = 'none'
					}
				}

				// Update label position based on the first new rect
				// 根据第一个新矩形更新标签位置
				if (label && newRects.length > 0) {
					const firstNewRect = newRects[0]
					const firstNewRectTop = firstNewRect.top + newIframeOffset.y
					const firstNewRectLeft = firstNewRect.left + newIframeOffset.x

					let newLabelTop = firstNewRectTop + 2
					let newLabelLeft = firstNewRectLeft + firstNewRect.width - labelWidth - 2

					if (firstNewRect.width < labelWidth + 4 || firstNewRect.height < labelHeight + 4) {
						newLabelTop = firstNewRectTop - labelHeight - 2
						newLabelLeft = firstNewRectLeft + firstNewRect.width - labelWidth
						if (newLabelLeft < newIframeOffset.x) newLabelLeft = firstNewRectLeft
					}

					// Ensure label stays within viewport bounds
					// 确保标签保持在视口边界内
					newLabelTop = Math.max(0, Math.min(newLabelTop, window.innerHeight - labelHeight))
					newLabelLeft = Math.max(0, Math.min(newLabelLeft, window.innerWidth - labelWidth))

					label.style.top = `${newLabelTop}px`
					label.style.left = `${newLabelLeft}px`
					label.style.display = 'block'
				} else if (label) {
					// Hide label if element has no rects anymore
					// 如果元素没有 rect，隐藏标签
					label.style.display = 'none'
				}
			}

			const throttleFunction = (func, delay) => {
				let lastCall = 0
				return (...args) => {
					const now = performance.now()
					if (now - lastCall < delay) return
					lastCall = now
					return func(...args)
				}
			}

			const throttledUpdatePositions = throttleFunction(updatePositions, 16) // ~60fps
			window.addEventListener('scroll', throttledUpdatePositions, true)
			window.addEventListener('resize', throttledUpdatePositions)

			// Add cleanup function
			// 添加清理函数
			cleanupFn = () => {
				window.removeEventListener('scroll', throttledUpdatePositions, true)
				window.removeEventListener('resize', throttledUpdatePositions)
				// Remove overlay elements if needed
				// 如有必要移除覆盖层元素
				overlays.forEach((overlay) => overlay.element.remove())
				if (label) label.remove()
			}

			// Then add fragment to container in one operation
			// 然后将片段一次性添加到容器
			container.appendChild(fragment)

			return index + 1
		} finally {
			// Store cleanup function for later use
			// 存储清理函数以供后续使用
			if (cleanupFn) {
				// Keep a reference to cleanup functions in a global array
				// 在全局数组中保留对清理函数的引用
				;(window._highlightCleanupFunctions = window._highlightCleanupFunctions || []).push(
					cleanupFn
				)
			}
		}
	}

	// // Add this function to perform cleanup when needed
	// // 添加此函数以在需要时执行清理
	// function cleanupHighlights() {
	//   if (window._highlightCleanupFunctions && window._highlightCleanupFunctions.length) {
	//     window._highlightCleanupFunctions.forEach(fn => fn());
	//     window._highlightCleanupFunctions = [];
	//   }

	//   // Also remove the container
	//   // 同时移除容器
	//   const container = document.getElementById(HIGHLIGHT_CONTAINER_ID);
	//   if (container) container.remove();
	// }

	/**
	 * Gets the position of an element in its parent.
	 * 获取元素在其父元素中的位置。
	 *
	 * @param {HTMLElement} currentElement - The element to get the position for.
	 * @param {HTMLElement} currentElement - 要获取位置的元素。
	 * @returns {number} The position of the element in its parent.
	 * @returns {number} 元素在其父元素中的位置。
	 */
	function getElementPosition(currentElement) {
		if (!currentElement.parentElement) {
			return 0 // No parent means no siblings
			// 没有父元素意味着没有兄弟元素
		}

		const tagName = currentElement.nodeName.toLowerCase()

		const siblings = Array.from(currentElement.parentElement.children).filter(
			(sib) => sib.nodeName.toLowerCase() === tagName
		)

		if (siblings.length === 1) {
			return 0 // Only element of its type
			// 仅此类型的元素
		}

		const index = siblings.indexOf(currentElement) + 1 // 1-based index
		// 从1开始的索引
		return index
	}

	function getXPathTree(element, stopAtBoundary = true) {
		if (xpathCache.has(element)) return xpathCache.get(element)

		const segments = []
		let currentElement = element

		while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE) {
			// Stop if we hit a shadow root or iframe
			// 如果遇到 shadow root 或 iframe 则停止
			if (
				stopAtBoundary &&
				(currentElement.parentNode instanceof ShadowRoot ||
					currentElement.parentNode instanceof HTMLIFrameElement)
			) {
				break
			}

			const position = getElementPosition(currentElement)
			const tagName = currentElement.nodeName.toLowerCase()
			const xpathIndex = position > 0 ? `[${position}]` : ''
			segments.unshift(`${tagName}${xpathIndex}`)

			currentElement = currentElement.parentNode
		}

		const result = segments.join('/')
		xpathCache.set(element, result)
		return result
	}

	/**
	 * @edit scrollable element detection
	 * @edit 可滚动元素检测
	 * Checks if an element is scrollable. if so, return the scrollable distance on each direction (left right top bottom). if not return null.
	 * 检查元素是否可滚动。如果是，返回各方向（左、右、上、下）的可滚动距离；否则返回 null。
	 * @note distance smaller than 4 will be considered as not scrollable.
	 * @note 距离小于 4 将被视为不可滚动。
	 * @note only check block elements, not inline elements.
	 * @note 仅检查块级元素，不检查内联元素。
	 */
	function isScrollableElement(element) {
		if (!element || element.nodeType !== Node.ELEMENT_NODE) {
			return null // Not a valid element
			// 不是有效元素
		}

		const style = getCachedComputedStyle(element)
		if (!style) return null

		// Check if the element is a block-level element
		// 检查元素是否为块级元素
		const display = style.display
		if (display === 'inline' || display === 'inline-block') {
			return null // Not a block-level element
			// 不是块级元素
		}

		// Check overflow properties
		// 检查溢出属性
		const overflowX = style.overflowX
		const overflowY = style.overflowY

		// scrollbar-width/scrollbar-gutter are only set on elements designed to scroll;
		// their presence signals scroll intent even when overflow is hidden (e.g. overflow: auto on :hover)
		// scrollbar-width/scrollbar-gutter 仅用于设计为滚动的元素；
		// 即使 overflow 被隐藏（例如 :hover 时的 overflow: auto），它们的出现也表明滚动意图。
		const hasScrollbarSignal =
			(style.scrollbarWidth && style.scrollbarWidth !== 'auto') ||
			(style.scrollbarGutter && style.scrollbarGutter !== 'auto')

		const scrollableX = overflowX === 'auto' || overflowX === 'scroll'
		const scrollableY = overflowY === 'auto' || overflowY === 'scroll'

		if (!scrollableX && !scrollableY && !hasScrollbarSignal) {
			return null // Not scrollable in any direction
			// 任何方向均不可滚动
		}

		const scrollWidth = element.scrollWidth - element.clientWidth
		const scrollHeight = element.scrollHeight - element.clientHeight

		// Consider small distances as not scrollable
		// 小距离视为不可滚动
		const threshold = 4

		if (scrollWidth < threshold && scrollHeight < threshold) {
			return null // Not scrollable
			// 不可滚动
		}

		if (!scrollableY && !hasScrollbarSignal && scrollWidth < threshold) {
			return null // Not scrollable horizontally
			// 水平不可滚动
		}

		if (!scrollableX && !hasScrollbarSignal && scrollHeight < threshold) {
			return null // Not scrollable vertically
			// 垂直不可滚动
		}

		const distanceToTop = element.scrollTop
		const distanceToLeft = element.scrollLeft
		const distanceToRight = element.scrollWidth - element.clientWidth - element.scrollLeft
		const distanceToBottom = element.scrollHeight - element.clientHeight - element.scrollTop

		const scrollData = {
			top: distanceToTop,
			right: distanceToRight,
			bottom: distanceToBottom,
			left: distanceToLeft,
		}

		// Store extra data for the element
		// 为元素存储额外数据
		addExtraData(element, {
			scrollable: true,
			scrollData: scrollData,
		})

		return scrollData
	}

	/**
	 * Checks if a text node is visible.
	 * 检查文本节点是否可见。
	 *
	 * @param {Text} textNode - The text node to check.
	 * @param {Text} textNode - 要检查的文本节点。
	 * @returns {boolean} Whether the text node is visible.
	 * @returns {boolean} 文本节点是否可见。
	 */
	function isTextNodeVisible(textNode) {
		try {
			// Special case: when viewportExpansion is -1, consider all text nodes as visible
			// 特殊情况：当 viewportExpansion 为 -1 时，所有文本节点视为可见
			if (viewportExpansion === -1) {
				// Still check parent visibility for basic filtering
				// 仍检查父元素可见性以进行基本过滤
				const parentElement = textNode.parentElement
				if (!parentElement) return false

				try {
					return parentElement.checkVisibility({
						checkOpacity: true,
						checkVisibilityCSS: true,
					})
				} catch (e) {
					// Fallback if checkVisibility is not supported
					// 如果不支持 checkVisibility 则回退
					const style = window.getComputedStyle(parentElement)
					return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
				}
			}

			const range = document.createRange()
			range.selectNodeContents(textNode)
			const rects = range.getClientRects() // Use getClientRects for Range
			// 使用 Range 的 getClientRects

			if (!rects || rects.length === 0) {
				return false
			}

			let isAnyRectVisible = false
			let isAnyRectInViewport = false

			for (const rect of rects) {
				// Check size
				// 检查大小
				if (rect.width > 0 && rect.height > 0) {
					isAnyRectVisible = true

					// Viewport check for this rect
					// 对此 rect 进行视口检查
					if (
						!(
							rect.bottom < -viewportExpansion ||
							rect.top > window.innerHeight + viewportExpansion ||
							rect.right < -viewportExpansion ||
							rect.left > window.innerWidth + viewportExpansion
						)
					) {
						isAnyRectInViewport = true
						break // Found a visible rect in viewport, no need to check others
						// 在视口中找到可见 rect，无需检查其他
					}
				}
			}

			if (!isAnyRectVisible || !isAnyRectInViewport) {
				return false
			}

			// Check parent visibility
			// 检查父元素可见性
			const parentElement = textNode.parentElement
			if (!parentElement) return false

			try {
				return parentElement.checkVisibility({
					checkOpacity: true,
					checkVisibilityCSS: true,
				})
			} catch (e) {
				// Fallback if checkVisibility is not supported
				// 如果不支持 checkVisibility 则回退
				const style = window.getComputedStyle(parentElement)
				return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
			}
		} catch (e) {
			console.warn('Error checking text node visibility:', e)
			return false
		}
	}

	/**
	 * Checks if an element is accepted.
	 * 检查元素是否被接受。
	 *
	 * @param {HTMLElement} element - The element to check.
	 * @param {HTMLElement} element - 要检查的元素。
	 * @returns {boolean} Whether the element is accepted.
	 * @returns {boolean} 元素是否被接受。
	 */
	function isElementAccepted(element) {
		if (!element || !element.tagName) return false

		// Always accept body and common container elements
		// 始终接受 body 和常见容器元素
		const alwaysAccept = new Set([
			'body',
			'div',
			'main',
			'article',
			'section',
			'nav',
			'header',
			'footer',
		])
		const tagName = element.tagName.toLowerCase()

		if (alwaysAccept.has(tagName)) return true

		const leafElementDenyList = new Set([
			'svg',
			'script',
			'style',
			'link',
			'meta',
			'noscript',
			'template',
		])

		return !leafElementDenyList.has(tagName)
	}

	/**
	 * Checks if an element is visible.
	 * 检查元素是否可见。
	 *
	 * @param {HTMLElement} element - The element to check.
	 * @param {HTMLElement} element - 要检查的元素。
	 * @returns {boolean} Whether the element is visible.
	 * @returns {boolean} 元素是否可见。
	 */
	function isElementVisible(element) {
		const style = getCachedComputedStyle(element)
		return (
			element.offsetWidth > 0 &&
			element.offsetHeight > 0 &&
			style?.visibility !== 'hidden' &&
			style?.display !== 'none'
		)
	}

	/**
	 * Checks if an element is interactive.
	 * 检查元素是否可交互。
	 *
	 * lots of comments, and uncommented code - to show the logic of what we already tried
	 * 大量注释和未注释代码 - 展示我们已尝试的逻辑
	 *
	 * One of the things we tried at the beginning was also to use event listeners, and other fancy class, style stuff -> what actually worked best was just combining most things with computed cursor style :)
	 * 一开始我们尝试过使用事件监听器和其他花哨的类、样式，但最终效果最好的是将大多数内容与计算出的 cursor 样式结合 :)
	 *
	 * @param {HTMLElement} element - The element to check.
	 * @param {HTMLElement} element - 要检查的元素。
	 */
	function isInteractiveElement(element) {
		if (!element || element.nodeType !== Node.ELEMENT_NODE) {
			return false
		}

		/**
		 * @edit add interactiveBlacklist interactiveWhitelist
		 * @edit 添加 interactiveBlacklist 和 interactiveWhitelist
		 */
		if (interactiveBlacklist.includes(element)) {
			return false // Skip blacklisted elements
			// 跳过黑名单元素
		}
		if (interactiveWhitelist.includes(element)) {
			return true // Skip whitelisted elements
			// 白名单元素
		}

		// Cache the tagName and style lookups
		// 缓存 tagName 和样式查找
		const tagName = element.tagName.toLowerCase()
		const style = getCachedComputedStyle(element)

		// Define interactive cursors
		// 定义交互光标
		const interactiveCursors = new Set([
			'pointer', // Link/clickable elements
			// 链接/可点击元素
			'move', // Movable elements
			// 可移动元素
			'text', // Text selection
			// 文本选择
			'grab', // Grabbable elements
			// 可抓取元素
			'grabbing', // Currently grabbing
			// 当前抓取中
			'cell', // Table cell selection
			// 表格单元格选择
			'copy', // Copy operation
			// 复制操作
			'alias', // Alias creation
			// 别名创建
			'all-scroll', // Scrollable content
			// 可滚动内容
			'col-resize', // Column resize
			// 列调整大小
			'context-menu', // Context menu available
			// 上下文菜单可用
			'crosshair', // Precise selection
			// 精确选择
			'e-resize', // East resize
			// 东调整
			'ew-resize', // East-west resize
			// 东西调整
			'help', // Help available
			// 帮助可用
			'n-resize', // North resize
			// 北调整
			'ne-resize', // Northeast resize
			// 东北调整
			'nesw-resize', // Northeast-southwest resize
			// 东北-西南调整
			'ns-resize', // North-south resize
			// 南北调整
			'nw-resize', // Northwest resize
			// 西北调整
			'nwse-resize', // Northwest-southeast resize
			// 西北-东南调整
			'row-resize', // Row resize
			// 行调整
			's-resize', // South resize
			// 南调整
			'se-resize', // Southeast resize
			// 东南调整
			'sw-resize', // Southwest resize
			// 西南调整
			'vertical-text', // Vertical text selection
			// 垂直文本选择
			'w-resize', // West resize
			// 西调整
			'zoom-in', // Zoom in
			// 放大
			'zoom-out', // Zoom out
			// 缩小
		])

		// Define non-interactive cursors
		// 定义非交互光标
		const nonInteractiveCursors = new Set([
			'not-allowed', // Action not allowed
			// 操作不允许
			'no-drop', // Drop not allowed
			// 不允许放置
			'wait', // Processing
			// 处理中
			'progress', // In progress
			// 进行中
			'initial', // Initial value
			// 初始值
			'inherit', // Inherited value
			// 继承值
			//? Let's just include all potentially clickable elements that are not specifically blocked
			// 让我们只包含所有可能可点击但未被明确阻止的元素
			// 'none',        // No cursor
			// 'default',     // Default cursor
			// 'auto',        // Browser default
		])

		/**
		 * Checks if an element has an interactive pointer.
		 * 检查元素是否具有交互指针。
		 *
		 * @param {HTMLElement} element - The element to check.
		 * @param {HTMLElement} element - 要检查的元素。
		 * @returns {boolean} Whether the element has an interactive pointer.
		 * @returns {boolean} 元素是否具有交互指针。
		 */
		function doesElementHaveInteractivePointer(element) {
			if (element.tagName.toLowerCase() === 'html') return false

			if (style?.cursor && interactiveCursors.has(style.cursor)) return true

			return false
		}

		let isInteractiveCursor = doesElementHaveInteractivePointer(element)

		// Genius fix for almost all interactive elements
		// 对几乎所有交互元素的巧妙修复
		if (isInteractiveCursor) {
			return true
		}

		const interactiveElements = new Set([
			'a', // Links
			// 链接
			'button', // Buttons
			// 按钮
			'input', // All input types (text, checkbox, radio, etc.)
			// 所有输入类型（文本、复选框、单选等）
			'select', // Dropdown menus
			// 下拉菜单
			'textarea', // Text areas
			// 文本区域
			'details', // Expandable details
			// 可展开详情
			'summary', // Summary element (clickable part of details)
			// Summary 元素（details 的可点击部分）
			'label', // Form labels (often clickable)
			// 表单标签（通常可点击）
			'option', // Select options
			// 选择选项
			'optgroup', // Option groups
			// 选项组
			'fieldset', // Form fieldsets (can be interactive with legend)
			// 表单字段集（可配合 legend 交互）
			'legend', // Fieldset legends
			// 字段集图例
		])

		// Define explicit disable attributes and properties
		// 定义显式的禁用属性和特性
		const explicitDisableTags = new Set([
			'disabled', // Standard disabled attribute
			// 标准 disabled 属性
			// 'aria-disabled',      // ARIA disabled state
			// ARIA disabled 状态
			'readonly', // Read-only state
			// 只读状态
			// 'aria-readonly',     // ARIA read-only state
			// ARIA 只读状态
			// 'aria-hidden',       // Hidden from accessibility
			// 从无障碍隐藏
			// 'hidden',            // Hidden attribute
			// hidden 属性
			// 'inert',             // Inert attribute
			// inert 属性
			// 'aria-inert',        // ARIA inert state
			// ARIA inert 状态
			// 'tabindex="-1"',     // Removed from tab order
			// 从 tab 顺序移除
			// 'aria-hidden="true"' // Hidden from screen readers
			// 从屏幕阅读器隐藏
		])

		// handle inputs, select, checkbox, radio, textarea, button and make sure they are not cursor style disabled/not-allowed
		// 处理 input、select、checkbox、radio、textarea、button，确保它们不是光标样式禁用/不允许
		if (interactiveElements.has(tagName)) {
			// Check for non-interactive cursor
			// 检查非交互光标
			if (style?.cursor && nonInteractiveCursors.has(style.cursor)) {
				return false
			}

			// Check for explicit disable attributes
			// 检查显式的禁用属性
			for (const disableTag of explicitDisableTags) {
				if (
					element.hasAttribute(disableTag) ||
					element.getAttribute(disableTag) === 'true' ||
					element.getAttribute(disableTag) === ''
				) {
					return false
				}
			}

			// Check for disabled property on form elements
			// 检查表单元素的 disabled 属性
			if (element.disabled) {
				return false
			}

			// Check for readonly property on form elements
			// 检查表单元素的 readOnly 属性
			if (element.readOnly) {
				return false
			}

			// Check for inert property
			// 检查 inert 属性
			if (element.inert) {
				return false
			}

			return true
		}

		const role = element.getAttribute('role')
		const ariaRole = element.getAttribute('aria-role')

		// Check for contenteditable attribute
		// 检查 contenteditable 属性
		if (element.getAttribute('contenteditable') === 'true' || element.isContentEditable) {
			return true
		}

		// Added enhancement to capture dropdown interactive elements
		// 添加增强以捕获下拉交互元素
		if (
			element.classList &&
			(element.classList.contains('button') ||
				element.classList.contains('dropdown-toggle') ||
				element.getAttribute('data-index') ||
				element.getAttribute('data-toggle') === 'dropdown' ||
				element.getAttribute('aria-haspopup') === 'true')
		) {
			return true
		}

		const interactiveRoles = new Set([
			'button', // Directly clickable element
			// 直接可点击元素
			// 'link',            // Clickable link
			// 可点击链接
			'menu', // Menu container (ARIA menus)
			// 菜单容器（ARIA 菜单）
			'menubar', // Menu bar container
			// 菜单栏容器
			'menuitem', // Clickable menu item
			// 可点击菜单项
			'menuitemradio', // Radio-style menu item (selectable)
			// 单选样式菜单项（可选中）
			'menuitemcheckbox', // Checkbox-style menu item (toggleable)
			// 复选框样式菜单项（可切换）
			'radio', // Radio button (selectable)
			// 单选按钮（可选中）
			'checkbox', // Checkbox (toggleable)
			// 复选框（可切换）
			'tab', // Tab (clickable to switch content)
			// 标签页（可点击切换内容）
			'switch', // Toggle switch (clickable to change state)
			// 开关（可点击更改状态）
			'slider', // Slider control (draggable)
			// 滑块控件（可拖动）
			'spinbutton', // Number input with up/down controls
			// 带上下控件的数字输入
			'combobox', // Dropdown with text input
			// 带文本输入的下拉框
			'searchbox', // Search input field
			// 搜索输入字段
			'textbox', // Text input field
			// 文本输入字段
			'listbox', // Selectable list
			// 可选中列表
			'option', // Selectable option in a list
			// 列表中的可选中选项
			'scrollbar', // Scrollable control
			// 可滚动控件
		])

		// Basic role/attribute checks
		// 基本 role/属性检查
		const hasInteractiveRole =
			interactiveElements.has(tagName) ||
			(role && interactiveRoles.has(role)) ||
			(ariaRole && interactiveRoles.has(ariaRole))

		if (hasInteractiveRole) return true

		// check whether element has event listeners by window.getEventListeners
		// 通过 window.getEventListeners 检查元素是否有事件监听器
		try {
			if (typeof getEventListeners === 'function') {
				const listeners = getEventListeners(element)
				const mouseEvents = ['click', 'mousedown', 'mouseup', 'dblclick']
				for (const eventType of mouseEvents) {
					if (listeners[eventType] && listeners[eventType].length > 0) {
						return true // Found a mouse interaction listener
						// 找到鼠标交互监听器
					}
				}
			}

			const getEventListenersForNode =
				element?.ownerDocument?.defaultView?.getEventListenersForNode ||
				window.getEventListenersForNode
			if (typeof getEventListenersForNode === 'function') {
				const listeners = getEventListenersForNode(element)
				const interactionEvents = [
					'click',
					'mousedown',
					'mouseup',
					'keydown',
					'keyup',
					'submit',
					'change',
					'input',
					'focus',
					'blur',
				]
				for (const eventType of interactionEvents) {
					for (const listener of listeners) {
						if (listener.type === eventType) {
							return true // Found a common interaction listener
							// 找到常见交互监听器
						}
					}
				}
			}
			// Fallback: Check common event attributes if getEventListeners is not available (getEventListeners doesn't work in page.evaluate context)
			// 回退：如果 getEventListeners 不可用，检查常见事件属性（getEventListeners 在 page.evaluate 上下文中不起作用）
			const commonMouseAttrs = ['onclick', 'onmousedown', 'onmouseup', 'ondblclick']
			for (const attr of commonMouseAttrs) {
				if (element.hasAttribute(attr) || typeof element[attr] === 'function') {
					return true
				}
			}
		} catch (e) {
			// console.warn(`Could not check event listeners for ${element.tagName}:`, e);
			// 无法检查事件监听器
			// If checking listeners fails, rely on other checks
			// 如果检查监听器失败，依赖其他检查
		}

		/**
		 * @edit scrollable element detection
		 * @edit 可滚动元素检测
		 */
		if (isScrollableElement(element)) {
			return true
		}

		return false
	}

	/**
	 * Checks if an element is the topmost element at its position.
	 * 检查元素是否在其位置处于最顶层。
	 *
	 * @param {HTMLElement} element - The element to check.
	 * @param {HTMLElement} element - 要检查的元素。
	 * @returns {boolean} Whether the element is the topmost element at its position.
	 * @returns {boolean} 元素是否在其位置处于最顶层。
	 */
	function isTopElement(element) {
		// Special case: when viewportExpansion is -1, consider all elements as "top" elements
		// 特殊情况：当 viewportExpansion 为 -1 时，所有元素视为“顶层”元素
		if (viewportExpansion === -1) {
			return true
		}

		const rects = getCachedClientRects(element) // Replace element.getClientRects()
		// 替换 element.getClientRects()

		if (!rects || rects.length === 0) {
			return false // No geometry, cannot be top
			// 无几何信息，不能是顶层
		}

		let isAnyRectInViewport = false
		for (const rect of rects) {
			// Use the same logic as isInExpandedViewport check
			// 使用与 isInExpandedViewport 相同的逻辑
			if (
				rect.width > 0 &&
				rect.height > 0 &&
				!(
					// Only check non-empty rects
					// 仅检查非空 rect
					(
						rect.bottom < -viewportExpansion ||
						rect.top > window.innerHeight + viewportExpansion ||
						rect.right < -viewportExpansion ||
						rect.left > window.innerWidth + viewportExpansion
					)
				)
			) {
				isAnyRectInViewport = true
				break
			}
		}

		if (!isAnyRectInViewport) {
			return false // All rects are outside the viewport area
			// 所有 rect 都在视口区域外
		}

		// Find the correct document context and root element
		// 查找正确的文档上下文和根元素
		let doc = element.ownerDocument

		// If we're in an iframe, elements are considered top by default
		// 如果在 iframe 中，默认元素视为顶层
		if (doc !== window.document) {
			return true
		}

		/**
		 * @edit improve `sampleRect`, filter out rects with 0 area
		 * @edit 改进 `sampleRect`，过滤掉面积为 0 的 rect
		 */
		// find a rect that has width and height as sample
		// 查找一个有宽高作为样本的 rect
		let rect = Array.from(rects).find((r) => r.width > 0 && r.height > 0)
		if (!rect) {
			return false // No valid rect found
			// 未找到有效 rect
		}

		// For shadow DOM, we need to check within its own root context
		// 对于 shadow DOM，我们需要在其自身的根上下文中检查
		const shadowRoot = element.getRootNode()
		if (shadowRoot instanceof ShadowRoot) {
			const centerX = rect.left + rect.width / 2
			const centerY = rect.top + rect.height / 2

			try {
				const topEl = shadowRoot.elementFromPoint(centerX, centerY)
				if (!topEl) return false

				let current = topEl
				while (current && current !== shadowRoot) {
					if (current === element) return true
					current = current.parentElement
				}
				return false
			} catch (e) {
				return true
			}
		}

		const margin = 5

		// For elements in viewport, check if they're topmost. Do the check in the
		// center of the element and at the corners to ensure we catch more cases.
		// 对于视口中的元素，检查它们是否最顶层。在元素中心及角上进行检查以捕获更多情况。
		const checkPoints = [
			// Initially only this was used, but it was not enough
			// 最初只使用此点，但不够
			{ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
			{ x: rect.left + margin, y: rect.top + margin }, // top left
			// 左上
			// { x: rect.right - margin, y: rect.top + margin },    // top right
			// 右上
			// { x: rect.left + margin, y: rect.bottom - margin },  // bottom left
			// 左下
			{ x: rect.right - margin, y: rect.bottom - margin }, // bottom right
			// 右下
		]

		return checkPoints.some(({ x, y }) => {
			try {
				const topEl = document.elementFromPoint(x, y)
				if (!topEl) return false

				let current = topEl
				while (current && current !== document.documentElement) {
					if (current === element) return true
					current = current.parentElement
				}
				return false
			} catch (e) {
				return true
			}
		})
	}

	/**
	 * Checks if an element is within the expanded viewport.
	 * 检查元素是否在扩展视口内。
	 *
	 * @param {HTMLElement} element - The element to check.
	 * @param {HTMLElement} element - 要检查的元素。
	 * @param {number} viewportExpansion - The viewport expansion.
	 * @param {number} viewportExpansion - 视口扩展量。
	 * @returns {boolean} Whether the element is within the expanded viewport.
	 * @returns {boolean} 元素是否在扩展视口内。
	 */
	function isInExpandedViewport(element, viewportExpansion) {
		if (viewportExpansion === -1) {
			return true
		}

		const rects = element.getClientRects() // Use getClientRects
		// 使用 getClientRects

		if (!rects || rects.length === 0) {
			// Fallback to getBoundingClientRect if getClientRects is empty,
			// useful for elements like <svg> that might not have client rects but have a bounding box.
			// 如果 getClientRects 为空，回退到 getBoundingClientRect，
			// 对 <svg> 等元素有用，它们可能没有客户端矩形但有边界框。
			const boundingRect = getCachedBoundingRect(element)
			if (!boundingRect || boundingRect.width === 0 || boundingRect.height === 0) {
				return false
			}
			return !(
				boundingRect.bottom < -viewportExpansion ||
				boundingRect.top > window.innerHeight + viewportExpansion ||
				boundingRect.right < -viewportExpansion ||
				boundingRect.left > window.innerWidth + viewportExpansion
			)
		}

		// Check if *any* client rect is within the viewport
		// 检查是否有*任一*客户端矩形在视口内
		for (const rect of rects) {
			if (rect.width === 0 || rect.height === 0) continue // Skip empty rects
			// 跳过空矩形

			if (
				!(
					rect.bottom < -viewportExpansion ||
					rect.top > window.innerHeight + viewportExpansion ||
					rect.right < -viewportExpansion ||
					rect.left > window.innerWidth + viewportExpansion
				)
			) {
				return true // Found at least one rect in the viewport
				// 在视口内找到至少一个矩形
			}
		}

		return false // No rects were found in the viewport
		// 在视口内未找到矩形
	}

	// /**
	//  * Gets the effective scroll of an element.
	//  * 获取元素的有效滚动。
	//  *
	//  * @param {HTMLElement} element - The element to get the effective scroll for.
	//  * @param {HTMLElement} element - 要获取有效滚动的元素。
	//  * @returns {Object} The effective scroll of the element.
	//  * @returns {Object} 元素的有效滚动。
	//  */
	// function getEffectiveScroll(element) {
	//   let currentEl = element;
	//   let scrollX = 0;
	//   let scrollY = 0;

	//   while (currentEl && currentEl !== document.documentElement) {
	//     if (currentEl.scrollLeft || currentEl.scrollTop) {
	//       scrollX += currentEl.scrollLeft;
	//       scrollY += currentEl.scrollTop;
	//     }
	//     currentEl = currentEl.parentElement;
	//   }

	//   scrollX += window.scrollX;
	//   scrollY += window.scrollY;

	//   return { scrollX, scrollY };
	// }

	/**
	 * Checks if an element is an interactive candidate.
	 * 检查元素是否为交互候选元素。
	 *
	 * @param {HTMLElement} element - The element to check.
	 * @param {HTMLElement} element - 要检查的元素。
	 * @returns {boolean} Whether the element is an interactive candidate.
	 * @returns {boolean} 元素是否为交互候选元素。
	 */

	// @edit fix "aria-*" attributes check
	// @edit 修复 "aria-*" 属性检查
	const INTERACTIVE_ARIA_ATTRS = [
		'aria-expanded',
		'aria-checked',
		'aria-selected',
		'aria-pressed',
		'aria-haspopup',
		'aria-controls',
		'aria-owns',
		'aria-activedescendant',
		'aria-valuenow',
		'aria-valuetext',
		'aria-valuemax',
		'aria-valuemin',
		'aria-autocomplete',
	]

	function hasInteractiveAria(el) {
		for (let i = 0; i < INTERACTIVE_ARIA_ATTRS.length; i++) {
			if (el.hasAttribute(INTERACTIVE_ARIA_ATTRS[i])) return true
		}
		return false
	}

	function isInteractiveCandidate(element) {
		if (!element || element.nodeType !== Node.ELEMENT_NODE) return false

		const tagName = element.tagName.toLowerCase()

		// Fast-path for common interactive elements
		// 常见交互元素的快速路径
		const interactiveElements = new Set([
			'a',
			'button',
			'input',
			'select',
			'textarea',
			'details',
			'summary',
			'label',
		])

		if (interactiveElements.has(tagName)) return true

		// Quick attribute checks without getting full lists
		// 无需获取完整列表的快速属性检查
		const hasQuickInteractiveAttr =
			element.hasAttribute('onclick') ||
			element.hasAttribute('role') ||
			element.hasAttribute('tabindex') ||
			hasInteractiveAria(element) ||
			element.hasAttribute('data-action') ||
			element.getAttribute('contenteditable') === 'true'

		return hasQuickInteractiveAttr
	}

	// --- Define constants for distinct interaction check ---
	// --- 为不同交互检查定义常量 ---
	const DISTINCT_INTERACTIVE_TAGS = new Set([
		'a',
		'button',
		'input',
		'select',
		'textarea',
		'summary',
		'details',
		'label',
		'option',
		'li',
	])
	const DISTINCT_INTERACTIVE_ROLES = new Set([
		'button',
		'link',
		'menuitem',
		'menuitemradio',
		'menuitemcheckbox',
		'radio',
		'checkbox',
		'tab',
		'switch',
		'slider',
		'spinbutton',
		'combobox',
		'searchbox',
		'textbox',
		'listbox',
		'listitem',
		'treeitem',
		'row',
		'option',
		'scrollbar',
	])

	/**
	 * Heuristically determines if an element should be considered as independently interactive,
	 * even if it's nested inside another interactive container.
	 * 启发式地确定元素是否应被视为独立交互，即使它嵌套在另一个交互容器内。
	 *
	 * This function helps detect deeply nested actionable elements (e.g., menu items within a button)
	 * that may not be picked up by strict interactivity checks.
	 * 此函数帮助检测深层嵌套的可操作元素（例如按钮内的菜单项），这些元素可能未被严格的交互性检查捕获。
	 *
	 * @param {HTMLElement} element - The element to check.
	 * @param {HTMLElement} element - 要检查的元素。
	 * @returns {boolean} Whether the element is heuristically interactive.
	 * @returns {boolean} 元素是否启发式地可交互。
	 */
	function isHeuristicallyInteractive(element) {
		if (!element || element.nodeType !== Node.ELEMENT_NODE) return false

		// Skip non-visible elements early for performance
		// 尽早跳过不可见元素以提高性能
		if (!isElementVisible(element)) return false

		// Check for common attributes that often indicate interactivity
		// 检查常见属性，这些属性通常表示交互性
		const hasInteractiveAttributes =
			element.hasAttribute('role') ||
			element.hasAttribute('tabindex') ||
			element.hasAttribute('onclick') ||
			typeof element.onclick === 'function'

		// Check for semantic class names suggesting interactivity
		// 检查暗示交互性的语义类名
		const hasInteractiveClass = /\b(btn|clickable|menu|item|entry|link)\b/i.test(
			element.className || ''
		)

		// Determine whether the element is inside a known interactive container
		// 确定元素是否在已知的交互容器内
		const isInKnownContainer = Boolean(
			element.closest('button,a,[role="button"],.menu,.dropdown,.list,.toolbar')
		)

		// Ensure the element has at least one visible child (to avoid marking empty wrappers)
		// 确保元素至少有一个可见子元素（避免标记空包装器）
		const hasVisibleChildren = [...element.children].some(isElementVisible)

		// Avoid highlighting elements whose parent is <body> (top-level wrappers)
		// 避免高亮父元素为 <body> 的元素（顶层包装器）
		const isParentBody = element.parentElement && element.parentElement.isSameNode(document.body)

		return (
			(isInteractiveElement(element) || hasInteractiveAttributes || hasInteractiveClass) &&
			hasVisibleChildren &&
			isInKnownContainer &&
			!isParentBody
		)
	}

	/**
	 * Checks if an element likely represents a distinct interaction
	 * separate from its parent (if the parent is also interactive).
	 * 检查元素是否可能代表与其父元素（如果父元素也可交互）不同的交互。
	 *
	 * @param {HTMLElement} element - The element to check.
	 * @param {HTMLElement} element - 要检查的元素。
	 * @returns {boolean} Whether the element is a distinct interaction.
	 * @returns {boolean} 元素是否为不同的交互。
	 */
	function isElementDistinctInteraction(element) {
		if (!element || element.nodeType !== Node.ELEMENT_NODE) {
			return false
		}

		const tagName = element.tagName.toLowerCase()
		const role = element.getAttribute('role')

		// Check if it's an iframe - always distinct boundary
		// 检查是否为 iframe - 始终是不同边界
		if (tagName === 'iframe') {
			return true
		}

		// Check tag name
		// 检查标签名
		if (DISTINCT_INTERACTIVE_TAGS.has(tagName)) {
			return true
		}
		// Check interactive roles
		// 检查交互角色
		if (role && DISTINCT_INTERACTIVE_ROLES.has(role)) {
			return true
		}
		// Check contenteditable
		// 检查 contenteditable
		if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
			return true
		}
		// Check for common testing/automation attributes
		// 检查常见测试/自动化属性
		if (
			element.hasAttribute('data-testid') ||
			element.hasAttribute('data-cy') ||
			element.hasAttribute('data-test')
		) {
			return true
		}
		// Check for explicit onclick handler (attribute or property)
		// 检查显式的 onclick 处理程序（属性或属性）
		if (element.hasAttribute('onclick') || typeof element.onclick === 'function') {
			return true
		}
		// ARIA state attributes imply the element manages its own interaction state
		// ARIA 状态属性暗示元素管理自己的交互状态
		if (hasInteractiveAria(element)) {
			return true
		}

		// return false

		// Check for other common interaction event listeners
		// 检查其他常见交互事件监听器
		try {
			const getEventListenersForNode =
				element?.ownerDocument?.defaultView?.getEventListenersForNode ||
				window.getEventListenersForNode
			if (typeof getEventListenersForNode === 'function') {
				const listeners = getEventListenersForNode(element)
				const interactionEvents = [
					'click',
					'mousedown',
					'mouseup',
					'keydown',
					'keyup',
					'submit',
					'change',
					'input',
					'focus',
					'blur',
				]
				for (const eventType of interactionEvents) {
					for (const listener of listeners) {
						if (listener.type === eventType) {
							return true // Found a common interaction listener
							// 找到常见交互监听器
						}
					}
				}
			}
			// Fallback: Check common event attributes if getEventListeners is not available (getEventListenersForNode doesn't work in page.evaluate context)
			// 回退：如果 getEventListeners 不可用，检查常见事件属性（getEventListenersForNode 在 page.evaluate 上下文中不起作用）
			const commonEventAttrs = [
				'onmousedown',
				'onmouseup',
				'onkeydown',
				'onkeyup',
				'onsubmit',
				'onchange',
				'oninput',
				'onfocus',
				'onblur',
			]
			if (commonEventAttrs.some((attr) => element.hasAttribute(attr))) {
				return true
			}
		} catch (e) {
			// console.warn(`Could not check event listeners for ${element.tagName}:`, e);
			// 无法检查事件监听器
			// If checking listeners fails, rely on other checks
			// 如果检查监听器失败，依赖其他检查
		}

		// if the element is not strictly interactive but appears clickable based on heuristic signals
		// 如果元素不是严格交互但根据启发式信号看似可点击
		if (isHeuristicallyInteractive(element)) {
			return true
		}

		// Scrollable containers are always distinct — the LLM needs their index for targeted scrolling.
		// 可滚动容器始终是独立的 —— LLM 需要它们的索引以进行目标滚动。
		// Check extraData (already set by isScrollableElement in isInteractiveElement) to avoid redundant layout reads.
		// 检查 extraData（已在 isInteractiveElement 中由 isScrollableElement 设置）以避免冗余布局读取。
		if (extraData.get(element)?.scrollable) {
			return true
		}

		// Default to false: if it's interactive but doesn't match above,
		// assume it triggers the same action as the parent.
		// 默认为 false：如果它是交互的但不匹配上述条件，假设它触发与父元素相同的操作。
		return false
	}
	// --- End distinct interaction check ---
	// --- 结束不同交互检查 ---

	/**
   * Handles the logic for deciding whether to highlight an element and performing the highlight.
   * 处理决定是否高亮元素并执行高亮的逻辑。
   * @param {
    {
        tagName: string;
        attributes: Record<string, string>;
        xpath: any;
        children: never[];
        isVisible?: boolean;
        isTopElement?: boolean;
        isInteractive?: boolean;
        isInViewport?: boolean;
        highlightIndex?: number;
        shadowRoot?: boolean;
   }} nodeData - The node data object.
   * @param {HTMLElement} node - The node to highlight.
   * @param {HTMLElement} node - 要高亮的节点。
   * @param {HTMLElement | null} parentIframe - The parent iframe node.
   * @param {HTMLElement | null} parentIframe - 父 iframe 节点。
   * @param {boolean} isParentHighlighted - Whether the parent node is highlighted.
   * @param {boolean} isParentHighlighted - 父节点是否高亮。
   * @returns {boolean} Whether the element was highlighted.
   * @returns {boolean} 元素是否被高亮。
   */
	function handleHighlighting(nodeData, node, parentIframe, isParentHighlighted) {
		if (!nodeData.isInteractive) return false // Not interactive, definitely don't highlight
		// 不可交互，一定不高亮

		let shouldHighlight = false
		if (!isParentHighlighted) {
			// Parent wasn't highlighted, this interactive node can be highlighted.
			// 父元素未被高亮，此交互节点可以被高亮。
			shouldHighlight = true
		} else {
			// Parent *was* highlighted. Only highlight this node if it represents a distinct interaction.
			// 父元素*被*高亮。仅当此节点表示不同的交互时才高亮。
			if (isElementDistinctInteraction(node)) {
				shouldHighlight = true
			} else {
				// console.log(`Skipping highlight for ${nodeData.tagName} (parent highlighted)`);
				// 跳过高亮
				shouldHighlight = false
			}
		}

		if (shouldHighlight) {
			// Check viewport status before assigning index and highlighting
			// 在分配索引和高亮之前检查视口状态
			nodeData.isInViewport = isInExpandedViewport(node, viewportExpansion)

			// When viewportExpansion is -1, all interactive elements should get a highlight index
			// regardless of viewport status
			// 当 viewportExpansion 为 -1 时，所有交互元素都应获得高亮索引，无论视口状态如何
			if (nodeData.isInViewport || viewportExpansion === -1) {
				nodeData.highlightIndex = highlightIndex++

				if (doHighlightElements) {
					if (focusHighlightIndex >= 0) {
						if (focusHighlightIndex === nodeData.highlightIndex) {
							highlightElement(node, nodeData.highlightIndex, parentIframe)
						}
					} else {
						highlightElement(node, nodeData.highlightIndex, parentIframe)
					}
					return true // Successfully highlighted
					// 成功高亮
				}
			} else {
				// console.log(`Skipping highlight for ${nodeData.tagName} (outside viewport)`);
				// 跳过高亮（视口外）
			}
		}

		return false // Did not highlight
		// 未高亮
	}

	/**
	 * Creates a node data object for a given node and its descendants.
	 * 为给定节点及其后代创建节点数据对象。
	 *
	 * @param {HTMLElement} node - The node to process.
	 * @param {HTMLElement} node - 要处理的节点。
	 * @param {HTMLElement | null} parentIframe - The parent iframe node.
	 * @param {HTMLElement | null} parentIframe - 父 iframe 节点。
	 * @param {boolean} isParentHighlighted - Whether the parent node is highlighted.
	 * @param {boolean} isParentHighlighted - 父节点是否高亮。
	 * @returns {string | null} The ID of the node data object, or null if the node is not processed.
	 * @returns {string | null} 节点数据对象的 ID，如果节点未处理则返回 null。
	 */
	function buildDomTree(node, parentIframe = null, isParentHighlighted = false) {
		// Fast rejection checks first
		// 首先进行快速排除检查
		if (
			!node ||
			node.id === HIGHLIGHT_CONTAINER_ID ||
			(node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE)
		) {
			return null
		}

		if (!node || node.id === HIGHLIGHT_CONTAINER_ID) {
			return null
		}

		/**
		 * @edit add `data-browser-use-ignore` attribute
		 * @edit 添加 `data-browser-use-ignore` 属性
		 */
		if (node.dataset?.browserUseIgnore === 'true' || node.dataset?.pageAgentIgnore === 'true') {
			return null // Skip this node and its children
			// 跳过此节点及其子节点
		}

		/**
		 * @edit exclude aria-hidden elements
		 * @edit 排除 aria-hidden 元素
		 */
		if (node.getAttribute && node.getAttribute('aria-hidden') === 'true') {
			return null // Skip this node and its children
			// 跳过此节点及其子节点
		}

		// Special handling for root node (body)
		// 根节点（body）的特殊处理
		if (node === document.body) {
			const nodeData = {
				tagName: 'body',
				attributes: {},
				xpath: '/body',
				children: [],
			}

			// Process children of body
			// 处理 body 的子节点
			for (const child of node.childNodes) {
				const domElement = buildDomTree(child, parentIframe, false) // Body's children have no highlighted parent initially
				// body 的子节点初始没有高亮父节点
				if (domElement) nodeData.children.push(domElement)
			}

			const id = `${ID.current++}`
			DOM_HASH_MAP[id] = nodeData
			return id
		}

		// Early bailout for non-element nodes except text
		// 除文本外，非元素节点的早期退出
		if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE) {
			return null
		}

		// Process text nodes
		// 处理文本节点
		if (node.nodeType === Node.TEXT_NODE) {
			const textContent = node.textContent?.trim()
			if (!textContent) {
				return null
			}

			// Only check visibility for text nodes that might be visible
			// 仅对可能可见的文本节点检查可见性
			const parentElement = node.parentElement
			if (!parentElement || parentElement.tagName.toLowerCase() === 'script') {
				return null
			}

			const id = `${ID.current++}`
			DOM_HASH_MAP[id] = {
				type: 'TEXT_NODE',
				text: textContent,
				isVisible: isTextNodeVisible(node),
			}
			return id
		}

		// Quick checks for element nodes
		// 对元素节点的快速检查
		if (node.nodeType === Node.ELEMENT_NODE && !isElementAccepted(node)) {
			return null
		}

		// Early viewport check - only filter out elements clearly outside viewport
		// 早期视口检查 - 仅过滤掉明显在视口外的元素
		// The getBoundingClientRect() of the Shadow DOM host element may return width/height = 0
		// Shadow DOM 宿主元素的 getBoundingClientRect() 可能返回宽/高为 0
		if (viewportExpansion !== -1 && !node.shadowRoot) {
			const rect = getCachedBoundingRect(node) // Keep for initial quick check
			// 保留用于初始快速检查
			const style = getCachedComputedStyle(node)

			// Skip viewport check for fixed/sticky elements as they may appear anywhere
			// 跳过对 fixed/sticky 元素的视口检查，因为它们可能出现在任何位置
			const isFixedOrSticky = style && (style.position === 'fixed' || style.position === 'sticky')

			// Check if element has actual dimensions using offsetWidth/Height (quick check)
			// 使用 offsetWidth/Height 检查元素是否有实际尺寸（快速检查）
			const hasSize = node.offsetWidth > 0 || node.offsetHeight > 0

			// Use getBoundingClientRect for the quick OUTSIDE check.
			// 使用 getBoundingClientRect 进行快速 OUTSIDE 检查。
			// isInExpandedViewport will do the more accurate check later if needed.
			// 如果需要，isInExpandedViewport 稍后将进行更准确的检查。
			if (
				!rect ||
				(!isFixedOrSticky &&
					!hasSize &&
					(rect.bottom < -viewportExpansion ||
						rect.top > window.innerHeight + viewportExpansion ||
						rect.right < -viewportExpansion ||
						rect.left > window.innerWidth + viewportExpansion))
			) {
				// console.log("Skipping node outside viewport (quick check):", node.tagName, rect);
				// 跳过视口外的节点（快速检查）
				return null
			}
		}

		/**
     * @type {
      {
          tagName: string;
          attributes: Record<string, string | null>;
          xpath: any;
          children: never[];
          isVisible?: boolean;
          isTopElement?: boolean;
          isInteractive?: boolean;
          isInViewport?: boolean;
          highlightIndex?: number;
          shadowRoot?: boolean;
      }
    } nodeData - The node data object.
     * nodeData - 节点数据对象。
     */
		const nodeData = {
			tagName: node.tagName.toLowerCase(),
			attributes: {},

			/**
			 * @edit no need for xpath
			 * @edit 无需 xpath
			 */
			// xpath: getXPathTree(node, true),

			children: [],
		}

		// Get attributes for interactive elements or potential text containers
		// 获取交互元素或潜在文本容器的属性
		if (
			isInteractiveCandidate(node) ||
			node.tagName.toLowerCase() === 'iframe' ||
			node.tagName.toLowerCase() === 'body'
		) {
			const attributeNames = node.getAttributeNames?.() || []
			for (const name of attributeNames) {
				const value = node.getAttribute(name)
				nodeData.attributes[name] = value
			}

			/**
			 * @edit @workaround input.checked
			 * @edit @workaround 处理 input.checked
			 */
			if (
				node.tagName.toLowerCase() === 'input' &&
				(node.type === 'checkbox' || node.type === 'radio')
			) {
				nodeData.attributes.checked = node.checked ? 'true' : 'false' // Store as string for consistency
				// 存储为字符串以保持一致性
			}
		}

		let nodeWasHighlighted = false
		// Perform visibility, interactivity, and highlighting checks
		// 执行可见性、交互性和高亮检查
		if (node.nodeType === Node.ELEMENT_NODE) {
			nodeData.isVisible = isElementVisible(node) // isElementVisible uses offsetWidth/Height, which is fine
			// isElementVisible 使用 offsetWidth/Height，没问题
			if (nodeData.isVisible) {
				nodeData.isTopElement = isTopElement(node)

				// Special handling for ARIA menu containers - check interactivity even if not top element
				// ARIA 菜单容器的特殊处理 - 即使不是顶层元素也检查交互性
				const role = node.getAttribute('role')
				const isMenuContainer = role === 'menu' || role === 'menubar' || role === 'listbox'

				if (nodeData.isTopElement || isMenuContainer) {
					nodeData.isInteractive = isInteractiveElement(node)
					// Call the dedicated highlighting function
					// 调用专用的高亮函数
					nodeWasHighlighted = handleHighlighting(nodeData, node, parentIframe, isParentHighlighted)

					/**
					 * @edit direct dom ref
					 * @edit 直接 DOM 引用
					 */
					nodeData.ref = node

					/**
					 * @edit make sure attributes exist for interactive candidates.
					 * @edit 确保交互候选元素存在属性。
					 * @note if the element failed the isInteractiveCandidate, attributes would be empty.
					 * @note 如果元素未通过 isInteractiveCandidate，则属性为空。
					 */
					if (nodeData.isInteractive && Object.keys(nodeData.attributes).length === 0) {
						const attributeNames = node.getAttributeNames?.() || []
						for (const name of attributeNames) {
							const value = node.getAttribute(name)
							nodeData.attributes[name] = value
						}
					}
				}
			}
		}

		// Process children, with special handling for iframes and rich text editors
		// 处理子节点，对 iframe 和富文本编辑器进行特殊处理
		if (node.tagName) {
			const tagName = node.tagName.toLowerCase()

			// Handle iframes
			// 处理 iframe
			if (tagName === 'iframe') {
				try {
					const iframeDoc = node.contentDocument || node.contentWindow?.document
					if (iframeDoc) {
						for (const child of iframeDoc.childNodes) {
							const domElement = buildDomTree(child, node, false)
							if (domElement) nodeData.children.push(domElement)
						}
					}
				} catch (e) {
					console.warn('Unable to access iframe:', e)
				}
			}
			// Handle rich text editors and contenteditable elements
			// 处理富文本编辑器和 contenteditable 元素
			else if (
				node.isContentEditable ||
				node.getAttribute('contenteditable') === 'true' ||
				node.id === 'tinymce' ||
				node.classList.contains('mce-content-body') ||
				(tagName === 'body' && node.getAttribute('data-id')?.startsWith('mce_'))
			) {
				// Process all child nodes to capture formatted text
				// 处理所有子节点以捕获格式化文本
				for (const child of node.childNodes) {
					const domElement = buildDomTree(child, parentIframe, nodeWasHighlighted)
					if (domElement) nodeData.children.push(domElement)
				}
			} else {
				// Handle shadow DOM
				// 处理 shadow DOM
				if (node.shadowRoot) {
					nodeData.shadowRoot = true
					for (const child of node.shadowRoot.childNodes) {
						const domElement = buildDomTree(child, parentIframe, nodeWasHighlighted)
						if (domElement) nodeData.children.push(domElement)
					}
				}
				// Handle regular elements
				// 处理普通元素
				for (const child of node.childNodes) {
					// Pass the highlighted status of the *current* node to its children
					// 将*当前*节点的高亮状态传递给其子节点
					const passHighlightStatusToChild = nodeWasHighlighted || isParentHighlighted
					const domElement = buildDomTree(child, parentIframe, passHighlightStatusToChild)
					if (domElement) nodeData.children.push(domElement)
				}
			}
		}

		// Skip empty anchor tags only if they have no dimensions and no children
		// 仅当空锚点标签没有尺寸且没有子节点时跳过
		if (nodeData.tagName === 'a' && nodeData.children.length === 0 && !nodeData.attributes.href) {
			// Check if the anchor has actual dimensions
			// 检查锚点是否有实际尺寸
			const rect = getCachedBoundingRect(node)
			const hasSize =
				(rect && rect.width > 0 && rect.height > 0) || node.offsetWidth > 0 || node.offsetHeight > 0

			if (!hasSize) {
				return null
			}
		}

		/**
		 * @edit add `extra` field for extra data
		 * @edit 添加 `extra` 字段用于额外数据
		 */
		nodeData.extra = extraData.get(node) || null

		const id = `${ID.current++}`
		DOM_HASH_MAP[id] = nodeData
		return id
	}

	const rootId = buildDomTree(document.body)

	// Clear the cache before starting
	// 开始前清空缓存
	DOM_CACHE.clearCache()

	return { rootId, map: DOM_HASH_MAP }
}