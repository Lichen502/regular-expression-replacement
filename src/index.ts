import { Context, Schema, Service, h } from 'koishi'
import { resolve } from 'path'
import fs from 'fs/promises'
import { existsSync, mkdirSync } from 'fs'
import {} from '@koishijs/plugin-console'

export const name = 'regular-expression-replacement'

export interface RemoveRule { pattern: string; flags?: string; enabled?: boolean }
export interface ReplaceRule { pattern: string; flags?: string; replacement: string; enabled?: boolean }
export interface RandomReplaceRule { pattern: string; flags?: string; replacements: string[]; enabled?: boolean }

export interface RulesData {
  removeRules: RemoveRule[]
  replaceRules: ReplaceRule[]
  randomReplaceRules: RandomReplaceRule[]
}

export interface Config {
  debug: boolean
}

export const Config: Schema<Config> = Schema.object({
  debug: Schema.boolean().default(false).description('输出正则处理前后的调试日志'),
}).description('基础设置（规则管理请前往左侧菜单的“正则替换”页面）')

// 声明 Console 通信接口
declare module '@koishijs/plugin-console' {
  interface Events {
    'regex-replace/get'(): Promise<RulesData>
    'regex-replace/set'(data: RulesData): Promise<void>
    'regex-replace/test'(input: string): Promise<string>
  }
}

declare module 'koishi' {
  interface Context {
    regularExpressionReplacement: RegularExpressionReplacementService
  }
}

function createRegex(pattern: string, flags: string | undefined, pluginLogger?: ReturnType<Context['logger']>): RegExp | null {
  try { return new RegExp(pattern, flags || 'g') } 
  catch (error: any) {
    pluginLogger?.warn(`无效的正则表达式 /${pattern}/${flags || 'g'}：`, error?.message || error)
    return null
  }
}

export class RegularExpressionReplacementService extends Service {
  public rules: RulesData = { removeRules: [], replaceRules: [], randomReplaceRules: [] }
  private filePath: string
  private pluginLogger: ReturnType<Context['logger']>

  constructor(ctx: Context, public config: Config) {
    // 第三个参数 true 代表这是 immediate 服务，注册后立刻生效
    super(ctx, 'regularExpressionReplacement', true)
    this.pluginLogger = ctx.logger(name)
    this.filePath = resolve(ctx.baseDir, 'data', 'regex-rules.json')
    this.initData()
  }

  private async initData() {
    try {
      const dataDir = resolve(this.ctx.baseDir, 'data')
      if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
      
      if (existsSync(this.filePath)) {
        const content = await fs.readFile(this.filePath, 'utf-8')
        this.rules = { ...this.rules, ...JSON.parse(content) }
      } else {
        await this.saveRules(this.rules)
      }
    } catch (e) {
      this.pluginLogger.error('加载正则规则失败', e)
    }
  }

  public async saveRules(data: RulesData) {
    this.rules = data
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  transform(input: string): string {
    if (!input) return input
    let text = input
    const original = input

    // 1. 通常剔除
    for (const rule of this.rules.removeRules || []) {
      if (rule.enabled === false || !rule.pattern) continue
      const regex = createRegex(rule.pattern, rule.flags, this.pluginLogger)
      if (regex) text = text.replace(regex, '')
    }

    // 2. 通常替换
    for (const rule of this.rules.replaceRules || []) {
      if (rule.enabled === false || !rule.pattern) continue
      const regex = createRegex(rule.pattern, rule.flags, this.pluginLogger)
      if (regex) text = text.replace(regex, rule.replacement ?? '')
    }

    // 3. 随机替换
    for (const rule of this.rules.randomReplaceRules || []) {
      if (rule.enabled === false || !rule.pattern) continue
      const replacements = (rule.replacements || []).filter(item => item !== undefined && item !== null)
      if (!replacements.length) continue
      const regex = createRegex(rule.pattern, rule.flags, this.pluginLogger)
      if (regex) {
        text = text.replace(regex, () => replacements[Math.floor(Math.random() * replacements.length)])
      }
    }

    if (this.config.debug && original !== text) {
      this.pluginLogger.info(`正则替换：\n原文：${original}\n结果：${text}`)
    }
    return text
  }
}

export function apply(ctx: Context, config: Config) {
  // 正确写法：直接传入类，由 Koishi 管理生命周期
  ctx.plugin(RegularExpressionReplacementService, config)

  // 消息发送拦截
  // 必须显式声明依赖：本插件把服务注册在 ctx.plugin() 的子作用域里，
  // 直接在父作用域用 ctx.regularExpressionReplacement 会被 Cordis 判为
  // "property ... is not registered"，每条消息都刷一条警告。
  ctx.inject(['regularExpressionReplacement'], (ctx) => ctx.before('send', (session) => {
    try {
      if (!session.content || session.content.includes('<audio') || session.content.includes('[CQ:record')) return
      
      const service = ctx.regularExpressionReplacement
      if (!service) return

      const elements = session.elements || h.parse(session.content)
      const transformedElements = h.transform(elements, {
        text: (attrs) => h.text(service.transform(attrs.content || ''))
      })
      session.elements = transformedElements
      session.content = transformedElements.join('')
    } catch (error: any) {
      ctx.logger(name).warn('机器人输出正则处理失败：', error?.message || error)
    }
  }))
  const prodPath = resolve(__dirname, '../dist')

  ctx.logger(name).info(`__dirname = ${__dirname}`)
  ctx.logger(name).info(`console prod path = ${prodPath}`)
  ctx.logger(name).info(`dist exists = ${existsSync(prodPath)}`)
  ctx.logger(name).info(`dist index exists = ${existsSync(resolve(prodPath, 'index.js'))}`)
  ctx.logger(name).info(`dist style exists = ${existsSync(resolve(prodPath, 'style.css'))}`)
  // 确保控制台插件存在时才注入页面和 API
  // 同样要声明 regularExpressionReplacement 依赖，否则 save/test 回调读取服务时会刷警告
  ctx.inject(['console', 'regularExpressionReplacement'], (ctx) => {
    ctx.console.addEntry({
      dev: resolve(__dirname, '../client/index.ts'),
      prod: resolve(__dirname, '../dist'),
    })

    // 监听前端请求，通过 ctx.regularExpressionReplacement 调用服务方法
    ctx.console.addListener('regex-replace/get', async () => {
      return ctx.regularExpressionReplacement.rules
    })
    
    ctx.console.addListener('regex-replace/set', async (data) => {
      await ctx.regularExpressionReplacement.saveRules(data)
    })
    
    ctx.console.addListener('regex-replace/test', async (input) => {
      return ctx.regularExpressionReplacement.transform(input)
    })
  })
}