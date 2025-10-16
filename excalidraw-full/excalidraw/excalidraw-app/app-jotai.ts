// eslint-disable-next-line no-restricted-imports
import {
  atom,
  Provider,
  useAtom,
  useAtomValue,
  useSetAtom,
  createStore,
  type PrimitiveAtom,
} from "jotai";
import { useLayoutEffect } from "react";

import type { StorageType } from "./components/StorageSettingsDialog";

export const appJotaiStore = createStore();

export { atom, Provider, useAtom, useAtomValue, useSetAtom };

export const useAtomWithInitialValue = <
  T extends unknown,
  A extends PrimitiveAtom<T>,
>(
  atom: A,
  initialValue: T | (() => T),
) => {
  const [value, setValue] = useAtom(atom);

  useLayoutEffect(() => {
    if (typeof initialValue === "function") {
      // @ts-ignore
      setValue(initialValue());
    } else {
      setValue(initialValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [value, setValue] as const;
};

export type User = {
  id: string;
  subject: string;
  login: string;
  email?: string;
  name: string;
  avatarUrl: string;
};

export const userAtom = atom<User | null>(null);

const baseCurrentCanvasIdAtom = atom<string | null>(
  localStorage.getItem("excalidraw-current-canvas-id"),
);

export const currentCanvasIdAtom = atom(
  (get) => get(baseCurrentCanvasIdAtom),
  (get, set, newId: string | null) => {
    set(baseCurrentCanvasIdAtom, newId);
    if (newId) {
      localStorage.setItem("excalidraw-current-canvas-id", newId);
    } else {
      localStorage.removeItem("excalidraw-current-canvas-id");
    }
  },
);

// Storage Configuration
// -----------------------------------------------------------------------------

interface StorageConfig {
  type: StorageType;
  // Cloudflare KV
  kvUrl?: string;
  kvApiToken?: string;
  // AWS S3
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3Region?: string;
  s3BucketName?: string;
}

const STORAGE_CONFIG_LOCAL_STORAGE_KEY = "excalidraw-storage-config-type";
const STORAGE_CONFIG_SESSION_STORAGE_KEY =
  "excalidraw-storage-config-credentials";

const getInitialStorageConfig = (): StorageConfig => {
  const defaultConfig: StorageConfig = { type: "indexed-db" };
  try {
    const _prevConfig = localStorage.getItem(STORAGE_CONFIG_LOCAL_STORAGE_KEY);
    const defaultConfig: StorageConfig = _prevConfig
      ? JSON.parse(_prevConfig)
      : { type: "indexed-db" };
    const nonSensitive = localStorage.getItem(STORAGE_CONFIG_LOCAL_STORAGE_KEY);
    const sensitive = sessionStorage.getItem(
      STORAGE_CONFIG_SESSION_STORAGE_KEY,
    );

    const nonSensitiveConfig = nonSensitive ? JSON.parse(nonSensitive) : {};
    const sensitiveConfig = sensitive ? JSON.parse(sensitive) : {};

    return { ...defaultConfig, ...nonSensitiveConfig, ...sensitiveConfig };
  } catch (e) {
    console.error("Failed to load storage config", e);
    return defaultConfig;
  }
};

const baseStorageConfigAtom = atom<StorageConfig>(getInitialStorageConfig());

export const storageConfigAtom = atom(
  (get) => get(baseStorageConfigAtom),
  (get, set, newConfig: StorageConfig) => {
    const {
      type,
      kvUrl,
      kvApiToken,
      s3AccessKeyId,
      s3SecretAccessKey,
      s3Region,
      s3BucketName,
    } = newConfig;

    const nonSensitive = { type };
    const sensitive = {
      kvUrl,
      kvApiToken,
      s3AccessKeyId,
      s3SecretAccessKey,
      s3Region,
      s3BucketName,
    };

    try {
      localStorage.setItem(
        STORAGE_CONFIG_LOCAL_STORAGE_KEY,
        JSON.stringify(nonSensitive),
      );
      sessionStorage.setItem(
        STORAGE_CONFIG_SESSION_STORAGE_KEY,
        JSON.stringify(sensitive),
      );
    } catch (e) {
      console.error("Failed to save storage config", e);
    }

    set(baseStorageConfigAtom, newConfig);
  },
);

// Dialog States
// -----------------------------------------------------------------------------
export const createCanvasDialogAtom = atom({ isOpen: false });

export const renameCanvasDialogAtom = atom<{
  isOpen: boolean;
  canvasId: string | null;
  currentName: string | null;
}>({
  isOpen: false,
  canvasId: null,
  currentName: null,
});

export const saveAsDialogAtom = atom({ isOpen: false });

// Magic Settings
// -----------------------------------------------------------------------------
interface MagicSettings {
  openAIKey: string | null;
  openAIBaseURL: string | null;
  openAIModelName: string | null;
  isPersisted: boolean;
}

const MAGIC_SETTINGS_KEY = "excalidraw-magic-settings";
const PERSIST_KEY = "excalidraw-magic-settings-persisted";

const getInitialMagicSettings = (): MagicSettings => {
  const isPersisted = localStorage.getItem(PERSIST_KEY) === "true";
  if (isPersisted) {
    const storedSettings = localStorage.getItem(MAGIC_SETTINGS_KEY);
    if (storedSettings) {
      try {
        const parsed = JSON.parse(storedSettings);
        return {
          openAIKey: parsed.openAIKey || "123",
          openAIBaseURL: parsed.openAIBaseURL || "/api/v2",
          openAIModelName: parsed.openAIModelName || "gpt-4.1-mini",
          isPersisted: true,
        };
      } catch (e) {
        console.error("Failed to parse magic settings", e);
      }
    }
  }
  return {
    openAIKey: "123",
    openAIBaseURL: "/api/v2",
    openAIModelName: "gpt-4.1-mini",
    isPersisted: true,
  };
};

const baseMagicSettingsAtom = atom<MagicSettings>(getInitialMagicSettings());

export const magicSettingsAtom = atom(
  (get) => get(baseMagicSettingsAtom),
  (get, set, newSettings: MagicSettings) => {
    localStorage.setItem(PERSIST_KEY, String(newSettings.isPersisted));
    if (newSettings.isPersisted) {
      localStorage.setItem(MAGIC_SETTINGS_KEY, JSON.stringify(newSettings));
    } else {
      localStorage.removeItem(MAGIC_SETTINGS_KEY);
    }
    set(baseMagicSettingsAtom, newSettings);
  },
);
