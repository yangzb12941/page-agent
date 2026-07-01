#!/usr/bin/env node
/**
 * Sync version from root package.json to all packages
 * 从根目录 package.json 同步版本到所有包
 *
 * Usage:
 * 用法：
 *   node scripts/sync-version.js        # Sync current version from root
 *   node scripts/sync-version.js        # 从根同步当前版本
 *   node scripts/sync-version.js 0.1.0  # Set root version, then sync all packages
 *   node scripts/sync-version.js 0.1.0  # 设置根版本，然后同步所有包
 */
import chalk from 'chalk'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { exit } from 'process'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

const versionArg = process.argv[2]

// Read root package.json
// 读取根目录 package.json
const rootPkgPath = join(rootDir, 'package.json')
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8'))
const oldVersion = rootPkg.version
const newVersion = versionArg ?? rootPkg.version

if (!newVersion) {
	console.log(chalk.yellow('⚠️  No version found in root package.json.\n'))
	exit(1)
}

console.log(chalk.cyan.bold('\n📦 Syncing version\n'))

// Update root package.json if new version specified
// 如果指定了新版本，则更新根目录 package.json
if (versionArg) {
	rootPkg.version = newVersion
	writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, '    ') + '\n')
	console.log(
		chalk.green('✓') +
			` ${chalk.bold('root')}: ${chalk.dim(oldVersion)} → ${chalk.yellow(newVersion)}`
	)
} else {
	console.log(chalk.dim('  root:') + ` ${chalk.yellow(newVersion)} ${chalk.dim('(source)')}`)
}

// Sync to all packages
// 同步到所有包
const packagesDir = join(rootDir, 'packages')
const packages = readdirSync(packagesDir, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name)

let hasChanges = !!versionArg

/**
 * Check if a dependency name is a page-agent internal package
 * 检查依赖名称是否为 page-agent 内部包
 */
function isInternalPackage(name) {
	return name === 'page-agent' || name.startsWith('@page-agent/')
}

/**
 * Update internal package versions in dependencies object
 * 更新依赖对象中的内部包版本
 * @returns {boolean} Whether any changes were made
 * @returns {boolean} 是否有任何更改
 */
function updateInternalDeps(deps, newVersion) {
	if (!deps) return false
	let changed = false
	for (const [name, version] of Object.entries(deps)) {
		if (isInternalPackage(name) && version !== newVersion) {
			deps[name] = newVersion
			changed = true
		}
	}
	return changed
}

for (const pkg of packages) {
	const pkgPath = join(packagesDir, pkg, 'package.json')
	if (!existsSync(pkgPath)) continue

	const pkgJson = JSON.parse(readFileSync(pkgPath, 'utf-8'))
	let pkgChanged = false

	// Update package version
	// 更新包版本
	if (pkgJson.version !== newVersion) {
		pkgJson.version = newVersion
		pkgChanged = true
	}

	// Update internal dependencies (dependencies only, devDeps keep "*")
	// 更新内部依赖（仅 dependencies，devDeps 保留 "*"）
	if (updateInternalDeps(pkgJson.dependencies, newVersion)) {
		pkgChanged = true
	}

	if (!pkgChanged) {
		console.log(chalk.dim(`  ${pkgJson.name}: ${newVersion} (unchanged)`))
		continue
	}

	writeFileSync(pkgPath, JSON.stringify(pkgJson, null, '    ') + '\n')
	console.log(
		chalk.green('✓') +
			` ${chalk.bold(pkgJson.name)}: ${chalk.dim(oldVersion)} → ${chalk.yellow(newVersion)}`
	)
	hasChanges = true
}

// Update CDN URLs in documentation and source files
// 更新文档和源代码中的 CDN URL
const CDN_DEMO_URL_OLD = `https://cdn.jsdelivr.net/npm/page-agent@${oldVersion}/dist/iife/page-agent.demo.js`
const CDN_DEMO_URL_NEW = `https://cdn.jsdelivr.net/npm/page-agent@${newVersion}/dist/iife/page-agent.demo.js`
const CDN_DEMO_CN_URL_OLD = `https://registry.npmmirror.com/page-agent/${oldVersion}/files/dist/iife/page-agent.demo.js`
const CDN_DEMO_CN_URL_NEW = `https://registry.npmmirror.com/page-agent/${newVersion}/files/dist/iife/page-agent.demo.js`

const filesToUpdateCdn = ['README.md', 'docs/README-zh.md', 'packages/website/src/constants.ts']

for (const relPath of filesToUpdateCdn) {
	const filePath = join(rootDir, relPath)
	if (!existsSync(filePath)) continue

	let content = readFileSync(filePath, 'utf-8')
	const original = content

	content = content.replaceAll(CDN_DEMO_URL_OLD, CDN_DEMO_URL_NEW)
	content = content.replaceAll(CDN_DEMO_CN_URL_OLD, CDN_DEMO_CN_URL_NEW)

	if (content !== original) {
		writeFileSync(filePath, content)
		console.log(chalk.green('✓') + ` ${chalk.bold(relPath)}: CDN URLs updated`)
		hasChanges = true
	}
}

console.log(chalk.green.bold(`\n✓ Version synced: ${newVersion}\n`))

// Show git commands hint
// 显示 git 命令提示
if (hasChanges) {
	const tagName = `v${newVersion}`
	console.log(chalk.cyan.bold('📋 Next steps:\n'))
	console.log(chalk.blueBright(`npm i`))
	console.log(
		chalk.blueBright(`git add . && git commit -m "chore(version): bump version to ${newVersion}"`)
	)
	console.log(chalk.blueBright(`git tag -a ${tagName} -m "${tagName}"`))
	console.log(chalk.blueBright(`git push && git push origin ${tagName}\n`))
}