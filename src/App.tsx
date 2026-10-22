import { useState } from 'react'
import { Rail } from './components/Rail'
import { Chat } from './components/Chat'
import { Composer } from './components/Composer'
import { TopBar } from './components/TopBar'
import { StoreProvider } from './store'
import { Game } from './game/Game'
import './game/game.css'

export default function App() {
  const [view, setView] = useState<'dungeon' | 'lab'>('dungeon')
  return (
    <StoreProvider>
      {view === 'dungeon' ? (
        <Game onInsides={() => setView('lab')} />
      ) : (
        <>
          <button className="lablink" onClick={() => setView('dungeon')}>
            ⬅ Back to the dungeon
          </button>
          <div className="flex h-full">
            <Rail />
            <main className="flex h-full min-w-0 flex-1 flex-col">
              <TopBar />
              <Chat />
              <Composer />
            </main>
          </div>
        </>
      )}
    </StoreProvider>
  )
}
