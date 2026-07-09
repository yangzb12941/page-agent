#!/usr/bin/env node
/**
 * Equivalent to: npm run build --workspaces --if-present
 * 等同于：npm run build --workspaces --if-present
 *
 * Reads the workspace list from root package.json, filters to those with a
 * 从根目录 package.json 读取工作区列表，筛选出包含
 * "build" script, and runs them all concurrently via parallelTask.
 * "build" 脚本的工作区，并通过 parallelTask 并发运行它们。
 */
import { spawnSync } from 'child_process'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const rootPkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'))

const runNpm = (cwd, args) => {
	const shell = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : '/bin/sh'
	const shellArgs =
		process.platform === 'win32'
			? ['/d', '/s', '/c', `npm ${args.join(' ')}`]
			: ['-c', `npm ${args.join(' ')}`]
	const result = spawnSync(shell, shellArgs, {
		cwd,
		stdio: 'inherit',
		env: { ...process.env, FORCE_COLOR: '1', NO_COLOR: '' },
	})
	if (result.status !== 0) {
		throw new Error(`npm ${args.join(' ')} failed with exit code ${result.status}`)
	}
}

const workspaceOrder = [
	'packages/page-controller',
	'packages/ui',
	'packages/llms',
	'packages/core',
	'packages/page-agent',
]

for (const ws of workspaceOrder) {
	const dir = join(rootDir, ws)
	const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
	if (!pkg.scripts?.build) continue
	console.log(`Building ${pkg.name}...`)
	runNpm(dir, ['run', 'build'])
}
