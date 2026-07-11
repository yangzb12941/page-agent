import type { PageController } from '../PageController'

// Find common React root elements and add data-page-agent-not-interactive attribute
// 查找常见的 React 根元素并添加 data-page-agent-not-interactive 属性。
export function patchReact(pageController: PageController) {
	const reactRootElements = document.querySelectorAll(
		'[data-reactroot], [data-reactid], [data-react-checksum], #root, #app, [id^="root-"], [id^="app-"], #adex-wrapper, #adex-root'
	)

	for (const element of reactRootElements) {
		element.setAttribute('data-page-agent-not-interactive', 'true')
	}
}

/**
 * @todo (Heavy, might have false negatives) Interaction detection, if element width/height equals body offsetWidth/Height,
 * consider it root element and non-interactive (React often attaches many events to root elements, causing false positives)
 * @todo（性能开销较大，可能会有漏报）交互检测：如果元素的宽/高等于 body 的 offsetWidth/offsetHeight，则将其视为根元素并标记为非交互元素（因为 React 经常在根元素上绑定大量事件，从而导致误报）。
 */
