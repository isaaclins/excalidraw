import React, { useState, useCallback } from "react";
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";

import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";

import { useSetAtom } from "../app-jotai";
import { saveAsDialogAtom } from "../app-jotai";

interface SaveAsDialogProps {
  onCanvasSaveAs: (name: string) => void;
}

export const SaveAsDialog: React.FC<SaveAsDialogProps> = ({
  onCanvasSaveAs,
}) => {
  const appState = useUIAppState();
  const [name, setName] = useState(appState.name || "Untitled Canvas");
  const setSaveAsDialog = useSetAtom(saveAsDialogAtom);

  const handleSaveAs = useCallback(() => {
    if (name.trim()) {
      onCanvasSaveAs(name.trim());
      setSaveAsDialog({ isOpen: false });
    }
  }, [name, onCanvasSaveAs, setSaveAsDialog]);

  const handleClose = useCallback(() => {
    setSaveAsDialog({ isOpen: false });
  }, [setSaveAsDialog]);

  return (
    <Dialog onCloseRequest={handleClose} title={"Save as New Canvas"}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <TextField
          label="Canvas Name"
          value={name}
          placeholder="Enter a name for the new canvas"
          onChange={setName}
          onKeyDown={(e) => e.key === "Enter" && handleSaveAs()}
        />
        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}
        >
          <FilledButton
            color="primary"
            label={"Save As"}
            onClick={handleSaveAs}
          />
        </div>
      </div>
    </Dialog>
  );
};
