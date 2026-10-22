import { Rail } from './components/Rail'
import { Chat } from './components/Chat'
import { Composer } from './components/Composer'
import { TopBar } from './components/TopBar'
import { StoreProvider } from './store'

export default function App() {
  return (
    <StoreProvider>
      <div className="flex h-full">
        <Rail />
        <main className="flex h-full min-w-0 flex-1 flex-col">
          <TopBar />
          <Chat />
          <Composer />
        </main>
      </div>
    </StoreProvider>
  )
}
