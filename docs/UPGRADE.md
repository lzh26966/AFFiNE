# AFFiNE 自定义分支改动与升级维护指南（UPGRADE）

> 当前分支：`my/affine-custom`，基于 `fork/canary` `e32f8dc`，版本 `0.27.5`，shallow clone。
> 原始基线：`0b69a6d`。功能提交已 cherry-pick 到最新 canary，并推送到 `https://github.com/lzh26966/AFFiNE/tree/my/affine-custom`。
> 目标：保留 Folder 筛选器与模板复制能力，同时可持续合并 AFFiNE 官方更新。

## 1. 当前改动总览

共 9 个文件，约 +301 / -2 行：7 个修改文件、2 个新增文件。

| 文件                                                                          | 改动        | 作用                                                     |
| ----------------------------------------------------------------------------- | ----------- | -------------------------------------------------------- |
| `packages/frontend/core/src/components/system-property-types/index.ts`        | +14         | 注册 `folder` 系统属性，绑定图标、名称、筛选方法和默认值 |
| `packages/frontend/core/src/components/system-property-types/folder.tsx`      | 新增 126 行 | Folder 筛选值下拉框，展示完整文件夹路径                  |
| `packages/frontend/core/src/modules/collection-rules/index.ts`                | +6          | 注册 `system:folder` 筛选 Provider 及依赖                |
| `packages/frontend/core/src/modules/collection-rules/impls/filters/folder.ts` | 新增 95 行  | 按文件夹归属过滤文档，支持父文件夹和空值判断             |
| `packages/frontend/core/src/modules/doc/index.ts`                             | +1          | 给 `DocsService` 注入 `WorkspaceDBService`               |
| `packages/frontend/core/src/modules/doc/services/docs.ts`                     | +47 / -2    | 模板复制时复制 tags 和文件夹归属                         |
| `packages/frontend/i18n/src/resources/en.json`                                | +4          | Folder 筛选器英文文案                                    |
| `packages/frontend/i18n/src/resources/zh-Hans.json`                           | +4          | 简体中文文案                                             |
| `packages/frontend/i18n/src/resources/zh-Hant.json`                           | +4          | 繁体中文文案                                             |

## 2. 功能一：Folder 筛选器

实现位置：

- `components/system-property-types/index.ts:85` 注册 `folder` 属性。
- `components/system-property-types/folder.tsx` 负责文件夹路径树和下拉选择。
- `modules/collection-rules/impls/filters/folder.ts` 负责过滤逻辑。
- `modules/collection-rules/index.ts:152` 注册 `system:folder`。

支持的方法：

- `is`：文档直接属于该文件夹，或属于其任意子文件夹。
- `is-not`：文档不属于该文件夹及其子文件夹。
- `is-empty`：文档没有任何文件夹归属。
- `is-not-empty`：文档至少有一个文件夹归属。

实现要点：

- 文件夹来自 workspace DB 的 `folders` 表，不依赖后端新增表。
- 文档与文件夹的关系是 `type:'doc'` 节点，`data` 为 docId，`parentId` 为文件夹 id。
- 组件先构建 `folderMap`，再向上回溯生成 `父 / 子` 路径；带 `visited` 防环。
- 路径按 `localeCompare` 排序，选择结果写入 `filter.value`。

## 3. 功能二：模板复制 tags 和文件夹

入口：`modules/doc/services/docs.ts:327` 的 `duplicateFromTemplate`。

新增行为：

- 复制模板的 tags：`targetDoc.record.setMeta({ tags: sourceDoc.meta$.value.tags })`。
- 复制模板的文件夹归属：`copyFolderLinks(sourceDocId, targetDocId)`。
- 同一父文件夹下已有目标文档节点时跳过，避免重复。
- 取该父文件夹现有兄弟节点的最大 `index`，用 `generateFractionalIndexingKeyBetween(lastIndex, null)` 追加到末尾。

不复制的内容：

- `isTemplate`：新文档仍是普通文档，不是模板。
- `id`、标题、创建/更新时间：按新建文档逻辑生成。
- 其余 properties 继续走原有 `updateProperties` 逻辑。

## 4. 建议与已知问题

| 优先级 | 问题                                               | 建议                                          |
| ------ | -------------------------------------------------- | --------------------------------------------- |
| P0     | 改动未提交，仓库是 shallow clone                   | 先建分支提交，再 `git fetch --unshallow`      |
| P0     | 桌面端会提示官方更新，点击会覆盖自定义 App         | 自定义构建禁用 updater，不要点“重启安装”      |
| P0     | 服务端升级可能触发不可逆 migration                 | 升级前 `pg_dump` 备份，并保留旧镜像 tag       |
| P1     | `is-not` 未选文件夹时返回空集合                    | 未选值时 `is` 返回空、`is-not` 返回全部文档   |
| P1     | 过滤器使用 `allDocIds$()`，可能包含回收站文档      | 改用 `allNonTrashDocIds$()`，或在 UI 层排除   |
| P1     | i18n 只补了 3/26 个语言文件                        | 其他语言会回退英文；需要完整翻译时补全 locale |
| P2     | `copyFolderLinks` 固定追加到末尾，不保留模板原顺序 | 当前可接受；要保序则复制相对 index            |
| P2     | 两个新功能没有自动化测试                           | 至少补 Folder 过滤和模板复制的集成测试        |
| P2     | 文件夹路径构建逻辑在组件内                         | 后续可抽到共享 util，便于复用和测试           |

`is-not` 建议改法：

```ts
case 'is':
case 'is-not': {
  if (!params.value) {
    return params.method === 'is'
      ? new Set<string>()
      : new Set(allDocIds);
  }
  // ...
}
```

## 5. 升级前准备

先固定当前状态，禁止在 dirty + shallow 状态下直接合并官方代码。

```bash
cd /Users/ghbai/Code/AI/Affine/AFFiNE

git switch -c my/affine-custom
git add -A
git commit -m "feat: folder filter + copy tags/folders on template"

git format-patch -2 -o /tmp/affine-custom-patches
git rev-parse HEAD > /tmp/affine-custom-base.txt
```

建议拆成两个 commit：

- Folder 筛选器：`system-property-types/*`、`collection-rules/*`、3 个 i18n 文件。
- 模板复制：`modules/doc/*`。

服务端升级前备份：

```bash
cd /root/affine
docker compose exec affine_postgres pg_dump -U <user> <db> \
  > /root/affine-backup-$(date +%F-%H%M).sql
```

同时备份 `config/config.json`、`config/private.key` 和当前自定义镜像 tag。

## 6. 合并官方更新

官方仓库当前主要提供 `v2026.10.x-canary.*` 日历 tag，没有独立的 `v0.27.x` stable tag。不要盲目跟每日 canary，按准备升级的官方 release 对应 commit/tag 锁定。

```bash
export https_proxy=http://127.0.0.1:7890
export http_proxy=http://127.0.0.1:7890

git fetch --unshallow origin
git fetch origin --tags

git rebase <官方目标tag或commit>
```

冲突高发文件：

- `modules/doc/services/docs.ts`：官方若重构模板复制逻辑。
- `modules/doc/index.ts`、`collection-rules/index.ts`、`system-property-types/index.ts`：DI 和 barrel 文件。
- 3 个 i18n JSON：官方经常调整 key 顺序或文案。
- 新增的 `folder.tsx`、`folder.ts` 通常不冲突。

处理原则：

- 不要整段覆盖官方文件，只保留自定义增量的最小 diff。
- i18n 冲突以官方结构为准，把 4 个 key 重新插入正确位置。
- `docs.ts` 冲突时先看官方是否新增了“复制模板元数据”的钩子；有钩子就迁到钩子上。
- 开启 `git config rerere.enabled true`，重复冲突可自动复用解法。
- 合并后先跑类型检查和 lint，再构建。

## 7. 构建与部署

Web 前端：

```bash
yarn install
BUILD_TYPE=beta NODE_OPTIONS=--max-old-space-size=8192 \
  yarn affine @affine/web build
```

服务端：

- 拉取新的官方基础镜像，更新 Dockerfile 的 `FROM`。
- 用新 `dist` 替换 `/root/affine-web-custom/dist`。
- 重新构建自定义镜像，不要依赖 `docker compose pull` 更新自定义 tag。
- 重新检查只读补丁 `patches/main.js` 与新镜像的 `main.js` 是否兼容。
- `docker compose up -d` 后观察 migration job 日志，再验证 HTTP 200 和文档读写。

桌面端：

- 重新构建 native 和 electron-renderer。
- 用新的 `electron-renderer/dist` 替换 `resources/web-static`。
- 执行 `yarn package`，安装新 App，重新 ad-hoc 签名。
- 首次启动如弹钥匙串，选择“始终允许”。

## 8. 桌面端自动更新

提示来源：`packages/frontend/apps/electron/src/main/updater/electron-updater.ts:14`。

自定义构建建议禁用官方更新，避免误点后覆盖：

```ts
const disabled = true; // 自定义构建禁用官方更新
```

不要用 `BUILD_TYPE=internal` 绕过：它会改应用名并覆盖 session 行为。

官方更新按钮只替换二进制，不会合并源码改动，也不会删除 workspace 数据。但自定义功能会消失，必须重新安装自定义构建。

## 9. 升级后回归清单

- Folder 筛选器能选到一级和二级文件夹，路径显示正确。
- `is` / `is-not` / `is-empty` / `is-not-empty` 四种方法结果正确。
- 子文件夹中的文档能被父文件夹的 `is` 命中。
- 回收站文档不出现在筛选结果里。
- 从模板新建文档后，tags 与模板一致。
- 新文档出现在模板所在的全部文件夹中，且没有重复节点。
- 模板本身仍是模板，新文档不是模板。
- Web 与服务端版本匹配，文档能正常加载和保存。
- 桌面端不弹官方更新，或弹了也不会误装。

## 10. 变更历史

- 2026-10-22：建立 UPGRADE 文档；记录 Folder 筛选器、模板复制 tags/folders、升级与回滚流程。
