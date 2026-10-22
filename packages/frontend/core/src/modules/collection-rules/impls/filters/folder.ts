import type { WorkspaceDBService } from '@affine/core/modules/db';
import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { combineLatest, map, type Observable } from 'rxjs';

import type { FilterProvider } from '../../provider';
import type { FilterParams } from '../../types';

/**
 * Filter docs by their membership in the workspace folder tree.
 *
 * Folders are stored in the workspace DB (`folders` table) as local-only
 * nodes, so this provider only needs the workspace DB and the doc list.
 *
 * Methods:
 * - `is` / `is-not`: the doc is linked (directly or in a subfolder) to the
 *   given folder.
 * - `is-empty` / `is-not-empty`: the doc is not linked to any folder / is
 *   linked to at least one folder.
 */
export class FolderFilterProvider extends Service implements FilterProvider {
  constructor(
    private readonly dbService: WorkspaceDBService,
    private readonly docsService: DocsService
  ) {
    super();
  }

  filter$(params: FilterParams): Observable<Set<string>> {
    return combineLatest([
      this.dbService.db.folders.find$(),
      this.docsService.allDocIds$(),
    ]).pipe(
      map(([nodes, allDocIds]) => {
        const parentOf = new Map<string, string | null>();
        const docFolders = new Map<string, Set<string>>();

        for (const node of nodes) {
          if (node.type === 'folder') {
            parentOf.set(node.id, node.parentId ?? null);
          }
        }

        for (const node of nodes) {
          if (node.type !== 'doc' || !node.parentId) {
            continue;
          }
          const folderIds = docFolders.get(node.data) ?? new Set<string>();
          folderIds.add(node.parentId);
          docFolders.set(node.data, folderIds);
        }

        const isInFolder = (docId: string, folderId: string) => {
          const folderIds = docFolders.get(docId);
          if (!folderIds) {
            return false;
          }
          for (const start of folderIds) {
            let current: string | null | undefined = start;
            const visited = new Set<string>();
            while (current && !visited.has(current)) {
              if (current === folderId) {
                return true;
              }
              visited.add(current);
              current = parentOf.get(current);
            }
          }
          return false;
        };

        switch (params.method) {
          case 'is':
          case 'is-not': {
            if (!params.value) {
              return new Set<string>();
            }
            const folderId = params.value;
            const matches = allDocIds.filter(
              docId => isInFolder(docId, folderId) === (params.method === 'is')
            );
            return new Set(matches);
          }
          case 'is-empty':
            return new Set(allDocIds.filter(docId => !docFolders.has(docId)));
          case 'is-not-empty':
            return new Set(allDocIds.filter(docId => docFolders.has(docId)));
          default:
            throw new Error(`Unsupported method: ${params.method}`);
        }
      })
    );
  }
}
