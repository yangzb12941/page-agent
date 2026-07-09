#!/usr/bin/env node
/**
 * Full build pipeline. Equivalent to:
 * 完整构建流水线。相当于：
 *   npm run cleanup && npm run build --workspaces --if-present
 *   npm run cleanup && npm run build --workspaces --if-present
 *                    && npm run build:website -w @page-agent/website
 *                    && npm run build:website -w @page-agent/website
 *                    && npm run zip -w @page-agent/ext
 *                    && npm run zip -w @page-agent/ext
 *
 * 1. cleanup
 * 1. 清理
 * 2. build everything in parallel (libs + website + extension)
 * 2. 并行构建所有内容（库 + 网站 + 扩展）
 */
import chalk from 'chalk'
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

// Step 1: cleanup
console.log(chalk.bgBlue.white.bold(' ▸ cleanup '))
runNpm(rootDir, ['run', 'cleanup'])

// Step 2: build all in dependency order
console.log(chalk.bgBlue.white.bold(' ▸ build '))
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
	console.log(chalk.bgCyan.black.bold(` ▸ ${pkg.name} `))
	runNpm(dir, ['run', 'build'])
}

for (const task of [
	{
		label: '@page-agent/website',
		command: ['run', 'build:website'],
		cwd: join(rootDir, 'packages/website'),
	},
	{ label: '@page-agent/ext', command: ['run', 'zip'], cwd: join(rootDir, 'packages/extension') },
]) {
	console.log(chalk.bgCyan.black.bold(` ▸ ${task.label} `))
	runNpm(task.cwd, task.command)
}
