import { create } from "zustand";
import {
  loadWorkspaceActiveView,
  loadWorkspaceOrganizeMode,
  loadWorkspacePinnedIds,
  loadWorkspaceRecent,
  pushWorkspaceRecent,
  saveWorkspaceActiveView,
  saveWorkspaceOrganizeMode,
  saveWorkspacePinnedIds,
  saveWorkspaceRecent,
} from "../hooks/useWorkspacePreferences";
import {
  getWorkspaceFile,
  getWorkspacePage,
  listWorkspaceFolderChildren,
  listWorkspaceSummaries,
  pickDefaultPageId,
  resolveWorkspaceItems,
} from "../services/workspaceClient";
import type {
  WorkspaceFile,
  WorkspaceFileSummary,
  WorkspaceFolderChildren,
  WorkspacePage,
  WorkspacePageSummary,
  WorkspaceSearchResult,
  WorkspaceSnapshot,
  WorkspaceSummaries,
  WorkspaceTree,
} from "../types/workspace";
import type {
  WorkspaceItemFilter,
  WorkspaceNavView,
  WorkspaceRecentEntry,
} from "../types/workspaceNav";

let openPageGeneration = 0;
let openFileGeneration = 0;
let summariesLoadGeneration = 0;
let folderChildrenGeneration = 0;

export interface WorkspaceFolderChildrenState {
  pages: WorkspacePageSummary[];
  files: WorkspaceFileSummary[];
}

interface WorkspaceStore {
  preferencesCompanyId: string | null;
  activeView: WorkspaceNavView;
  itemFilter: WorkspaceItemFilter;
  organizeMode: boolean;
  pinnedIds: string[];
  recent: WorkspaceRecentEntry[];
  commandPaletteOpen: boolean;
  tree: WorkspaceTree;
  summariesLoaded: boolean;
  folderChildren: Record<string, WorkspaceFolderChildrenState>;
  folderChildrenLoading: Record<string, boolean>;
  viewDataRevision: number;
  selectedPageId: string | null;
  selectedPage: WorkspacePage | null;
  selectedFileId: string | null;
  selectedFile: WorkspaceFile | null;
  openingPageId: string | null;
  openingFileId: string | null;
  pageOpenError: string | null;
  fileOpenError: string | null;
  searchQuery: string;
  searchResults: WorkspaceSearchResult[];
  isLoading: boolean;
  dataRevision: number;
  syncPreferences: (companyId: string | null) => void;
  setActiveView: (view: WorkspaceNavView) => void;
  setItemFilter: (filter: WorkspaceItemFilter) => void;
  setOrganizeMode: (enabled: boolean) => void;
  togglePin: (itemId: string) => void;
  recordRecent: (itemId: string) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  applySnapshot: (snapshot: WorkspaceSnapshot) => void;
  applySummaries: (summaries: WorkspaceSummaries) => void;
  mergeResolvedSummaries: (summaries: WorkspaceSummaries) => void;
  setFolderChildren: (folderId: string, children: WorkspaceFolderChildrenState) => void;
  loadSummaries: () => Promise<void>;
  loadFolderChildren: (folderId: string, force?: boolean) => Promise<void>;
  loadViewData: (view: WorkspaceNavView) => Promise<void>;
  setTree: (workspaceTree: WorkspaceTree) => void;
  setWorkspaceFolders: (folders: WorkspaceTree["folders"]) => void;
  bumpDataRevision: () => void;
  setSelectedPage: (page: WorkspacePage | null) => void;
  setSelectedFile: (file: WorkspaceFile | null) => void;
  setSelectedPageId: (pageId: string | null) => void;
  openPage: (pageId: string) => Promise<void>;
  openFile: (fileId: string) => Promise<void>;
  openWorkspaceItem: (itemId: string) => Promise<void>;
  reloadForCompany: (tree: WorkspaceTree) => Promise<void>;
  upsertPageSummary: (summary: WorkspacePageSummary) => void;
  upsertFileSummary: (summary: WorkspaceFileSummary) => void;
  removePageSummary: (pageId: string) => void;
  removeFileSummary: (fileId: string) => void;
  removeFolder: (folderId: string) => void;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: WorkspaceSearchResult[]) => void;
  setIsLoading: (loading: boolean) => void;
  reset: () => void;
}

function emptyTree(): WorkspaceTree {
  return { folders: [], pages: [], files: [] };
}

function sortPageSummaries(pages: WorkspacePageSummary[]): WorkspacePageSummary[] {
  return [...pages].sort((left, right) => {
    if (left.folder_id !== right.folder_id) {
      return left.folder_id.localeCompare(right.folder_id);
    }
    const leftOrder = left.sort_order ?? 0;
    const rightOrder = right.sort_order ?? 0;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.title.localeCompare(right.title);
  });
}

function sortFileSummaries(files: WorkspaceFileSummary[]): WorkspaceFileSummary[] {
  return [...files].sort((left, right) => {
    if (left.folder_id !== right.folder_id) {
      return left.folder_id.localeCompare(right.folder_id);
    }
    const leftOrder = left.sort_order ?? 0;
    const rightOrder = right.sort_order ?? 0;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.name.localeCompare(right.name);
  });
}

function clearSelectionPatch(): Partial<WorkspaceStore> {
  return {
    selectedPage: null,
    selectedPageId: null,
    selectedFile: null,
    selectedFileId: null,
    pageOpenError: null,
    fileOpenError: null,
  };
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  preferencesCompanyId: null,
  activeView: "recent",
  itemFilter: "all",
  organizeMode: false,
  pinnedIds: [],
  recent: [],
  commandPaletteOpen: false,
  tree: emptyTree(),
  summariesLoaded: false,
  folderChildren: {},
  folderChildrenLoading: {},
  viewDataRevision: 0,
  selectedPageId: null,
  selectedPage: null,
  selectedFileId: null,
  selectedFile: null,
  openingPageId: null,
  openingFileId: null,
  pageOpenError: null,
  fileOpenError: null,
  searchQuery: "",
  searchResults: [],
  isLoading: false,
  dataRevision: 0,
  syncPreferences: (companyId) =>
    set({
      preferencesCompanyId: companyId,
      activeView: loadWorkspaceActiveView(companyId),
      organizeMode: loadWorkspaceOrganizeMode(companyId),
      pinnedIds: loadWorkspacePinnedIds(companyId),
      recent: loadWorkspaceRecent(companyId),
    }),
  setActiveView: (view) => {
    const companyId = get().preferencesCompanyId;
    saveWorkspaceActiveView(companyId, view);
    set({ activeView: view });
  },
  setItemFilter: (filter) => set({ itemFilter: filter }),
  setOrganizeMode: (enabled) => {
    const companyId = get().preferencesCompanyId;
    saveWorkspaceOrganizeMode(companyId, enabled);
    set({ organizeMode: enabled });
  },
  togglePin: (itemId) => {
    const companyId = get().preferencesCompanyId;
    const pinnedIds = get().pinnedIds.includes(itemId)
      ? get().pinnedIds.filter((id) => id !== itemId)
      : [itemId, ...get().pinnedIds];
    saveWorkspacePinnedIds(companyId, pinnedIds);
    set({ pinnedIds });
  },
  recordRecent: (itemId) => {
    const companyId = get().preferencesCompanyId;
    const recent = pushWorkspaceRecent(get().recent, itemId);
    saveWorkspaceRecent(companyId, recent);
    set({ recent });
  },
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  applySnapshot: (snapshot) =>
    set((state) => ({
      tree: {
        folders: snapshot.folders,
        pages: [],
        files: [],
      },
      summariesLoaded: false,
      folderChildren: {},
      folderChildrenLoading: {},
      dataRevision: state.dataRevision + 1,
    })),
  applySummaries: (summaries) =>
    set((state) => ({
      tree: {
        ...state.tree,
        pages: sortPageSummaries(summaries.pages),
        files: sortFileSummaries(summaries.files),
      },
      summariesLoaded: true,
      viewDataRevision: state.viewDataRevision + 1,
    })),
  mergeResolvedSummaries: (summaries) =>
    set((state) => {
      const pages = new Map(state.tree.pages.map((page) => [page.id, page]));
      const files = new Map((state.tree.files ?? []).map((file) => [file.id, file]));
      for (const page of summaries.pages) {
        pages.set(page.id, page);
      }
      for (const file of summaries.files) {
        files.set(file.id, file);
      }
      return {
        tree: {
          ...state.tree,
          pages: sortPageSummaries([...pages.values()]),
          files: sortFileSummaries([...files.values()]),
        },
        viewDataRevision: state.viewDataRevision + 1,
      };
    }),
  setFolderChildren: (folderId, children) =>
    set((state) => ({
      folderChildren: {
        ...state.folderChildren,
        [folderId]: children,
      },
      viewDataRevision: state.viewDataRevision + 1,
    })),
  loadSummaries: async () => {
    if (get().summariesLoaded) {
      return;
    }
    const generation = ++summariesLoadGeneration;
    const summaries = await listWorkspaceSummaries();
    if (generation !== summariesLoadGeneration) {
      return;
    }
    get().applySummaries(summaries);
  },
  loadFolderChildren: async (folderId, force = false) => {
    if (!force && get().folderChildren[folderId]) {
      return;
    }
    const generation = ++folderChildrenGeneration;
    set((state) => ({
      folderChildrenLoading: { ...state.folderChildrenLoading, [folderId]: true },
    }));
    try {
      const children: WorkspaceFolderChildren = await listWorkspaceFolderChildren(folderId);
      if (generation !== folderChildrenGeneration) {
        return;
      }
      get().setFolderChildren(folderId, {
        pages: children.pages,
        files: children.files,
      });
    } finally {
      set((state) => ({
        folderChildrenLoading: { ...state.folderChildrenLoading, [folderId]: false },
      }));
    }
  },
  loadViewData: async (view) => {
    if (view === "browse") {
      return;
    }
    if (view === "recent") {
      const ids = get().recent.map((entry) => entry.id);
      if (ids.length === 0) {
        return;
      }
      const summaries = await resolveWorkspaceItems(ids);
      get().mergeResolvedSummaries(summaries);
      return;
    }
    if (view === "pinned") {
      const ids = get().pinnedIds;
      if (ids.length === 0) {
        return;
      }
      const summaries = await resolveWorkspaceItems(ids);
      get().mergeResolvedSummaries(summaries);
      return;
    }
    await get().loadSummaries();
  },
  setTree: (workspaceTree) =>
    set((state) => ({
      tree: {
        folders: workspaceTree.folders,
        pages: workspaceTree.pages,
        files: workspaceTree.files ?? [],
      },
      summariesLoaded: true,
      dataRevision: state.dataRevision + 1,
      viewDataRevision: state.viewDataRevision + 1,
    })),
  setWorkspaceFolders: (folders) =>
    set((state) => ({
      tree: {
        ...state.tree,
        folders,
      },
      dataRevision: state.dataRevision + 1,
    })),
  bumpDataRevision: () =>
    set((state) => ({
      dataRevision: state.dataRevision + 1,
    })),
  setSelectedPage: (page) =>
    set({
      selectedPage: page,
      selectedPageId: page?.id ?? null,
      selectedFile: null,
      selectedFileId: null,
      fileOpenError: null,
    }),
  setSelectedFile: (file) =>
    set({
      selectedFile: file,
      selectedFileId: file?.id ?? null,
      selectedPage: null,
      selectedPageId: null,
      pageOpenError: null,
    }),
  setSelectedPageId: (pageId) => set({ selectedPageId: pageId }),
  openPage: async (pageId) => {
    const generation = ++openPageGeneration;
    openFileGeneration += 1;
    set({
      openingPageId: pageId,
      openingFileId: null,
      selectedPageId: pageId,
      selectedFileId: null,
      selectedFile: null,
      pageOpenError: null,
      fileOpenError: null,
    });
    try {
      const page = await getWorkspacePage(pageId);
      if (generation !== openPageGeneration) {
        return;
      }
      set({ selectedPage: page, openingPageId: null, pageOpenError: null });
      get().recordRecent(pageId);
    } catch (error) {
      if (generation !== openPageGeneration) {
        return;
      }
      set({
        selectedPage: null,
        selectedPageId: null,
        openingPageId: null,
        pageOpenError: String(error),
      });
    }
  },
  openFile: async (fileId) => {
    const generation = ++openFileGeneration;
    openPageGeneration += 1;
    set({
      openingFileId: fileId,
      openingPageId: null,
      selectedFileId: fileId,
      selectedPageId: null,
      selectedPage: null,
      fileOpenError: null,
      pageOpenError: null,
    });
    try {
      const file = await getWorkspaceFile(fileId);
      if (generation !== openFileGeneration) {
        return;
      }
      set({ selectedFile: file, openingFileId: null, fileOpenError: null });
      get().recordRecent(fileId);
    } catch (error) {
      if (generation !== openFileGeneration) {
        return;
      }
      set({
        selectedFile: null,
        selectedFileId: null,
        openingFileId: null,
        fileOpenError: String(error),
      });
    }
  },
  openWorkspaceItem: async (itemId) => {
    if (itemId.startsWith("file-")) {
      await get().openFile(itemId);
      return;
    }
    await get().openPage(itemId);
  },
  reloadForCompany: async (tree) => {
    openPageGeneration += 1;
    openFileGeneration += 1;
    summariesLoadGeneration += 1;
    folderChildrenGeneration += 1;
    set((state) => ({
      tree: {
        folders: tree.folders,
        pages: tree.pages,
        files: tree.files ?? [],
      },
      summariesLoaded: true,
      folderChildren: {},
      folderChildrenLoading: {},
      ...clearSelectionPatch(),
      openingPageId: null,
      openingFileId: null,
      searchQuery: "",
      searchResults: [],
      dataRevision: state.dataRevision + 1,
      viewDataRevision: state.viewDataRevision + 1,
    }));
    const defaultPageId = pickDefaultPageId(tree);
    if (defaultPageId) {
      await get().openPage(defaultPageId);
    }
  },
  upsertPageSummary: (summary) =>
    set((state) => {
      const pages = state.tree.pages.filter((page) => page.id !== summary.id);
      return {
        tree: {
          ...state.tree,
          pages: sortPageSummaries([...pages, summary]),
        },
      };
    }),
  upsertFileSummary: (summary) =>
    set((state) => {
      const files = (state.tree.files ?? []).filter((file) => file.id !== summary.id);
      return {
        tree: {
          ...state.tree,
          files: sortFileSummaries([...files, summary]),
        },
      };
    }),
  removePageSummary: (pageId) =>
    set((state) => ({
      tree: {
        ...state.tree,
        pages: state.tree.pages.filter((page) => page.id !== pageId),
      },
      selectedPageId: state.selectedPageId === pageId ? null : state.selectedPageId,
      selectedPage: state.selectedPage?.id === pageId ? null : state.selectedPage,
    })),
  removeFileSummary: (fileId) =>
    set((state) => ({
      tree: {
        ...state.tree,
        files: (state.tree.files ?? []).filter((file) => file.id !== fileId),
      },
      selectedFileId: state.selectedFileId === fileId ? null : state.selectedFileId,
      selectedFile: state.selectedFile?.id === fileId ? null : state.selectedFile,
    })),
  removeFolder: (folderId) =>
    set((state) => ({
      tree: {
        ...state.tree,
        folders: state.tree.folders.filter((folder) => folder.id !== folderId),
        pages: state.tree.pages.filter((page) => page.folder_id !== folderId),
        files: (state.tree.files ?? []).filter((file) => file.folder_id !== folderId),
      },
      selectedPage:
        state.selectedPage && state.selectedPage.folder_id === folderId
          ? null
          : state.selectedPage,
      selectedPageId:
        state.selectedPage && state.selectedPage.folder_id === folderId
          ? null
          : state.selectedPageId,
      selectedFile:
        state.selectedFile && state.selectedFile.folder_id === folderId
          ? null
          : state.selectedFile,
      selectedFileId:
        state.selectedFile && state.selectedFile.folder_id === folderId
          ? null
          : state.selectedFileId,
    })),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  reset: () => {
    openPageGeneration += 1;
    openFileGeneration += 1;
    set({
      preferencesCompanyId: null,
      activeView: "recent",
      itemFilter: "all",
      organizeMode: false,
      pinnedIds: [],
      recent: [],
      commandPaletteOpen: false,
      tree: emptyTree(),
      summariesLoaded: false,
      folderChildren: {},
      folderChildrenLoading: {},
      viewDataRevision: 0,
      selectedPageId: null,
      selectedPage: null,
      selectedFileId: null,
      selectedFile: null,
      openingPageId: null,
      openingFileId: null,
      pageOpenError: null,
      fileOpenError: null,
      searchQuery: "",
      searchResults: [],
      isLoading: false,
      dataRevision: 0,
    });
  },
}));