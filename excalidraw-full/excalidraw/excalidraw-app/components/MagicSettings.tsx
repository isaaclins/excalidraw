import { useState } from "react";
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import { MagicIcon, OpenAIIcon } from "@excalidraw/excalidraw/components/icons";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { CheckboxItem } from "@excalidraw/excalidraw/components/CheckboxItem";
import { KEYS } from "@excalidraw/common/keys";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";
import { InlineIcon } from "@excalidraw/excalidraw/components/InlineIcon";
import { Paragraph } from "@excalidraw/excalidraw/components/Paragraph";

import "./MagicSettings.scss";

export type MagicSettingsProps = {
  openAIKey: string | null;
  openAIBaseURL: string | null;
  openAIModelName: string | null;
  isPersisted: boolean;
  onChange: (settings: {
    key: string;
    baseURL: string;
    modelName: string;
    shouldPersist: boolean;
  }) => void;
  onConfirm: (settings: {
    key: string;
    baseURL: string;
    modelName: string;
    shouldPersist: boolean;
  }) => void;
  onClose: () => void;
};

export const MagicSettings = (props: MagicSettingsProps) => {
  const [keyInputValue, setKeyInputValue] = useState(props.openAIKey || "");
  const [baseURLInputValue, setBaseURLInputValue] = useState(
    props.openAIBaseURL || "",
  );
  const [modelNameInputValue, setModelNameInputValue] = useState(
    props.openAIModelName || "",
  );
  const [shouldPersist, setShouldPersist] = useState<boolean>(
    props.isPersisted,
  );

  const appState = useUIAppState();

  const getSettings = () => {
    return {
      key: keyInputValue.trim(),
      baseURL: baseURLInputValue.trim(),
      modelName: modelNameInputValue.trim(),
      shouldPersist,
    };
  };

  const onConfirm = () => {
    props.onConfirm(getSettings());
  };

  const handleChange = (
    updates: Partial<ReturnType<typeof getSettings>>,
    updateState = true,
  ) => {
    const newState = {
      key: "key" in updates ? updates.key! : keyInputValue,
      baseURL: "baseURL" in updates ? updates.baseURL! : baseURLInputValue,
      modelName:
        "modelName" in updates ? updates.modelName! : modelNameInputValue,
      shouldPersist:
        "shouldPersist" in updates ? updates.shouldPersist! : shouldPersist,
    };
    if (updateState) {
      setKeyInputValue(newState.key);
      setBaseURLInputValue(newState.baseURL);
      setModelNameInputValue(newState.modelName);
      setShouldPersist(newState.shouldPersist);
    }
    props.onChange({
      key: newState.key.trim(),
      baseURL: newState.baseURL.trim(),
      modelName: newState.modelName.trim(),
      shouldPersist: newState.shouldPersist,
    });
  };

  if (appState.openDialog?.name !== "settings") {
    return null;
  }

  return (
    <Dialog
      onCloseRequest={() => {
        props.onClose();
        props.onConfirm(getSettings());
      }}
      title={
        <div style={{ display: "flex" }}>
          Wireframe to Code (AI){" "}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0.1rem 0.5rem",
              marginLeft: "1rem",
              fontSize: 14,
              borderRadius: "12px",
              color: "#000",
              background: "pink",
            }}
          >
            Experimental
          </div>
        </div>
      }
      className="MagicSettings"
      autofocus={false}
    >
      <Paragraph>
        For the diagram-to-code feature we use <InlineIcon icon={OpenAIIcon} />
        OpenAI.
      </Paragraph>
      <Paragraph>
        While the OpenAI API is in beta, its use is strictly limited — as such
        we require you use your own API key. You can create an{" "}
        <a
          href="https://platform.openai.com/login?launch"
          rel="noopener noreferrer"
          target="_blank"
        >
          OpenAI account
        </a>
        , add a small credit (5 USD minimum), and{" "}
        <a
          href="https://platform.openai.com/api-keys"
          rel="noopener noreferrer"
          target="_blank"
        >
          generate your own API key
        </a>
        .
      </Paragraph>
      <Paragraph>
        Your OpenAI key does not leave the browser, and you can also set your
        own limit in your OpenAI account dashboard if needed.
      </Paragraph>
      <TextField
        isRedacted
        value={keyInputValue}
        placeholder="Paste your API key here"
        label="OpenAI API key"
        onChange={(value) => handleChange({ key: value })}
        selectOnRender
        onKeyDown={(event) => event.key === KEYS.ENTER && onConfirm()}
      />
      <TextField
        value={baseURLInputValue}
        placeholder="For example, https://api.openai.com/v1"
        label="Base URL (Optional)"
        onChange={(value) => handleChange({ baseURL: value })}
        onKeyDown={(event) => event.key === KEYS.ENTER && onConfirm()}
      />
      <TextField
        value={modelNameInputValue}
        placeholder="For example, gpt-4-vision-preview"
        label="Model Name (Optional)"
        onChange={(value) => handleChange({ modelName: value })}
        onKeyDown={(event) => event.key === KEYS.ENTER && onConfirm()}
      />
      <Paragraph>
        By default, your API token is not persisted anywhere so you'll need to
        insert it again after reload. But, you can persist locally in your
        browser below.
      </Paragraph>

      <CheckboxItem
        checked={shouldPersist}
        onChange={(checked) => handleChange({ shouldPersist: checked })}
      >
        Persist API key in browser storage
      </CheckboxItem>

      <Paragraph>
        Once API key is set, you can use the <InlineIcon icon={MagicIcon} />{" "}
        tool to wrap your elements in a frame that will then allow you to turn
        it into code. This dialog can be accessed using the <b>AI Settings</b>{" "}
        <InlineIcon icon={OpenAIIcon} />.
      </Paragraph>

      <FilledButton
        className="MagicSettings__confirm"
        size="large"
        label="Confirm"
        onClick={onConfirm}
      />
    </Dialog>
  );
};
