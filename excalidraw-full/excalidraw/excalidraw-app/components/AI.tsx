import {
  DiagramToCodePlugin,
  exportToBlob,
  getTextFromElements,
  MIME_TYPES,
  TTDDialog,
} from "@excalidraw/excalidraw";
import { getDataURL } from "@excalidraw/excalidraw/data/blob";
import { safelyParseJSON } from "@excalidraw/common";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { useMagicSettings } from "../hooks/useMagicSettings";

const DIAGRAM_TO_CODE_SYSTEM_PROMPT = `You are a skilled front-end developer who builds interactive prototypes from wireframes, and is an expert at CSS Grid and Flex design.
Your role is to transform low-fidelity wireframes into working front-end HTML code.

YOU MUST FOLLOW FOLLOWING RULES:

- Use HTML, CSS, JavaScript to build a responsive, accessible, polished prototype
- Leverage Tailwind for styling and layout (import as script <script src="https://cdn.tailwindcss.com"></script>)
- Inline JavaScript when needed
- Fetch dependencies from CDNs when needed (using unpkg or skypack)
- Source images from Unsplash or create applicable placeholders
- Interpret annotations as intended vs literal UI
- Fill gaps using your expertise in UX and business logic
- generate primarily for desktop UI, but make it responsive.
- Use grid and flexbox wherever applicable.
- Convert the wireframe in its entirety, don't omit elements if possible.

If the wireframes, diagrams, or text is unclear or unreadable, refer to provided text for clarification.

Your goal is a production-ready prototype that brings the wireframes to life.

Please output JUST THE HTML file containing your best attempt at implementing the provided wireframes.`;

const TTD_SYSTEM_PROMPT = `目的和目标：
* 理解用户提供的文档的结构和逻辑关系。
* 准确地将文档内容和关系转化为符合mermaid语法的图表代码。
* 确保图表中包含文档的所有关键元素和它们之间的联系。

行为和规则：
1. 分析文档：
a) 仔细阅读和分析用户提供的文档内容。
b) 识别文档中的不同元素（如概念、实体、步骤、流程等）。
c) 理解这些元素之间的各种关系（如从属、包含、流程、因果等）。
d) 识别文档中蕴含的逻辑结构和流程。
2. 图表生成：
a) 根据分析结果，选择最适合表达文档结构的mermaid图表类型（如流程图、时序图、状态图、甘特图等）。
b) 使用正确的mermaid语法创建图表代码，充分参考下面的Mermaid 语法特殊字符说明："
* Mermaid 的核心特殊字符主要用于**定义图表结构和关系**。
* 要在节点 ID 或标签中**显示**这些特殊字符或包含**空格**，最常用方法是用**双引号 ""** 包裹。
* 在标签文本（引号内）中显示 HTML 特殊字符 (<, >, &) 或 # 等，应使用 **HTML 实体编码**。
* 要在标签内**换行**，使用 <br> 标签。
* 使用 %% 进行**注释**。
"
c) 确保图表清晰、易于理解，准确反映文档的内容和逻辑。

3. 细节处理：
a) 避免遗漏文档中的任何重要细节或关系。
b) 如果文档中存在不明确或多义性的内容，可以向用户提问以获取更清晰的信息。
c) 生成的图表代码应可以直接复制并粘贴到支持mermaid语法的工具或平台中使用。
整体语气：
* 保持专业和严谨的态度。
* 清晰、准确地表达图表的内容。
* 在需要时，可以提供简短的解释或建议。`;

const buildOpenAIPayload = (input: string, modelName: string) => {
  return {
    model: modelName,
    messages: [
      {
        role: "system",
        content: TTD_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: input,
      },
    ],
  };
};

export const AIComponents = ({
  excalidrawAPI,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}) => {
  const magicSettings = useMagicSettings(excalidrawAPI);
  return (
    <>
      <DiagramToCodePlugin
        generate={async ({ frame, children }) => {
          const { openAIKey } = magicSettings;
          if (!openAIKey && !import.meta.env.VITE_APP_OPENAI_API_KEY) {
            excalidrawAPI.updateScene({
              appState: {
                openDialog: {
                  name: "settings",
                },
              },
            });
            return {
              html: `<html><body style="display: flex; align-items: center; justify-content: center; height: 100vh;">You need to configure your OpenAI API key in the settings.</body></html>`,
            };
          }

          const appState = excalidrawAPI.getAppState();

          const blob = await exportToBlob({
            elements: children,
            appState: {
              ...appState,
              exportBackground: true,
              viewBackgroundColor: appState.viewBackgroundColor,
            },
            exportingFrame: frame,
            files: excalidrawAPI.getFiles(),
            mimeType: MIME_TYPES.jpg,
          });

          const dataURL = await getDataURL(blob);

          const textFromFrameChildren = getTextFromElements(children);

          const apiKey =
            openAIKey || import.meta.env.VITE_APP_OPENAI_API_KEY || "";
          const apiURL =
            magicSettings.openAIBaseURL ||
            import.meta.env.VITE_APP_OPENAI_API_URL ||
            "https://api.openai.com/v1";

          const modelName =
            magicSettings.openAIModelName || "gpt-4-vision-preview";

          const body = {
            model: modelName,
            max_tokens: 4096,
            temperature: 0.1,
            messages: [
              {
                role: "system",
                content: DIAGRAM_TO_CODE_SYSTEM_PROMPT,
              },
              {
                role: "user",
                content: [
                  {
                    type: "image_url",
                    image_url: {
                      url: dataURL,
                      detail: "high",
                    },
                  },
                  {
                    type: "text",
                    text: `Above is the reference wireframe. Please make a new website based on these and return just the HTML file. Also, please make it for the ${appState.theme} theme. What follows are the wireframe's text annotations (if any)...`,
                  },
                  {
                    type: "text",
                    text: textFromFrameChildren,
                  },
                ],
              },
            ],
          };

          const url = `${apiURL}/chat/completions`;
          const isRelativePath = url.startsWith("/");
          const response = await fetch(url, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${
                isRelativePath
                  ? localStorage.getItem("token") || apiKey
                  : apiKey
              }`,
            },
            body: JSON.stringify(body),
          });

          if (!response.ok) {
            const text = await response.text();
            const errorJSON = safelyParseJSON(text);

            if (!errorJSON) {
              throw new Error(text);
            }

            if (errorJSON.statusCode === 429) {
              return {
                html: `<html>
                <body style="margin: 0; text-align: center">
                <div style="display: flex; align-items: center; justify-content: center; flex-direction: column; height: 100vh; padding: 0 60px">
                  <div style="color:red">Too many requests today,</br>please try again tomorrow!</div>
                  </br>
                  </br>
                  <div>You can also try <a href="${
                    import.meta.env.VITE_APP_PLUS_LP
                  }/plus?utm_source=excalidraw&utm_medium=app&utm_content=d2c" target="_blank" rel="noopener">Excalidraw+</a> to get more requests.</div>
                </div>
                </body>
                </html>`,
              };
            }

            throw new Error(errorJSON.message || text);
          }

          try {
            const json = await response.json();
            const message = json.choices?.[0]?.message?.content;
            if (!message) {
              throw new Error("Generation failed (invalid response)");
            }
            const html = message.slice(
              message.indexOf("<!DOCTYPE html>"),
              message.indexOf("</html>") + "</html>".length,
            );

            return {
              html,
            };
          } catch (error: any) {
            throw new Error("Generation failed (invalid response)");
          }
        }}
      />

      <TTDDialog
        onTextSubmit={async (input) => {
          try {
            const apiKey =
              magicSettings.openAIKey ||
              import.meta.env.VITE_APP_OPENAI_API_KEY ||
              "";
            const apiUrl =
              magicSettings.openAIBaseURL ||
              import.meta.env.VITE_APP_OPENAI_API_URL ||
              "/api/ai/v1";
            const modelName =
              magicSettings.openAIModelName ||
              import.meta.env.VITE_APP_OPENAI_MODEL ||
              "gpt-4o-mini";
            const payload = buildOpenAIPayload(input, modelName);
            const url = `${apiUrl}/chat/completions`;
            const isRelativePath = url.startsWith("/");
            const response = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${
                  isRelativePath
                    ? localStorage.getItem("token") || apiKey
                    : apiKey
                }`,
              },
              body: JSON.stringify(payload),
            });

            const rateLimit = response.headers.has("x-ratelimit-limit-requests")
              ? parseInt(
                  response.headers.get("x-ratelimit-limit-requests") || "0",
                  10,
                )
              : undefined;

            const rateLimitRemaining = response.headers.has(
              "x-ratelimit-remaining-requests",
            )
              ? parseInt(
                  response.headers.get("x-ratelimit-remaining-requests") || "0",
                  10,
                )
              : undefined;

            if (!response.ok) {
              if (response.status === 429) {
                return {
                  rateLimit,
                  rateLimitRemaining,
                  error: new Error(
                    "Too many requests today, please try again tomorrow!",
                  ),
                };
              }
              const errorData = await response.json();
              throw new Error(
                errorData.error.message || "OpenAI API request failed",
              );
            }

            const data = await response.json();
            const mermaidCode = data.choices[0]?.message?.content;

            if (!mermaidCode) {
              throw new Error("Failed to generate Mermaid code from OpenAI.");
            }

            return {
              generatedResponse: mermaidCode,
              rateLimit,
              rateLimitRemaining,
            };
          } catch (err: any) {
            throw new Error("Request failed");
          }
        }}
      />
    </>
  );
};
