<template>
  <k-layout>
    <div class="regex-container">
      <div class="header">
        <h2>正则替换规则管理</h2>
        <div class="actions">
          <el-button type="success" plain @click="saveData">保存更改</el-button>
          <el-button type="primary" plain @click="exportData">导出配置</el-button>
          <el-button type="warning" plain @click="triggerImport">导入配置</el-button>
          <input type="file" ref="fileInput" style="display: none" accept=".json" @change="importData" />
        </div>
      </div>

      <el-tabs v-model="activeTab" class="custom-tabs">
        <!-- ================= 1. 剔除规则 ================= -->
        <el-tab-pane label="剔除规则" name="remove">
          <el-button type="primary" size="small" @click="addRule('remove')" style="margin-bottom: 15px;">新增剔除规则</el-button>
          <el-table :data="rules.removeRules" border stripe>
            <el-table-column label="启用" width="80" align="center">
              <template #default="{ row }">
                <el-switch v-model="row.enabled" />
              </template>
            </el-table-column>
            <el-table-column label="正则表达式 (Pattern)">
              <template #default="{ row }">
                <el-input v-model="row.pattern" placeholder="例如: \\[.*?\\]" />
              </template>
            </el-table-column>
            <el-table-column label="正则标志 (Flags)" width="150">
              <template #default="{ row }">
                <el-input v-model="row.flags" placeholder="g / gi" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="center">
              <template #default="{ $index }">
                <el-button type="danger" size="small" @click="removeRule('remove', $index)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- ================= 2. 普通替换 ================= -->
        <el-tab-pane label="普通替换" name="replace">
          <el-button type="primary" size="small" @click="addRule('replace')" style="margin-bottom: 15px;">新增普通替换</el-button>
          <el-table :data="rules.replaceRules" border stripe>
            <el-table-column label="启用" width="80" align="center">
              <template #default="{ row }">
                <el-switch v-model="row.enabled" />
              </template>
            </el-table-column>
            <el-table-column label="正则表达式 (Pattern)">
              <template #default="{ row }">
                <el-input v-model="row.pattern" />
              </template>
            </el-table-column>
            <el-table-column label="正则标志" width="100">
              <template #default="{ row }">
                <el-input v-model="row.flags" />
              </template>
            </el-table-column>
            <el-table-column label="替换内容 (Replacement)">
              <template #default="{ row }">
                <el-input v-model="row.replacement" placeholder="支持 $1, $2 等" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="center">
              <template #default="{ $index }">
                <el-button type="danger" size="small" @click="removeRule('replace', $index)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- ================= 3. 随机替换 ================= -->
        <el-tab-pane label="随机替换" name="random">
          <el-button type="primary" size="small" @click="addRule('random')" style="margin-bottom: 15px;">新增随机替换</el-button>
          <el-table :data="rules.randomReplaceRules" border stripe>
            <el-table-column label="启用" width="80" align="center">
              <template #default="{ row }">
                <el-switch v-model="row.enabled" />
              </template>
            </el-table-column>
            <el-table-column label="正则表达式" width="250">
              <template #default="{ row }">
                <el-input v-model="row.pattern" />
                <el-input v-model="row.flags" placeholder="Flags (g)" style="margin-top: 5px;" />
              </template>
            </el-table-column>
            <el-table-column label="候选替换内容 (每行一个)">
              <template #default="{ row, $index }">
                <el-input 
                  type="textarea" 
                  :rows="3" 
                  :model-value="row.replacements.join('\n')" 
                  @update:model-value="val => updateRandomArray(val, $index)"
                  placeholder="每行输入一个候选文本"
                />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="center">
              <template #default="{ $index }">
                <el-button type="danger" size="small" @click="removeRule('random', $index)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- ================= 4. 正则测试工具 ================= -->
        <el-tab-pane label="🧪 正则测试工具" name="test">
          <el-card shadow="never">
            <template #header>
              <span>输入待测试的文本（需先点击上方“保存更改”使最新规则生效）</span>
            </template>
            <el-input 
              type="textarea" 
              v-model="testInput" 
              :rows="4" 
              placeholder="请输入机器人原本准备发出的消息..." 
            />
            <div style="margin-top: 15px;">
              <el-button type="primary" @click="runTest">执行替换测试</el-button>
            </div>
            
            <div v-if="testOutput !== null" style="margin-top: 20px;">
              <h4>处理结果：</h4>
              <el-input 
                type="textarea" 
                v-model="testOutput" 
                :rows="4" 
                readonly 
                class="result-box"
              />
            </div>
          </el-card>
        </el-tab-pane>
      </el-tabs>
    </div>
  </k-layout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { send } from '@koishijs/client'
import { ElMessage } from 'element-plus'

// 1. 显式声明类型接口
interface RemoveRule { pattern: string; flags?: string; enabled?: boolean }
interface ReplaceRule { pattern: string; flags?: string; replacement: string; enabled?: boolean }
interface RandomReplaceRule { pattern: string; flags?: string; replacements: string[]; enabled?: boolean }

interface RulesData {
  removeRules: RemoveRule[]
  replaceRules: ReplaceRule[]
  randomReplaceRules: RandomReplaceRule[]
}

const activeTab = ref('remove')

// 2. 将类型应用到 ref 上
const rules = ref<RulesData>({
  removeRules: [],
  replaceRules: [],
  randomReplaceRules: []
})

const fileInput = ref<HTMLInputElement | null>(null)
const testInput = ref('')
const testOutput = ref<string | null>(null)

// 生命周期：加载数据
onMounted(async () => {
  try {
    // 强制声明返回值类型
    const data = await send('regex-replace/get') as RulesData
    if (data) {
      rules.value = data
    }
  } catch (e) {
    ElMessage.error('无法加载规则配置')
  }
})

// 保存规则到后端
const saveData = async () => {
  try {
    await send('regex-replace/set', JSON.parse(JSON.stringify(rules.value)))
    ElMessage.success('规则已保存并生效')
  } catch (e) {
    ElMessage.error('保存失败')
  }
}

// 基础增删操作
const addRule = (type: 'remove' | 'replace' | 'random') => {
  if (type === 'remove') rules.value.removeRules.push({ pattern: '', flags: 'g', enabled: true })
  if (type === 'replace') rules.value.replaceRules.push({ pattern: '', flags: 'g', replacement: '', enabled: true })
  if (type === 'random') rules.value.randomReplaceRules.push({ pattern: '', flags: 'g', replacements: [], enabled: true })
}

const removeRule = (type: 'remove' | 'replace' | 'random', index: number) => {
  if (type === 'remove') rules.value.removeRules.splice(index, 1)
  if (type === 'replace') rules.value.replaceRules.splice(index, 1)
  if (type === 'random') rules.value.randomReplaceRules.splice(index, 1)
}

// 辅助：处理 textarea 中按行分割的数组
const updateRandomArray = (val: string, index: number) => {
  rules.value.randomReplaceRules[index].replacements = val.split('\n')
}

// 导出数据
const exportData = () => {
  const dataStr = JSON.stringify(rules.value, null, 2)
  const blob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'regex-rules-export.json'
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('导出成功')
}

// 导入数据
const triggerImport = () => {
  fileInput.value?.click()
}

const importData = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const parsed = JSON.parse(e.target?.result as string) as RulesData
      if (parsed.removeRules || parsed.replaceRules || parsed.randomReplaceRules) {
        rules.value = {
          removeRules: parsed.removeRules || [],
          replaceRules: parsed.replaceRules || [],
          randomReplaceRules: parsed.randomReplaceRules || []
        }
        await saveData()
        ElMessage.success('导入成功并已保存')
      } else {
        throw new Error('格式不正确')
      }
    } catch (err) {
      ElMessage.error('导入失败，请确保是有效的规则 JSON 文件')
    }
    // 清空 input 状态以允许重复导入同名文件
    if (fileInput.value) fileInput.value.value = ''
  }
  reader.readAsText(file)
}

// 测试功能
const runTest = async () => {
  if (!testInput.value) {
    ElMessage.warning('请输入测试文本')
    return
  }
  try {
    const res = await send('regex-replace/test', testInput.value)
    testOutput.value = res as string
    ElMessage.success('测试完成')
  } catch (e) {
    ElMessage.error('测试执行失败')
  }
}
</script>
<style scoped>
.regex-container {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header h2 {
  margin: 0;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.custom-tabs {
  background: var(--el-bg-color);
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
}

.result-box :deep(.el-textarea__inner) {
  background-color: var(--el-fill-color-light);
  color: var(--el-color-success);
  font-weight: bold;
}
</style>