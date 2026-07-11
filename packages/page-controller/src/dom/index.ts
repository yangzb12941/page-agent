import domTree from './dom_tree/index.js'
import {
	ElementDomNode,
	FlatDomTree,
	InteractiveElementDomNode,
	TextDomNode,
} from './dom_tree/type'

/**
 * Viewport expansion for DOM tree extraction.
 * DOM 树提取的视口扩展。
 * -1 means full page (no viewport restriction)
 * -1 表示整页（无视口限制）
 * 0 means viewport only
 * 0 表示仅视口
 * positive values expand the viewport by that many pixels
 * 正值表示将视口扩展相应像素数
 *
 * @note Since isTopElement depends on elementFromPoint,
 * @note 由于 isTopElement 依赖于 elementFromPoint，
 * it returns null when out of viewport, this feature has no practical use, only differ between -1 and 0
 * 当元素超出视口时返回 null，该功能实际上没有实际用途，仅在 -1 和 0 之间有区别。
 */
const DEFAULT_VIEWPORT_EXPANSION = -1

export function resolveViewportExpansion(viewportExpansion?: number): number {
	return viewportExpansion ?? DEFAULT_VIEWPORT_EXPANSION
}

export interface DomConfig {
	viewportExpansion?: number
	interactiveBlacklist?: (Element | (() => Element))[]
	interactiveWhitelist?: (Element | (() => Element))[]
	includeAttributes?: string[]
	highlightOpacity?: number
	highlightLabelOpacity?: number

	/**
	 * Preserve semantic landmark tags in dehydrated output even if not interactive
	 * 即使不可交互，在脱水输出中也保留语义标记标签
	 * @note maybe confusing for LLM combining with page scrolling, use with caution
	 * @note 与页面滚动结合使用可能会让 LLM 感到困惑，请谨慎使用
	 **/
	keepSemanticTags?: boolean
}

// TODO: corresponding roles
// TODO: 对应的角色
const SEMANTIC_TAGS = new Set([
	'nav',
	'menu',
	// 'main',
	'header',
	'footer',
	'aside',
	// 'article',
	// 'form',
	'dialog',
])

/**
 * 用于检测可交互元素是否是新出现的。
 */
const newElementsCache = new WeakMap<HTMLElement, string>()

export function getFlatTree(config: DomConfig): FlatDomTree {
	const viewportExpansion = resolveViewportExpansion(config.viewportExpansion)

	const interactiveBlacklist = [] as Element[]
	for (const item of config.interactiveBlacklist || []) {
		if (typeof item === 'function') {
			interactiveBlacklist.push(item())
		} else {
			interactiveBlacklist.push(item)
		}
	}

	const interactiveWhitelist = [] as Element[]
	for (const item of config.interactiveWhitelist || []) {
		if (typeof item === 'function') {
			interactiveWhitelist.push(item())
		} else {
			interactiveWhitelist.push(item)
		}
	}

	const elements = domTree({
		doHighlightElements: true,
		debugMode: true,
		focusHighlightIndex: -1,
		viewportExpansion,
		interactiveBlacklist,
		interactiveWhitelist,
		highlightOpacity: config.highlightOpacity ?? 0.0,
		highlightLabelOpacity: config.highlightLabelOpacity ?? 0.1,
	}) as FlatDomTree

	const currentUrl = window.location.href

	/**
	 * 标记新出现的元素
	 * @todo browser-use 使用 hash(位置，属性等信息) 来判断是否同一个元素，
	 *       能够解决 1. 元素被删除后重新添加 2. 页面卸载 等问题。
	 *       这里先简单做.
	 */
	for (const nodeId in elements.map) {
		const node = elements.map[nodeId]
		if (node.isInteractive && node.ref) {
			const ref = node.ref as HTMLElement
			// @note 这样太严格，元素是可以跨页面存在的
			// @note This is too strict; elements can exist across pages.
			// if (newElementsCache.get(ref) !== currentUrl) {
			if (!newElementsCache.has(ref)) {
				newElementsCache.set(ref, currentUrl)
				node.isNew = true
			}
		}
	}

	return elements
}

const globRegexCache = new Map<string, RegExp>()

function globToRegex(pattern: string): RegExp {
	let regex = globRegexCache.get(pattern)
	if (!regex) {
		const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		regex = new RegExp(`^${escaped.replace(/\*/g, '.*')}$`)
		globRegexCache.set(pattern, regex)
	}
	return regex
}

function matchAttributes(
	attrs: Record<string, string>,
	patterns: string[]
): Record<string, string> {
	const result: Record<string, string> = {}

	for (const pattern of patterns) {
		if (pattern.includes('*')) {
			const regex = globToRegex(pattern)
			for (const key of Object.keys(attrs)) {
				if (regex.test(key) && attrs[key].trim()) {
					result[key] = attrs[key].trim()
				}
			}
		} else {
			const value = attrs[pattern]
			if (value && value.trim()) {
				result[pattern] = value.trim()
			}
		}
	}

	return result
}

/**
 * elementsToString 内部使用的类型
 * Internal type used by elementsToString
 */
interface TreeNode {
	type: 'text' | 'element'
	parent: TreeNode | null
	children: TreeNode[]
	isVisible: boolean
	// Text node properties
	// 文本节点属性
	text?: string
	// Element node properties
	// 元素节点属性
	tagName?: string
	attributes?: Record<string, string>
	isInteractive?: boolean
	isTopElement?: boolean
	isNew?: boolean
	highlightIndex?: number
	extra?: Record<string, any>
}

/**
 * 对应 python 中的 views::clickable_elements_to_string,
 * 将 dom 信息处理成适合 llm 阅读的文本格式
 * 其中可交互元素用序号标出，提示llm可以用序号操作。
 * Interactive elements are marked with numbers, prompting the LLM to use those numbers.
 * 缩进代表父子关系。
 * Indentation represents parent-child relationships.
 * 普通文本则直接列出来。
 * Plain text is listed directly.
 * 这段代码定义了 flatTreeToString 函数，它是整个 Agent 系统中负责将 DOM 结构“翻译”给 LLM 阅读的核心渲染器。
 *
 * 它的主要作用是将复杂的扁平化 DOM 树（FlatDomTree）转换为简洁、结构化的纯文本字符串，以便发送给大模型进行分析和决策。
 *
 * 具体处理逻辑如下：
 *
 * 1. 提取可交互元素并分配索引（核心）
 * 目的：让 LLM 能够通过序号精确操作页面元素。
 * 逻辑：遍历 DOM 树，如果发现某个元素是可交互的（highlightIndex 存在），会将其格式化为 [index]<tag attributes>text /> 的形式。
 * 示例：[12]<button type="submit">登录</button> 表示这是一个可点击的按钮，索引为 12。
 * 新元素标记：如果是新出现的元素（isNew 为 true），索引前会加星号，如 *[12]，提示 LLM 这是一个新增项。
 * 2. 属性过滤与优化（去噪）
 * 保留关键属性：仅保留对 LLM 理解元素有用的属性（如 aria-label, role, placeholder, checked 等），忽略大量无用的样式或内部属性，以节省 Token。
 * 去重处理：
 * 如果属性值与元素的可见文本内容相同（例如 aria-label="登录" 且文本也是“登录”），则移除属性，避免冗余。
 * 如果 role 与标签名相同（如 <div role="div">），则移除 role。
 * 截断过长的属性值（限制为 20 字符）。
 * 3. 保留语义结构
 * 缩进层级：通过 \t 缩进展示 DOM 的父子层级关系。
 * 语义标签：如果开启了 keepSemanticTags，即使某些标签（如 <nav>, <header>, <footer>）不可交互，也会保留它们作为结构锚点，帮助 LLM 理解页面布局（例如区分导航栏和正文）。
 * 4. 文本处理
 * 关联文本：提取元素内部或邻近的文本描述（getAllTextTillNextClickableElement），让 LLM 知道按钮上写了什么。
 * 避免重复：如果父元素已经是可交互元素，则不再单独输出子节点的文本，防止内容重复刷屏。
 * 总结
 * 该函数的输出结果类似于：
 *
 * text
 * [0]<a href="/home">首页</a>
 * [1]<input type="text" placeholder="输入搜索内容" />
 * ... 100 pixels below ...
 * 这种格式极大地降低了 LLM 理解网页的难度，使其能迅速定位到 [0] 或 [1] 并执行对应的指令。
 * @todo 数据脱敏过滤器
 * @todo Data desensitization filter
 */
export function flatTreeToString(
	flatTree: FlatDomTree,
	includeAttributes: string[] = [],
	keepSemanticTags = false
): string {
	const DEFAULT_INCLUDE_ATTRIBUTES = [
		'title',
		'type',
		'checked',
		'name',
		'role',
		'value',
		'placeholder',
		'data-date-format',
		'alt',
		'aria-label',
		'aria-expanded',
		'data-state',
		'aria-checked',

		// @edit added for better form handling
		// @edit 添加以改善表单处理
		'id',
		'for',

		// for jump check
		// 用于跳转检查
		'target',

		// absolute position dropdown menu
		// 绝对定位下拉菜单
		'aria-haspopup',
		'aria-controls',
		'aria-owns',

		// content editable
		// 内容可编辑
		'contenteditable',
	]

	const includeAttrs = [...includeAttributes, ...DEFAULT_INCLUDE_ATTRIBUTES]

	// Helper function to cap text length
	// 辅助函数：限制文本长度
	const capTextLength = (text: string, maxLength: number): string => {
		if (text.length > maxLength) {
			return text.substring(0, maxLength) + '...'
		}
		return text
	}

	// Build tree structure from flat map
	// 从扁平映射构建树结构
	const buildTreeNode = (nodeId: string): TreeNode | null => {
		const node = flatTree.map[nodeId]
		if (!node) return null

		if (node.type === 'TEXT_NODE') {
			const textNode = node as TextDomNode
			return {
				type: 'text',
				text: textNode.text,
				isVisible: textNode.isVisible,
				parent: null,
				children: [],
			}
		} else {
			const elementNode = node as ElementDomNode
			const children: TreeNode[] = []

			if (elementNode.children) {
				for (const childId of elementNode.children) {
					const child = buildTreeNode(childId)
					if (child) {
						child.parent = null // Will be set later 稍后设置
						children.push(child)
					}
				}
			}

			return {
				type: 'element',
				tagName: elementNode.tagName,
				attributes: elementNode.attributes ?? {},
				isVisible: elementNode.isVisible ?? false,
				isInteractive: elementNode.isInteractive ?? false,
				isTopElement: elementNode.isTopElement ?? false,
				isNew: elementNode.isNew ?? false,
				highlightIndex: elementNode.highlightIndex,
				parent: null,
				children,
				extra: elementNode.extra ?? {},
			}
		}
	}

	// Set parent references
	// 设置父引用
	const setParentReferences = (node: TreeNode, parent: TreeNode | null = null) => {
		node.parent = parent
		for (const child of node.children) {
			setParentReferences(child, node)
		}
	}

	// Build root node
	// 构建根节点
	const rootNode = buildTreeNode(flatTree.rootId)
	if (!rootNode) return ''

	setParentReferences(rootNode)

	// Helper to check if text node has parent with highlight index
	// 辅助函数：检查文本节点是否有带高亮索引的父节点
	const hasParentWithHighlightIndex = (node: TreeNode): boolean => {
		let current = node.parent
		while (current) {
			if (current.type === 'element' && current.highlightIndex !== undefined) {
				return true
			}
			current = current.parent
		}
		return false
	}

	// Helper to check if parent is top element
	// 辅助函数：检查父节点是否为顶层元素
	// const isParentTopElement = (node: TreeNode): boolean => {
	// 	return node.parent?.type === 'element' && node.parent.isTopElement === true
	// }

	// Main processing function
	// 主处理函数
	const processNode = (node: TreeNode, depth: number, result: string[]): void => {
		let nextDepth = depth
		const depthStr = '\t'.repeat(depth)

		if (node.type === 'element') {
			const isSemantic = keepSemanticTags && node.tagName && SEMANTIC_TAGS.has(node.tagName)

			// Add element with highlight_index
			// 添加带有高亮索引的元素
			if (node.highlightIndex !== undefined) {
				nextDepth += 1

				const text = getAllTextTillNextClickableElement(node)
				let attributesHtmlStr = ''

				if (includeAttrs.length > 0 && node.attributes) {
					const attributesToInclude = matchAttributes(node.attributes, includeAttrs)

					// Remove duplicate values (for attributes longer than 5 chars)
					// 移除重复值（对于长度超过5个字符的属性）
					const keys = Object.keys(attributesToInclude)
					if (keys.length > 1) {
						const keysToRemove = new Set<string>()
						const seenValues: Record<string, string> = {}

						for (const key of keys) {
							const value = attributesToInclude[key]
							if (value.length > 5) {
								if (value in seenValues) {
									keysToRemove.add(key)
								} else {
									seenValues[value] = key
								}
							}
						}

						for (const key of keysToRemove) {
							delete attributesToInclude[key]
						}
					}

					// Remove role if it matches tagName
					// 如果 role 与 tagName 匹配则移除
					if (attributesToInclude.role === node.tagName) {
						delete attributesToInclude.role
					}

					// Remove attributes that duplicate text content
					// 移除与文本内容重复的属性
					const attrsToRemoveIfTextMatches = ['aria-label', 'placeholder', 'title']
					for (const attr of attrsToRemoveIfTextMatches) {
						if (
							attributesToInclude[attr] &&
							attributesToInclude[attr].toLowerCase().trim() === text.toLowerCase().trim()
						) {
							delete attributesToInclude[attr]
						}
					}

					if (Object.keys(attributesToInclude).length > 0) {
						attributesHtmlStr = Object.entries(attributesToInclude)
							.map(([key, value]) => `${key}=${capTextLength(value, 20)}`)
							.join(' ')
					}
				}

				// Build the line
				// 构建行
				const highlightIndicator = node.isNew
					? `*[${node.highlightIndex}]`
					: `[${node.highlightIndex}]`
				let line = `${depthStr}${highlightIndicator}<${node.tagName ?? ''}`

				if (attributesHtmlStr) {
					line += ` ${attributesHtmlStr}`
				}

				/**
				 * @edit scrollable 数据
				 * @edit scrollable data
				 */
				if (node.extra) {
					if (node.extra.scrollable) {
						let scrollDataText = ''
						if (node.extra.scrollData?.left)
							scrollDataText += `left=${node.extra.scrollData.left}, `
						if (node.extra.scrollData?.top) scrollDataText += `top=${node.extra.scrollData.top}, `
						if (node.extra.scrollData?.right)
							scrollDataText += `right=${node.extra.scrollData.right}, `
						if (node.extra.scrollData?.bottom)
							scrollDataText += `bottom=${node.extra.scrollData.bottom}`

						line += ` data-scrollable="${scrollDataText}"`
					}
				}

				if (text) {
					const trimmedText = text.trim()
					if (!attributesHtmlStr) {
						line += ' '
					}
					line += `>${trimmedText}`
				} else if (!attributesHtmlStr) {
					line += ' '
				}

				line += ' />'
				result.push(line)
			}

			// special treatment for semantic tags
			// even if they are not interactive, we can keep them for clear context
			// 对语义标签的特殊处理
			// 即使它们不可交互，我们也可以保留它们以提供清晰的上下文

			const emitSemantic = isSemantic && node.highlightIndex === undefined
			// to check if this tag is empty
			// 检查此标签是否为空
			const mark = emitSemantic ? result.length : -1

			if (emitSemantic) {
				result.push(`${depthStr}<${node.tagName}>`)
				nextDepth += 1
			}

			for (const child of node.children) {
				processNode(child, nextDepth, result)
			}

			if (emitSemantic) {
				// empty tag should be removed
				// 空标签应被移除
				if (result.length === mark + 1) {
					result.pop()
				} else {
					result.push(`${depthStr}</${node.tagName}>`)
				}
			}
		} else if (node.type === 'text') {
			// Add text only if it doesn't have a highlighted parent
			// 仅当没有高亮父节点时才添加文本
			if (hasParentWithHighlightIndex(node)) {
				return
			}

			if (
				node.parent &&
				node.parent.type === 'element' &&
				node.parent.isVisible &&
				node.parent.isTopElement
			) {
				result.push(`${depthStr}${node.text ?? ''}`)
			}
		}
	}

	const result: string[] = []
	processNode(rootNode, 0, result)
	return result.join('\n')
}

// Get all text until next clickable element
// 获取直到下一个可点击元素的所有文本
export const getAllTextTillNextClickableElement = (node: TreeNode, maxDepth = -1): string => {
	const textParts: string[] = []

	const collectText = (currentNode: TreeNode, currentDepth: number) => {
		if (maxDepth !== -1 && currentDepth > maxDepth) {
			return
		}

		// Skip this branch if we hit a highlighted element (except for the current node)
		// 如果遇到高亮元素（当前节点除外）则跳过该分支
		if (
			currentNode.type === 'element' &&
			currentNode !== node &&
			currentNode.highlightIndex !== undefined
		) {
			return
		}

		if (currentNode.type === 'text' && currentNode.text) {
			textParts.push(currentNode.text)
		} else if (currentNode.type === 'element') {
			for (const child of currentNode.children) {
				collectText(child, currentDepth + 1)
			}
		}
	}

	collectText(node, 0)
	return textParts.join('\n').trim()
}

export function getSelectorMap(flatTree: FlatDomTree): Map<number, InteractiveElementDomNode> {
	const selectorMap = new Map<number, InteractiveElementDomNode>()

	const keys = Object.keys(flatTree.map)
	for (const key of keys) {
		const node = flatTree.map[key]
		if (node.isInteractive && typeof node.highlightIndex === 'number') {
			selectorMap.set(node.highlightIndex, node as InteractiveElementDomNode)
		}
	}

	return selectorMap
}

export function getElementTextMap(simplifiedHTML: string) {
	const lines = simplifiedHTML
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
	const elementTextMap = new Map<number, string>()
	for (const line of lines) {
		const regex = /^\[(\d+)\]<[^>]+>([^<]*)/
		const match = regex.exec(line)
		if (match) {
			const index = parseInt(match[1], 10)
			elementTextMap.set(index, line)
		}
	}

	return elementTextMap
}

export function cleanUpHighlights() {
	const cleanupFunctions = (window as any)._highlightCleanupFunctions || []
	for (const cleanup of cleanupFunctions) {
		if (typeof cleanup === 'function') {
			cleanup()
		}
	}

	;(window as any)._highlightCleanupFunctions = []
}

// 监听 URL 的任何变化，立刻清空 highLights
// Listen for any URL changes and clear highlights immediately.
window.addEventListener('popstate', () => {
	// console.log('URL changed (popstate), highlights cleaned up.')
	cleanUpHighlights()
})
window.addEventListener('hashchange', () => {
	// console.log('URL changed (hashchange), highlights cleaned up.')
	cleanUpHighlights()
})
window.addEventListener('beforeunload', () => {
	// console.log('Page is unloading, highlights cleaned up.')
	cleanUpHighlights()
})

const navigation = (window as any).navigation
if (navigation && typeof navigation.addEventListener === 'function') {
	navigation.addEventListener('navigate', () => {
		// console.log('Navigation event detected, highlights cleaned up.')
		cleanUpHighlights()
	})
} else {
	// 定时器
	// Timer fallback
	let currentUrl = window.location.href
	setInterval(() => {
		if (window.location.href !== currentUrl) {
			currentUrl = window.location.href
			// console.log('URL changed (interval), highlights cleaned up.')
			cleanUpHighlights()
		}
	}, 500)
}
