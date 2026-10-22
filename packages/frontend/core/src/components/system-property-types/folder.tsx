import { MenuItem } from '@affine/component';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import { WorkspaceDBService } from '@affine/core/modules/db';
import { useI18n } from '@affine/i18n';
import { FolderIcon } from '@blocksuite/icons/rc';
import { LiveData, useLiveData, useService } from '@toeverything/infra';
import { useMemo } from 'react';

import { FilterValueMenu } from '../filter/filter-value-menu';

interface FolderOption {
  id: string;
  path: string;
}

const buildFolderOptions = (
  nodes: readonly {
    id: string;
    parentId?: string | null;
    type: string;
    data: string;
  }[]
): FolderOption[] => {
  const folderMap = new Map<
    string,
    { name: string; parentId?: string | null }
  >();

  for (const node of nodes) {
    if (node.type === 'folder') {
      folderMap.set(node.id, {
        name: node.data,
        parentId: node.parentId,
      });
    }
  }

  const getPath = (id: string) => {
    const segments: string[] = [];
    const visited = new Set<string>();
    let current: string | null | undefined = id;
    while (current && !visited.has(current)) {
      visited.add(current);
      const folder = folderMap.get(current);
      if (!folder) {
        break;
      }
      segments.unshift(folder.name);
      current = folder.parentId;
    }
    return segments.join(' / ');
  };

  return Array.from(folderMap.keys())
    .map(id => ({ id, path: getPath(id) }))
    .sort((a, b) => a.path.localeCompare(b.path));
};

export const FolderFilterValue = ({
  filter,
  isDraft,
  onDraftCompleted,
  onChange,
}: {
  filter: FilterParams;
  isDraft?: boolean;
  onDraftCompleted?: () => void;
  onChange?: (filter: FilterParams) => void;
}) => {
  const t = useI18n();
  const dbService = useService(WorkspaceDBService);
  const nodes$ = useMemo(
    () => LiveData.from(dbService.db.folders.find$(), []),
    [dbService]
  );
  const nodes = useLiveData(nodes$);

  const folders = useMemo(() => buildFolderOptions(nodes), [nodes]);

  if (filter.method === 'is-empty' || filter.method === 'is-not-empty') {
    return (
      <span>
        {filter.method === 'is-empty'
          ? t['com.affine.filter.folder.none']()
          : t['com.affine.filter.folder.any']()}
      </span>
    );
  }

  const selected = folders.find(folder => folder.id === filter.value);

  return (
    <FilterValueMenu
      isDraft={isDraft}
      onDraftCompleted={onDraftCompleted}
      contentOptions={{ style: { maxHeight: 320, overflowY: 'auto' } }}
      items={
        folders.length === 0 ? (
          <MenuItem disabled>
            {t['com.affine.rootAppSidebar.organize.empty']()}
          </MenuItem>
        ) : (
          folders.map(folder => (
            <MenuItem
              key={folder.id}
              prefixIcon={<FolderIcon />}
              onClick={() => {
                onChange?.({
                  ...filter,
                  value: folder.id,
                });
              }}
              selected={filter.value === folder.id}
            >
              {folder.path}
            </MenuItem>
          ))
        )
      }
    >
      <span>{selected?.path ?? t['com.affine.filter.folder.select']()}</span>
    </FilterValueMenu>
  );
};
