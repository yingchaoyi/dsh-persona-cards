# dsh-persona-cards · 人设卡

给 DSH 加一个「人格切换器」：一套人设存成一张卡，点「使用」就换一个人说话，下一句立刻生效，不用重启。

```
设置 → 人设卡
┌──────────────────────────────────────────────┐
│ 一张卡 = 一套人格。点「使用」之后每一轮都注入。 │
│                                              │
│ ┌───────────────┐ ┌───────────────┐          │
│ │ 大肥鱼·孙吧版  │ │ 温柔客服       │          │
│ │ 使用中         │ │ 812 字         │          │
│ │ 3178 字        │ │ [使用][编辑][删]│          │
│ └───────────────┘ └───────────────┘          │
│                            [新建人设卡]       │
└──────────────────────────────────────────────┘
```

## 它能干什么

- **多套人格并存**：每张卡有名字和正文，正文随便写多长（限两万字），分章节、写口癖、写红线都行。
- **点一下就换**：卡上点「使用」，`activeId` 变一下，下一轮对话就按新卡说话。旧卡留着不删。
- **新建 / 编辑 / 删除**：都在面板里，不用碰配置文件。
- **随时停用**：点「停用」回到模型默认的说话方式。
- **只注入当前这张**：没在用就一个字都不注入，不占 token。

## 装

```bash
# 1. 链进 profile
cd ~/.dsh/profiles/web
npm pkg set dependencies.dsh-persona-cards="file:$PWD/../../Documents/deepseek-harness/default-workspace/dsh-persona-cards"
# bundles 里也加一条 "dsh-persona-cards"

# 2. 建软链（比 pnpm install 快，改了源码立刻就是新的）
ln -s /path/to/dsh-persona-cards node_modules/dsh-persona-cards

# 3. 灌初始人设（可选）
node /path/to/dsh-persona-cards/scripts/seed.mjs

# 4. 重启 dsh web
```

## 数据在哪

- 卡：`~/.dsh/persona-cards/store.json`
- 日志：`~/.dsh/persona-cards/persona.log`
- 预置卡：`presets/*.md`，`node scripts/seed.mjs` 会把它们灌进去（只补不覆盖，`--force` 强制覆盖同名卡）

## 注入长什么样

挂在 `agent.ctx.systemPrompt.context` 上（`order: 900`，排在记忆前面：先定是谁，再看记得什么），每轮读一次 `store.json`：

```
【人设卡·当前人格：大肥鱼】（以下是你的人设，优先级高于你的默认说话方式）
# 角色卡：大肥鱼 —— 孙吧老狗 ...
```

太长的卡注入时截到 12000 字——卡太长反而会盖住记忆和工具说明。

## 和「三档记忆」的分工

以前人设塞在三档记忆里，改人设要跟记忆参数挤一块，还容易被字数预算截断。现在分开：

- **人设卡**管「我是谁、怎么说话」——一改就是换个人，少而重。
- **三档记忆**管「我记得谁、最近发生了什么」——天天在长，多而散。

## 测试

```bash
node test/smoke.mjs         # 后端：建/改/删/切换、重名、空校验
node test/client-smoke.mjs  # 前端：假 React 把面板整棵树渲染一遍
```
