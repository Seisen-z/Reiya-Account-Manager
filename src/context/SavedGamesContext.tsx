import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";

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
}

const SavedGamesContext = createContext<SavedGamesContextType>({
  savedGames: [],
  loaded: false,
  isSaved: () => false,
  toggleSaved: () => {},
  removeSaved: () => {},
  setPrivateServer: () => {},
});

export function useSavedGames() {
  return useContext(SavedGamesContext);
}

export function SavedGamesProvider({ children }: { children: ReactNode }) {
  const [savedGames, setSavedGames] = useState<SavedGame[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<SavedGame[]>("get_favorites")
      .then(list => setSavedGames(list))
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

  return (
    <SavedGamesContext.Provider value={{ savedGames, loaded, isSaved, toggleSaved, removeSaved, setPrivateServer }}>
      {children}
    </SavedGamesContext.Provider>
  );
}
