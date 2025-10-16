import React, { useState, useCallback } from "react";
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";

import { useSetAtom } from "../app-jotai";
import { createCanvasDialogAtom } from "../app-jotai";

interface CreateCanvasDialogProps {
  onCanvasCreate: (name: string) => void;
}

export const CreateCanvasDialog: React.FC<CreateCanvasDialogProps> = ({
  onCanvasCreate,
}) => {
  const [name, setName] = useState("Untitled Canvas");
  const setCreateCanvasDialog = useSetAtom(createCanvasDialogAtom);

  const handleCreate = useCallback(() => {
    if (name.trim()) {
      onCanvasCreate(name.trim());
      setCreateCanvasDialog({ isOpen: false });
    }
  }, [name, onCanvasCreate, setCreateCanvasDialog]);

  const handleClose = useCallback(() => {
    setCreateCanvasDialog({ isOpen: false });
  }, [setCreateCanvasDialog]);

  return (
    <Dialog onCloseRequest={handleClose} title={"Create New Canvas"}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <TextField
          label="Canvas Name"
          value={name}
          placeholder="Enter a name for your new canvas"
          onChange={setName}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}
        >
          <FilledButton
            color="primary"
            label={"Create"}
            onClick={handleCreate}
          />
        </div>
      </div>
    </Dialog>
  );
};
