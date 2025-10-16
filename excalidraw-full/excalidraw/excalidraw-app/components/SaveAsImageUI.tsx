import React from "react";

import { Card } from "@excalidraw/excalidraw/components/Card";
import { ToolButton } from "@excalidraw/excalidraw/components/ToolButton";
import { useI18n } from "@excalidraw/excalidraw/i18n";
import { ExportImageIcon } from "@excalidraw/excalidraw/components/icons";

export const SaveAsImageUI: React.FC<{
  onSuccess: () => void;
}> = ({ onSuccess }) => {
  const { t } = useI18n();
  return (
    <Card color="primary">
      <div className="Card-icon">
        {React.cloneElement(ExportImageIcon as React.ReactElement<any>, {
          style: {
            width: "2.8rem",
            height: "2.8rem",
          },
        })}
      </div>
      <h2>{t("buttons.exportImage")}</h2>
      <div className="Card-details">
        Save your canvas to a file in PNG, SVG or WebP format.
      </div>
      <ToolButton
        className="Card-button"
        type="button"
        title={t("buttons.exportImage")}
        aria-label={t("buttons.exportImage")}
        showAriaLabel={true}
        onClick={onSuccess}
      />
    </Card>
  );
};
