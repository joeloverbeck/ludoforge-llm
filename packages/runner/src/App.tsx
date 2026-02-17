import type { GameDef } from '@ludoforge/engine';

const previewMetadata: GameDef['metadata'] = {
  id: 'runner-preview',
  players: { min: 1, max: 4 },
};

export function App() {
  return (
    <main>
      <h1>LudoForge Runner</h1>
      <p>Engine type bridge ready: {previewMetadata.id}</p>
    </main>
  );
}
