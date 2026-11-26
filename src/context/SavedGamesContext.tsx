import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { placeIdForCatalogUniverse } from "../data/catalog";

export interface SavedGame {
  placeId: string;
  name: string;
  creator: string;
  iconUrl: string;
  privateServer?: string;
}

interface SavedGamesContextType {
  savedGames: SavedGame[];
  loaded: boolean;
  isSaved: (placeId: string) => boolean;
  toggleSaved: (game: SavedGame) => void;
  removeSaved: (placeId: string) => void;
  setPrivateServer: (placeId: string, privateServer: string | null) => void;
  /** Move a pinned game to where another pinned game is (drag & drop order). */
  moveSaved: (placeId: string, targetPlaceId: string) => void;
}

const SavedGamesContext = createContext<SavedGamesContextType>({
  savedGames: [],
  loaded: false,
  isSaved: () => false,
  toggleSaved: () => {},
  removeSaved: () => {},
  setPrivateServer: () => {},
  moveSaved: () => {},
});

export function useSavedGames() {
  return useContext(SavedGamesContext);
}

export function SavedGamesProvider({ children }: { children: ReactNode }) {
  const [savedGames, setSavedGames] = useState<SavedGame[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<SavedGame[]>("get_favorites")
      .then(list => {
        // Older Hub versions saved a game's *universe* ID as its place ID. Fix those up.
        const fixed = list.map(g => {
          const place = placeIdForCatalogUniverse(g.placeId);
          return place ? { ...g, placeId: place } : g;
        }).filter((g, i, arr) => arr.findIndex(x => x.placeId === g.placeId) === i);
        setSavedGames(fixed);
        if (fixed.length !== list.length || fixed.some((g, i) => g.placeId !== list[i]?.placeId)) {
          invoke("save_favorites", { favorites: fixed }).catch(() => {});
        }
      })
      .catch(() => setSavedGames([]))
      .finally(() => setLoaded(true));
  }, []);

  const isSaved = useCallback(
    (placeId: string) => savedGames.some(g => g.placeId === placeId),
    [savedGames]
  );

  const toggleSaved = useCallback((game: SavedGame) => {
    setSavedGames(prev => {
      const next = prev.some(g => g.placeId === game.placeId)
        ? prev.filter(g => g.placeId !== game.placeId)
        : [...prev, game];
      invoke("save_favorites", { favorites: next }).catch(() => {});
      return next;
    });
  }, []);

  const removeSaved = useCallback((placeId: string) => {
    setSavedGames(prev => {
      const next = prev.filter(g => g.placeId !== placeId);
      invoke("save_favorites", { favorites: next }).catch(() => {});
      return next;
    });
  }, []);

  const setPrivateServer = useCallback((placeId: string, privateServer: string | null) => {
    setSavedGames(prev => {
      const next = prev.map(g => g.placeId === placeId ? { ...g, privateServer: privateServer || undefined } : g);
      invoke("save_favorites", { favorites: next }).catch(() => {});
      return next;
    });
  }, []);

  const moveSaved = useCallback((placeId: string, targetPlaceId: string) => {
    if (placeId === targetPlaceId) return;
    setSavedGames(prev => {
      const from = prev.findIndex(g => g.placeId === placeId);
      const to = prev.findIndex(g => g.placeId === targetPlaceId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved); // takes the target's spot; the target shifts over
      invoke("save_favorites", { favorites: next }).catch(() => {});
      return next;
    });
  }, []);

  return (
    <SavedGamesContext.Provider value={{ savedGames, loaded, isSaved, toggleSaved, removeSaved, setPrivateServer, moveSaved }}>
      {children}
    </SavedGamesContext.Provider>
  );
}
