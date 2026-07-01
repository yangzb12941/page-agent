// @ts-check
import { config as dotenvConfig } from 'dotenv'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env from repo root
// 从仓库根目录加载 .env 文件
dotenvConfig({ path: resolve(__dirname, '../../.env'), quiet: true })

// UMD Bundle for CDN
// UMD 打包用于 CDN
// - alias all local packages so that they can be build in
// - 为所有本地包设置别名，以便它们可以被构建进来
// - no external
// - 不外部化
// - no d.ts. dts does not work with monorepo aliasing
// - 不生成 d.ts。dts 不适用于 monorepo 别名
export default defineConfig(() => ({
	plugins: [
		cssInjectedByJsPlugin({ relativeCSSInjection: true }),
		// analyzer()
	],
	publicDir: false,
	build: {
		lib: {
			entry: resolve(__dirname, 'src/demo.ts'),
			name: 'PageAgent',
			fileName: () => `page-agent.demo.js`,
			formats: ['iife'],
		},
		outDir: resolve(__dirname, 'dist', 'iife'),
		cssCodeSplit: true,
		// minify: false,
		rollupOptions: {
			// output: {
			// 	// force use .js as extension
			// 	entryFileNames: 'page-agent.js',
			// },
			onwarn: function (message, handler) {
				if (message.code === 'EVAL') return
				handler(message)
			},
		},
	},
	define: {
		'import.meta.env.LLM_MODEL_NAME': JSON.stringify(process.env.LLM_MODEL_NAME),
		'import.meta.env.LLM_API_KEY': JSON.stringify(process.env.LLM_API_KEY),
		'import.meta.env.LLM_BASE_URL': JSON.stringify(process.env.LLM_BASE_URL),
	},
}))
