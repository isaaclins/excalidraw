import '@excalidraw/excalidraw/index.css'
import { Excalidraw, MainMenu } from '@excalidraw/excalidraw'
import './App.css'

function App() {
  return (
    <div className="app-shell">
      <Excalidraw>
        <MainMenu>

          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.CommandPalette />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
          <MainMenu.DefaultItems.ToggleTheme />
          <MainMenu.DefaultItems.Help />
        </MainMenu>
      </Excalidraw>
    </div>
  )
}

export default App
