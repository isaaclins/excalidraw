import { useCallback } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { useAtom, magicSettingsAtom } from "../app-jotai";

export const useMagicSettings = (
  api: ExcalidrawImperativeAPI | null | undefined,
) => {
  const [settings, setSettings] = useAtom(magicSettingsAtom);

  const onConfirm = useCallback(
    (newSettings: {
      key: string;
      baseURL: string;
      modelName: string;
      shouldPersist: boolean;
    }) => {
      setSettings({
        openAIKey: newSettings.key,
        openAIBaseURL: newSettings.baseURL,
        openAIModelName: newSettings.modelName,
        isPersisted: newSettings.shouldPersist,
      });

      if (api) {
        api.updateScene({ appState: { openDialog: null } });
      }
    },
    [api, setSettings],
  );

  const onChange = useCallback(
    (newSettings: {
      key: string;
      baseURL: string;
      modelName: string;
      shouldPersist: boolean;
    }) => {
      // The component has its own inner state, so we don't need to update the atom on every change.
      // The final update is handled by onConfirm.
      // This handler is here to fulfill the prop requirement.
    },
    [],
  );

  const onClose = useCallback(() => {
    if (api) {
      api.updateScene({ appState: { openDialog: null } });
    }
  }, [api]);

  return {
    ...settings,
    onConfirm,
    onChange,
    onClose,
  };
};
