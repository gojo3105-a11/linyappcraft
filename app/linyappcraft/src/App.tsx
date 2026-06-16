import { useState } from 'react';
import AniPangGame from './AniPangGame';
import HedgehogGame from './HedgehogGame';

export default function App() {
  const [game, setGame] = useState<'anipang' | 'hedgehog'>('anipang');
  return game === 'anipang'
    ? <AniPangGame onSwitchGame={() => setGame('hedgehog')} />
    : <HedgehogGame onSwitchGame={() => setGame('anipang')} />;
}
