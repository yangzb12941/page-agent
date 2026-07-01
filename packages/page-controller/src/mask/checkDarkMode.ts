/**
 * A comprehensive function to determine if the page is currently in a dark theme.
 * 一个综合函数，用于判断页面当前是否处于深色主题。
 * Heuristic check. Only work for common patterns. Return false by default.
 * 启发式检查。仅适用于常见模式。默认返回 false。
 */
export function isPageDark() {
	try {
		if (hasDarkModeClass()) return true
		if (hasDarkModeDataAttribute()) return true
		if (isColorSchemeDark()) return true
		if (isBackgroundDark()) return true
		if (isMainContentBackgroundDark()) return true
		if (isTextColorLight()) return true

		return false
	} catch (error) {
		console.warn('Error determining if page is dark:', error)
		return false
	}
}

/**
 * Checks for common dark mode CSS classes on the html or body elements.
 * 检查 html 或 body 元素上常见的深色模式 CSS 类。
 */
function hasDarkModeClass() {
	const DEFAULT_DARK_MODE_CLASSES = ['dark', 'dark-mode', 'theme-dark', 'night', 'night-mode']

	const htmlElement = document.documentElement
	const bodyElement = document.body || document.documentElement // can be null in some cases
	// 在某些情况下可能为 null

	// Check class names on <html> and <body>
	// 检查 <html> 和 <body> 上的类名
	for (const className of DEFAULT_DARK_MODE_CLASSES) {
		if (htmlElement.classList.contains(className) || bodyElement?.classList.contains(className)) {
			return true
		}
	}

	return false
}

/**
 * Some UI frameworks use data attributes to indicate theme
 * 某些 UI 框架使用 data 属性来表示主题
 */
function hasDarkModeDataAttribute() {
	const htmlElement = document.documentElement
	const bodyElement = document.body || document.documentElement // can be null in some cases
	// 在某些情况下可能为 null

	const dataAttrs = ['data-theme', 'data-color-mode', 'data-bs-theme', 'data-mui-color-scheme']
	for (const attr of dataAttrs) {
		const bodyValue = bodyElement?.getAttribute(attr)
		const htmlValue = htmlElement.getAttribute(attr)

		if (bodyValue?.toLowerCase() === 'dark' || htmlValue?.toLowerCase() === 'dark') {
			return true
		}
	}

	return false
}

/**
 * Checks the CSS `color-scheme` property and `<meta name="color-scheme">` tag.
 * 检查 CSS `color-scheme` 属性和 `<meta name="color-scheme">` 标签。
 * Only "dark"/"only dark" counts as dark; "light dark" is ambiguous and ignored.
 * 只有 "dark" 或 "only dark" 算作深色；"light dark" 有歧义，将被忽略。
 */
function isColorSchemeDark() {
	// Check <meta name="color-scheme" content="dark">
	// 检查 <meta name="color-scheme" content="dark">
	const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
	const metaContent = meta?.content.toLowerCase()
	if (metaContent === 'dark' || metaContent === 'only dark') return true

	// Check the computed color-scheme CSS property on :root
	// 检查 :root 上计算后的 color-scheme CSS 属性
	const rootStyle = window.getComputedStyle(document.documentElement)
	const colorScheme = rootStyle.getPropertyValue('color-scheme').trim().toLowerCase()
	return colorScheme === 'dark' || colorScheme === 'only dark'
}

/**
 * Checks the background color of the body element to determine if the page is dark.
 * 检查 body 元素的背景色以确定页面是否为深色。
 */
function isBackgroundDark() {
	// We check both <html> and <body> because some pages set the color on <html>
	// 我们同时检查 <html> 和 <body>，因为有些页面将颜色设置在 <html> 上
	const htmlStyle = window.getComputedStyle(document.documentElement)
	const bodyStyle = window.getComputedStyle(document.body || document.documentElement)

	// Get background colors
	// 获取背景颜色
	const htmlBgColor = htmlStyle.backgroundColor
	const bodyBgColor = bodyStyle.backgroundColor

	// The body's background might be transparent, in which case we should
	// fall back to the html element's background.
	// body 的背景可能是透明的，此时应回退到 html 元素的背景。
	if (isColorDark(bodyBgColor)) {
		return true
	} else if (bodyBgColor === 'transparent' || bodyBgColor.startsWith('rgba(0, 0, 0, 0)')) {
		return isColorDark(htmlBgColor)
	}

	return false
}

/**
 * Checks if the text color on the body is light, which implies a dark background.
 * 检查 body 上的文本颜色是否为亮色，这暗示着深色背景。
 */
function isTextColorLight() {
	/** Luminance (0-255) above which body text is considered light */
	/** 亮度值（0-255），高于此值的 body 文本视为亮色 */
	const LIGHT_TEXT_LUMINANCE = 200

	const bodyStyle = window.getComputedStyle(document.body || document.documentElement)
	const luminance = getLuminance(bodyStyle.color)

	// Light text has high luminance (e.g. white text on dark bg)
	// 亮色文本具有高亮度（例如深色背景上的白色文本）
	return luminance !== null && luminance > LIGHT_TEXT_LUMINANCE
}

/**
 * Checks the background color of major layout elements (#app, #root, etc.).
 * 检查主要布局元素（#app, #root 等）的背景色。
 * Many SPAs render into a container that may have its own dark background while
 * <body> remains transparent.
 * 许多 SPA 在容器中渲染，该容器可能有自己的深色背景，而 <body> 保持透明。
 */
function isMainContentBackgroundDark() {
	const { innerWidth: vw, innerHeight: vh } = window
	const minArea = vw * vh * 0.5

	const selectors = ['#app', '#root', '#__next']
	for (const selector of selectors) {
		const el = document.querySelector(selector)
		if (!el) continue

		const rect = el.getBoundingClientRect()
		if (rect.width * rect.height < minArea) continue

		if (isColorDark(window.getComputedStyle(el).backgroundColor)) return true
	}
	return false
}

// --- utils ---
// --- 工具函数 ---

/**
 * Parses an RGB or RGBA color string and returns an object with r, g, b properties.
 * 解析 RGB 或 RGBA 颜色字符串，返回包含 r, g, b 属性的对象。
 * @param {string} colorString - e.g., "rgb(34, 34, 34)" or "rgba(0, 0, 0, 0.5)"
 * @param {string} colorString - 例如 "rgb(34, 34, 34)" 或 "rgba(0, 0, 0, 0.5)"
 * @returns {{r: number, g: number, b: number}|null}
 */
function parseRgbColor(colorString: string) {
	const rgbMatch = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(colorString)
	if (!rgbMatch) {
		return null // Not a valid rgb/rgba string
		// 不是有效的 rgb/rgba 字符串
	}
	return {
		r: parseInt(rgbMatch[1]),
		g: parseInt(rgbMatch[2]),
		b: parseInt(rgbMatch[3]),
	}
}

/**
 * Calculates the perceived luminance (0-255) of a CSS color string.
 * 计算 CSS 颜色字符串的感知亮度（0-255）。
 * @param {string} colorString - e.g., "rgb(50, 50, 50)" or "rgba(0, 0, 0, 0.5)"
 * @param {string} colorString - 例如 "rgb(50, 50, 50)" 或 "rgba(0, 0, 0, 0.5)"
 * @returns {number|null} - The luminance, or null if the color is transparent or unparseable.
 * @returns {number|null} - 亮度值，如果颜色透明或无法解析则返回 null。
 */
function getLuminance(colorString: string): number | null {
	if (!colorString || colorString === 'transparent' || colorString.startsWith('rgba(0, 0, 0, 0)')) {
		return null // Transparent has no meaningful luminance
		// 透明色没有有意义的亮度
	}

	const rgb = parseRgbColor(colorString)
	if (!rgb) {
		return null // Could not parse color
		// 无法解析颜色
	}

	// Standard perceived luminance formula
	// 标准感知亮度公式
	return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b
}

/**
 * Determines if a color is "dark" based on its calculated luminance.
 * 根据计算的亮度判断颜色是否为“深色”。
 * @param {string} colorString - The CSS color string (e.g., "rgb(50, 50, 50)").
 * @param {string} colorString - CSS 颜色字符串（例如 "rgb(50, 50, 50)"）。
 * @param {number} threshold - A value between 0 and 255. Colors with luminance below this will be considered dark. Default is 128.
 * @param {number} threshold - 0 到 255 之间的值。亮度低于此值的颜色将被视为深色。默认值为 128。
 */
function isColorDark(colorString: string, threshold = 128) {
	const luminance = getLuminance(colorString)
	return luminance !== null && luminance < threshold
}