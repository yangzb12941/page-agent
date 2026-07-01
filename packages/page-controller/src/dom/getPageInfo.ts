/**
 * Get comprehensive page information about viewport, page dimensions, scroll positions, and pagination.
 * 获取全面的页面信息，包括视口、页面尺寸、滚动位置和分页数据。
 */
export function getPageInfo() {
	const viewport_width = window.innerWidth
	const viewport_height = window.innerHeight

	const page_width = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth || 0)
	const page_height = Math.max(
		document.documentElement.scrollHeight,
		document.body.scrollHeight || 0
	)

	const scroll_x = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || 0
	const scroll_y = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0

	const pixels_below = Math.max(0, page_height - (window.innerHeight + scroll_y))
	const pixels_right = Math.max(0, page_width - (window.innerWidth + scroll_x))

	return {
		// Current viewport dimensions
		// 当前视口尺寸
		viewport_width,
		viewport_height,

		// Total page dimensions
		// 页面总尺寸
		page_width,
		page_height,

		// Current scroll position
		// 当前滚动位置
		scroll_x,
		scroll_y,

		pixels_above: scroll_y, // 上方像素数
		pixels_below,

		pages_above: viewport_height > 0 ? scroll_y / viewport_height : 0, // 上方的页面数
		pages_below: viewport_height > 0 ? pixels_below / viewport_height : 0, // 下方的页面数
		total_pages: viewport_height > 0 ? page_height / viewport_height : 0, // 总页面数

		current_page_position: scroll_y / Math.max(1, page_height - viewport_height), // 当前页面位置比例

		pixels_left: scroll_x, // 左侧像素数
		pixels_right,
	}
}