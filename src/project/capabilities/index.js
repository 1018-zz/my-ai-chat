// 能力注册表：所有能力 module 按顺序导出
// 加一个新能力 = 新增一个 module 文件 + 在此数组追加，永远不碰 instructions.js 人格核心
import projectStructure from './projectStructure.js'
import tools from './tools.js'
import memory from './memory.js'
import diary from './diary.js'
import innerVoice from './innerVoice.js'
import homeSensing from './homeSensing.js'
import notes from './notes.js'
import ops from './ops.js'

export const capabilities = [
  projectStructure,
  tools,
  memory,
  diary,
  innerVoice,
  homeSensing,
  notes,
  ops,
]
