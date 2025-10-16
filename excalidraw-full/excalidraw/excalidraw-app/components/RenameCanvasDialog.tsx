import React, { useState, useCallback, useEffect } from "react";

import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";

import { useAtom } from "../app-jotai";
import { renameCanvasDialogAtom } from "../app-jotai";

interface RenameCanvasDialogProps {
  onCanvasRename: (id: string, newName: string) => void;
}

export const RenameCanvasDialog: React.FC<RenameCanvasDialogProps> = ({
  onCanvasRename,
}) => {
  const [dialogState, setDialogState] = useAtom(renameCanvasDialogAtom);
  const [name, setName] = useState("");

  useEffect(() => {
    if (dialogState.isOpen && dialogState.currentName) {
      setName(dialogState.currentName);
    }
  }, [dialogState.isOpen, dialogState.currentName]);

  const handleRename = useCallback(() => {
    if (name.trim() && dialogState.canvasId) {
      onCanvasRename(dialogState.canvasId, name.trim());
      setDialogState({ isOpen: false, canvasId: null, currentName: null });
    }
  }, [name, dialogState.canvasId, onCanvasRename, setDialogState]);

  const handleClose = useCallback(() => {
    setDialogState({ isOpen: false, canvasId: null, currentName: null });
  }, [setDialogState]);

  if (!dialogState.isOpen) {
    return null;
  }

  return (
    <Dialog onCloseRequest={handleClose} title={"Rename Canvas"}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <TextField
          label="New Name"
          value={name}
          placeholder="Enter a new name for the canvas"
          onChange={setName}
          onKeyDown={(e) => e.key === "Enter" && handleRename()}
        />
        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}
        >
          <FilledButton
            color="primary"
            label={"Rename"}
            onClick={handleRename}
          />
        </div>
      </div>
    </Dialog>
  );
};
