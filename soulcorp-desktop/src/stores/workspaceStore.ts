import { create } from "zustand";
import type {
  WorkspacePage,
  WorkspacePageSummary,
  WorkspaceSearchResult,
  WorkspaceTree,
} from "../types/workspace";

interface WorkspaceStore {
  tree: WorkspaceTree;
  selectedPageId: string | null;
  selectedPage: WorkspacePage | null;
  searchQuery: string;
  searchResults: WorkspaceSearchResult[];
  isLoading: boolean;
  setTree: (tree: WorkspaceTree) => void;
  setSelectedPage: (page: WorkspacePage | null) => void;
  setSelectedPageId: (pageId: string | null) => void;
  upsertPageSummary: (summary: WorkspacePageSummary) => void;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: WorkspaceSearchResult[]) => void;
  setIsLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  tree: { folders: [], pages: [] },
  selectedPageId: null,
  selectedPage: null,
  searchQuery: "",
  searchResults: [],
  isLoading: false,
  setTree: (tree) => set({ tree }),
  setSelectedPage: (page) =>
    set({
      selectedPage: page,
      selectedPageId: page?.id ?? null,
    }),
  setSelectedPageId: (pageId) => set({ selectedPageId: pageId }),
  upsertPageSummary: (summary) =>
    set((state) => {
      const pages = state.tree.pages.filter((page) => page.id !== summary.id);
      return {
        tree: {
          ...state.tree,
          pages: [summary, ...pages],
        },
      };
    }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  reset: () =>
    set({
      tree: { folders: [], pages: [] },
      selectedPageId: null,
      selectedPage: null,
      searchQuery: "",
      searchResults: [],
      isLoading: false,
    }),
}));