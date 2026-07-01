import { create } from "zustand";
import { getWorkspacePage, pickDefaultPageId } from "../services/workspaceClient";
import type {
  WorkspacePage,
  WorkspacePageSummary,
  WorkspaceSearchResult,
  WorkspaceTree,
} from "../types/workspace";

let openPageGeneration = 0;

interface WorkspaceStore {
  tree: WorkspaceTree;
  selectedPageId: string | null;
  selectedPage: WorkspacePage | null;
  openingPageId: string | null;
  pageOpenError: string | null;
  searchQuery: string;
  searchResults: WorkspaceSearchResult[];
  isLoading: boolean;
  dataRevision: number;
  setTree: (tree: WorkspaceTree) => void;
  bumpDataRevision: () => void;
  setSelectedPage: (page: WorkspacePage | null) => void;
  setSelectedPageId: (pageId: string | null) => void;
  openPage: (pageId: string) => Promise<void>;
  reloadForCompany: (tree: WorkspaceTree) => Promise<void>;
  upsertPageSummary: (summary: WorkspacePageSummary) => void;
  removePageSummary: (pageId: string) => void;
  removeFolder: (folderId: string) => void;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: WorkspaceSearchResult[]) => void;
  setIsLoading: (loading: boolean) => void;
  reset: () => void;
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

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  tree: { folders: [], pages: [] },
  selectedPageId: null,
  selectedPage: null,
  openingPageId: null,
  pageOpenError: null,
  searchQuery: "",
  searchResults: [],
  isLoading: false,
  dataRevision: 0,
  setTree: (tree) =>
    set((state) => ({
      tree,
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
    }),
  setSelectedPageId: (pageId) => set({ selectedPageId: pageId }),
  openPage: async (pageId) => {
    const generation = ++openPageGeneration;
    set({ openingPageId: pageId, selectedPageId: pageId, pageOpenError: null });
    try {
      const page = await getWorkspacePage(pageId);
      if (generation !== openPageGeneration) {
        return;
      }
      set({ selectedPage: page, openingPageId: null, pageOpenError: null });
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
  reloadForCompany: async (tree) => {
    openPageGeneration += 1;
    set((state) => ({
      tree,
      selectedPage: null,
      selectedPageId: null,
      openingPageId: null,
      pageOpenError: null,
      searchQuery: "",
      searchResults: [],
      dataRevision: state.dataRevision + 1,
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
  removePageSummary: (pageId) =>
    set((state) => ({
      tree: {
        ...state.tree,
        pages: state.tree.pages.filter((page) => page.id !== pageId),
      },
      selectedPageId: state.selectedPageId === pageId ? null : state.selectedPageId,
      selectedPage: state.selectedPage?.id === pageId ? null : state.selectedPage,
    })),
  removeFolder: (folderId) =>
    set((state) => ({
      tree: {
        ...state.tree,
        folders: state.tree.folders.filter((folder) => folder.id !== folderId),
        pages: state.tree.pages.filter((page) => page.folder_id !== folderId),
      },
      selectedPage:
        state.selectedPage && state.selectedPage.folder_id === folderId
          ? null
          : state.selectedPage,
      selectedPageId:
        state.selectedPage && state.selectedPage.folder_id === folderId
          ? null
          : state.selectedPageId,
    })),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  reset: () => {
    openPageGeneration += 1;
    set({
      tree: { folders: [], pages: [] },
      selectedPageId: null,
      selectedPage: null,
      openingPageId: null,
      pageOpenError: null,
      searchQuery: "",
      searchResults: [],
      isLoading: false,
      dataRevision: 0,
    });
  },
}));